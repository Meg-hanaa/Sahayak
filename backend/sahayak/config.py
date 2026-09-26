"""Environment-based application configuration."""

from __future__ import annotations

from enum import Enum
from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """Runtime environment for the Sahayak backend."""

    DEVELOPMENT = "development"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Typed settings loaded from environment variables and an optional `.env` file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
        case_sensitive=False,
    )

    app_name: str = Field(default="Sahayak", validation_alias=AliasChoices("SAHAYAK_APP_NAME", "APP_NAME"))
    environment: Environment = Field(validation_alias=AliasChoices("SAHAYAK_ENVIRONMENT", "ENVIRONMENT"))
    log_level: str = Field(default="INFO", validation_alias=AliasChoices("SAHAYAK_LOG_LEVEL", "LOG_LEVEL"))
    cors_origins: list[str] = Field(validation_alias=AliasChoices("SAHAYAK_CORS_ORIGINS", "CORS_ORIGINS"))
    api_prefix: str = Field(default="/api", validation_alias=AliasChoices("SAHAYAK_API_PREFIX", "API_PREFIX"))
    websocket_path: str = Field(
        default="/ws",
        validation_alias=AliasChoices("SAHAYAK_WEBSOCKET_PATH", "WEBSOCKET_PATH"),
    )

    assemblyai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ASSEMBLYAI_API_KEY", "SAHAYAK_ASSEMBLYAI_API_KEY"),
    )
    translation_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TRANSLATION_API_KEY", "SAHAYAK_TRANSLATION_API_KEY"),
    )
    tts_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TTS_API_KEY", "SAHAYAK_TTS_API_KEY"),
    )
    translation_provider_name: str = Field(
        default="placeholder",
        validation_alias=AliasChoices("TRANSLATION_PROVIDER_NAME", "SAHAYAK_TRANSLATION_PROVIDER_NAME"),
    )
    tts_provider_name: str = Field(
        default="placeholder",
        validation_alias=AliasChoices("TTS_PROVIDER_NAME", "SAHAYAK_TTS_PROVIDER_NAME"),
    )

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        normalized = value.upper()
        if normalized not in allowed:
            raise ValueError(f"log_level must be one of {sorted(allowed)}")
        return normalized

    @field_validator("cors_origins")
    @classmethod
    def require_cors_origins(cls, value: list[str]) -> list[str]:
        origins = [origin.strip() for origin in value if origin and origin.strip()]
        if not origins:
            raise ValueError("At least one CORS origin is required")
        return origins

    @field_validator("api_prefix")
    @classmethod
    def normalize_api_prefix(cls, value: str) -> str:
        prefix = value.strip() or "/api"
        if not prefix.startswith("/"):
            prefix = f"/{prefix}"
        return prefix.rstrip("/") or "/api"

    @field_validator("websocket_path")
    @classmethod
    def normalize_websocket_path(cls, value: str) -> str:
        path = value.strip() or "/ws"
        if not path.startswith("/"):
            path = f"/{path}"
        return path


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()


def reset_settings_cache() -> None:
    """Clear the settings cache (used by tests)."""

    get_settings.cache_clear()
