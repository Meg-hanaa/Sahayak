import React from 'react';
import {
  ConversationTurn,
  ParticipantRole,
} from '../types/consultation.ts';
import './ConversationTranscript.css';

export interface ConversationTranscriptProps {
  turns: ConversationTurn[];
  viewerRole: ParticipantRole;
  onConfirmAction?: (turnId: string, confirmed: boolean) => void;
}

export const ConversationTranscript: React.FC<ConversationTranscriptProps> = ({
  turns,
  viewerRole,
  onConfirmAction,
}) => {
  const isDoctor = viewerRole === 'doctor';

  const getSpeakerLabel = (role: ParticipantRole): string => {
    if (role === 'doctor') {
      return isDoctor ? 'Doctor (English)' : 'डॉक्टर (अंग्रेज़ी)';
    }
    return isDoctor ? 'Patient (Hindi)' : 'आप (हिन्दी)';
  };

  const getTranslationLabel = (role: ParticipantRole): string => {
    if (role === 'doctor') {
      return isDoctor ? 'Interpretation (Hindi)' : 'अनुवाद (हिन्दी)';
    }
    return isDoctor ? 'Interpretation (English)' : 'अनुवाद (अंग्रेज़ी)';
  };

  if (turns.length === 0) {
    return (
      <div className="sahayak-transcript sahayak-transcript--empty" role="region" aria-label={isDoctor ? 'Conversation history' : 'बातचीत का इतिहास'}>
        <h2 className="sahayak-transcript__title">
          {isDoctor ? 'Conversation history' : 'बातचीत का इतिहास'}
        </h2>
        <p className="sahayak-transcript__empty-message">
          {isDoctor
            ? 'No conversation turns recorded yet. Live speech streaming is not yet supported by the current backend pipeline.'
            : 'अभी कोई बातचीत दर्ज नहीं है। वर्तमान बैकएंड पाइपलाइन में लाइव भाषण स्ट्रीमिंग अभी समर्थित नहीं है।'}
        </p>
      </div>
    );
  }

  return (
    <section
      className="sahayak-transcript"
      role="region"
      aria-label={isDoctor ? 'Bilingual conversation history' : 'द्विभाषी बातचीत का इतिहास'}
    >
      <div className="sahayak-transcript__header">
        <h2 className="sahayak-transcript__title">
          {isDoctor ? 'Conversation history' : 'बातचीत का इतिहास'}
        </h2>
        <span className="sahayak-transcript__count">
          {turns.length} {isDoctor ? (turns.length === 1 ? 'turn' : 'turns') : 'कथन'}
        </span>
      </div>

      <div
        className="sahayak-transcript__list"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {turns.map((turn) => {
          const isTurnFromDoctor = turn.speakerRole === 'doctor';
          return (
            <article
              key={turn.id}
              className={`sahayak-transcript-card sahayak-transcript-card--${turn.speakerRole}`}
              aria-label={`${getSpeakerLabel(turn.speakerRole)} at ${turn.timestamp}`}
            >
              {/* Card Meta Header */}
              <div className="sahayak-transcript-card__meta">
                <span className="sahayak-transcript-card__speaker">
                  {getSpeakerLabel(turn.speakerRole)}
                </span>
                <time className="sahayak-transcript-card__timestamp">
                  {turn.timestamp}
                </time>
              </div>

              {/* Speech & Interpretation Grid */}
              <div className={`sahayak-transcript-card__grid ${!turn.originalText ? 'sahayak-transcript-card__grid--single' : ''}`}>
                {/* Original utterance */}
                {turn.originalText && (
                  <div className="sahayak-transcript-card__original">
                    <span className="sahayak-transcript-card__sublabel">
                      {isDoctor ? 'Original Speech' : 'मूल आवाज़'}
                    </span>
                    <p
                      className="sahayak-transcript-card__text"
                      lang={turn.originalLanguage}
                    >
                      {turn.originalText}
                    </p>
                  </div>
                )}

                {/* Translated utterance */}
                {turn.translatedText && (
                  <div className="sahayak-transcript-card__translated">
                    <span className="sahayak-transcript-card__sublabel">
                      {getTranslationLabel(turn.speakerRole)}
                    </span>
                    <p
                      className="sahayak-transcript-card__text sahayak-transcript-card__text--interpreted"
                      lang={turn.translatedLanguage || (isTurnFromDoctor ? 'hi' : 'en')}
                    >
                      {turn.translatedText}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirmation section (if critical statement or medication confirmation was triggered) */}
              {turn.confirmation && (
                <div
                  className={`sahayak-transcript-card__confirmation sahayak-transcript-card__confirmation--${turn.confirmation.outcome}`}
                  role="note"
                >
                  <div className="sahayak-transcript-card__confirm-header">
                    <span className="sahayak-transcript-card__confirm-tag">
                      {isDoctor ? 'Speaker Confirmation' : 'पुष्टिकरण'}
                    </span>
                    <span className="sahayak-transcript-card__confirm-prompt">
                      {turn.confirmation.promptText}
                    </span>
                  </div>

                  {turn.confirmation.outcome === 'pending' && onConfirmAction ? (
                    <div className="sahayak-transcript-card__confirm-actions">
                      <button
                        type="button"
                        className="sahayak-transcript-card__confirm-btn sahayak-transcript-card__confirm-btn--yes"
                        onClick={() => onConfirmAction(turn.id, true)}
                      >
                        {isDoctor ? 'Confirm' : 'हाँ, पुष्टि करें'}
                      </button>
                      <button
                        type="button"
                        className="sahayak-transcript-card__confirm-btn sahayak-transcript-card__confirm-btn--no"
                        onClick={() => onConfirmAction(turn.id, false)}
                      >
                        {isDoctor ? 'Clarify / Correct' : 'स्पष्ट करें'}
                      </button>
                    </div>
                  ) : (
                    <div className="sahayak-transcript-card__confirm-outcome">
                      <span className="sahayak-transcript-card__confirm-outcome-label">
                        {turn.confirmation.userActionLabel ||
                          (turn.confirmation.outcome === 'confirmed'
                            ? isDoctor
                              ? 'Confirmed by speaker'
                              : 'पुष्टि की गई'
                            : isDoctor
                            ? 'Clarified by speaker'
                            : 'स्पष्ट किया गया')}
                      </span>
                      <span className="sahayak-transcript-card__unverified-note">
                        {isDoctor
                          ? 'Unverified interpretation — confirmed by speaker response only.'
                          : 'अपुष्ट व्याख्या — केवल वक्ता की प्रतिक्रिया द्वारा सत्यापित।'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
