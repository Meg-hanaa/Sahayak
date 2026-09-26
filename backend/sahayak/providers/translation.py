"""Translation provider placeholder."""

from __future__ import annotations

from collections.abc import Mapping

from sahayak.providers.base import TranslationProvider, not_implemented


class PlaceholderTranslationProvider(TranslationProvider):
    """Placeholder for the future English-Hindi translation adapter."""

    name = "placeholder"

    async def translate(
        self,
        *,
        text: str,
        source_language: str,
        target_language: str,
        protected_terms: Mapping[str, str] | None = None,
    ) -> str:
        not_implemented("Translation")
