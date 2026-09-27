import React from 'react';
import {
  ConversationTurn,
  ParticipantRole,
  SystemActivityState,
} from '../types/consultation.ts';
import './LiveTurnDisplay.css';

export interface LiveTurnDisplayProps {
  activityState: SystemActivityState;
  currentTurn?: ConversationTurn | null;
  viewerRole: ParticipantRole;
  isMuted: boolean;
  errorMessage?: string | null;
}

export const LiveTurnDisplay: React.FC<LiveTurnDisplayProps> = ({
  activityState,
  currentTurn,
  viewerRole,
  isMuted,
}) => {
  const isDoctor = viewerRole === 'doctor';

  // System activity message
  const getActivityMessage = (): string => {
    if (isMuted) {
      return isDoctor
        ? 'Microphone is muted. Unmute to speak.'
        : 'माइक्रोफ़ोन बंद है। बोलने के लिए माइक चालू करें।';
    }
    switch (activityState) {
      case 'listening':
        if (currentTurn?.speakerRole === 'doctor') {
          return isDoctor ? 'Listening to you (Doctor)...' : 'डॉक्टर बोल रहे हैं...';
        } else if (currentTurn?.speakerRole === 'patient') {
          return isDoctor ? 'Patient is speaking...' : 'आप बोल रहे हैं...';
        }
        return isDoctor ? 'Listening for speech...' : 'आवाज़ सुनी जा रही है...';
      case 'processing':
        return isDoctor
          ? 'Transcribing and translating speech...'
          : 'भाषण का अनुवाद किया जा रहा है...';
      case 'playing':
        return isDoctor
          ? 'Playing Hindi audio interpretation to patient...'
          : 'डॉक्टर का अनुवाद सुनाया जा रहा है...';
      case 'reconnecting':
        return isDoctor
          ? 'Network interrupted. Reconnecting to consultation...'
          : 'नेटवर्क रुकावट। पुनः कनेक्ट किया जा रहा है...';
      case 'error':
        return isDoctor
          ? 'Interpretation error. Please repeat your statement.'
          : 'अनुवाद में त्रुटि। कृपया अपनी बात दोहराएँ।';
      case 'idle':
      default:
        return isDoctor
          ? 'Ready. Speak clearly in English, or listen to Hindi patient speech.'
          : 'तैयार। आप हिन्दी में बोल सकते हैं, या डॉक्टर की बात सुन सकते हैं।';
    }
  };

  const hasActiveContent = Boolean(currentTurn && (currentTurn.originalText || currentTurn.translatedText));

  return (
    <section
      className={`sahayak-live-turn sahayak-live-turn--${activityState}`}
      aria-label={isDoctor ? 'Live speech and interpretation' : 'लाइव भाषण और अनुवाद'}
    >
      {/* Activity status bar */}
      <div
        className="sahayak-live-turn__status-bar"
        role="status"
        aria-live="polite"
      >
        <span className="sahayak-live-turn__status-indicator" aria-hidden="true" />
        <span className="sahayak-live-turn__status-text">{getActivityMessage()}</span>
      </div>

      {/* Active Speech Box */}
      {hasActiveContent && currentTurn && (
        <div className="sahayak-live-turn__content-card">
          {/* Original Speech */}
          <div className="sahayak-live-turn__speech-section">
            <span className="sahayak-live-turn__label">
              {currentTurn.speakerRole === 'doctor'
                ? isDoctor
                  ? 'Doctor (English — Original)'
                  : 'डॉक्टर (अंग्रेज़ी — मूल)'
                : isDoctor
                ? 'Patient (Hindi — Original)'
                : 'आप (हिन्दी — मूल)'}
            </span>
            <p
              className="sahayak-live-turn__text"
              lang={currentTurn.originalLanguage}
            >
              {currentTurn.originalText}
            </p>
          </div>

          {/* Interpretation */}
          <div className="sahayak-live-turn__interpretation-section">
            <span className="sahayak-live-turn__label">
              {currentTurn.speakerRole === 'doctor'
                ? isDoctor
                  ? 'Interpretation (Hindi for Patient)'
                  : 'अनुवाद (हिन्दी — आपके लिए)'
                : isDoctor
                ? 'Interpretation (English for Doctor)'
                : 'अनुवाद (अंग्रेज़ी — डॉक्टर के लिए)'}
            </span>
            {currentTurn.translatedText ? (
              <p
                className="sahayak-live-turn__text sahayak-live-turn__text--interpreted"
                lang={currentTurn.translatedLanguage || (currentTurn.originalLanguage === 'en' ? 'hi' : 'en')}
              >
                {currentTurn.translatedText}
              </p>
            ) : (
              <p className="sahayak-live-turn__placeholder">
                {isDoctor ? 'Interpreting speech...' : 'अनुवाद तैयार हो रहा है...'}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
