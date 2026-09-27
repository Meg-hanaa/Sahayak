"""Provider base interfaces and shared error types — Phases 1-3."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable, Mapping
from typing import Any
from uuid import UUID

from sahayak.domain.enums import LanguageCode, ParticipantRole
from sahayak.domain.events import SpeechEvent
from sahayak.domain.translation import TranslationResult

SpeechEventHandler = Callable[[SpeechEvent], Awaitable[None]]


class UnimplementedProviderError(NotImplementedError):
    """Raised when a provider method is invoked before its phase is implemented."""


class SpeechProviderError(RuntimeError):
    """Raised for recoverable streaming-provider failures."""


class SpeechProviderConfigurationError(ValueError):
    """Raised when a speech provider is missing required configuration."""


class TranslationProviderError(RuntimeError):
    """Raised for recoverable translation-provider failures (timeout, HTTP error, etc.)."""


class TranslationProviderConfigurationError(ValueError):
    """Raised when a translation provider is missing required configuration."""


class UnsupportedLanguagePairError(TranslationProviderError):
    """Raised when the provider does not support the requested language pair."""

    def __init__(self, source: str, target: str) -> None:
        super().__init__(f"Unsupported language pair: {source!r} → {target!r}")
        self.source = source
        self.target = target


class SpeechToTextProvider(ABC):
    """Streaming speech-to-text adapter. Implementations emit normalized SpeechEvents."""

    name: str

    @abstractmethod
    async def start_stream(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
        role: ParticipantRole,
        language: LanguageCode,
        on_event: SpeechEventHandler,
    ) -> None:
        """Open a role-specific streaming transcription session."""

    @abstractmethod
    async def send_audio(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
        chunk: bytes,
    ) -> None:
        """Send an audio chunk to the participant's streaming session."""

    @abstractmethod
    async def close_stream(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
    ) -> None:
        """Close the participant's streaming transcription session."""


class TranslationProvider(ABC):
    """English-Hindi translation adapter.

    All implementations must:
    - Return a :class:`~sahayak.domain.translation.TranslationResult` (never a bare string).
    - Never invent output on failure — ``translated_text`` must be ``None`` on error.
    - Preserve ``source_text`` exactly.
    """

    name: str

    @abstractmethod
    async def translate(
        self,
        *,
        text: str,
        source_language: LanguageCode,
        target_language: LanguageCode,
        protected_terms: Mapping[str, str] | None = None,
    ) -> TranslationResult:
        """Translate finalized turn text and return a normalized TranslationResult."""


class TextToSpeechProvider(ABC):
    """Speech synthesis adapter for interpretation and confirmation prompts."""

    @abstractmethod
    async def synthesize(self, *, text: str, language: str, voice: str | None = None) -> bytes:
        """Return synthesized audio bytes."""


def not_implemented(capability: str) -> Any:
    raise UnimplementedProviderError(
        f"{capability} is not implemented in this phase. Provider adapters remain placeholders."
    )
