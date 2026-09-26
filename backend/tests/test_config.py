"""Configuration loading and validation tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from sahayak.config import Settings, get_settings, reset_settings_cache


def test_settings_load_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAHAYAK_ENVIRONMENT", "development")
    monkeypatch.setenv("SAHAYAK_LOG_LEVEL", "debug")
    monkeypatch.setenv("SAHAYAK_CORS_ORIGINS", '["http://localhost:5173"]')
    monkeypatch.setenv("ASSEMBLYAI_API_KEY", "")
    reset_settings_cache()
    settings = Settings(_env_file=None)
    assert settings.environment.value == "development"
    assert settings.log_level == "DEBUG"
    assert settings.cors_origins == ["http://localhost:5173"]
    assert settings.assemblyai_api_key in (None, "")


def test_missing_environment_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SAHAYAK_ENVIRONMENT", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.setenv("SAHAYAK_CORS_ORIGINS", '["http://localhost:5173"]')
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)
    assert "environment" in str(exc_info.value).lower()


def test_missing_cors_origins_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAHAYAK_ENVIRONMENT", "test")
    monkeypatch.delenv("SAHAYAK_CORS_ORIGINS", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)
    assert "cors_origins" in str(exc_info.value).lower()


def test_empty_cors_origins_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAHAYAK_ENVIRONMENT", "test")
    monkeypatch.setenv("SAHAYAK_CORS_ORIGINS", "[]")
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)
    assert "cors origin" in str(exc_info.value).lower()


def test_invalid_environment_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAHAYAK_ENVIRONMENT", "not-a-valid-env")
    monkeypatch.setenv("SAHAYAK_CORS_ORIGINS", '["http://localhost:5173"]')
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_invalid_log_level_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAHAYAK_ENVIRONMENT", "test")
    monkeypatch.setenv("SAHAYAK_CORS_ORIGINS", '["http://localhost:5173"]')
    monkeypatch.setenv("SAHAYAK_LOG_LEVEL", "LOUD")
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)
    assert "log_level" in str(exc_info.value).lower()


def test_get_settings_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAHAYAK_ENVIRONMENT", "test")
    monkeypatch.setenv("SAHAYAK_CORS_ORIGINS", '["http://localhost:5173"]')
    reset_settings_cache()
    first = get_settings()
    second = get_settings()
    assert first is second
    reset_settings_cache()
