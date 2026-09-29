"""Complete decision state machine and Agent Orchestrator test suite — Phase 5.

Verifies:
1. Standard turn
2. Allergy confirmation
3. Medicine confirmation
4. Dosage confirmation
5. Negation confirmation
6. Ambiguous confirmation (retry once, then unresolved)
7. Failed confirmation (rejection)
8. Needs repetition
9. Emergency escalation
10. Invalid state transitions
11. Confirmation cannot happen before confirmation-required event
12. Critical fact cannot become VERIFIED without successful confirmation
13. Unresolved fact remains unresolved
14. Original source wording is preserved
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from sahayak.api.errors import (
    ConfirmationNotAllowedError,
    InvalidStateTransitionError,
)
from sahayak.domain.enums import (
    AgentDecision,
    ConfirmationOutcome,
    LanguageCode,
    ParticipantRole,
    ProcessingStatus,
    SafetyState,
    TurnState,
)
from sahayak.domain.models import CriticalFact
from sahayak.domain.safety import CriticalFactCategory
from sahayak.providers.translation import MockTranslationProvider
from sahayak.services.agent import (
    AgentOrchestrator,
    ConfirmationManager,
    ConfirmationResponseClassifier,
    TurnStateMachine,
)
from sahayak.services.agent.prompts import build_confirmation_prompt
from sahayak.services.clock import FakeClock
from sahayak.services.safety import DeterministicSafetyEngine, SafetyEngineConfig


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def orchestrator() -> AgentOrchestrator:
    clock = FakeClock()
    translation_provider = MockTranslationProvider()
    safety_config = SafetyEngineConfig(min_confidence=0.75, require_confidence=False)
    safety_engine = DeterministicSafetyEngine(config=safety_config)
    confirmation_manager = ConfirmationManager(max_attempts=2)
    return AgentOrchestrator(
        translation_provider=translation_provider,
        safety_engine=safety_engine,
        confirmation_manager=confirmation_manager,
        clock=clock,
    )


# ---------------------------------------------------------------------------
# 1. Standard Turn
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_1_standard_turn(orchestrator: AgentOrchestrator) -> None:
    """Standard conversational turn proceeds directly to speech output without confirmation."""
    session_id = uuid4()
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="नमस्ते",
        source_language=LanguageCode.HINDI,
    )

    assert result.decision == AgentDecision.CONTINUE
    assert result.state == TurnState.SPEAKING
    assert result.risk_assessment.safety_state == SafetyState.STANDARD
    assert result.is_paused_for_confirmation is False
    assert result.confirmation is None
    assert result.speech_output == "hello"  # Canned mock translation
    assert result.turn.processing_status == ProcessingStatus.COMPLETED

    # Verify state machine audit history
    sm = orchestrator.get_state_machine(result.turn.turn_id)
    assert sm is not None
    states = [record.to_state for record in sm.history]
    assert states == [TurnState.LISTENING, TurnState.PROCESSING, TurnState.SPEAKING]


# ---------------------------------------------------------------------------
# 2. Allergy Confirmation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_2_allergy_confirmation(orchestrator: AgentOrchestrator) -> None:
    """Allergy utterance enters CONFIRMING, pauses normal interpretation, and verifies on confirmation."""
    session_id = uuid4()
    source_text = "Mujhe penicillin se allergy hai."
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text=source_text,
        source_language=LanguageCode.HINDI,
    )

    # 1. Paused for confirmation
    assert result.decision == AgentDecision.CONFIRM
    assert result.state == TurnState.CONFIRMING
    assert result.risk_assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
    assert result.is_paused_for_confirmation is True
    assert result.confirmation is not None
    assert result.confirmation.outcome == ConfirmationOutcome.PENDING
    assert "penicillin" in result.speech_output.lower()
    assert result.turn.verified_facts == []

    # 2. Successful confirmation response
    confirm_res = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="Haan, mujhe allergy hai",
        responder_role=ParticipantRole.PATIENT,
    )

    assert confirm_res.outcome == ConfirmationOutcome.CONFIRMED
    assert confirm_res.state == TurnState.SPEAKING
    assert confirm_res.unresolved is False
    assert len(confirm_res.verified_facts) == 1

    vf = confirm_res.verified_facts[0]
    assert vf.category == CriticalFactCategory.ALLERGY.value
    assert vf.source_wording == source_text  # Original source preserved
    assert confirm_res.speech_output == result.turn.translated_text


# ---------------------------------------------------------------------------
# 3. Medicine Confirmation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_3_medicine_confirmation(orchestrator: AgentOrchestrator) -> None:
    """Medicine statement enters CONFIRMING and yields VerifiedFact upon confirmation."""
    session_id = uuid4()
    source_text = "I am taking metformin daily"
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.DOCTOR,
        source_text=source_text,
        source_language=LanguageCode.ENGLISH,
    )

    assert result.decision == AgentDecision.CONFIRM
    assert result.state == TurnState.CONFIRMING
    assert result.is_paused_for_confirmation is True

    confirm_res = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="Yes that is right",
        responder_role=ParticipantRole.DOCTOR,
    )

    assert confirm_res.outcome == ConfirmationOutcome.CONFIRMED
    assert len(confirm_res.verified_facts) >= 1
    assert any(vf.category == CriticalFactCategory.MEDICINE.value for vf in confirm_res.verified_facts)


# ---------------------------------------------------------------------------
# 4. Dosage Confirmation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_4_dosage_confirmation(orchestrator: AgentOrchestrator) -> None:
    """Dosage statement triggers confirmation and verifies upon affirmative answer."""
    session_id = uuid4()
    source_text = "Take 500mg twice a day"
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.DOCTOR,
        source_text=source_text,
        source_language=LanguageCode.ENGLISH,
    )

    assert result.decision == AgentDecision.CONFIRM
    assert result.state == TurnState.CONFIRMING

    confirm_res = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="Correct",
        responder_role=ParticipantRole.PATIENT,
    )

    assert confirm_res.outcome == ConfirmationOutcome.CONFIRMED
    assert any(vf.category == CriticalFactCategory.DOSAGE.value for vf in confirm_res.verified_facts)


# ---------------------------------------------------------------------------
# 5. Negation Confirmation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_5_negation_confirmation(orchestrator: AgentOrchestrator) -> None:
    """Negated clinical statement requires confirmation and preserves negation."""
    session_id = uuid4()
    source_text = "I do not have any penicillin allergy"
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text=source_text,
        source_language=LanguageCode.ENGLISH,
    )

    assert result.decision == AgentDecision.CONFIRM
    assert result.state == TurnState.CONFIRMING

    confirm_res = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="Yes, confirmed",
        responder_role=ParticipantRole.PATIENT,
    )

    assert confirm_res.outcome == ConfirmationOutcome.CONFIRMED
    assert confirm_res.verified_facts[0].source_wording == source_text


# ---------------------------------------------------------------------------
# 6. Ambiguous Confirmation (Retry Once, then UNRESOLVED)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_6_ambiguous_confirmation_retry_and_unresolved(orchestrator: AgentOrchestrator) -> None:
    """Ambiguous response asks once more; if still ambiguous, moves to UNRESOLVED without guessing intent."""
    session_id = uuid4()
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="I think I take metformin",
        source_language=LanguageCode.ENGLISH,
    )

    assert result.state == TurnState.CONFIRMING

    # Attempt 1: Ambiguous answer ("maybe") -> Ask once more
    step1 = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="maybe",
        responder_role=ParticipantRole.PATIENT,
    )

    assert step1.outcome == ConfirmationOutcome.AMBIGUOUS
    assert step1.state == TurnState.CONFIRMING  # Remains in CONFIRMING for retry
    assert step1.verified_facts == []
    assert step1.prompt_text is not None
    assert "YES to confirm or NO to reject" in step1.prompt_text

    # Attempt 2: Still ambiguous ("not sure") -> UNRESOLVED
    step2 = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="I am not sure",
        responder_role=ParticipantRole.PATIENT,
    )

    assert step2.outcome == ConfirmationOutcome.UNRESOLVED
    assert step2.state == TurnState.UNRESOLVED
    assert step2.unresolved is True
    assert step2.verified_facts == []
    assert step2.speech_output is None


# ---------------------------------------------------------------------------
# 7. Failed Confirmation (Rejection)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_7_failed_confirmation_rejected(orchestrator: AgentOrchestrator) -> None:
    """Rejected confirmation leads to UNRESOLVED state with zero verified facts."""
    session_id = uuid4()
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="Mujhe amoxicillin allergy hai.",
        source_language=LanguageCode.HINDI,
    )

    assert result.state == TurnState.CONFIRMING

    confirm_res = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="Nahi, galat hai",
        responder_role=ParticipantRole.PATIENT,
    )

    assert confirm_res.outcome == ConfirmationOutcome.REJECTED
    assert confirm_res.state == TurnState.UNRESOLVED
    assert confirm_res.unresolved is True
    assert confirm_res.verified_facts == []
    assert result.turn.verified_facts == []


# ---------------------------------------------------------------------------
# 8. Needs Repetition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_8_needs_repetition(orchestrator: AgentOrchestrator) -> None:
    """Low confidence on critical term triggers NEEDS_REPETITION and repeat prompt."""
    session_id = uuid4()
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="I take paracetamol",
        source_language=LanguageCode.ENGLISH,
        confidence_data={"paracetamol": 0.40},  # Below 0.75 threshold
    )

    assert result.decision == AgentDecision.REPEAT
    assert result.state == TurnState.NEEDS_REPETITION
    assert result.risk_assessment.safety_state == SafetyState.NEEDS_REPETITION
    assert result.is_repeat_requested is True
    assert "repeat" in result.speech_output.lower()
    assert result.turn.processing_status == ProcessingStatus.FAILED


# ---------------------------------------------------------------------------
# 9. Emergency Escalation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_9_emergency_escalation(orchestrator: AgentOrchestrator) -> None:
    """Emergency terms stop ordinary automated interpretation and deliver emergency instruction."""
    session_id = uuid4()
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="I cannot breathe, please hurry!",
        source_language=LanguageCode.ENGLISH,
    )

    assert result.decision == AgentDecision.ESCALATE
    assert result.state == TurnState.ENDED
    assert result.risk_assessment.safety_state == SafetyState.ESCALATE
    assert result.is_escalated is True
    assert "EMERGENCY DETECTED" in result.speech_output
    assert "112 / 911" in result.speech_output

    # Test Hindi emergency as well
    hindi_res = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="Mareez ko saans nahi aa rahi hai.",
        source_language=LanguageCode.HINDI,
    )
    assert hindi_res.decision == AgentDecision.ESCALATE
    assert hindi_res.state == TurnState.ENDED
    assert "आपातकालीन स्थिति" in hindi_res.speech_output



# ---------------------------------------------------------------------------
# 10. Invalid State Transitions
# ---------------------------------------------------------------------------


def test_10_invalid_state_transitions() -> None:
    """State machine strictly prohibits illegal state transitions."""
    sm = TurnStateMachine(initial_state=TurnState.READY)

    # 1. READY cannot jump directly to SPEAKING
    with pytest.raises(InvalidStateTransitionError):
        sm.transition_to(TurnState.SPEAKING)

    # 2. READY cannot jump directly to CONFIRMING
    with pytest.raises(InvalidStateTransitionError):
        sm.transition_to(TurnState.CONFIRMING)

    # 3. ENDED is terminal; cannot transition anywhere
    sm.transition_to(TurnState.ENDED)
    assert sm.is_terminal is True
    with pytest.raises(InvalidStateTransitionError):
        sm.transition_to(TurnState.READY)
    with pytest.raises(InvalidStateTransitionError):
        sm.transition_to(TurnState.LISTENING)


# ---------------------------------------------------------------------------
# 11. Confirmation cannot happen before confirmation-required event
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_11_confirmation_cannot_happen_before_confirmation_required(
    orchestrator: AgentOrchestrator,
) -> None:
    """Attempting confirmation on standard or non-confirming turns raises ConfirmationNotAllowedError."""
    session_id = uuid4()

    # Standard turn
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="Hello",
        source_language=LanguageCode.ENGLISH,
    )

    # Standard turn is in SPEAKING, not CONFIRMING
    with pytest.raises(ConfirmationNotAllowedError):
        orchestrator.handle_confirmation_response(
            turn_id=result.turn.turn_id,
            response_text="yes",
        )

    # Non-existent turn
    with pytest.raises(ConfirmationNotAllowedError):
        orchestrator.handle_confirmation_response(
            turn_id=uuid4(),
            response_text="yes",
        )


# ---------------------------------------------------------------------------
# 12. Critical fact cannot become VERIFIED without successful confirmation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_12_critical_fact_cannot_become_verified_without_confirmation(
    orchestrator: AgentOrchestrator,
) -> None:
    """Critical fact is never marked verified until explicit affirmative confirmation is obtained."""
    session_id = uuid4()
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="Mujhe penicillin se allergy hai.",
        source_language=LanguageCode.HINDI,
    )

    # Before confirmation
    assert len(result.turn.verified_facts) == 0
    assert len(orchestrator.get_session_verified_facts(session_id)) == 0

    # User rejects
    orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="Nahi",
    )

    # After rejection: still zero verified facts
    assert len(result.turn.verified_facts) == 0
    assert len(orchestrator.get_session_verified_facts(session_id)) == 0


# ---------------------------------------------------------------------------
# 13. Unresolved fact remains unresolved
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_13_unresolved_fact_remains_unresolved(orchestrator: AgentOrchestrator) -> None:
    """An unresolved turn stays in UNRESOLVED and cannot be confirmed afterwards."""
    session_id = uuid4()
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="Mujhe insulin ki jarurat hai.",
        source_language=LanguageCode.HINDI,
    )

    # Reject confirmation
    confirm_res = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="no that's wrong",
    )
    assert confirm_res.state == TurnState.UNRESOLVED

    # Further confirmation attempts must fail
    with pytest.raises(ConfirmationNotAllowedError):
        orchestrator.handle_confirmation_response(
            turn_id=result.turn.turn_id,
            response_text="wait, yes",
        )


# ---------------------------------------------------------------------------
# 14. Original source wording is preserved
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_14_original_source_wording_preserved(orchestrator: AgentOrchestrator) -> None:
    """VerifiedFact strictly preserves the exact unaltered original input text."""
    session_id = uuid4()
    original_exact_text = "Mujhe penicillin se BAHUT gambhir allergy hai!"
    result = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text=original_exact_text,
        source_language=LanguageCode.HINDI,
    )

    confirm_res = orchestrator.handle_confirmation_response(
        turn_id=result.turn.turn_id,
        response_text="Haan bilkul",
        responder_role=ParticipantRole.PATIENT,
    )

    assert len(confirm_res.verified_facts) >= 1
    for vf in confirm_res.verified_facts:
        assert vf.source_wording == original_exact_text
    assert result.turn.source_text == original_exact_text



# ---------------------------------------------------------------------------
# Additional Classifier & Edge Case Tests
# ---------------------------------------------------------------------------


def test_confirmation_response_classifier_affirmatives() -> None:
    clf = ConfirmationResponseClassifier
    for phrase in ["yes", "YES", "yeah", "yep", "that's right", "correct", "haan", "haanji", "हाँ", "सही है"]:
        assert clf.classify(phrase) == ConfirmationOutcome.CONFIRMED


def test_confirmation_response_classifier_negatives() -> None:
    clf = ConfirmationResponseClassifier
    for phrase in ["no", "NO", "nope", "incorrect", "wrong", "nahi", "galat hai", "नहीं", "ना"]:
        assert clf.classify(phrase) == ConfirmationOutcome.REJECTED


def test_confirmation_response_classifier_ambiguous() -> None:
    clf = ConfirmationResponseClassifier
    for phrase in ["maybe", "perhaps", "not sure", "shayad", "pata nahi", "random speech here"]:
        assert clf.classify(phrase) == ConfirmationOutcome.AMBIGUOUS


@pytest.mark.asyncio
async def test_session_level_tracking_and_queries(orchestrator: AgentOrchestrator) -> None:
    """Session accurately tracks multiple turns, verified facts, and unresolved turns."""
    session_id = uuid4()

    # Turn 1: Standard turn
    t1 = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.DOCTOR,
        source_text="Hello",
        source_language=LanguageCode.ENGLISH,
    )
    assert t1.decision == AgentDecision.CONTINUE

    # Turn 2: Allergy turn, confirmed
    t2 = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.PATIENT,
        source_text="Mujhe penicillin se allergy hai.",
        source_language=LanguageCode.HINDI,
    )
    assert t2.decision == AgentDecision.CONFIRM
    orchestrator.handle_confirmation_response(
        turn_id=t2.turn.turn_id,
        response_text="Haanji",
        responder_role=ParticipantRole.PATIENT,
    )

    # Turn 3: Dosage turn, rejected
    t3 = await orchestrator.process_turn(
        session_id=session_id,
        role=ParticipantRole.DOCTOR,
        source_text="Take 500mg daily",
        source_language=LanguageCode.ENGLISH,
    )
    assert t3.decision == AgentDecision.CONFIRM
    orchestrator.handle_confirmation_response(
        turn_id=t3.turn.turn_id,
        response_text="No, wrong dose",
        responder_role=ParticipantRole.PATIENT,
    )

    # Query session data
    session_turns = orchestrator.get_session_turns(session_id)
    assert len(session_turns) == 3
    assert [t.turn_id for t in session_turns] == [t1.turn.turn_id, t2.turn.turn_id, t3.turn.turn_id]

    verified = orchestrator.get_session_verified_facts(session_id)
    assert len(verified) >= 1
    assert any(vf.category == CriticalFactCategory.ALLERGY.value for vf in verified)

    unresolved = orchestrator.get_session_unresolved_turns(session_id)
    assert unresolved == [t3.turn.turn_id]


def test_turn_state_machine_history_and_terminal() -> None:
    """TurnStateMachine preserves audit history and flags terminal states correctly."""
    sm = TurnStateMachine(initial_state=TurnState.READY)
    assert sm.current_state == TurnState.READY
    assert sm.is_terminal is False

    sm.transition_to(TurnState.LISTENING, reason="Audio started")
    sm.transition_to(TurnState.PROCESSING, reason="Transcript arrived")
    sm.transition_to(TurnState.SPEAKING, reason="Translation ready")
    sm.transition_to(TurnState.READY, reason="Speech output complete")
    sm.transition_to(TurnState.ENDED, reason="Session concluded")

    assert sm.is_terminal is True
    assert len(sm.history) == 5
    assert sm.history[0].from_state == TurnState.READY
    assert sm.history[0].to_state == TurnState.LISTENING
    assert sm.history[0].reason == "Audio started"
    assert sm.history[-1].to_state == TurnState.ENDED


def test_allergy_prompt_clean_formatting() -> None:
    """Allergy confirmation prompts must avoid ungrammatical phrasing like 'allergy to allergic'."""
    # Generic allergy terms
    for term in ["allergic", "allergy", "allergies", "an allergy"]:
        prompt_en = build_confirmation_prompt(term, CriticalFactCategory.ALLERGY, LanguageCode.ENGLISH)
        assert prompt_en == "Did you say you have an allergy? Please confirm with yes or no."
        assert "allergy to allergic" not in prompt_en
        assert "allergy to allergy" not in prompt_en

    # Hindi generic terms
    for term in ["एलर्जी", "allergy", "allergic"]:
        prompt_hi = build_confirmation_prompt(term, CriticalFactCategory.ALLERGY, LanguageCode.HINDI)
        assert "क्या आपको एलर्जी है? कृपया हाँ या नहीं में पुष्टि करें।" in prompt_hi

    # Specific allergen terms with redundant suffix
    prompt_pen = build_confirmation_prompt("penicillin allergy", CriticalFactCategory.ALLERGY, LanguageCode.ENGLISH)
    assert prompt_pen == "Did you say you have an allergy to penicillin? Please confirm with yes or no."


