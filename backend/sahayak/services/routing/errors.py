"""Routing error types — Phase 6."""

from __future__ import annotations

from sahayak.api.errors import SahayakError


class InvalidRecipientError(SahayakError):
    """Raised when an event is targeted at an illegal or unsupported recipient."""

    def __init__(self, message: str = "Invalid event recipient") -> None:
        super().__init__(message, code="invalid_recipient", status_code=400)


class CrossRoleLeakageError(SahayakError):
    """Raised when an event destined for one role is attempted to be delivered to another."""

    def __init__(self, message: str = "Cross-role message leakage detected and blocked") -> None:
        super().__init__(message, code="cross_role_leakage", status_code=403)


class ParticipantNotConnectedError(SahayakError):
    """Raised when an immediate transmission is attempted to a disconnected participant."""

    def __init__(self, message: str = "Participant is not connected") -> None:
        super().__init__(message, code="participant_not_connected", status_code=404)
