"""Phase 3: Translation service tests.

All tests use MockTranslationProvider or unit-test GoogleTranslationProvider
internals via HTTP mocking — no live network calls are made.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from sahayak.config import Settings
from sahayak.domain.enums import LanguageCode
from sahayak.domain.translation import (
    TranslationResult,
    TranslationStatus,
    make_failure,
    make_success,
)
from sahayak.providers.base import (
    TranslationProviderConfigurationError,
    TranslationProviderError,
    UnsupportedLanguagePairError,
)
from sahayak.providers.registry import build_provider_registry
from sahayak.providers.translation import (
    GoogleTranslationProvider,
    MockTranslationProvider,
    PlaceholderTranslationProvider,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _test_settings(**overrides) -> Settings:
    base: dict = {
        "_env_file": None,
        "SAHAYAK_ENVIRONMENT": "test",
        "SAHAYAK_CORS_ORIGINS": ["http://localhost:3000"],
    }
    base.update(overrides)
    return Settings(**base)


# ===========================================================================
# Section 1 — TranslationResult domain model
# ===========================================================================

class TestTranslationResultModel:
    def test_make_success_sets_all_fields(self) -> None:
        result = make_success(
            source_text="hello",
            translated_text="नमस्ते",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
        )
        assert result.status == TranslationStatus.SUCCESS
        assert result.source_text == "hello"
        assert result.translated_text == "नमस्ते"
        assert result.source_language == LanguageCode.ENGLISH
        assert result.target_language == LanguageCode.HINDI
        assert result.provider == "test"
        assert result.succeeded is True
        assert result.failed is False

    def test_make_failure_never_sets_translated_text(self) -> None:
        result = make_failure(
            source_text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
            error_code="timeout",
            error_message="Timed out",
        )
        assert result.status == TranslationStatus.FAILED
        assert result.translated_text is None  # no invented output
        assert result.error_code == "timeout"
        assert result.error_message == "Timed out"
        assert result.source_text == "hello"  # source preserved
        assert result.succeeded is False
        assert result.failed is True

    def test_make_failure_unsupported_pair_status(self) -> None:
        result = make_failure(
            source_text="bonjour",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
            error_code="unsupported_pair",
            error_message="French not supported",
            status=TranslationStatus.UNSUPPORTED_PAIR,
        )
        assert result.status == TranslationStatus.UNSUPPORTED_PAIR
        assert result.translated_text is None

    def test_timestamp_is_timezone_aware(self) -> None:
        result = make_success(
            source_text="x",
            translated_text="x",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
        )
        assert result.timestamp.tzinfo is not None

    def test_metadata_defaults_to_empty_dict(self) -> None:
        result = make_success(
            source_text="x",
            translated_text="y",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
        )
        assert result.metadata == {}

    def test_to_dict_has_all_required_keys(self) -> None:
        result = make_success(
            source_text="hello",
            translated_text="नमस्ते",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
        )
        d = result.to_dict()
        assert d["source_text"] == "hello"
        assert d["translated_text"] == "नमस्ते"
        assert d["source_language"] == "en"
        assert d["target_language"] == "hi"
        assert d["status"] == "success"
        assert d["error_code"] is None
        assert d["provider"] == "test"
        assert "timestamp" in d

    def test_to_dict_failure_has_null_translated_text(self) -> None:
        result = make_failure(
            source_text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
            error_code="err",
            error_message="Something went wrong",
        )
        d = result.to_dict()
        assert d["translated_text"] is None
        assert d["error_code"] == "err"

    def test_source_text_preserved_in_success(self) -> None:
        original = "The patient has a fever of 102."
        result = make_success(
            source_text=original,
            translated_text="मरीज को 102 का बुखार है।",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
        )
        assert result.source_text == original  # not modified

    def test_source_text_preserved_in_failure(self) -> None:
        original = "Some important text"
        result = make_failure(
            source_text=original,
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
            provider="test",
            error_code="err",
            error_message="err",
        )
        assert result.source_text == original  # not modified

    def test_all_three_statuses_are_defined(self) -> None:
        values = {s.value for s in TranslationStatus}
        assert "success" in values
        assert "failed" in values
        assert "unsupported_pair" in values


# ===========================================================================
# Section 2 — UnsupportedLanguagePairError
# ===========================================================================

class TestUnsupportedLanguagePairError:
    def test_error_carries_source_and_target(self) -> None:
        exc = UnsupportedLanguagePairError("en", "fr")
        assert exc.source == "en"
        assert exc.target == "fr"
        assert "en" in str(exc)
        assert "fr" in str(exc)

    def test_is_translation_provider_error_subclass(self) -> None:
        from sahayak.providers.base import TranslationProviderError
        exc = UnsupportedLanguagePairError("en", "fr")
        assert isinstance(exc, TranslationProviderError)


# ===========================================================================
# Section 3 — MockTranslationProvider: EN → HI
# ===========================================================================

class TestMockTranslationEnToHi:
    @pytest.mark.asyncio
    async def test_hello_translates_to_hindi(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.succeeded
        assert result.translated_text == "नमस्ते"
        assert result.source_text == "hello"

    @pytest.mark.asyncio
    async def test_en_to_hi_vocabulary_hit(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="The patient has a fever",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.succeeded
        assert result.translated_text == "मरीज को बुखार है"
        assert result.metadata.get("vocabulary_hit") is True

    @pytest.mark.asyncio
    async def test_en_to_hi_unknown_text_gets_marker_wrapper(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="something completely unknown xyz",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.succeeded
        assert result.translated_text is not None
        assert "[MOCK:HI:" in result.translated_text
        assert result.metadata.get("vocabulary_hit") is False

    @pytest.mark.asyncio
    async def test_en_to_hi_preserves_original_case_in_source(self) -> None:
        provider = MockTranslationProvider()
        original = "Hello World"
        result = await provider.translate(
            text=original,
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.source_text == original  # exact original, not lowercased

    @pytest.mark.asyncio
    async def test_en_to_hi_result_carries_correct_languages(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.source_language == LanguageCode.ENGLISH
        assert result.target_language == LanguageCode.HINDI


# ===========================================================================
# Section 4 — MockTranslationProvider: HI → EN
# ===========================================================================

class TestMockTranslationHiToEn:
    @pytest.mark.asyncio
    async def test_namaste_translates_to_hello(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="नमस्ते",
            source_language=LanguageCode.HINDI,
            target_language=LanguageCode.ENGLISH,
        )
        assert result.succeeded
        assert result.translated_text == "hello"

    @pytest.mark.asyncio
    async def test_hi_to_en_result_carries_correct_languages(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="ठीक है",
            source_language=LanguageCode.HINDI,
            target_language=LanguageCode.ENGLISH,
        )
        assert result.succeeded
        assert result.source_language == LanguageCode.HINDI
        assert result.target_language == LanguageCode.ENGLISH

    @pytest.mark.asyncio
    async def test_hi_to_en_unknown_text_gets_marker_wrapper(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="अज्ञात पाठ",
            source_language=LanguageCode.HINDI,
            target_language=LanguageCode.ENGLISH,
        )
        assert result.succeeded
        assert "[MOCK:EN:" in (result.translated_text or "")

    @pytest.mark.asyncio
    async def test_hi_to_en_source_text_preserved(self) -> None:
        provider = MockTranslationProvider()
        original = "मुझे बुखार है"
        result = await provider.translate(
            text=original,
            source_language=LanguageCode.HINDI,
            target_language=LanguageCode.ENGLISH,
        )
        assert result.source_text == original


# ===========================================================================
# Section 5 — MockTranslationProvider: validation and error cases
# ===========================================================================

class TestMockTranslationErrors:
    @pytest.mark.asyncio
    async def test_empty_string_returns_failed_result(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.failed
        assert result.translated_text is None
        assert result.error_code == "empty_input"

    @pytest.mark.asyncio
    async def test_whitespace_only_returns_failed_result(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="   ",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.failed
        assert result.error_code == "empty_input"
        assert result.translated_text is None  # no invented output

    @pytest.mark.asyncio
    async def test_same_source_and_target_language_is_unsupported(self) -> None:
        """EN→EN and HI→HI are not in the supported pairs."""
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.ENGLISH,
        )
        assert result.status == TranslationStatus.UNSUPPORTED_PAIR
        assert result.error_code == "unsupported_pair"
        assert result.translated_text is None

    @pytest.mark.asyncio
    async def test_fail_on_translate_returns_failed_result(self) -> None:
        provider = MockTranslationProvider(fail_on_translate=True)
        result = await provider.translate(
            text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.failed
        assert result.error_code == "mock_error"
        assert result.translated_text is None  # no invented output

    @pytest.mark.asyncio
    async def test_source_text_preserved_even_on_empty_input_failure(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.source_text == ""

    @pytest.mark.asyncio
    async def test_call_log_records_each_invocation(self) -> None:
        provider = MockTranslationProvider()
        await provider.translate(
            text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        await provider.translate(
            text="world",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert len(provider.call_log) == 2
        assert provider.call_log[0]["text"] == "hello"
        assert provider.call_log[1]["text"] == "world"

    @pytest.mark.asyncio
    async def test_provider_name_is_mock_translation(self) -> None:
        provider = MockTranslationProvider()
        result = await provider.translate(
            text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert result.provider == "mock_translation"


# ===========================================================================
# Section 6 — MockTranslationProvider: timeout simulation
# ===========================================================================

class TestMockTranslationTimeout:
    @pytest.mark.asyncio
    async def test_delay_causes_asyncio_timeout(self) -> None:
        provider = MockTranslationProvider(delay_seconds=10.0)
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(
                provider.translate(
                    text="hello",
                    source_language=LanguageCode.ENGLISH,
                    target_language=LanguageCode.HINDI,
                ),
                timeout=0.05,
            )


# ===========================================================================
# Section 7 — GoogleTranslationProvider: configuration
# ===========================================================================

class TestGoogleProviderConfiguration:
    def test_requires_non_empty_api_key(self) -> None:
        with pytest.raises(TranslationProviderConfigurationError):
            GoogleTranslationProvider(api_key="")

    def test_requires_non_whitespace_api_key(self) -> None:
        with pytest.raises(TranslationProviderConfigurationError):
            GoogleTranslationProvider(api_key="   ")

    def test_valid_initialization(self) -> None:
        provider = GoogleTranslationProvider(api_key="real-key")
        assert provider.name == "google_translate"

    def test_custom_timeout(self) -> None:
        provider = GoogleTranslationProvider(api_key="key", timeout_seconds=5.0)
        assert provider._timeout == 5.0


# ===========================================================================
# Section 8 — GoogleTranslationProvider: HTTP mocking
# ===========================================================================

_PATCH = "sahayak.providers.translation.httpx"


def _mock_httpx_client(response_json: dict, status_code: int = 200) -> MagicMock:
    """Return a mock httpx.AsyncClient context manager."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = response_json
    resp.text = json.dumps(response_json)

    client = AsyncMock()
    client.post = AsyncMock(return_value=resp)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    httpx_mock = MagicMock()
    httpx_mock.AsyncClient = MagicMock(return_value=client)
    return httpx_mock, client


