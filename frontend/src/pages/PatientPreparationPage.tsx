import React, { useId } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Shield, ArrowLeft, Headphones } from 'lucide-react';
import { TaskHeader } from '../components/TaskHeader';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { MicrophoneCheck } from '../components/MicrophoneCheck';
import { SpeakerCheck } from '../components/SpeakerCheck';
import { PreparationChecklist } from '../components/PreparationChecklist';
import { InvitationStatusDisplay } from '../components/InvitationStatusDisplay';
import { useMicrophoneCheck } from '../hooks/useMicrophoneCheck';
import { useSpeakerCheck } from '../hooks/useSpeakerCheck';
import './PatientPreparationPage.css';

export const PatientPreparationPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const mic = useMicrophoneCheck();
  const speaker = useSpeakerCheck();
  const joinHeadingId = useId();

  // Mutual exclusion: Prevent speaker test from bleeding into mic test or vice versa
  const isMicBusy = mic.status === 'requesting' || mic.status === 'listening';
  const isSpeakerBusy = speaker.status === 'playing' || speaker.status === 'confirming';

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
              <span className="sahayak-patient-prep-lang-item">आपकी भाषा: <strong>हिन्दी (Hindi)</strong></span>
              <span className="sahayak-patient-prep-lang-sep" aria-hidden="true">&bull;</span>
              <span className="sahayak-patient-prep-lang-item">डॉक्टर की भाषा: <strong>English</strong></span>
            </div>
          </div>

          <div className="sahayak-patient-prep-layout">
            {/* Invitation Status Card - Explicitly UNVERIFIED until backend integration */}
            <InvitationStatusDisplay
              state="unverified"
              token={token}
              language="hi"
            />

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
                disabledReason={isSpeakerBusy ? 'स्पीकर जाँच जारी है। कृपया प्रतीक्षा करें।' : undefined}
              />
              <SpeakerCheck
                speaker={speaker}
                language="hi"
                disabled={isMicBusy}
                disabledReason={isMicBusy ? 'माइक्रोफ़ोन सुन रहा है। कृपया प्रतीक्षा करें या रोकें।' : undefined}
              />
            </div>

            {/* Quiet Space Tip in Hindi */}
            <div className="sahayak-patient-prep-tip">
              <Headphones size={18} className="sahayak-patient-prep-tip__icon" aria-hidden="true" />
              <p className="sahayak-patient-prep-tip__text">
                <strong>सुझाव:</strong> शांत जगह में रहने या इयरफ़ोन का उपयोग करने से बातचीत साफ़ सुनाई देगी।
              </p>
            </div>

            {/* Join Action Card - Disabled with accurate copy, no false immediate-talk claims */}
            <section className="sahayak-patient-join-card" aria-labelledby={joinHeadingId}>
              <h2 id={joinHeadingId} className="sahayak-patient-join-card__title">
                परामर्श सत्र
              </h2>
              <p className="sahayak-patient-join-card__desc">
                अभी परामर्श में शामिल होना उपलब्ध नहीं है। आप अपना ऑडियो जाँच सकते हैं।
              </p>

              <div className="sahayak-patient-join-actions">
                <Button
                  type="button"
                  variant="primary"
                  disabled
                  className="sahayak-patient-join-btn"
                  aria-disabled="true"
                >
                  <span>सत्र में शामिल हों</span>
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
