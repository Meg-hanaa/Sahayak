"""AssemblyAI real-time streaming speech-to-text provider.

Connects to the AssemblyAI Streaming v3 WebSocket API using raw ``websockets``
so that the rest of the application remains decoupled from any SDK.

Protocol summary (wss://streaming.assemblyai.com/v3/ws):
  - Auth:    ``Authorization`` header (plain API key, no "Bearer" prefix)
  - Connect: query-params for sample_rate, language_codes, format_turns
  - Begin:   first server message -> {"type": "Begin", "session_id": "..."}
  - Turn:    transcription event -> {"type": "Turn", "end_of_turn": bool, ...}
  - Audio:   binary frames (raw PCM-16, mono)
  - Terminate: send {"type": "Terminate"} to close cleanly
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import websockets
import websockets.exceptions

from sahayak.domain.enums import LanguageCode, ParticipantRole
from sahayak.domain.events import SpeechEvent, SpeechEventType
from sahayak.providers.base import (
    SpeechEventHandler,
    SpeechProviderConfigurationError,
    SpeechProviderError,
    SpeechToTextProvider,
)

logger = logging.getLogger(__name__)

# AssemblyAI Streaming v3 base URL
_ASSEMBLYAI_STREAMING_BASE = "wss://streaming.assemblyai.com/v3/ws"

# Map internal language codes to AssemblyAI language_codes list values
_LANGUAGE_MAP: dict[LanguageCode, list[str]] = {
    LanguageCode.ENGLISH: ["en"],
    LanguageCode.HINDI: ["hi"],
}


class _StreamState:
    """Per-participant active stream state."""

    __slots__ = ("ws", "aai_session_id", "language", "role", "task")

    def __init__(
        self,
        ws: Any,
        aai_session_id: str,
        language: LanguageCode,
        role: ParticipantRole,
        task: asyncio.Task[None],
    ) -> None:
        self.ws = ws
        self.aai_session_id = aai_session_id
        self.language = language
        self.role = role
        self.task = task


class AssemblyAIProvider(SpeechToTextProvider):
    """Real AssemblyAI streaming speech-to-text provider.

    Each participant gets an independent WebSocket connection to AssemblyAI.
    All AssemblyAI-specific events are translated into normalized
    SpeechEvent objects before being forwarded to the application via
    the caller-supplied ``on_event`` handler.
    """

    name = "assemblyai"

    def __init__(
        self,
        *,
        api_key: str,
        streaming_url: str = _ASSEMBLYAI_STREAMING_BASE,
        sample_rate: int = 16_000,
        timeout_seconds: float = 10.0,
    ) -> None:
        if not api_key or not api_key.strip():
            raise SpeechProviderConfigurationError(
                "AssemblyAI API key must be a non-empty string."
            )
        self._api_key = api_key.strip()
        self._streaming_url = streaming_url
        self._sample_rate = sample_rate
        self._timeout_seconds = timeout_seconds
        # (session_id, participant_id) -> _StreamState
        self._streams: dict[tuple[UUID, UUID], _StreamState] = {}

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
        """Open a WebSocket connection to AssemblyAI for this participant."""

        key = (session_id, participant_id)
        if key in self._streams:
            logger.warning(
                "Stream already active for participant",
                extra={"extra_fields": {"participant_id": str(participant_id)}},
            )
            return

        lang_codes = _LANGUAGE_MAP.get(language, ["en"])
        params: dict[str, Any] = {
            "sample_rate": self._sample_rate,
            "language_codes": json.dumps(lang_codes),
            "format_turns": "true",
        }
        url = f"{self._streaming_url}?{urlencode(params)}"
        headers = {"Authorization": self._api_key}

        try:
            ws = await asyncio.wait_for(
                websockets.connect(url, additional_headers=headers),
                timeout=self._timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            raise SpeechProviderError(
                f"Timed out connecting to AssemblyAI after {self._timeout_seconds}s"
            ) from exc
        except Exception as exc:
            raise SpeechProviderError(
                f"Failed to connect to AssemblyAI: {exc}"
            ) from exc

        # Wait for the Begin message to get the provider session id
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=self._timeout_seconds)
            begin = json.loads(raw)
        except asyncio.TimeoutError as exc:
            await ws.close()
            raise SpeechProviderError("Timed out waiting for AssemblyAI Begin message") from exc
        except Exception as exc:
            await ws.close()
            raise SpeechProviderError(f"Error reading Begin message: {exc}") from exc

        if begin.get("type") != "Begin":
            await ws.close()
            raise SpeechProviderError(
                f"Expected AssemblyAI 'Begin' message, got: {begin.get('type')!r}"
            )

        aai_session_id: str = begin.get("session_id", "")

        # Start background reader task
        task = asyncio.create_task(
            self._read_loop(
                ws=ws,
                session_id=session_id,
                participant_id=participant_id,
                role=role,
                language=language,
                on_event=on_event,
            ),
            name=f"aai-reader-{participant_id}",
        )
        self._streams[key] = _StreamState(
            ws=ws,
            aai_session_id=aai_session_id,
            language=language,
            role=role,
            task=task,
        )

        # Emit stream_started
        await on_event(
            _make_event(
                event_type=SpeechEventType.STREAM_STARTED,
                session_id=session_id,
                participant_id=participant_id,
                role=role,
                language=language,
                metadata={"aai_session_id": aai_session_id},
            )
        )
        logger.info(
            "AssemblyAI stream started",
            extra={
                "extra_fields": {
                    "participant_id": str(participant_id),
                    "aai_session_id": aai_session_id,
                    "language": language.value,
                }
            },
        )

    async def send_audio(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
        chunk: bytes,
    ) -> None:
        """Send a raw PCM-16 audio chunk to the participant's AssemblyAI stream."""

        key = (session_id, participant_id)
        state = self._streams.get(key)
        if state is None:
            raise SpeechProviderError(
                f"No active stream for participant {participant_id}"
            )
        try:
            await state.ws.send(chunk)
        except Exception as exc:
            raise SpeechProviderError(f"Error sending audio chunk: {exc}") from exc

    async def close_stream(
        self,
        *,
        session_id: UUID,
        participant_id: UUID,
    ) -> None:
        """Send Terminate, close the WebSocket, and emit stream_ended."""

        key = (session_id, participant_id)
        state = self._streams.pop(key, None)
        if state is None:
            return  # already closed or never opened

        try:
            await state.ws.send(json.dumps({"type": "Terminate"}))
        except Exception:
            pass  # best-effort terminate

        try:
            await state.ws.close()
        except Exception:
            pass

        state.task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(state.task), timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

        logger.info(
            "AssemblyAI stream closed",
            extra={"extra_fields": {"participant_id": str(participant_id)}},
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _read_loop(
        self,
        ws: Any,
        session_id: UUID,
        participant_id: UUID,
        role: ParticipantRole,
        language: LanguageCode,
        on_event: SpeechEventHandler,
    ) -> None:
        """Background coroutine: parse server messages and emit normalized events."""

        try:
            async for raw_message in ws:
                if isinstance(raw_message, bytes):
                    continue  # unexpected binary from server; skip

                try:
                    msg = json.loads(raw_message)
                except json.JSONDecodeError:
                    await on_event(
                        _make_event(
                            event_type=SpeechEventType.PROVIDER_ERROR,
                            session_id=session_id,
                            participant_id=participant_id,
                            role=role,
                            language=language,
                            error_code="malformed_message",
                            error_message=f"Non-JSON message from AssemblyAI: {raw_message[:200]}",
                        )
                    )
                    continue

                msg_type = msg.get("type")

                if msg_type == "Turn":
                    await self._handle_turn(
                        msg=msg,
                        session_id=session_id,
                        participant_id=participant_id,
                        role=role,
                        language=language,
                        on_event=on_event,
                    )
                elif msg_type == "Error":
                    error_text = msg.get("error", "Unknown error from AssemblyAI")
                    await on_event(
                        _make_event(
                            event_type=SpeechEventType.PROVIDER_ERROR,
                            session_id=session_id,
                            participant_id=participant_id,
                            role=role,
                            language=language,
                            error_code="assemblyai_error",
                            error_message=error_text,
                        )
                    )
                # Begin, Terminating, KeepAlive etc. are silently consumed

        except asyncio.CancelledError:
            pass  # normal shutdown path
        except Exception as exc:
            logger.exception("Unexpected error in AssemblyAI read loop: %s", exc)
            try:
                await on_event(
                    _make_event(
                        event_type=SpeechEventType.PROVIDER_ERROR,
                        session_id=session_id,
                        participant_id=participant_id,
                        role=role,
                        language=language,
                        error_code="read_loop_error",
                        error_message=str(exc),
                    )
                )
            except Exception:
                pass

    async def _handle_turn(
        self,
        msg: dict[str, Any],
        session_id: UUID,
        participant_id: UUID,
        role: ParticipantRole,
        language: LanguageCode,
        on_event: SpeechEventHandler,
    ) -> None:
        """Translate an AssemblyAI Turn message into a normalized SpeechEvent."""

        transcript: str = msg.get("transcript", "") or ""
        end_of_turn: bool = bool(msg.get("end_of_turn", False))
        words: list[dict[str, Any]] = msg.get("words", []) or []

        # Derive per-word confidence data and an overall confidence
        confidence_data: dict[str, Any] | None = None
        confidence: float | None = None
        if words:
            confidences = [
                w.get("confidence", 0.0)
                for w in words
                if isinstance(w.get("confidence"), (int, float))
            ]
            if confidences:
                confidence = sum(confidences) / len(confidences)
                confidence_data = {
                    "word_confidences": [
                        {
                            "word": w.get("text", ""),
                            "confidence": w.get("confidence"),
                            "start_ms": w.get("start"),
                            "end_ms": w.get("end"),
                        }
                        for w in words
                    ],
                    "mean_confidence": confidence,
                }

        event_type = (
            SpeechEventType.FINAL_TRANSCRIPT
            if end_of_turn
            else SpeechEventType.PARTIAL_TRANSCRIPT
        )

        metadata: dict[str, Any] = {
            "turn_order": msg.get("turn_order"),
            "turn_is_formatted": msg.get("turn_is_formatted", False),
        }

        await on_event(
            _make_event(
                event_type=event_type,
                session_id=session_id,
                participant_id=participant_id,
                role=role,
                language=language,
                transcript=transcript,
                confidence=confidence,
                confidence_data=confidence_data,
                metadata=metadata,
            )
        )


# ---------------------------------------------------------------------------
# Factory helper — keeps event construction in one place
# ---------------------------------------------------------------------------


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