class TestGoogleProviderHTTP:
    def _make_provider(self) -> GoogleTranslationProvider:
        return GoogleTranslationProvider(api_key="test-api-key", timeout_seconds=5.0)

    @pytest.mark.asyncio
    async def test_successful_en_to_hi_response(self) -> None:
        provider = self._make_provider()
        api_response = {
            "data": {
                "translations": [{"translatedText": "नमस्ते", "detectedSourceLanguage": "en"}]
            }
        }
        httpx_mock, _ = _mock_httpx_client(api_response)
        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )
        assert result.succeeded
        assert result.translated_text == "नमस्ते"
        assert result.source_text == "hello"
        assert result.provider == "google_translate"

    @pytest.mark.asyncio
    async def test_successful_hi_to_en_response(self) -> None:
        provider = self._make_provider()
        api_response = {
            "data": {
                "translations": [{"translatedText": "hello", "detectedSourceLanguage": "hi"}]
            }
        }
        httpx_mock, _ = _mock_httpx_client(api_response)
        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="नमस्ते",
                source_language=LanguageCode.HINDI,
                target_language=LanguageCode.ENGLISH,
            )
        assert result.succeeded
        assert result.translated_text == "hello"

    @pytest.mark.asyncio
    async def test_http_403_returns_failed_result(self) -> None:
        provider = self._make_provider()
        err_body = {"error": {"message": "API key invalid", "code": 403}}
        httpx_mock, _ = _mock_httpx_client(err_body, status_code=403)
        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )
        assert result.failed
        assert result.error_code == "http_error"
        assert result.translated_text is None
        assert result.source_text == "hello"

    @pytest.mark.asyncio
    async def test_http_500_returns_failed_result(self) -> None:
        provider = self._make_provider()
        httpx_mock, _ = _mock_httpx_client({"error": {"message": "Internal server error"}}, status_code=500)
        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )
        assert result.failed
        assert result.error_code == "http_error"

    @pytest.mark.asyncio
    async def test_timeout_returns_failed_result(self) -> None:
        provider = self._make_provider()

        async def _slow_post(*args, **kwargs):
            await asyncio.sleep(100)

        httpx_mock = MagicMock()
        client = AsyncMock()
        client.post = AsyncMock(side_effect=asyncio.TimeoutError())
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        httpx_mock.AsyncClient = MagicMock(return_value=client)

        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )
        assert result.failed
        assert result.error_code == "timeout"
        assert result.translated_text is None
        assert result.source_text == "hello"

    @pytest.mark.asyncio
    async def test_network_error_returns_failed_result(self) -> None:
        provider = self._make_provider()

        httpx_mock = MagicMock()
        client = AsyncMock()
        client.post = AsyncMock(side_effect=ConnectionError("Network unreachable"))
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        httpx_mock.AsyncClient = MagicMock(return_value=client)

        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )
        assert result.failed
        assert result.error_code == "provider_error"
        assert result.translated_text is None

    @pytest.mark.asyncio
    async def test_google_provider_empty_input_short_circuits(self) -> None:
        """Empty input is caught before any HTTP call is made."""
        provider = self._make_provider()
        httpx_mock = MagicMock()
        httpx_mock.AsyncClient = MagicMock()

        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )
        assert result.failed
        assert result.error_code == "empty_input"
        # No HTTP call made
        httpx_mock.AsyncClient.assert_not_called()

    @pytest.mark.asyncio
    async def test_google_provider_unsupported_pair_short_circuits(self) -> None:
        provider = self._make_provider()
        httpx_mock = MagicMock()
        httpx_mock.AsyncClient = MagicMock()

        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.ENGLISH,
            )
        assert result.status == TranslationStatus.UNSUPPORTED_PAIR
        httpx_mock.AsyncClient.assert_not_called()

    @pytest.mark.asyncio
    async def test_source_text_never_modified_in_google_success(self) -> None:
        provider = self._make_provider()
        api_response = {
            "data": {"translations": [{"translatedText": "नमस्ते"}]}
        }
        httpx_mock, _ = _mock_httpx_client(api_response)
        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="  Hello World  ",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )
        assert result.source_text == "  Hello World  "  # exact original preserved

    @pytest.mark.asyncio
    async def test_response_metadata_includes_detected_language(self) -> None:
        provider = self._make_provider()
        api_response = {
            "data": {
                "translations": [{"translatedText": "नमस्ते", "detectedSourceLanguage": "en"}]
            }
        }
        httpx_mock, _ = _mock_httpx_client(api_response)
        with patch(_PATCH, httpx_mock):
            result = await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )
        assert result.metadata.get("detected_source_language") == "en"


