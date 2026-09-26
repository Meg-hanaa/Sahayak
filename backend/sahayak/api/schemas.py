"""HTTP schemas for session management."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from sahayak.domain.enums import ConnectionStatus, LanguageCode, MicrophoneStatus, ParticipantRole, SessionStatus


class ParticipantResponse(BaseModel):
    participant_id: UUID
    role: ParticipantRole
    connection_status: ConnectionStatus
    microphone_status: MicrophoneStatus


class SessionResponse(BaseModel):
    session_id: UUID
    status: SessionStatus
    created_at: datetime
    doctor_language: LanguageCode
    patient_language: LanguageCode
    retention_expires_at: datetime
    participants: list[ParticipantResponse] = Field(default_factory=list)


class AccessTokenResponse(BaseModel):
    role: ParticipantRole
    token: str
    expires_at: datetime


class SessionAccessResponse(BaseModel):
    doctor: AccessTokenResponse
    patient: AccessTokenResponse


class CreateSessionResponse(BaseModel):
    session: SessionResponse
    access: SessionAccessResponse


class JoinSessionRequest(BaseModel):
    token: str = Field(min_length=1)
    role: ParticipantRole | None = None
    microphone_status: MicrophoneStatus | None = None


class JoinSessionResponse(BaseModel):
    session: SessionResponse
    participant: ParticipantResponse
