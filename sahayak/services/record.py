"""Bilingual session record service and resilience management — Phase 7."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from sahayak.api.errors import (
    SessionExpiredError,
    SessionNotFoundError,
)
from sahayak.domain.enums import ProcessingStatus, SafetyState
from sahayak.domain.models import (
    ConversationTurnRecord,
    SessionRecord,
    Turn,
    UnresolvedItem,
    VerifiedFact,
    VerifiedFactRecord,
)
from sahayak.services.agent import AgentOrchestrator
from sahayak.services.clock import Clock, SystemClock
from sahayak.services.metrics import LatencyTracker
from sahayak.services.sessions import SessionService
from sahayak.services.store import InMemorySessionStore

logger = logging.getLogger(__name__)


class SessionRecordService:
    """Assembles final bilingual session records and maintains resilience invariants."""

    def __init__(
        self,
        session_service: SessionService | None = None,
        orchestrator: AgentOrchestrator | None = None,
        store: InMemorySessionStore | None = None,
        clock: Clock | None = None,
    ) -> None:
        self.session_service = session_service
        self.orchestrator = orchestrator or AgentOrchestrator(clock=clock)
        self.store = store or (session_service.store if session_service else InMemorySessionStore())
        self.clock = clock or SystemClock()
        self.latency_tracker = LatencyTracker()
        self._records: dict[UUID, SessionRecord] = {}

    def get_record(self, session_id: UUID) -> SessionRecord | None:
        """Retrieve a previously generated session record."""
        return self._records.get(session_id)

    def generate_session_record(self, session_id: UUID) -> SessionRecord:
        """Alias for generate_record."""
        return self.generate_record(session_id)

    def generate_record(self, session_id: UUID) -> SessionRecord:
        """Assemble the complete bilingual session record.

        Sections:
        1. Conversation turns (ordered)
        2. Verified Facts (immutable, preserving original source wording)
        3. Unresolved Items (preserving original wording and failure reason)
        4. Latency Metrics (speech-end to output-start summary)

        Raises:
            SessionNotFoundError: if session does not exist.
            SessionExpiredError: if session has expired.
        """
        session = (
            self.session_service.get_session_by_id(session_id)
            if self.session_service
            else self.store.get_session(session_id)
        )
        if session is None:
            raise SessionNotFoundError()

        # Check expiration
        now = self.clock.now()
        if session.retention_expires_at is not None and session.retention_expires_at <= now:
            raise SessionExpiredError()

        # 1. Conversation turns
        turns = self.orchestrator.get_session_turns(session_id)
        conversation_records: list[ConversationTurnRecord] = []
        ordered_turn_ids: list[UUID] = []
        latency_samples: list[float] = []

        for turn in turns:
            ordered_turn_ids.append(turn.turn_id)

            # Record turn latency if instrumented
            if turn.speech_end_time is not None and turn.output_start_time is not None:
                lat = self.latency_tracker.record_turn_latency(
                    turn.speech_end_time, turn.output_start_time
                )
                if lat is not None:
                    latency_samples.append(lat)

            safety_state = (
                turn.risk_assessment.safety_state
                if turn.risk_assessment
                else SafetyState.STANDARD
            )

            rec = ConversationTurnRecord(
                turn_id=turn.turn_id,
                speaker_role=turn.role,
                source_language=turn.source_language or session.doctor_language,
                target_language=turn.target_language or session.patient_language,
                source_text=turn.source_text,
                translated_text=turn.translated_text,
                timestamp=turn.start_time or now,
                processing_status=turn.processing_status,
                confidence_data=turn.confidence_data,
                safety_state=safety_state,
                speech_end_time=turn.speech_end_time,
                output_start_time=turn.output_start_time,
                latency_ms=turn.latency_ms,
                retry_count=turn.retry_count,
                error_message=turn.error_message,
            )
            conversation_records.append(rec)

        # 2. Verified Facts (Immutable, preserve original source wording)
        verified_facts = self.orchestrator.get_session_verified_facts(session_id)
        fact_records: list[VerifiedFactRecord] = []
        verified_fact_ids: list[UUID] = []

        for vf in verified_facts:
            verified_fact_ids.append(vf.fact_id)
            fact_rec = VerifiedFactRecord(
                fact_id=vf.fact_id,
                turn_id=vf.turn_id,
                category=vf.category,
                original_source_wording=vf.source_wording,
                translated_wording=vf.translated_wording,
                confirmation_reference=vf.confirmation_id,
                verified_at=vf.verified_at or now,
            )
            fact_records.append(fact_rec)

        # 3. Unresolved Items (preserving original wording and reason)
        unresolved_turn_ids = self.orchestrator.get_session_unresolved_turns(session_id)
        unresolved_items: list[UnresolvedItem] = []

        for tid in unresolved_turn_ids:
            turn = self.orchestrator.get_turn(tid)
            if turn is not None:
                reason = "Turn unresolved"
                if turn.confirmation and turn.confirmation.outcome.value:
                    reason = f"Confirmation outcome: {turn.confirmation.outcome.value}"
                elif turn.error_message:
                    reason = turn.error_message

                category = turn.risk_assessment.category if turn.risk_assessment else None

                item = UnresolvedItem(
                    turn_id=turn.turn_id,
                    source_wording=turn.source_text,
                    category=category,
                    reason=reason,
                    timestamp=turn.start_time or now,
                )
                unresolved_items.append(item)

        # 4. Latency metrics
        latency_summary = self.latency_tracker.compute_summary(extra_samples=latency_samples)

        session_record = SessionRecord(
            session_id=session_id,
            ordered_turn_ids=ordered_turn_ids,
            verified_fact_ids=verified_fact_ids,
            unresolved_turn_ids=unresolved_turn_ids,
            generated_at=now,
            conversation=conversation_records,
            verified_facts=fact_records,
            unresolved_items=unresolved_items,
            latency_metrics=latency_summary,
        )

        self._records[session_id] = session_record
        return session_record
