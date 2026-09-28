import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container } from '../components/Container';
import { ConsultationHeader } from '../components/ConsultationHeader';
import { LiveTurnDisplay } from '../components/LiveTurnDisplay';
import { ConversationTranscript } from '../components/ConversationTranscript';
import { ConsultationControls } from '../components/ConsultationControls';
import { ConsultationSpeechInput } from '../components/ConsultationSpeechInput';
import { useConsultationSession } from '../hooks/useConsultationSession';
import { getSessionToken } from '../utils/tokenStorage';
import './DoctorConsultationPage.css';

export const DoctorConsultationPage: React.FC = () => {
  const { sessionId = 'demo-session' } = useParams<{ sessionId: string }>();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Retrieve token from sessionStorage or query param
  const token =
    (typeof window !== 'undefined' ? getSessionToken(sessionId) : null) ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') || undefined
      : undefined);

  const session = useConsultationSession(sessionId, 'doctor', token);

  const handleToggleMute = () => {
    session.setMuted(!session.isMuted);
  };

  const isEnded = session.status === 'ended';
  const isError = session.status === 'error';

  return (
    <div className="sahayak-doctor-room" lang="en">
      <ConsultationHeader
        sessionId={sessionId}
        role="doctor"
        sessionStatus={session.status}
        participantConnectionStatus={session.patient.connectionStatus}
        isFixture={session.isFixture}
        fixtureNotice={session.fixtureNotice}
        onEndClick={!isEnded && !isError ? () => setIsConfirmModalOpen(true) : undefined}
      />

      <main id="main-content" className="sahayak-doctor-room__main">
        <Container size="lg">
          {/* Error State View (No silent fallback to fixtures) */}
          {isError ? (
            <div className="sahayak-doctor-room__ended-card" role="alert">
              <h2 className="sahayak-doctor-room__ended-title">
                Unable to Access Consultation
              </h2>
              <p className="sahayak-doctor-room__ended-desc">
                {session.errorMessage ||
                  'The consultation session could not be found or your access token is missing.'}
              </p>
              <div className="sahayak-doctor-room__ended-actions">
                <Link to="/consultation/new" className="sahayak-doctor-room__link-btn">
                  Return to Preparation
                </Link>
                <Link
                  to="/"
                  className="sahayak-doctor-room__link-btn sahayak-doctor-room__link-btn--secondary"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          ) : isEnded ? (
            /* Ended Session View */
            <div className="sahayak-doctor-room__ended-card" role="status">
              <h2 className="sahayak-doctor-room__ended-title">Consultation Ended</h2>
              <p className="sahayak-doctor-room__ended-desc">
                This consultation session has concluded. Connection streams have been closed.
              </p>
              <div className="sahayak-doctor-room__ended-actions">
                <Link to="/" className="sahayak-doctor-room__link-btn">
                  Return to Home
                </Link>
                <Link
                  to={`/record/${sessionId}`}
                  className="sahayak-doctor-room__link-btn sahayak-doctor-room__link-btn--secondary"
                >
                  View Consultation Record
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Emergency Alert Banner */}
              {session.emergencyAlert && (
                <div className="sahayak-doctor-room__alert-banner" role="alert">
                  <strong className="sahayak-doctor-room__alert-tag">EMERGENCY ALERT:</strong>
                  <span className="sahayak-doctor-room__alert-text">
                    {session.emergencyAlert.text}
                  </span>
                </div>
              )}

              {/* Patient Waiting Banner if not joined */}
              {session.patient.connectionStatus === 'waiting' && (
                <div className="sahayak-doctor-room__waiting-banner" role="status">
                  <span className="sahayak-doctor-room__waiting-text">
                    Patient has not joined the consultation yet. The session will update when the patient connects.
                  </span>
                </div>
              )}

              {/* Patient Disconnected Banner */}
              {session.patient.connectionStatus === 'disconnected' && (
                <div className="sahayak-doctor-room__waiting-banner sahayak-doctor-room__waiting-banner--disconnected" role="status">
                  <span className="sahayak-doctor-room__waiting-text">
                    Patient is currently disconnected. Reconnecting...
                  </span>
                </div>
              )}

              {/* Live Speech & Interpretation Status */}
              <LiveTurnDisplay
                activityState={session.activityState}
                currentTurn={session.currentTurn}
                viewerRole="doctor"
                isMuted={session.isMuted}
                repetitionRequest={session.repetitionRequest}
              />

              {/* Consultation Speech Input & Quick Demo Phrases */}
              <ConsultationSpeechInput
                role="doctor"
                onSendSpeech={session.sendSpeech}
                connectionStatus={session.connectionStatus}
                sessionStatus={session.status}
                activityState={session.activityState}
                disabled={isEnded || isError}
                isMuted={session.isMuted}
              />

              {/* Verified Clinical Facts */}
              {session.verifiedFacts.length > 0 && (
                <section className="sahayak-doctor-room__facts-card" aria-label="Verified clinical facts">
                  <h3 className="sahayak-doctor-room__facts-title">Verified Clinical Facts</h3>
                  <ul className="sahayak-doctor-room__facts-list">
                    {session.verifiedFacts.map((fact) => (
                      <li key={fact.id} className="sahayak-doctor-room__fact-item">
                        <span className="sahayak-doctor-room__fact-category">{fact.category}</span>
                        <div className="sahayak-doctor-room__fact-wording">
                          <span className="sahayak-doctor-room__fact-source">
                            <strong>Source:</strong> {fact.sourceWording}
                          </span>
                          <span className="sahayak-doctor-room__fact-translated">
                            <strong>Translated:</strong> {fact.translatedWording}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Full Bilingual Transcript */}
              <ConversationTranscript
                turns={session.turns}
                viewerRole="doctor"
                onConfirmAction={(turnId, confirmed) => {
                  session.sendConfirmationResponse(turnId, confirmed ? 'yes' : 'no');
                }}
              />
            </>
          )}
        </Container>
      </main>

      {/* Floating/Sticky Bottom Controls */}
      {!isEnded && !isError && (
        <ConsultationControls
          viewerRole="doctor"
          isMuted={session.isMuted}
          onToggleMute={handleToggleMute}
          onEndConsultation={session.endConsultation}
          liveAudioAvailable={session.liveAudioAvailable}
          errorMessage={session.errorMessage}
          isOpenConfirmModal={isConfirmModalOpen}
          onOpenConfirmModal={() => setIsConfirmModalOpen(true)}
          onCloseConfirmModal={() => setIsConfirmModalOpen(false)}
        />
      )}
    </div>
  );
};
