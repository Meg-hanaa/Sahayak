import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import './HomePage.css';

interface SwatchItem {
  name: string;
  hex: string;
  role: string;
  contrastNote: string;
  textColor: string;
}

const PALETTE: SwatchItem[] = [
  {
    name: 'Midnight',
    hex: '#22282C',
    role: 'Primary text, primary buttons, deep frames',
    contrastNote: '14.8:1 on Snow (AAA)',
    textColor: '#FFFFFF',
  },
  {
    name: 'Ocean',
    hex: '#929FA7',
    role: 'Accents, secondary borders, supporting surfaces',
    contrastNote: '5.5:1 on Midnight (AA)',
    textColor: '#22282C',
  },
  {
    name: 'Earth',
    hex: '#E9E7E1',
    role: 'Warm neutral surfaces, subtle containers',
    contrastNote: '11.9:1 text contrast (AAA)',
    textColor: '#22282C',
  },
  {
    name: 'Dust',
    hex: '#E0E6EA',
    role: 'Field borders, dividers, subtle card backings',
    contrastNote: '11.5:1 text contrast (AAA)',
    textColor: '#22282C',
  },
  {
    name: 'Snow',
    hex: '#FFFFFF',
    role: 'Card surfaces, button text on dark, input base',
    contrastNote: '14.8:1 on Midnight (AAA)',
    textColor: '#22282C',
  },
];

const ROUTES = [
  {
    title: 'Doctor Setup',
    path: '/consultation/new',
    description: 'Initial session creation and language lock.',
  },
  {
    title: 'Patient Join',
    path: '/join',
    description: 'Patient landing to enter join credentials.',
  },
  {
    title: 'Patient Audio Check',
    path: '/join/token-sample-901',
    description: 'Microphone and speaker readiness verification.',
  },
  {
    title: 'Doctor Consultation',
    path: '/doctor/session-sample-101',
    description: 'Live English interpretation and confirmation interface.',
  },
  {
    title: 'Patient Consultation',
    path: '/patient/session-sample-101',
    description: 'Live Hindi captions and spoken interpretation interface.',
  },
  {
    title: 'Consultation Record',
    path: '/record/session-sample-101',
    description: 'Post-session bilingual record with verified facts.',
  },
  {
    title: 'Not Found Page (404)',
    path: '/route-that-does-not-exist',
    description: 'Fallback view for unknown URLs.',
  },
];

