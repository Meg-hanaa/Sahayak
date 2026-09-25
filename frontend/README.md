# Sahayak Frontend

Sahayak is a browser-based voice interpretation system connecting an English-speaking doctor and a Hindi-speaking patient on separate devices.

This package contains the React, Vite, and TypeScript frontend client.

---

## What Phase 3 Includes

Phase 3 builds the setup, invitation entry, and local browser audio verification workflows for doctors and patients:

1. **Doctor Preparation Screen (`/consultation/new`)**:
   - Audio preflight interface in English for the doctor station.
   - Shows fixed consultation languages: Doctor English, Patient Hindi (हिन्दी).
   - Real browser microphone check with volume metering and detection threshold.
   - Gentle, synthesized two-tone speaker chime with dedicated cancellation action and explicit user confirmation (*"Did you hear the sound?"*).
   - Live preparation checklist summarizing audio device status.
   - Coordination/mutual exclusion between microphone and speaker checks to prevent feedback interference.
   - Quiet-space and headphone recommendation.
   - Session creation disabled with clear notice: *"Session creation is not available yet. You can check your audio now."*

2. **Patient Invitation Entry Screen (`/join`)**:
   - Mobile-first invitation URL entry in Hindi (हिन्दी).
   - Strict client-side URL validation via reusable `parseInvitationInput` utility accepting only:
     - A full HTTP(S) invitation URL matching the current app origin.
     - A relative `/join/:token` path (with optional single trailing slash).
   - Rejects foreign origins, credentials, malformed paths, double slashes, unsupported protocols, and empty input.
   - Clear Hindi validation messages (`"आमंत्रण लिंक दर्ज करें।"` and `"यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।"`).
   - Client navigation to the corresponding `/join/:token` preparation screen without network requests.

3. **Patient Preparation Screen (`/join/:token`)**:
   - Token-aware preflight interface in Hindi for the patient on their phone or tablet.
   - Shows fixed consultation languages: Patient Hindi (हिन्दी), Doctor English.
   - Explicit unverified state notice: *"आमंत्रण की पुष्टि अभी उपलब्ध नहीं है। लाइव सत्र में प्रवेश बैकएंड सेवा जुड़ने के बाद चालू होगा।"*
   - Dedicated join card notice: *"अभी परामर्श में शामिल होना उपलब्ध नहीं है। आप अपना ऑडियो जाँच सकते हैं।"*
   - Local browser microphone and speaker checks tailored with Hindi instructions and typography.
   - Preparation checklist with live check results.
   - Primary "सत्र में शामिल हों" (Join session) action disabled until backend integration.

4. **Hardware Audio Check Architecture**:
   - **Microphone (`useMicrophoneCheck`)**:
     - Uses Web Audio API `AudioContext` and `AnalyserNode` connected exclusively to an audio input stream (`video: false`).
     - Real-time time-domain level calculation with dynamic threshold detection (12%).
     - **Strict Safety Guarantee**: The input stream is **never** connected to `AudioContext.destination` (speakers), preventing any feedback loop or echo.
     - **Strict Privacy Guarantee**: No audio is recorded, stored, or sent across the network. All processing is transient and local.
     - **Dedicated Resource Ownership**: Each operation owns its dedicated stream tracks, `AudioContext`, nodes, timers, and animation frames. Stale operations release only their own resources without touching newer operations.
     - **Context Closure on Catch**: Catch handler ensures any `AudioContext` opened during failed attempts is cleanly closed.
     - **Retained Readings Reset**: Calling `startCheck()` immediately resets retained readings.
   - **Speaker (`useSpeakerCheck`)**:
     - Generates a local, gentle two-tone sinusoidal chime (C5 523Hz → E5 659Hz) using Web Audio API `OscillatorNode` with safe gain ramping (maximum gain 0.14).
     - **Dedicated Resource Ownership & Cancellation**: Provides `stopCheck` cancellation action while playback or context resume is pending so users are never trapped.
     - Requires explicit user verification (*"Did you hear the sound?"* / *"क्या आपको आवाज़ सुनाई दी?"*).

5. **Development Route Isolation & Fixtures (`/dev/setup`)**:
   - Both `/dev/setup` and `/dev/foundation` are lazy-loaded via `React.lazy` and gated by `import.meta.env.DEV`, ensuring they are strictly excluded from the production bundle.
   - **Doctor Invitation Result**: Clean, unbadged card with plain supporting sentence for preview fixtures (*"Example invitation. This link cannot join a session."*), and robust clipboard copy with `try/finally` focus restoration and textarea removal.
   - **Patient Invitation States**: Interactive switcher previewing all patient backend states (`unverified`, `verifying`, `valid`, `invalid`, `expired`, `session_full`, `session_ended`, `network_error`) in both Hindi and English.
   - **Simulated Hardware States**: Switcher previewing all microphone permission and speaker hardware error states.

6. **Neutral Completion Styling & Typography**:
   - Neutral palette using Midnight (`#22282C`) for text, icons, and meter fill; Dust (`#E0E6EA`) for completed backgrounds; Ocean (`#929FA7`) for restrained borders; Snow (`#FFFFFF`) for card surfaces.
   - Status communicated through checkmark icons and explicit wording, not color alone.
   - Controls (buttons, inputs) in Hindi containers inherit `Noto Sans Devanagari` (`var(--font-hindi)`).

---

## Backend Teammate Integration Needs

For Phase 4 consultation connectivity, the frontend anticipates the following integration capabilities:

- **Session Provisioning**: A mechanism for doctors on `/consultation/new` to initialize a consultation session and receive a unique patient invitation link.
- **Invitation Validation**: A mechanism for patients on `/join/:token` to verify token validity, session status (active, full, expired, or ended), and participant presence.
- **Bi-directional Audio Channel**: Real-time streaming connection (e.g. WebRTC or WebSocket) routing English audio from doctor to translation service and Hindi audio to patient (and vice-versa).
- **Session Lifecycle Events**: Notification of participant join/disconnect and session termination.

---

## Application Routes

| Path | Screen | Status | Description |
| :--- | :--- | :--- | :--- |
| `/` | **Homepage** | Complete | Full-width responsive healthcare homepage |
| `/consultation/new` | **Doctor Preparation** | Phase 3 Complete | English audio preflight, checklist & session setup |
| `/join` | **Patient Join Entry** | Phase 3 Complete | Hindi invitation link entry with strict origin/path validation |
| `/join/:token` | **Patient Preparation** | Phase 3 Complete | Hindi audio preflight, unverified status notice & checklist |
| `/dev/setup` | **Setup Fixtures** | Dev-Only (Lazy) | Interactive fixture preview for doctor invitation & patient states |
| `/dev/foundation` | **Foundation Preview** | Dev-Only (Lazy) | Design system specimen showcase |
| `/doctor/:sessionId` | **Doctor Screen** | Placeholder | Live English interpretation screen (Phase 4) |
| `/patient/:sessionId` | **Patient Screen** | Placeholder | Live Hindi interpretation screen (Phase 4) |
| `/record/:sessionId` | **Session Record** | Placeholder | Post-consultation bilingual summary (Phase 4) |
| `*` | **Not Found (404)** | Complete | Accessible fallback page |

---

## Local Development & Scripts

```bash
# Install dependencies
npm install

# Start local development server (http://localhost:5173)
npm run dev

# Run automated regression test suite
npm test

# Run TypeScript typechecks
npm run typecheck

# Build for production (outputs to dist/)
npm run build

# Preview production build locally
npm run preview
```
