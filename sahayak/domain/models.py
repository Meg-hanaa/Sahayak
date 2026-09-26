"""Foundational Pydantic models. Business workflows belong to later phases."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from sahayak.domain.enums import (
    ConfirmationOutcome,
    ConnectionStatus,
    LanguageCode,
    MicrophoneStatus,
    ParticipantRole,
    ProcessingStatus,
    SafetyState,
    SessionStatus,
)


class Participant(BaseModel):
    """A doctor or patient attached to a consultation session."""

    participant_id: UUID = Field(default_factory=uuid4)
    session_id: UUID
    role: ParticipantRole
    connection_status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    microphone_status: MicrophoneStatus = MicrophoneStatus.UNKNOWN


class AccessGrant(BaseModel):
    """Server-issued, role-bound credential for short-lived session access."""

    token_hash: str
    session_id: UUID
    role: ParticipantRole
    expires_at: datetime
    joined: bool = False


class Turn(BaseModel):
    """One spoken conversational turn awaiting later pipeline processing."""

    turn_id: UUID = Field(default_factory=uuid4)
    session_id: UUID
    role: ParticipantRole
    source_text: str
    translated_text: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    processing_status: ProcessingStatus = ProcessingStatus.PENDING
    confidence_data: dict[str, float] | None = None


class RiskAssessment(BaseModel):
    """Safety classification attached to a turn (rules applied in later phases)."""

    turn_id: UUID
    matched_term: str | None = None
    category: str | None = None
    safety_state: SafetyState
    rule_id: str | None = None
    reason: str | None = None


class Confirmation(BaseModel):
    """A pending or completed confirmation of a critical or uncertain fact."""

    confirmation_id: UUID = Field(default_factory=uuid4)
    turn_id: UUID
    prompt_text: str
    response_text: str | None = None
    responder_role: ParticipantRole | None = None
    outcome: ConfirmationOutcome = ConfirmationOutcome.PENDING
    timestamp: datetime


class VerifiedFact(BaseModel):
    """A fact that has passed explicit confirmation."""

    fact_id: UUID = Field(default_factory=uuid4)
    turn_id: UUID
    category: str
    source_wording: str
    translated_wording: str
    confirmation_id: UUID


class Session(BaseModel):
    """A two-participant English-Hindi consultation session."""

    session_id: UUID = Field(default_factory=uuid4)
    status: SessionStatus = SessionStatus.CREATED
    created_at: datetime
    doctor_language: LanguageCode = LanguageCode.ENGLISH
    patient_language: LanguageCode = LanguageCode.HINDI
    retention_expires_at: datetime | None = None
    participants: list[Participant] = Field(default_factory=list)


class SessionRecord(BaseModel):
    """Bilingual session record skeleton assembled after a consultation ends."""

    session_id: UUID
    ordered_turn_ids: list[UUID] = Field(default_factory=list)
    verified_fact_ids: list[UUID] = Field(default_factory=list)
    unresolved_turn_ids: list[UUID] = Field(default_factory=list)
    generated_at: datetime
