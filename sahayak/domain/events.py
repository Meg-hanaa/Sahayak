"""Normalized speech-pipeline events consumed by the rest of the application."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from sahayak.domain.enums import LanguageCode, ParticipantRole


class SpeechEventType(str, Enum):
    PARTIAL_TRANSCRIPT = "partial_transcript"
    FINAL_TRANSCRIPT = "final_transcript"
    PROVIDER_ERROR = "provider_error"
    STREAM_STARTED = "stream_started"
    STREAM_ENDED = "stream_ended"


class SpeechEvent(BaseModel):
    """Provider-agnostic speech event."""

    type: SpeechEventType
    session_id: UUID
    participant_id: UUID
    role: ParticipantRole
    language: LanguageCode
    timestamp: datetime
    transcript: str | None = None
    confidence: float | None = None
    confidence_data: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    def to_websocket_message(self) -> dict[str, Any]:
        return self.model_dump(mode="json")
