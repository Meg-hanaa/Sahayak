# Sahayak Frontend

Sahayak is a browser-based voice interpretation system connecting an English-speaking doctor and a Hindi-speaking patient.

This package contains the React, Vite, and TypeScript frontend client.

---

## What Phase 2 Includes

- **Full-Width Responsive Homepage (`/`)**:
  - Full-width layout spanning the available viewport width without an artificial boxed frame or floating card container.
  - Compact, accessible header navigation (~72–80px tall on desktop) aligned to inner content gutters with a skip-to-main-content link (`#main-content`).
  - Integrated photographic hero surface with the clinical consultation photograph (`/images/hero-consultation.png`) positioned as the background layer behind the content.
  - Hero copy placed on the left over natural negative space with a restrained, neutral white readability scrim, leaving the doctor and the patient on the laptop screen unobscured across all breakpoints.
  - Quiet text label for "English ↔ Hindi voice interpretation" (without rounded badge borders).
  - Restrained 3-item hero information strip in normal document flow (Doctor language: English, Patient language: हिन्दी, Connection: Private invitation link) clear of faces and the laptop screen.
  - Simplified, open feature columns ("Keep the conversation clear") without individual card borders, boxes, or hover treatments.
  - Semantic ordered-list "How it works" section with simple numbered steps (1, 2, 3) that stack naturally on mobile.
  - Full-width footer retaining the project tagline and hackathon prototype disclaimer.
- **Relocated Foundation Preview (`/dev/foundation`)**:
  - The Phase 1 design system preview, component specimens, and route testing links remain available at `/dev/foundation` for developer testing.
- **Design Tokens & Accessibility**:
  - 5-color palette: Midnight (`#22282C`), Ocean (`#929FA7`), Earth (`#E9E7E1`), Dust (`#E0E6EA`), and Snow (`#FFFFFF`).
  - Dual-font typography stack: Inter for English and Noto Sans Devanagari for Hindi.
  - Accessible keyboard focus rings (`:focus-visible`), skip-to-content landmark, semantic heading hierarchy, and responsive fluid layout across 375px, 768px, 1024px, 1440px, and 1920px.
  - Mobile touch targets meet or exceed 44px.

---

## Folder Structure

```
frontend/
├── public/
│   └── images/
│       ├── logo.png                    # Brand logo emblem
│       └── hero-consultation.png       # Clinical consultation hero photograph
├── src/
│   ├── assets/                         # Reserved for internal bundled assets
│   ├── components/                     # Reusable UI primitives
│   │   ├── Button.tsx
│   │   ├── Button.css                  # Shared button styles & hover states
│   │   ├── Container.tsx
│   │   ├── Container.css               # Shared container component
│   │   ├── FormField.tsx               # Accessible form input with error handling
│   │   └── FormField.css
│   ├── pages/                          # Application route views
│   │   ├── HomePage.tsx                # Phase 2 full-width responsive homepage
│   │   ├── HomePage.css
│   │   ├── FoundationPreviewPage.tsx   # Dev foundation preview (/dev/foundation)
│   │   ├── FoundationPreviewPage.css
│   │   ├── PlaceholderPage.tsx         # Route placeholders & 404
│   │   └── PlaceholderPage.css
│   ├── styles/                         # Global styles and design tokens
│   │   ├── tokens.css                  # Colors, typography, spacing, radii
│   │   └── global.css                  # Reset, focus-visible, language helpers
│   ├── App.tsx                         # Route configuration
│   └── main.tsx                        # React application entry point
├── index.html                          # HTML shell & font imports
├── package.json                        # Scripts and dependencies
├── tsconfig.json                       # TypeScript configuration
├── tsconfig.node.json                  # Vite TypeScript configuration
├── vite.config.ts                      # Vite build configuration
├── .gitignore                          # Ignored build & environment files
└── README.md                           # Project documentation
```

---

## Application Routes

| Path | Screen | Description |
| :--- | :--- | :--- |
| `/` | **Homepage** | Phase 2 full-width responsive healthcare homepage |
| `/dev/foundation` | **Foundation Preview** | Development design system specimens and route links |
| `/consultation/new` | **Doctor Setup** | Doctor session creation placeholder |
| `/join` | **Patient Join** | Patient invitation link / consultation code entry placeholder |
| `/join/:token` | **Audio Check** | Patient microphone / speaker check placeholder |
| `/doctor/:sessionId` | **Doctor Screen** | Live English interpretation screen placeholder |
| `/patient/:sessionId` | **Patient Screen** | Live Hindi interpretation screen placeholder |
| `/record/:sessionId` | **Session Record** | Post-consultation bilingual record placeholder |
| `*` | **Not Found (404)** | Accessible fallback page |

---

## Scripts & Local Development

### 1. Installation
```bash
npm install
```

### 2. Development Server
Starts the local development server at `http://localhost:5173`:
```bash
npm run dev
```

### 3. Type Checking
Validates both application code and Vite configuration:
```bash
npm run typecheck
```

### 4. Production Build
Typechecks and compiles production bundle into `dist/`:
```bash
npm run build
```

### 5. Preview Production Build
```bash
npm run preview
```
