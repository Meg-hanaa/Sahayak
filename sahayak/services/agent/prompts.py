"""Deterministic bilingual prompt generators for agent confirmation, repetition, and escalation — Phase 5."""

from __future__ import annotations

import re

from sahayak.domain.enums import LanguageCode
from sahayak.domain.safety import CriticalFactCategory


# Confirmation prompt templates by category and target language
_CONFIRMATION_TEMPLATES_HI: dict[str, str] = {
    CriticalFactCategory.ALLERGY.value: "क्या आपको {term} से एलर्जी है? कृपया हाँ या नहीं में पुष्टि करें।",
    CriticalFactCategory.MEDICINE.value: "क्या आप {term} दवा ले रहे हैं? कृपया हाँ या नहीं में पुष्टि करें।",
    CriticalFactCategory.DOSAGE.value: "क्या आपकी खुराक {term} है? कृपया हाँ या नहीं में पुष्टि करें।",
    CriticalFactCategory.SEVERE_SYMPTOM.value: "क्या आप {term} महसूस कर रहे हैं? कृपया हाँ या नहीं में पुष्टि करें।",
    CriticalFactCategory.NEGATION.value: "क्या यह सही है कि {term}? कृपया हाँ या नहीं में पुष्टि करें।",
}

_CONFIRMATION_TEMPLATES_EN: dict[str, str] = {
    CriticalFactCategory.ALLERGY.value: "Did you say you have an allergy to {term}? Please confirm with yes or no.",
    CriticalFactCategory.MEDICINE.value: "Are you taking {term}? Please confirm with yes or no.",
    CriticalFactCategory.DOSAGE.value: "Is your dosage {term}? Please confirm with yes or no.",
    CriticalFactCategory.SEVERE_SYMPTOM.value: "Are you experiencing {term}? Please confirm with yes or no.",
    CriticalFactCategory.NEGATION.value: "Can you confirm: {term}? Please confirm with yes or no.",
}

_DEFAULT_CONFIRM_HI = "कृपया पुष्टि करें: {term}। क्या यह सही है?"
_DEFAULT_CONFIRM_EN = "Please confirm: {term}. Is that correct?"

_CLARIFY_AMBIGUOUS_HI = "मुझे आपका उत्तर स्पष्ट नहीं मिला। कृपया पुष्टि के लिए स्पष्ट रूप से हाँ या नहीं कहें: {term}।"
_CLARIFY_AMBIGUOUS_EN = "I could not determine your answer. Please clearly say YES to confirm or NO to reject: {term}."

_REPEAT_REQUEST_HI = "मुझे यह महत्वपूर्ण चिकित्सीय शब्द स्पष्ट रूप से सुनाई नहीं दिया। कृपया इसे दोबारा बताएं।"
_REPEAT_REQUEST_EN = "I could not hear the critical medical term clearly. Could you please repeat it?"


def build_confirmation_prompt(
    term: str,
    category: str | CriticalFactCategory | None,
    language: LanguageCode,
) -> str:
    """Generate a deterministic, category-specific confirmation prompt."""
    cat_key = category.value if isinstance(category, CriticalFactCategory) else str(category)
    clean_term = term.strip() if term else ""

    if cat_key == CriticalFactCategory.ALLERGY.value:
        # Avoid ungrammatical prompts like "allergy to allergic" or "allergy to allergy"
        if clean_term.lower() in ("allergy", "allergic", "allergies", "एलर्जी", "an allergy", "koi allergy"):
            if language == LanguageCode.HINDI:
                return "क्या आपको एलर्जी है? कृपया हाँ या नहीं में पुष्टि करें।"
            return "Did you say you have an allergy? Please confirm with yes or no."

        # If term ends with redundant "allergy", e.g. "penicillin allergy" -> "penicillin"
        clean_term = re.sub(r"\s+(?:allergy|allergic|allergies)$", "", clean_term, flags=re.IGNORECASE)
        # In Hindi, strip trailing "से एलर्जी" or "एलर्जी"
        clean_term = re.sub(r"\s*(?:से\s+)?एलर्जी$", "", clean_term).strip()

    if language == LanguageCode.HINDI:
        template = _CONFIRMATION_TEMPLATES_HI.get(cat_key, _DEFAULT_CONFIRM_HI)
    else:
        template = _CONFIRMATION_TEMPLATES_EN.get(cat_key, _DEFAULT_CONFIRM_EN)
    return template.format(term=clean_term)


def build_clarification_prompt(
    term: str,
    language: LanguageCode,
) -> str:
    """Generate a second clarification prompt after an ambiguous confirmation response."""
    if language == LanguageCode.HINDI:
        return _CLARIFY_AMBIGUOUS_HI.format(term=term)
    return _CLARIFY_AMBIGUOUS_EN.format(term=term)


def build_repeat_request_prompt(
    language: LanguageCode,
) -> str:
    """Generate a repetition request prompt when an uncertain term requires repetition."""
    if language == LanguageCode.HINDI:
        return _REPEAT_REQUEST_HI
    return _REPEAT_REQUEST_EN
