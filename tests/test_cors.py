"""CORS middleware tests for local frontend development."""

from __future__ import annotations

from fastapi.testclient import TestClient

from sahayak.config import Settings
from sahayak.main import create_app


def test_allowed_origin_receives_cors_headers(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_disallowed_origin_does_not_receive_allow_origin(settings: Settings) -> None:
    app = create_app(settings)
    client = TestClient(app)
    response = client.get("/health", headers={"Origin": "https://evil.example"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_preflight_request_from_allowed_origin(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code in {200, 204}
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-methods" in response.headers
