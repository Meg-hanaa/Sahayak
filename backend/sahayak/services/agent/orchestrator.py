"""Sahayak Agent Orchestrator & Confirmation Loop — Phase 5.

Connects transcription, translation, and safety classification into Sahayak's
agent decision loop:
LISTEN → UNDERSTAND → DECIDE → SPEAK → VERIFY → RECORD
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sahayak.api.errors import (
    ConfirmationNotAllowedError,
    InvalidStateTransitionError,
    SahayakError,
)
from sahayak.config import Settings, get_settings
from sahayak.domain.enums import (
    AgentDecision,
    ConfirmationOutcome,
    LanguageCode,
    ParticipantRole,
    ProcessingStatus,
    SafetyState,
    TurnState,
)
from sahayak.domain.models import Confirmation, RiskAssessment, Turn, VerifiedFact
from sahayak.domain.safety import CriticalFact, CriticalFactCategory
from sahayak.providers.base import TranslationProvider
from sahayak.providers.translation import MockTranslationProvider
from sahayak.services.agent.confirmation import ConfirmationManager
from sahayak.services.agent.prompts import build_repeat_request_prompt
from sahayak.services.agent.state_machine import TurnStateMachine
from sahayak.services.clock import Clock, SystemClock
from sahayak.services.safety.engine import DeterministicSafetyEngine

logger = logging.getLogger(__name__)


@dataclass
class AgentTurnResult:
    """Result of processing a conversational turn through the agent loop."""

    turn: Turn
    state: TurnState
    decision: AgentDecision
    risk_assessment: RiskAssessment
    speech_output: str | None = None
    confirmation: Confirmation | None = None
    verified_facts: list[VerifiedFact] = field(default_factory=list)
    is_paused_for_confirmation: bool = False
    is_repeat_requested: bool = False
    is_escalated: bool = False


@dataclass
class ConfirmationStepResult:
    """Result of processing a user response to a confirmation request."""

    turn_id: UUID
    outcome: ConfirmationOutcome
    state: TurnState
    prompt_text: str | None = None
    speech_output: str | None = None
    verified_facts: list[VerifiedFact] = field(default_factory=list)
    unresolved: bool = False
    confirmation: Confirmation | None = None


class AgentOrchestrator:
    """Core Agent Orchestrator implementing Sahayak's decision loop and confirmation state machine."""

    def __init__(
        self,
        translation_provider: TranslationProvider | None = None,
        safety_engine: DeterministicSafetyEngine | None = None,
        confirmation_manager: ConfirmationManager | None = None,
        settings: Settings | None = None,
        clock: Clock | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.clock = clock or SystemClock()
        self.translation_provider = translation_provider or MockTranslationProvider()
        self.safety_engine = safety_engine or DeterministicSafetyEngine()
        self.confirmation_manager = confirmation_manager or ConfirmationManager(
            max_attempts=self.settings.max_confirmation_attempts
        )

        # In-memory stores for turns, state machines, and audit trails
        self._turns: dict[UUID, Turn] = {}
        self._state_machines: dict[UUID, TurnStateMachine] = {}
        self._confirmations: dict[UUID, Confirmation] = {}
        self._session_turns: dict[UUID, list[UUID]] = {}
        self._verified_facts: dict[UUID, list[VerifiedFact]] = {}
        self._unresolved_turns: dict[UUID, list[UUID]] = {}

    def get_turn(self, turn_id: UUID) -> Turn | None:
        """Retrieve a turn by turn_id."""
        return self._turns.get(turn_id)

    def get_state_machine(self, turn_id: UUID) -> TurnStateMachine | None:
        """Retrieve the state machine attached to a turn."""
        return self._state_machines.get(turn_id)

    def get_session_turns(self, session_id: UUID) -> list[Turn]:
        """Return all turns recorded for a session in order."""
        turn_ids = self._session_turns.get(session_id, [])
        return [self._turns[tid] for tid in turn_ids if tid in self._turns]

    def get_session_verified_facts(self, session_id: UUID) -> list[VerifiedFact]:
        """Return all verified facts recorded for a session."""
        return list(self._verified_facts.get(session_id, []))

    def get_session_unresolved_turns(self, session_id: UUID) -> list[UUID]:
        """Return turn IDs with unresolved outcomes in a session."""
        return list(self._unresolved_turns.get(session_id, []))

    def _resolve_languages(
        self,
        role: ParticipantRole,
        source_language: LanguageCode | None,
    ) -> tuple[LanguageCode, LanguageCode]:
        """Determine source and target languages based on role and input."""
        if source_language is not None:
            src = source_language
            tgt = LanguageCode.HINDI if src == LanguageCode.ENGLISH else LanguageCode.ENGLISH
            return src, tgt

        if role == ParticipantRole.PATIENT:
            return LanguageCode.HINDI, LanguageCode.ENGLISH
        return LanguageCode.ENGLISH, LanguageCode.HINDI

    async def process_turn(
        self,
        session_id: UUID,
        role: ParticipantRole,
        source_text: str,
        source_language: LanguageCode | None = None,
        confidence_data: dict[str, float] | None = None,
        turn_id: UUID | None = None,
    ) -> AgentTurnResult:
        """Execute the LISTEN → UNDERSTAND → DECIDE → SPEAK → RECORD loop."""
        tid = turn_id or uuid4()
        now = self.clock.now()
        src_lang, tgt_lang = self._resolve_languages(role, source_language)

        # ---------------------------------------------------------
        # 1. LISTEN: Initialize turn and state machine
        # ---------------------------------------------------------
        state_machine = TurnStateMachine(initial_state=TurnState.READY)
        state_machine.transition_to(TurnState.LISTENING, reason="Speech utterance received")
        state_machine.transition_to(TurnState.PROCESSING, reason="Beginning linguistic & safety analysis")

        turn = Turn(
            turn_id=tid,
            session_id=session_id,
            role=role,
            source_text=source_text,
            start_time=now,
            processing_status=ProcessingStatus.PROCESSING,
            confidence_data=confidence_data,
            source_language=src_lang,
            target_language=tgt_lang,
            state=TurnState.PROCESSING,
        )

        self._turns[tid] = turn
        self._state_machines[tid] = state_machine
        self._session_turns.setdefault(session_id, []).append(tid)

        # ---------------------------------------------------------
        # 2. UNDERSTAND: Translation + Deterministic Safety Engine
        # ---------------------------------------------------------
        translation_result = await self.translation_provider.translate(
            text=source_text,
            source_language=src_lang,
            target_language=tgt_lang,
        )
        translated_text = translation_result.translated_text
        turn.translated_text = translated_text

        risk_assessment = self.safety_engine.analyze_text(
            text=source_text,
            turn_id=tid,
            confidence_data=confidence_data,
            translated_text=translated_text,
        )
        turn.risk_assessment = risk_assessment

        # ---------------------------------------------------------
        # 3. DECIDE: Standard, Confirm, Repeat, or Escalate
        # ---------------------------------------------------------
        safety_state = risk_assessment.safety_state

        if safety_state == SafetyState.STANDARD:
            decision = AgentDecision.CONTINUE
            state_machine.transition_to(TurnState.SPEAKING, reason="Turn verified standard; speaking translation")
            turn.state = TurnState.SPEAKING
            turn.decision = decision
            turn.processing_status = ProcessingStatus.COMPLETED
            turn.speech_output_text = translated_text

            return AgentTurnResult(
                turn=turn,
                state=turn.state,
                decision=decision,
                risk_assessment=risk_assessment,
                speech_output=translated_text,
                is_paused_for_confirmation=False,
            )

        elif safety_state == SafetyState.NEEDS_CONFIRMATION:
            decision = AgentDecision.CONFIRM
            state_machine.transition_to(TurnState.CONFIRMING, reason="Critical clinical fact requires confirmation")
            turn.state = TurnState.CONFIRMING
            turn.decision = decision
            turn.processing_status = ProcessingStatus.PROCESSING

            # Determine primary matched term & category
            matched_term = risk_assessment.matched_term or source_text
            category = risk_assessment.category
            if risk_assessment.facts:
                primary_fact = risk_assessment.facts[0]
                matched_term = primary_fact.matched_term
                category = primary_fact.category.value

            # Create confirmation object in speaker's language
            confirmation = self.confirmation_manager.create_confirmation(
                turn_id=tid,
                term=matched_term,
                category=category,
                language=src_lang,
                responder_role=role,
            )
            turn.confirmation = confirmation
            self._confirmations[tid] = confirmation

            # Pause normal interpretation: do NOT speak translated_text
            turn.speech_output_text = confirmation.prompt_text

            return AgentTurnResult(
                turn=turn,
                state=turn.state,
                decision=decision,
                risk_assessment=risk_assessment,
                speech_output=confirmation.prompt_text,
                confirmation=confirmation,
                is_paused_for_confirmation=True,
            )

        elif safety_state == SafetyState.NEEDS_REPETITION:
            decision = AgentDecision.REPEAT
            state_machine.transition_to(TurnState.NEEDS_REPETITION, reason="Uncertain critical term; repetition requested")
            turn.state = TurnState.NEEDS_REPETITION
            turn.decision = decision
            turn.processing_status = ProcessingStatus.FAILED

            repeat_prompt = build_repeat_request_prompt(language=src_lang)
            turn.speech_output_text = repeat_prompt

            return AgentTurnResult(
                turn=turn,
                state=turn.state,
                decision=decision,
                risk_assessment=risk_assessment,
                speech_output=repeat_prompt,
                is_repeat_requested=True,
            )

        elif safety_state == SafetyState.ESCALATE:
            decision = AgentDecision.ESCALATE
            # Stop ordinary automated interpretation immediately
            state_machine.transition_to(TurnState.ENDED, reason="Emergency detected; stopping interpretation")
            turn.state = TurnState.ENDED
            turn.decision = decision
            turn.processing_status = ProcessingStatus.FAILED

            emergency_instruction = (
                self.settings.emergency_instruction_hi
                if src_lang == LanguageCode.HINDI
                else self.settings.emergency_instruction_en
            )
            turn.speech_output_text = emergency_instruction

            return AgentTurnResult(
                turn=turn,
                state=turn.state,
                decision=decision,
                risk_assessment=risk_assessment,
                speech_output=emergency_instruction,
                is_escalated=True,
            )

        else:
            # Fallback to standard
            decision = AgentDecision.CONTINUE
            state_machine.transition_to(TurnState.SPEAKING, reason="Defaulting to standard interpretation")
            turn.state = TurnState.SPEAKING
            turn.decision = decision
            turn.speech_output_text = translated_text
            return AgentTurnResult(
                turn=turn,
                state=turn.state,
                decision=decision,
                risk_assessment=risk_assessment,
                speech_output=translated_text,
            )

    def handle_confirmation_response(
        self,
        turn_id: UUID,
        response_text: str,
        responder_role: ParticipantRole | None = None,
    ) -> ConfirmationStepResult:
        """Process a user's response to an active confirmation request."""
        turn = self._turns.get(turn_id)
        if turn is None:
            raise ConfirmationNotAllowedError(f"Turn {turn_id} not found")

        state_machine = self._state_machines.get(turn_id)
        if state_machine is None or state_machine.current_state != TurnState.CONFIRMING:
            raise ConfirmationNotAllowedError(
                f"Cannot confirm turn {turn_id}: turn is in state {turn.state.value!r}, not 'confirming'"
            )

        confirmation = turn.confirmation or self._confirmations.get(turn_id)
        if confirmation is None:
            raise ConfirmationNotAllowedError(f"Turn {turn_id} does not have an active confirmation")

        src_lang = turn.source_language or LanguageCode.HINDI
        matched_term = (
            turn.risk_assessment.matched_term
            if turn.risk_assessment and turn.risk_assessment.matched_term
            else turn.source_text
        )

        outcome, prompt = self.confirmation_manager.evaluate_response(
            confirmation=confirmation,
            response_text=response_text,
            responder_role=responder_role or turn.role,
            term=matched_term,
            language=src_lang,
        )

        now = self.clock.now()

        # ---------------------------------------------------------
        # Case A: CONFIRMED
        # ---------------------------------------------------------
        if outcome == ConfirmationOutcome.CONFIRMED:
            state_machine.transition_to(TurnState.SPEAKING, reason="Confirmation succeeded; speaking translation")
            turn.state = TurnState.SPEAKING
            turn.processing_status = ProcessingStatus.COMPLETED

            # Build VerifiedFact preserving exact original source wording
            facts_to_verify = (
                turn.risk_assessment.facts
                if turn.risk_assessment and turn.risk_assessment.facts
                else [
                    CriticalFact(
                        category=CriticalFactCategory.ALLERGY,
                        matched_term=matched_term,
                        rule_id="confirmed_fact",
                        reason="Confirmed by user",
                    )
                ]
            )

            verified_facts: list[VerifiedFact] = []
            for fact in facts_to_verify:
                vf = VerifiedFact(
                    fact_id=uuid4(),
                    turn_id=turn.turn_id,
                    category=fact.category.value,
                    source_wording=turn.source_text,  # MUST preserve original source wording
                    translated_wording=turn.translated_text or "",
                    confirmation_id=confirmation.confirmation_id,
                    verified_at=now,
                )
                verified_facts.append(vf)

            turn.verified_facts.extend(verified_facts)
            self._verified_facts.setdefault(turn.session_id, []).extend(verified_facts)

            # Normal interpretation can now proceed toward speech output
            speech_output = turn.translated_text
            turn.speech_output_text = speech_output

            return ConfirmationStepResult(
                turn_id=turn.turn_id,
                outcome=outcome,
                state=turn.state,
                speech_output=speech_output,
                verified_facts=verified_facts,
                unresolved=False,
                confirmation=confirmation,
            )

        # ---------------------------------------------------------
        # Case B: REJECTED
        # ---------------------------------------------------------
        elif outcome == ConfirmationOutcome.REJECTED:
            state_machine.transition_to(TurnState.UNRESOLVED, reason="User rejected critical confirmation")
            turn.state = TurnState.UNRESOLVED
            turn.processing_status = ProcessingStatus.COMPLETED
            self._unresolved_turns.setdefault(turn.session_id, []).append(turn.turn_id)

            return ConfirmationStepResult(
                turn_id=turn.turn_id,
                outcome=outcome,
                state=turn.state,
                speech_output=None,
                verified_facts=[],
                unresolved=True,
                confirmation=confirmation,
            )

        # ---------------------------------------------------------
        # Case C: AMBIGUOUS (Retry attempt)
        # ---------------------------------------------------------
        elif outcome == ConfirmationOutcome.AMBIGUOUS:
            # Re-prompt once more
            state_machine.transition_to(TurnState.CONFIRMING, reason="Ambiguous response; asking once more")
            turn.state = TurnState.CONFIRMING
            confirmation.prompt_text = prompt or confirmation.prompt_text

            return ConfirmationStepResult(
                turn_id=turn.turn_id,
                outcome=outcome,
                state=turn.state,
                prompt_text=prompt,
                speech_output=prompt,
                verified_facts=[],
                unresolved=False,
                confirmation=confirmation,
            )

        # ---------------------------------------------------------
        # Case D: UNRESOLVED (Max ambiguous attempts exhausted)
        # ---------------------------------------------------------
        else:
            state_machine.transition_to(TurnState.UNRESOLVED, reason="Ambiguous response exhausted retries; marking unresolved")
            turn.state = TurnState.UNRESOLVED
            turn.processing_status = ProcessingStatus.COMPLETED
            self._unresolved_turns.setdefault(turn.session_id, []).append(turn.turn_id)

            return ConfirmationStepResult(
                turn_id=turn.turn_id,
                outcome=ConfirmationOutcome.UNRESOLVED,
                state=turn.state,
                speech_output=None,
                verified_facts=[],
                unresolved=True,
                confirmation=confirmation,
            )
