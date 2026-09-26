"""Role-aware session WebSocket tests."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.test_sessions import _create


def _join(client: TestClient, session_id: str, token: str, role: str | None = None) -> None:
    payload = {"token": token}
    if role is not None:
        payload["role"] = role
    response = client.post(f"/api/sessions/{session_id}/join", json=payload)
    assert response.status_code == 200, response.text


def test_websocket_identifies_doctor_role(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    token = created["access"]["doctor"]["token"]
    _join(client, session_id, token, "doctor")
    with client.websocket_connect(f"/ws/sessions/{session_id}?token={token}") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "connected"
        assert message["role"] == "doctor"
        assert message["session_id"] == session_id
        assert message["participant_id"]
        websocket.send_text("ping")
        ack = websocket.receive_json()
        assert ack["role"] == "doctor"
        assert ack["received"] == "ping"


def test_websocket_identifies_patient_role(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    token = created["access"]["patient"]["token"]
    _join(client, session_id, token, "patient")
    with client.websocket_connect(f"/ws/sessions/{session_id}?token={token}") as websocket:
        message = websocket.receive_json()
        assert message["role"] == "patient"
        assert message["session_id"] == session_id


def test_websocket_does_not_trust_client_supplied_role(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    token = created["access"]["patient"]["token"]
    _join(client, session_id, token)
    with client.websocket_connect(f"/ws/sessions/{session_id}?token={token}&role=doctor") as websocket:
        message = websocket.receive_json()
        assert message["role"] == "patient"


def test_unauthorized_websocket_access_is_rejected(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    with pytest.raises(Exception) as exc_info:
        with client.websocket_connect(f"/ws/sessions/{session_id}"):
            pytest.fail("WebSocket connected without a token")
    assert exc_info.type.__name__ in {
        "WebSocketDenialResponse",
        "WebSocketDisconnect",
        "WebSocketException",
    }


def test_invalid_websocket_token_is_rejected(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    with pytest.raises(Exception) as exc_info:
        with client.websocket_connect(f"/ws/sessions/{session_id}?token=forged-token"):
            pytest.fail("WebSocket connected with a forged token")
    assert exc_info.type.__name__ in {
        "WebSocketDenialResponse",
        "WebSocketDisconnect",
        "WebSocketException",
    }


def test_websocket_for_unknown_session_is_rejected(client: TestClient) -> None:
    with pytest.raises(Exception) as exc_info:
        with client.websocket_connect(f"/ws/sessions/{uuid4()}?token=anything"):
            pytest.fail("WebSocket connected to a missing session")
    assert exc_info.type.__name__ in {
        "WebSocketDenialResponse",
        "WebSocketDisconnect",
        "WebSocketException",
    }


def test_websocket_requires_join_before_connect(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    token = created["access"]["doctor"]["token"]
    with pytest.raises(Exception) as exc_info:
        with client.websocket_connect(f"/ws/sessions/{session_id}?token={token}"):
            pytest.fail("WebSocket connected before join")
    assert exc_info.type.__name__ in {
        "WebSocketDenialResponse",
        "WebSocketDisconnect",
        "WebSocketException",
    }


def test_websocket_rejected_after_session_ended(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    token = created["access"]["doctor"]["token"]
    _join(client, session_id, token, "doctor")
    end = client.post(f"/api/sessions/{session_id}/end", headers={"Authorization": f"Bearer {token}"})
    assert end.status_code == 200
    with pytest.raises(Exception) as exc_info:
        with client.websocket_connect(f"/ws/sessions/{session_id}?token={token}"):
            pytest.fail("WebSocket connected to an ended session")
    assert exc_info.type.__name__ in {
        "WebSocketDenialResponse",
        "WebSocketDisconnect",
        "WebSocketException",
    }
