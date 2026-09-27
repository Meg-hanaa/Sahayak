"""Latency metrics instrumentation for speech-end to output-start — Phase 7."""

from __future__ import annotations

import math
from datetime import datetime
from typing import Sequence

from sahayak.domain.models import LatencySummary


class LatencyTracker:
    """Calculates turn-level and session-level speech-end to output-start latency metrics.

    PRD Target:
    - median < 2.5 seconds
    - p95 < 4.0 seconds
    Never claims the target has been achieved without actual measurement proof.
    """

    def __init__(self) -> None:
        self._samples: list[float] = []

    @property
    def samples(self) -> list[float]:
        return list(self._samples)

    def record_turn_latency(
        self,
        speech_end_time: datetime | None,
        output_start_time: datetime | None,
    ) -> float | None:
        """Record latency between speech-end and output-start in seconds."""
        if speech_end_time is None or output_start_time is None:
            return None

        delta = (output_start_time - speech_end_time).total_seconds()
        # Latency must be non-negative
        latency_sec = max(0.0, delta)
        self._samples.append(latency_sec)
        return latency_sec

    def record_sample(self, latency_seconds: float) -> None:
        """Directly record a measured latency sample in seconds."""
        self._samples.append(max(0.0, latency_seconds))

    def compute_summary(self, extra_samples: Sequence[float] | None = None) -> LatencySummary:
        """Compute percentile statistics and evaluate whether PRD targets are met."""
        data = list(self._samples)
        if extra_samples:
            data.extend(extra_samples)

        if not data:
            return LatencySummary(
                sample_count=0,
                min_seconds=None,
                max_seconds=None,
                median_seconds=None,
                p95_seconds=None,
                target_met=False,
            )

        sorted_data = sorted(data)
        n = len(sorted_data)

        # Median (50th percentile)
        mid = n // 2
        if n % 2 == 1:
            median = sorted_data[mid]
        else:
            median = (sorted_data[mid - 1] + sorted_data[mid]) / 2.0

        # p95 (95th percentile using standard nearest rank)
        p95_index = min(n - 1, math.ceil(0.95 * n) - 1)
        p95 = sorted_data[max(0, p95_index)]

        min_val = sorted_data[0]
        max_val = sorted_data[-1]

        # Target check: median < 2.5s and p95 < 4.0s
        target_met = (median < 2.5) and (p95 < 4.0)

        return LatencySummary(
            sample_count=n,
            min_seconds=round(min_val, 4),
            max_seconds=round(max_val, 4),
            median_seconds=round(median, 4),
            p95_seconds=round(p95, 4),
            target_met=target_met,
        )
