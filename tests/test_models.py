"""Foundational domain model validation tests."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from sahayak.domain import (
    Confirmation,
    ConfirmationOutcome,
    Participant,
    ParticipantRole,
    RiskAssessment,
    SafetyState,
    Session,
    SessionRecord,
    SessionStatus,
    Turn,
    VerifiedFact,
)


def test_session_and_participant_validation() -> None:
    session_id = uuid4()
    created_at = datetime.now(timezone.utc)
    participant = Participant(session_id=session_id, role=ParticipantRole.DOCTOR)
    session = Session(
        session_id=session_id,
        created_at=created_at,
        participants=[participant],
    )
    assert session.status == SessionStatus.CREATED
    assert session.doctor_language.value == "en"
    assert session.patient_language.value == "hi"
    assert session.participants[0].role == ParticipantRole.DOCTOR


def test_turn_requires_source_text() -> None:
    with pytest.raises(ValidationError):
        Turn(session_id=uuid4(), role=ParticipantRole.PATIENT)  # type: ignore[call-arg]


def test_risk_assessment_and_confirmation_models() -> None:
    turn_id = uuid4()
    timestamp = datetime.now(timezone.utc)
    assessment = RiskAssessment(
        turn_id=turn_id,
        matched_term="penicillin",
        category="allergy",
        safety_state=SafetyState.NEEDS_CONFIRMATION,
        rule_id="allergy-term",
        reason="Configured allergy term matched",
    )
    confirmation = Confirmation(
        turn_id=turn_id,
        prompt_text="Kripya pushti karein: kya aapko penicillin se allergy hai?",
        timestamp=timestamp,
    )
    assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
    assert confirmation.outcome == ConfirmationOutcome.PENDING


def test_verified_fact_and_session_record() -> None:
    turn_id = uuid4()
    fact_id = uuid4()
    confirmation_id = uuid4()
    session_id = uuid4()
    generated_at = datetime.now(timezone.utc)
    fact = VerifiedFact(
        fact_id=fact_id,
        turn_id=turn_id,
        category="allergy",
        source_wording="Mujhe penicillin se allergy hai.",
        translated_wording="I have a penicillin allergy.",
        confirmation_id=confirmation_id,
    )
    record = SessionRecord(
        session_id=session_id,
        ordered_turn_ids=[turn_id],
        verified_fact_ids=[fact.fact_id],
        unresolved_turn_ids=[],
        generated_at=generated_at,
    )
    assert record.verified_fact_ids == [fact_id]
    assert fact.category == "allergy"


def test_invalid_role_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Participant(session_id=uuid4(), role="interpreter")  # type: ignore[arg-type]
