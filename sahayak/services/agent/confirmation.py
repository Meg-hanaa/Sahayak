"""Confirmation management, response classification, and retry loop — Phase 5."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import UUID

from sahayak.domain.enums import ConfirmationOutcome, LanguageCode, ParticipantRole
from sahayak.domain.models import Confirmation
from sahayak.domain.safety import CriticalFact
from sahayak.services.agent.prompts import (
    build_clarification_prompt,
    build_confirmation_prompt,
)

# Deterministic affirmative match sets
_AFFIRMATIVE_TERMS: frozenset[str] = frozenset({
    # English
    "yes", "yeah", "yep", "correct", "that's right", "thats right",
    "right", "confirmed", "true", "i do", "i am", "exactly",
    "affirmative", "sure", "yes that is right", "yes i do", "yes i have",
    # Hindi Latin
    "haan", "ha", "haanji", "hanji", "sahi", "sahi hai", "theek",
    "theek hai", "bilkul", "yahi hai", "ji haan", "ji", "haan ji",
    # Hindi Devanagari
    "हाँ", "हा", "हाँजी", "हाजी", "सही", "सही है", "ठीक", "ठीक है",
    "बिल्कुल", "जी हाँ", "जी", "हाँ जी",
})

# Deterministic negative match sets
_NEGATIVE_TERMS: frozenset[str] = frozenset({
    # English
    "no", "nope", "not at all", "wrong", "incorrect", "that's wrong",
    "thats wrong", "i don't", "i dont", "negative", "false",
    "no that is incorrect", "no i do not",
    # Hindi Latin
    "nahi", "nahin", "na", "galat", "galat hai", "aisa nahi hai",
    "nahi hai", "bilkul nahi", "na ji",
    # Hindi Devanagari
    "नहीं", "ना", "गलत", "गलत है", "ऐसा नहीं है", "बिल्कुल नहीं", "ना जी",
})

# Known ambiguous / uncertain terms
_AMBIGUOUS_TERMS: frozenset[str] = frozenset({
    # English
    "maybe", "perhaps", "not sure", "i don't know", "i dont know",
    "possibly", "i think so", "kind of", "sort of", "i might",
    "unclear", "what do you mean",
    # Hindi Latin
    "shayad", "pata nahi", "maloom nahi", "ho sakta hai", "lagbhag",
    "shayaad", "kya pata",
    # Hindi Devanagari
    "शायद", "पता नहीं", "मालूम नहीं", "हो सकता है", "क्या पता",
})


class ConfirmationResponseClassifier:
    """Deterministically classifies user response text into confirmation outcomes."""

    @classmethod
    def normalize(cls, text: str) -> str:
        """Strip punctuation and whitespace, lowercase text."""
        cleaned = re.sub(r"[^\w\s\u0900-\u097F]", "", text.strip().lower())
        return " ".join(cleaned.split())

    @classmethod
    def classify(cls, response_text: str) -> ConfirmationOutcome:
        """Classify a raw response string into CONFIRMED, REJECTED, or AMBIGUOUS.

        Do NOT infer user intent. If not clearly affirmative or negative,
        mark AMBIGUOUS.
        """
        norm = cls.normalize(response_text)
        if not norm:
            return ConfirmationOutcome.AMBIGUOUS

        # 1. Check exact whole-string matches
        if norm in _AFFIRMATIVE_TERMS:
            return ConfirmationOutcome.CONFIRMED
        if norm in _NEGATIVE_TERMS:
            return ConfirmationOutcome.REJECTED
        if norm in _AMBIGUOUS_TERMS:
            return ConfirmationOutcome.AMBIGUOUS

        # 2. Check token or prefix matches (e.g. "yes doctor", "haan doctor sahab", "no, i don't")
        tokens = norm.split()
        first_token = tokens[0]
        if first_token in {"yes", "yeah", "yep", "haan", "ha", "haanji", "hanji", "हाँ", "हा", "हाँजी"}:
            return ConfirmationOutcome.CONFIRMED
        if first_token in {"no", "nope", "nahi", "nahin", "na", "गलत", "नहीं", "ना"}:
            return ConfirmationOutcome.REJECTED

        # Any explicit ambiguous substring
        for amb in _AMBIGUOUS_TERMS:
            if amb in norm:
                return ConfirmationOutcome.AMBIGUOUS

        # Fallback: Do not infer user intent
        return ConfirmationOutcome.AMBIGUOUS


class ConfirmationManager:
    """Manages creation, evaluation, and retry limits for critical fact confirmations."""

    def __init__(self, max_attempts: int = 2) -> None:
        self.max_attempts = max_attempts
        self.classifier = ConfirmationResponseClassifier()

    def create_confirmation(
        self,
        turn_id: UUID,
        term: str,
        category: str | None,
        language: LanguageCode,
        responder_role: ParticipantRole | None = None,
    ) -> Confirmation:
        """Create a new pending Confirmation object."""
        prompt_text = build_confirmation_prompt(term=term, category=category, language=language)
        return Confirmation(
            turn_id=turn_id,
            prompt_text=prompt_text,
            outcome=ConfirmationOutcome.PENDING,
            timestamp=datetime.now(UTC),
            responder_role=responder_role,
            attempt_count=1,
            metadata={"term": term, "category": category, "language": language.value},
        )

    def evaluate_response(
        self,
        confirmation: Confirmation,
        response_text: str,
        responder_role: ParticipantRole | None,
        term: str,
        language: LanguageCode,
    ) -> tuple[ConfirmationOutcome, str | None]:
        """Evaluate a confirmation response.

        Returns:
            tuple of (outcome, next_prompt_text)
            next_prompt_text is set only when outcome is AMBIGUOUS and retry is available.
        """
        outcome = self.classifier.classify(response_text)
        confirmation.response_text = response_text
        if responder_role:
            confirmation.responder_role = responder_role

        if outcome == ConfirmationOutcome.CONFIRMED:
            confirmation.outcome = ConfirmationOutcome.CONFIRMED
            return ConfirmationOutcome.CONFIRMED, None

        if outcome == ConfirmationOutcome.REJECTED:
            confirmation.outcome = ConfirmationOutcome.REJECTED
            return ConfirmationOutcome.REJECTED, None

        # AMBIGUOUS branch
        if confirmation.attempt_count < self.max_attempts:
            # Ask once more
            confirmation.attempt_count += 1
            confirmation.outcome = ConfirmationOutcome.AMBIGUOUS
            clarification_prompt = build_clarification_prompt(term=term, language=language)
            return ConfirmationOutcome.AMBIGUOUS, clarification_prompt

        # Still unclear after max_attempts: UNRESOLVED
        confirmation.outcome = ConfirmationOutcome.UNRESOLVED
        return ConfirmationOutcome.UNRESOLVED, None
