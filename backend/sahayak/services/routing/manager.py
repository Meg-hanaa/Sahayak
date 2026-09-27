"""Connection management and event buffering for two-participant sessions — Phase 6."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import WebSocket

from sahayak.domain.enums import ConnectionStatus, ParticipantRole
from sahayak.domain.models import Participant
from sahayak.domain.routing import OutboundEvent

logger = logging.getLogger(__name__)

# Maximum number of buffered events per participant during disconnection
_MAX_BUFFERED_EVENTS = 50


class SessionConnectionManager:
    """Manages role-bound WebSockets and reconnection buffering for sessions."""

    def __init__(self) -> None:
        # session_id -> {ParticipantRole: WebSocket}
        self._connections: dict[UUID, dict[ParticipantRole, WebSocket]] = defaultdict(dict)
        # session_id -> {ParticipantRole: Participant}
        self._participants: dict[UUID, dict[ParticipantRole, Participant]] = defaultdict(dict)
        # session_id -> {ParticipantRole: list[OutboundEvent]}
        self._event_buffers: dict[UUID, dict[ParticipantRole, list[OutboundEvent]]] = defaultdict(
            lambda: defaultdict(list)
        )

    def register_connection(
        self,
        session_id: UUID,
        participant: Participant,
        websocket: WebSocket,
    ) -> list[OutboundEvent]:
        """Register a new or reconnected participant WebSocket.

        Returns:
            Any pending buffered events queued during disconnection.
        """
        role = participant.role
        existing = self._connections[session_id].get(role)

        if existing is not None and existing != websocket:
            logger.info(
                "Replacing existing WebSocket connection for role %s in session %s (reconnection)",
                role.value,
                session_id,
            )

        self._connections[session_id][role] = websocket
        self._participants[session_id][role] = participant
        participant.connection_status = ConnectionStatus.CONNECTED

        # Drain any events buffered during disconnection
        buffered = self.drain_buffer(session_id, role)
        return buffered

    def remove_connection(
        self,
        session_id: UUID,
        role: ParticipantRole,
        websocket: WebSocket | None = None,
    ) -> None:
        """Remove a participant's active connection and mark disconnected."""
        current = self._connections[session_id].get(role)
        if websocket is None or current == websocket:
            self._connections[session_id].pop(role, None)
            participant = self._participants[session_id].get(role)
            if participant is not None:
                participant.connection_status = ConnectionStatus.DISCONNECTED

            # Clean up empty session dict
            if not self._connections[session_id]:
                self._connections.pop(session_id, None)

    def get_connection(self, session_id: UUID, role: ParticipantRole) -> WebSocket | None:
        """Retrieve the active WebSocket for a role in a session."""
        return self._connections.get(session_id, {}).get(role)

    def is_connected(self, session_id: UUID, role: ParticipantRole) -> bool:
        """Check whether a participant is actively connected."""
        return self.get_connection(session_id, role) is not None

    def buffer_event(self, event: OutboundEvent) -> None:
        """Queue an undelivered event for a disconnected participant."""
        buf = self._event_buffers[event.session_id][event.recipient_role]
        if len(buf) >= _MAX_BUFFERED_EVENTS:
            buf.pop(0)  # Drop oldest event if buffer is full
        buf.append(event)

    def get_buffer(self, session_id: UUID, role: ParticipantRole) -> list[OutboundEvent]:
        """Inspect buffered events without removing them."""
        return list(self._event_buffers.get(session_id, {}).get(role, []))

    def drain_buffer(self, session_id: UUID, role: ParticipantRole) -> list[OutboundEvent]:
        """Return and clear buffered events for a participant."""
        session_buffers = self._event_buffers.get(session_id, {})
        events = session_buffers.pop(role, [])
        return events

    def clear_session(self, session_id: UUID) -> None:
        """Clean up all connections and buffers for a session."""
        self._connections.pop(session_id, None)
        self._participants.pop(session_id, None)
        self._event_buffers.pop(session_id, None)
