"""Domain models and taxonomy for Sahayak's deterministic safety engine — Phase 4."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class CriticalFactCategory(str, Enum):
    """The 6 critical fact categories specified in the Sahayak PRD."""

    ALLERGY = "ALLERGY"
    MEDICINE = "MEDICINE"
    DOSAGE = "DOSAGE"
    SEVERE_SYMPTOM = "SEVERE_SYMPTOM"
    NEGATION = "NEGATION"
    EMERGENCY = "EMERGENCY"


class SafetyRuleId(str, Enum):
    """Deterministic, explainable rule identifiers."""

    RULE_EMERGENCY_INDICATOR = "RULE_EMERGENCY_INDICATOR"
    RULE_UNCERTAIN_CRITICAL_TERM = "RULE_UNCERTAIN_CRITICAL_TERM"
    RULE_INSUFFICIENT_CONFIDENCE = "RULE_INSUFFICIENT_CONFIDENCE"
    RULE_MISSING_CONFIDENCE = "RULE_MISSING_CONFIDENCE"
    RULE_CRITICAL_ALLERGY = "RULE_CRITICAL_ALLERGY"
    RULE_CRITICAL_MEDICINE = "RULE_CRITICAL_MEDICINE"
    RULE_CRITICAL_DOSAGE = "RULE_CRITICAL_DOSAGE"
    RULE_CRITICAL_SEVERE_SYMPTOM = "RULE_CRITICAL_SEVERE_SYMPTOM"
    RULE_CRITICAL_NEGATION = "RULE_CRITICAL_NEGATION"
    RULE_STANDARD_TURN = "RULE_STANDARD_TURN"


class CriticalFact(BaseModel):
    """An individual critical clinical fact extracted from an utterance."""

    category: CriticalFactCategory
    matched_term: str
    rule_id: str
    reason: str
    start_char: int | None = None
    end_char: int | None = None
    is_negated: bool = False
    confidence: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
