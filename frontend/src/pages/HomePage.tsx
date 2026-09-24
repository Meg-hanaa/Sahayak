import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Languages, ShieldCheck, FileText, Menu, X } from 'lucide-react';
import { ConversationExample } from '../components/ConversationExample';
import '../components/Button.css';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);
  const heroImageRef = useRef<HTMLImageElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement | null>(null);

  // Trigger entrance animation once on mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Close mobile disclosure on Escape key and return focus to toggle button
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        mobileMenuToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileMenuOpen]);

  // Close mobile menu if viewport widens to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768 && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMobileMenuOpen]);

  // 1. Sticky Header IntersectionObserver Sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When sentinel is intersecting the top of viewport, user is at top
        setIsScrolled(!entry.isIntersecting);
      },
      { threshold: [0] }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  // 2. Gentle Desktop Hero Parallax
  useEffect(() => {
    const heroEl = heroRef.current;
    const imgEl = heroImageRef.current;
    if (!heroEl || !imgEl) return;

    const minWidthQuery = window.matchMedia('(min-width: 1024px)');
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    let isHeroInView = true;
    let rafId: number | null = null;
    let ticking = false;

    const shouldEnableParallax = () => {
      return (
        minWidthQuery.matches &&
        pointerQuery.matches &&
        !motionQuery.matches
      );
    };

    const updateParallax = () => {
      if (!shouldEnableParallax() || !isHeroInView) {
        if (imgEl.style.transform !== '') {
          imgEl.style.transform = '';
        }
        return;
      }

      const scrollY = window.scrollY || window.pageYOffset;
      // Clamped gentle movement: 0 to 20px over hero scroll range
      const movement = Math.min(Math.max(scrollY * 0.045, 0), 20);
      imgEl.style.transform = `translate3d(0, ${movement.toFixed(2)}px, 0)`;
    };

    const onScroll = () => {
      if (!ticking && isHeroInView && shouldEnableParallax()) {
        ticking = true;
        rafId = requestAnimationFrame(() => {
          updateParallax();
          ticking = false;
        });
      }
    };

    const onMediaChange = () => {
      if (!shouldEnableParallax()) {
        if (imgEl.style.transform !== '') {
          imgEl.style.transform = '';
        }
      } else {
        updateParallax();
      }
    };

    // Hero Visibility Observer to suspend updates when outside viewport
    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        isHeroInView = entry.isIntersecting;
        if (isHeroInView) {
          updateParallax();
        }
      },
      { threshold: 0 }
    );

    heroObserver.observe(heroEl);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Listen to media query changes (viewport resize & reduced-motion toggle)
    minWidthQuery.addEventListener('change', onMediaChange);
    pointerQuery.addEventListener('change', onMediaChange);
    motionQuery.addEventListener('change', onMediaChange);

    // Initial check
    updateParallax();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      heroObserver.disconnect();
      minWidthQuery.removeEventListener('change', onMediaChange);
      pointerQuery.removeEventListener('change', onMediaChange);
      motionQuery.removeEventListener('change', onMediaChange);
      if (imgEl) imgEl.style.transform = '';
    };
  }, []);

  return (
    <div className="sahayak-page">
      {/* Top Sentinel for Sticky Header State */}
      <div ref={sentinelRef} className="sahayak-scroll-sentinel" aria-hidden="true" />

      {/* Keyboard Accessibility Skip Link */}
      <a href="#main-content" className="sahayak-skip-link">
        Skip to main content
      </a>

      {/* Full-width Sticky Header */}
      <header className={`sahayak-header ${isScrolled ? 'sahayak-header--stuck' : ''}`}>
        <div className="sahayak-home-wrapper sahayak-header__inner">
          <Link
            to="/"
            className="sahayak-brand"
            aria-label="Sahayak homepage"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <img
              src="/images/logo.png"
              alt=""
              aria-hidden="true"
              className="sahayak-brand__logo"
              width="32"
              height="32"
            />
            <span className="sahayak-brand__wordmark">Sahayak</span>
          </Link>

          {/* Desktop Navigation (Only rendered when items fit comfortably) */}
          <nav className="sahayak-nav sahayak-nav--desktop" aria-label="Primary navigation">
            <a href="#how-it-works" className="sahayak-nav__link">
              How it works
            </a>
            <Link to="/join" className="sahayak-nav__link">
              Join with invite
            </Link>
            <Link
              to="/consultation/new"
              className="sahayak-button sahayak-button--primary sahayak-nav__action"
            >
              Start a consultation
            </Link>
          </nav>

          {/* Mobile Labelled Disclosure Menu Toggle Button */}
          <button
            type="button"
            ref={mobileMenuToggleRef}
            className="sahayak-header__menu-toggle"
            aria-expanded={isMobileMenuOpen}
            aria-controls="sahayak-mobile-menu"
            aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            <span className="sahayak-header__menu-toggle-label">
              {isMobileMenuOpen ? 'Close' : 'Menu'}
            </span>
            {isMobileMenuOpen ? (
              <X size={20} aria-hidden="true" className="sahayak-header__menu-icon" />
            ) : (
              <Menu size={20} aria-hidden="true" className="sahayak-header__menu-icon" />
            )}
          </button>
        </div>

        {/* Expandable Mobile Navigation Disclosure */}
        <div
          id="sahayak-mobile-menu"
          className={`sahayak-mobile-menu ${isMobileMenuOpen ? 'sahayak-mobile-menu--open' : ''}`}
          hidden={!isMobileMenuOpen}
        >
          <nav className="sahayak-mobile-menu__nav" aria-label="Mobile navigation">
            <a
              href="#how-it-works"
              className="sahayak-mobile-menu__link"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              How it works
            </a>
            <Link
              to="/join"
              className="sahayak-mobile-menu__link"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Join with invite
            </Link>
            <Link
              to="/consultation/new"
              className="sahayak-button sahayak-button--primary sahayak-mobile-menu__action"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Start a consultation
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Landmark */}
      <main id="main-content">
        {/* Full-width Hero with Background Consultation Photograph */}
        <section
          ref={heroRef}
          className="sahayak-hero-section"
          aria-labelledby="hero-heading"
        >
          {/* Desktop Photographic Background Layer with Parallax Target */}
          <div className="sahayak-hero-backdrop" aria-hidden="true">
            <img
              ref={heroImageRef}
              src="/images/hero-consultation.png"
              alt=""
              className="sahayak-hero-backdrop__image"
              loading="eager"
            />
            <div className="sahayak-hero-backdrop__scrim" />
          </div>

          {/* Hero Content with Subtle Entrance Animation */}
          <div className="sahayak-home-wrapper sahayak-hero-inner">
            <div className="sahayak-hero-content">
              <p
                className={`sahayak-hero-eyebrow ${
                  isMounted ? 'sahayak-hero-animate sahayak-hero-animate--eyebrow' : ''
                }`}
              >
                English ↔ Hindi voice interpretation
              </p>
              <h1
                id="hero-heading"
                className={`sahayak-hero-heading ${
                  isMounted ? 'sahayak-hero-animate sahayak-hero-animate--heading' : ''
                }`}
              >
                Speak your language.{' '}
                <span className="sahayak-hero-heading-break">
                  Understand each other.
                </span>
              </h1>
              <p
                className={`sahayak-hero-description ${
                  isMounted ? 'sahayak-hero-animate sahayak-hero-animate--desc' : ''
                }`}
              >
                An English-speaking doctor and a Hindi-speaking patient can
                speak naturally, with translated speech and a bilingual
                transcript.
              </p>
              <div
                className={`sahayak-hero-actions ${
                  isMounted ? 'sahayak-hero-animate sahayak-hero-animate--actions' : ''
                }`}
              >
                <Link
                  to="/consultation/new"
                  className="sahayak-button sahayak-button--primary sahayak-hero-btn"
                >
                  Start a consultation
                </Link>
                <Link
                  to="/join"
                  className="sahayak-hero-secondary-link"
                >
                  Have an invite? Join
                </Link>
              </div>
            </div>
          </div>

          {/* Mobile Edge-to-Edge Photograph (Directly beneath actions on solid background) */}
          <div className="sahayak-hero-mobile-image-wrap">
            <img
              src="/images/hero-consultation.png"
              alt="Doctor having a video consultation with a patient on a laptop"
              className="sahayak-hero-mobile-image"
              loading="eager"
            />
          </div>
        </section>

        {/* Distinctive Bilingual Conversation Example */}
        <ConversationExample />

        {/* Features Section - Simplified Open Columns */}
        <section
          className="sahayak-features-section"
          aria-labelledby="features-title"
        >
          <div className="sahayak-home-wrapper">
            <div className="sahayak-section-header">
              <h2 id="features-title" className="sahayak-section-title">
                Keep the conversation clear
              </h2>
            </div>
            <div className="sahayak-features-grid">
              <div className="sahayak-feature-col">
                <div className="sahayak-feature-icon">
                  <Languages size={20} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h3 className="sahayak-feature-title">
                  Two-way voice interpretation
                </h3>
                <p className="sahayak-feature-desc">
                  Speak and hear responses in English or Hindi.
                </p>
              </div>

              <div className="sahayak-feature-col">
                <div className="sahayak-feature-icon">
                  <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h3 className="sahayak-feature-title">
                  Confirm important details
                </h3>
                <p className="sahayak-feature-desc">
                  Review key statements before they are marked as confirmed.
                </p>
              </div>

              <div className="sahayak-feature-col">
                <div className="sahayak-feature-icon">
                  <FileText size={20} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h3 className="sahayak-feature-title">
                  A bilingual record
                </h3>
                <p className="sahayak-feature-desc">
                  Review the conversation in both languages after the session.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section - Differentiated Layout with Introduction */}
        <section
          id="how-it-works"
          className="sahayak-how-section"
          aria-labelledby="how-title"
        >
          <div className="sahayak-home-wrapper">
            <div className="sahayak-how-grid">
              <div className="sahayak-how-intro-col">
                <h2 id="how-title" className="sahayak-section-title">
                  How it works
                </h2>
                <p className="sahayak-how-intro">
                  The doctor starts the session. The patient joins through an invitation.
                </p>
              </div>

              <ol className="sahayak-steps-list">
                <li className="sahayak-step-item">
                  <span className="sahayak-step-number" aria-hidden="true">
                    1
                  </span>
                  <div className="sahayak-step-content">
                    <h3 className="sahayak-step-title">Start a consultation</h3>
                    <p className="sahayak-step-desc">
                      The doctor creates a session and shares the invitation link.
                    </p>
                  </div>
                </li>

                <li className="sahayak-step-item">
                  <span className="sahayak-step-number" aria-hidden="true">
                    2
                  </span>
                  <div className="sahayak-step-content">
                    <h3 className="sahayak-step-title">Join and check audio</h3>
                    <p className="sahayak-step-desc">
                      The patient opens the invitation and checks their microphone and sound.
                    </p>
                  </div>
                </li>

                <li className="sahayak-step-item">
                  <span className="sahayak-step-number" aria-hidden="true">
                    3
                  </span>
                  <div className="sahayak-step-content">
                    <h3 className="sahayak-step-title">Speak in your language</h3>
                    <p className="sahayak-step-desc">
                      Take turns speaking while Sahayak provides translated speech.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>
      </main>

      {/* Full-width Footer */}
      <footer className="sahayak-footer">
        <div className="sahayak-home-wrapper sahayak-footer__inner">
          <div className="sahayak-footer__brand-group">
            <div className="sahayak-footer__brand">
              <img
                src="/images/logo.png"
                alt=""
                aria-hidden="true"
                className="sahayak-footer__logo"
                width="24"
                height="24"
              />
              <span className="sahayak-footer__name">Sahayak</span>
            </div>
            <div className="sahayak-footer__tagline">
              English and Hindi, in one conversation.
            </div>
          </div>
          <div className="sahayak-footer__disclaimer">
            Hackathon prototype. Not for clinical use.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;

