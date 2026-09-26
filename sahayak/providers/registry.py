"""Provider registry — selects concrete adapters based on application settings."""

from __future__ import annotations

from dataclasses import dataclass

from sahayak.config import Settings
from sahayak.providers.assemblyai import AssemblyAIProvider
from sahayak.providers.base import (
    SpeechProviderConfigurationError,
    SpeechToTextProvider,
    TextToSpeechProvider,
    TranslationProvider,
)
from sahayak.providers.mock import MockSpeechToTextProvider
from sahayak.providers.translation import PlaceholderTranslationProvider
from sahayak.providers.tts import PlaceholderTTSProvider


@dataclass(frozen=True, slots=True)
class ProviderRegistry:
    speech_to_text: SpeechToTextProvider
    translation: TranslationProvider
    tts: TextToSpeechProvider


def build_provider_registry(settings: Settings | None = None) -> ProviderRegistry:
    """Construct providers appropriate for the current configuration.

    - ``speech_provider=mock``        → :class:`MockSpeechToTextProvider`
    - ``speech_provider=assemblyai``  → :class:`AssemblyAIProvider` (requires key)
    """

    from sahayak.config import get_settings  # avoid circular import at module level

    resolved = settings or get_settings()

    if resolved.speech_provider == "assemblyai":
        if not resolved.assemblyai_api_key:
            raise SpeechProviderConfigurationError(
                "ASSEMBLYAI_API_KEY is required when SAHAYAK_SPEECH_PROVIDER=assemblyai"
            )
        stt: SpeechToTextProvider = AssemblyAIProvider(
            api_key=resolved.assemblyai_api_key,
            streaming_url=resolved.assemblyai_streaming_url,
            sample_rate=resolved.assemblyai_sample_rate,
            timeout_seconds=resolved.assemblyai_stream_timeout_seconds,
        )
    else:
        stt = MockSpeechToTextProvider()

    return ProviderRegistry(
        speech_to_text=stt,
        translation=PlaceholderTranslationProvider(),
        tts=PlaceholderTTSProvider(),
    )
