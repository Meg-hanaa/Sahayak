"""Session lifecycle: create, join, retrieve, expire, and end."""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from uuid import UUID, uuid4

from sahayak.api.errors import (
    DuplicateParticipantError,
    ForbiddenSessionActionError,
    InvalidAccessTokenError,
    InvalidRoleError,
    InvalidStateTransitionError,
    SessionExpiredError,
    SessionNotFoundError,
)
from sahayak.config import Settings
from sahayak.domain.enums import ConnectionStatus, MicrophoneStatus, ParticipantRole, SessionStatus
from sahayak.domain.models import AccessGrant, Participant, Session
from sahayak.services.clock import Clock, SystemClock
from sahayak.services.store import InMemorySessionStore

JOINABLE_ROLES = frozenset({ParticipantRole.DOCTOR, ParticipantRole.PATIENT})

_ALLOWED_TRANSITIONS: dict[SessionStatus, frozenset[SessionStatus]] = {
    SessionStatus.CREATED: frozenset({SessionStatus.READY, SessionStatus.ENDED}),
    SessionStatus.READY: frozenset({SessionStatus.ACTIVE, SessionStatus.ENDED}),
    SessionStatus.ACTIVE: frozenset({SessionStatus.ENDED}),
    SessionStatus.ENDED: frozenset(),
}


def hash_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_access_token() -> str:
    return secrets.token_urlsafe(32)


class CreatedSession:
    def __init__(self, session: Session, doctor_token: str, patient_token: str, token_expires_at) -> None:
        self.session = session
        self.doctor_token = doctor_token
        self.patient_token = patient_token
        self.token_expires_at = token_expires_at


