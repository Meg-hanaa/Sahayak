import React, { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import { Shield, AlertCircle, Headphones, ArrowRight, CheckCircle2 } from 'lucide-react';
import { TaskHeader } from '../components/TaskHeader';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { MicrophoneCheck } from '../components/MicrophoneCheck';
import { SpeakerCheck } from '../components/SpeakerCheck';
import { PreparationChecklist } from '../components/PreparationChecklist';
import { InvitationResultCard } from '../components/InvitationResultCard';
import { useMicrophoneCheck } from '../hooks/useMicrophoneCheck';
import { useSpeakerCheck } from '../hooks/useSpeakerCheck';
import { sessionApi } from '../services/sessionApi';
import { setSessionToken } from '../utils/tokenStorage';
import './DoctorPreparationPage.css';

export const DoctorPreparationPage: React.FC = () => {
  const mic = useMicrophoneCheck();
  const speaker = useSpeakerCheck();
  const sessionHeadingId = useId();

  const [creationStatus, setCreationStatus] = useState<
    'idle' | 'creating' | 'joining' | 'ready' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);

  // Mutual exclusion: Prevent speaker test from bleeding into mic test or vice versa
  const isMicBusy = mic.status === 'requesting' || mic.status === 'listening';
  const isSpeakerBusy = speaker.status === 'playing' || speaker.status === 'confirming';
  const isActionBusy = creationStatus === 'creating' || creationStatus === 'joining';

  const handleCreateSession = async () => {
    setCreationStatus('creating');
    setErrorMessage(null);

    try {
      // 1. Create session via POST /api/sessions
      const created = await sessionApi.createSession();
      const sessionId = created.session.session_id;
      const doctorToken = created.access.doctor.token;
      const patientToken = created.access.patient.token;

      // 2. Safely retain doctor token in sessionStorage only (never localStorage or logged)
      setSessionToken(sessionId, doctorToken);

      // 3. Join session as doctor via POST /api/sessions/{id}/join
      setCreationStatus('joining');
      const micStatus = mic.status === 'sound_detected' ? 'active' : 'unknown';
      await sessionApi.joinSession(sessionId, {
        token: doctorToken,
        role: 'doctor',
        microphone_status: micStatus,
      });

      // 4. Construct patient invitation URL containing session ID and patient token
      const patientInviteUrl = `${window.location.origin}/join/${sessionId}?token=${encodeURIComponent(patientToken)}`;

      setCreatedSessionId(sessionId);
      setInvitationUrl(patientInviteUrl);
      setCreationStatus('ready');
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to create consultation session. Ensure backend is running.';
      setErrorMessage(message);
      setCreationStatus('error');
    }
  };

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
              <span className="sahayak-prep-lang-item">
                Doctor language: <strong>English</strong>
              </span>
              <span className="sahayak-prep-lang-sep" aria-hidden="true">
                &bull;
              </span>
              <span className="sahayak-prep-lang-item">
                Patient language: <strong>हिन्दी (Hindi)</strong>
              </span>
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
                disabledReason={
                  isSpeakerBusy
                    ? 'Speaker test is currently running. Please wait.'
                    : undefined
                }
              />
              <SpeakerCheck
                speaker={speaker}
                language="en"
                disabled={isMicBusy}
                disabledReason={
                  isMicBusy
                    ? 'Microphone check is currently listening. Please wait or stop the check.'
                    : undefined
                }
              />
            </div>

            {/* Headphone & Quiet Space Recommendation */}
            <div className="sahayak-prep-tip">
              <Headphones
                size={18}
                className="sahayak-prep-tip__icon"
                aria-hidden="true"
              />
              <p className="sahayak-prep-tip__text">
                <strong>Tip:</strong> Using headphones in a quiet room provides the clearest
                audio and helps avoid background noise.
              </p>
            </div>

            {/* Session Creation & Join Flow */}
            <section
              className="sahayak-session-create-card"
              aria-labelledby={sessionHeadingId}
            >
              <h2 id={sessionHeadingId} className="sahayak-session-create-card__title">
                Start consultation
              </h2>

              {creationStatus === 'ready' && invitationUrl && createdSessionId ? (
                <div className="sahayak-prep-ready-flow">
                  <div className="sahayak-prep-success-banner" role="status">
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <span>
                      Session initialized and joined. Share the invitation link below with your
                      patient.
                    </span>
                  </div>

                  <InvitationResultCard
                    invitationUrl={invitationUrl}
                    sessionCode={createdSessionId}
                    isFixture={false}
                  />

                  <div className="sahayak-prep-enter-wrapper">
                    <Link
                      to={`/doctor/${createdSessionId}`}
                      className="sahayak-prep-enter-link"
                    >
                      <span>Enter consultation room</span>
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <p className="sahayak-session-create-card__desc">
                    When you are ready, create the session to generate your patient's private
                    invitation link and connect to the consultation room.
                  </p>

                  {creationStatus === 'error' && errorMessage && (
                    <div className="sahayak-prep-error-banner" role="alert">
                      <AlertCircle size={18} aria-hidden="true" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="sahayak-session-actions">
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isActionBusy}
                      onClick={handleCreateSession}
                      className="sahayak-session-submit-btn"
                    >
                      {creationStatus === 'creating'
                        ? 'Creating session...'
                        : creationStatus === 'joining'
                        ? 'Joining session...'
                        : creationStatus === 'error'
                        ? 'Try creating session again'
                        : 'Create consultation session'}
                    </Button>
                  </div>
                </>
              )}
            </section>

            {/* Accurate Privacy & Local Check Notice */}
            <div className="sahayak-privacy-strip">
              <Shield size={16} aria-hidden="true" />
              <span>
                Audio checks occur locally in your browser. No audio is recorded, stored, or
                uploaded.
              </span>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
};
