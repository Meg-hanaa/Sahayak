"""Protected Medical Glossary — Phase 4.

Medical terms must not be casually transformed or discarded by safety processing.
The glossary is configurable rather than hardcoded throughout business logic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
import re
from typing import Any

from sahayak.domain.safety import CriticalFactCategory

# Path to the packaged default glossary
DEFAULT_GLOSSARY_PATH = Path(__file__).parent / "data" / "default_glossary.json"


@dataclass(frozen=True)
class ProtectedTerm:
    """A medical entity that must be protected and tracked by the safety engine."""

    canonical_name: str
    category: CriticalFactCategory
    variants: tuple[str, ...] = ()
    is_protected: bool = True
    severity: str = "critical"
    description: str = ""

    def all_names(self) -> list[str]:
        names = [self.canonical_name]
        for v in self.variants:
            if v.lower() != self.canonical_name.lower():
                names.append(v)
        return names


@dataclass(frozen=True)
class GlossaryMatch:
    """A match against a glossary term in source text."""

    term: ProtectedTerm
    matched_text: str
    start_char: int
    end_char: int
    category: CriticalFactCategory

    @property
    def canonical_name(self) -> str:
        return self.term.canonical_name


class MedicalGlossary:
    """Configurable repository of protected medical vocabulary and terms."""

    def __init__(self, terms: list[ProtectedTerm] | None = None) -> None:
        self._terms_by_canonical: dict[str, ProtectedTerm] = {}
        self._lookup: dict[str, ProtectedTerm] = {}
        if terms:
            for term in terms:
                self.add_term(term)

    def add_term(self, term: ProtectedTerm) -> None:
        """Register a protected term and its aliases."""
        self._terms_by_canonical[term.canonical_name.lower()] = term
        for name in term.all_names():
            norm = name.strip().lower()
            if norm:
                self._lookup[norm] = term

    def remove_term(self, canonical_name: str) -> bool:
        """Remove a term by its canonical name."""
        norm_key = canonical_name.lower()
        if norm_key in self._terms_by_canonical:
            term = self._terms_by_canonical.pop(norm_key)
            for name in term.all_names():
                norm = name.strip().lower()
                if norm in self._lookup and self._lookup[norm] == term:
                    del self._lookup[norm]
            return True
        return False

    def get_term(self, term_or_variant: str) -> ProtectedTerm | None:
        """Retrieve a term by canonical name or alias."""
        return self._lookup.get(term_or_variant.strip().lower())

    def is_protected(self, term_or_variant: str) -> bool:
        """Check whether a given word or phrase is a protected medical term."""
        term = self.get_term(term_or_variant)
        return term is not None and term.is_protected

    def get_canonical_name(self, term_or_variant: str) -> str | None:
        """Get canonical name for a given alias."""
        term = self.get_term(term_or_variant)
        return term.canonical_name if term else None

    @property
    def total_terms(self) -> int:
        return len(self._terms_by_canonical)

    @property
    def total_patterns(self) -> int:
        return len(self._lookup)

    def list_terms(self) -> list[ProtectedTerm]:
        return list(self._terms_by_canonical.values())

    def find_matches(self, text: str) -> list[GlossaryMatch]:
        """Find all glossary term matches in text with word boundaries and span offsets."""
        matches: list[GlossaryMatch] = []
        if not text or not text.strip():
            return matches

        # Sort patterns by length descending to match longest phrases first (e.g. "penicillin allergy" before "penicillin")
        sorted_patterns = sorted(self._lookup.keys(), key=len, reverse=True)

        # Track covered spans to avoid sub-matching within already matched longer phrases
        covered_spans: list[tuple[int, int]] = []

        for pattern in sorted_patterns:
            # Word boundary regex supporting Devanagari and Latin characters
            # Escape regex special characters in pattern
            escaped_pattern = re.escape(pattern)
            # Use negative lookbehind and lookahead to ensure word boundaries
            # In Python regex, \b works well for Latin, but for unicode scripts like Devanagari,
            # we check not preceded/followed by alphanumeric or devanagari characters.
            regex_str = rf"(?<![\w\u0900-\u097F]){escaped_pattern}(?![\w\u0900-\u097F])"
            compiled = re.compile(regex_str, re.IGNORECASE)

            for m in compiled.finditer(text):
                start, end = m.start(), m.end()
                # Check overlap with already covered longer spans
                overlaps = any(
                    not (end <= c_start or start >= c_end)
                    for c_start, c_end in covered_spans
                )
                if not overlaps:
                    term = self._lookup[pattern]
                    matches.append(
                        GlossaryMatch(
                            term=term,
                            matched_text=m.group(0),
                            start_char=start,
                            end_char=end,
                            category=term.category,
                        )
                    )
                    covered_spans.append((start, end))

        # Sort matches by appearance in text
        matches.sort(key=lambda x: x.start_char)
        return matches

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> MedicalGlossary:
        """Construct glossary from a dictionary structure."""
        terms_data = data.get("terms", [])
        terms: list[ProtectedTerm] = []
        for item in terms_data:
            cat_str = item.get("category", "MEDICINE")
            try:
                category = CriticalFactCategory(cat_str)
            except ValueError:
                category = CriticalFactCategory.MEDICINE

            terms.append(
                ProtectedTerm(
                    canonical_name=item["canonical_name"],
                    category=category,
                    variants=tuple(item.get("variants", [])),
                    is_protected=bool(item.get("is_protected", True)),
                    severity=item.get("severity", "critical"),
                    description=item.get("description", ""),
                )
            )
        return cls(terms)

    @classmethod
    def from_json_file(cls, path: str | Path) -> MedicalGlossary:
        """Load glossary from a JSON file path."""
        p = Path(path)
        if not p.is_file():
            raise FileNotFoundError(f"Glossary file not found: {p}")
        with p.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return cls.from_dict(data)

    @classmethod
    def load_default(cls) -> MedicalGlossary:
        """Load the default built-in medical glossary."""
        if DEFAULT_GLOSSARY_PATH.is_file():
            return cls.from_json_file(DEFAULT_GLOSSARY_PATH)
        return cls([])

    def to_dict(self) -> dict[str, Any]:
        """Serialize glossary to dictionary."""
        return {
            "version": "1.0.0",
            "terms": [
                {
                    "canonical_name": t.canonical_name,
                    "category": t.category.value,
                    "variants": list(t.variants),
                    "is_protected": t.is_protected,
                    "severity": t.severity,
                    "description": t.description,
                }
                for t in self.list_terms()
            ],
        }
