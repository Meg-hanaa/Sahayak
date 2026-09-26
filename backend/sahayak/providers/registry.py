"""Provider registry that later phases can replace with real adapters."""

from __future__ import annotations

from dataclasses import dataclass

from sahayak.config import Settings
from sahayak.providers.assemblyai import AssemblyAIProvider
from sahayak.providers.base import SpeechToTextProvider, TextToSpeechProvider, TranslationProvider
from sahayak.providers.translation import PlaceholderTranslationProvider
from sahayak.providers.tts import PlaceholderTTSProvider


@dataclass(frozen=True, slots=True)
class ProviderRegistry:
    speech_to_text: SpeechToTextProvider
    translation: TranslationProvider
    tts: TextToSpeechProvider


def build_provider_registry(_settings: Settings | None = None) -> ProviderRegistry:
    """Construct placeholder providers. Real clients are not created in Phase 0."""

    return ProviderRegistry(
        speech_to_text=AssemblyAIProvider(),
        translation=PlaceholderTranslationProvider(),
        tts=PlaceholderTTSProvider(),
    )
