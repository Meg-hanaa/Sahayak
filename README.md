# Sahayak: Safety-Aware Clinical Voice Interpretation Agent

Sahayak is a real-time, safety-aware voice interpretation and clinical transcription platform designed for bilingual healthcare consultations. It bridges language barriers between English-speaking medical practitioners and Hindi-speaking patients, combining streaming speech recognition, clinical safety verification, low-latency translation, and automated bilingual consultation records.

---

## Problem Statement

Language barriers in healthcare lead to diagnostic delays, medication errors, and reduced patient adherence across clinical settings worldwide:

1. **Healthcare Delivery Disconnect**: Millions of non-English speaking patients seek care from English-speaking doctors across tertiary hospitals, telemedicine networks, and regional clinics.
2. **Clinical Risk in Generic Machine Translation**: Generic translation tools frequently mistranslate critical medical terminology, drug dosages, and anatomical terms. In clinical contexts, a single mistranslation of dosage or frequency poses immediate patient harm.
3. **Absence of Real-Time Clinical Verification**: Standard speech translation platforms operate as black boxes without validating medical facts, checking confidence thresholds, or detecting clinical emergencies.
4. **Documentation Burden**: Doctors must manually translate and document patient conversations into clinical notes, increasing physician burnout and introducing record discrepancies.

---

## Solution

Sahayak provides an end-to-end clinical consultation interpretation system:

1. **Two-Way Real-Time Interpretation**: English speech from doctors is translated to Hindi audio and text for patients; Hindi speech from patients is translated to English audio and text for doctors.
2. **Clinical Safety Engine**: Every translated turn is evaluated through a clinical verification engine that validates medical terminology against standardized glossaries, cross-checks numerical dosages, and flags low-confidence phrases.
3. **Deterministic Verified Medical Facts**: Extracted clinical facts (such as medications, dosage amounts, allergies, and symptoms) are displayed side-by-side in both languages for mutual patient-doctor verification.
4. **Automated Bilingual Consultation Records**: At the conclusion of each consultation, the system generates an official bilingual consultation summary containing time-stamped transcripts, verified clinical facts, and interpretation latency metrics (with print-friendly clinical styling).
5. **Hardware Pre-Flight Diagnostics**: Guided preparation checklists verify microphone input (via Web Audio RMS analysis) and speaker output (via acoustic chime playback) before clinical sessions start.

---

## Key Features

- **Role-Isolated Consultation Rooms**: Distinct, specialized interfaces for English-speaking doctors and Hindi-speaking patients with zero cross-role leakage.
- **Low Latency Target**: Streaming architecture designed to achieve sub-2.0 second median turn-around latency for natural conversational cadence.
- **Web Speech and Audio Streaming**: Flexible input pipeline supporting browser-native Web Speech API dictation and streaming WebSocket transmission.
- **Emergency Keyword Detection**: Real-time identification of critical distress terms (such as chest pain, severe bleeding, or loss of consciousness) with prominent visual warnings.
- **Repetition and Clarification Requests**: One-click clarification requests allowing either participant to request repetition of the last translated turn.
- **Privacy and Ephemeral Sessions**: Session tokens and consultation audio streams expire automatically with zero persistent storage of unencrypted patient audio.

---

## System Architecture

The application is structured into two decoupled tiers:

```
[ Doctor (English) ]               [ Patient (Hindi) ]
        |                                   |
        +-----> [ React Frontend (Vite) ] <--+
                        |
            (WebSocket + REST API)
                        |
                        v
        [ FastAPI Backend Service ]
          +-- Session Manager (Tokens and TTL)
          +-- Streaming Audio Router
          +-- Clinical Safety Engine
          |     +-- Medical Glossary Validation
          |     +-- Numerical and Dosage Integrity
          |     +-- Confidence Scoring
          +-- Bilingual Record Generator
```

---

## Technology Stack

### Frontend
- **Framework**: React 19 with TypeScript
- **Tooling**: Vite, PostCSS
- **Routing**: React Router DOM (v7)
- **Audio and Media**: Web Audio API (RMS level detection, oscillator synthesis), Web Speech API
- **Icons**: Lucide React
- **Design System**: Accessible, high-contrast healthcare UI token architecture

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Server**: Uvicorn (ASGI)
- **Validation and Settings**: Pydantic v2, Pydantic-Settings
- **Networking**: WebSockets for real-time bi-directional streaming
- **Architecture**: Domain-driven service layers with clinical safety pipeline

