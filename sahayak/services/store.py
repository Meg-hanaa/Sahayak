"""In-memory session and access-token storage."""

from __future__ import annotations

from uuid import UUID

from sahayak.domain.models import AccessGrant, Session


class InMemorySessionStore:
    """Process-local store suitable for the hackathon MVP."""

    def __init__(self) -> None:
        self._sessions: dict[UUID, Session] = {}
        self._grants: dict[str, AccessGrant] = {}

    def add_session(self, session: Session) -> None:
        self._sessions[session.session_id] = session

    def get_session(self, session_id: UUID) -> Session | None:
        return self._sessions.get(session_id)

    def add_grant(self, grant: AccessGrant) -> None:
        self._grants[grant.token_hash] = grant

    def get_grant(self, token_hash: str) -> AccessGrant | None:
        return self._grants.get(token_hash)

    def session_ids(self) -> list[UUID]:
        return list(self._sessions.keys())

    def delete_session(self, session_id: UUID) -> None:
        self._sessions.pop(session_id, None)
        to_del = [h for h, g in self._grants.items() if g.session_id == session_id]
        for h in to_del:
            self._grants.pop(h, None)

