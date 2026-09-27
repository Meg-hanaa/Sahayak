"""Translation provider implementations — Phase 3.

Providers
---------
MockTranslationProvider
    Deterministic, in-memory provider for tests and development.
    Supports EN→HI and HI→EN with fixed vocabulary canned responses.
    No network calls. Always succeeds for supported pairs.

GoogleTranslationProvider
    Thin adapter over the Google Cloud Translation REST API v2.
    Uses ``httpx`` for async HTTP. Falls back to a structured error
    result on any network or API failure — never raises to caller.
"""

from __future__ import annotations

import asyncio
import json
import logging

try:
    import httpx  # optional at module level; missing only in minimal test envs
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from sahayak.domain.enums import LanguageCode
from sahayak.domain.translation import (
    TranslationResult,
    TranslationStatus,
    make_failure,
    make_success,
)
from sahayak.providers.base import (
    TranslationProvider,
    TranslationProviderConfigurationError,
    TranslationProviderError,
    UnsupportedLanguagePairError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supported pairs
# ---------------------------------------------------------------------------

_SUPPORTED_PAIRS: frozenset[tuple[LanguageCode, LanguageCode]] = frozenset({
    (LanguageCode.ENGLISH, LanguageCode.HINDI),
    (LanguageCode.HINDI, LanguageCode.ENGLISH),
})


def _check_pair(source: LanguageCode, target: LanguageCode) -> None:
    if (source, target) not in _SUPPORTED_PAIRS:
        raise UnsupportedLanguagePairError(source.value, target.value)


# ---------------------------------------------------------------------------
# Mock provider
# ---------------------------------------------------------------------------

# A small canned vocabulary for EN→HI so tests can assert round-trips.
_EN_HI: dict[str, str] = {
    "hello": "नमस्ते",
    "hello world": "नमस्ते दुनिया",
    "the patient has a fever": "मरीज को बुखार है",
    "prescribing 500mg amoxicillin": "500mg अमोक्सिसिलिन निर्धारित कर रहे हैं",
    "take this medicine": "यह दवा लें",
    "good morning": "शुभ प्रभात",
    "how are you": "आप कैसे हैं",
    "i have a headache": "मुझे सिरदर्द है",
    "doctor": "डॉक्टर",
    "patient": "मरीज़",
}

_HI_EN: dict[str, str] = {v: k for k, v in _EN_HI.items()}
# Extras
_HI_EN.update({
    "नमस्ते": "hello",
    "मुझे बुखार है": "i have a fever",
    "ठीक है": "okay",
    "मुझे दर्द है": "i am in pain",
})


class MockTranslationProvider(TranslationProvider):
    """Deterministic translation provider for tests and development.

    - Supports EN→HI and HI→EN.
    - Looks up ``text.lower().strip()`` in a fixed vocabulary.
    - If not found, wraps the text with a ``[MOCK:HI: …]`` or ``[MOCK:EN: …]`` marker.
    - Raises :class:`UnsupportedLanguagePairError` for unsupported pairs.
    - Can be forced to fail via ``fail_on_translate=True``.
    - Can be given an artificial delay via ``delay_seconds`` (for timeout tests).
    """

    name = "mock_translation"

    def __init__(
        self,
        *,
        fail_on_translate: bool = False,
        delay_seconds: float = 0.0,
    ) -> None:
        self._fail = fail_on_translate
        self._delay = delay_seconds
        self.call_log: list[dict[str, Any]] = []

    async def translate(
        self,
        *,
        text: str,
        source_language: LanguageCode,
        target_language: LanguageCode,
        protected_terms: Mapping[str, str] | None = None,
    ) -> TranslationResult:
        self.call_log.append({
            "text": text,
            "source": source_language,
            "target": target_language,
            "timestamp": datetime.now(UTC),
        })

        if self._delay:
            await asyncio.sleep(self._delay)

        # Input validation
        if not isinstance(text, str):
            return make_failure(
                source_text=str(text),
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="invalid_input",
                error_message="text must be a string",
            )

        if not text.strip():
            return make_failure(
                source_text=text,
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="empty_input",
                error_message="text must not be empty or whitespace-only",
            )

        # Pair validation
        try:
            _check_pair(source_language, target_language)
        except UnsupportedLanguagePairError as exc:
            return make_failure(
                source_text=text,
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="unsupported_pair",
                error_message=str(exc),
                status=TranslationStatus.UNSUPPORTED_PAIR,
            )

        # Simulated failure
        if self._fail:
            return make_failure(
                source_text=text,
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="mock_error",
                error_message="MockTranslationProvider forced failure",
            )

        # Vocabulary lookup or marker-wrapped passthrough
        lookup = text.strip().lower()
        vocab = _EN_HI if source_language == LanguageCode.ENGLISH else _HI_EN
        target_lang_label = target_language.value.upper()
        translated = vocab.get(lookup, f"[MOCK:{target_lang_label}: {text.strip()}]")

        return make_success(
            source_text=text,
            translated_text=translated,
            source_language=source_language,
            target_language=target_language,
            provider=self.name,
            metadata={"vocabulary_hit": lookup in vocab},
        )


# ---------------------------------------------------------------------------
# Google Cloud Translation provider
# ---------------------------------------------------------------------------

class GoogleTranslationProvider(TranslationProvider):
    """Adapter for the Google Cloud Translation REST API v2.

    Uses ``httpx`` for async HTTP. Credentials are passed as an API key
    (``TRANSLATION_API_KEY`` env var) — no OAuth required for the basic REST API.

    Timeout and error handling:
    - On timeout → returns a FAILED TranslationResult with error_code="timeout".
    - On HTTP error → returns a FAILED TranslationResult with error_code="http_error".
    - On any unexpected exception → returns a FAILED TranslationResult.
    - Never raises to the caller. Never invents output on failure.
    """

    name = "google_translate"
    _API_URL = "https://translation.googleapis.com/language/translate/v2"

    def __init__(
        self,
        *,
        api_key: str,
        timeout_seconds: float = 10.0,
    ) -> None:
        if not api_key or not api_key.strip():
            raise TranslationProviderConfigurationError(
                "GoogleTranslationProvider requires a non-empty api_key"
            )
        self._api_key = api_key.strip()
        self._timeout = timeout_seconds

    async def translate(
        self,
        *,
        text: str,
        source_language: LanguageCode,
        target_language: LanguageCode,
        protected_terms: Mapping[str, str] | None = None,
    ) -> TranslationResult:
        # Input validation
        if not isinstance(text, str):
            return make_failure(
                source_text=str(text),
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="invalid_input",
                error_message="text must be a string",
            )

        if not text.strip():
            return make_failure(
                source_text=text,
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="empty_input",
                error_message="text must not be empty or whitespace-only",
            )

        # Pair validation
        try:
            _check_pair(source_language, target_language)
        except UnsupportedLanguagePairError as exc:
            return make_failure(
                source_text=text,
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="unsupported_pair",
                error_message=str(exc),
                status=TranslationStatus.UNSUPPORTED_PAIR,
            )

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    self._API_URL,
                    params={"key": self._api_key},
                    json={
                        "q": text,
                        "source": source_language.value,
                        "target": target_language.value,
                        "format": "text",
                    },
                )

            if resp.status_code != 200:
                body = _safe_json(resp.text)
                err_msg = (
                    body.get("error", {}).get("message", resp.text)
                    if isinstance(body, dict)
                    else resp.text
                )
                logger.warning(
                    "Google Translate HTTP %d: %s", resp.status_code, err_msg
                )
                return make_failure(
                    source_text=text,
                    source_language=source_language,
                    target_language=target_language,
                    provider=self.name,
                    error_code="http_error",
                    error_message=f"HTTP {resp.status_code}: {err_msg}",
                    metadata={"status_code": resp.status_code},
                )

            data = resp.json()
            translated = data["data"]["translations"][0]["translatedText"]
            detected = data["data"]["translations"][0].get("detectedSourceLanguage")

            return make_success(
                source_text=text,
                translated_text=translated,
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                metadata={"detected_source_language": detected},
            )

        except asyncio.TimeoutError as exc:
            logger.warning("Google Translate timeout after %ss", self._timeout)
            return make_failure(
                source_text=text,
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="timeout",
                error_message=f"Translation timed out after {self._timeout}s",
            )

        except Exception as exc:  # noqa: BLE001
            logger.exception("Unexpected Google Translate error: %s", exc)
            return make_failure(
                source_text=text,
                source_language=source_language,
                target_language=target_language,
                provider=self.name,
                error_code="provider_error",
                error_message=str(exc),
            )


# ---------------------------------------------------------------------------
# Placeholder (Phase 0/1 compatibility shim — kept for registry fallback)
# ---------------------------------------------------------------------------

class PlaceholderTranslationProvider(TranslationProvider):
    """Placeholder for phases where translation is not yet active.

    Always returns FAILED with error_code='not_implemented'.
    """

    name = "placeholder"

    async def translate(
        self,
        *,
        text: str,
        source_language: LanguageCode,
        target_language: LanguageCode,
        protected_terms: Mapping[str, str] | None = None,
    ) -> TranslationResult:
        from sahayak.providers.base import UnimplementedProviderError
        raise UnimplementedProviderError(
            "Translation is not implemented in this phase. Provider adapters remain placeholders."
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_json(text: str) -> Any:
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return {}
