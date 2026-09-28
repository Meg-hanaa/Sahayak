"""Normalized translation result model — Phase 3."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from sahayak.domain.enums import LanguageCode


class TranslationStatus(str, Enum):
    """Outcome of a translation request."""

    SUCCESS = "success"
    FAILED = "failed"
    UNSUPPORTED_PAIR = "unsupported_pair"


@dataclass(slots=True)
class TranslationResult:
    """Immutable, normalized output from any translation provider.

    Rules:
    - ``source_text`` is NEVER modified, regardless of outcome.
    - ``translated_text`` is ``None`` when status != SUCCESS.
    - ``error_code`` / ``error_message`` are populated on failure.
    - No invented output: a failed result must NOT set ``translated_text``.
    """

    # --- Identity ----------------------------------------------------------
    source_text: str
    source_language: LanguageCode
    target_language: LanguageCode

    # --- Outcome -----------------------------------------------------------
    status: TranslationStatus
    translated_text: str | None = None

    # --- Failure details (only populated when status != SUCCESS) -----------
    error_code: str | None = None
    error_message: str | None = None

    # --- Audit -------------------------------------------------------------
    provider: str = "unknown"
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = field(default_factory=dict)

    # --- Convenience -------------------------------------------------------
    @property
    def succeeded(self) -> bool:
        return self.status == TranslationStatus.SUCCESS

    @property
    def failed(self) -> bool:
        return self.status != TranslationStatus.SUCCESS

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a plain dict suitable for WebSocket/JSON delivery."""
        return {
            "source_text": self.source_text,
            "source_language": self.source_language.value,
            "target_language": self.target_language.value,
            "status": self.status.value,
            "translated_text": self.translated_text,
            "error_code": self.error_code,
            "error_message": self.error_message,
            "provider": self.provider,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
        }


def make_success(
    *,
    source_text: str,
    translated_text: str,
    source_language: LanguageCode,
    target_language: LanguageCode,
    provider: str,
    metadata: dict[str, Any] | None = None,
) -> TranslationResult:
    """Construct a successful :class:`TranslationResult`."""
    return TranslationResult(
        source_text=source_text,
        translated_text=translated_text,
        source_language=source_language,
        target_language=target_language,
        status=TranslationStatus.SUCCESS,
        provider=provider,
        metadata=metadata or {},
    )


def make_failure(
    *,
    source_text: str,
    source_language: LanguageCode,
    target_language: LanguageCode,
    provider: str,
    error_code: str,
    error_message: str,
    status: TranslationStatus = TranslationStatus.FAILED,
    metadata: dict[str, Any] | None = None,
) -> TranslationResult:
    """Construct a failed :class:`TranslationResult`.

    ``translated_text`` is intentionally left as ``None`` — no invented output.
    """
    return TranslationResult(
        source_text=source_text,
        source_language=source_language,
        target_language=target_language,
        status=status,
        translated_text=None,  # explicit: never invent output on failure
        error_code=error_code,
        error_message=error_message,
        provider=provider,
        metadata=metadata or {},
    )
