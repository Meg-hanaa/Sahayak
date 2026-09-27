"""Replaceable provider adapters — concrete implementations for Phase 2+."""

from sahayak.providers.assemblyai import AssemblyAIProvider
from sahayak.providers.base import (
    SpeechEventHandler,
    SpeechProviderConfigurationError,
    SpeechProviderError,
    SpeechToTextProvider,
    TextToSpeechProvider,
    TranslationProvider,
    TranslationProviderConfigurationError,
    TranslationProviderError,
    UnimplementedProviderError,
    UnsupportedLanguagePairError,
)
from sahayak.providers.mock import MockSpeechToTextProvider
from sahayak.providers.registry import ProviderRegistry, build_provider_registry
from sahayak.providers.translation import (
    GoogleTranslationProvider,
    MockTranslationProvider,
    PlaceholderTranslationProvider,
)
from sahayak.providers.tts import PlaceholderTTSProvider

__all__ = [
    "AssemblyAIProvider",
    "GoogleTranslationProvider",
    "MockSpeechToTextProvider",
    "MockTranslationProvider",
    "PlaceholderTTSProvider",
    "PlaceholderTranslationProvider",
    "ProviderRegistry",
    "SpeechEventHandler",
    "SpeechProviderConfigurationError",
    "SpeechProviderError",
    "SpeechToTextProvider",
    "TextToSpeechProvider",
    "TranslationProvider",
    "TranslationProviderConfigurationError",
    "TranslationProviderError",
    "UnimplementedProviderError",
    "UnsupportedLanguagePairError",
    "build_provider_registry",
]
