"""Environment-based application configuration."""

from __future__ import annotations

from enum import Enum
from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator, model_validator
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
    session_ttl_seconds: int = Field(
        default=7200,
        ge=1,
        validation_alias=AliasChoices("SAHAYAK_SESSION_TTL_SECONDS", "SESSION_TTL_SECONDS"),
    )
    join_token_ttl_seconds: int = Field(
        default=3600,
        ge=1,
        validation_alias=AliasChoices("SAHAYAK_JOIN_TOKEN_TTL_SECONDS", "JOIN_TOKEN_TTL_SECONDS"),
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
        default="mock",
        validation_alias=AliasChoices("TRANSLATION_PROVIDER_NAME", "SAHAYAK_TRANSLATION_PROVIDER_NAME"),
    )
    translation_timeout_seconds: float = Field(
        default=10.0,
        gt=0,
        validation_alias=AliasChoices("TRANSLATION_TIMEOUT_SECONDS", "SAHAYAK_TRANSLATION_TIMEOUT_SECONDS"),
    )
    tts_provider_name: str = Field(
        default="placeholder",
        validation_alias=AliasChoices("TTS_PROVIDER_NAME", "SAHAYAK_TTS_PROVIDER_NAME"),
    )
    speech_provider: str = Field(
        default="mock",
        validation_alias=AliasChoices("SAHAYAK_SPEECH_PROVIDER", "SPEECH_PROVIDER"),
    )
    assemblyai_streaming_url: str = Field(
        default="wss://streaming.assemblyai.com/v3/ws",
        validation_alias=AliasChoices("ASSEMBLYAI_STREAMING_URL", "SAHAYAK_ASSEMBLYAI_STREAMING_URL"),
    )
    assemblyai_sample_rate: int = Field(
        default=16000,
        ge=8000,
        validation_alias=AliasChoices("ASSEMBLYAI_SAMPLE_RATE", "SAHAYAK_ASSEMBLYAI_SAMPLE_RATE"),
    )
    assemblyai_stream_timeout_seconds: float = Field(
        default=10.0,
        gt=0,
        validation_alias=AliasChoices("ASSEMBLYAI_STREAM_TIMEOUT_SECONDS", "SAHAYAK_ASSEMBLYAI_STREAM_TIMEOUT_SECONDS"),
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

    @field_validator("assemblyai_api_key", "translation_api_key", "tts_api_key", mode="before")
    @classmethod
    def empty_secret_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("speech_provider")
    @classmethod
    def normalize_speech_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"mock", "assemblyai"}:
            raise ValueError("speech_provider must be 'mock' or 'assemblyai'")
        return normalized

    @field_validator("translation_provider_name")
    @classmethod
    def normalize_translation_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"mock", "google", "placeholder"}:
            raise ValueError("translation_provider_name must be 'mock', 'google', or 'placeholder'")
        return normalized

    @model_validator(mode="after")
    def require_assemblyai_credentials(self) -> Settings:
        if self.speech_provider == "assemblyai" and not self.assemblyai_api_key:
            raise ValueError("ASSEMBLYAI_API_KEY is required when SAHAYAK_SPEECH_PROVIDER=assemblyai")
        return self

    @model_validator(mode="after")
    def require_translation_credentials(self) -> Settings:
        if self.translation_provider_name == "google" and not self.translation_api_key:
            raise ValueError("TRANSLATION_API_KEY is required when TRANSLATION_PROVIDER_NAME=google")
        return self


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()


def reset_settings_cache() -> None:
    """Clear the settings cache (used by tests)."""

    get_settings.cache_clear()
