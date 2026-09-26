"""Phase 2: Streaming speech pipeline tests.

All tests use the MockSpeechToTextProvider or unit-test the AssemblyAI
provider internals in isolation — no live network calls are made.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from sahayak.domain.enums import LanguageCode, ParticipantRole
from sahayak.domain.events import SpeechEvent, SpeechEventType
from sahayak.providers.assemblyai import (
    AssemblyAIProvider,
    _make_event,
)
from sahayak.providers.base import (
    SpeechProviderConfigurationError,
    SpeechProviderError,
)
from sahayak.providers.mock import MockSpeechToTextProvider


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _ids() -> tuple[UUID, UUID]:
    return uuid4(), uuid4()


def _make_collector() -> tuple[list[SpeechEvent], Any]:
    """Return (events_list, on_event_coroutine_handler)."""
    received: list[SpeechEvent] = []

    async def handler(event: SpeechEvent) -> None:
        received.append(event)

    return received, handler


# ===========================================================================
# Section 1 — Normalized event model
# ===========================================================================

class TestNormalizedEventModel:
    def test_speech_event_contains_required_metadata(self) -> None:
        sid, pid = _ids()
        event = _make_event(
            event_type=SpeechEventType.PARTIAL_TRANSCRIPT,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            transcript="Hello",
        )
        assert event.type == SpeechEventType.PARTIAL_TRANSCRIPT
        assert event.session_id == sid
        assert event.participant_id == pid
        assert event.role == ParticipantRole.DOCTOR
        assert event.language == LanguageCode.ENGLISH
        assert event.transcript == "Hello"
        assert isinstance(event.timestamp, datetime)
        assert event.timestamp.tzinfo is not None  # timezone-aware

    def test_all_five_event_types_are_defined(self) -> None:
        types = {e.value for e in SpeechEventType}
        assert "partial_transcript" in types
        assert "final_transcript" in types
        assert "provider_error" in types
        assert "stream_started" in types
        assert "stream_ended" in types

    def test_event_serializable_to_websocket_dict(self) -> None:
        sid, pid = _ids()
        event = _make_event(
            event_type=SpeechEventType.FINAL_TRANSCRIPT,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.PATIENT,
            language=LanguageCode.HINDI,
            transcript="नमस्ते",
            confidence=0.95,
        )
        msg = event.to_websocket_message()
        assert msg["type"] == "final_transcript"
        assert msg["role"] == "patient"
        assert msg["language"] == "hi"
        assert msg["transcript"] == "नमस्ते"
        assert msg["confidence"] == 0.95

    def test_error_event_has_error_fields(self) -> None:
        sid, pid = _ids()
        event = _make_event(
            event_type=SpeechEventType.PROVIDER_ERROR,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            error_code="timeout",
            error_message="Connection timed out",
        )
        assert event.error_code == "timeout"
        assert event.error_message == "Connection timed out"
        assert event.transcript is None

    def test_confidence_data_dict_is_optional(self) -> None:
        sid, pid = _ids()
        event = _make_event(
            event_type=SpeechEventType.PARTIAL_TRANSCRIPT,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
        )
        assert event.confidence is None
        assert event.confidence_data is None

    def test_metadata_defaults_to_empty_dict(self) -> None:
        sid, pid = _ids()
        event = _make_event(
            event_type=SpeechEventType.STREAM_STARTED,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.PATIENT,
            language=LanguageCode.HINDI,
        )
        assert event.metadata == {}


# ===========================================================================
# Section 2 — Mock provider: stream lifecycle
# ===========================================================================

class TestMockProviderLifecycle:
    @pytest.mark.asyncio
    async def test_start_stream_emits_stream_started_event(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert len(received) == 1
        assert received[0].type == SpeechEventType.STREAM_STARTED
        assert received[0].session_id == sid
        assert received[0].participant_id == pid

    @pytest.mark.asyncio
    async def test_stream_is_marked_active_after_start(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        _, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.PATIENT,
            language=LanguageCode.HINDI,
            on_event=handler,
        )

        assert provider.is_active(sid, pid)

    @pytest.mark.asyncio
    async def test_close_stream_emits_stream_ended_event(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.close_stream(session_id=sid, participant_id=pid)

        types = [e.type for e in received]
        assert SpeechEventType.STREAM_STARTED in types
        assert SpeechEventType.STREAM_ENDED in types

    @pytest.mark.asyncio
    async def test_stream_is_no_longer_active_after_close(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        _, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.close_stream(session_id=sid, participant_id=pid)

        assert not provider.is_active(sid, pid)

    @pytest.mark.asyncio
    async def test_closing_non_existent_stream_is_a_noop(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        # Should not raise
        await provider.close_stream(session_id=sid, participant_id=pid)

    @pytest.mark.asyncio
    async def test_multiple_participants_tracked_independently(self) -> None:
        provider = MockSpeechToTextProvider()
        sid = uuid4()
        pid_doc = uuid4()
        pid_pat = uuid4()
        _, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid_doc,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.start_stream(
            session_id=sid,
            participant_id=pid_pat,
            role=ParticipantRole.PATIENT,
            language=LanguageCode.HINDI,
            on_event=handler,
        )

        assert provider.is_active(sid, pid_doc)
        assert provider.is_active(sid, pid_pat)

        await provider.close_stream(session_id=sid, participant_id=pid_doc)
        assert not provider.is_active(sid, pid_doc)
        assert provider.is_active(sid, pid_pat)


# ===========================================================================
# Section 3 — Mock provider: transcript injection
# ===========================================================================

class TestMockProviderTranscripts:
    @pytest.mark.asyncio
    async def test_inject_partial_transcript(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.inject_partial(sid, pid, "Hello wor")

        partials = [e for e in received if e.type == SpeechEventType.PARTIAL_TRANSCRIPT]
        assert len(partials) == 1
        assert partials[0].transcript == "Hello wor"
        assert partials[0].role == ParticipantRole.DOCTOR
        assert partials[0].language == LanguageCode.ENGLISH

    @pytest.mark.asyncio
    async def test_inject_final_transcript(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.PATIENT,
            language=LanguageCode.HINDI,
            on_event=handler,
        )
        await provider.inject_final(sid, pid, "नमस्ते दुनिया", confidence=0.97)

        finals = [e for e in received if e.type == SpeechEventType.FINAL_TRANSCRIPT]
        assert len(finals) == 1
        assert finals[0].transcript == "नमस्ते दुनिया"
        assert finals[0].confidence == 0.97
        assert finals[0].role == ParticipantRole.PATIENT
        assert finals[0].language == LanguageCode.HINDI

    @pytest.mark.asyncio
    async def test_inject_multiple_partials_then_final(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.inject_partial(sid, pid, "The patient has")
        await provider.inject_partial(sid, pid, "The patient has a fever")
        await provider.inject_final(sid, pid, "The patient has a fever of 102.")

        event_types = [e.type for e in received]
        assert event_types.count(SpeechEventType.PARTIAL_TRANSCRIPT) == 2
        assert event_types.count(SpeechEventType.FINAL_TRANSCRIPT) == 1

    @pytest.mark.asyncio
    async def test_emitted_events_list_tracks_all_events(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        _, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.inject_partial(sid, pid, "partial")
        await provider.inject_final(sid, pid, "final text")
        await provider.close_stream(session_id=sid, participant_id=pid)

        types = [e.type for e in provider.emitted_events]
        assert SpeechEventType.STREAM_STARTED in types
        assert SpeechEventType.PARTIAL_TRANSCRIPT in types
        assert SpeechEventType.FINAL_TRANSCRIPT in types
        assert SpeechEventType.STREAM_ENDED in types

    @pytest.mark.asyncio
    async def test_inject_on_inactive_stream_raises(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()

        with pytest.raises(ValueError, match="No active stream"):
            await provider.inject_partial(sid, pid, "orphan transcript")


# ===========================================================================
# Section 4 — Mock provider: audio sending
# ===========================================================================

class TestMockProviderAudioSending:
    @pytest.mark.asyncio
    async def test_send_audio_stored_in_chunks(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        _, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        chunk1 = b"\x00\x01\x02\x03"
        chunk2 = b"\x04\x05\x06\x07"
        await provider.send_audio(session_id=sid, participant_id=pid, chunk=chunk1)
        await provider.send_audio(session_id=sid, participant_id=pid, chunk=chunk2)

        chunks = provider.received_chunks_for(sid, pid)
        assert chunks == [chunk1, chunk2]

    @pytest.mark.asyncio
    async def test_send_audio_without_active_stream_raises(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()

        with pytest.raises(SpeechProviderError, match="No active stream"):
            await provider.send_audio(session_id=sid, participant_id=pid, chunk=b"\x00")


# ===========================================================================
# Section 5 — Mock provider: error injection and failure modes
# ===========================================================================

class TestMockProviderErrors:
    @pytest.mark.asyncio
    async def test_inject_error_emits_provider_error_event(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.inject_error(sid, pid, error_code="timeout", error_message="Read timeout")

        errors = [e for e in received if e.type == SpeechEventType.PROVIDER_ERROR]
        assert len(errors) == 1
        assert errors[0].error_code == "timeout"
        assert errors[0].error_message == "Read timeout"

    @pytest.mark.asyncio
    async def test_fail_on_start_raises_speech_provider_error(self) -> None:
        provider = MockSpeechToTextProvider(fail_on_start=True)
        sid, pid = _ids()
        _, handler = _make_collector()

        with pytest.raises(SpeechProviderError):
            await provider.start_stream(
                session_id=sid,
                participant_id=pid,
                role=ParticipantRole.DOCTOR,
                language=LanguageCode.ENGLISH,
                on_event=handler,
            )

    @pytest.mark.asyncio
    async def test_fail_on_send_raises_speech_provider_error(self) -> None:
        provider = MockSpeechToTextProvider(fail_on_send=True)
        sid, pid = _ids()
        _, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        with pytest.raises(SpeechProviderError):
            await provider.send_audio(session_id=sid, participant_id=pid, chunk=b"\x00")


# ===========================================================================
# Section 6 — Mock provider: role-language metadata correctness
# ===========================================================================

class TestRoleLanguageMetadata:
    @pytest.mark.asyncio
    async def test_doctor_stream_carries_english_metadata(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.inject_final(sid, pid, "Prescribing 500mg amoxicillin")

        finals = [e for e in received if e.type == SpeechEventType.FINAL_TRANSCRIPT]
        assert finals[0].role == ParticipantRole.DOCTOR
        assert finals[0].language == LanguageCode.ENGLISH

    @pytest.mark.asyncio
    async def test_patient_stream_carries_hindi_metadata(self) -> None:
        provider = MockSpeechToTextProvider()
        sid, pid = _ids()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.PATIENT,
            language=LanguageCode.HINDI,
            on_event=handler,
        )
        await provider.inject_final(sid, pid, "मुझे बुखार है")

        finals = [e for e in received if e.type == SpeechEventType.FINAL_TRANSCRIPT]
        assert finals[0].role == ParticipantRole.PATIENT
        assert finals[0].language == LanguageCode.HINDI

    @pytest.mark.asyncio
    async def test_both_roles_concurrently_preserve_metadata(self) -> None:
        provider = MockSpeechToTextProvider()
        sid = uuid4()
        doc_pid = uuid4()
        pat_pid = uuid4()
        received, handler = _make_collector()

        await provider.start_stream(
            session_id=sid,
            participant_id=doc_pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )
        await provider.start_stream(
            session_id=sid,
            participant_id=pat_pid,
            role=ParticipantRole.PATIENT,
            language=LanguageCode.HINDI,
            on_event=handler,
        )

        await provider.inject_final(sid, doc_pid, "Take this medicine")
        await provider.inject_final(sid, pat_pid, "ठीक है")

        finals = [e for e in received if e.type == SpeechEventType.FINAL_TRANSCRIPT]
        assert len(finals) == 2

        doc_event = next(e for e in finals if e.role == ParticipantRole.DOCTOR)
        pat_event = next(e for e in finals if e.role == ParticipantRole.PATIENT)

        assert doc_event.language == LanguageCode.ENGLISH
        assert doc_event.transcript == "Take this medicine"
        assert pat_event.language == LanguageCode.HINDI
        assert pat_event.transcript == "ठीक है"


# ===========================================================================
# Section 7 — AssemblyAI provider: Turn message parsing (unit tests)
# ===========================================================================

class TestAssemblyAITurnParsing:
    """Test _handle_turn in isolation without any WebSocket connection."""

    def _make_provider(self) -> AssemblyAIProvider:
        return AssemblyAIProvider(
            api_key="test-key",
            streaming_url="wss://fake.assemblyai.com/v3/ws",
        )

    @pytest.mark.asyncio
    async def test_turn_with_end_of_turn_false_emits_partial(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        msg = {
            "type": "Turn",
            "turn_order": 0,
            "end_of_turn": False,
            "transcript": "Hello wor",
            "turn_is_formatted": False,
            "words": [],
        }
        await provider._handle_turn(
            msg=msg,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert len(received) == 1
        assert received[0].type == SpeechEventType.PARTIAL_TRANSCRIPT
        assert received[0].transcript == "Hello wor"

    @pytest.mark.asyncio
    async def test_turn_with_end_of_turn_true_emits_final(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        msg = {
            "type": "Turn",
            "turn_order": 1,
            "end_of_turn": True,
            "transcript": "Hello world.",
            "turn_is_formatted": True,
            "words": [
                {"text": "Hello", "start": 0, "end": 300, "confidence": 0.99},
                {"text": "world.", "start": 350, "end": 700, "confidence": 0.97},
            ],
        }
        await provider._handle_turn(
            msg=msg,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert received[0].type == SpeechEventType.FINAL_TRANSCRIPT
        assert received[0].transcript == "Hello world."
        assert received[0].confidence is not None
        assert abs(received[0].confidence - 0.98) < 0.01  # mean of 0.99 + 0.97

    @pytest.mark.asyncio
    async def test_turn_with_words_populates_confidence_data(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        msg = {
            "type": "Turn",
            "turn_order": 0,
            "end_of_turn": True,
            "transcript": "Test",
            "turn_is_formatted": True,
            "words": [
                {"text": "Test", "start": 0, "end": 400, "confidence": 0.90},
            ],
        }
        await provider._handle_turn(
            msg=msg,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        cd = received[0].confidence_data
        assert cd is not None
        assert "word_confidences" in cd
        assert cd["word_confidences"][0]["word"] == "Test"
        assert cd["word_confidences"][0]["start_ms"] == 0
        assert cd["word_confidences"][0]["end_ms"] == 400
        assert "mean_confidence" in cd

    @pytest.mark.asyncio
    async def test_turn_with_empty_words_has_no_confidence(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        msg = {
            "type": "Turn",
            "turn_order": 0,
            "end_of_turn": False,
            "transcript": "partial",
            "words": [],
        }
        await provider._handle_turn(
            msg=msg,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert received[0].confidence is None
        assert received[0].confidence_data is None

    @pytest.mark.asyncio
    async def test_turn_metadata_contains_turn_order_and_formatted_flag(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        msg = {
            "type": "Turn",
            "turn_order": 3,
            "end_of_turn": True,
            "transcript": "Done.",
            "turn_is_formatted": True,
            "words": [],
        }
        await provider._handle_turn(
            msg=msg,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.PATIENT,
            language=LanguageCode.HINDI,
            on_event=handler,
        )

        assert received[0].metadata["turn_order"] == 3
        assert received[0].metadata["turn_is_formatted"] is True


# ===========================================================================
# Section 8 — AssemblyAI provider: read_loop message handling (mocked WS)
# ===========================================================================

class TestAssemblyAIReadLoop:
    """Unit-test the read_loop by feeding it fake messages via an async generator."""

    def _make_provider(self) -> AssemblyAIProvider:
        return AssemblyAIProvider(api_key="fake-key")

    def _fake_ws(self, messages: list[str | bytes]) -> MagicMock:
        """Return an async-iterable mock websocket."""

        async def _aiter():
            for msg in messages:
                yield msg

        ws = MagicMock()
        ws.__aiter__ = lambda self: _aiter()
        return ws

    @pytest.mark.asyncio
    async def test_read_loop_emits_partial_for_non_end_turn(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        ws = self._fake_ws([
            json.dumps({"type": "Turn", "end_of_turn": False, "transcript": "hi", "words": []}),
        ])
        await provider._read_loop(
            ws=ws,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert len(received) == 1
        assert received[0].type == SpeechEventType.PARTIAL_TRANSCRIPT

    @pytest.mark.asyncio
    async def test_read_loop_emits_final_for_end_turn(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        ws = self._fake_ws([
            json.dumps({
                "type": "Turn",
                "end_of_turn": True,
                "transcript": "Hello world.",
                "words": [],
            }),
        ])
        await provider._read_loop(
            ws=ws,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert received[0].type == SpeechEventType.FINAL_TRANSCRIPT

    @pytest.mark.asyncio
    async def test_read_loop_handles_assemblyai_error_message(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        ws = self._fake_ws([
            json.dumps({"type": "Error", "error": "Authentication failed"}),
        ])
        await provider._read_loop(
            ws=ws,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert len(received) == 1
        assert received[0].type == SpeechEventType.PROVIDER_ERROR
        assert received[0].error_code == "assemblyai_error"
        assert "Authentication failed" in (received[0].error_message or "")

    @pytest.mark.asyncio
    async def test_read_loop_handles_malformed_json(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        ws = self._fake_ws(["not-valid-json!!!"])
        await provider._read_loop(
            ws=ws,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert len(received) == 1
        assert received[0].type == SpeechEventType.PROVIDER_ERROR
        assert received[0].error_code == "malformed_message"

    @pytest.mark.asyncio
    async def test_read_loop_silently_skips_binary_frames(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        ws = self._fake_ws([b"\x00\x01\x02"])  # unexpected binary
        await provider._read_loop(
            ws=ws,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert received == []

    @pytest.mark.asyncio
    async def test_read_loop_silently_consumes_begin_message(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        ws = self._fake_ws([
            json.dumps({"type": "Begin", "session_id": "aai-sess-123"}),
        ])
        await provider._read_loop(
            ws=ws,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert received == []

    @pytest.mark.asyncio
    async def test_read_loop_handles_multiple_turns_in_sequence(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        ws = self._fake_ws([
            json.dumps({"type": "Turn", "end_of_turn": False, "transcript": "partial one", "words": []}),
            json.dumps({"type": "Turn", "end_of_turn": False, "transcript": "partial two", "words": []}),
            json.dumps({"type": "Turn", "end_of_turn": True, "transcript": "final", "words": []}),
        ])
        await provider._read_loop(
            ws=ws,
            session_id=sid,
            participant_id=pid,
            role=ParticipantRole.DOCTOR,
            language=LanguageCode.ENGLISH,
            on_event=handler,
        )

        assert len(received) == 3
        assert received[0].type == SpeechEventType.PARTIAL_TRANSCRIPT
        assert received[1].type == SpeechEventType.PARTIAL_TRANSCRIPT
        assert received[2].type == SpeechEventType.FINAL_TRANSCRIPT


# ===========================================================================
# Section 9 — AssemblyAI provider: start_stream with mocked websockets
# ===========================================================================

class TestAssemblyAIStartStream:
    """Test start_stream by mocking the websockets.connect call.

    The patch target 'sahayak.providers.assemblyai.websockets.connect' works
    because websockets is imported at module level in assemblyai.py.
    """

    # The correct patch target: the 'websockets' name inside the assemblyai module
    _PATCH_TARGET = "sahayak.providers.assemblyai.websockets.connect"

    def _make_provider(self, timeout: float = 5.0) -> AssemblyAIProvider:
        return AssemblyAIProvider(
            api_key="test-api-key",
            streaming_url="wss://fake.assemblyai.com/v3/ws",
            timeout_seconds=timeout,
        )

    def _make_ws_mock(self, begin_payload: dict) -> tuple[AsyncMock, AsyncMock]:
        """Return (ws_mock, recv_mock) that acts like an idle WebSocket after Begin."""

        class _FakeWS:
            """Async context manager + async iterable WebSocket stand-in."""

            def __init__(self, begin_msg: str) -> None:
                self._begin_msg = begin_msg
                self.sent: list[Any] = []
                self.closed = False
                self._recv_count = 0

            async def recv(self) -> str:
                self._recv_count += 1
                if self._recv_count == 1:
                    return self._begin_msg
                # Subsequent recvs block indefinitely (simulates idle stream)
                await asyncio.sleep(3600)
                return ""

            async def send(self, data: Any) -> None:
                self.sent.append(data)

            async def close(self) -> None:
                self.closed = True

            def __aiter__(self):
                return self

            async def __anext__(self):
                raise StopAsyncIteration

        ws = _FakeWS(json.dumps(begin_payload))
        connect_mock = AsyncMock(return_value=ws)
        return connect_mock, ws  # type: ignore[return-value]

    @pytest.mark.asyncio
    async def test_start_stream_emits_stream_started_with_aai_session_id(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        received, handler = _make_collector()

        connect_mock, ws = self._make_ws_mock(
            {"type": "Begin", "session_id": "aai-test-sess-999"}
        )

        with patch(self._PATCH_TARGET, connect_mock):
            await provider.start_stream(
                session_id=sid,
                participant_id=pid,
                role=ParticipantRole.DOCTOR,
                language=LanguageCode.ENGLISH,
                on_event=handler,
            )

        # Clean up background task
        await provider.close_stream(session_id=sid, participant_id=pid)

        started = [e for e in received if e.type == SpeechEventType.STREAM_STARTED]
        assert len(started) >= 1
        assert started[0].metadata["aai_session_id"] == "aai-test-sess-999"

    @pytest.mark.asyncio
    async def test_start_stream_with_wrong_begin_type_raises(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        _, handler = _make_collector()

        connect_mock, _ = self._make_ws_mock({"type": "Error", "error": "bad auth"})

        with patch(self._PATCH_TARGET, connect_mock):
            with pytest.raises(SpeechProviderError, match="Expected AssemblyAI 'Begin'"):
                await provider.start_stream(
                    session_id=sid,
                    participant_id=pid,
                    role=ParticipantRole.DOCTOR,
                    language=LanguageCode.ENGLISH,
                    on_event=handler,
                )

    @pytest.mark.asyncio
    async def test_start_stream_connection_timeout_raises(self) -> None:
        """Use a provider with a very short timeout to trigger SpeechProviderError."""
        provider = self._make_provider(timeout=0.05)
        sid, pid = _ids()
        _, handler = _make_collector()

        async def _slow_connect(*args, **kwargs):
            await asyncio.sleep(100)

        with patch(self._PATCH_TARGET, _slow_connect):
            with pytest.raises(SpeechProviderError, match="Timed out"):
                await provider.start_stream(
                    session_id=sid,
                    participant_id=pid,
                    role=ParticipantRole.DOCTOR,
                    language=LanguageCode.ENGLISH,
                    on_event=handler,
                )

    @pytest.mark.asyncio
    async def test_send_audio_without_stream_raises(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()

        with pytest.raises(SpeechProviderError, match="No active stream"):
            await provider.send_audio(session_id=sid, participant_id=pid, chunk=b"\x00")

    @pytest.mark.asyncio
    async def test_send_audio_forwards_binary_to_websocket(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        _, handler = _make_collector()

        connect_mock, ws = self._make_ws_mock({"type": "Begin", "session_id": "s1"})

        with patch(self._PATCH_TARGET, connect_mock):
            await provider.start_stream(
                session_id=sid,
                participant_id=pid,
                role=ParticipantRole.DOCTOR,
                language=LanguageCode.ENGLISH,
                on_event=handler,
            )
            await provider.send_audio(session_id=sid, participant_id=pid, chunk=b"\xDE\xAD")
            await provider.close_stream(session_id=sid, participant_id=pid)

        assert b"\xDE\xAD" in ws.sent

    @pytest.mark.asyncio
    async def test_close_stream_sends_terminate_message(self) -> None:
        provider = self._make_provider()
        sid, pid = _ids()
        _, handler = _make_collector()

        connect_mock, ws = self._make_ws_mock({"type": "Begin", "session_id": "s2"})

        with patch(self._PATCH_TARGET, connect_mock):
            await provider.start_stream(
                session_id=sid,
                participant_id=pid,
                role=ParticipantRole.DOCTOR,
                language=LanguageCode.ENGLISH,
                on_event=handler,
            )
            await provider.close_stream(session_id=sid, participant_id=pid)

        terminate_msg = json.dumps({"type": "Terminate"})
        assert terminate_msg in ws.sent


# ===========================================================================
# Helpers
# ===========================================================================

async def _empty_async_gen():
    """Async generator that yields nothing — simulates idle WebSocket."""
    return
    yield  # noqa: unreachable — makes this a generator
