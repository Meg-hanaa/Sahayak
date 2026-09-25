import React, { useId } from 'react';
import { Shield, Info, Headphones } from 'lucide-react';
import { TaskHeader } from '../components/TaskHeader';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { MicrophoneCheck } from '../components/MicrophoneCheck';
import { SpeakerCheck } from '../components/SpeakerCheck';
import { PreparationChecklist } from '../components/PreparationChecklist';
import { useMicrophoneCheck } from '../hooks/useMicrophoneCheck';
import { useSpeakerCheck } from '../hooks/useSpeakerCheck';
import './DoctorPreparationPage.css';

export const DoctorPreparationPage: React.FC = () => {
  const mic = useMicrophoneCheck();
  const speaker = useSpeakerCheck();
  const sessionHeadingId = useId();

  // Mutual exclusion: Prevent speaker test from bleeding into mic test or vice versa
  const isMicBusy = mic.status === 'requesting' || mic.status === 'listening';
  const isSpeakerBusy = speaker.status === 'playing' || speaker.status === 'confirming';

  return (
    <div className="sahayak-prep-page" lang="en">
      <TaskHeader containerSize="md" badge="Doctor Preparation" />

      <main id="main-content" className="sahayak-prep-main">
        <Container size="md">
          {/* Page Heading */}
          <div className="sahayak-prep-header">
            <h1 className="sahayak-prep-title">Consultation preparation</h1>
            <p className="sahayak-prep-desc">
              Verify your audio input and output devices before beginning the consultation.
            </p>
            {/* Explicit language indicators */}
            <div className="sahayak-prep-languages" aria-label="Languages">
              <span className="sahayak-prep-lang-item">Doctor language: <strong>English</strong></span>
              <span className="sahayak-prep-lang-sep" aria-hidden="true">&bull;</span>
              <span className="sahayak-prep-lang-item">Patient language: <strong>हिन्दी (Hindi)</strong></span>
            </div>
          </div>

          <div className="sahayak-prep-layout">
            {/* Checklist summary */}
            <div className="sahayak-prep-section">
              <PreparationChecklist
                micStatus={mic.status}
                speakerStatus={speaker.status}
                language="en"
              />
            </div>

            {/* Audio Check Components with Mutual Exclusion */}
            <div className="sahayak-prep-cards-grid">
              <MicrophoneCheck
                mic={mic}
                language="en"
                disabled={isSpeakerBusy}
                disabledReason={isSpeakerBusy ? 'Speaker test is currently running. Please wait.' : undefined}
              />
              <SpeakerCheck
                speaker={speaker}
                language="en"
                disabled={isMicBusy}
                disabledReason={isMicBusy ? 'Microphone check is currently listening. Please wait or stop the check.' : undefined}
              />
            </div>

            {/* Headphone & Quiet Space Recommendation */}
            <div className="sahayak-prep-tip">
              <Headphones size={18} className="sahayak-prep-tip__icon" aria-hidden="true" />
              <p className="sahayak-prep-tip__text">
                <strong>Tip:</strong> Using headphones in a quiet room provides the clearest audio and helps avoid background noise.
              </p>
            </div>

            {/* Session Creation Section - Disabled with concise notice, no scope drift */}
            <section className="sahayak-session-create-card" aria-labelledby={sessionHeadingId}>
              <h2 id={sessionHeadingId} className="sahayak-session-create-card__title">
                Start consultation
              </h2>

              {/* Concise Integration Notice */}
              <div className="sahayak-integration-notice" role="status">
                <Info size={18} className="sahayak-integration-notice__icon" aria-hidden="true" />
                <div className="sahayak-integration-notice__text">
                  <p>
                    Session creation is not available yet. You can check your audio now.
                  </p>
                </div>
              </div>

              <div className="sahayak-session-actions">
                <Button
                  type="button"
                  variant="primary"
                  disabled
                  className="sahayak-session-submit-btn"
                  aria-disabled="true"
                >
                  Create consultation session
                </Button>
              </div>
            </section>

            {/* Accurate Privacy & Local Check Notice */}
            <div className="sahayak-privacy-strip">
              <Shield size={16} aria-hidden="true" />
              <span>
                Audio checks occur locally in your browser. No audio is recorded, stored, or uploaded.
              </span>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
};