# ===========================================================================
# Section 9 — Registry integration
# ===========================================================================

class TestRegistryTranslation:
    def test_default_registry_uses_mock_translation_provider(self) -> None:
        settings = _test_settings()
        registry = build_provider_registry(settings)
        assert isinstance(registry.translation, MockTranslationProvider)

    def test_explicit_mock_translation_provider(self) -> None:
        settings = _test_settings(TRANSLATION_PROVIDER_NAME="mock")
        registry = build_provider_registry(settings)
        assert isinstance(registry.translation, MockTranslationProvider)

    def test_placeholder_translation_provider(self) -> None:
        settings = _test_settings(TRANSLATION_PROVIDER_NAME="placeholder")
        registry = build_provider_registry(settings)
        assert isinstance(registry.translation, PlaceholderTranslationProvider)

    def test_google_registry_requires_api_key(self) -> None:
        with pytest.raises(ValueError):
            _test_settings(TRANSLATION_PROVIDER_NAME="google")

    def test_google_registry_with_api_key(self) -> None:
        settings = _test_settings(
            TRANSLATION_PROVIDER_NAME="google",
            TRANSLATION_API_KEY="real-google-key",
        )
        registry = build_provider_registry(settings)
        assert isinstance(registry.translation, GoogleTranslationProvider)

    def test_invalid_translation_provider_name_raises(self) -> None:
        with pytest.raises(ValueError):
            _test_settings(TRANSLATION_PROVIDER_NAME="azure")


