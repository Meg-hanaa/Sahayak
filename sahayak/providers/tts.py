"""Text-to-speech provider placeholder."""

from __future__ import annotations

from sahayak.providers.base import TextToSpeechProvider, not_implemented


class PlaceholderTTSProvider(TextToSpeechProvider):
    """Placeholder for the future TTS adapter."""

    name = "placeholder"

    async def synthesize(self, *, text: str, language: str, voice: str | None = None) -> bytes:
        not_implemented("Text-to-speech")
