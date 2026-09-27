import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container } from '../components/Container';
import { ConsultationHeader } from '../components/ConsultationHeader';
import { LiveTurnDisplay } from '../components/LiveTurnDisplay';
import { ConversationTranscript } from '../components/ConversationTranscript';
import { ConsultationControls } from '../components/ConsultationControls';
import { useConsultationSession } from '../hooks/useConsultationSession';
import './PatientConsultationPage.css';

export const PatientConsultationPage: React.FC = () => {
  const { sessionId = 'demo-session' } = useParams<{ sessionId: string }>();
  const token =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') || undefined
      : undefined;

  const session = useConsultationSession(sessionId, 'patient', token);

  const handleToggleMute = () => {
    session.setMuted(!session.isMuted);
  };

  const isEnded = session.status === 'ended';

  return (
    <div className="sahayak-patient-room sahayak-lang-hi" lang="hi">
      <ConsultationHeader
        sessionId={sessionId}
        role="patient"
        sessionStatus={session.status}
        participantConnectionStatus={session.doctor.connectionStatus}
        isFixture={session.isFixture}
        fixtureNotice={session.fixtureNotice}
        onEndClick={!isEnded ? session.endConsultation : undefined}
      />

      <main id="main-content" className="sahayak-patient-room__main">
        <Container size="md">
          {/* Ended Session View */}
          {isEnded ? (
            <div className="sahayak-patient-room__ended-card" role="status">
              <h2 className="sahayak-patient-room__ended-title">परामर्श समाप्त हो गया है</h2>
              <p className="sahayak-patient-room__ended-desc">
                यह परामर्श सत्र समाप्त हो गया है। आपका ऑडियो कनेक्शन बंद कर दिया गया है।
              </p>
              <div className="sahayak-patient-room__ended-actions">
                <Link to="/" className="sahayak-patient-room__link-btn">
                  मुख्य पृष्ठ पर लौटें
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Doctor Waiting Banner */}
              {session.doctor.connectionStatus === 'waiting' && (
                <div className="sahayak-patient-room__waiting-banner" role="status">
                  <span className="sahayak-patient-room__waiting-text">
                    डॉक्टर की प्रतीक्षा की जा रही है। डॉक्टर के जुड़ते ही अनुवाद शुरू हो जाएगा।
                  </span>
                </div>
              )}

              {/* Live Speech & Interpretation Status in Hindi */}
              <LiveTurnDisplay
                activityState={session.activityState}
                currentTurn={session.currentTurn}
                viewerRole="patient"
                isMuted={session.isMuted}
                errorMessage={session.errorMessage}
              />

              {/* Bilingual Transcript */}
              <ConversationTranscript
                turns={session.turns}
                viewerRole="patient"
              />
            </>
          )}
        </Container>
      </main>

      {/* Simplified Mobile-Friendly Bottom Controls */}
      {!isEnded && (
        <ConsultationControls
          viewerRole="patient"
          isMuted={session.isMuted}
          onToggleMute={handleToggleMute}
          onEndConsultation={session.endConsultation}
        />
      )}
    </div>
  );
};
