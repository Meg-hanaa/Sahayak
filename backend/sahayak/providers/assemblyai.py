"""AssemblyAI speech-to-text placeholder."""

from __future__ import annotations

from uuid import UUID

from sahayak.providers.base import SpeechToTextProvider, not_implemented


class AssemblyAIProvider(SpeechToTextProvider):
    """Placeholder for the future AssemblyAI streaming integration."""

    name = "assemblyai"

    async def start_stream(self, *, session_id: UUID, participant_id: UUID) -> None:
        not_implemented("AssemblyAI streaming")

    async def send_audio(self, *, session_id: UUID, chunk: bytes) -> None:
        not_implemented("AssemblyAI audio ingest")

    async def close_stream(self, *, session_id: UUID) -> None:
        not_implemented("AssemblyAI stream close")
