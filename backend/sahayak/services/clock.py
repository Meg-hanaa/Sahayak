"""Injectable clocks so session expiration can be tested deterministically."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime:
        """Return the current UTC time."""


class SystemClock:
    """Wall-clock time in UTC."""

    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class FakeClock:
    """Mutable clock used by tests."""

    def __init__(self, current: datetime | None = None) -> None:
        self._current = current or datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc)

    def now(self) -> datetime:
        return self._current

    def advance(self, seconds: float) -> None:
        self._current = self._current + timedelta(seconds=seconds)
