import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container } from '../components/Container';
import { ConsultationHeader } from '../components/ConsultationHeader';
import { LiveTurnDisplay } from '../components/LiveTurnDisplay';
import { ConversationTranscript } from '../components/ConversationTranscript';
import { ConsultationControls } from '../components/ConsultationControls';
import { useConsultationSession } from '../hooks/useConsultationSession';
import { getSessionToken } from '../utils/tokenStorage';
import './PatientConsultationPage.css';

export const PatientConsultationPage: React.FC = () => {
  const { sessionId = 'demo-session' } = useParams<{ sessionId: string }>();

  // Retrieve token from sessionStorage or query param
  const token =
    (typeof window !== 'undefined' ? getSessionToken(sessionId) : null) ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') || undefined
      : undefined);

  const session = useConsultationSession(sessionId, 'patient', token);

  const handleToggleMute = () => {
    session.setMuted(!session.isMuted);
  };

  const isEnded = session.status === 'ended';
  const isError = session.status === 'error';

  return (
    <div className="sahayak-patient-room sahayak-lang-hi" lang="hi">
      <ConsultationHeader
        sessionId={sessionId}
        role="patient"
        sessionStatus={session.status}
        participantConnectionStatus={session.doctor.connectionStatus}
        isFixture={session.isFixture}
        fixtureNotice={session.fixtureNotice}
        onEndClick={!isEnded && !isError ? session.leaveConsultation : undefined}
      />

      <main id="main-content" className="sahayak-patient-room__main">
        <Container size="md">
          {/* Error State View (No silent fallback to fixtures) */}
          {isError ? (
            <div className="sahayak-patient-room__ended-card" role="alert">
              <h2 className="sahayak-patient-room__ended-title">
                परामर्श से जुड़ने में असमर्थ
              </h2>
              <p className="sahayak-patient-room__ended-desc">
                {session.errorMessage ||
                  'सत्र पहचान या सुरक्षा टोकन मौजूद नहीं है। कृपया आमंत्रण लिंक से पुनः जुड़ें।'}
              </p>
              <div className="sahayak-patient-room__ended-actions">
                <Link to="/join" className="sahayak-patient-room__link-btn">
                  तैयारी पृष्ठ पर लौटें
                </Link>
                <Link
                  to="/"
                  className="sahayak-patient-room__link-btn sahayak-patient-room__link-btn--secondary"
                >
                  मुख्य पृष्ठ पर लौटें
                </Link>
              </div>
            </div>
          ) : isEnded ? (
            /* Ended Session View */
            <div className="sahayak-patient-room__ended-card" role="status">
              <h2 className="sahayak-patient-room__ended-title">
                परामर्श समाप्त हो गया है
              </h2>
              <p className="sahayak-patient-room__ended-desc">
                यह परामर्श सत्र समाप्त हो गया है या आप परामर्श छोड़ चुके हैं।
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
                    डॉक्टर की प्रतीक्षा की जा रही है। डॉक्टर के जुड़ते ही सत्र अपडेट हो जाएगा।
                  </span>
                </div>
              )}

              {/* Doctor Disconnected Banner */}
              {session.doctor.connectionStatus === 'disconnected' && (
                <div className="sahayak-patient-room__waiting-banner sahayak-patient-room__waiting-banner--disconnected" role="status">
                  <span className="sahayak-patient-room__waiting-text">
                    डॉक्टर डिस्कनेक्ट हो गए हैं। पुनः कनेक्ट करने का प्रयास किया जा रहा है...
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
      {!isEnded && !isError && (
        <ConsultationControls
          viewerRole="patient"
          isMuted={session.isMuted}
          onToggleMute={handleToggleMute}
          onEndConsultation={session.leaveConsultation}
          liveAudioAvailable={session.liveAudioAvailable}
        />
      )}
    </div>
  );
};
