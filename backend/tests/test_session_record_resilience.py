"""Tests for Phase 7 — Session Record, Resilience, Latency, and Privacy."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from sahayak.api.errors import (
    SahayakError,
    SessionExpiredError,
    SessionNotFoundError,
)
from sahayak.config import Settings
from sahayak.domain.enums import (
    AgentDecision,
    ConfirmationOutcome,
    ConnectionStatus,
    LanguageCode,
    MicrophoneStatus,
    ParticipantRole,
    ProcessingStatus,
    SafetyState,
    TurnState,
)
from sahayak.domain.models import Participant, SessionRecord
from sahayak.domain.routing import OutboundEvent, OutboundEventType
from sahayak.logging import JsonLogFormatter, sanitize_sensitive_data
from sahayak.main import create_app
from sahayak.providers.base import TranslationProvider, TranslationResult
from sahayak.services.agent import AgentOrchestrator
from sahayak.services.clock import Clock
from sahayak.services.metrics import LatencyTracker
from sahayak.services.record import SessionRecordService
from sahayak.services.routing import SessionConnectionManager, TwoParticipantRouter
from sahayak.services.sessions import SessionService
from sahayak.services.store import InMemorySessionStore


class ControllableClock(Clock):
    """Controllable clock for deterministic time manipulation in tests."""

    def __init__(self, start_time: datetime | None = None) -> None:
        self._now = start_time or datetime(2026, 9, 27, 10, 0, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self._now

    def advance(self, duration: timedelta) -> None:
        self._now += duration


from sahayak.domain.translation import TranslationStatus


class FlakyTranslationProvider(TranslationProvider):
    """Mock translation provider that can be configured to fail or succeed."""

    def __init__(self, failure_exc: Exception | None = None) -> None:
        self.failure_exc = failure_exc
        self.call_count = 0

    async def translate(
        self,
        text: str,
        source_language: LanguageCode,
        target_language: LanguageCode,
    ) -> TranslationResult:
        self.call_count += 1
        if self.failure_exc is not None:
            raise self.failure_exc
        return TranslationResult(
            source_text=text,
            source_language=source_language,
            target_language=target_language,
            status=TranslationStatus.SUCCESS,
            translated_text=f"Translated: {text}",
        )


@pytest.fixture
def clock() -> ControllableClock:
    return ControllableClock()


@pytest.fixture
def store() -> InMemorySessionStore:
    return InMemorySessionStore()


@pytest.fixture
def session_service(store: InMemorySessionStore, clock: ControllableClock) -> SessionService:
    settings = Settings(
        session_ttl_seconds=1800,
        join_token_ttl_seconds=900,
    )
    return SessionService(store=store, settings=settings, clock=clock)


@pytest.fixture
def orchestrator(clock: ControllableClock) -> AgentOrchestrator:
    return AgentOrchestrator(clock=clock)


@pytest.fixture
def record_service(
    session_service: SessionService,
    orchestrator: AgentOrchestrator,
    store: InMemorySessionStore,
    clock: ControllableClock,
) -> SessionRecordService:
    return SessionRecordService(
        session_service=session_service,
        orchestrator=orchestrator,
        store=store,
        clock=clock,
    )


# ==============================================================================
# 1. Record Generation, Ordering, Facts & Unresolved Items
# ==============================================================================

@pytest.mark.asyncio
async def test_session_record_generation_full(
    session_service: SessionService,
    orchestrator: AgentOrchestrator,
    record_service: SessionRecordService,
    clock: ControllableClock,
) -> None:
    """Verify complete bilingual record generation with conversation, facts, and unresolved items."""
    created = session_service.create_session()
    sid = created.session.session_id

    # Turn 1: Doctor standard statement (English -> Hindi)
    t1_end = clock.now()
    clock.advance(timedelta(milliseconds=500))
    res1 = await orchestrator.process_turn(
        session_id=sid,
        role=ParticipantRole.DOCTOR,
        source_text="Good morning, how are you feeling today?",
        source_language=LanguageCode.ENGLISH,
        speech_end_time=t1_end,
    )
    assert res1.state == TurnState.SPEAKING
    assert res1.turn.processing_status == ProcessingStatus.COMPLETED

    # Turn 2: Patient critical allergy statement needing confirmation
    clock.advance(timedelta(seconds=2))
    t2_end = clock.now()
    clock.advance(timedelta(milliseconds=400))
    res2 = await orchestrator.process_turn(
        session_id=sid,
        role=ParticipantRole.PATIENT,
        source_text="मुझे पेनिसिलिन से एलर्जी है",  # I am allergic to penicillin
        source_language=LanguageCode.HINDI,
        speech_end_time=t2_end,
    )
    assert res2.state == TurnState.CONFIRMING
    assert res2.confirmation is not None

    # Confirm the allergy
    clock.advance(timedelta(seconds=1))
    confirm_res = orchestrator.handle_confirmation_response(
        turn_id=res2.turn.turn_id,
        response_text="हाँ, बिल्कुल",  # Yes, definitely
        responder_role=ParticipantRole.PATIENT,
    )
    assert confirm_res.outcome == ConfirmationOutcome.CONFIRMED

    # Turn 3: Patient gives ambiguous answer on another fact that gets rejected
    clock.advance(timedelta(seconds=2))
    res3 = await orchestrator.process_turn(
        session_id=sid,
        role=ParticipantRole.PATIENT,
        source_text="मुझे एस्पिरिन से भी एलर्जी हो सकती है",
        source_language=LanguageCode.HINDI,
    )
    assert res3.state == TurnState.CONFIRMING
    reject_res = orchestrator.handle_confirmation_response(
        turn_id=res3.turn.turn_id,
        response_text="नहीं, मुझे पक्का नहीं पता",  # No, I'm not sure
        responder_role=ParticipantRole.PATIENT,
    )
    assert reject_res.outcome == ConfirmationOutcome.REJECTED

    # Generate final record
    clock.advance(timedelta(seconds=1))
    record = record_service.generate_record(sid)

    assert isinstance(record, SessionRecord)
    assert record.session_id == sid

    # Verify conversation turns ordering
    assert len(record.conversation) == 3
    assert record.ordered_turn_ids == [res1.turn.turn_id, res2.turn.turn_id, res3.turn.turn_id]

    turn_rec1 = record.conversation[0]
    assert turn_rec1.speaker_role == ParticipantRole.DOCTOR
    assert turn_rec1.source_text == "Good morning, how are you feeling today?"
    assert turn_rec1.translated_text is not None
    assert turn_rec1.processing_status == ProcessingStatus.COMPLETED
    assert turn_rec1.speech_end_time == t1_end
    assert turn_rec1.output_start_time is not None
    assert turn_rec1.latency_ms is not None
    assert turn_rec1.latency_ms > 0

    # Verify verified facts preserve original source wording and confirmation reference
    assert len(record.verified_facts) >= 1
    vf_record = record.verified_facts[0]
    assert vf_record.original_source_wording == "मुझे पेनिसिलिन से एलर्जी है"
    assert vf_record.confirmation_reference == res2.confirmation.confirmation_id
    assert vf_record.category.lower() == "allergy"
    assert vf_record.translated_wording != ""

    # Verify unresolved items preserve original wording and reason
    assert len(record.unresolved_items) >= 1
    unresolved_item = next(u for u in record.unresolved_items if u.turn_id == res3.turn.turn_id)
    assert unresolved_item.source_wording == "मुझे एस्पिरिन से भी एलर्जी हो सकती है"
    assert "rejected" in unresolved_item.reason.lower()
    assert unresolved_item.timestamp is not None


@pytest.mark.asyncio
async def test_verified_facts_do_not_silently_overwrite(
    session_service: SessionService,
    orchestrator: AgentOrchestrator,
    record_service: SessionRecordService,
    clock: ControllableClock,
) -> None:
    """Ensure confirmed facts are never silently overwritten or duplicated."""
    created = session_service.create_session()
    sid = created.session.session_id

    # Turn 1: Patient confirms penicillin allergy
    res1 = await orchestrator.process_turn(
        session_id=sid,
        role=ParticipantRole.PATIENT,
        source_text="मुझे पेनिसिलिन से एलर्जी है",
        source_language=LanguageCode.HINDI,
    )
    assert res1.state == TurnState.CONFIRMING
    confirm_res1 = orchestrator.handle_confirmation_response(
        turn_id=res1.turn.turn_id,
        response_text="हाँ",
    )
    assert confirm_res1.outcome == ConfirmationOutcome.CONFIRMED
    original_fact_id = confirm_res1.verified_facts[0].fact_id

    # Turn 2: Patient repeats the same penicillin allergy
    res2 = await orchestrator.process_turn(
        session_id=sid,
        role=ParticipantRole.PATIENT,
        source_text="मुझे पेनिसिलिन से एलर्जी है",
        source_language=LanguageCode.HINDI,
    )
    assert res2.state == TurnState.CONFIRMING
    confirm_res2 = orchestrator.handle_confirmation_response(
        turn_id=res2.turn.turn_id,
        response_text="हाँ",
    )
    assert confirm_res2.outcome == ConfirmationOutcome.CONFIRMED

    # Must preserve the exact confirmed fact without silently overwriting
    session_facts = orchestrator.get_session_verified_facts(sid)
    assert len(session_facts) == 1
    assert session_facts[0].fact_id == original_fact_id


# ==============================================================================
# 2. Resilience, Timeouts & Retries
# ==============================================================================

@pytest.mark.asyncio
async def test_provider_timeout_and_failure_handling(
    session_service: SessionService,
    clock: ControllableClock,
) -> None:
    """Verify that translation provider timeout does not crash the session or invent output."""
    created = session_service.create_session()
    sid = created.session.session_id

    flaky_provider = FlakyTranslationProvider(
        failure_exc=asyncio.TimeoutError("Translation service request timed out after 3.0s")
    )
    orch = AgentOrchestrator(translation_provider=flaky_provider, clock=clock)

    res = await orch.process_turn(
        session_id=sid,
        role=ParticipantRole.DOCTOR,
        source_text="Please monitor your blood pressure.",
    )

    # Provider failed: turn marked unresolved, never invent missing output
    assert res.turn.processing_status == ProcessingStatus.FAILED
    assert res.turn.translated_text is None
    assert res.speech_output is None
    assert res.turn.state == TurnState.UNRESOLVED
    assert "timed out" in (res.turn.error_message or "")
    assert res.is_repeat_requested is True

    # Session is still intact and ready for retry
    assert sid in orch._session_turns


@pytest.mark.asyncio
async def test_retry_after_provider_failure_without_session_restart(
    session_service: SessionService,
    clock: ControllableClock,
    store: InMemorySessionStore,
) -> None:
    """A failed turn must be retryable without restarting the consultation."""
    created = session_service.create_session()
    sid = created.session.session_id

    flaky_provider = FlakyTranslationProvider(
        failure_exc=Exception("503 Service Unavailable: translation upstream is down")
    )
    orch = AgentOrchestrator(translation_provider=flaky_provider, clock=clock)

    # Initial attempt fails
    turn_id = uuid4()
    t_end = clock.now()
    res1 = await orch.process_turn(
        session_id=sid,
        role=ParticipantRole.DOCTOR,
        source_text="Drink plenty of fluids.",
        turn_id=turn_id,
        speech_end_time=t_end,
    )
    assert res1.turn.processing_status == ProcessingStatus.FAILED
    assert res1.turn.retry_count == 0
    assert turn_id in orch.get_session_unresolved_turns(sid)

    # Recovery: provider recovers
    flaky_provider.failure_exc = None

    # Retry the exact failed turn without restarting session
    clock.advance(timedelta(seconds=1))
    retry_res = await orch.retry_turn(turn_id)

    assert retry_res.turn.turn_id == turn_id
    assert retry_res.turn.retry_count == 1
    assert retry_res.turn.processing_status == ProcessingStatus.COMPLETED
    assert retry_res.turn.translated_text is not None
    assert retry_res.turn.state == TurnState.SPEAKING
    assert retry_res.speech_output is not None

    # Turn is no longer unresolved
    assert turn_id not in orch.get_session_unresolved_turns(sid)

    # Verify session record incorporates the resolved turn
    record_service = SessionRecordService(
        session_service=session_service,
        orchestrator=orch,
        store=store,
        clock=clock,
    )
    record = record_service.generate_record(sid)
    assert len(record.conversation) == 1
    assert record.conversation[0].retry_count == 1
    assert record.conversation[0].processing_status == ProcessingStatus.COMPLETED
    assert len(record.unresolved_items) == 0


@pytest.mark.asyncio
async def test_router_retry_turn_dispatches_events(
    session_service: SessionService,
    clock: ControllableClock,
) -> None:
    """Verify TwoParticipantRouter can retry a failed turn and dispatch the event to the recipient."""
    created = session_service.create_session()
    sid = created.session.session_id

    flaky_provider = FlakyTranslationProvider(failure_exc=Exception("Provider network glitch"))
    orch = AgentOrchestrator(translation_provider=flaky_provider, clock=clock)
    conn_mgr = SessionConnectionManager()
    router = TwoParticipantRouter(connection_manager=conn_mgr, orchestrator=orch)

    # Turn fails initially
    events1 = await router.handle_doctor_speech(
        session_id=sid,
        source_text="Please drink water and rest well.",
    )
    turns = orch.get_session_turns(sid)
    assert len(turns) == 1
    failed_turn = turns[0]
    assert failed_turn.processing_status == ProcessingStatus.FAILED

    # Provider recovers
    flaky_provider.failure_exc = None

    # Connect patient mock ws
    patient = Participant(
        session_id=sid,
        role=ParticipantRole.PATIENT,
        connection_status=ConnectionStatus.CONNECTED,
        microphone_status=MicrophoneStatus.GRANTED,
    )
    mock_patient_ws = AsyncMock()
    conn_mgr.register_connection(sid, patient, mock_patient_ws)

    # Retry turn
    retry_events = await router.retry_turn(failed_turn.turn_id)
    assert len(retry_events) == 1
    assert retry_events[0].recipient_role == ParticipantRole.PATIENT
    assert retry_events[0].event_type == OutboundEventType.INTERPRETATION
    assert mock_patient_ws.send_json.called


# ==============================================================================
# 3. Disconnect & Reconnection
# ==============================================================================

@pytest.mark.asyncio
async def test_participant_disconnect_and_reconnection_buffering(
    session_service: SessionService,
    clock: ControllableClock,
) -> None:
    """Verify events are buffered when participant disconnects and drained on reconnection."""
    created = session_service.create_session()
    sid = created.session.session_id

    conn_mgr = SessionConnectionManager()
    orch = AgentOrchestrator(clock=clock)
    router = TwoParticipantRouter(connection_manager=conn_mgr, orchestrator=orch)

    patient = Participant(
        session_id=sid,
        role=ParticipantRole.PATIENT,
        connection_status=ConnectionStatus.CONNECTED,
        microphone_status=MicrophoneStatus.GRANTED,
    )
    mock_ws = AsyncMock()
    conn_mgr.register_connection(sid, patient, mock_ws)
    assert conn_mgr.is_connected(sid, ParticipantRole.PATIENT) is True

    # Patient disconnects
    conn_mgr.remove_connection(sid, ParticipantRole.PATIENT, mock_ws)
    assert conn_mgr.is_connected(sid, ParticipantRole.PATIENT) is False

    # Doctor speaks while patient is disconnected (standard interpretation -> patient)
    events = await router.handle_doctor_speech(
        session_id=sid,
        source_text="Drink plenty of water and get enough rest.",
    )
    assert len(events) == 1
    assert events[0].recipient_role == ParticipantRole.PATIENT

    # Event should be buffered in connection manager
    buffered = conn_mgr.get_buffer(sid, ParticipantRole.PATIENT)
    assert len(buffered) == 1
    assert buffered[0].event_type == OutboundEventType.INTERPRETATION

    # Patient reconnects with new WebSocket
    new_mock_ws = AsyncMock()
    drained = conn_mgr.register_connection(sid, patient, new_mock_ws)
    assert len(drained) == 1
    assert drained[0].event_type == OutboundEventType.INTERPRETATION

    # Buffer should now be cleared
    assert len(conn_mgr.get_buffer(sid, ParticipantRole.PATIENT)) == 0


# ==============================================================================
# 4. Session Expiration & Retention
# ==============================================================================

def test_session_expiration_and_cleanup(
    session_service: SessionService,
    record_service: SessionRecordService,
    clock: ControllableClock,
    store: InMemorySessionStore,
) -> None:
    """Verify session expiration enforcement and cleanup of short-lived sessions."""
    created = session_service.create_session()
    sid = created.session.session_id

    # Retention is 30 minutes. Advance clock by 35 minutes.
    clock.advance(timedelta(minutes=35))

    # Accessing record after expiration must raise SessionExpiredError
    with pytest.raises(SessionExpiredError):
        record_service.generate_record(sid)

    # Run cleanup of expired sessions
    purged = session_service.cleanup_expired_sessions()
    assert purged == 1

    # Session is completely deleted from store
    assert store.get_session(sid) is None


def test_session_not_found(record_service: SessionRecordService) -> None:
    """Record generation for non-existent session raises SessionNotFoundError."""
    with pytest.raises(SessionNotFoundError):
        record_service.generate_record(uuid4())


# ==============================================================================
# 5. Latency Metrics Instrumentation
# ==============================================================================

def test_latency_metrics_prd_targets() -> None:
    """Verify PRD target calculation: median < 2.5s and p95 < 4.0s."""
    tracker = LatencyTracker()

    # Zero samples: target_met MUST be False (no claiming without proof)
    summary_empty = tracker.compute_summary()
    assert summary_empty.sample_count == 0
    assert summary_empty.target_met is False

    # Fast samples well within target
    # 1.0s, 1.2s, 1.4s, 1.8s, 2.0s
    t0 = datetime(2026, 9, 27, 10, 0, 0, tzinfo=UTC)
    tracker.record_turn_latency(t0, t0 + timedelta(seconds=1.0))
    tracker.record_turn_latency(t0, t0 + timedelta(seconds=1.2))
    tracker.record_turn_latency(t0, t0 + timedelta(seconds=1.4))
    tracker.record_turn_latency(t0, t0 + timedelta(seconds=1.8))
    tracker.record_turn_latency(t0, t0 + timedelta(seconds=2.0))

    summary_fast = tracker.compute_summary()
    assert summary_fast.sample_count == 5
    assert summary_fast.median_seconds == pytest.approx(1.4, rel=1e-2)
    assert summary_fast.p95_seconds < 4.0
    assert summary_fast.target_met is True

    # Slow tracker exceeding targets
    slow_tracker = LatencyTracker()
    slow_tracker.record_turn_latency(t0, t0 + timedelta(seconds=3.0))
    slow_tracker.record_turn_latency(t0, t0 + timedelta(seconds=4.5))
    summary_slow = slow_tracker.compute_summary()
    assert summary_slow.median_seconds > 2.5
    assert summary_slow.target_met is False


# ==============================================================================
# 6. Privacy & Sensitive Data Log Redaction
# ==============================================================================

def test_sensitive_data_handling_in_logs() -> None:
    """Ensure tokens, secrets, passwords, and API keys are redacted from logs."""
    formatter = JsonLogFormatter()

    record = logging.LogRecord(
        name="sahayak.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="Connecting with Bearer sah_tok_1234567890abcdef and api_key=xyz_secret_999",
        args=(),
        exc_info=None,
    )
    record.extra_fields = {
        "access_token": "sah_tok_1234567890abcdef",
        "secret_key": "super_secret_clinical_key",
        "nested": {
            "token_hash": "sha256_hash_value",
            "normal_field": "doctor_consultation",
        },
    }

    formatted = formatter.format(record)
    log_json = json.loads(formatted)

    # Message must have bearer and api_key redacted
    assert "sah_tok_1234567890abcdef" not in log_json["message"]
    assert "xyz_secret_999" not in log_json["message"]
    assert "[REDACTED]" in log_json["message"]

    # Extra fields must be redacted
    assert log_json["access_token"] == "[REDACTED]"
    assert log_json["secret_key"] == "[REDACTED]"
    assert log_json["nested"]["token_hash"] == "[REDACTED]"
    assert log_json["nested"]["normal_field"] == "doctor_consultation"


# ==============================================================================
# 7. Session Record API Endpoint
# ==============================================================================

def test_api_get_session_record(session_service: SessionService, store: InMemorySessionStore) -> None:
    """Test GET /sessions/{session_id}/record endpoint with authorization."""
    settings = Settings()
    app = create_app(settings=settings, session_store=store)
    client = TestClient(app)

    # 1. Create session via API
    create_resp = client.post("/api/sessions")
    assert create_resp.status_code == 201
    data = create_resp.json()
    sid = data["session"]["session_id"]
    doctor_token = data["access"]["doctor"]["token"]

    # 2. Get record with doctor token
    rec_resp = client.get(
        f"/api/sessions/{sid}/record",
        headers={"X-Sahayak-Access-Token": doctor_token},
    )
    assert rec_resp.status_code == 200
    rec_data = rec_resp.json()
    assert rec_data["session_id"] == sid
    assert "conversation" in rec_data
    assert "verified_facts" in rec_data
    assert "unresolved_items" in rec_data
    assert "latency_metrics" in rec_data

    # 3. Unauthorized access without token
    unauth_resp = client.get(f"/api/sessions/{sid}/record")
    assert unauth_resp.status_code == 401
