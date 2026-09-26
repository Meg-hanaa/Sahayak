"""Application startup tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from sahayak.main import create_app
from sahayak.providers.registry import ProviderRegistry
from sahayak.services.sessions import SessionService


def test_create_app_starts_and_exposes_state(settings) -> None:
    app = create_app(settings)
    assert app.title == "Sahayak"
    assert app.state.settings.environment.value == "test"
    assert isinstance(app.state.providers, ProviderRegistry)
    assert isinstance(app.state.session_service, SessionService)


def test_create_app_starts_and_exposes_state(settings) -> None:
    app = create_app(settings)
    assert app.title == "Sahayak"
    assert app.state.settings.environment.value == "test"
    assert isinstance(app.state.providers, ProviderRegistry)


def test_lifespan_runs_without_error(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200


def test_module_app_can_be_imported() -> None:
    from sahayak.main import app

    assert app.title == "Sahayak"
