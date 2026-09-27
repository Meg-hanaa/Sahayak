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
    TranslationProviderConfigurationError,
)
from sahayak.providers.mock import MockSpeechToTextProvider
from sahayak.providers.translation import (
    GoogleTranslationProvider,
    MockTranslationProvider,
    PlaceholderTranslationProvider,
)
from sahayak.providers.tts import PlaceholderTTSProvider


@dataclass(frozen=True, slots=True)
class ProviderRegistry:
    speech_to_text: SpeechToTextProvider
    translation: TranslationProvider
    tts: TextToSpeechProvider


def build_provider_registry(settings: Settings | None = None) -> ProviderRegistry:
    """Construct providers appropriate for the current configuration.

    Speech-to-text:
    - ``speech_provider=mock``        → :class:`MockSpeechToTextProvider`
    - ``speech_provider=assemblyai``  → :class:`AssemblyAIProvider` (requires key)

    Translation:
    - ``translation_provider_name=mock``        → :class:`MockTranslationProvider`
    - ``translation_provider_name=google``       → :class:`GoogleTranslationProvider` (requires key)
    - ``translation_provider_name=placeholder``  → :class:`PlaceholderTranslationProvider`
    """
    from sahayak.config import get_settings  # avoid circular import at module level

    resolved = settings or get_settings()

    # --- Speech-to-text ---------------------------------------------------
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

    # --- Translation -------------------------------------------------------
    if resolved.translation_provider_name == "google":
        if not resolved.translation_api_key:
            raise TranslationProviderConfigurationError(
                "TRANSLATION_API_KEY is required when TRANSLATION_PROVIDER_NAME=google"
            )
        translation: TranslationProvider = GoogleTranslationProvider(
            api_key=resolved.translation_api_key,
            timeout_seconds=resolved.translation_timeout_seconds,
        )
    elif resolved.translation_provider_name == "mock":
        translation = MockTranslationProvider()
    else:
        translation = PlaceholderTranslationProvider()

    return ProviderRegistry(
        speech_to_text=stt,
        translation=translation,
        tts=PlaceholderTTSProvider(),
    )
