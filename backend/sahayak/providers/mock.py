"""Mock / fake speech-to-text provider for automated tests.

Emits deterministic :class:`~sahayak.domain.events.SpeechEvent` objects
without any network calls.  Tests control what happens by calling the
helper methods on the provider instance directly.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sahayak.domain.enums import LanguageCode, ParticipantRole
from sahayak.domain.events import SpeechEvent, SpeechEventType
from sahayak.providers.base import (
    SpeechEventHandler,
    SpeechProviderError,
    SpeechToTextProvider,
)


class MockSpeechToTextProvider(SpeechToTextProvider):
    """Controllable in-memory speech-to-text provider for testing.

    Usage in tests::

        provider = MockSpeechToTextProvider()
        await provider.start_stream(
            session_id=sid, participant_id=pid,
            role=role, language=lang, on_event=handler,
        )
        await provider.inject_partial(sid, pid, "Hello")
        await provider.inject_final(sid, pid, "Hello world.")
        await provider.close_stream(session_id=sid, participant_id=pid)
    """

    name = "mock"

    def __init__(self, *, fail_on_start: bool = False, fail_on_send: bool = False) -> None:
        # (session_id, participant_id) -> on_event handler
        self._streams: dict[tuple[UUID, UUID], _MockStreamState] = {}
        self.fail_on_start = fail_on_start
        self.fail_on_send = fail_on_send
        # Ordered list of every event emitted, for assertion
        self.emitted_events: list[SpeechEvent] = []

    # ------------------------------------------------------------------
    # SpeechToTextProvider interface
    # ------------------------------------------------------------------

    async def start_stream(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
        role: ParticipantRole,
        language: LanguageCode,
        on_event: SpeechEventHandler,
    ) -> None:
        if self.fail_on_start:
            raise SpeechProviderError("Mock provider configured to fail on start")

        key = (session_id, participant_id)
        self._streams[key] = _MockStreamState(
            session_id=session_id,
            participant_id=participant_id,
            role=role,
            language=language,
            on_event=on_event,
        )

        event = _make_event(
            event_type=SpeechEventType.STREAM_STARTED,
            session_id=session_id,
            participant_id=participant_id,
            role=role,
            language=language,
        )
        self.emitted_events.append(event)
        await on_event(event)

    async def send_audio(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
        chunk: bytes,
    ) -> None:
        if self.fail_on_send:
            raise SpeechProviderError("Mock provider configured to fail on send")

        key = (session_id, participant_id)
        if key not in self._streams:
            raise SpeechProviderError(
                f"No active stream for participant {participant_id}"
            )
        # Mock simply tracks the received bytes; no transcription happens
        self._streams[key].received_chunks.append(chunk)

    async def close_stream(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
    ) -> None:
        key = (session_id, participant_id)
        state = self._streams.pop(key, None)
        if state is None:
            return

        event = _make_event(
            event_type=SpeechEventType.STREAM_ENDED,
            session_id=session_id,
            participant_id=participant_id,
            role=state.role,
            language=state.language,
        )
        self.emitted_events.append(event)
        await state.on_event(event)

    # ------------------------------------------------------------------
    # Test-control helpers
    # ------------------------------------------------------------------

    async def inject_partial(
        self,
        session_id: UUID,
        participant_id: UUID,
        transcript: str,
        confidence: float | None = None,
    ) -> None:
        """Emit a partial transcript event for the given participant."""
        await self._inject(
            session_id=session_id,
            participant_id=participant_id,
            event_type=SpeechEventType.PARTIAL_TRANSCRIPT,
            transcript=transcript,
            confidence=confidence,
        )

    async def inject_final(
        self,
        session_id: UUID,
        participant_id: UUID,
        transcript: str,
        confidence: float | None = None,
    ) -> None:
        """Emit a final transcript event for the given participant."""
        await self._inject(
            session_id=session_id,
            participant_id=participant_id,
            event_type=SpeechEventType.FINAL_TRANSCRIPT,
            transcript=transcript,
            confidence=confidence,
        )

    async def inject_error(
        self,
        session_id: UUID,
        participant_id: UUID,
        error_code: str = "mock_error",
        error_message: str = "Mock provider error",
    ) -> None:
        """Emit a provider_error event for the given participant."""
        key = (session_id, participant_id)
        state = self._streams.get(key)
        if state is None:
            raise ValueError(f"No active stream for participant {participant_id}")

        event = _make_event(
            event_type=SpeechEventType.PROVIDER_ERROR,
            session_id=session_id,
            participant_id=participant_id,
            role=state.role,
            language=state.language,
            error_code=error_code,
            error_message=error_message,
        )
        self.emitted_events.append(event)
        await state.on_event(event)

    def is_active(self, session_id: UUID, participant_id: UUID) -> bool:
        """Return True if a stream is currently active for this participant."""
        return (session_id, participant_id) in self._streams

    def received_chunks_for(self, session_id: UUID, participant_id: UUID) -> list[bytes]:
        """Return all audio chunks received for the given participant."""
        key = (session_id, participant_id)
        state = self._streams.get(key)
        return list(state.received_chunks) if state else []

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _inject(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
        event_type: SpeechEventType,
        transcript: str,
        confidence: float | None = None,
    ) -> None:
        key = (session_id, participant_id)
        state = self._streams.get(key)
        if state is None:
            raise ValueError(f"No active stream for participant {participant_id}")

        event = _make_event(
            event_type=event_type,
            session_id=session_id,
            participant_id=participant_id,
            role=state.role,
            language=state.language,
            transcript=transcript,
            confidence=confidence,
        )
        self.emitted_events.append(event)
        await state.on_event(event)


class _MockStreamState:
    """Internal state for one active mock stream."""

    __slots__ = (
        "session_id",
        "participant_id",
        "role",
        "language",
        "on_event",
        "received_chunks",
    )

    def __init__(
        self,
        session_id: UUID,
        participant_id: UUID,
        role: ParticipantRole,
        language: LanguageCode,
        on_event: SpeechEventHandler,
    ) -> None:
        self.session_id = session_id
        self.participant_id = participant_id
        self.role = role
        self.language = language
        self.on_event = on_event
        self.received_chunks: list[bytes] = []


def _make_event(
    *,
    event_type: SpeechEventType,
    session_id: UUID,
    participant_id: UUID,
    role: ParticipantRole,
    language: LanguageCode,
    transcript: str | None = None,
    confidence: float | None = None,
    confidence_data: dict[str, Any] | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> SpeechEvent:
    return SpeechEvent(
        type=event_type,
        session_id=session_id,
        participant_id=participant_id,
        role=role,
        language=language,
        timestamp=datetime.now(UTC),
        transcript=transcript,
        confidence=confidence,
        confidence_data=confidence_data,
        error_code=error_code,
        error_message=error_message,
        metadata=metadata or {},
    )
