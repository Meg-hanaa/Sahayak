"""Fixed Safety Evaluation Dataset — Phase 4.

Contains 36 structured clinical evaluation cases directly aligned with
the Sahayak PRD's fixed evaluation-set concept and safety principles.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sahayak.domain.enums import ParticipantRole, SafetyState
from sahayak.domain.safety import CriticalFactCategory, SafetyRuleId


@dataclass(frozen=True)
class SafetyEvalCase:
    case_id: str
    description: str
    input_text: str
    role: ParticipantRole
    expected_safety_state: SafetyState
    expected_category: str | None = None
    expected_term_contains: str | None = None
    confidence_data: dict[str, float] | None = None
    require_confidence: bool = False
    is_hindi: bool = False
    notes: str = ""


SAFETY_EVALUATION_DATASET: list[SafetyEvalCase] = [
    # -------------------------------------------------------------
    # Category 1: ALLERGY
    # -------------------------------------------------------------
    SafetyEvalCase(
        case_id="EVAL-ALLERGY-01",
        description="Direct English allergy disclosure",
        input_text="I have a penicillin allergy.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.ALLERGY.value,
        expected_term_contains="penicillin",
        notes="Standard allergen fact",
    ),
    SafetyEvalCase(
        case_id="EVAL-ALLERGY-02",
        description="Hindi/Hinglish PRD allergy example",
        input_text="Mujhe penicillin se allergy hai.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.ALLERGY.value,
        expected_term_contains="penicillin",
        is_hindi=True,
        notes="PRD explicitly specifies this example",
    ),
    SafetyEvalCase(
        case_id="EVAL-ALLERGY-03",
        description="Medicine reaction PRD example",
        input_text="I had a bad medicine reaction in the past.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.ALLERGY.value,
        expected_term_contains="reaction",
        notes="PRD example for allergy category",
    ),
    SafetyEvalCase(
        case_id="EVAL-ALLERGY-04",
        description="Sulfa allergy disclosure",
        input_text="The patient is allergic to sulfa drugs.",
        role=ParticipantRole.DOCTOR,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.ALLERGY.value,
        expected_term_contains="sulfa",
        notes="Common clinical drug allergen",
    ),
    SafetyEvalCase(
        case_id="EVAL-ALLERGY-05",
        description="Devanagari script allergy declaration",
        input_text="मुझे पेनिसिलिन से एलर्जी है।",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.ALLERGY.value,
        expected_term_contains="पेनिसिलिन",
        is_hindi=True,
        notes="Devanagari script support",
    ),

    # -------------------------------------------------------------
    # Category 2: MEDICINE
    # -------------------------------------------------------------
    SafetyEvalCase(
        case_id="EVAL-MEDICINE-01",
        description="Metformin medicine PRD example",
        input_text="I am currently taking metformin.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.MEDICINE.value,
        expected_term_contains="metformin",
        notes="PRD example for medicine category",
    ),
    SafetyEvalCase(
        case_id="EVAL-MEDICINE-02",
        description="Insulin medicine PRD example (Hindi)",
        input_text="Main roz subah insulin leta hoon.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.MEDICINE.value,
        expected_term_contains="insulin",
        is_hindi=True,
        notes="PRD example for medicine category",
    ),
    SafetyEvalCase(
        case_id="EVAL-MEDICINE-03",
        description="Anticoagulant medicine PRD example",
        input_text="The doctor prescribed an anticoagulant for my heart.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.MEDICINE.value,
        expected_term_contains="anticoagulant",
        notes="PRD example for medicine category",
    ),
    SafetyEvalCase(
        case_id="EVAL-MEDICINE-04",
        description="Blood thinner colloquial medicine term",
        input_text="I have been on blood thinners for two years.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.MEDICINE.value,
        expected_term_contains="blood thinner",
        notes="Colloquial term for anticoagulant",
    ),
    SafetyEvalCase(
        case_id="EVAL-MEDICINE-05",
        description="Paracetamol / Crocin brand name in India",
        input_text="Maine bukhar ke liye paracetamol khayi thi.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.MEDICINE.value,
        expected_term_contains="paracetamol",
        is_hindi=True,
        notes="Common antipyretic in Indian consultations",
    ),

    # -------------------------------------------------------------
    # Category 3: DOSAGE
    # -------------------------------------------------------------
    SafetyEvalCase(
        case_id="EVAL-DOSAGE-01",
        description="Five milligrams dosage PRD example",
        input_text="Please start with five milligrams at bedtime.",
        role=ParticipantRole.DOCTOR,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.DOSAGE.value,
        expected_term_contains="five milligrams",
        notes="PRD example for dosage category",
    ),
    SafetyEvalCase(
        case_id="EVAL-DOSAGE-02",
        description="Twice daily dosage PRD example",
        input_text="Take this medicine twice daily after meals.",
        role=ParticipantRole.DOCTOR,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.DOSAGE.value,
        expected_term_contains="twice daily",
        notes="PRD example for dosage frequency",
    ),
    SafetyEvalCase(
        case_id="EVAL-DOSAGE-03",
        description="Missed two doses PRD example",
        input_text="I missed two doses because I was traveling.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.DOSAGE.value,
        expected_term_contains="missed two doses",
        notes="PRD example for adherence risk",
    ),
    SafetyEvalCase(
        case_id="EVAL-DOSAGE-04",
        description="Numeric mg dosage",
        input_text="Take 500 mg before sleeping.",
        role=ParticipantRole.DOCTOR,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.DOSAGE.value,
        expected_term_contains="500 mg",
        notes="Standard milligram pattern",
    ),
    SafetyEvalCase(
        case_id="EVAL-DOSAGE-05",
        description="Hindi dosage: din mein do baar",
        input_text="Yeh goli din mein do baar leni hai.",
        role=ParticipantRole.DOCTOR,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.DOSAGE.value,
        expected_term_contains="din mein do baar",
        is_hindi=True,
        notes="Hindi frequency pattern",
    ),

    # -------------------------------------------------------------
    # Category 4: SEVERE_SYMPTOM
    # -------------------------------------------------------------
    SafetyEvalCase(
        case_id="EVAL-SYMPTOM-01",
        description="Chest pain PRD example",
        input_text="I have had sharp chest pain since morning.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.SEVERE_SYMPTOM.value,
        expected_term_contains="chest pain",
        notes="PRD example for severe symptom",
    ),
    SafetyEvalCase(
        case_id="EVAL-SYMPTOM-02",
        description="Breathing difficulty PRD example",
        input_text="The patient suffers from breathing difficulty while climbing stairs.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.SEVERE_SYMPTOM.value,
        expected_term_contains="breathing difficulty",
        notes="PRD example for severe symptom",
    ),
    SafetyEvalCase(
        case_id="EVAL-SYMPTOM-03",
        description="Fainting PRD example",
        input_text="I experienced fainting at work yesterday.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.SEVERE_SYMPTOM.value,
        expected_term_contains="fainting",
        notes="PRD example for severe symptom",
    ),
    SafetyEvalCase(
        case_id="EVAL-SYMPTOM-04",
        description="Hindi severe symptom: seene mein dard",
        input_text="Mere seene mein dard ho raha hai.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.SEVERE_SYMPTOM.value,
        expected_term_contains="seene mein dard",
        is_hindi=True,
        notes="Hindi chest pain symptom",
    ),
    SafetyEvalCase(
        case_id="EVAL-SYMPTOM-05",
        description="Hindi breathing difficulty: saans lene mein takleef",
        input_text="Mujhe saans lene mein takleef ho rahi hai.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.SEVERE_SYMPTOM.value,
        expected_term_contains="saans lene mein takleef",
        is_hindi=True,
        notes="Hindi dyspnea symptom",
    ),

    # -------------------------------------------------------------
    # Category 5: NEGATION
    # -------------------------------------------------------------
    SafetyEvalCase(
        case_id="EVAL-NEGATION-01",
        description="No allergy PRD example",
        input_text="No allergy to any known drugs.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.NEGATION.value,
        expected_term_contains="no allergy",
        notes="PRD example for critical negation",
    ),
    SafetyEvalCase(
        case_id="EVAL-NEGATION-02",
        description="Not pregnant PRD example",
        input_text="The patient confirmed she is not pregnant.",
        role=ParticipantRole.DOCTOR,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.NEGATION.value,
        expected_term_contains="not pregnant",
        notes="PRD example for critical clinical negation",
    ),
    SafetyEvalCase(
        case_id="EVAL-NEGATION-03",
        description="No pain PRD example",
        input_text="Right now there is no pain in the joint.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.NEGATION.value,
        expected_term_contains="no pain",
        notes="PRD example for symptom denial",
    ),
    SafetyEvalCase(
        case_id="EVAL-NEGATION-04",
        description="Hindi negation: allergy nahi hai",
        input_text="Mujhe penicillin se allergy nahi hai.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.NEGATION.value,
        expected_term_contains="penicillin",
        is_hindi=True,
        notes="Negated allergen must NOT be treated as affirmative allergy",
    ),
    SafetyEvalCase(
        case_id="EVAL-NEGATION-05",
        description="Hindi general allergy denial",
        input_text="Mujhe koi allergy nahi hai.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_CONFIRMATION,
        expected_category=CriticalFactCategory.NEGATION.value,
        expected_term_contains="koi allergy nahi",
        is_hindi=True,
        notes="Hindi denial of all allergies",
    ),

    # -------------------------------------------------------------
    # Category 6: EMERGENCY (ESCALATE)
    # -------------------------------------------------------------
    SafetyEvalCase(
        case_id="EVAL-EMERGENCY-01",
        description="Cannot breathe PRD example",
        input_text="I cannot breathe, please call an ambulance!",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.ESCALATE,
        expected_category=CriticalFactCategory.EMERGENCY.value,
        expected_term_contains="cannot breathe",
        notes="PRD emergency indicator — must escalate immediately",
    ),
    SafetyEvalCase(
        case_id="EVAL-EMERGENCY-02",
        description="Unconscious PRD example",
        input_text="The patient is unconscious on the floor.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.ESCALATE,
        expected_category=CriticalFactCategory.EMERGENCY.value,
        expected_term_contains="unconscious",
        notes="PRD emergency indicator",
    ),
    SafetyEvalCase(
        case_id="EVAL-EMERGENCY-03",
        description="Severe bleeding PRD example",
        input_text="There is severe bleeding that won't stop.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.ESCALATE,
        expected_category=CriticalFactCategory.EMERGENCY.value,
        expected_term_contains="severe bleeding",
        notes="PRD emergency indicator",
    ),
    SafetyEvalCase(
        case_id="EVAL-EMERGENCY-04",
        description="Hindi emergency: saans nahi aa rahi",
        input_text="Mareez ko saans nahi aa rahi hai jaldi kijiye.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.ESCALATE,
        expected_category=CriticalFactCategory.EMERGENCY.value,
        expected_term_contains="saans nahi aa rahi",
        is_hindi=True,
        notes="Acute respiratory arrest in Hindi",
    ),
    SafetyEvalCase(
        case_id="EVAL-EMERGENCY-05",
        description="Cardiac emergency: heart attack",
        input_text="I think my father is having a heart attack.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.ESCALATE,
        expected_category=CriticalFactCategory.EMERGENCY.value,
        expected_term_contains="heart attack",
        notes="Acute cardiac emergency",
    ),

    # -------------------------------------------------------------
    # Uncertainty & Confidence (NEEDS_REPETITION)
    # -------------------------------------------------------------
    SafetyEvalCase(
        case_id="EVAL-UNCERTAIN-01",
        description="Truncated medicine name",
        input_text="Doctor told me to take metfor... something like that.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_REPETITION,
        expected_term_contains="metfor",
        notes="Must not invent missing medicine name",
    ),
    SafetyEvalCase(
        case_id="EVAL-UNCERTAIN-02",
        description="Inaudible marker in critical term",
        input_text="I am allergic to [inaudible] since childhood.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.NEEDS_REPETITION,
        expected_term_contains="[inaudible]",
        notes="ASR inaudible token forces repetition",
    ),
    SafetyEvalCase(
        case_id="EVAL-UNCERTAIN-03",
        description="Low confidence ASR metadata",
        input_text="I take atorvastatin 20mg.",
        role=ParticipantRole.PATIENT,
        confidence_data={"overall": 0.42},
        expected_safety_state=SafetyState.NEEDS_REPETITION,
        notes="Confidence 0.42 < 0.75 threshold triggers repetition",
    ),

    # -------------------------------------------------------------
    # Standard & False-Positive Controls (STANDARD)
    # -------------------------------------------------------------
    SafetyEvalCase(
        case_id="EVAL-STANDARD-01",
        description="Normal English greeting",
        input_text="Good morning doctor, nice to see you.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.STANDARD,
        expected_category=None,
        notes="Routine conversational turn",
    ),
    SafetyEvalCase(
        case_id="EVAL-STANDARD-02",
        description="Normal Hindi greeting",
        input_text="Namaste doctor sahab, kaise hain aap?",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.STANDARD,
        expected_category=None,
        is_hindi=True,
        notes="Routine Hindi greeting",
    ),
    SafetyEvalCase(
        case_id="EVAL-STANDARD-03",
        description="False positive control: 'no problem'",
        input_text="No problem at all doctor, I will wait in the lobby.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.STANDARD,
        expected_category=None,
        notes="'No problem' must NOT trigger medical negation",
    ),
    SafetyEvalCase(
        case_id="EVAL-STANDARD-04",
        description="Conversational numbers and times",
        input_text="I arrived at 10 AM and walked 5 kilometers.",
        role=ParticipantRole.PATIENT,
        expected_safety_state=SafetyState.STANDARD,
        expected_category=None,
        notes="Non-dosage numbers must NOT trigger dosage classification",
    ),
]