class SessionService:
    """In-memory consultation session manager."""

    def __init__(
        self,
        store: InMemorySessionStore | None = None,
        settings: Settings | None = None,
        clock: Clock | None = None,
    ) -> None:
        if settings is None:
            raise ValueError("Settings are required")
        self._store = store or InMemorySessionStore()
        self._settings = settings
        self._clock = clock or SystemClock()

    def create_session(self) -> CreatedSession:
        now = self._clock.now()
        session_id = uuid4()
        while self._store.get_session(session_id) is not None:
            session_id = uuid4()

        retention_expires_at = now + timedelta(seconds=self._settings.session_ttl_seconds)
        token_ttl = min(self._settings.join_token_ttl_seconds, self._settings.session_ttl_seconds)
        token_expires_at = now + timedelta(seconds=token_ttl)

        session = Session(
            session_id=session_id,
            status=SessionStatus.CREATED,
            created_at=now,
            doctor_language="en",
            patient_language="hi",
            retention_expires_at=retention_expires_at,
            participants=[],
        )
        self._store.add_session(session)

        doctor_token = generate_access_token()
        patient_token = generate_access_token()
        self._store.add_grant(
            AccessGrant(
                token_hash=hash_access_token(doctor_token),
                session_id=session_id,
                role=ParticipantRole.DOCTOR,
                expires_at=token_expires_at,
            )
        )
        self._store.add_grant(
            AccessGrant(
                token_hash=hash_access_token(patient_token),
                session_id=session_id,
                role=ParticipantRole.PATIENT,
                expires_at=token_expires_at,
            )
        )
        return CreatedSession(session, doctor_token, patient_token, token_expires_at)

    def get_session(self, session_id: UUID, token: str) -> Session:
        session, _grant = self._require_session_access(
            session_id,
            token,
            allow_unjoined=True,
            allow_ended=True,
        )
        return session

    def join_session(
        self,
        session_id: UUID,
        token: str,
        role: ParticipantRole | None = None,
        microphone_status: MicrophoneStatus | None = None,
    ) -> tuple[Session, Participant]:
        session, grant = self._require_session_access(
            session_id,
            token,
            allow_unjoined=True,
            allow_ended=True,
        )
        self._assert_joinable(session)

        if grant.role not in JOINABLE_ROLES:
            raise InvalidRoleError("Only doctor and patient roles may join a consultation")
        if role is not None and role != grant.role:
            raise InvalidRoleError("Requested role does not match the issued access token")
        if role is not None and role not in JOINABLE_ROLES:
            raise InvalidRoleError()

        existing = self._participant_for_role(session, grant.role)
        if existing is not None or grant.joined:
            raise DuplicateParticipantError()

        participant = Participant(
            session_id=session.session_id,
            role=grant.role,
            connection_status=ConnectionStatus.DISCONNECTED,
            microphone_status=microphone_status or MicrophoneStatus.UNKNOWN,
        )
        session.participants.append(participant)
        grant.joined = True
        self._refresh_join_status(session)
        return session, participant

    def end_session(self, session_id: UUID, token: str) -> Session:
        session, grant = self._require_session_access(
            session_id,
            token,
            allow_unjoined=True,
            allow_ended=True,
        )
        if grant.role != ParticipantRole.DOCTOR:
            raise ForbiddenSessionActionError("Only the doctor can end the consultation")
        self._transition(session, SessionStatus.ENDED)
        for participant in session.participants:
            participant.connection_status = ConnectionStatus.DISCONNECTED
        return session

    def authenticate_socket(self, session_id: UUID, token: str) -> tuple[Session, Participant]:
        session, grant = self._require_session_access(
            session_id,
            token,
            allow_unjoined=False,
            allow_ended=False,
        )
        if not grant.joined:
            raise InvalidAccessTokenError()
        participant = self._participant_for_role(session, grant.role)
        if participant is None:
            raise InvalidAccessTokenError()
        return session, participant

    def mark_connected(self, participant: Participant) -> None:
        participant.connection_status = ConnectionStatus.CONNECTED

    def mark_disconnected(self, participant: Participant) -> None:
        participant.connection_status = ConnectionStatus.DISCONNECTED

    def _require_session_access(
        self,
        session_id: UUID,
        token: str,
        *,
        allow_unjoined: bool = False,
        allow_ended: bool = False,
    ) -> tuple[Session, AccessGrant]:
        if not token or not token.strip():
            raise InvalidAccessTokenError()
        session = self._store.get_session(session_id)
        if session is None:
            raise SessionNotFoundError()
        self._expire_if_needed(session)

        grant = self._store.get_grant(hash_access_token(token.strip()))
        if grant is None or grant.session_id != session_id:
            raise InvalidAccessTokenError()
        if grant.expires_at <= self._clock.now():
            raise InvalidAccessTokenError()
        if session.status == SessionStatus.ENDED and not allow_ended:
            raise InvalidStateTransitionError("Session has already ended")
        if not allow_unjoined and not grant.joined:
            raise InvalidAccessTokenError()
        return session, grant

    def _assert_joinable(self, session: Session) -> None:
        if session.status == SessionStatus.ENDED:
            raise InvalidStateTransitionError("Cannot join an ended session")
        if session.status not in {SessionStatus.CREATED, SessionStatus.READY, SessionStatus.ACTIVE}:
            raise InvalidStateTransitionError("Cannot join the session in its current state")

    def _expire_if_needed(self, session: Session) -> None:
        expires_at = session.retention_expires_at
        if expires_at is None:
            return
        if session.status == SessionStatus.ENDED:
            if expires_at <= self._clock.now():
                raise SessionExpiredError()
            return
        if expires_at <= self._clock.now():
            session.status = SessionStatus.ENDED
            raise SessionExpiredError()

    def _refresh_join_status(self, session: Session) -> None:
        roles = {participant.role for participant in session.participants}
        if ParticipantRole.DOCTOR in roles and ParticipantRole.PATIENT in roles:
            if session.status == SessionStatus.CREATED:
                self._transition(session, SessionStatus.READY)

    def _transition(self, session: Session, new_status: SessionStatus) -> None:
        if session.status == new_status:
            raise InvalidStateTransitionError(f"Session is already {session.status.value}")
        allowed = _ALLOWED_TRANSITIONS.get(session.status, frozenset())
        if new_status not in allowed:
            raise InvalidStateTransitionError(
                f"Cannot transition from {session.status.value} to {new_status.value}"
            )
        session.status = new_status

    def _participant_for_role(self, session: Session, role: ParticipantRole) -> Participant | None:
        for participant in session.participants:
            if participant.role == role:
                return participant
        return None
