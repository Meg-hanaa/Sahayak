"""Replaceable provider adapters. Concrete integrations belong to later phases."""

from sahayak.providers.assemblyai import AssemblyAIProvider
from sahayak.providers.base import (
    SpeechToTextProvider,
    TextToSpeechProvider,
    TranslationProvider,
    UnimplementedProviderError,
)
from sahayak.providers.registry import ProviderRegistry, build_provider_registry
from sahayak.providers.translation import PlaceholderTranslationProvider
from sahayak.providers.tts import PlaceholderTTSProvider

__all__ = [
    "AssemblyAIProvider",
    "PlaceholderTTSProvider",
    "PlaceholderTranslationProvider",
    "ProviderRegistry",
    "SpeechToTextProvider",
    "TextToSpeechProvider",
    "TranslationProvider",
    "UnimplementedProviderError",
    "build_provider_registry",
]
