"""WebSocket transport for session communication."""

from __future__ import annotations

import logging
import json
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException, status

from sahayak.api.errors import SahayakError
from sahayak.domain.enums import ParticipantRole
from sahayak.services.routing import SessionConnectionManager, TwoParticipantRouter
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
    """Identify the participant from a server-issued token and route real-time events."""

    service: SessionService = websocket.app.state.session_service
    router_service: TwoParticipantRouter = websocket.app.state.router
    conn_mgr: SessionConnectionManager = websocket.app.state.connection_manager

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
    buffered = conn_mgr.register_connection(session.session_id, participant, websocket)
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

    # Deliver any buffered events held during temporary disconnection
    for event in buffered:
        await websocket.send_json(event.to_client_dict())

    try:
        while True:
            raw_message = await websocket.receive_text()
            data = None
            try:
                data = json.loads(raw_message)
            except Exception:
                data = None

            if isinstance(data, dict):
                msg_type = data.get("type")
                if msg_type == "speech":
                    text = data.get("text", "")
                    conf = data.get("confidence_data")
                    if participant.role == ParticipantRole.DOCTOR:
                        await router_service.handle_doctor_speech(session.session_id, text, conf)
                    else:
                        await router_service.handle_patient_speech(session.session_id, text, conf)
                    continue
                elif msg_type == "confirmation_response":
                    turn_id_str = data.get("turn_id")
                    resp = data.get("response", "")
                    if turn_id_str:
                        await router_service.handle_confirmation_response(
                            session.session_id, UUID(turn_id_str), resp, participant.role
                        )
                    continue

            # Standard ack for text/ping messages
            await websocket.send_json(
                {
                    "type": "ack",
                    "role": participant.role.value,
                    "received": raw_message,
                }
            )
    except WebSocketDisconnect:
        logger.info("Session WebSocket disconnected", extra={"extra_fields": {"role": participant.role.value}})
    finally:
        conn_mgr.remove_connection(session.session_id, participant.role, websocket)
        service.mark_disconnected(participant)

