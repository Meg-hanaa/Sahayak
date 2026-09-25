import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TaskHeader } from '../components/TaskHeader';
import { Container } from '../components/Container';
import { InvitationResultCard } from '../components/InvitationResultCard';
import { InvitationStatusDisplay, InvitationState } from '../components/InvitationStatusDisplay';
import { MicrophoneCheck } from '../components/MicrophoneCheck';
import { SpeakerCheck } from '../components/SpeakerCheck';
import { PreparationChecklist } from '../components/PreparationChecklist';
import { MicrophoneStatus, UseMicrophoneCheckReturn } from '../hooks/useMicrophoneCheck';
import { SpeakerStatus, UseSpeakerCheckReturn } from '../hooks/useSpeakerCheck';
import './SetupDevPreviewPage.css';

export const SetupDevPreviewPage: React.FC = () => {
  const [patientState, setPatientState] = useState<InvitationState>('unverified');
  const [lang, setLang] = useState<'en' | 'hi'>('hi');

  // Simulated mic states
  const [simulatedMicStatus, setSimulatedMicStatus] = useState<MicrophoneStatus>('sound_detected');
  const [simulatedMicLevel, setSimulatedMicLevel] = useState<number>(45);

  // Simulated speaker states
  const [simulatedSpeakerStatus, setSimulatedSpeakerStatus] = useState<SpeakerStatus>('passed');

  const mockMic: UseMicrophoneCheckReturn = {
    status: simulatedMicStatus,
    audioLevel: simulatedMicLevel,
    lastReading: simulatedMicStatus === 'sound_detected' ? 68 : null,
    errorCode: simulatedMicStatus === 'error' ? 'in_use' : simulatedMicStatus === 'denied' ? 'permission_denied' : null,
    errorMessage: simulatedMicStatus === 'error' ? 'Microphone device could not be started.' : null,
    startCheck: async () => {},
    stopCheck: () => {},
    resetCheck: () => {},
  };

  const mockSpeaker: UseSpeakerCheckReturn = {
    status: simulatedSpeakerStatus,
    errorCode: simulatedSpeakerStatus === 'error' ? 'playback_failed' : null,
    errorMessage: simulatedSpeakerStatus === 'error' ? 'AudioContext output failed to initialize.' : null,
    playTestSound: async () => {},
    stopCheck: () => {},
    confirmHeard: () => {},
    resetCheck: () => {},
  };

  const allPatientStates: InvitationState[] = [
    'unverified',
    'verifying',
    'valid',
    'invalid',
    'expired',
    'session_full',
    'session_ended',
    'network_error',
  ];

  const allMicStates: MicrophoneStatus[] = [
    'idle',
    'requesting',
    'listening',
    'sound_detected',
    'no_sound_detected',
    'denied',
    'no_device',
    'error',
    'unsupported',
  ];

  const allSpeakerStates: SpeakerStatus[] = [
    'idle',
    'playing',
    'confirming',
    'passed',
    'failed',
    'error',
  ];

  return (
    <div className="sahayak-dev-page">
      <TaskHeader containerSize="lg" badge="Development Fixtures" />

      <main id="main-content" className="sahayak-dev-main">
        <Container size="lg">
          {/* Header */}
          <div className="sahayak-dev-header">
            <h1 className="sahayak-dev-title">Setup preview</h1>
            <p className="sahayak-dev-subtitle">
              Example states for development. No live session is created.
            </p>
            <div className="sahayak-dev-nav-links">
              <Link to="/consultation/new" className="sahayak-dev-link-btn">
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Go to Doctor Preparation (/consultation/new)</span>
              </Link>
              <Link to="/join" className="sahayak-dev-link-btn">
                <span>Go to Patient Entry (/join)</span>
              </Link>
              <Link to="/join/demo-token-123" className="sahayak-dev-link-btn">
                <span>Go to Patient Preparation (/join/demo-token-123)</span>
              </Link>
            </div>
          </div>

          <div className="sahayak-dev-grid">
            {/* Section 1: Doctor Invitation Result Card */}
            <section className="sahayak-dev-section" aria-labelledby="fixture-doctor-card">
              <div className="sahayak-dev-section__header">
                <h2 id="fixture-doctor-card" className="sahayak-dev-section__title">
                  1. Doctor Invitation Result Layout
                </h2>
                <p className="sahayak-dev-section__desc">
                  Uses reserved <code>example.invalid</code> domain to ensure safe preview.
                </p>
              </div>

              <InvitationResultCard
                invitationUrl="https://sahayak.health.example.invalid/join/med-9482-rx"
                sessionCode="MED-9482-RX"
                isFixture={true}
              />
            </section>

            {/* Section 2: Patient Invitation States */}
            <section className="sahayak-dev-section" aria-labelledby="fixture-patient-states">
              <div className="sahayak-dev-section__header">
                <h2 id="fixture-patient-states" className="sahayak-dev-section__title">
                  2. Patient Invitation Backend States
                </h2>
                <p className="sahayak-dev-section__desc">
                  Select a state to inspect the patient-facing status display.
                </p>
              </div>

              <div className="sahayak-dev-controls">
                <div className="sahayak-dev-control-group">
                  <span className="sahayak-dev-control-label">State:</span>
                  <div className="sahayak-dev-pill-group">
                    {allPatientStates.map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`sahayak-dev-pill ${patientState === st ? 'sahayak-dev-pill--active' : ''}`}
                        onClick={() => setPatientState(st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sahayak-dev-control-group">
                  <span className="sahayak-dev-control-label">Language:</span>
                  <div className="sahayak-dev-pill-group">
                    <button
                      type="button"
                      className={`sahayak-dev-pill ${lang === 'hi' ? 'sahayak-dev-pill--active' : ''}`}
                      onClick={() => setLang('hi')}
                    >
                      हिन्दी (Hindi)
                    </button>
                    <button
                      type="button"
                      className={`sahayak-dev-pill ${lang === 'en' ? 'sahayak-dev-pill--active' : ''}`}
                      onClick={() => setLang('en')}
                    >
                      English
                    </button>
                  </div>
                </div>
              </div>

              <div className="sahayak-dev-preview-box">
                <InvitationStatusDisplay
                  state={patientState}
                  token="med-9482-rx"
                  language={lang}
                  onRetry={() => alert('Retry triggered')}
                  onBackToHome={() => alert('Back to home triggered')}
                />
              </div>
            </section>

            {/* Section 3: Audio Checklist & Simulated Hardware States */}
            <section className="sahayak-dev-section" aria-labelledby="fixture-audio-states">
              <div className="sahayak-dev-section__header">
                <h2 id="fixture-audio-states" className="sahayak-dev-section__title">
                  3. Simulated Audio Check States &amp; Checklist
                </h2>
                <p className="sahayak-dev-section__desc">
                  Inspect checklist and card responses across all browser permission and audio edge cases.
                </p>
              </div>

              <div className="sahayak-dev-controls">
                <div className="sahayak-dev-control-group">
                  <span className="sahayak-dev-control-label">Simulated Mic:</span>
                  <div className="sahayak-dev-pill-group">
                    {allMicStates.map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`sahayak-dev-pill ${simulatedMicStatus === st ? 'sahayak-dev-pill--active' : ''}`}
                        onClick={() => {
                          setSimulatedMicStatus(st);
                          if (st === 'listening') setSimulatedMicLevel(42);
                          else if (st === 'sound_detected') setSimulatedMicLevel(68);
                          else setSimulatedMicLevel(0);
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sahayak-dev-control-group">
                  <span className="sahayak-dev-control-label">Simulated Speaker:</span>
                  <div className="sahayak-dev-pill-group">
                    {allSpeakerStates.map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`sahayak-dev-pill ${simulatedSpeakerStatus === st ? 'sahayak-dev-pill--active' : ''}`}
                        onClick={() => setSimulatedSpeakerStatus(st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sahayak-dev-audio-preview">
                <PreparationChecklist
                  micStatus={simulatedMicStatus}
                  speakerStatus={simulatedSpeakerStatus}
                  language={lang}
                />
                <div className="sahayak-dev-audio-cards">
                  <MicrophoneCheck mic={mockMic} language={lang} />
                  <SpeakerCheck speaker={mockSpeaker} language={lang} />
                </div>
              </div>
            </section>
          </div>
        </Container>
      </main>
    </div>
  );
};