export const HomePage: React.FC = () => {
  const [interactiveInput, setInteractiveInput] = useState('');
  const [hasCustomError, setHasCustomError] = useState(true);

  return (
    <main className="sahayak-preview">
      <Container>
        {/* Header with supplied logo and preview badge */}
        <header className="sahayak-preview__header">
          <div className="sahayak-preview__top-bar">
            <div className="sahayak-preview__brand">
              <img
                src="/images/logo.png"
                alt="Sahayak emblem"
                className="sahayak-preview__logo"
                width="36"
                height="36"
              />
              <span className="sahayak-preview__app-name">Sahayak</span>
            </div>
            <span className="sahayak-preview__badge">
              Frontend foundation preview
            </span>
          </div>
          <h1 className="sahayak-preview__title">
            Frontend Foundation Preview
          </h1>
          <p className="sahayak-preview__subtitle">
            Phase 1 project setup, design system tokens, accessible reusable
            components, and route placeholders for the doctor-patient voice
            interpretation platform.
          </p>
        </header>

        {/* 1. Supplied Assets Section */}
        <section className="sahayak-preview__section" aria-labelledby="assets-heading">
          <h2 id="assets-heading" className="sahayak-preview__section-title">
            Supplied Assets
          </h2>
          <p className="sahayak-preview__section-desc">
            Verified image assets located in <code>/public/images/</code> and served statically.
          </p>
          <div className="sahayak-preview__hero-card">
            <img
              src="/images/hero-consultation.png"
              alt="Doctor conducting a remote consultation with a patient"
              className="sahayak-preview__hero-image"
              width="320"
              height="180"
            />
            <div className="sahayak-preview__hero-meta">
              <div className="sahayak-preview__hero-label">
                Hero Consultation Asset
              </div>
              <div className="sahayak-preview__hero-path">
                /images/hero-consultation.png
              </div>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                Demonstrates clinical setting and remote consultation format. Reserved for the landing page in Phase 2.
              </p>
            </div>
          </div>
        </section>

        {/* 2. Color Palette Section */}
        <section className="sahayak-preview__section" aria-labelledby="palette-heading">
          <h2 id="palette-heading" className="sahayak-preview__section-title">
            Color Palette &amp; Contrast Validation
          </h2>
          <p className="sahayak-preview__section-desc">
            Core 5-color palette evaluated for accessible text and surface contrast under WCAG standards.
          </p>
          <div className="sahayak-palette-grid">
            {PALETTE.map((swatch) => (
              <div key={swatch.name} className="sahayak-swatch">
                <div
                  className="sahayak-swatch__color"
                  style={{ backgroundColor: swatch.hex }}
                  aria-hidden="true"
                />
                <div className="sahayak-swatch__info">
                  <div className="sahayak-swatch__name">{swatch.name}</div>
                  <div className="sahayak-swatch__hex">{swatch.hex}</div>
                  <div className="sahayak-swatch__role">{swatch.role}</div>
                  <div
                    style={{
                      marginTop: 'var(--space-2)',
                      fontSize: '11px',
                      color: 'var(--color-text-muted)',
                      borderTop: '1px solid var(--color-dust)',
                      paddingTop: 'var(--space-1)',
                    }}
                  >
                    {swatch.contrastNote}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Reusable Button Components */}
        <section className="sahayak-preview__section" aria-labelledby="buttons-heading">
          <h2 id="buttons-heading" className="sahayak-preview__section-title">
            Button Component Variants
          </h2>
          <p className="sahayak-preview__section-desc">
            Accessible button states with visible keyboard focus rings and correct button types.
          </p>
          <div className="sahayak-specimen-row">
            <Button variant="primary" type="button">
              Primary Button
            </Button>
            <Button variant="secondary" type="button">
              Secondary Button
            </Button>
            <Button variant="primary" disabled type="button">
              Disabled Primary
            </Button>
            <Button variant="secondary" disabled type="button">
              Disabled Secondary
            </Button>
          </div>
        </section>

        {/* 4. FormField Component Specimens */}
        <section className="sahayak-preview__section" aria-labelledby="forms-heading">
          <h2 id="forms-heading" className="sahayak-preview__section-title">
            FormField Component Specimens
          </h2>
          <p className="sahayak-preview__section-desc">
            Accessible form inputs with explicit label binding, helper text, and live error association.
          </p>
          <div className="sahayak-form-grid">
            <FormField
              id="specimen-standard"
              label="Standard Field"
              placeholder="e.g. Dr. Sarah Jenkins"
              helperText="Optional helper text explaining the input purpose."
            />
            <FormField
              id="specimen-required"
              label="Required Field"
              value={interactiveInput}
              placeholder="Enter text to resolve error"
              required
              onChange={(e) => {
                const val = e.target.value;
                setInteractiveInput(val);
                setHasCustomError(val.trim().length === 0);
              }}
              error={
                hasCustomError
                  ? 'This field is required and cannot be blank.'
                  : undefined
              }
              helperText={
                !hasCustomError ? 'Input provided.' : undefined
              }
            />
          </div>
        </section>

        {/* 5. Bilingual Typography Specimens */}
        <section className="sahayak-preview__section" aria-labelledby="typography-heading">
          <h2 id="typography-heading" className="sahayak-preview__section-title">
            Bilingual Typography Specimens
          </h2>
          <p className="sahayak-preview__section-desc">
            Dual-language font stack using Inter for English and Noto Sans Devanagari for Hindi.
          </p>
          <div className="sahayak-type-grid">
            <div className="sahayak-type-card" lang="en">
              <div className="sahayak-type-card__header">
                <span>Doctor Screen (English)</span>
                <span>Inter</span>
              </div>
              <div className="sahayak-type-card__sample-title">
                "Where are you experiencing the most discomfort today?"
              </div>
              <p className="sahayak-type-card__sample-body">
                The doctor asks questions in English. The agent streams transcribed speech, runs critical fact checks, and outputs spoken Hindi to the patient.
              </p>
            </div>

            <div className="sahayak-type-card" lang="hi">
              <div className="sahayak-type-card__header">
                <span>Patient Screen (Hindi)</span>
                <span>Noto Sans Devanagari</span>
              </div>
              <div className="sahayak-type-card__sample-title lang-hi">
                "मुझे पेनिसिलिन से एलर्जी है और छाती में हल्का दर्द है।"
              </div>
              <p className="sahayak-type-card__sample-body lang-hi">
                मरीज़ अपनी भाषा में बोलते हैं। सहायक महत्वपूर्ण तथ्यों (जैसे एलर्जी और दवा) की पुष्टि करने के बाद ही डॉक्टर को सत्यापित जानकारी प्रदान करता है।
              </p>
            </div>
          </div>
        </section>

        {/* 6. Route Navigation Placeholders */}
        <section className="sahayak-preview__section" aria-labelledby="routes-heading">
          <h2 id="routes-heading" className="sahayak-preview__section-title">
            Frontend Route Placeholders
          </h2>
          <p className="sahayak-preview__section-desc">
            All Phase 1 application routes with sample identifiers. No live connections or sessions are claimed.
          </p>
          <div className="sahayak-route-grid">
            {ROUTES.map((route) => (
              <Link
                key={route.path}
                to={route.path}
                className="sahayak-route-card"
              >
                <div className="sahayak-route-card__title">{route.title}</div>
                <div className="sahayak-route-card__path">{route.path}</div>
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  {route.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </Container>
    </main>
  );
};
