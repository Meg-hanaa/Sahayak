"""Recipient validation and cross-role leakage protection — Phase 6."""

from __future__ import annotations

import copy
from typing import Any

from sahayak.domain.enums import ParticipantRole
from sahayak.domain.routing import OutboundEvent, OutboundEventType
from sahayak.services.routing.errors import CrossRoleLeakageError, InvalidRecipientError

# Internal metadata keys that must never leak to the patient
_SENSITIVE_INTERNAL_KEYS: frozenset[str] = frozenset({
    "rule_id",
    "rule_name",
    "internal_reason",
    "confidence_data",
    "confidence_weights",
    "facts_breakdown",
    "debug_info",
    "token_hash",
})

# Events that are doctor-only and forbidden to route to the patient
_DOCTOR_ONLY_EVENT_TYPES: frozenset[OutboundEventType] = frozenset({
    OutboundEventType.VERIFIED_FACT,
})


class RecipientValidator:
    """Validates destinations and prevents accidental cross-role information leakage."""

    @classmethod
    def validate_recipient(cls, event: OutboundEvent, target_role: ParticipantRole) -> None:
        """Ensure an event is legally routable to the specified target role.

        Raises:
            CrossRoleLeakageError: if event.recipient_role != target_role.
            InvalidRecipientError: if event violates role policy (e.g. verified facts to patient).
        """
        if event.recipient_role != target_role:
            raise CrossRoleLeakageError(
                f"Cross-role leakage detected: event {event.event_id} is destined for "
                f"{event.recipient_role.value!r}, but attempted delivery to {target_role.value!r}"
            )

        if target_role == ParticipantRole.PATIENT and event.event_type in _DOCTOR_ONLY_EVENT_TYPES:
            raise InvalidRecipientError(
                f"Event type {event.event_type.value!r} is doctor-only and cannot be routed to a patient"
            )

    @classmethod
    def sanitize_for_patient(cls, event: OutboundEvent) -> OutboundEvent:
        """Strip internal backend metadata and doctor-only fields before delivery to patient."""
        if event.recipient_role != ParticipantRole.PATIENT:
            return event

        sanitized_payload: dict[str, Any] = {}
        for k, v in event.payload.items():
            if k.lower() not in _SENSITIVE_INTERNAL_KEYS:
                sanitized_payload[k] = copy.deepcopy(v)

        # Build clean sanitized event
        return OutboundEvent(
            event_id=event.event_id,
            event_type=event.event_type,
            session_id=event.session_id,
            recipient_role=event.recipient_role,
            recipient_id=event.recipient_id,
            sender_role=event.sender_role,
            timestamp=event.timestamp,
            payload=sanitized_payload,
            metadata={},  # Strip any internal metadata dictionary
        )
