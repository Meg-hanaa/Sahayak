"""Replaceable provider adapters — concrete implementations for Phase 2+."""

from sahayak.providers.assemblyai import AssemblyAIProvider
from sahayak.providers.base import (
    SpeechEventHandler,
    SpeechProviderConfigurationError,
    SpeechProviderError,
    SpeechToTextProvider,
    TextToSpeechProvider,
    TranslationProvider,
    UnimplementedProviderError,
)
from sahayak.providers.mock import MockSpeechToTextProvider
from sahayak.providers.registry import ProviderRegistry, build_provider_registry
from sahayak.providers.translation import PlaceholderTranslationProvider
from sahayak.providers.tts import PlaceholderTTSProvider

__all__ = [
    "AssemblyAIProvider",
    "MockSpeechToTextProvider",
    "PlaceholderTTSProvider",
    "PlaceholderTranslationProvider",
    "ProviderRegistry",
    "SpeechEventHandler",
    "SpeechProviderConfigurationError",
    "SpeechProviderError",
    "SpeechToTextProvider",
    "TextToSpeechProvider",
    "TranslationProvider",
    "UnimplementedProviderError",
    "build_provider_registry",
]
