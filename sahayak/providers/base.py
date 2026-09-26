"""Streaming speech-to-text contracts."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable, Mapping
from typing import Any
from uuid import UUID

from sahayak.domain.enums import LanguageCode, ParticipantRole
from sahayak.domain.events import SpeechEvent

SpeechEventHandler = Callable[[SpeechEvent], Awaitable[None]]


class UnimplementedProviderError(NotImplementedError):
    """Raised when a provider method is invoked before its phase is implemented."""


class SpeechProviderError(RuntimeError):
    """Raised for recoverable streaming-provider failures."""


class SpeechProviderConfigurationError(ValueError):
    """Raised when a speech provider is missing required configuration."""


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
    """English-Hindi translation adapter."""

    @abstractmethod
    async def translate(
        self,
        *,
        text: str,
        source_language: str,
        target_language: str,
        protected_terms: Mapping[str, str] | None = None,
    ) -> str:
        """Translate finalized turn text."""


class TextToSpeechProvider(ABC):
    """Speech synthesis adapter for interpretation and confirmation prompts."""

    @abstractmethod
    async def synthesize(self, *, text: str, language: str, voice: str | None = None) -> bytes:
        """Return synthesized audio bytes."""


def not_implemented(capability: str) -> Any:
    raise UnimplementedProviderError(
        f"{capability} is not implemented in this phase. Provider adapters remain placeholders."
    )
