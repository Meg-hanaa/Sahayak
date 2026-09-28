"""Session create, join, retrieve, and end APIs."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from sahayak.api.deps import (
    get_session_record_service,
    get_session_service,
    require_access_token,
)
from sahayak.api.errors import InvalidRoleError
from sahayak.api.schemas import (
    AccessTokenResponse,
    CreateSessionResponse,
    JoinSessionRequest,
    JoinSessionResponse,
    ParticipantResponse,
    SessionAccessResponse,
    SessionResponse,
)
from sahayak.domain.enums import ParticipantRole
from sahayak.domain.models import Participant, Session, SessionRecord
from sahayak.services.record import SessionRecordService
from sahayak.services.sessions import JOINABLE_ROLES, SessionService

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _participant_response(participant: Participant) -> ParticipantResponse:
    return ParticipantResponse(
        participant_id=participant.participant_id,
        role=participant.role,
        connection_status=participant.connection_status,
        microphone_status=participant.microphone_status,
    )


def _session_response(session: Session) -> SessionResponse:
    if session.retention_expires_at is None:
        raise RuntimeError("Session is missing retention_expires_at")
    return SessionResponse(
        session_id=session.session_id,
        status=session.status,
        created_at=session.created_at,
        doctor_language=session.doctor_language,
        patient_language=session.patient_language,
        retention_expires_at=session.retention_expires_at,
        participants=[_participant_response(item) for item in session.participants],
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreateSessionResponse)
async def create_session(service: Annotated[SessionService, Depends(get_session_service)]) -> CreateSessionResponse:
    created = service.create_session()
    return CreateSessionResponse(
        session=_session_response(created.session),
        access=SessionAccessResponse(
            doctor=AccessTokenResponse(
                role=ParticipantRole.DOCTOR,
                token=created.doctor_token,
                expires_at=created.token_expires_at,
            ),
            patient=AccessTokenResponse(
                role=ParticipantRole.PATIENT,
                token=created.patient_token,
                expires_at=created.token_expires_at,
            ),
        ),
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    service: Annotated[SessionService, Depends(get_session_service)],
    token: Annotated[str, Depends(require_access_token)],
) -> SessionResponse:
    return _session_response(service.get_session(session_id, token))


@router.post("/{session_id}/join", response_model=JoinSessionResponse)
async def join_session(
    session_id: UUID,
    payload: JoinSessionRequest,
    service: Annotated[SessionService, Depends(get_session_service)],
) -> JoinSessionResponse:
    if payload.role is not None and payload.role not in JOINABLE_ROLES:
        raise InvalidRoleError("Only doctor and patient roles may join a consultation")
    session, participant = service.join_session(
        session_id,
        payload.token,
        role=payload.role,
        microphone_status=payload.microphone_status,
    )
    return JoinSessionResponse(session=_session_response(session), participant=_participant_response(participant))


@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: UUID,
    service: Annotated[SessionService, Depends(get_session_service)],
    token: Annotated[str, Depends(require_access_token)],
) -> SessionResponse:
    return _session_response(service.end_session(session_id, token))


@router.get("/{session_id}/record", response_model=SessionRecord)
async def get_session_record(
    session_id: UUID,
    service: Annotated[SessionService, Depends(get_session_service)],
    record_service: Annotated[SessionRecordService, Depends(get_session_record_service)],
    token: Annotated[str, Depends(require_access_token)],
) -> SessionRecord:
    """Retrieve the final bilingual session record for an authorized session."""
    session = service.get_session(session_id, token)
    return record_service.generate_session_record(session.session_id)
