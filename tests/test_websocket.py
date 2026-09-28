"""WebSocket placeholder tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_websocket_connects_and_acknowledges(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        greeting = websocket.receive_json()
        assert greeting["type"] == "connected"
        assert greeting["service"] == "sahayak"
        websocket.send_text("ping")
        ack = websocket.receive_json()
        assert ack == {"type": "ack", "received": "ping"}


def test_websocket_unknown_path_fails(client: TestClient) -> None:
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/session"):
            pass
