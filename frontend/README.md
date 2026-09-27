# Sahayak Frontend

Sahayak is a browser-based bilingual voice interpretation system connecting an English-speaking doctor and a Hindi-speaking patient on separate devices.

This package contains the React 19, Vite, and TypeScript frontend application.

---

## Completed Phases Overview

### Phase 3: Setup & Audio Preflight Workflows

- **Doctor Preparation Screen (`/consultation/new`)**: Audio preflight in English with volume metering, two-tone speaker chime verification, mutual check exclusion, and device readiness checklist.
- **Patient Invitation Entry Screen (`/join`)**: Mobile-first invitation URL entry in Hindi (हिन्दी) with strict client-side validation against current app origin.
- **Patient Preparation Screen (`/join/:sessionId`)**: Hindi audio preflight, token ingestion, URL sanitization, and readiness verification.
- **Hardware Audio Verification Architecture**:
  - Transient Web Audio API checks (`AudioContext`, `AnalyserNode`, `OscillatorNode`) operating strictly in browser memory.
  - No audio is recorded, stored, or transmitted over the network during audio checks.
  - Microphone streams are never routed to speaker destinations, preventing acoustic feedback loops.
  - Full React Strict Mode lifecycle compatibility and proper resource release.

### Phase 4: Consultation Rooms & Backend Session Lifecycle Integration

- **Doctor Consultation Room (`/doctor/:sessionId`)**:
  - Desktop- and mobile-responsive English consultation room (`lang="en"`).
  - Session status pill (`created`, `ready`, `active`, `ended`), patient connection status, and session code display.
  - Real session state tracking via REST polling and role-authenticated WebSocket connection.
  - Accessible End Consultation confirmation modal (`role="dialog"`, `aria-modal="true"`) that calls the backend termination endpoint.
  - Concluded session view with navigation back to Home or Consultation Record.
  - Prominent prototype disclaimer: *"Prototype interpretation aid. Not for clinical diagnosis or prescription."*
- **Patient Consultation Room (`/patient/:sessionId`)**:
  - Mobile-first Hindi consultation room (`lang="hi"`) styled with `Noto Sans Devanagari`.
  - Doctor presence banner, session status, and connection health indicators.
  - Local Leave Consultation action allowing the patient to disconnect without forcibly ending the doctor's consultation.
  - Concluded consultation view in Hindi with return navigation.
  - Prominent localized disclaimer: *"प्रोटोटाइप व्याख्या सहायता। नैदानिक ​​निदान या दवा निर्धारण के लिए नहीं।"*

### Phase 5: Consultation Room UX Polish & Responsive Experience

- **Single Error State Architecture**: Consultation termination failures use the session error state as the single source of truth, rendered once in an accessible inline message (`role="alert"`) inside the confirmation modal without duplicate banners in the header, page body, controls bar, or live activity bar.
- **Resilient Confirmation & Retry Flow**: Asynchronous end/leave actions prevent unhandled promise rejections, preserve active session status on network or server errors, keep the confirmation modal open, and enable direct retry.
- **Responsive Layout & Content Protection**: Consultation containers maintain safe bottom padding preventing sticky control overlap across 375px, 768px, 1024px, and 1440px viewports. Long session IDs, connection indicators, and Hindi typography wrap without clipping or horizontal overflow.
- **Accessible Touch & Focus Targets**: All primary interactive elements maintain minimum 44px touch targets with prominent keyboard focus styling.

---

## Verified Backend API & WebSocket Contract

The frontend connects to the backend session service through verified endpoints and schemas (FastAPI):

