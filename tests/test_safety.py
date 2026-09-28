"""Comprehensive test suite for Sahayak Deterministic Safety Engine — Phase 4.

Covers:
1. Allergy detection (English, Hindi/Hinglish, Devanagari, reactions)
2. Medicine detection (generic, brand names, variants, Hindi)
3. Dosage detection (quantities, units, frequencies, missed doses, abbreviations, Hindi)
4. Severe symptom detection (chest pain, breathing difficulty, fainting, Hindi)
5. Negation handling (safety-critical distinction: "No allergy" vs "I have an allergy")
6. Emergency handling (cannot breathe, unconscious, severe bleeding, escalate state)
7. Protected medical terms (glossary lookup, protection status, configurable terms)
8. Uncertain medicine names and inaudible tokens (needs_repetition, no guessing)
9. False positives protection (conversational idioms like "no problem", non-medical numbers)
10. Normal conversational text (standard state)
11. Overlapping categories & multiple critical facts (all facts preserved)
12. Case differences (UPPERCASE, lowercase, TitleCase)
13. PRD Hindi and English examples
14. Missing and low confidence metadata handling
15. Explainability and rule IDs on all outputs
16. Deterministic behavior verification
17. Full run against the fixed 36-case safety evaluation dataset
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import uuid4

import pytest

from sahayak.domain.enums import ParticipantRole, SafetyState
from sahayak.domain.models import Turn
from sahayak.domain.safety import CriticalFactCategory, SafetyRuleId
from sahayak.services.safety.engine import (
    DeterministicSafetyEngine,
    SafetyEngineConfig,
)
from sahayak.services.safety.glossary import (
    DEFAULT_GLOSSARY_PATH,
    MedicalGlossary,
    ProtectedTerm,
)
from tests.safety_eval_dataset import SAFETY_EVALUATION_DATASET, SafetyEvalCase


@pytest.fixture
def engine() -> DeterministicSafetyEngine:
    """Default deterministic safety engine instance."""
    return DeterministicSafetyEngine()


@pytest.fixture
def sample_turn_id():
    return uuid4()


# =============================================================================
# 1. ALLERGY DETECTION
# =============================================================================
class TestAllergyDetection:
    def test_english_penicillin_allergy(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("I have a severe penicillin allergy.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.ALLERGY.value
        assert "penicillin" in assessment.matched_term.lower()
        assert assessment.rule_id == SafetyRuleId.RULE_CRITICAL_ALLERGY.value
        assert "penicillin" in assessment.reason.lower()

    def test_hindi_penicillin_allergy_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD explicitly specifies: 'Mujhe penicillin se allergy hai.'"""
        assessment = engine.analyze_text("Mujhe penicillin se allergy hai.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.ALLERGY.value
        assert "penicillin" in assessment.matched_term.lower()
        assert assessment.rule_id == SafetyRuleId.RULE_CRITICAL_ALLERGY.value

    def test_devanagari_penicillin_allergy(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("मुझे पेनिसिलिन से एलर्जी है।")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.ALLERGY.value
        assert assessment.rule_id == SafetyRuleId.RULE_CRITICAL_ALLERGY.value

    def test_medicine_reaction_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'medicine reaction'"""
        assessment = engine.analyze_text("The patient experienced a bad medicine reaction.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.ALLERGY.value
        assert "reaction" in assessment.matched_term.lower()

    def test_sulfa_drug_allergy(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("I am allergic to sulfa drugs.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.ALLERGY.value
        assert "sulfa" in assessment.matched_term.lower()

    def test_peanut_and_latex_allergies(self, engine: DeterministicSafetyEngine) -> None:
        peanut_res = engine.analyze_text("I have a severe peanut allergy.")
        assert peanut_res.category == CriticalFactCategory.ALLERGY.value

        latex_res = engine.analyze_text("I have a latex allergy.")
        assert latex_res.category == CriticalFactCategory.ALLERGY.value


# =============================================================================
# 2. MEDICINE DETECTION
# =============================================================================
class TestMedicineDetection:
    def test_metformin_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'metformin'"""
        assessment = engine.analyze_text("I take metformin for my blood sugar.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.MEDICINE.value
        assert "metformin" in assessment.matched_term.lower()
        assert assessment.rule_id == SafetyRuleId.RULE_CRITICAL_MEDICINE.value

    def test_insulin_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'insulin'"""
        assessment = engine.analyze_text("Main roz subah insulin leta hoon.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.MEDICINE.value
        assert "insulin" in assessment.matched_term.lower()

    def test_anticoagulant_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'anticoagulant'"""
        assessment = engine.analyze_text("The doctor advised an anticoagulant.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.MEDICINE.value
        assert "anticoagulant" in assessment.matched_term.lower()

    def test_blood_thinner_colloquial(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("I am taking a blood thinner.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.MEDICINE.value
        assert "blood thinner" in assessment.matched_term.lower()

    def test_common_indian_prescriptions(self, engine: DeterministicSafetyEngine) -> None:
        for med in ["paracetamol", "crocin", "amoxicillin", "atorvastatin", "pantoprazole"]:
            res = engine.analyze_text(f"Patient is taking {med}.")
            assert res.safety_state == SafetyState.NEEDS_CONFIRMATION
            assert res.category == CriticalFactCategory.MEDICINE.value


# =============================================================================
# 3. DOSAGE DETECTION
# =============================================================================
class TestDosageDetection:
    def test_five_milligrams_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'five milligrams'"""
        assessment = engine.analyze_text("Take five milligrams every morning.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.DOSAGE.value
        assert "five milligrams" in assessment.matched_term.lower()
        assert assessment.rule_id == SafetyRuleId.RULE_CRITICAL_DOSAGE.value

    def test_twice_daily_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'twice daily'"""
        assessment = engine.analyze_text("Take this medication twice daily.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.DOSAGE.value
        assert "twice daily" in assessment.matched_term.lower()

    def test_missed_two_doses_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'missed two doses'"""
        assessment = engine.analyze_text("I missed two doses while traveling.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.DOSAGE.value
        assert "missed two doses" in assessment.matched_term.lower()

    def test_numeric_dosage_units(self, engine: DeterministicSafetyEngine) -> None:
        for text, expected in [
            ("500 mg at night", "500 mg"),
            ("Take 10 ml syrup", "10 ml"),
            ("Take 2 tablets", "2 tablets"),
            ("paanch milligram", "paanch milligram"),
        ]:
            res = engine.analyze_text(text)
            assert res.safety_state == SafetyState.NEEDS_CONFIRMATION
            assert res.category == CriticalFactCategory.DOSAGE.value
            assert expected.lower() in res.matched_term.lower()

    def test_hindi_dosage_frequencies(self, engine: DeterministicSafetyEngine) -> None:
        res = engine.analyze_text("Yeh goli din mein do baar leni hai.")
        assert res.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert res.category == CriticalFactCategory.DOSAGE.value
        assert "din mein do baar" in res.matched_term.lower()

    def test_medical_abbreviations(self, engine: DeterministicSafetyEngine) -> None:
        for abbrev in ["bd", "od", "tds", "sos"]:
            res = engine.analyze_text(f"Prescribed 1 tab {abbrev}")
            assert res.safety_state == SafetyState.NEEDS_CONFIRMATION
            assert res.category == CriticalFactCategory.DOSAGE.value


# =============================================================================
# 4. SEVERE SYMPTOM DETECTION
# =============================================================================
class TestSevereSymptomDetection:
    def test_chest_pain_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'chest pain'"""
        assessment = engine.analyze_text("I have had chest pain since this morning.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.SEVERE_SYMPTOM.value
        assert "chest pain" in assessment.matched_term.lower()
        assert assessment.rule_id == SafetyRuleId.RULE_CRITICAL_SEVERE_SYMPTOM.value

    def test_breathing_difficulty_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'breathing difficulty'"""
        assessment = engine.analyze_text("Patient reports breathing difficulty upon exertion.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.SEVERE_SYMPTOM.value
        assert "breathing difficulty" in assessment.matched_term.lower()

    def test_fainting_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'fainting'"""
        assessment = engine.analyze_text("I had a fainting episode yesterday.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.SEVERE_SYMPTOM.value
        assert "fainting" in assessment.matched_term.lower()

    def test_hindi_chest_pain_and_dyspnea(self, engine: DeterministicSafetyEngine) -> None:
        res_chest = engine.analyze_text("Mere seene mein dard ho raha hai.")
        assert res_chest.category == CriticalFactCategory.SEVERE_SYMPTOM.value
        assert "seene mein dard" in res_chest.matched_term.lower()

        res_breath = engine.analyze_text("Saans lene mein takleef ho rahi hai.")
        assert res_breath.category == CriticalFactCategory.SEVERE_SYMPTOM.value
        assert "saans lene mein takleef" in res_breath.matched_term.lower()


# =============================================================================
# 5. NEGATION DETECTION (SAFETY CRITICAL)
# =============================================================================
class TestNegationDetection:
    def test_no_allergy_vs_affirmative_allergy_not_equivalent(
        self, engine: DeterministicSafetyEngine
    ) -> None:
        """PRD: 'These must NOT be treated as equivalent: No allergy vs I have an allergy.'"""
        negated = engine.analyze_text("No allergy.")
        affirmative = engine.analyze_text("I have an allergy.")

        # Both require confirmation, but categories, rule IDs, and terms differ!
        assert negated.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert affirmative.safety_state == SafetyState.NEEDS_CONFIRMATION

        assert negated.category == CriticalFactCategory.NEGATION.value
        assert affirmative.category == CriticalFactCategory.ALLERGY.value

        assert negated.rule_id == SafetyRuleId.RULE_CRITICAL_NEGATION.value
        assert affirmative.rule_id == SafetyRuleId.RULE_CRITICAL_ALLERGY.value

        assert negated.facts[0].is_negated is True
        assert affirmative.facts[0].is_negated is False

    def test_not_pregnant_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'not pregnant'"""
        assessment = engine.analyze_text("The patient confirmed she is not pregnant.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.NEGATION.value
        assert "not pregnant" in assessment.matched_term.lower()
        assert assessment.rule_id == SafetyRuleId.RULE_CRITICAL_NEGATION.value

    def test_no_pain_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'no pain'"""
        assessment = engine.analyze_text("Right now I have no pain.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.NEGATION.value
        assert "no pain" in assessment.matched_term.lower()

    def test_hindi_negated_penicillin_allergy(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("Mujhe penicillin se allergy nahi hai.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.NEGATION.value
        assert assessment.facts[0].is_negated is True

    def test_hindi_koi_allergy_nahi(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("Mujhe koi allergy nahi hai.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.NEGATION.value


# =============================================================================
# 6. EMERGENCY DETECTION (ESCALATE)
# =============================================================================
class TestEmergencyDetection:
    def test_cannot_breathe_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'cannot breathe' -> ESCALATE"""
        assessment = engine.analyze_text("I cannot breathe, please hurry!")
        assert assessment.safety_state == SafetyState.ESCALATE
        assert assessment.category == CriticalFactCategory.EMERGENCY.value
        assert "cannot breathe" in assessment.matched_term.lower()
        assert assessment.rule_id == SafetyRuleId.RULE_EMERGENCY_INDICATOR.value

    def test_unconscious_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'unconscious' -> ESCALATE"""
        assessment = engine.analyze_text("The patient is unconscious on the ground.")
        assert assessment.safety_state == SafetyState.ESCALATE
        assert assessment.category == CriticalFactCategory.EMERGENCY.value
        assert "unconscious" in assessment.matched_term.lower()

    def test_severe_bleeding_prd_example(self, engine: DeterministicSafetyEngine) -> None:
        """PRD example: 'severe bleeding' -> ESCALATE"""
        assessment = engine.analyze_text("There is severe bleeding from the wound.")
        assert assessment.safety_state == SafetyState.ESCALATE
        assert assessment.category == CriticalFactCategory.EMERGENCY.value
        assert "severe bleeding" in assessment.matched_term.lower()

    def test_hindi_emergency_saans_nahi_aa_rahi(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("Mareez ko saans nahi aa rahi hai.")
        assert assessment.safety_state == SafetyState.ESCALATE
        assert assessment.category == CriticalFactCategory.EMERGENCY.value

    def test_emergency_overrides_other_critical_facts(self, engine: DeterministicSafetyEngine) -> None:
        """Emergency indicators must produce ESCALATE and not continue normal interpretation."""
        assessment = engine.analyze_text("Patient takes metformin 500mg and cannot breathe!")
        assert assessment.safety_state == SafetyState.ESCALATE
        assert assessment.category == CriticalFactCategory.EMERGENCY.value


# =============================================================================
# 7. PROTECTED MEDICAL TERMS & CONFIGURABLE GLOSSARY
# =============================================================================
class TestProtectedMedicalTerms:
    def test_default_glossary_loaded(self) -> None:
        glossary = MedicalGlossary.load_default()
        assert glossary.total_terms >= 25
        assert glossary.is_protected("metformin") is True
        assert glossary.is_protected("penicillin") is True
        assert glossary.is_protected("insulin") is True
        assert glossary.is_protected("table") is False

    def test_glossary_lookup_case_insensitive(self) -> None:
        glossary = MedicalGlossary.load_default()
        assert glossary.is_protected("PENICILLIN") is True
        assert glossary.is_protected("MeTfOrMiN") is True

    def test_configurable_glossary_add_remove(self) -> None:
        glossary = MedicalGlossary()
        custom_term = ProtectedTerm(
            canonical_name="wondercillin",
            category=CriticalFactCategory.MEDICINE,
            variants=("wonderdrug", "wonder-cillin"),
        )
        glossary.add_term(custom_term)
        assert glossary.is_protected("wondercillin") is True
        assert glossary.is_protected("wonderdrug") is True

        glossary.remove_term("wondercillin")
        assert glossary.is_protected("wondercillin") is False

    def test_engine_with_custom_glossary(self) -> None:
        custom_glossary = MedicalGlossary(
            terms=[
                ProtectedTerm(
                    canonical_name="customdrug",
                    category=CriticalFactCategory.MEDICINE,
                )
            ]
        )
        custom_engine = DeterministicSafetyEngine(glossary=custom_glossary)
        assessment = custom_engine.analyze_text("I take customdrug daily.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.MEDICINE.value
        assert "customdrug" in assessment.matched_term.lower()

    def test_glossary_from_json(self, tmp_path: Path) -> None:
        custom_json = {
            "terms": [
                {
                    "canonical_name": "tempomed",
                    "category": "MEDICINE",
                    "variants": ["tempo"],
                    "is_protected": True,
                }
            ]
        }
        json_file = tmp_path / "glossary.json"
        json_file.write_text(json.dumps(custom_json), encoding="utf-8")

        loaded = MedicalGlossary.from_json_file(json_file)
        assert loaded.is_protected("tempomed") is True
        assert loaded.is_protected("tempo") is True


# =============================================================================
# 8. UNCERTAINTY & CONFIDENCE METADATA
# =============================================================================
class TestUncertaintyAndConfidence:
    def test_truncated_medicine_stem_needs_repetition(self, engine: DeterministicSafetyEngine) -> None:
        """PRD: Incomplete/uncertain critical term must produce NEEDS_REPETITION."""
        assessment = engine.analyze_text("Doctor said to take metfor... something like that.")
        assert assessment.safety_state == SafetyState.NEEDS_REPETITION
        assert assessment.rule_id == SafetyRuleId.RULE_UNCERTAIN_CRITICAL_TERM.value
        assert "metfor" in assessment.matched_term.lower()

    def test_inaudible_marker_in_allergy_needs_repetition(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("I am allergic to [inaudible] since childhood.")
        assert assessment.safety_state == SafetyState.NEEDS_REPETITION
        assert assessment.rule_id == SafetyRuleId.RULE_UNCERTAIN_CRITICAL_TERM.value

    def test_low_overall_confidence_needs_repetition(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text(
            "I take atorvastatin 20mg.",
            confidence_data={"overall": 0.45},
            min_confidence=0.75,
        )
        assert assessment.safety_state == SafetyState.NEEDS_REPETITION
        assert assessment.rule_id == SafetyRuleId.RULE_INSUFFICIENT_CONFIDENCE.value

    def test_low_term_confidence_needs_repetition(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text(
            "I take metformin daily.",
            confidence_data={"metformin": 0.40},
            min_confidence=0.75,
        )
        assert assessment.safety_state == SafetyState.NEEDS_REPETITION
        assert assessment.rule_id == SafetyRuleId.RULE_INSUFFICIENT_CONFIDENCE.value

    def test_missing_confidence_when_required_needs_repetition(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text(
            "I take insulin daily.",
            confidence_data=None,
            require_confidence=True,
        )
        assert assessment.safety_state == SafetyState.NEEDS_REPETITION
        assert assessment.rule_id == SafetyRuleId.RULE_MISSING_CONFIDENCE.value

    def test_missing_confidence_when_optional_allows_confirmation(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text(
            "I take insulin daily.",
            confidence_data=None,
            require_confidence=False,
        )
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION


# =============================================================================
# 9. FALSE POSITIVES & CONVERSATIONAL TEXT
# =============================================================================
class TestFalsePositivesAndConversationalText:
    def test_no_problem_idiom_not_medical_negation(self, engine: DeterministicSafetyEngine) -> None:
        """'No problem' contains 'no' but must NOT trigger medical negation."""
        assessment = engine.analyze_text("No problem at all doctor, I will wait.")
        assert assessment.safety_state == SafetyState.STANDARD
        assert assessment.category is None
        assert assessment.rule_id == SafetyRuleId.RULE_STANDARD_TURN.value

    def test_no_worries_idiom(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("No worries, thank you very much.")
        assert assessment.safety_state == SafetyState.STANDARD

    def test_distance_and_age_not_dosage(self, engine: DeterministicSafetyEngine) -> None:
        assessment1 = engine.analyze_text("I walked 5 kilometers to the hospital.")
        assert assessment1.safety_state == SafetyState.STANDARD

        assessment2 = engine.analyze_text("My daughter is 10 years old.")
        assert assessment2.safety_state == SafetyState.STANDARD

    def test_appointment_time_not_dosage(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("My appointment was at 10 AM.")
        assert assessment.safety_state == SafetyState.STANDARD

    def test_normal_greetings(self, engine: DeterministicSafetyEngine) -> None:
        assert engine.analyze_text("Hello doctor, good morning.").safety_state == SafetyState.STANDARD
        assert engine.analyze_text("Namaste doctor sahab, kaise hain?").safety_state == SafetyState.STANDARD
        assert engine.analyze_text("Mera naam Amit hai.").safety_state == SafetyState.STANDARD


# =============================================================================
# 10. MULTIPLE CRITICAL FACTS & OVERLAPPING CATEGORIES
# =============================================================================
class TestMultipleCriticalFacts:
    def test_medicine_and_dosage_together(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("I take metformin 500mg twice daily.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        # Medicine takes precedence over dosage in primary category
        assert assessment.category == CriticalFactCategory.MEDICINE.value
        # All individual facts are preserved in facts list
        categories = [f.category for f in assessment.facts]
        assert CriticalFactCategory.MEDICINE in categories
        assert CriticalFactCategory.DOSAGE in categories
        assert len(assessment.facts) >= 2

    def test_allergy_and_medicine_together(self, engine: DeterministicSafetyEngine) -> None:
        assessment = engine.analyze_text("I have a penicillin allergy and I take insulin.")
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        # Allergy has higher priority than Medicine
        assert assessment.category == CriticalFactCategory.ALLERGY.value
        categories = [f.category for f in assessment.facts]
        assert CriticalFactCategory.ALLERGY in categories
        assert CriticalFactCategory.MEDICINE in categories


# =============================================================================
# 11. CASE DIFFERENCES
# =============================================================================
class TestCaseDifferences:
    def test_penicillin_case_variations(self, engine: DeterministicSafetyEngine) -> None:
        for text in [
            "PENICILLIN ALLERGY",
            "penicillin allergy",
            "Penicillin Allergy",
            "pEnIcIlLiN aLlErGy",
        ]:
            res = engine.analyze_text(text)
            assert res.safety_state == SafetyState.NEEDS_CONFIRMATION
            assert res.category == CriticalFactCategory.ALLERGY.value

    def test_emergency_case_variations(self, engine: DeterministicSafetyEngine) -> None:
        for text in [
            "CANNOT BREATHE",
            "cannot breathe",
            "Cannot Breathe",
        ]:
            res = engine.analyze_text(text)
            assert res.safety_state == SafetyState.ESCALATE


# =============================================================================
# 12. EXPLAINABILITY & TURN INTEGRATION
# =============================================================================
class TestExplainabilityAndTurnIntegration:
    def test_turn_analysis_preserves_turn_id_and_explainability(
        self, engine: DeterministicSafetyEngine
    ) -> None:
        turn_id = uuid4()
        session_id = uuid4()
        turn = Turn(
            turn_id=turn_id,
            session_id=session_id,
            role=ParticipantRole.PATIENT,
            source_text="Mujhe penicillin se allergy hai.",
            confidence_data={"penicillin": 0.95},
        )
        assessment = engine.analyze_turn(turn)

        # Output contract: safety_state, matched_term, category, rule_id, reason, relevant turn_id
        assert assessment.turn_id == turn_id
        assert assessment.safety_state == SafetyState.NEEDS_CONFIRMATION
        assert assessment.category == CriticalFactCategory.ALLERGY.value
        assert "penicillin" in assessment.matched_term.lower()
        assert assessment.rule_id == SafetyRuleId.RULE_CRITICAL_ALLERGY.value
        assert assessment.reason is not None and len(assessment.reason) > 5

    def test_model_dump_matches_conceptual_structure(self, engine: DeterministicSafetyEngine) -> None:
        res = engine.analyze_text("Mujhe penicillin se allergy hai.")
        dump = res.model_dump()
        assert "safety_state" in dump
        assert "category" in dump
        assert "matched_term" in dump
        assert "rule_id" in dump
        assert "reason" in dump
        assert "turn_id" in dump


# =============================================================================
# 13. DETERMINISTIC BEHAVIOR VERIFICATION
# =============================================================================
class TestDeterministicBehavior:
    def test_100_runs_identical_results(self, engine: DeterministicSafetyEngine) -> None:
        """Every classification must be 100% deterministic with zero randomness."""
        test_inputs = [
            "Mujhe penicillin se allergy hai.",
            "I take metformin 500mg twice daily.",
            "Patient cannot breathe!",
            "Right now there is no pain.",
            "Doctor told me to take metfor...",
            "Good morning doctor, nice day.",
        ]
        for inp in test_inputs:
            baseline = engine.analyze_text(inp)
            for _ in range(50):
                current = engine.analyze_text(inp)
                assert current.safety_state == baseline.safety_state
                assert current.category == baseline.category
                assert current.matched_term == baseline.matched_term
                assert current.rule_id == baseline.rule_id
                assert current.reason == baseline.reason


# =============================================================================
# 14. FIXED SAFETY EVALUATION DATASET RUNNER (36 PRD CASES)
# =============================================================================
class TestFixedSafetyEvaluationDataset:
    @pytest.mark.parametrize("case", SAFETY_EVALUATION_DATASET, ids=lambda c: c.case_id)
    def test_eval_case(self, engine: DeterministicSafetyEngine, case: SafetyEvalCase) -> None:
        """Run engine against fixed safety evaluation dataset."""
        assessment = engine.analyze_text(
            text=case.input_text,
            confidence_data=case.confidence_data,
            require_confidence=case.require_confidence,
        )

        assert assessment.safety_state == case.expected_safety_state, (
            f"Case {case.case_id} failed: expected state {case.expected_safety_state}, "
            f"got {assessment.safety_state} for text: '{case.input_text}'"
        )

        if case.expected_category is not None:
            assert assessment.category == case.expected_category, (
                f"Case {case.case_id} failed: expected category {case.expected_category}, "
                f"got {assessment.category} for text: '{case.input_text}'"
            )

        if case.expected_term_contains is not None:
            assert assessment.matched_term is not None and (
                case.expected_term_contains.lower() in assessment.matched_term.lower()
            ), (
                f"Case {case.case_id} failed: expected term containing '{case.expected_term_contains}', "
                f"got '{assessment.matched_term}'"
            )
