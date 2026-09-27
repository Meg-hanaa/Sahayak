"""Two-participant real-time event router — Phase 6.

Enforces strict role-based routing between Doctor (English) and Patient (Hindi):
- Doctor speech -> Hindi interpretation -> PATIENT ONLY
- Patient speech -> English interpretation -> DOCTOR ONLY
- Confirmation prompts -> Target responder ONLY
- Verified facts -> DOCTOR ONLY
- Patient receives zero internal backend metadata or doctor-only info
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import WebSocket

from sahayak.domain.enums import (
    AgentDecision,
    ConfirmationOutcome,
    LanguageCode,
    ParticipantRole,
)
from sahayak.domain.models import Participant
from sahayak.domain.routing import OutboundEvent, OutboundEventType
from sahayak.services.agent import AgentOrchestrator
from sahayak.services.routing.errors import CrossRoleLeakageError, InvalidRecipientError
from sahayak.services.routing.manager import SessionConnectionManager
from sahayak.services.routing.validator import RecipientValidator

logger = logging.getLogger(__name__)


class TwoParticipantRouter:
    """Orchestrates secure, leakage-free real-time routing for doctor-patient consultations."""

    def __init__(
        self,
        connection_manager: SessionConnectionManager | None = None,
        orchestrator: AgentOrchestrator | None = None,
        validator: type[RecipientValidator] = RecipientValidator,
    ) -> None:
        self.connection_manager = connection_manager or SessionConnectionManager()
        self.orchestrator = orchestrator or AgentOrchestrator()
        self.validator = validator
        self.dispatched_events: list[OutboundEvent] = []

    def get_events_for_role(self, session_id: UUID, role: ParticipantRole) -> list[OutboundEvent]:
        """Return all successfully dispatched events for a specific role."""
        return [
            ev for ev in self.dispatched_events
            if ev.session_id == session_id and ev.recipient_role == role
        ]

    async def send_event(self, event: OutboundEvent) -> bool:
        """Validate recipient, sanitize if patient, and dispatch or buffer the event."""
        # 1. Enforce recipient validation & prevent cross-role leakage
        self.validator.validate_recipient(event, event.recipient_role)

        # 2. Sanitize payload for patient to protect internal/doctor metadata
        target_event = self.validator.sanitize_for_patient(event)

        # 3. Look up active connection
        ws: WebSocket | None = self.connection_manager.get_connection(
            target_event.session_id, target_event.recipient_role
        )

        if ws is not None:
            try:
                await ws.send_json(target_event.to_client_dict())
                self.dispatched_events.append(target_event)
                return True
            except Exception as exc:
                logger.warning(
                    "Failed to deliver WebSocket event %s to %s; buffering. Error: %s",
                    target_event.event_id,
                    target_event.recipient_role.value,
                    exc,
                )
                self.connection_manager.buffer_event(target_event)
                return False
        else:
            # Participant is currently disconnected; buffer for short-lived reconnection
            self.connection_manager.buffer_event(target_event)
            return False

    async def handle_doctor_speech(
        self,
        session_id: UUID,
        source_text: str,
        confidence_data: dict[str, float] | None = None,
    ) -> list[OutboundEvent]:
        """Process Doctor speech (English) and route results.

        Doctor -> backend -> processing -> Hindi interpretation -> PATIENT ONLY.
        """
        turn_result = await self.orchestrator.process_turn(
            session_id=session_id,
            role=ParticipantRole.DOCTOR,
            source_text=source_text,
            source_language=LanguageCode.ENGLISH,
            confidence_data=confidence_data,
        )

        sent_events: list[OutboundEvent] = []

        if turn_result.decision == AgentDecision.CONTINUE:
            # Hindi interpretation delivered to PATIENT ONLY
            event = OutboundEvent(
                event_type=OutboundEventType.INTERPRETATION,
                session_id=session_id,
                recipient_role=ParticipantRole.PATIENT,
                sender_role=ParticipantRole.DOCTOR,
                payload={
                    "text": turn_result.speech_output,
                    "source_language": LanguageCode.ENGLISH.value,
                    "target_language": LanguageCode.HINDI.value,
                    "turn_id": str(turn_result.turn.turn_id),
                },
            )
            await self.send_event(event)
            sent_events.append(event)

        elif turn_result.decision == AgentDecision.CONFIRM:
            # Doctor-facing confirmation prompt to DOCTOR ONLY
            event = OutboundEvent(
                event_type=OutboundEventType.CONFIRMATION_PROMPT,
                session_id=session_id,
                recipient_role=ParticipantRole.DOCTOR,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "prompt_text": turn_result.speech_output,
                    "turn_id": str(turn_result.turn.turn_id),
                    "category": turn_result.risk_assessment.category,
                },
            )
            await self.send_event(event)
            sent_events.append(event)

        elif turn_result.decision == AgentDecision.REPEAT:
            event = OutboundEvent(
                event_type=OutboundEventType.REPETITION_REQUEST,
                session_id=session_id,
                recipient_role=ParticipantRole.DOCTOR,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "prompt_text": turn_result.speech_output,
                    "turn_id": str(turn_result.turn.turn_id),
                },
            )
            await self.send_event(event)
            sent_events.append(event)

        elif turn_result.decision == AgentDecision.ESCALATE:
            # Emergency alert to Doctor
            doc_event = OutboundEvent(
                event_type=OutboundEventType.EMERGENCY_ALERT,
                session_id=session_id,
                recipient_role=ParticipantRole.DOCTOR,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "alert": turn_result.speech_output,
                    "turn_id": str(turn_result.turn.turn_id),
                },
            )
            await self.send_event(doc_event)
            sent_events.append(doc_event)

            # Emergency alert to Patient (sanitized instruction)
            pat_event = OutboundEvent(
                event_type=OutboundEventType.EMERGENCY_ALERT,
                session_id=session_id,
                recipient_role=ParticipantRole.PATIENT,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "instruction": self.orchestrator.settings.emergency_instruction_hi,
                    "turn_id": str(turn_result.turn.turn_id),
                },
            )
            await self.send_event(pat_event)
            sent_events.append(pat_event)

        return sent_events

    async def handle_patient_speech(
        self,
        session_id: UUID,
        source_text: str,
        confidence_data: dict[str, float] | None = None,
    ) -> list[OutboundEvent]:
        """Process Patient speech (Hindi) and route results.

        Patient -> backend -> processing -> English interpretation -> DOCTOR ONLY.
        Confirmation prompts for patient -> PATIENT ONLY.
        """
        turn_result = await self.orchestrator.process_turn(
            session_id=session_id,
            role=ParticipantRole.PATIENT,
            source_text=source_text,
            source_language=LanguageCode.HINDI,
            confidence_data=confidence_data,
        )

        sent_events: list[OutboundEvent] = []

        if turn_result.decision == AgentDecision.CONTINUE:
            # English interpretation delivered to DOCTOR ONLY
            event = OutboundEvent(
                event_type=OutboundEventType.INTERPRETATION,
                session_id=session_id,
                recipient_role=ParticipantRole.DOCTOR,
                sender_role=ParticipantRole.PATIENT,
                payload={
                    "text": turn_result.speech_output,
                    "source_language": LanguageCode.HINDI.value,
                    "target_language": LanguageCode.ENGLISH.value,
                    "turn_id": str(turn_result.turn.turn_id),
                },
            )
            await self.send_event(event)
            sent_events.append(event)

        elif turn_result.decision == AgentDecision.CONFIRM:
            # Confirmation prompt to PATIENT ONLY
            event = OutboundEvent(
                event_type=OutboundEventType.CONFIRMATION_PROMPT,
                session_id=session_id,
                recipient_role=ParticipantRole.PATIENT,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "prompt_text": turn_result.speech_output,
                    "turn_id": str(turn_result.turn.turn_id),
                    "category": turn_result.risk_assessment.category,
                },
            )
            await self.send_event(event)
            sent_events.append(event)

        elif turn_result.decision == AgentDecision.REPEAT:
            event = OutboundEvent(
                event_type=OutboundEventType.REPETITION_REQUEST,
                session_id=session_id,
                recipient_role=ParticipantRole.PATIENT,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "prompt_text": turn_result.speech_output,
                    "turn_id": str(turn_result.turn.turn_id),
                },
            )
            await self.send_event(event)
            sent_events.append(event)

        elif turn_result.decision == AgentDecision.ESCALATE:
            doc_event = OutboundEvent(
                event_type=OutboundEventType.EMERGENCY_ALERT,
                session_id=session_id,
                recipient_role=ParticipantRole.DOCTOR,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "alert": self.orchestrator.settings.emergency_instruction_en,
                    "turn_id": str(turn_result.turn.turn_id),
                },
            )
            await self.send_event(doc_event)
            sent_events.append(doc_event)

            pat_event = OutboundEvent(
                event_type=OutboundEventType.EMERGENCY_ALERT,
                session_id=session_id,
                recipient_role=ParticipantRole.PATIENT,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "instruction": turn_result.speech_output,
                    "turn_id": str(turn_result.turn.turn_id),
                },
            )
            await self.send_event(pat_event)
            sent_events.append(pat_event)

        return sent_events

    async def handle_confirmation_response(
        self,
        session_id: UUID,
        turn_id: UUID,
        response_text: str,
        responder_role: ParticipantRole,
    ) -> list[OutboundEvent]:
        """Process a confirmation response and route verified facts and interpretations."""
        turn = self.orchestrator.get_turn(turn_id)
        original_speaker_role = turn.role if turn else responder_role

        confirm_res = self.orchestrator.handle_confirmation_response(
            turn_id=turn_id,
            response_text=response_text,
            responder_role=responder_role,
        )

        sent_events: list[OutboundEvent] = []

        if confirm_res.outcome == ConfirmationOutcome.CONFIRMED:
            # 1. Verified facts go to DOCTOR ONLY
            for vf in confirm_res.verified_facts:
                fact_event = OutboundEvent(
                    event_type=OutboundEventType.VERIFIED_FACT,
                    session_id=session_id,
                    recipient_role=ParticipantRole.DOCTOR,
                    sender_role=ParticipantRole.AGENT,
                    payload={
                        "fact_id": str(vf.fact_id),
                        "turn_id": str(turn_id),
                        "category": vf.category,
                        "source_wording": vf.source_wording,
                        "translated_wording": vf.translated_wording,
                    },
                )
                await self.send_event(fact_event)
                sent_events.append(fact_event)

            # 2. Unpaused interpretation routed to listener
            if original_speaker_role == ParticipantRole.PATIENT:
                # English interpretation to DOCTOR ONLY
                interp_event = OutboundEvent(
                    event_type=OutboundEventType.INTERPRETATION,
                    session_id=session_id,
                    recipient_role=ParticipantRole.DOCTOR,
                    sender_role=ParticipantRole.PATIENT,
                    payload={
                        "text": confirm_res.speech_output,
                        "source_language": LanguageCode.HINDI.value,
                        "target_language": LanguageCode.ENGLISH.value,
                        "turn_id": str(turn_id),
                        "verified": True,
                    },
                )
                await self.send_event(interp_event)
                sent_events.append(interp_event)
            else:
                # Hindi interpretation to PATIENT ONLY
                interp_event = OutboundEvent(
                    event_type=OutboundEventType.INTERPRETATION,
                    session_id=session_id,
                    recipient_role=ParticipantRole.PATIENT,
                    sender_role=ParticipantRole.DOCTOR,
                    payload={
                        "text": confirm_res.speech_output,
                        "source_language": LanguageCode.ENGLISH.value,
                        "target_language": LanguageCode.HINDI.value,
                        "turn_id": str(turn_id),
                        "verified": True,
                    },
                )
                await self.send_event(interp_event)
                sent_events.append(interp_event)

        elif confirm_res.outcome == ConfirmationOutcome.AMBIGUOUS:
            # Re-prompt goes strictly to the responder
            retry_event = OutboundEvent(
                event_type=OutboundEventType.CONFIRMATION_PROMPT,
                session_id=session_id,
                recipient_role=responder_role,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "prompt_text": confirm_res.prompt_text,
                    "turn_id": str(turn_id),
                    "attempt": 2,
                },
            )
            await self.send_event(retry_event)
            sent_events.append(retry_event)

        elif confirm_res.outcome in {ConfirmationOutcome.REJECTED, ConfirmationOutcome.UNRESOLVED}:
            # Notify doctor of unresolved clinical turn
            doc_event = OutboundEvent(
                event_type=OutboundEventType.SYSTEM_EVENT,
                session_id=session_id,
                recipient_role=ParticipantRole.DOCTOR,
                sender_role=ParticipantRole.AGENT,
                payload={
                    "notice": f"Clinical fact on turn {turn_id} could not be verified (outcome: {confirm_res.outcome.value})",
                    "turn_id": str(turn_id),
                    "outcome": confirm_res.outcome.value,
                },
            )
            await self.send_event(doc_event)
            sent_events.append(doc_event)

        return sent_events
