"""Domain models and event types for two-participant real-time routing — Phase 6."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from sahayak.domain.enums import LanguageCode, ParticipantRole


class OutboundEventType(str, Enum):
    """Explicit types for all outbound WebSocket events."""

    CONNECTED = "connected"
    ACK = "ack"
    INTERPRETATION = "interpretation"
    CONFIRMATION_PROMPT = "confirmation_prompt"
    VERIFIED_FACT = "verified_fact"
    REPETITION_REQUEST = "repetition_request"
    EMERGENCY_ALERT = "emergency_alert"
    SYSTEM_EVENT = "system_event"
    ERROR = "error"


class OutboundEvent(BaseModel):
    """Normalized outbound WebSocket message with explicit destination metadata."""

    event_id: UUID = Field(default_factory=uuid4)
    event_type: OutboundEventType
    session_id: UUID
    recipient_role: ParticipantRole
    recipient_id: UUID | None = None
    sender_role: ParticipantRole | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

    def to_client_dict(self) -> dict[str, Any]:
        """Serialize event to a dictionary containing explicit routing metadata."""
        data = {
            "event_id": str(self.event_id),
            "type": self.event_type.value,
            "session_id": str(self.session_id),
            "recipient_role": self.recipient_role.value,
            "sender_role": self.sender_role.value if self.sender_role else None,
            "timestamp": self.timestamp.isoformat(),
        }
        data.update(self.payload)
        return data
