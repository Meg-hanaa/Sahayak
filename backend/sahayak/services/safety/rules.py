"""Deterministic Safety Rules and Pattern Matchers — Phase 4.

Every rule is deterministic, explainable, and produces:
- safety_state
- matched_term
- category
- rule_id
- reason
- relevant turn_id
"""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from sahayak.domain.enums import SafetyState
from sahayak.domain.safety import CriticalFact, CriticalFactCategory, SafetyRuleId
from sahayak.services.safety.glossary import GlossaryMatch, MedicalGlossary

# Common conversational idioms with "no" that are NOT medical negations
CONVERSATIONAL_NO_PATTERNS = [
    re.compile(r"\bno\s+problem\b", re.IGNORECASE),
    re.compile(r"\bno\s+worries\b", re.IGNORECASE),
    re.compile(r"\bnot\s+at\s+all\b", re.IGNORECASE),
    re.compile(r"\bno\s+doubt\b", re.IGNORECASE),
    re.compile(r"\bno\s+issue\b", re.IGNORECASE),
    re.compile(r"\bno\s+thanks\b", re.IGNORECASE),
    re.compile(r"\bkoi\s+baat\s+nahi\b", re.IGNORECASE),
    re.compile(r"\bkoi\s+dikkat\s+nahi\b", re.IGNORECASE),
]

# Audio / ASR uncertainty indicators
UNCERTAINTY_PATTERNS = [
    (re.compile(r"\[(inaudible|unclear|garbled|muffled|noise|crosstalk)\]", re.IGNORECASE), "[inaudible] marker"),
    (re.compile(r"<(inaudible|unclear|garbled|muffled)>", re.IGNORECASE), "<inaudible> marker"),
    (re.compile(r"\((inaudible|unclear|garbled)\)", re.IGNORECASE), "(inaudible) marker"),
    (re.compile(r"\?{2,}", re.IGNORECASE), "multiple question marks"),
    # Truncated medicine stem with trailing hyphens or ellipses
    (re.compile(r"\b(metfor|penici|insu|amoxi|aspir|paracet|warfar|atorva|lisino|amlodi|cetiri|ibupro|azithro)[a-z]*[\-\.]{1,3}\b", re.IGNORECASE), "truncated medicine stem"),
    # General word ending in trailing ellipsis or hyphen indicating cut-off medical term
    (re.compile(r"\b[a-zA-Z]{4,}[\-\.]{2,3}(?=\s|$)", re.IGNORECASE), "truncated word ending"),
    # Explicit verbal uncertainty regarding critical terms
    (re.compile(r"\b(something|some\s+medicine)\s*[\-]?\s*(cillin|statin|olol|pril)\b", re.IGNORECASE), "uncertain drug suffix"),
    (re.compile(r"\b(don'?t|do\s+not)\s+know\s+the\s+name\s+of\s+(the\s+)?medicine\b", re.IGNORECASE), "unknown medicine name"),
    (re.compile(r"\bdawa\s+ka\s+naam\s+yaad\s+nahi\b", re.IGNORECASE), "forgotten medicine name"),
    (re.compile(r"\b(allergic\s+to|allergy\s+to|takes?\s+metfor|dose\s+of)\s*[\.\.\-]+\s*$", re.IGNORECASE), "incomplete critical phrase"),
]

