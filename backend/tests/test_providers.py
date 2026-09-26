"""Placeholder provider contract tests."""

from __future__ import annotations

from uuid import uuid4

import pytest

from sahayak.providers import (
    AssemblyAIProvider,
    PlaceholderTTSProvider,
    PlaceholderTranslationProvider,
    UnimplementedProviderError,
    build_provider_registry,
)


@pytest.mark.asyncio
async def test_placeholder_providers_are_not_implemented() -> None:
    registry = build_provider_registry()
    assert isinstance(registry.speech_to_text, AssemblyAIProvider)
    assert isinstance(registry.translation, PlaceholderTranslationProvider)
    assert isinstance(registry.tts, PlaceholderTTSProvider)

    with pytest.raises(UnimplementedProviderError):
        await registry.speech_to_text.start_stream(session_id=uuid4(), participant_id=uuid4())
    with pytest.raises(UnimplementedProviderError):
        await registry.translation.translate(text="hello", source_language="en", target_language="hi")
    with pytest.raises(UnimplementedProviderError):
        await registry.tts.synthesize(text="hello", language="hi")
