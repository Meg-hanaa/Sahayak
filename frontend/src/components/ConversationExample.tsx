import React, { useState } from 'react';
import './ConversationExample.css';

interface ConversationTurn {
  speakerLabel: string;
  speakerSentence: string;
  speakerLang: 'en' | 'hi';
  listenerLabel: string;
  listenerSentence: string;
  listenerLang: 'en' | 'hi';
  toggleLabel: string;
  srAnnouncement: string;
}

const QUESTION_STATE: ConversationTurn = {
  speakerLabel: 'Doctor says · English',
  speakerSentence: '“How are you feeling today?”',
  speakerLang: 'en',
  listenerLabel: 'Patient hears · हिन्दी',
  listenerSentence: '“आज आप कैसा महसूस कर रहे हैं?”',
  listenerLang: 'hi',
  toggleLabel: 'See the reply',
  srAnnouncement: 'Doctor says in English: How are you feeling today? Patient hears in Hindi.',
};

const REPLY_STATE: ConversationTurn = {
  speakerLabel: 'Patient says · हिन्दी',
  speakerSentence: '“आज मुझे थोड़ा बेहतर लग रहा है।”',
  speakerLang: 'hi',
  listenerLabel: 'Doctor hears · English',
  listenerSentence: '“I’m feeling a little better today.”',
  listenerLang: 'en',
  toggleLabel: 'See the question',
  srAnnouncement: 'Patient says in Hindi: आज मुझे थोड़ा बेहतर लग रहा है। Doctor hears in English: I’m feeling a little better today.',
};

export const ConversationExample: React.FC = () => {
  const [isReply, setIsReply] = useState(false);
  const [isFading, setIsFading] = useState(false);

  const current = isReply ? REPLY_STATE : QUESTION_STATE;

  const handleToggle = () => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setIsReply((prev) => !prev);
      return;
    }

    setIsFading(true);
    setTimeout(() => {
      setIsReply((prev) => !prev);
      setIsFading(false);
    }, 180);
  };

  return (
    <section
      className="sahayak-conversation-section"
      aria-labelledby="conversation-example-title"
    >
      <div className="sahayak-home-wrapper">
        {/* Screen Reader Announcement Live Region */}
        <div
          className="sr-only sahayak-sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {current.srAnnouncement}
        </div>

        {/* Section Header */}
        <div className="sahayak-conversation-header">
          <p className="sahayak-conversation-eyebrow">Example conversation</p>
          <h2
            id="conversation-example-title"
            className="sahayak-conversation-title"
          >
            Two languages. One conversation.
          </h2>
          <p className="sahayak-conversation-subtitle">
            A short example of what each person says and hears.
          </p>
        </div>

        {/* Interactive Dialogue Showcase */}
        <div className="sahayak-conversation-display">
          <div
            className={`sahayak-conversation-columns ${
              isFading ? 'sahayak-conversation-columns--fading' : ''
            }`}
            aria-hidden={isFading ? 'true' : undefined}
          >
            {/* Left Column: Original Speaker */}
            <div className="sahayak-conversation-col sahayak-conversation-col--speaker">
              <span
                className="sahayak-conversation-role-label"
                lang={current.speakerLang === 'hi' ? 'hi' : undefined}
              >
                {current.speakerLabel}
              </span>
              <p
                className={`sahayak-conversation-sentence ${
                  current.speakerLang === 'hi' ? 'sahayak-conversation-sentence--hindi' : ''
                }`}
                lang={current.speakerLang}
              >
                {current.speakerSentence}
              </p>
            </div>

            {/* Subtle Divider */}
            <div
              className="sahayak-conversation-divider"
              aria-hidden="true"
            />

            {/* Right Column: Listener Hears */}
            <div className="sahayak-conversation-col sahayak-conversation-col--listener">
              <span
                className="sahayak-conversation-role-label"
                lang={current.listenerLang === 'hi' ? 'hi' : undefined}
              >
                {current.listenerLabel}
              </span>
              <p
                className={`sahayak-conversation-sentence ${
                  current.listenerLang === 'hi' ? 'sahayak-conversation-sentence--hindi' : ''
                }`}
                lang={current.listenerLang}
              >
                {current.listenerSentence}
              </p>
            </div>
          </div>

          {/* Action Toggle */}
          <div className="sahayak-conversation-action">
            <button
              type="button"
              className="sahayak-button sahayak-button--secondary sahayak-conversation-toggle"
              onClick={handleToggle}
              aria-label={isReply ? 'Switch to doctor’s question' : 'Switch to patient’s reply'}
            >
              {current.toggleLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ConversationExample;
