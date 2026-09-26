"""WebSocket transport for session communication."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException, status

from sahayak.api.errors import SahayakError
from sahayak.services.sessions import SessionService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def session_socket(websocket: WebSocket) -> None:
    """Generic transport placeholder. Role-aware session sockets use `/ws/sessions/{id}`."""

    await websocket.accept()
    await websocket.send_json(
        {
            "type": "connected",
            "service": "sahayak",
            "message": "WebSocket transport placeholder is ready",
        }
    )
    try:
        while True:
            message = await websocket.receive_text()
            await websocket.send_json({"type": "ack", "received": message})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")


@router.websocket("/ws/sessions/{session_id}")
async def consultation_socket(websocket: WebSocket, session_id: str) -> None:
    """Identify the participant from a server-issued token. Streaming belongs to later phases."""

    service: SessionService = websocket.app.state.session_service
    token = websocket.query_params.get("token") or websocket.headers.get("x-sahayak-access-token")
    try:
        parsed_session_id = UUID(session_id)
        session, participant = service.authenticate_socket(parsed_session_id, token or "")
    except (SahayakError, ValueError) as exc:
        code = status.WS_1008_POLICY_VIOLATION
        if isinstance(exc, SahayakError) and exc.status_code == 404:
            code = status.WS_1008_POLICY_VIOLATION
        raise WebSocketException(code=code) from exc

    await websocket.accept()
    service.mark_connected(participant)
    await websocket.send_json(
        {
            "type": "connected",
            "service": "sahayak",
            "session_id": str(session.session_id),
            "participant_id": str(participant.participant_id),
            "role": participant.role.value,
        }
    )
    try:
        while True:
            message = await websocket.receive_text()
            await websocket.send_json(
                {
                    "type": "ack",
                    "role": participant.role.value,
                    "received": message,
                }
            )
    except WebSocketDisconnect:
        logger.info("Session WebSocket disconnected", extra={"extra_fields": {"role": participant.role.value}})
    finally:
        service.mark_disconnected(participant)