# Emergency patterns (in addition to glossary)
EMERGENCY_PATTERNS = [
    (re.compile(r"\b(can'?t|cannot|unable\s+to|not|stopped)\s+breathe?\b", re.IGNORECASE), "cannot breathe"),
    (re.compile(r"\b(saans\s+nahi\s+aa\s+rahi|saans\s+band(\s+ho\s+gayi)?|saans\s+ruk\s+gayi)\b", re.IGNORECASE), "saans nahi aa rahi"),
    (re.compile(r"\b(unconscious|unresponsive|collapsed\s+and\s+not\s+waking|cannot\s+wake\s+up)\b", re.IGNORECASE), "unconscious"),
    (re.compile(r"\b(behosh\s+hai\s+aur\s+uth\s+nahi\s+raha|behosh\s+pada\s+hai)\b", re.IGNORECASE), "behosh hai aur uth nahi raha"),
    (re.compile(r"\b(severe|massive|uncontrolled|profuse)\s+bleeding\b", re.IGNORECASE), "severe bleeding"),
    (re.compile(r"\b(bahut\s+zyada\s+khoon(\s+beh\s+raha)?|khoon\s+ruk\s+nahi\s+raha)\b", re.IGNORECASE), "bahut zyada khoon beh raha hai"),
    (re.compile(r"\b(heart\s+attack|cardiac\s+arrest|dil\s+ka\s+daura)\b", re.IGNORECASE), "heart attack"),
    (re.compile(r"\b(anaphylaxis|anaphylactic\s+shock|throat\s+swelling\s+shut|airway\s+closing)\b", re.IGNORECASE), "anaphylaxis"),
    (re.compile(r"\b(choking|blue\s+lips|cyanosis)\b", re.IGNORECASE), "choking"),
    (re.compile(r"(\u0938\u093e\u0902\u0938\s+\u0928\u0939\u0940\u0902\s+\u0906\s+\u0930\u0939\u0940|\u0926\u093f\u0932\s+\u0915\u093e\s+\u0926\u094c\u0930\u093e|\u092d\u093e\u0930\u0940\s+\u0930\u0915\u094d\u0924\u0938\u094d\u0930\u093e\u0935)", re.IGNORECASE), "emergency devanagari"),
]

# Dosage patterns
DOSAGE_PATTERNS = [
    # 1. Quantity + unit: e.g. "500 mg", "500mg", "five milligrams", "2 tablets", "do goli", "10 ml"
    (
        re.compile(
            r"\b(\d+(\.\d+)?|half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|chaar|paanch|aadha|aadhi|\u0906\u0927\u093e|\u090f\u0915|\u0926\u094b|\u0924\u0940\u0928|\u091a\u093e\u0930|\u092a\u093e\u0901\u091a)\s*"
            r"(mg|mcg|micrograms?|milligrams?|grams?|g|ml|millilit(?:er|re)s?|iu|units?|tablets?|tabs?|capsules?|pills?|puffs?|drops?|goli|chamach|\u092e\u093f\u0932\u0940\u0917\u094d\u0930\u093e\u092e|\u0917\u094b\u0932\u0940)\b",
            re.IGNORECASE,
        ),
        "quantity_unit",
    ),
    # 2. Medication frequency: e.g. "twice daily", "once a day", "every 8 hours", "at bedtime", "din mein do baar"
    (
        re.compile(
            r"\b((?:once|twice|thrice|three\s+times|two\s+times|four\s+times)\s+(?:a\s+day|daily|per\s+day)|"
            r"every\s+\d+\s+hours?|at\s+bedtime|before\s+meals?|after\s+meals?|empty\s+stomach|"
            r"din\s+mein\s+(?:ek|do|teen|chaar)\s+baar|subah\s+shaam|khali\s+pet|khana\s+khane\s+ke\s+baad|"
            r"\u0926\u093f\u0928\s+\u092e\u0947\u0902\s+\u0926\u094b\s+\u092c\u093e\u0930|\u0916\u093e\u0932\u0940\s+\u092a\u0947\u091f)\b",
            re.IGNORECASE,
        ),
        "frequency",
    ),
    # 3. Medical abbreviations: bd, bid, od, tds, tid, qid, sos, prn (as distinct words)
    (
        re.compile(r"\b(bd|bid|od|tds|tid|qid|sos|prn)\b", re.IGNORECASE),
        "medical_abbreviation",
    ),
    # 4. Missed dose / Adherence: e.g. "missed two doses", "missed a dose", "dawa chhoot gayi"
    (
        re.compile(
            r"\b((?:missed|skipped|forgot)\s+(?:\w+\s+)?(?:doses?|medication|medicine|tablets?)|"
            r"double\s+dose|overdose|dawa\s+chhoot\s+gayi|khuraak\s+chhoot\s+gayi|dawa\s+bhool\s+gaya|"
            r"\u0916\u0941\u0930\u093e\u0915\s+\u091b\u0942\u091f\s+\u0917\u0908)\b",
            re.IGNORECASE,
        ),
        "missed_dose",
    ),
]

