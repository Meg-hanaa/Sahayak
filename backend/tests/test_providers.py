"""Provider contract tests — Phase 2: registry, configuration, and base abstractions."""

from __future__ import annotations

import pytest

from sahayak.providers import (
    AssemblyAIProvider,
    MockSpeechToTextProvider,
    MockTranslationProvider,
    PlaceholderTTSProvider,
    PlaceholderTranslationProvider,
    SpeechProviderConfigurationError,
    UnimplementedProviderError,
    build_provider_registry,
)
from sahayak.config import Settings


def _test_settings(**overrides) -> Settings:
    base: dict = {
        "_env_file": None,
        "SAHAYAK_ENVIRONMENT": "test",
        "SAHAYAK_CORS_ORIGINS": ["http://localhost:3000"],
    }
    base.update(overrides)
    return Settings(**base)


class TestRegistryProviderSelection:
    def test_default_registry_uses_mock_provider(self) -> None:
        settings = _test_settings()
        registry = build_provider_registry(settings)
        assert isinstance(registry.speech_to_text, MockSpeechToTextProvider)
        assert isinstance(registry.translation, MockTranslationProvider)
        assert isinstance(registry.tts, PlaceholderTTSProvider)

    def test_explicit_mock_registry(self) -> None:
        settings = _test_settings(SAHAYAK_SPEECH_PROVIDER="mock")
        registry = build_provider_registry(settings)
        assert isinstance(registry.speech_to_text, MockSpeechToTextProvider)

    def test_assemblyai_registry_requires_api_key(self) -> None:
        with pytest.raises(ValueError):
            _test_settings(SAHAYAK_SPEECH_PROVIDER="assemblyai")

    def test_assemblyai_registry_with_api_key(self) -> None:
        settings = _test_settings(
            SAHAYAK_SPEECH_PROVIDER="assemblyai",
            ASSEMBLYAI_API_KEY="test-key-abc",
        )
        registry = build_provider_registry(settings)
        assert isinstance(registry.speech_to_text, AssemblyAIProvider)


class TestAssemblyAIProviderConfiguration:
    def test_requires_non_empty_api_key(self) -> None:
        with pytest.raises(SpeechProviderConfigurationError):
            AssemblyAIProvider(api_key="")

    def test_requires_non_whitespace_api_key(self) -> None:
        with pytest.raises(SpeechProviderConfigurationError):
            AssemblyAIProvider(api_key="   ")

    def test_valid_initialization(self) -> None:
        provider = AssemblyAIProvider(api_key="real-key")
        assert provider.name == "assemblyai"

    def test_custom_streaming_url_and_sample_rate(self) -> None:
        provider = AssemblyAIProvider(
            api_key="k",
            streaming_url="wss://custom.example.com/ws",
            sample_rate=8000,
            timeout_seconds=5.0,
        )
        assert provider._streaming_url == "wss://custom.example.com/ws"
        assert provider._sample_rate == 8000
        assert provider._timeout_seconds == 5.0


class TestPlaceholderProviders:
    @pytest.mark.asyncio
    async def test_translation_placeholder_is_not_implemented(self) -> None:
        """PlaceholderTranslationProvider raises UnimplementedProviderError."""
        from sahayak.providers.translation import PlaceholderTranslationProvider
        from sahayak.domain.enums import LanguageCode
        provider = PlaceholderTranslationProvider()
        with pytest.raises(UnimplementedProviderError):
            await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )

    @pytest.mark.asyncio
    async def test_tts_placeholder_is_not_implemented(self) -> None:
        registry = build_provider_registry(_test_settings())
        with pytest.raises(UnimplementedProviderError):
            await registry.tts.synthesize(text="hello", language="hi")
