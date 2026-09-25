import React, { useId } from 'react';
import { Mic, MicOff, AlertCircle, Check, RotateCcw } from 'lucide-react';
import { UseMicrophoneCheckReturn, MicrophoneErrorCode } from '../hooks/useMicrophoneCheck';
import { Button } from './Button';
import './MicrophoneCheck.css';

export interface MicrophoneCheckProps {
  mic: UseMicrophoneCheckReturn;
  language?: 'en' | 'hi';
  disabled?: boolean;
  disabledReason?: string;
}

export const MicrophoneCheck: React.FC<MicrophoneCheckProps> = ({
  mic,
  language = 'en',
  disabled = false,
  disabledReason,
}) => {
  const isHindi = language === 'hi';
  const headingId = useId();
  const meterId = useId();
  const { status, audioLevel, lastReading, errorCode, errorMessage, startCheck, stopCheck } = mic;

  // Localized error message resolver using structured error codes
  const resolveErrorMessage = (code: MicrophoneErrorCode | null, fallback: string | null) => {
    if (!isHindi) return fallback || 'An unexpected error occurred while accessing the microphone.';
    switch (code) {
      case 'insecure_context':
        return 'माइक्रोफ़ोन जाँच के लिए सुरक्षित कनेक्शन (HTTPS) या localhost आवश्यक है।';
      case 'not_supported':
        return 'इस ब्राउज़र में माइक्रोफ़ोन की सुविधा उपलब्ध नहीं है।';
      case 'permission_denied':
        return 'माइक्रोफ़ोन अनुमति अस्वीकृत की गई। कृपया ब्राउज़र सेटिंग में अनुमति दें।';
      case 'no_device':
        return 'इस डिवाइस पर कोई माइक्रोफ़ोन नहीं मिला।';
      case 'in_use':
        return 'माइक्रोफ़ोन किसी अन्य ऐप द्वारा उपयोग में है या अनुपलब्ध है।';
      default:
        return 'माइक्रोफ़ोन तक पहुँचने में समस्या आई। कृपया सेटिंग जाँचें।';
    }
  };

  const strings = {
    title: isHindi ? 'माइक्रोफ़ोन जाँच' : 'Microphone test',
    subtitle: isHindi
      ? 'ऑडियो इनपुट की पुष्टि के लिए अपने माइक्रोफ़ोन में कुछ बोलें।'
      : 'Speak a short sentence into your microphone to verify audio input.',
    checkButton: isHindi ? 'माइक्रोफ़ोन जाँचें' : 'Check microphone',
    stopButton: isHindi ? 'रोकें' : 'Stop',
    retryButton: isHindi ? 'पुनः जाँचें' : 'Test again',
    meterLabel: isHindi ? 'माइक्रोफ़ोन स्तर' : 'Microphone input level',
    lastReadingLabel: isHindi ? 'अंतिम इनपुट स्तर' : 'Last detected level',
    status: {
      idle: isHindi ? 'अभी तक जाँचा नहीं गया' : 'Not checked yet',
      requesting: isHindi
        ? 'माइक्रोफ़ोन अनुमति माँगी जा रही है...'
        : 'Requesting permission...',
      listening: isHindi
        ? 'सुन रहे हैं... कृपया माइक्रोफ़ोन में बोलें।'
        : 'Listening... Please speak into your microphone.',
      sound_detected: isHindi
        ? 'आवाज़ मिली। माइक्रोफ़ोन की जाँच पूरी हुई।'
        : 'Sound detected. Microphone check complete.',
      no_sound_detected: isHindi
        ? 'कोई आवाज़ नहीं मिली। थोड़ा तेज़ बोलें या डिवाइस सेटिंग जाँचें।'
        : 'No sound detected. Speak louder or check input settings.',
      denied: resolveErrorMessage(errorCode, errorMessage),
      no_device: resolveErrorMessage(errorCode, errorMessage),
      error: resolveErrorMessage(errorCode, errorMessage),
      unsupported: resolveErrorMessage(errorCode, errorMessage),
    },
  };

  const isCompleted = status === 'sound_detected';
  const isFailed = ['denied', 'no_device', 'error', 'unsupported', 'no_sound_detected'].includes(status);
  const isActive = status === 'requesting' || status === 'listening';

  return (
    <section
      className={`sahayak-mic-card ${isCompleted ? 'sahayak-mic-card--completed' : ''} ${isHindi ? 'sahayak-lang-hi' : ''}`}
      aria-labelledby={headingId}
      lang={isHindi ? 'hi' : 'en'}
    >
      <div className="sahayak-mic-card__header">
        <div className="sahayak-mic-card__title-row">
          <span className="sahayak-mic-card__icon-badge" aria-hidden="true">
            <Mic size={20} strokeWidth={2} />
          </span>
          <div>
            <h2 id={headingId} className="sahayak-mic-card__title">
              {strings.title}
            </h2>
            <p className="sahayak-mic-card__subtitle">{strings.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="sahayak-mic-card__body">
        {/* Status message - live region only for status changes */}
        <div
          className={`sahayak-mic-status sahayak-mic-status--${status}`}
          role="status"
          aria-live="polite"
        >
          {isCompleted && <Check size={18} className="sahayak-mic-status-icon sahayak-mic-status-icon--neutral-done" aria-hidden="true" />}
          {isFailed && <AlertCircle size={18} className="sahayak-mic-status-icon sahayak-mic-status-icon--error" aria-hidden="true" />}
          {isActive && <Mic size={18} className="sahayak-mic-status-icon sahayak-mic-status-icon--active" aria-hidden="true" />}
          {status === 'idle' && <MicOff size={18} className="sahayak-mic-status-icon sahayak-mic-status-icon--idle" aria-hidden="true" />}
          <span className="sahayak-mic-status__text">{strings.status[status]}</span>
        </div>

        {/* Live Level Meter - ONLY rendered while actively listening to avoid false live indicators */}
        {status === 'listening' && (
          <div className="sahayak-mic-meter-container">
            <div className="sahayak-mic-meter-header">
              <span id={meterId} className="sahayak-mic-meter-label">{strings.meterLabel}</span>
              <span className="sahayak-mic-meter-value" aria-hidden="true">{audioLevel}%</span>
            </div>
            <div
              className="sahayak-mic-meter-track"
              role="meter"
              aria-labelledby={meterId}
              aria-valuenow={audioLevel}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="sahayak-mic-meter-fill"
                style={{ width: `${audioLevel}%` }}
              />
              <div
                className="sahayak-mic-meter-threshold"
                title="Threshold (12%)"
                style={{ left: '12%' }}
                aria-hidden="true"
              />
            </div>
          </div>
        )}

        {/* Retained measurement display after capture stopped on success */}
        {isCompleted && lastReading !== null && (
          <div className="sahayak-mic-retained-reading">
            <span className="sahayak-mic-retained-label">{strings.lastReadingLabel}:</span>
            <span className="sahayak-mic-retained-val">{lastReading}%</span>
          </div>
        )}

        {/* Mutual exclusion explanation when disabled */}
        {disabled && disabledReason && (
          <p className="sahayak-mic-busy-notice" role="status">
            {disabledReason}
          </p>
        )}

        {/* Actions */}
        <div className="sahayak-mic-actions">
          {status === 'idle' && (
            <Button
              variant="primary"
              onClick={startCheck}
              disabled={disabled}
              className="sahayak-mic-action-btn"
            >
              {strings.checkButton}
            </Button>
          )}

          {status === 'requesting' && (
            <Button
              variant="secondary"
              onClick={stopCheck}
              className="sahayak-mic-action-btn"
            >
              {strings.stopButton}
            </Button>
          )}

          {status === 'listening' && (
            <Button
              variant="secondary"
              onClick={stopCheck}
              className="sahayak-mic-action-btn"
            >
              {strings.stopButton}
            </Button>
          )}

          {(isCompleted || isFailed) && (
            <Button
              variant="secondary"
              onClick={startCheck}
              disabled={disabled}
              className="sahayak-mic-action-btn"
            >
              <RotateCcw size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
              {strings.retryButton}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};
