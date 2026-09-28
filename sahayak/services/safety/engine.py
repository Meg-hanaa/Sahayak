"""Deterministic Safety Classification Engine — Phase 4.

The core deterministic safety feature of Sahayak.
Analyzes finalized conversational turns and classifies them into:
- STANDARD
- NEEDS_CONFIRMATION
- NEEDS_REPETITION
- ESCALATE

An LLM must NOT be able to override deterministic safety rules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from sahayak.domain.enums import SafetyState
from sahayak.domain.models import RiskAssessment, Turn
from sahayak.domain.safety import CriticalFact, CriticalFactCategory, SafetyRuleId
from sahayak.services.safety.glossary import MedicalGlossary
from sahayak.services.safety.rules import SafetyRuleEngine

# Deterministic priority ordering among critical categories
CATEGORY_PRIORITY: dict[CriticalFactCategory, int] = {
    CriticalFactCategory.EMERGENCY: 0,
    CriticalFactCategory.ALLERGY: 1,
    CriticalFactCategory.MEDICINE: 2,
    CriticalFactCategory.DOSAGE: 3,
    CriticalFactCategory.SEVERE_SYMPTOM: 4,
    CriticalFactCategory.NEGATION: 5,
}


@dataclass
class SafetyEngineConfig:
    """Configuration options for the Deterministic Safety Engine."""

    min_confidence: float = 0.75
    require_confidence: bool = False
    glossary: MedicalGlossary | None = None
    glossary_path: str | Path | None = None


class DeterministicSafetyEngine:
    """Sahayak's core deterministic safety classification engine."""

    def __init__(
        self,
        config: SafetyEngineConfig | None = None,
        glossary: MedicalGlossary | None = None,
    ) -> None:
        self.config = config or SafetyEngineConfig()
        if glossary is not None:
            self.glossary = glossary
        elif self.config.glossary is not None:
            self.glossary = self.config.glossary
        elif self.config.glossary_path is not None:
            self.glossary = MedicalGlossary.from_json_file(self.config.glossary_path)
        else:
            self.glossary = MedicalGlossary.load_default()

        self._rule_engine = SafetyRuleEngine(self.glossary)

    def analyze_turn(
        self,
        turn: Turn,
        *,
        require_confidence: bool | None = None,
        min_confidence: float | None = None,
    ) -> RiskAssessment:
        """Analyze a finalized Turn and produce an explainable RiskAssessment."""
        min_conf = min_confidence if min_confidence is not None else self.config.min_confidence
        req_conf = require_confidence if require_confidence is not None else self.config.require_confidence

        return self.analyze_text(
            text=turn.source_text,
            turn_id=turn.turn_id,
            confidence_data=turn.confidence_data,
            require_confidence=req_conf,
            min_confidence=min_conf,
            translated_text=turn.translated_text,
        )

    def analyze_text(
        self,
        text: str,
        turn_id: UUID | None = None,
        confidence_data: dict[str, float] | None = None,
        require_confidence: bool = False,
        min_confidence: float = 0.75,
        translated_text: str | None = None,
    ) -> RiskAssessment:
        """Analyze raw text and metadata, returning a deterministic RiskAssessment."""
        tid = turn_id or uuid4()

        # Extract facts from source text
        facts = self._rule_engine.analyze_facts(
            text=text,
            confidence_data=confidence_data,
            min_confidence=min_confidence,
            require_confidence=require_confidence,
        )

        # If translated text is also available, inspect it for additional facts (without overriding)
        if translated_text and translated_text.strip():
            trans_facts = self._rule_engine.analyze_facts(
                text=translated_text,
                confidence_data=None,
                min_confidence=min_confidence,
                require_confidence=False,
            )
            for tf in trans_facts:
                if not any(f.matched_term.lower() == tf.matched_term.lower() for f in facts):
                    facts.append(tf)

        # -------------------------------------------------------------
        # DETERMINISTIC CLASSIFICATION HIERARCHY
        # -------------------------------------------------------------
        # Priority 1: Emergency -> ESCALATE
        emergency_facts = [f for f in facts if f.category == CriticalFactCategory.EMERGENCY]
        if emergency_facts:
            primary = emergency_facts[0]
            return RiskAssessment(
                turn_id=tid,
                matched_term=primary.matched_term,
                category=CriticalFactCategory.EMERGENCY.value,
                safety_state=SafetyState.ESCALATE,
                rule_id=primary.rule_id,
                reason=primary.reason,
                facts=facts,
            )

        # Priority 2: Uncertainty / Insufficient Confidence -> NEEDS_REPETITION
        uncertainty_rule_ids = {
            SafetyRuleId.RULE_UNCERTAIN_CRITICAL_TERM.value,
            SafetyRuleId.RULE_INSUFFICIENT_CONFIDENCE.value,
            SafetyRuleId.RULE_MISSING_CONFIDENCE.value,
        }
        uncertainty_facts = [f for f in facts if f.rule_id in uncertainty_rule_ids]
        if uncertainty_facts:
            primary = uncertainty_facts[0]
            return RiskAssessment(
                turn_id=tid,
                matched_term=primary.matched_term,
                category=primary.category.value if primary.category else "UNCERTAIN",
                safety_state=SafetyState.NEEDS_REPETITION,
                rule_id=primary.rule_id,
                reason=primary.reason,
                facts=facts,
            )

        # Priority 3: Critical Facts -> NEEDS_CONFIRMATION
        if facts:
            # Sort facts by category priority
            facts.sort(key=lambda f: (CATEGORY_PRIORITY.get(f.category, 99), f.start_char or 0))
            primary = facts[0]

            # Construct summary reason if multiple facts exist
            if len(facts) > 1:
                fact_summary = ", ".join(f"{f.category.value}: {f.matched_term}" for f in facts)
                reason = f"Multiple critical facts detected [{fact_summary}]"
            else:
                reason = primary.reason

            return RiskAssessment(
                turn_id=tid,
                matched_term=primary.matched_term,
                category=primary.category.value,
                safety_state=SafetyState.NEEDS_CONFIRMATION,
                rule_id=primary.rule_id,
                reason=reason,
                facts=facts,
            )

        # Priority 4: Normal conversation -> STANDARD
        return RiskAssessment(
            turn_id=tid,
            matched_term=None,
            category=None,
            safety_state=SafetyState.STANDARD,
            rule_id=SafetyRuleId.RULE_STANDARD_TURN.value,
            reason="No critical safety facts or risk indicators detected",
            facts=[],
        )
