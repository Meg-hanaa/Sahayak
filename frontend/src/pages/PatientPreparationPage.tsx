import React, { useState, useEffect, useId } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Shield, ArrowLeft, Headphones, AlertCircle } from 'lucide-react';
import { TaskHeader } from '../components/TaskHeader';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { MicrophoneCheck } from '../components/MicrophoneCheck';
import { SpeakerCheck } from '../components/SpeakerCheck';
import { PreparationChecklist } from '../components/PreparationChecklist';
import { InvitationStatusDisplay } from '../components/InvitationStatusDisplay';
import { useMicrophoneCheck } from '../hooks/useMicrophoneCheck';
import { useSpeakerCheck } from '../hooks/useSpeakerCheck';
import { sessionApi } from '../services/sessionApi';
import { getSessionToken, setSessionToken } from '../utils/tokenStorage';
import './PatientPreparationPage.css';

export const PatientPreparationPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const mic = useMicrophoneCheck();
  const speaker = useSpeakerCheck();
  const joinHeadingId = useId();

  const [token, setToken] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Read token from URL query params, store in sessionStorage, and immediately strip from visible URL
  useEffect(() => {
    if (!sessionId) return;

    let resolvedToken = getSessionToken(sessionId);
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const urlToken = searchParams.get('token');
      if (urlToken) {
        resolvedToken = urlToken;
        // Retain token strictly in sessionStorage for this browser session
        setSessionToken(sessionId, urlToken);
        // Remove token from visible browser URL bar without page reload
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
    setToken(resolvedToken);
  }, [sessionId]);

  // Mutual exclusion: Prevent speaker test from bleeding into mic test or vice versa
  const isMicBusy = mic.status === 'requesting' || mic.status === 'listening';
  const isSpeakerBusy = speaker.status === 'playing' || speaker.status === 'confirming';

  const handleJoinConsultation = async () => {
    if (!sessionId || !token) {
      setErrorMessage('सत्र या सुरक्षा टोकन मौजूद नहीं है। कृपया नया लिंक दर्ज करें।');
      return;
    }

    setIsJoining(true);
    setErrorMessage(null);

    try {
      const micStatus = mic.status === 'sound_detected' ? 'active' : 'unknown';
      // Call verified backend join endpoint
      await sessionApi.joinSession(sessionId, {
        token,
        role: 'patient',
        microphone_status: micStatus,
      });

      // On successful join, navigate to the patient consultation screen
      navigate(`/patient/${sessionId}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'सत्र में शामिल होने में विफल। कृपया पुनः प्रयास करें।';
      setErrorMessage(message);
      setIsJoining(false);
    }
  };

  const isTokenMissing = !token && !isJoining;

  return (
    <div className="sahayak-patient-prep-page sahayak-lang-hi" lang="hi">
      <TaskHeader containerSize="md" badge="मरीज़ तैयारी" />

      <main id="main-content" className="sahayak-patient-prep-main">
        <Container size="md">
          {/* Header */}
          <div className="sahayak-patient-prep-header">
            <h1 className="sahayak-patient-prep-title">परामर्श की तैयारी</h1>
            <p className="sahayak-patient-prep-desc">
              डॉक्टर से जुड़ने से पहले अपने फ़ोन या कंप्यूटर के माइक्रोफ़ोन और स्पीकर की जाँच करें।
            </p>
            {/* Explicit Language Indicators */}
            <div className="sahayak-patient-prep-languages" aria-label="भाषाएँ">
              <span className="sahayak-patient-prep-lang-item">
                आपकी भाषा: <strong>हिन्दी (Hindi)</strong>
              </span>
              <span className="sahayak-patient-prep-lang-sep" aria-hidden="true">
                &bull;
              </span>
              <span className="sahayak-patient-prep-lang-item">
                डॉक्टर की भाषा: <strong>English</strong>
              </span>
            </div>
          </div>

          <div className="sahayak-patient-prep-layout">
            {/* If token or sessionId is missing, show an honest informative banner */}
            {isTokenMissing ? (
              <div className="sahayak-patient-missing-token-card" role="alert">
                <AlertCircle size={20} aria-hidden="true" />
                <div className="sahayak-patient-missing-token-content">
                  <h2 className="sahayak-patient-missing-token-title">
                    सत्र आईडी या सुरक्षा टोकन मौजूद नहीं है
                  </h2>
                  <p className="sahayak-patient-missing-token-desc">
                    यह आमंत्रण लिंक अधूरा है या इसमें सुरक्षा टोकन शामिल नहीं है। कृपया डॉक्टर से नया पूरा लिंक मांगें या लिंक दोबारा दर्ज करें।
                  </p>
                  <Link to="/join" className="sahayak-patient-change-link">
                    <ArrowLeft size={16} aria-hidden="true" />
                    <span>नया लिंक दर्ज करें</span>
                  </Link>
                </div>
              </div>
            ) : (
              /* Invitation Status Card */
              <InvitationStatusDisplay
                state="valid"
                token={sessionId}
                language="hi"
              />
            )}

            {/* Checklist */}
            <PreparationChecklist
              micStatus={mic.status}
              speakerStatus={speaker.status}
              language="hi"
            />

            {/* Audio Check Cards with Mutual Exclusion */}
            <div className="sahayak-patient-prep-cards-grid">
              <MicrophoneCheck
                mic={mic}
                language="hi"
                disabled={isSpeakerBusy}
                disabledReason={
                  isSpeakerBusy
                    ? 'स्पीकर जाँच जारी है। कृपया प्रतीक्षा करें।'
                    : undefined
                }
              />
              <SpeakerCheck
                speaker={speaker}
                language="hi"
                disabled={isMicBusy}
                disabledReason={
                  isMicBusy
                    ? 'माइक्रोफ़ोन सुन रहा है। कृपया प्रतीक्षा करें या रोकें।'
                    : undefined
                }
              />
            </div>

            {/* Quiet Space Tip in Hindi */}
            <div className="sahayak-patient-prep-tip">
              <Headphones
                size={18}
                className="sahayak-patient-prep-tip__icon"
                aria-hidden="true"
              />
              <p className="sahayak-patient-prep-tip__text">
                <strong>सुझाव:</strong> शांत जगह में रहने या इयरफ़ोन का उपयोग करने से बातचीत साफ़ सुनाई देगी।
              </p>
            </div>

            {/* Join Action Card */}
            <section
              className="sahayak-patient-join-card"
              aria-labelledby={joinHeadingId}
            >
              <h2 id={joinHeadingId} className="sahayak-patient-join-card__title">
                परामर्श सत्र
              </h2>
              <p className="sahayak-patient-join-card__desc">
                ऑडियो जाँच पूरी होने के बाद, परामर्श कक्ष में जाने के लिए नीचे दिया गया बटन दबाएँ।
              </p>

              {errorMessage && (
                <div className="sahayak-patient-join-error-banner" role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="sahayak-patient-join-actions">
                <Button
                  type="button"
                  variant="primary"
                  disabled={isJoining || isTokenMissing}
                  onClick={handleJoinConsultation}
                  className="sahayak-patient-join-btn"
                >
                  <span>
                    {isJoining ? 'सत्र में शामिल हो रहे हैं...' : 'सत्र में शामिल हों'}
                  </span>
                </Button>

                <Link to="/join" className="sahayak-patient-change-link">
                  <ArrowLeft size={15} aria-hidden="true" />
                  <span>दूसरा लिंक दर्ज करें</span>
                </Link>
              </div>
            </section>

            {/* Accurate Privacy Strip */}
            <div className="sahayak-patient-privacy-strip">
              <Shield size={16} aria-hidden="true" />
              <span>
                ऑडियो जाँच आपके डिवाइस पर स्थानीय रूप से होती है। कोई भी आवाज़ रिकॉर्ड या अपलोड नहीं की जाती।
              </span>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
};
