import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Container } from '../components/Container';
import './PlaceholderPage.css';

interface PlaceholderPageProps {
  title: string;
  description: string;
  paramKey?: string;
  paramLabel?: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  description,
  paramKey,
  paramLabel,
}) => {
  const params = useParams();
  const paramValue = paramKey ? params[paramKey] : undefined;

  return (
    <main className="sahayak-placeholder">
      <Container>
        <div className="sahayak-placeholder__card">
          <div className="sahayak-placeholder__header">
            <img
              src="/images/logo.png"
              alt="Sahayak emblem"
              className="sahayak-placeholder__logo"
              width="32"
              height="32"
            />
            <h1 className="sahayak-placeholder__title">{title}</h1>
          </div>
          {paramValue && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <span className="sahayak-placeholder__param">
                {paramLabel || paramKey}: <code>{paramValue}</code>
              </span>
            </div>
          )}
          <p className="sahayak-placeholder__description">{description}</p>
          <div className="sahayak-placeholder__footer">
            <Link to="/">Return to Foundation Preview</Link>
          </div>
        </div>
      </Container>
    </main>
  );
};

export const DoctorSetupPage: React.FC = () => (
  <PlaceholderPage
    title="Doctor Setup"
    description="Session creation and initial consultation configuration interface. This route will configure language settings and generate the patient join invitation."
  />
);

export const PatientJoinPage: React.FC = () => (
  <PlaceholderPage
    title="Patient Join"
    description="Patient entry portal. Patients will enter a consultation code or follow an invitation link to participate."
  />
);

export const PatientAudioCheckPage: React.FC = () => (
  <PlaceholderPage
    title="Patient Audio Check"
    description="Microphone readiness and speaker audio test for the patient. Audio permissions and Hindi-first instructions will be verified here before entering the consultation."
    paramKey="token"
    paramLabel="Join Token"
  />
);

export const DoctorConsultationPage: React.FC = () => (
  <PlaceholderPage
    title="Doctor Consultation"
    description="Active clinical consultation screen for the English-speaking doctor. Displays live turn transcriptions, critical fact confirmation prompts, and interpretation controls."
    paramKey="sessionId"
    paramLabel="Session ID"
  />
);

export const PatientConsultationPage: React.FC = () => (
  <PlaceholderPage
    title="Patient Consultation"
    description="Active consultation screen for the Hindi-speaking patient. Displays clear Hindi captions, voice-agent turn indicators, and simplified confirmation controls."
    paramKey="sessionId"
    paramLabel="Session ID"
  />
);

export const ConsultationRecordPage: React.FC = () => (
  <PlaceholderPage
    title="Consultation Record"
    description="Post-consultation bilingual clinical record. Separates verified facts, conversation history, and unresolved statements for doctor review."
    paramKey="sessionId"
    paramLabel="Session ID"
  />
);

export const NotFoundPage: React.FC = () => (
  <PlaceholderPage
    title="Page Not Found"
    description="The requested route does not exist in the Sahayak application."
  />
);
