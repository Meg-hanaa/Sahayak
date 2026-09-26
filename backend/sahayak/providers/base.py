"""Abstract provider contracts used by later Sahayak phases."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping
from typing import Any
from uuid import UUID


class UnimplementedProviderError(NotImplementedError):
    """Raised when a provider method is invoked before its phase is implemented."""


class SpeechToTextProvider(ABC):
    """Streaming speech-to-text adapter (AssemblyAI in later phases)."""

    @abstractmethod
    async def start_stream(self, *, session_id: UUID, participant_id: UUID) -> None:
        """Open a streaming transcription session."""

    @abstractmethod
    async def send_audio(self, *, session_id: UUID, chunk: bytes) -> None:
        """Send an audio chunk to the streaming session."""

    @abstractmethod
    async def close_stream(self, *, session_id: UUID) -> None:
        """Close the streaming transcription session."""


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
        f"{capability} is not implemented in Phase 0. Provider adapters are placeholders only."
    )
