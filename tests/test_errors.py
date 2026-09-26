"""API error-handling tests."""

from __future__ import annotations

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from sahayak.api.errors import SahayakError
from sahayak.main import create_app


class _EchoPayload(BaseModel):
    name: str


def _client_with_error_routes(settings) -> TestClient:
    app = create_app(settings)

    @app.get("/__test__/app-error")
    async def app_error() -> None:
        raise SahayakError(
            "Confirmation is not available yet",
            code="not_implemented",
            status_code=409,
            details={"phase": 0},
        )

    @app.get("/__test__/http-error")
    async def http_error() -> None:
        raise HTTPException(status_code=404, detail="Session not found")

    @app.get("/__test__/crash")
    async def crash() -> None:
        raise RuntimeError("sensitive internal failure")

    @app.post("/__test__/echo")
    async def echo(payload: _EchoPayload) -> _EchoPayload:
        return payload

    return TestClient(app, raise_server_exceptions=False)


def test_sahayak_error_shape(settings) -> None:
    client = _client_with_error_routes(settings)
    response = client.get("/__test__/app-error")
    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "not_implemented"
    assert body["error"]["message"] == "Confirmation is not available yet"
    assert body["error"]["details"] == {"phase": 0}


def test_http_exception_shape(settings) -> None:
    client = _client_with_error_routes(settings)
    response = client.get("/__test__/http-error")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "http_error"
    assert body["error"]["message"] == "Session not found"


def test_unhandled_error_does_not_leak_internals(settings) -> None:
    client = _client_with_error_routes(settings)
    response = client.get("/__test__/crash")
    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert "sensitive" not in response.text.lower()
    assert "runtimeerror" not in response.text.lower()


def test_validation_error_shape(settings) -> None:
    client = _client_with_error_routes(settings)
    response = client.post("/__test__/echo", json={})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["message"] == "Request validation failed"
    assert isinstance(body["error"]["details"], list)


def test_unknown_route_uses_http_error_shape(client: TestClient) -> None:
    response = client.get("/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_error"
