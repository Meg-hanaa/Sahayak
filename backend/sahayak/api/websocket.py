"""WebSocket transport placeholder for future session communication."""

from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def session_socket(websocket: WebSocket) -> None:
    """Accept a connection and acknowledge messages.

    Session protocol, audio streaming, and agent events belong to later phases.
    """

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
