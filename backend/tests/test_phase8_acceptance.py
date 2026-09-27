"""Phase 8 End-to-End Acceptance Tests.

Validates all 9 required acceptance scenarios:
1. Bidirectional Loop (10 scripted English->Hindi, 10 scripted Hindi->English)
2. Allergy Detection, Protection, Confirmation & Doctor Verification
3. Medicine Uncertainty & Repetition Request
4. Negation Distinct Handling ("No allergy" vs "I have an allergy")
5. Dosage (Number + Unit + Frequency) Preservation
6. Emergency Escalation & Human Support Instruction
7. Routing: Zero Cross-Role Event Leakage
8. Retry After Provider Timeout Without Session Restart
9. Session End & Final Bilingual Record Generation
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

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
    SessionStatus,
    TurnState,
)
from sahayak.domain.models import Participant, SessionRecord
from sahayak.domain.routing import OutboundEvent, OutboundEventType
from sahayak.domain.safety import CriticalFactCategory
from sahayak.domain.translation import TranslationResult, TranslationStatus
from sahayak.providers.base import TranslationProvider
from sahayak.services.agent import AgentOrchestrator
from sahayak.services.clock import Clock
from sahayak.services.metrics import LatencyTracker
from sahayak.services.record import SessionRecordService
from sahayak.services.routing import SessionConnectionManager, TwoParticipantRouter
from sahayak.services.routing.errors import CrossRoleLeakageError, InvalidRecipientError
from sahayak.services.safety.engine import DeterministicSafetyEngine
from sahayak.services.sessions import SessionService
from sahayak.services.store import InMemorySessionStore


class AcceptanceClock(Clock):
    """Controllable clock for deterministic timeline verification."""

    def __init__(self, start_time: datetime | None = None) -> None:
        self._now = start_time or datetime(2026, 9, 28, 9, 0, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self._now

    def advance(self, duration: timedelta) -> None:
        self._now += duration


class MockTranslationService(TranslationProvider):
    """Deterministic translation provider with simulated latency and fault injection."""

    def __init__(self, fail_next: bool = False, latency_ms: float = 120.0) -> None:
        self.fail_next = fail_next
        self.latency_ms = latency_ms
        self.call_count = 0

    async def translate(
        self,
        text: str,
        source_language: LanguageCode,
        target_language: LanguageCode,
    ) -> TranslationResult:
        self.call_count += 1
        if self.fail_next:
            self.fail_next = False
            raise asyncio.TimeoutError("Translation service timeout after 2500ms")

        # Deterministic mock interpretation mappings
        translations = {
            "en_hi": {
                "Hello, I am Dr. Sharma. How can I help you today?": "नमस्ते, मैं डॉ. शर्मा हूँ। आज मैं आपकी क्या मदद कर सकता हूँ?",
                "How long have you been experiencing this cough?": "आपको यह खांसी कब से हो रही है?",
                "Do you have any fever or chills?": "क्या आपको बुखार या ठंड लग रही है?",
                "Let me check your blood pressure and heart rate.": "मुझे आपका रक्तचाप और हृदय गति जांचने दें।",
                "Your vital signs look normal and stable.": "आपके महत्वपूर्ण संकेत सामान्य और स्थिर दिख रहे हैं।",
                "Please drink plenty of warm water throughout the day.": "कृपया दिन भर में खूब गर्म पानी पिएं।",
                "Make sure to get at least eight hours of sleep.": "कम से कम आठ घंटे की नींद लेना सुनिश्चित करें।",
                "Avoid cold beverages and spicy foods for a few days.": "कुछ दिनों तक ठंडे पेय और मसालेदार भोजन से बचें।",
                "If your throat irritation persists, come back for a follow-up.": "यदि आपके गले की जलन बनी रहती है, तो फिर से आएं।",
                "Take care and wishing you a speedy recovery.": "अपना ध्यान रखें और आपके शीघ्र स्वस्थ होने की कामना करता हूँ।",
                "Drink plenty of water and rest.": "खूब पानी पिएं और आराम करें।",
                "Five milligrams twice daily.": "पांच मिलीग्राम दिन में दो बार।",
                "I have an allergy.": "मुझे एलर्जी है।",
                "No allergy.": "कोई एलर्जी नहीं है।",
            },
            "hi_en": {
                "नमस्ते डॉक्टर साहब, मुझे तीन दिन से खांसी है।": "Hello doctor, I have had a cough for three days.",
                "गले में खराश भी बहुत ज्यादा महसूस हो रही है।": "I am also feeling severe irritation in my throat.",
                "रात को सोते समय खांसी और बढ़ जाती है।": "The cough worsens when sleeping at night.",
                "मुझे हल्का बुखार भी आया था कल शाम को।": "I also had a mild fever yesterday evening.",
                "सिर में हल्का दर्द भी रहता है।": "There is also a mild headache.",
                "भूख भी थोड़ी कम लग रही है पिछले दो दिनों से।": "My appetite has also decreased slightly over the past two days.",
                "मैंने केवल गर्म पानी और तुलसी की चाय पी है।": "I have only been drinking warm water and tulsi tea.",
                "क्या यह कोई गंभीर संक्रमण हो सकता है?": "Could this be a serious infection?",
                "मैं आराम करने की पूरी कोशिश करूँगा।": "I will try my best to rest.",
                "धन्यवाद डॉक्टर साहब, आपकी सलाह के लिए।": "Thank you doctor, for your advice.",
                "Mujhe penicillin se allergy hai.": "I am allergic to penicillin.",
                "मुझे पेनिसिलिन से एलर्जी है": "I am allergic to penicillin.",
                "मुझे एलर्जी नहीं है": "I do not have an allergy.",
                "मुझे एलर्जी है": "I have an allergy.",
            },
        }

        pair_key = f"{source_language.value}_{target_language.value}"
        translated = translations.get(pair_key, {}).get(text, f"[{target_language.value.upper()}] {text}")

        return TranslationResult(
            source_text=text,
            source_language=source_language,
            target_language=target_language,
            status=TranslationStatus.SUCCESS,
            translated_text=translated,
        )


@pytest.fixture
def env():
    """Build a complete, integrated Sahayak backend environment."""
    clock = AcceptanceClock()
    store = InMemorySessionStore()
    settings = Settings(
        session_ttl_seconds=3600,
        join_token_ttl_seconds=1800,
    )
    session_service = SessionService(store=store, settings=settings, clock=clock)
    translation_provider = MockTranslationService()
    orchestrator = AgentOrchestrator(
        translation_provider=translation_provider,
        settings=settings,
        clock=clock,
    )
    connection_manager = SessionConnectionManager()
    router = TwoParticipantRouter(
        connection_manager=connection_manager,
        orchestrator=orchestrator,
    )
    record_service = SessionRecordService(
        session_service=session_service,
        orchestrator=orchestrator,
        store=store,
        clock=clock,
    )

    # Helper to set up an active consultation with doctor & patient WebSockets
    def create_active_session():
        created = session_service.create_session()
        sid = created.session.session_id

        doc_part = Participant(
            session_id=sid,
            role=ParticipantRole.DOCTOR,
            connection_status=ConnectionStatus.CONNECTED,
            microphone_status=MicrophoneStatus.GRANTED,
        )
        pat_part = Participant(
            session_id=sid,
            role=ParticipantRole.PATIENT,
            connection_status=ConnectionStatus.CONNECTED,
            microphone_status=MicrophoneStatus.GRANTED,
        )

        doc_ws = AsyncMock()
        pat_ws = AsyncMock()

        connection_manager.register_connection(sid, doc_part, doc_ws)
        connection_manager.register_connection(sid, pat_part, pat_ws)

        return {
            "session_id": sid,
            "doctor_token": created.doctor_token,
            "patient_token": created.patient_token,
            "doc_ws": doc_ws,
            "pat_ws": pat_ws,
            "doc_part": doc_part,
            "pat_part": pat_part,
        }

    return {
        "clock": clock,
        "store": store,
        "settings": settings,
        "session_service": session_service,
        "translation_provider": translation_provider,
        "orchestrator": orchestrator,
        "connection_manager": connection_manager,
        "router": router,
        "record_service": record_service,
        "create_active_session": create_active_session,
    }


# ==============================================================================
# SCENARIO 1: BIDIRECTIONAL LOOP (>=10 English->Hindi, >=10 Hindi->English)
# ==============================================================================

@pytest.mark.asyncio
async def test_scenario_1_bidirectional_loop(env):
    """Validate at least 10 scripted English->Hindi turns and 10 scripted Hindi->English turns."""
    setup = env["create_active_session"]()
    sid = setup["session_id"]
    router = env["router"]
    clock = env["clock"]
    doc_ws = setup["doc_ws"]
    pat_ws = setup["pat_ws"]

    doctor_script = [
        "Hello, I am Dr. Sharma. How can I help you today?",
        "How long have you been experiencing this cough?",
        "Do you have any fever or chills?",
        "Let me check your blood pressure and heart rate.",
        "Your vital signs look normal and stable.",
        "Please drink plenty of warm water throughout the day.",
        "Make sure to get at least eight hours of sleep.",
        "Avoid cold beverages and spicy foods for a few days.",
        "If your throat irritation persists, come back for a follow-up.",
        "Take care and wishing you a speedy recovery.",
    ]

    patient_script = [
        "नमस्ते डॉक्टर साहब, मुझे तीन दिन से खांसी है।",
        "गले में खराश भी बहुत ज्यादा महसूस हो रही है।",
        "रात को सोते समय खांसी और बढ़ जाती है।",
        "मुझे हल्का बुखार भी आया था कल शाम को।",
        "सिर में हल्का दर्द भी रहता है।",
        "भूख भी थोड़ी कम लग रही है पिछले दो दिनों से।",
        "मैंने केवल गर्म पानी और तुलसी की चाय पी है।",
        "क्या यह कोई गंभीर संक्रमण हो सकता है?",
        "मैं आराम करने की पूरी कोशिश करूँगा।",
        "धन्यवाद डॉक्टर साहब, आपकी सलाह के लिए।",
    ]

    assert len(doctor_script) >= 10
    assert len(patient_script) >= 10

    # Execute 10 English -> Hindi turns (Doctor speaking)
    doc_event_count_before = doc_ws.send_json.call_count
    for utterance in doctor_script:
        t_end = clock.now()
        clock.advance(timedelta(milliseconds=300))
        events = await router.handle_doctor_speech(
            session_id=sid,
            source_text=utterance,
            speech_end_time=t_end,
        )
        assert len(events) >= 1
        # Hindi interpretation must be delivered to PATIENT ONLY
        assert all(ev.recipient_role == ParticipantRole.PATIENT for ev in events)

    # Doctor must receive ZERO events from doctor's own speech
    assert doc_ws.send_json.call_count == doc_event_count_before
    assert pat_ws.send_json.call_count >= 10

    # Execute 10 Hindi -> English turns (Patient speaking)
    pat_event_count_before = pat_ws.send_json.call_count
    for utterance in patient_script:
        t_end = clock.now()
        clock.advance(timedelta(milliseconds=300))
        events = await router.handle_patient_speech(
            session_id=sid,
            source_text=utterance,
            speech_end_time=t_end,
        )
        assert len(events) >= 1
        # English interpretation must be delivered to DOCTOR ONLY
        assert all(ev.recipient_role == ParticipantRole.DOCTOR for ev in events)

    # Patient must receive ZERO events from patient's own speech
    assert pat_ws.send_json.call_count == pat_event_count_before
    assert doc_ws.send_json.call_count >= 10


# ==============================================================================
# SCENARIO 2: ALLERGY DETECTION, CONFIRMATION & VERIFICATION
# ==============================================================================

@pytest.mark.asyncio
async def test_scenario_2_allergy_workflow(env):
    """Patient says: 'Mujhe penicillin se allergy hai.'
    Must detect allergy, protect penicillin, require confirmation, confirm, and verify fact to doctor.
    """
    setup = env["create_active_session"]()
    sid = setup["session_id"]
    router = env["router"]
    orchestrator = env["orchestrator"]
    record_service = env["record_service"]
    clock = env["clock"]
    doc_ws = setup["doc_ws"]
    pat_ws = setup["pat_ws"]

    doc_ws.reset_mock()
    pat_ws.reset_mock()

    # Patient speaks allergy
    t_end = clock.now()
    clock.advance(timedelta(milliseconds=200))
    events = await router.handle_patient_speech(
        session_id=sid,
        source_text="Mujhe penicillin se allergy hai.",
        speech_end_time=t_end,
    )

    # 1. Allergy detected, confirmation required
    assert len(events) == 1
    conf_event = events[0]
    assert conf_event.event_type == OutboundEventType.CONFIRMATION_PROMPT
    assert conf_event.recipient_role == ParticipantRole.PATIENT
    assert "penicillin" in conf_event.payload.get("prompt_text", "").lower() or "allergy" in conf_event.payload.get("prompt_text", "").lower()

    # Normal interpretation is stopped: doctor receives NO premature unverified interpretation
    assert doc_ws.send_json.call_count == 0

    # 2. Patient confirms
    turn_id = UUID(conf_event.payload["turn_id"])
    doc_ws.reset_mock()
    confirm_events = await router.handle_confirmation_response(
        session_id=sid,
        turn_id=turn_id,
        response_text="हाँ, बिल्कुल",  # Yes, definitely
        responder_role=ParticipantRole.PATIENT,
    )

    # 3. Fact becomes VERIFIED & delivered to DOCTOR
    assert any(ev.event_type == OutboundEventType.VERIFIED_FACT for ev in confirm_events)
    verified_event = next(ev for ev in confirm_events if ev.event_type == OutboundEventType.VERIFIED_FACT)
    assert verified_event.recipient_role == ParticipantRole.DOCTOR
    assert verified_event.payload["category"].lower() == "allergy"
    assert "penicillin" in verified_event.payload["source_wording"].lower()

    # Doctor also receives the translated statement now that it is verified
    assert any(ev.event_type == OutboundEventType.INTERPRETATION for ev in confirm_events)

    # 4. Final Record contains verified fact, source wording, translation, confirmation, timestamp
    record = record_service.generate_record(sid)
    assert len(record.verified_facts) >= 1
    vf = record.verified_facts[0]
    assert vf.original_source_wording == "Mujhe penicillin se allergy hai."
    assert vf.category.lower() == "allergy"
    assert vf.confirmation_reference is not None
    assert vf.verified_at is not None


# ==============================================================================
# SCENARIO 3: MEDICINE UNCERTAINTY & REPETITION
# ==============================================================================

@pytest.mark.asyncio
async def test_scenario_3_medicine_uncertainty(env):
    """Intentionally unclear medicine name triggers NEEDS_REPETITION."""
    setup = env["create_active_session"]()
    sid = setup["session_id"]
    router = env["router"]
    orchestrator = env["orchestrator"]
    record_service = env["record_service"]

    # Inaudible / garbled medicine name with uncertainty pattern or low confidence
    events = await router.handle_patient_speech(
        session_id=sid,
        source_text="I took some paracet-... [inaudible]",
        confidence_data={"paracetamol": 0.40},
    )

    assert len(events) >= 1
    rep_event = events[0]
    assert rep_event.event_type == OutboundEventType.REPETITION_REQUEST
    assert rep_event.recipient_role == ParticipantRole.PATIENT

    turns = orchestrator.get_session_turns(sid)
    assert len(turns) == 1
    turn = turns[0]
    assert turn.state == TurnState.NEEDS_REPETITION
    assert turn.processing_status == ProcessingStatus.FAILED

    # Source turn preserved in session record unresolved items
    record = record_service.generate_record(sid)
    assert len(record.conversation) == 1
    assert record.conversation[0].source_text == "I took some paracet-... [inaudible]"
    assert len(record.unresolved_items) >= 1
    assert "paracet-" in record.unresolved_items[0].source_wording


# ==============================================================================
# SCENARIO 4: NEGATION HANDLING ("No allergy" vs "I have an allergy")
# ==============================================================================

def test_scenario_4_negation_distinct_handling():
    """Verify 'No allergy.' and 'I have an allergy.' produce distinct safety states."""
    engine = DeterministicSafetyEngine()
    tid1 = uuid4()
    tid2 = uuid4()

    # 1. "No allergy." -> Explicit Negation / Standard
    res_negation = engine.analyze_text(
        text="No allergy.",
        turn_id=tid1,
    )

    # 2. "I have an allergy." -> Critical Allergy Mention -> Needs Confirmation
    res_affirmative = engine.analyze_text(
        text="I have an allergy.",
        turn_id=tid2,
    )

    # Must NOT be treated as equivalent
    assert res_negation.category != res_affirmative.category
    assert res_negation.category == CriticalFactCategory.NEGATION.value
    assert res_affirmative.category == CriticalFactCategory.ALLERGY.value
    assert any(f.category == CriticalFactCategory.NEGATION and f.is_negated for f in res_negation.facts)
    assert any(f.category == CriticalFactCategory.ALLERGY and not f.is_negated for f in res_affirmative.facts)
    assert res_negation.matched_term != res_affirmative.matched_term


# ==============================================================================
# SCENARIO 5: DOSAGE PRESERVATION (Number + Unit + Frequency)
# ==============================================================================

def test_scenario_5_dosage_preservation():
    """Validate preservation of number, unit, and frequency in dosage statements."""
    engine = DeterministicSafetyEngine()
    tid = uuid4()

    res = engine.analyze_text(
        text="Five milligrams twice daily.",
        turn_id=tid,
    )

    # Must detect dosage category
    assert res.safety_state == SafetyState.NEEDS_CONFIRMATION
    assert res.category == CriticalFactCategory.DOSAGE.value

    # Must extract both quantity_unit ('Five milligrams') and frequency ('twice daily')
    extracted_terms = [f.matched_term.lower() for f in res.facts]
    assert any("five milligrams" in t or "milligrams" in t for t in extracted_terms)
    assert any("twice daily" in t for t in extracted_terms)


# ==============================================================================
# SCENARIO 6: EMERGENCY ESCALATION
# ==============================================================================

@pytest.mark.asyncio
async def test_scenario_6_emergency_escalation(env):
    """Emergency indicator triggers ESCALATE and stops normal interpretation."""
    setup = env["create_active_session"]()
    sid = setup["session_id"]
    router = env["router"]
    orchestrator = env["orchestrator"]
    doc_ws = setup["doc_ws"]
    pat_ws = setup["pat_ws"]

    events = await router.handle_patient_speech(
        session_id=sid,
        source_text="Patient has severe chest pain and cannot breathe.",
    )

    assert len(events) >= 1
    # Must dispatch emergency alert
    assert any(ev.event_type == OutboundEventType.EMERGENCY_ALERT for ev in events)

    # Doctor and patient receive emergency instructions
    turns = orchestrator.get_session_turns(sid)
    assert turns[0].state == TurnState.ENDED
    assert turns[0].decision == AgentDecision.ESCALATE
    assert turns[0].processing_status == ProcessingStatus.FAILED

    # Normal interpretation is stopped: NO INTERPRETATION event
    assert not any(ev.event_type == OutboundEventType.INTERPRETATION for ev in events)


# ==============================================================================
# SCENARIO 7: ROUTING ZERO CROSS-ROLE EVENT LEAKAGE
# ==============================================================================

@pytest.mark.asyncio
async def test_scenario_7_zero_cross_role_leakage(env):
    """Enforce strict role-based routing with zero cross-role leakage."""
    setup = env["create_active_session"]()
    sid = setup["session_id"]
    router = env["router"]
    doc_ws = setup["doc_ws"]
    pat_ws = setup["pat_ws"]

    doc_ws.reset_mock()
    pat_ws.reset_mock()

    # 1. Doctor speech: Patient receives interpretation; Doctor receives NOTHING
    await router.handle_doctor_speech(
        session_id=sid,
        source_text="Please drink plenty of water and rest.",
    )
    assert doc_ws.send_json.call_count == 0
    assert pat_ws.send_json.call_count == 1
    pat_call = pat_ws.send_json.call_args[0][0]
    assert pat_call["recipient_role"] == "patient"
    assert pat_call["type"] == "interpretation"

    # 2. Patient speech: Doctor receives interpretation; Patient receives NOTHING
    doc_ws.reset_mock()
    pat_ws.reset_mock()
    await router.handle_patient_speech(
        session_id=sid,
        source_text="धन्यवाद डॉक्टर साहब, आपकी सलाह के लिए।",
    )
    assert pat_ws.send_json.call_count == 0
    assert doc_ws.send_json.call_count == 1
    doc_call = doc_ws.send_json.call_args[0][0]
    assert doc_call["recipient_role"] == "doctor"
    assert doc_call["type"] == "interpretation"

    # 3. Clinical facts to patient must be blocked with InvalidRecipientError
    with pytest.raises(InvalidRecipientError):
        leak_event = OutboundEvent(
            event_type=OutboundEventType.VERIFIED_FACT,
            session_id=sid,
            recipient_role=ParticipantRole.PATIENT,  # Clinical facts are DOCTOR ONLY
            sender_role=ParticipantRole.AGENT,
            payload={"category": "allergy"},
        )
        await router.send_event(leak_event)

    # 4. Direct cross-role delivery mismatch must raise CrossRoleLeakageError
    with pytest.raises(CrossRoleLeakageError):
        router.validator.validate_recipient(
            OutboundEvent(
                event_type=OutboundEventType.INTERPRETATION,
                session_id=sid,
                recipient_role=ParticipantRole.DOCTOR,
                sender_role=ParticipantRole.PATIENT,
            ),
            target_role=ParticipantRole.PATIENT,  # Delivery mismatch!
        )


# ==============================================================================
# SCENARIO 8: RETRY AFTER PROVIDER TIMEOUT
# ==============================================================================

@pytest.mark.asyncio
async def test_scenario_8_retry_after_provider_timeout(env):
    """Force one provider timeout; verify turn fails, retries, and consultation continues without restart."""
    setup = env["create_active_session"]()
    sid = setup["session_id"]
    router = env["router"]
    orchestrator = env["orchestrator"]
    translation_provider = env["translation_provider"]
    clock = env["clock"]

    # Inject timeout failure on next call
    translation_provider.fail_next = True

    t_end = clock.now()
    events_fail = await router.handle_doctor_speech(
        session_id=sid,
        source_text="Please drink water and rest.",
        speech_end_time=t_end,
    )

    # Failed turn: no interpretation emitted (zero invented output)
    assert not any(ev.event_type == OutboundEventType.INTERPRETATION for ev in events_fail)
    turns = orchestrator.get_session_turns(sid)
    assert len(turns) == 1
    failed_turn = turns[0]
    assert failed_turn.processing_status == ProcessingStatus.FAILED
    assert failed_turn.retry_count == 0

    # Provider is now healthy (fail_next reset to False)
    # Retry the exact turn without restarting session
    clock.advance(timedelta(seconds=1))
    retry_events = await router.retry_turn(failed_turn.turn_id)

    assert len(retry_events) == 1
    assert retry_events[0].event_type == OutboundEventType.INTERPRETATION
    assert retry_events[0].recipient_role == ParticipantRole.PATIENT
    assert failed_turn.retry_count == 1
    assert failed_turn.processing_status == ProcessingStatus.COMPLETED

    # Session continues with subsequent turns normally
    clock.advance(timedelta(seconds=2))
    next_events = await router.handle_doctor_speech(
        session_id=sid,
        source_text="Take care and wishing you a speedy recovery.",
    )
    assert len(next_events) == 1
    assert len(orchestrator.get_session_turns(sid)) == 2


# ==============================================================================
# SCENARIO 9: SESSION END & FINAL BILINGUAL RECORD
# ==============================================================================

@pytest.mark.asyncio
async def test_scenario_9_session_end_and_record_generation(env):
    """End consultation and produce final bilingual record with turns, verified facts, and unresolved items."""
    setup = env["create_active_session"]()
    sid = setup["session_id"]
    session_service = env["session_service"]
    router = env["router"]
    orchestrator = env["orchestrator"]
    record_service = env["record_service"]
    token = setup["doctor_token"]

    # 1. Turn 1: Standard doctor instruction
    await router.handle_doctor_speech(
        session_id=sid,
        source_text="Please drink plenty of warm water throughout the day.",
    )

    # 2. Turn 2: Patient confirmed allergy
    allergy_events = await router.handle_patient_speech(
        session_id=sid,
        source_text="Mujhe penicillin se allergy hai.",
    )
    allergy_turn_id = UUID(allergy_events[0].payload["turn_id"])
    await router.handle_confirmation_response(
        session_id=sid,
        turn_id=allergy_turn_id,
        response_text="हाँ",
        responder_role=ParticipantRole.PATIENT,
    )

    # 3. Turn 3: Unresolved item
    unresolved_res = await orchestrator.process_turn(
        session_id=sid,
        role=ParticipantRole.PATIENT,
        source_text="मुझे एस्पिरिन से भी एलर्जी हो सकती है",
    )
    orchestrator.handle_confirmation_response(
        turn_id=unresolved_res.turn.turn_id,
        response_text="नहीं",
        responder_role=ParticipantRole.PATIENT,
    )

    # 4. End session via SessionService
    ended_session = session_service.end_session(sid, token)
    assert ended_session.status == SessionStatus.ENDED

    # 5. Generate final record
    record = record_service.generate_record(sid)
    assert isinstance(record, SessionRecord)
    assert record.session_id == sid

    # Verify all 3 required sections exist
    assert len(record.conversation) == 3
    assert len(record.verified_facts) >= 1
    assert len(record.unresolved_items) >= 1

    # Verify conversation preserves all required metadata
    turn1 = record.conversation[0]
    assert turn1.speaker_role == ParticipantRole.DOCTOR
    assert turn1.source_text == "Please drink plenty of warm water throughout the day."
    assert turn1.translated_text is not None
    assert turn1.timestamp is not None
    assert turn1.processing_status == ProcessingStatus.COMPLETED

    # Verify verified fact preserves original source wording, translated wording, confirmation reference
    vf = record.verified_facts[0]
    assert vf.original_source_wording == "Mujhe penicillin se allergy hai."
    assert vf.translated_wording != ""
    assert vf.confirmation_reference is not None

    # Verify unresolved items preserve original wording and reason
    unresolved = record.unresolved_items[0]
    assert "एस्पिरिन" in unresolved.source_wording
    assert unresolved.reason != ""
