# Sahayak Frontend

Sahayak is a browser-based voice interpretation system connecting an English-speaking doctor and a Hindi-speaking patient.

This package contains the React, Vite, and TypeScript frontend client. Phase 1 establishes the project setup, design system tokens, accessible reusable components, and routing foundation.

---

## What Phase 1 Includes

- **Tech Stack**: React 19, Vite, TypeScript, React Router 7, and Lucide React with plain CSS.
- **Design Foundation**:
  - Semantic CSS custom properties for the 5-color palette: Midnight (`#22282C`), Ocean (`#929FA7`), Earth (`#E9E7E1`), Dust (`#E0E6EA`), and Snow (`#FFFFFF`).
  - Strict WCAG AAA/AA color contrast compliance.
  - Bilingual font stack: Inter for English and Noto Sans Devanagari for Hindi.
  - Restrained typography and spacing tokens.
- **Reusable Accessible Components**:
  - `Button`: Primary and secondary variants, disabled state, accessible focus-visible rings, explicit button types.
  - `Container`: Centered layout with responsive side padding (mobile 375px, tablet 768px, desktop 1440px).
  - `FormField`: Explicit label-to-input association, helper text, and accessible error state (`role="alert"`, `aria-invalid`, `aria-describedby`).
- **Application Routing**:
  - `/` - Foundation preview with component specimens, palette swatches, asset previews, and route links.
  - `/consultation/new` - Doctor consultation setup placeholder.
  - `/join` - Patient join portal placeholder.
  - `/join/:token` - Patient microphone and audio check placeholder.
  - `/doctor/:sessionId` - Doctor consultation screen placeholder.
  - `/patient/:sessionId` - Patient consultation screen placeholder.
  - `/record/:sessionId` - Post-consultation bilingual clinical record placeholder.
  - `*` - 404 Not Found fallback page.

---

## Folder Structure

```
frontend/
├── public/
│   └── images/
│       ├── logo.png                # Brand logo emblem
│       └── hero-consultation.png   # Clinical consultation hero image
├── src/
│   ├── assets/                     # Reserved for bundled assets
│   ├── components/                 # Reusable UI primitives
│   │   ├── Button.tsx
│   │   ├── Button.css
│   │   ├── Container.tsx
│   │   ├── Container.css
│   │   ├── FormField.tsx
│   │   └── FormField.css
│   ├── pages/                      # Application route views
│   │   ├── HomePage.tsx            # Foundation preview
│   │   ├── HomePage.css
│   │   ├── PlaceholderPage.tsx     # Route placeholders & 404
│   │   └── PlaceholderPage.css
│   ├── styles/                     # Global styles and design tokens
│   │   ├── tokens.css              # Colors, typography, spacing
│   │   └── global.css              # Reset, focus-visible, language helpers
│   ├── App.tsx                     # Route configuration
│   └── main.tsx                    # React application entry point
├── index.html                      # HTML shell & font imports
├── package.json                    # Scripts and dependencies
├── tsconfig.json                   # TypeScript configuration
├── tsconfig.node.json              # Vite TypeScript configuration
├── vite.config.ts                  # Vite build configuration
├── .gitignore                      # Ignored build & environment files
└── README.md                       # Project documentation
```

---

## Asset Locations

Static image assets are stored in `public/images/` and referenced from the root:
- Logo: `/images/logo.png`
- Hero Consultation: `/images/hero-consultation.png`

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
Runs TypeScript validation without emitting files:
```bash
npm run typecheck
```

### 4. Production Build
Validates types and bundles the production app into `dist/`:
```bash
npm run build
```

### 5. Preview Production Build
Previews the production build locally:
```bash
npm run preview
```