# Clinical Negation patterns (explicit negated concepts)
CLINICAL_NEGATION_PATTERNS = [
    # Explicit allergy negation
    (
        re.compile(
            r"\b(no\s+allergy|no\s+allergies|not\s+allergic|don'?t\s+have\s+(?:any\s+)?allerg(?:y|ies)|"
            r"den(?:y|ies|ied)\s+(?:any\s+)?allerg(?:y|ies)|no\s+known\s+(?:drug\s+)?allerg(?:y|ies)|nkda|"
            r"koi\s+allergy\s+nahi(?:\s+hai)?|allergy\s+nahi\s+hai|\u090f\u0932\u0930\u094d\u091c\u0940\s+\u0928\u0939\u0940\u0902\s+\u0939\u0948)\b",
            re.IGNORECASE,
        ),
        "no allergy",
    ),
    # Explicit pregnancy negation
    (
        re.compile(
            r"\b(not\s+pregnant|den(?:y|ies|ied)\s+pregnancy|pregnancy\s+test\s+negative|"
            r"pregnant\s+nahi\s+hoon|pregnant\s+nahi\s+hai|\u092a\u094d\u0930\u0947\u0917\u0928\u0947\u0902\u091f\s+\u0928\u0939\u0940\u0902)\b",
            re.IGNORECASE,
        ),
        "not pregnant",
    ),
    # Explicit pain negation
    (
        re.compile(
            r"\b(no\s+pain|den(?:y|ies|ied)\s+pain|pain\s+free|no\s+chest\s+pain|no\s+abdominal\s+pain|"
            r"dard\s+nahi\s+hai|koi\s+dard\s+nahi(?:\s+hai)?|\u0926\u0930\u094d\u0926\s+\u0928\u0939\u0940\u0902\s+\u0939\u0948)\b",
            re.IGNORECASE,
        ),
        "no pain",
    ),
]

# Negation scope cues to inspect nearby critical terms
NEGATION_CUES = re.compile(
    r"\b(no|not|never|none|don'?t|dont|do\s+not|denies|deny|denied|without|free\s+of|negative\s+for|nahi|nahin|na|koi\s+nahi|kabhi\s+nahi|bina|\u0928\u0939\u0940\u0902|\u0928\u093e|\u0915\u094b\u0908\s+\u0928\u0939\u0940\u0902)\b",
    re.IGNORECASE,
)


