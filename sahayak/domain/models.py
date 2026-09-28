"""Foundational Pydantic models. Business workflows belong to later phases."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from typing import Any

from pydantic import BaseModel, Field

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
from sahayak.domain.safety import CriticalFact


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
    source_language: LanguageCode | None = None
    target_language: LanguageCode | None = None
    state: TurnState = TurnState.READY
    decision: AgentDecision | None = None
    risk_assessment: RiskAssessment | None = None
    confirmation: Confirmation | None = None
    verified_facts: list[VerifiedFact] = Field(default_factory=list)
    speech_output_text: str | None = None
    speech_end_time: datetime | None = None
    output_start_time: datetime | None = None
    latency_ms: float | None = None
    retry_count: int = 0
    error_message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RiskAssessment(BaseModel):
    """Safety classification attached to a turn (rules applied in later phases)."""

    turn_id: UUID
    matched_term: str | None = None
    category: str | None = None
    safety_state: SafetyState
    rule_id: str | None = None
    reason: str | None = None
    facts: list[CriticalFact] = Field(default_factory=list)


class Confirmation(BaseModel):
    """A pending or completed confirmation of a critical or uncertain fact."""

    confirmation_id: UUID = Field(default_factory=uuid4)
    turn_id: UUID
    prompt_text: str
    response_text: str | None = None
    responder_role: ParticipantRole | None = None
    outcome: ConfirmationOutcome = ConfirmationOutcome.PENDING
    timestamp: datetime
    attempt_count: int = 1
    metadata: dict[str, Any] = Field(default_factory=dict)


class VerifiedFact(BaseModel):
    """A fact that has passed explicit confirmation."""

    fact_id: UUID = Field(default_factory=uuid4)
    turn_id: UUID
    category: str
    source_wording: str
    translated_wording: str
    confirmation_id: UUID
    verified_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConversationTurnRecord(BaseModel):
    """Preserved conversational turn entry for the final bilingual session record."""

    turn_id: UUID
    speaker_role: ParticipantRole
    source_language: LanguageCode
    target_language: LanguageCode
    source_text: str
    translated_text: str | None = None
    timestamp: datetime
    processing_status: ProcessingStatus
    confidence_data: dict[str, float] | None = None
    safety_state: SafetyState
    speech_end_time: datetime | None = None
    output_start_time: datetime | None = None
    latency_ms: float | None = None
    retry_count: int = 0
    error_message: str | None = None


class VerifiedFactRecord(BaseModel):
    """Immutable verified fact preserving source and translated clinical facts."""

    fact_id: UUID = Field(default_factory=uuid4)
    turn_id: UUID
    category: str
    original_source_wording: str
    translated_wording: str
    confirmation_reference: UUID
    verified_at: datetime

    @property
    def source_wording(self) -> str:
        return self.original_source_wording

    @property
    def confirmation_id(self) -> UUID:
        return self.confirmation_reference


class UnresolvedItem(BaseModel):
    """Unresolved clinical or conversational item preserving original wording and reason."""

    item_id: UUID = Field(default_factory=uuid4)
    turn_id: UUID
    source_wording: str
    category: str | None = None
    reason: str
    timestamp: datetime


class LatencySummary(BaseModel):
    """Latency metrics summary for speech-end to output-start."""

    sample_count: int = 0
    min_seconds: float | None = None
    max_seconds: float | None = None
    median_seconds: float | None = None
    p95_seconds: float | None = None
    target_met: bool = False


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
    """Comprehensive bilingual session record assembled after a consultation ends."""

    session_id: UUID
    ordered_turn_ids: list[UUID] = Field(default_factory=list)
    verified_fact_ids: list[UUID] = Field(default_factory=list)
    unresolved_turn_ids: list[UUID] = Field(default_factory=list)
    generated_at: datetime
    conversation: list[ConversationTurnRecord] = Field(default_factory=list)
    verified_facts: list[VerifiedFactRecord] = Field(default_factory=list)
    unresolved_items: list[UnresolvedItem] = Field(default_factory=list)
    latency_metrics: LatencySummary | None = None

