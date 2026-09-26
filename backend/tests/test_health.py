"""Health endpoint tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from sahayak import __version__


def test_root_health_endpoint(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "sahayak"
    assert body["version"] == __version__
    assert body["environment"] == "test"


def test_prefixed_health_endpoint(client: TestClient, settings) -> None:
    response = client.get(f"{settings.api_prefix}/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