# ===========================================================================
# Section 10 — Config validation
# ===========================================================================

class TestConfigTranslationValidation:
    def test_translation_provider_name_defaults_to_mock(self) -> None:
        settings = _test_settings()
        assert settings.translation_provider_name == "mock"

    def test_translation_timeout_defaults_to_10(self) -> None:
        settings = _test_settings()
        assert settings.translation_timeout_seconds == 10.0

    def test_custom_translation_timeout(self) -> None:
        settings = _test_settings(TRANSLATION_TIMEOUT_SECONDS=5.0)
        assert settings.translation_timeout_seconds == 5.0

    def test_google_without_key_raises_validation_error(self) -> None:
        with pytest.raises(ValueError, match="TRANSLATION_API_KEY"):
            _test_settings(TRANSLATION_PROVIDER_NAME="google")

    def test_google_with_key_is_valid(self) -> None:
        settings = _test_settings(
            TRANSLATION_PROVIDER_NAME="google",
            TRANSLATION_API_KEY="gcp-key",
        )
        assert settings.translation_provider_name == "google"

    def test_placeholder_provider_name_is_valid(self) -> None:
        settings = _test_settings(TRANSLATION_PROVIDER_NAME="placeholder")
        assert settings.translation_provider_name == "placeholder"


# ===========================================================================
# Section 11 — PlaceholderTranslationProvider
# ===========================================================================

