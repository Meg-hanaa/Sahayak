import React from 'react';
import {
  ConversationTurn,
  ParticipantRole,
  RepetitionRequestItem,
  SystemActivityState,
} from '../types/consultation.ts';
import './LiveTurnDisplay.css';

export interface LiveTurnDisplayProps {
  activityState: SystemActivityState;
  currentTurn?: ConversationTurn | null;
  viewerRole: ParticipantRole;
  isMuted: boolean;
  errorMessage?: string | null;
  repetitionRequest?: RepetitionRequestItem | null;
}

export const LiveTurnDisplay: React.FC<LiveTurnDisplayProps> = ({
  activityState,
  currentTurn,
  viewerRole,
  isMuted,
  repetitionRequest,
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

  const hasOriginal = Boolean(currentTurn?.originalText);
  const hasTranslated = Boolean(currentTurn?.translatedText);
  const hasActiveContent = Boolean(currentTurn && (hasOriginal || hasTranslated));
  const isSingleColumn = (hasOriginal && !hasTranslated) || (!hasOriginal && hasTranslated);

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

      {/* Repetition Request Banner */}
      {repetitionRequest && (
        <div className="sahayak-live-turn__repetition-banner" role="alert">
          <span className="sahayak-live-turn__repetition-tag">
            {isDoctor ? 'Repetition Needed' : 'कृपया दोहराएँ'}
          </span>
          <p className="sahayak-live-turn__repetition-text">
            {repetitionRequest.promptText}
          </p>
        </div>
      )}

      {/* Active Speech Box */}
      {hasActiveContent && currentTurn && (
        <div className={`sahayak-live-turn__content-card ${isSingleColumn ? 'sahayak-live-turn__content-card--single' : ''}`}>
          {/* Original Speech */}
          {hasOriginal && (
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
          )}

          {/* Interpretation */}
          {hasTranslated && (
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
              <p
                className="sahayak-live-turn__text sahayak-live-turn__text--interpreted"
                lang={currentTurn.translatedLanguage || (currentTurn.originalLanguage === 'en' ? 'hi' : 'en')}
              >
                {currentTurn.translatedText}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

