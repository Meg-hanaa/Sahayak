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
    cors_origins: list[str] | str = Field(
        validation_alias=AliasChoices("SAHAYAK_CORS_ORIGINS", "CORS_ORIGINS"),
    )
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
    mymemory_email: str | None = Field(
        default=None,
        description="Optional email for MyMemory API — raises free quota from 1,000 to 5,000 words/day.",
        validation_alias=AliasChoices("MYMEMORY_EMAIL", "SAHAYAK_MYMEMORY_EMAIL"),
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
    safety_min_confidence: float = Field(
        default=0.75,
        ge=0.0,
        le=1.0,
        validation_alias=AliasChoices("SAFETY_MIN_CONFIDENCE", "SAHAYAK_SAFETY_MIN_CONFIDENCE"),
    )
    safety_require_confidence: bool = Field(
        default=False,
        validation_alias=AliasChoices("SAFETY_REQUIRE_CONFIDENCE", "SAHAYAK_SAFETY_REQUIRE_CONFIDENCE"),
    )
    safety_glossary_path: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SAFETY_GLOSSARY_PATH", "SAHAYAK_SAFETY_GLOSSARY_PATH"),
    )
    emergency_instruction_en: str = Field(
        default="EMERGENCY DETECTED: Automated interpretation paused. Seek immediate emergency medical care or call 112 / 911. Direct clinical intervention required.",
        validation_alias=AliasChoices("EMERGENCY_INSTRUCTION_EN", "SAHAYAK_EMERGENCY_INSTRUCTION_EN"),
    )
    emergency_instruction_hi: str = Field(
        default="आपातकालीन स्थिति: स्वचालित अनुवाद रोक दिया गया है। कृपया तुरंत आपातकालीन चिकित्सा सहायता लें या 112 पर कॉल करें।",
        validation_alias=AliasChoices("EMERGENCY_INSTRUCTION_HI", "SAHAYAK_EMERGENCY_INSTRUCTION_HI"),
    )
    max_confirmation_attempts: int = Field(
        default=2,
        ge=1,
        validation_alias=AliasChoices("MAX_CONFIRMATION_ATTEMPTS", "SAHAYAK_MAX_CONFIRMATION_ATTEMPTS"),
    )


    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        normalized = value.upper()
        if normalized not in allowed:
            raise ValueError(f"log_level must be one of {sorted(allowed)}")
        return normalized

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> list[str]:
        """Accept a JSON array string, a comma-separated string, a list, or empty string.

        Railway sometimes delivers env-var values as empty strings when the
        variable exists but has no content — fall back to wildcard in that case.
        """
        import json as _json

        if value is None:
            return value  # type: ignore[return-value]
        if isinstance(value, list):
            cleaned = [str(o).strip() for o in value if str(o).strip()]
            if not cleaned:
                raise ValueError("At least one CORS origin must be configured")
            return cleaned
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return ["*"]
            # Try JSON first (e.g. '["https://app.vercel.app"]')
            if stripped.startswith("["):
                try:
                    parsed = _json.loads(stripped)
                    if isinstance(parsed, list):
                        cleaned = [str(o).strip() for o in parsed if str(o).strip()]
                        if not cleaned:
                            raise ValueError("At least one CORS origin must be configured")
                        return cleaned
                except _json.JSONDecodeError:
                    pass
            # Fall back to comma-separated (e.g. 'https://a.com,https://b.com' or '*')
            parts = [p.strip() for p in stripped.split(",") if p.strip()]
            if not parts:
                raise ValueError("At least one CORS origin must be configured")
            return parts
        return ["*"]

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
        if normalized not in {"mock", "google", "mymemory", "placeholder"}:
            raise ValueError("translation_provider_name must be 'mock', 'google', 'mymemory', or 'placeholder'")
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