class TestPlaceholderTranslationProvider:
    @pytest.mark.asyncio
    async def test_placeholder_raises_unimplemented(self) -> None:
        from sahayak.providers.base import UnimplementedProviderError
        provider = PlaceholderTranslationProvider()
        with pytest.raises(UnimplementedProviderError):
            await provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            )

    def test_placeholder_name(self) -> None:
        provider = PlaceholderTranslationProvider()
        assert provider.name == "placeholder"


# ===========================================================================
# Section 12 — End-to-end round-trip (mock provider)
# ===========================================================================

class TestTranslationRoundTrip:
    @pytest.mark.asyncio
    async def test_en_to_hi_to_en_round_trip(self) -> None:
        """A text translated EN→HI then HI→EN should yield recognizable output."""
        provider = MockTranslationProvider()

        en_hi = await provider.translate(
            text="hello",
            source_language=LanguageCode.ENGLISH,
            target_language=LanguageCode.HINDI,
        )
        assert en_hi.succeeded
        assert en_hi.translated_text == "नमस्ते"

        hi_en = await provider.translate(
            text=en_hi.translated_text,
            source_language=LanguageCode.HINDI,
            target_language=LanguageCode.ENGLISH,
        )
        assert hi_en.succeeded
        assert hi_en.translated_text == "hello"

    @pytest.mark.asyncio
    async def test_each_result_is_independent(self) -> None:
        """Multiple concurrent translations don't interfere."""
        provider = MockTranslationProvider()
        results = await asyncio.gather(
            provider.translate(
                text="hello",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            ),
            provider.translate(
                text="doctor",
                source_language=LanguageCode.ENGLISH,
                target_language=LanguageCode.HINDI,
            ),
            provider.translate(
                text="नमस्ते",
                source_language=LanguageCode.HINDI,
                target_language=LanguageCode.ENGLISH,
            ),
        )
        assert results[0].translated_text == "नमस्ते"
        assert results[1].translated_text == "डॉक्टर"
        assert results[2].translated_text == "hello"
        # Each result preserves its own source text
        assert results[0].source_text == "hello"
        assert results[1].source_text == "doctor"
        assert results[2].source_text == "नमस्ते"
