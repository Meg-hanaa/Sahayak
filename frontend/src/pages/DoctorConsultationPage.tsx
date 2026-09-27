import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container } from '../components/Container';
import { ConsultationHeader } from '../components/ConsultationHeader';
import { LiveTurnDisplay } from '../components/LiveTurnDisplay';
import { ConversationTranscript } from '../components/ConversationTranscript';
import { ConsultationControls } from '../components/ConsultationControls';
import { useConsultationSession } from '../hooks/useConsultationSession';
import './DoctorConsultationPage.css';

export const DoctorConsultationPage: React.FC = () => {
  const { sessionId = 'demo-session' } = useParams<{ sessionId: string }>();
  const token =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') || undefined
      : undefined;

  const session = useConsultationSession(sessionId, 'doctor', token);

  const handleToggleMute = () => {
    session.setMuted(!session.isMuted);
  };

  const isEnded = session.status === 'ended';

  return (
    <div className="sahayak-doctor-room" lang="en">
      <ConsultationHeader
        sessionId={sessionId}
        role="doctor"
        sessionStatus={session.status}
        participantConnectionStatus={session.patient.connectionStatus}
        isFixture={session.isFixture}
        fixtureNotice={session.fixtureNotice}
        onEndClick={!isEnded ? session.endConsultation : undefined}
      />

      <main id="main-content" className="sahayak-doctor-room__main">
        <Container size="lg">
          {/* Ended Session View */}
          {isEnded ? (
            <div className="sahayak-doctor-room__ended-card" role="status">
              <h2 className="sahayak-doctor-room__ended-title">Consultation Ended</h2>
              <p className="sahayak-doctor-room__ended-desc">
                This consultation session has concluded. Audio interpretation streams have been closed and microphone hardware released.
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
              {/* Patient Waiting Warning if not connected */}
              {session.patient.connectionStatus === 'waiting' && (
                <div className="sahayak-doctor-room__waiting-banner" role="status">
                  <span className="sahayak-doctor-room__waiting-text">
                    Patient has not joined the consultation yet. Audio interpretation will begin when the patient connects.
                  </span>
                </div>
              )}

              {/* Live Speech & Interpretation Status */}
              <LiveTurnDisplay
                activityState={session.activityState}
                currentTurn={session.currentTurn}
                viewerRole="doctor"
                isMuted={session.isMuted}
                errorMessage={session.errorMessage}
              />

              {/* Full Bilingual Transcript */}
              <ConversationTranscript
                turns={session.turns}
                viewerRole="doctor"
              />
            </>
          )}
        </Container>
      </main>

      {/* Floating/Sticky Bottom Controls */}
      {!isEnded && (
        <ConsultationControls
          viewerRole="doctor"
          isMuted={session.isMuted}
          onToggleMute={handleToggleMute}
          onEndConsultation={session.endConsultation}
        />
      )}
    </div>
  );
};