---

## Steps to Open and Run the Project

### Prerequisites
- Node.js (version 18 or higher) and npm
- Python (version 3.11 or higher)
- Git

---

### 1. Clone the Repository
```bash
git clone https://github.com/Meg-hanaa/Sahayak.git
cd Sahayak
```

---

### 2. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   - On Windows:
     ```powershell
     python -m venv .venv
     .venv\Scripts\activate
     ```
   - On macOS/Linux:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install dependencies:
   ```bash
   pip install -e .
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   (The default configuration runs with mock speech and translation providers, allowing full local testing without third-party API keys).

5. Start the backend server:
   ```bash
   uvicorn sahayak.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   The backend API will be available at `http://localhost:8000`. API documentation is accessible at `http://localhost:8000/docs`.

---

### 3. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`.

---

### 4. Running the Consultation Workflow

1. Open `http://localhost:5173` in your browser.
2. Click **Start a consultation** to enter the Doctor Preparation room.
3. Complete the quick microphone and speaker audio diagnostics.
4. Click **Start consultation** to create the session.
5. Copy the generated patient invitation link or code.
6. Open an incognito window or separate browser tab, paste the link (or navigate to `/join`), and enter as the Patient.
7. Converse between the doctor (speaking English) and the patient (speaking Hindi). Real-time translated transcripts and verified clinical facts will appear in both sessions.
8. End the consultation to inspect the generated bilingual consultation record.

---

## Business Impact and Healthcare Outcomes

1. **Reduction in Medical Errors**:
   Automated safety checks and bilingual dosage verification directly reduce adverse clinical events caused by language misunderstandings.

2. **Physician Efficiency and Lower Burnout**:
   Automating the live transcription and bilingual consultation record eliminates 10 to 15 minutes of manual clinical note translation per patient.

3. **Expanded Healthcare Access**:
   Enables specialized hospital systems and urban medical centers to deliver telemedicine to non-English speaking patient populations without requiring on-site human interpreters for every visit.

4. **Clinical Auditability and Compliance**:
   Provides hospital administrators and legal review teams with time-stamped, verifiable transcripts of consultations, ensuring compliance with patient communication standards.

5. **Cost Effectiveness**:
   Reduces reliance on expensive on-call medical interpretation agencies, lowering the operational cost per bilingual telehealth encounter while maintaining clinical safety.

---

## Future Impact and Roadmap

1. **Global Multilingual Healthcare Expansion**:
   Scaling the safety-aware interpretation architecture to major world languages, including Spanish, Arabic, Mandarin, French, Portuguese, Bengali, and Swahili. This expands access across international health networks, immigrant care facilities, cross-border telemedicine consultations, and humanitarian relief organizations (such as MSF and the WHO).

2. **Universal Health Record Standards Integration**:
   Connecting consultation records directly with global electronic health record protocols, including international HL7 FHIR standards, US Core Data for Interoperability (USCDI), and national health stacks (such as India's ABDM) for secure, consent-driven medical records transfer.

3. **Edge Deployment for Low-Resource and Disaster Settings**:
   Optimizing neural translation models for offline, low-power on-device execution on ruggedized medical tablets, serving remote rural clinics, mobile field hospitals, and humanitarian crisis zones with zero internet connectivity.

4. **Multi-Party Global Consultations**:
   Supporting multi-lingual care circles where patients, specialist doctors from international tertiary centers, local interpreters, and family caregivers can converse simultaneously, each receiving translated audio and transcripts in their preferred language.

5. **Ambient Clinical Decision Support**:
   Integrating passive clinical safety monitors that scan verified dialogue for drug-allergy interactions, dosage contraindications, and automated multi-lingual medical coding (such as ICD-10 and SNOMED-CT).

---

## Clinical Safety and Governance

- **Safety First Architecture**: When translation confidence falls below safety thresholds, the system flags the phrase and prompts the doctor for manual confirmation before clinical logging.
- **Dual Verification**: Both practitioner and patient see the extracted medical facts (medications, dosages, instructions) in their respective primary languages.
- **Printed Clinical Records**: Performance latency and telemetry data are automatically omitted from printed exports via dedicated print stylesheets, ensuring patient-facing documents remain clean and strictly clinical.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 Ananya Raj and Meghana.