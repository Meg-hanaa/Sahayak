import React, { useId } from 'react';
import { Volume2, VolumeX, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { UseSpeakerCheckReturn, SpeakerErrorCode } from '../hooks/useSpeakerCheck';
import { Button } from './Button';
import './SpeakerCheck.css';

export interface SpeakerCheckProps {
  speaker: UseSpeakerCheckReturn;
  language?: 'en' | 'hi';
  disabled?: boolean;
  disabledReason?: string;
}

export const SpeakerCheck: React.FC<SpeakerCheckProps> = ({
  speaker,
  language = 'en',
  disabled = false,
  disabledReason,
}) => {
  const isHindi = language === 'hi';
  const headingId = useId();
  const { status, errorCode, errorMessage, playTestSound, stopCheck, confirmHeard } = speaker;

  const resolveErrorMessage = (code: SpeakerErrorCode | null, fallback: string | null) => {
    if (!isHindi) return fallback || 'Unable to play test sound. Please check your audio device.';
    switch (code) {
      case 'not_supported':
        return 'इस ब्राउज़र में ऑडियो प्लेबैक समर्थित नहीं है।';
      case 'playback_failed':
        return 'ऑडियो बजाने में त्रुटि हुई। कृपया डिवाइस वॉल्यूम और सेटिंग जाँचें।';
      default:
        return 'ऑडियो चलाने में समस्या आई। कृपया सेटिंग जाँचें।';
    }
  };

  const strings = {
    title: isHindi ? 'स्पीकर / ऑडियो जाँच' : 'Speaker test',
    subtitle: isHindi
      ? 'परीक्षण ध्वनि बजाकर सुनिश्चित करें कि आप आवाज़ सुन सकते हैं।'
      : 'Play a short chime to verify you can hear the translated audio clearly.',
    playButton: isHindi ? 'परीक्षण आवाज़ बजाएँ' : 'Play test sound',
    playingButton: isHindi ? 'ध्वनि बज रही है...' : 'Playing sound...',
    stopButton: isHindi ? 'रोकें' : 'Stop',
    confirmQuestion: isHindi ? 'क्या आपको आवाज़ सुनाई दी?' : 'Did you hear the sound?',
    yesButton: isHindi ? 'हाँ, आवाज़ आई' : 'Yes, I heard it',
    noButton: isHindi ? 'नहीं, आवाज़ नहीं आई' : 'No, I did not hear it',
    retryButton: isHindi ? 'पुनः जाँचें' : 'Test again',
    status: {
      idle: isHindi ? 'अभी तक जाँचा नहीं गया' : 'Not checked yet',
      playing: isHindi ? 'परीक्षण ध्वनि बज रही है...' : 'Playing test chime...',
      confirming: isHindi
        ? 'कृपया नीचे पुष्टि करें कि क्या आपको आवाज़ सुनाई दी।'
        : 'Please confirm below if you heard the sound.',
      passed: isHindi
        ? 'आपने परीक्षण की आवाज़ सुनने की पुष्टि की।'
        : 'You confirmed hearing the test sound.',
      failed: isHindi
        ? 'ध्वनि नहीं सुनाई दी। कृपया अपने डिवाइस का वॉल्यूम बढ़ाएँ या म्यूट बंद करें।'
        : 'Sound was not heard. Please increase volume, check mute, or verify audio output.',
      error: resolveErrorMessage(errorCode, errorMessage),
    },
    troubleshooting: isHindi
      ? 'सुझाव: सुनिश्चित करें कि आपके डिवाइस का वॉल्यूम कम या म्यूट नहीं है।'
      : 'Tip: Ensure your device volume is turned up and mute is disabled.',
  };

  const isCompleted = status === 'passed';
  const isFailed = status === 'failed' || status === 'error';
  const isPlaying = status === 'playing';

  return (
    <section
      className={`sahayak-speaker-card ${isCompleted ? 'sahayak-speaker-card--completed' : ''} ${isHindi ? 'sahayak-lang-hi' : ''}`}
      aria-labelledby={headingId}
      lang={isHindi ? 'hi' : 'en'}
    >
      <div className="sahayak-speaker-card__header">
        <div className="sahayak-speaker-card__title-row">
          <span className="sahayak-speaker-card__icon-badge" aria-hidden="true">
            <Volume2 size={20} strokeWidth={2} />
          </span>
          <div>
            <h2 id={headingId} className="sahayak-speaker-card__title">
              {strings.title}
            </h2>
            <p className="sahayak-speaker-card__subtitle">{strings.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="sahayak-speaker-card__body">
        {/* Status indicator */}
        <div
          className={`sahayak-speaker-status sahayak-speaker-status--${status}`}
          role="status"
          aria-live="polite"
        >
          {isCompleted && <Check size={18} className="sahayak-speaker-status-icon sahayak-speaker-status-icon--neutral-done" aria-hidden="true" />}
          {isFailed && <AlertCircle size={18} className="sahayak-speaker-status-icon sahayak-speaker-status-icon--error" aria-hidden="true" />}
          {isPlaying && <Volume2 size={18} className="sahayak-speaker-status-icon sahayak-speaker-status-icon--active" aria-hidden="true" />}
          {(status === 'idle' || status === 'confirming') && (
            <VolumeX size={18} className="sahayak-speaker-status-icon sahayak-speaker-status-icon--idle" aria-hidden="true" />
          )}
          <span className="sahayak-speaker-status__text">{strings.status[status]}</span>
        </div>

        {/* Failed troubleshooting help */}
        {status === 'failed' && (
          <p className="sahayak-speaker-troubleshoot">{strings.troubleshooting}</p>
        )}

        {/* Confirmation Prompt when chime finishes */}
        {status === 'confirming' && (
          <div className="sahayak-speaker-confirm-box">
            <p className="sahayak-speaker-confirm-question">{strings.confirmQuestion}</p>
            <div className="sahayak-speaker-confirm-actions">
              <Button
                variant="primary"
                onClick={() => confirmHeard(true)}
                className="sahayak-speaker-confirm-btn"
              >
                <Check size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
                <span>{strings.yesButton}</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => confirmHeard(false)}
                className="sahayak-speaker-confirm-btn"
              >
                <span>{strings.noButton}</span>
              </Button>
            </div>
          </div>
        )}

        {/* Mutual exclusion busy notice */}
        {disabled && disabledReason && (
          <p className="sahayak-speaker-busy-notice" role="status">
            {disabledReason}
          </p>
        )}

        {/* Initial / Retry Actions */}
        {status !== 'confirming' && (
          <div className="sahayak-speaker-actions">
            {status === 'idle' && (
              <Button
                variant="primary"
                onClick={playTestSound}
                disabled={disabled}
                className="sahayak-speaker-action-btn"
              >
                <Volume2 size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
                <span>{strings.playButton}</span>
              </Button>
            )}

            {status === 'playing' && (
              <Button
                variant="secondary"
                onClick={stopCheck}
                className="sahayak-speaker-action-btn"
                aria-label={isHindi ? 'ऑडियो प्लेबैक रोकें' : 'Stop audio playback'}
              >
                <span>{strings.stopButton}</span>
              </Button>
            )}

            {(status === 'passed' || status === 'failed' || status === 'error') && (
              <Button
                variant="secondary"
                onClick={playTestSound}
                disabled={disabled}
                className="sahayak-speaker-action-btn"
              >
                <RotateCcw size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
                <span>{strings.retryButton}</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
