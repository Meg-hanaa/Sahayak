"""Session create, join, retrieve, expire, and end tests."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from sahayak.domain.enums import SessionStatus
from sahayak.main import create_app
from sahayak.services.clock import FakeClock


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create(client: TestClient) -> dict:
    response = client.post("/api/sessions")
    assert response.status_code == 201, response.text
    return response.json()


def test_session_creation_includes_required_fields(client: TestClient) -> None:
    body = _create(client)
    session = body["session"]
    UUID(session["session_id"])
    assert session["status"] == SessionStatus.CREATED.value
    assert session["created_at"]
    assert session["doctor_language"] == "en"
    assert session["patient_language"] == "hi"
    assert session["retention_expires_at"]
    assert session["participants"] == []
    assert body["access"]["doctor"]["role"] == "doctor"
    assert body["access"]["patient"]["role"] == "patient"
    assert body["access"]["doctor"]["token"] != body["access"]["patient"]["token"]
    assert len(body["access"]["doctor"]["token"]) >= 32


def test_session_ids_are_unique(client: TestClient) -> None:
    ids = {_create(client)["session"]["session_id"] for _ in range(25)}
    assert len(ids) == 25


def test_language_defaults(client: TestClient) -> None:
    session = _create(client)["session"]
    assert session["doctor_language"] == "en"
    assert session["patient_language"] == "hi"


def test_doctor_joining(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    token = created["access"]["doctor"]["token"]
    response = client.post(f"/api/sessions/{session_id}/join", json={"token": token, "role": "doctor"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["participant"]["role"] == "doctor"
    assert body["participant"]["connection_status"] == "disconnected"
    assert body["session"]["status"] == SessionStatus.CREATED.value
    UUID(body["participant"]["participant_id"])


def test_patient_joining_makes_session_ready(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    doctor = client.post(
        f"/api/sessions/{session_id}/join",
        json={"token": created["access"]["doctor"]["token"]},
    )
    patient = client.post(
        f"/api/sessions/{session_id}/join",
        json={"token": created["access"]["patient"]["token"], "role": "patient"},
    )
    assert doctor.status_code == 200
    assert patient.status_code == 200
    assert patient.json()["participant"]["role"] == "patient"
    assert patient.json()["session"]["status"] == SessionStatus.READY.value
    assert len(patient.json()["session"]["participants"]) == 2


def test_invalid_role_rejection(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    unknown = client.post(
        f"/api/sessions/{session_id}/join",
        json={"token": created["access"]["doctor"]["token"], "role": "interpreter"},
    )
    assert unknown.status_code == 422
    agent = client.post(
        f"/api/sessions/{session_id}/join",
        json={"token": created["access"]["doctor"]["token"], "role": "agent"},
    )
    assert agent.status_code == 400
    assert agent.json()["error"]["code"] == "invalid_role"
    mismatch = client.post(
        f"/api/sessions/{session_id}/join",
        json={"token": created["access"]["patient"]["token"], "role": "doctor"},
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["error"]["code"] == "invalid_role"


def test_joining_nonexistent_session(client: TestClient) -> None:
    response = client.post(
        f"/api/sessions/{uuid4()}/join",
        json={"token": "not-a-real-token"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "session_not_found"


def test_duplicate_and_invalid_participant_behavior(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    doctor_token = created["access"]["doctor"]["token"]
    first = client.post(f"/api/sessions/{session_id}/join", json={"token": doctor_token})
    second = client.post(f"/api/sessions/{session_id}/join", json={"token": doctor_token})
    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "duplicate_participant"

    other = _create(client)
    cross = client.post(
        f"/api/sessions/{session_id}/join",
        json={"token": other["access"]["doctor"]["token"]},
    )
    assert cross.status_code == 401
    assert cross.json()["error"]["code"] == "invalid_access_token"


def test_session_retrieval_requires_token(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    missing = client.get(f"/api/sessions/{session_id}")
    assert missing.status_code == 401
    ok = client.get(f"/api/sessions/{session_id}", headers=_auth(created["access"]["doctor"]["token"]))
    assert ok.status_code == 200
    assert ok.json()["session_id"] == session_id


def test_ending_a_session(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    doctor_token = created["access"]["doctor"]["token"]
    client.post(f"/api/sessions/{session_id}/join", json={"token": doctor_token})
    ended = client.post(f"/api/sessions/{session_id}/end", headers=_auth(doctor_token))
    assert ended.status_code == 200
    assert ended.json()["status"] == SessionStatus.ENDED.value
    fetched = client.get(f"/api/sessions/{session_id}", headers=_auth(doctor_token))
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "ended"


def test_patient_cannot_end_session(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    patient_token = created["access"]["patient"]["token"]
    client.post(f"/api/sessions/{session_id}/join", json={"token": patient_token})
    response = client.post(f"/api/sessions/{session_id}/end", headers=_auth(patient_token))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden_session_action"


def test_joining_an_ended_session(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    client.post(f"/api/sessions/{session_id}/end", headers=_auth(created["access"]["doctor"]["token"]))
    response = client.post(
        f"/api/sessions/{session_id}/join",
        json={"token": created["access"]["patient"]["token"]},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_state_transition"


def test_invalid_state_transitions(client: TestClient) -> None:
    created = _create(client)
    session_id = created["session"]["session_id"]
    doctor_token = created["access"]["doctor"]["token"]
    first = client.post(f"/api/sessions/{session_id}/end", headers=_auth(doctor_token))
    second = client.post(f"/api/sessions/{session_id}/end", headers=_auth(doctor_token))
    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "invalid_state_transition"


def test_session_expiration_behavior(settings) -> None:
    clock = FakeClock()
    short = settings.model_copy(update={"session_ttl_seconds": 30, "join_token_ttl_seconds": 30})
    app = create_app(short, clock=clock)
    with TestClient(app) as client:
        created = _create(client)
        session_id = created["session"]["session_id"]
        doctor_token = created["access"]["doctor"]["token"]
        clock.advance(31)
        expired = client.get(f"/api/sessions/{session_id}", headers=_auth(doctor_token))
        assert expired.status_code == 410
        assert expired.json()["error"]["code"] == "session_expired"
        join = client.post(f"/api/sessions/{session_id}/join", json={"token": doctor_token})
        assert join.status_code == 410


def test_expired_join_token_is_rejected(settings) -> None:
    clock = FakeClock()
    mixed = settings.model_copy(update={"session_ttl_seconds": 300, "join_token_ttl_seconds": 30})
    app = create_app(mixed, clock=clock)
    with TestClient(app) as client:
        created = _create(client)
        session_id = created["session"]["session_id"]
        clock.advance(31)
        response = client.post(
            f"/api/sessions/{session_id}/join",
            json={"token": created["access"]["patient"]["token"]},
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_access_token"


def test_access_tokens_are_not_predictable() -> None:
    from sahayak.services.sessions import generate_access_token

    generated = {generate_access_token() for _ in range(20)}
    assert len(generated) == 20
    assert generated.isdisjoint({str(i) for i in range(20)})