class SafetyRuleEngine:
    """Deterministic analyzer executing safety rules over text and turn metadata."""

    def __init__(self, glossary: MedicalGlossary | None = None) -> None:
        self.glossary = glossary or MedicalGlossary.load_default()

    def analyze_facts(
        self,
        text: str,
        confidence_data: dict[str, float] | None = None,
        min_confidence: float = 0.75,
        require_confidence: bool = False,
    ) -> list[CriticalFact]:
        """Extract all deterministic critical facts from text."""
        facts: list[CriticalFact] = []
        if not text or not text.strip():
            return facts

        norm_text = text.strip()

        # -------------------------------------------------------------
        # 1. EMERGENCY CHECK (Highest Priority)
        # -------------------------------------------------------------
        # A. Glossary emergency terms
        glossary_matches = self.glossary.find_matches(norm_text)
        for gm in glossary_matches:
            if gm.category == CriticalFactCategory.EMERGENCY:
                facts.append(
                    CriticalFact(
                        category=CriticalFactCategory.EMERGENCY,
                        matched_term=gm.matched_text,
                        rule_id=SafetyRuleId.RULE_EMERGENCY_INDICATOR.value,
                        reason=f"Emergency indicator detected: {gm.canonical_name}",
                        start_char=gm.start_char,
                        end_char=gm.end_char,
                        metadata={"canonical_name": gm.canonical_name, "severity": "emergency"},
                    )
                )

        # B. Regex emergency patterns
        for pattern, label in EMERGENCY_PATTERNS:
            for m in pattern.finditer(norm_text):
                # Avoid exact duplicates
                if not any(f.start_char == m.start() and f.end_char == m.end() for f in facts if f.category == CriticalFactCategory.EMERGENCY):
                    facts.append(
                        CriticalFact(
                            category=CriticalFactCategory.EMERGENCY,
                            matched_term=m.group(0),
                            rule_id=SafetyRuleId.RULE_EMERGENCY_INDICATOR.value,
                            reason=f"Emergency indicator detected: {label}",
                            start_char=m.start(),
                            end_char=m.end(),
                            metadata={"pattern_label": label, "severity": "emergency"},
                        )
                    )

        # -------------------------------------------------------------
        # 2. UNCERTAINTY CHECK
        # -------------------------------------------------------------
        # A. Pattern-based uncertainty (incomplete terms, inaudible markers)
        for pattern, label in UNCERTAINTY_PATTERNS:
            for m in pattern.finditer(norm_text):
                facts.append(
                    CriticalFact(
                        category=CriticalFactCategory.MEDICINE,  # fallback category
                        matched_term=m.group(0),
                        rule_id=SafetyRuleId.RULE_UNCERTAIN_CRITICAL_TERM.value,
                        reason=f"Incomplete or uncertain critical term detected ({label}): {m.group(0)} — repetition required",
                        start_char=m.start(),
                        end_char=m.end(),
                        metadata={"uncertainty_type": label},
                    )
                )

        # B. Confidence metadata check
        if confidence_data is not None:
            # Check overall confidence
            overall = confidence_data.get("overall", confidence_data.get("confidence"))
            if overall is not None and overall < min_confidence:
                facts.append(
                    CriticalFact(
                        category=CriticalFactCategory.MEDICINE,
                        matched_term=norm_text[:30],
                        rule_id=SafetyRuleId.RULE_INSUFFICIENT_CONFIDENCE.value,
                        reason=f"ASR confidence ({overall:.2f}) below safety threshold ({min_confidence:.2f}) for utterance",
                        confidence=overall,
                        metadata={"overall_confidence": overall, "threshold": min_confidence},
                    )
                )
            # Check word-level confidences
            for word, conf in confidence_data.items():
                if word not in ("overall", "confidence") and conf < min_confidence:
                    if self.glossary.is_protected(word):
                        facts.append(
                            CriticalFact(
                                category=CriticalFactCategory.MEDICINE,
                                matched_term=word,
                                rule_id=SafetyRuleId.RULE_INSUFFICIENT_CONFIDENCE.value,
                                reason=f"Confidence ({conf:.2f}) below threshold ({min_confidence:.2f}) for protected term '{word}'",
                                confidence=conf,
                                metadata={"term": word, "confidence": conf, "threshold": min_confidence},
                            )
                        )

        # -------------------------------------------------------------
        # 3. CLINICAL NEGATION CHECK (Safety-Critical)
        # -------------------------------------------------------------
        # Explicit negation patterns (no allergy, not pregnant, no pain)
        for pattern, label in CLINICAL_NEGATION_PATTERNS:
            for m in pattern.finditer(norm_text):
                facts.append(
                    CriticalFact(
                        category=CriticalFactCategory.NEGATION,
                        matched_term=m.group(0),
                        rule_id=SafetyRuleId.RULE_CRITICAL_NEGATION.value,
                        reason=f"Critical clinical negation detected: {label}",
                        start_char=m.start(),
                        end_char=m.end(),
                        is_negated=True,
                        metadata={"negation_type": label},
                    )
                )

        # -------------------------------------------------------------
        # 4. GLOSSARY TERMS (Allergies, Medicines, Severe Symptoms, Negations)
        # -------------------------------------------------------------
        for gm in glossary_matches:
            # Skip emergencies as they are handled in section 1
            if gm.category == CriticalFactCategory.EMERGENCY:
                continue

            # Check if this term is within a negated context or explicit negation
            term_text = gm.matched_text
            is_negated = False
            negation_phrase = None

            # Check if term is already captured under explicit negation
            already_in_negation = any(
                f.category == CriticalFactCategory.NEGATION
                and f.start_char is not None
                and f.end_char is not None
                and (f.start_char <= gm.start_char and f.end_char >= gm.end_char)
                for f in facts
            )
            if already_in_negation:
                continue

            # Scope check: Is there a negation cue within nearby words?
            # e.g. "Mujhe penicillin se allergy nahi hai" -> "penicillin" + "nahi"
            pre_window = norm_text[max(0, gm.start_char - 40) : gm.start_char]
            post_window = norm_text[gm.end_char : min(len(norm_text), gm.end_char + 40)]

            # Check if post_window or pre_window has negation
            post_neg = NEGATION_CUES.search(post_window)
            pre_neg = NEGATION_CUES.search(pre_window)

            # Ensure the negation cue is not a conversational false positive (like "no problem")
            def is_valid_negation(match_obj: re.Match[str] | None, window_text: str) -> bool:
                if not match_obj:
                    return False
                # Check if this negation belongs to a conversational false positive
                for c_pat in CONVERSATIONAL_NO_PATTERNS:
                    if c_pat.search(window_text):
                        return False
                return True

            if is_valid_negation(post_neg, post_window) or is_valid_negation(pre_neg, pre_window):
                is_negated = True
                neg_match = post_neg or pre_neg
                negation_phrase = neg_match.group(0) if neg_match else "negated"

            # Determine category:
            # If the term is "penicillin" and text says "allergy" nearby, category is ALLERGY!
            category = gm.category
            if category == CriticalFactCategory.MEDICINE:
                # Only re-categorize to ALLERGY if allergy/reaction is directly attached to this medicine
                # e.g., "allergic to metformin", "metformin allergy", "metformin se allergy"
                pre_match = re.search(r"\b(allergic\s+to|allergy\s+to|reaction\s+to)\s*$", pre_window, re.IGNORECASE)
                post_match = re.search(r"^\s*(allergy|reaction|se\s+allergy|\u090f\u0932\u0930\u094d\u091c\u0940)", post_window, re.IGNORECASE)
                if pre_match or post_match:
                    category = CriticalFactCategory.ALLERGY

            if is_negated:
                facts.append(
                    CriticalFact(
                        category=CriticalFactCategory.NEGATION,
                        matched_term=f"{term_text} (negated)",
                        rule_id=SafetyRuleId.RULE_CRITICAL_NEGATION.value,
                        reason=f"Critical clinical negation detected: {term_text} denied ({negation_phrase})",
                        start_char=gm.start_char,
                        end_char=gm.end_char,
                        is_negated=True,
                        metadata={
                            "canonical_name": gm.canonical_name,
                            "original_category": category.value,
                            "negation_term": negation_phrase,
                        },
                    )
                )
            else:
                # Affirmative critical fact
                rule_id = SafetyRuleId.RULE_CRITICAL_MEDICINE.value
                reason = f"Critical medicine fact detected: {gm.canonical_name}"

                if category == CriticalFactCategory.ALLERGY:
                    rule_id = SafetyRuleId.RULE_CRITICAL_ALLERGY.value
                    reason = f"Critical allergy fact detected: {gm.canonical_name}"
                elif category == CriticalFactCategory.SEVERE_SYMPTOM:
                    rule_id = SafetyRuleId.RULE_CRITICAL_SEVERE_SYMPTOM.value
                    reason = f"Critical severe symptom detected: {gm.canonical_name}"
                elif category == CriticalFactCategory.NEGATION:
                    rule_id = SafetyRuleId.RULE_CRITICAL_NEGATION.value
                    reason = f"Critical clinical negation detected: {gm.canonical_name}"

                facts.append(
                    CriticalFact(
                        category=category,
                        matched_term=term_text,
                        rule_id=rule_id,
                        reason=reason,
                        start_char=gm.start_char,
                        end_char=gm.end_char,
                        is_negated=False,
                        metadata={"canonical_name": gm.canonical_name},
                    )
                )

        # -------------------------------------------------------------
        # 5. DOSAGE PATTERNS
        # -------------------------------------------------------------
        for pattern, subtype in DOSAGE_PATTERNS:
            for m in pattern.finditer(norm_text):
                # Avoid false positives like "10 am" or non-dosage numbers
                matched_str = m.group(0).strip()
                # Check overlap with existing facts
                overlaps = any(
                    f.start_char is not None and f.end_char is not None
                    and not (m.end() <= f.start_char or m.start() >= f.end_char)
                    for f in facts
                )
                if not overlaps:
                    facts.append(
                        CriticalFact(
                            category=CriticalFactCategory.DOSAGE,
                            matched_term=matched_str,
                            rule_id=SafetyRuleId.RULE_CRITICAL_DOSAGE.value,
                            reason=f"Critical dosage fact detected ({subtype}): {matched_str}",
                            start_char=m.start(),
                            end_char=m.end(),
                            metadata={"subtype": subtype},
                        )
                    )

        # -------------------------------------------------------------
        # 6. MISSING CONFIDENCE CHECK
        # -------------------------------------------------------------
        if require_confidence and confidence_data is None and facts:
            # If critical facts are found but confidence data was required and is completely missing
            facts.append(
                CriticalFact(
                    category=facts[0].category,
                    matched_term=facts[0].matched_term,
                    rule_id=SafetyRuleId.RULE_MISSING_CONFIDENCE.value,
                    reason="Missing confidence metadata for critical clinical utterance",
                    metadata={"facts_count": len(facts)},
                )
            )

        return facts
