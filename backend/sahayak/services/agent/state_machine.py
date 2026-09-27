"""Explicit state machine for turns and session turn loops — Phase 5.

States:
- READY
- LISTENING
- PROCESSING
- CONFIRMING
- SPEAKING
- NEEDS_REPETITION
- UNRESOLVED
- ENDED
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sahayak.api.errors import InvalidStateTransitionError
from sahayak.domain.enums import TurnState


# Explicit allowed transitions between states
_ALLOWED_TRANSITIONS: dict[TurnState, frozenset[TurnState]] = {
    TurnState.READY: frozenset({
        TurnState.LISTENING,
        TurnState.PROCESSING,
        TurnState.ENDED,
    }),
    TurnState.LISTENING: frozenset({
        TurnState.PROCESSING,
        TurnState.READY,
        TurnState.ENDED,
    }),
    TurnState.PROCESSING: frozenset({
        TurnState.SPEAKING,
        TurnState.CONFIRMING,
        TurnState.NEEDS_REPETITION,
        TurnState.UNRESOLVED,
        TurnState.ENDED,
    }),
    TurnState.CONFIRMING: frozenset({
        TurnState.CONFIRMING,  # Re-prompt on ambiguous response
        TurnState.SPEAKING,    # Successful confirmation
        TurnState.UNRESOLVED,  # Rejected or failed ambiguous retry
        TurnState.READY,
        TurnState.ENDED,
    }),
    TurnState.SPEAKING: frozenset({
        TurnState.READY,
        TurnState.PROCESSING,
        TurnState.ENDED,
    }),
    TurnState.NEEDS_REPETITION: frozenset({
        TurnState.LISTENING,
        TurnState.READY,
        TurnState.SPEAKING,
        TurnState.ENDED,
    }),
    TurnState.UNRESOLVED: frozenset({
        TurnState.READY,
        TurnState.ENDED,
    }),
    TurnState.ENDED: frozenset(),  # Terminal state: cannot transition out
}


@dataclass(frozen=True)
class StateTransitionRecord:
    """Audit entry for a state transition."""

    from_state: TurnState
    to_state: TurnState
    timestamp: datetime
    reason: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class TurnStateMachine:
    """Manages explicit turn state transitions with validation and history."""

    def __init__(self, initial_state: TurnState = TurnState.READY) -> None:
        self._current_state: TurnState = initial_state
        self._history: list[StateTransitionRecord] = []

    @property
    def current_state(self) -> TurnState:
        return self._current_state

    @property
    def history(self) -> list[StateTransitionRecord]:
        return list(self._history)

    @property
    def is_terminal(self) -> bool:
        return self._current_state == TurnState.ENDED

    def can_transition_to(self, target_state: TurnState) -> bool:
        """Check if transition to target_state is allowed from current_state."""
        allowed = _ALLOWED_TRANSITIONS.get(self._current_state, frozenset())
        return target_state in allowed

    def transition_to(
        self,
        target_state: TurnState,
        reason: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> TurnState:
        """Execute a state transition or raise InvalidStateTransitionError."""
        if not self.can_transition_to(target_state):
            msg = (
                f"Cannot transition turn state from {self._current_state.value!r} "
                f"to {target_state.value!r}"
            )
            if reason:
                msg += f": {reason}"
            raise InvalidStateTransitionError(msg)

        record = StateTransitionRecord(
            from_state=self._current_state,
            to_state=target_state,
            timestamp=datetime.now(UTC),
            reason=reason,
            metadata=metadata or {},
        )
        self._history.append(record)
        self._current_state = target_state
        return self._current_state