| Method / Protocol | Endpoint | Headers / Params | Purpose & Verified Payload |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/sessions` | None | Creates session; returns session ID and separate access tokens for doctor and patient. |
| `POST` | `/api/sessions/{id}/join` | JSON Body | Authenticates participant using `{ "token": string, "role": "doctor" \| "patient", "microphone_status": string }`. |
| `GET` | `/api/sessions/{id}` | `Authorization: Bearer <token>` | Reads session status, language settings, and participant connection states. |
| `POST` | `/api/sessions/{id}/end` | `Authorization: Bearer <token>` | Concludes session (Doctor only). Sets status to `ended` and disconnects participants. |
| `WebSocket` | `/ws/sessions/{id}?token={token}` | Query param `?token=` | Authenticates participant socket, sends initial `{"type": "connected"}`, echoes `ack`. |

### Token Security & Lifecycle Guarantee

- **Session-Scoped Storage**: Doctor and patient access tokens are stored strictly in browser `sessionStorage` (`sahayak_token_<sessionId>`).
- **No LocalStorage or Logging**: Tokens are never stored in `localStorage`, never output to browser console logs, and never exposed in error banners or alerts.
- **URL Sanitization**: When a patient opens an invitation link containing `?token=...`, the token is stored in `sessionStorage` and immediately removed from the visible browser URL bar via `window.history.replaceState` to prevent token leakage in browser history or screen sharing.

---

## Doctor & Patient User Journeys

```
DOCTOR FLOW:
[/consultation/new]
  ├── Verify Microphone & Speaker
  ├── Click "Create consultation session" ──> POST /api/sessions
  ├── Store doctor token in sessionStorage
  ├── Join as Doctor ─────────────────────────> POST /api/sessions/{id}/join
  ├── Display Invitation Card with link:
  │     ${origin}/join/${sessionId}?token=${patientToken}
  └── Click "Enter consultation room" ──────> [/doctor/:sessionId]

PATIENT FLOW:
[/join/:sessionId?token=...] OR [/join]
  ├── Parse invitation URL & extract session ID + token
  ├── Reject incomplete/legacy links missing session ID
  ├── Store patient token in sessionStorage & strip token from visible URL
  ├── Verify Microphone & Speaker in Hindi
  ├── Click "सत्र में शामिल हों" ───────────────> POST /api/sessions/{id}/join
  └── Navigate to Consultation Room ─────────> [/patient/:sessionId]
```

---

## Current Backend Limitations & Honest Screen States

1. **Live Audio Streaming**: The current backend WebSocket (`/ws/sessions/{session_id}`) authenticates participants and echoes messages as `ack`, but does not yet deliver real-time speech transcription, translation, or audio streaming to client sockets.
2. **Honest Empty Transcripts**: Real-session transcripts remain empty (`turns: []`) until live speech events are streamed by the backend pipeline. Simulated dialogue turns are strictly confined to development fixtures (`/dev/setup`).
3. **Mute Control Availability**: Because live microphone audio is not yet streamed through the WebSocket, the mute button is disabled and clearly labeled `Mute (Unavailable)` / `माइक (अनुपलब्ध)` with an explanatory tooltip, preventing any false impression that audio hardware is actively muted.
4. **Peer Presence Verification**: Peer status ("Patient connected" / "डॉक्टर जुड़े हुए हैं") is displayed only when confirmed by the backend REST API response, never assumed.

---

## Configuration & Environment Variables

The frontend can run via same-origin reverse proxy or connect to an external backend:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `""` (Empty, uses Vite dev proxy) | Base URL of the backend API (e.g. `http://localhost:8000`). When unset, relative URLs are used with Vite's proxy. |

> [!NOTE]
> Provider API keys (AssemblyAI, Google Cloud, TTS) belong exclusively on the backend server. No provider secrets or private API keys are ever stored in frontend configuration or variables.

---

## Application Routes

| Path | Screen | Language | Description |
| :--- | :--- | :--- | :--- |
| `/` | **Homepage** | English | Full-width responsive healthcare portal |
| `/consultation/new` | **Doctor Preparation** | English | Audio checks, session creation, auto-join & invitation sharing |
| `/join` | **Patient Join Entry** | Hindi (`hi`) | Manual invitation link entry with format & session ID validation |
| `/join/:sessionId` | **Patient Preparation** | Hindi (`hi`) | Token ingestion, URL sanitization, audio checks & backend join |
| `/doctor/:sessionId` | **Doctor Room** | English | English consultation room, peer status, empty transcript & end session |
| `/patient/:sessionId` | **Patient Room** | Hindi (`hi`) | Hindi consultation room, peer status, empty transcript & leave session |
| `/dev/setup` | **Setup Fixtures** | Both | Dev-only interactive fixture preview (lazy-loaded, excluded from prod) |
| `/dev/foundation` | **Design System** | English | Dev-only design tokens & component specimen showcase |
| `/record/:sessionId` | **Session Record** | English | Post-consultation record placeholder (future work) |
| `*` | **Not Found (404)** | English | Accessible error fallback page |

---

## Development & Verification Scripts

```bash
# Install frontend dependencies
npm install

# Start local development server with backend proxy on http://localhost:5173
npm run dev

# Run automated test suites (Regression suite + Consultation suite)
npm test

# Run TypeScript typechecks
npm run typecheck

# Build optimized production bundle (strict TypeScript + Vite)
npm run build

# Preview production build locally
npm run preview
```
