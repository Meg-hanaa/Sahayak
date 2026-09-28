"""Shared enumerations for foundational domain models."""

from __future__ import annotations

from enum import Enum


class LanguageCode(str, Enum):
    ENGLISH = "en"
    HINDI = "hi"


class SessionStatus(str, Enum):
    CREATED = "created"
    READY = "ready"
    ACTIVE = "active"
    ENDED = "ended"


class ParticipantRole(str, Enum):
    DOCTOR = "doctor"
    PATIENT = "patient"
    AGENT = "agent"


class ConnectionStatus(str, Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"


class MicrophoneStatus(str, Enum):
    UNKNOWN = "unknown"
    GRANTED = "granted"
    BLOCKED = "blocked"
    MUTED = "muted"


class ProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class SafetyState(str, Enum):
    STANDARD = "standard"
    NEEDS_CONFIRMATION = "needs_confirmation"
    NEEDS_REPETITION = "needs_repetition"
    VERIFIED = "verified"
    UNRESOLVED = "unresolved"
    ESCALATE = "escalate"


class ConfirmationOutcome(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    AMBIGUOUS = "ambiguous"
    UNRESOLVED = "unresolved"


class AgentDecision(str, Enum):
    CONTINUE = "continue"
    CONFIRM = "confirm"
    REPEAT = "repeat"
    ESCALATE = "escalate"


class TurnState(str, Enum):
    READY = "ready"
    LISTENING = "listening"
    PROCESSING = "processing"
    CONFIRMING = "confirming"
    SPEAKING = "speaking"
    NEEDS_REPETITION = "needs_repetition"
    UNRESOLVED = "unresolved"
    ENDED = "ended"


AgentState = TurnState

