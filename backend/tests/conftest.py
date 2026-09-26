"""Shared pytest fixtures. Environment defaults are set before app import."""

from __future__ import annotations

import os

os.environ.setdefault("SAHAYAK_ENVIRONMENT", "test")
os.environ.setdefault(
    "SAHAYAK_CORS_ORIGINS",
    '["http://localhost:5173","http://127.0.0.1:5173","http://localhost:3000","http://testserver"]',
)
os.environ.setdefault("SAHAYAK_LOG_LEVEL", "INFO")

import pytest
from fastapi.testclient import TestClient

from sahayak.config import Settings, reset_settings_cache
from sahayak.main import create_app


@pytest.fixture
def settings() -> Settings:
    reset_settings_cache()
    return Settings(_env_file=None)


@pytest.fixture
def app(settings: Settings):
    return create_app(settings)


@pytest.fixture
def client(app) -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
