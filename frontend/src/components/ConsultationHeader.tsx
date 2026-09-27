import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from './Container';
import {
  ConnectionStatus,
  ParticipantRole,
  SessionStatus,
} from '../types/consultation.ts';
import {
  CLINICAL_DISCLAIMER_EN,
  CLINICAL_DISCLAIMER_HI,
} from '../services/consultationFixtures.ts';
import './ConsultationHeader.css';

export interface ConsultationHeaderProps {
  sessionId: string;
  role: ParticipantRole;
  sessionStatus: SessionStatus;
  participantConnectionStatus: ConnectionStatus;
  isFixture: boolean;
  fixtureNotice?: string;
  onEndClick?: () => void | Promise<void>;
  errorMessage?: string | null;
}

export const ConsultationHeader: React.FC<ConsultationHeaderProps> = ({
  sessionId,
  role,
  sessionStatus,
  participantConnectionStatus,
  isFixture,
  fixtureNotice,
  onEndClick,
}) => {
  const isDoctor = role === 'doctor';

  // Localized status labels
  const getSessionStatusLabel = (): string => {
    if (sessionStatus === 'ended') {
      return isDoctor ? 'Ended' : 'समाप्त';
    }
    if (sessionStatus === 'paused') {
      return isDoctor ? 'Paused' : 'रुका हुआ';
    }
    if (participantConnectionStatus === 'connecting') {
      return isDoctor ? 'Connecting...' : 'कनेक्ट किया जा रहा है...';
    }
    if (participantConnectionStatus === 'waiting') {
      return isDoctor ? 'Waiting' : 'प्रतीक्षा में';
    }
    if (participantConnectionStatus === 'disconnected') {
      return isDoctor ? 'Disconnected' : 'डिस्कनेक्ट';
    }
    return isDoctor ? 'Active' : 'सक्रिय';
  };

  const getOtherParticipantLabel = (): string => {
    if (isDoctor) {
      if (participantConnectionStatus === 'connected') return 'Patient connected';
      if (participantConnectionStatus === 'connecting') return 'Patient connecting...';
      if (participantConnectionStatus === 'disconnected') return 'Patient disconnected';
      return 'Patient waiting to join';
    } else {
      if (participantConnectionStatus === 'connected') return 'डॉक्टर जुड़े हुए हैं';
      if (participantConnectionStatus === 'connecting') return 'डॉक्टर कनेक्ट हो रहे हैं...';
      if (participantConnectionStatus === 'disconnected') return 'डॉक्टर डिस्कनेक्ट हो गए हैं';
      return 'डॉक्टर की प्रतीक्षा है';
    }
  };

  return (
    <header className="sahayak-consult-header" role="banner">
      <Container size="lg" className="sahayak-consult-header__container">
        <div className="sahayak-consult-header__top">
          {/* Brand */}
          <Link
            to="/"
            className="sahayak-consult-header__brand"
            aria-label={isDoctor ? 'Return to Sahayak Home' : 'मुख्य पृष्ठ पर लौटें'}
          >
            <img
              src="/images/logo.png"
              alt=""
              aria-hidden="true"
              className="sahayak-consult-header__logo"
              width="28"
              height="28"
            />
            <span className="sahayak-consult-header__wordmark">Sahayak</span>
          </Link>

          {/* Role badge */}
          <span className="sahayak-consult-header__role-badge">
            {isDoctor ? 'Doctor Consultation' : 'मरीज़ परामर्श'}
          </span>

          {/* Session ID & Connection Status */}
          <div className="sahayak-consult-header__status-group">
            <span className="sahayak-consult-header__session-code">
              {isDoctor ? 'Session' : 'सत्र'}: <code>{sessionId}</code>
            </span>

            <span
              className={`sahayak-consult-header__status-pill sahayak-consult-header__status-pill--${sessionStatus}`}
              aria-label={`${isDoctor ? 'Consultation status' : 'परामर्श स्थिति'}: ${getSessionStatusLabel()}`}
            >
              {getSessionStatusLabel()}
            </span>

            <span className="sahayak-consult-header__peer-status">
              {getOtherParticipantLabel()}
            </span>

            {onEndClick && sessionStatus !== 'ended' && (
              <button
                type="button"
                className="sahayak-consult-header__end-btn"
                onClick={onEndClick}
                aria-label={isDoctor ? 'End consultation' : 'परामर्श छोड़ें'}
              >
                {isDoctor ? 'End consultation' : 'परामर्श छोड़ें'}
              </button>
            )}
          </div>
        </div>

        {/* Fixture Notice - Clearly distinct, never pretending to be real */}
        {isFixture && fixtureNotice && (
          <div
            className="sahayak-consult-header__fixture-banner"
            role="status"
            aria-label={isDoctor ? 'Fixture mode announcement' : 'पूर्वावलोकन घोषणा'}
          >
            <span className="sahayak-consult-header__fixture-text">{fixtureNotice}</span>
          </div>
        )}

        {/* Clinical Disclaimer */}
        <div className="sahayak-consult-header__disclaimer" role="note">
          {isDoctor ? CLINICAL_DISCLAIMER_EN : CLINICAL_DISCLAIMER_HI}
        </div>
      </Container>
    </header>
  );
};
