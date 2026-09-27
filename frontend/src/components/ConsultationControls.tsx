import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { ParticipantRole } from '../types/consultation.ts';
import './ConsultationControls.css';

export interface ConsultationControlsProps {
  viewerRole: ParticipantRole;
  isMuted: boolean;
  onToggleMute: () => void;
  onEndConsultation: () => void | Promise<void>;
  disabled?: boolean;
  liveAudioAvailable?: boolean;
  errorMessage?: string | null;
}

export const ConsultationControls: React.FC<ConsultationControlsProps> = ({
  viewerRole,
  isMuted,
  onToggleMute,
  onEndConsultation,
  disabled = false,
  liveAudioAvailable = false,
  errorMessage,
}) => {
  const isDoctor = viewerRole === 'doctor';
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [localEndError, setLocalEndError] = useState<string | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const displayError = localEndError || errorMessage;

  // Close modal on Escape key
  useEffect(() => {
    if (!showConfirmModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEnding) {
        setShowConfirmModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    cancelBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmModal, isEnding]);

  const handleConfirmEnd = async () => {
    if (isEnding) return;
    setIsEnding(true);
    setLocalEndError(null);
    try {
      await onEndConsultation();
      setShowConfirmModal(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isDoctor
          ? 'Failed to end consultation. Please try again.'
          : 'परामर्श समाप्त करने में विफल। पुनः प्रयास करें।';
      setLocalEndError(msg);
    } finally {
      setIsEnding(false);
    }
  };

  const isMuteDisabled = disabled || !liveAudioAvailable;

  return (
    <>
      <div
        className="sahayak-controls"
        role="toolbar"
        aria-label={isDoctor ? 'Consultation controls' : 'परामर्श नियंत्रण'}
      >
        <div className="sahayak-controls__inner">
          {/* Mute / Unmute Button */}
          <button
            type="button"
            className={`sahayak-controls__btn sahayak-controls__btn--mute ${
              isMuted ? 'sahayak-controls__btn--muted' : ''
            }`}
            onClick={onToggleMute}
            disabled={isMuteDisabled}
            aria-pressed={isMuted}
            aria-disabled={isMuteDisabled}
            title={
              !liveAudioAvailable
                ? isDoctor
                  ? 'Live speech streaming is not supported by current backend pipeline'
                  : 'वर्तमान बैकएंड में लाइव ऑडियो स्ट्रीमिंग उपलब्ध नहीं है'
                : undefined
            }
            aria-label={
              !liveAudioAvailable
                ? isDoctor
                  ? 'Microphone mute unavailable: Live speech streaming not connected'
                  : 'माइक्रोफ़ोन म्यूट अनुपलब्ध: लाइव ऑडियो स्ट्रीमिंग बैकएंड से नहीं जुड़ी है'
                : isMuted
                ? isDoctor
                  ? 'Unmute microphone'
                  : 'माइक्रोफ़ोन चालू करें'
                : isDoctor
                ? 'Mute microphone'
                : 'माइक्रोफ़ोन बंद करें'
            }
          >
            {isMuted ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
            <span className="sahayak-controls__label">
              {!liveAudioAvailable
                ? isDoctor
                  ? 'Mute (Unavailable)'
                  : 'माइक (अनुपलब्ध)'
                : isMuted
                ? isDoctor
                  ? 'Unmute'
                  : 'माइक चालू करें'
                : isDoctor
                ? 'Mute'
                : 'माइक बंद करें'}
            </span>
          </button>

          {/* End / Leave Consultation Button */}
          <button
            type="button"
            className="sahayak-controls__btn sahayak-controls__btn--end"
            onClick={() => setShowConfirmModal(true)}
            disabled={disabled}
            aria-label={isDoctor ? 'End consultation' : 'परामर्श छोड़ें'}
          >
            <PhoneOff size={20} aria-hidden="true" />
            <span className="sahayak-controls__label">
              {isDoctor ? 'End consultation' : 'परामर्श छोड़ें'}
            </span>
          </button>
        </div>

        {/* Action Error Bar if modal is closed */}
        {displayError && !showConfirmModal && (
          <div className="sahayak-controls__error-bar" role="alert">
            <span className="sahayak-controls__error-text">{displayError}</span>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="sahayak-controls__modal-backdrop"
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            className="sahayak-controls__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-modal-title" className="sahayak-controls__modal-title">
              {isDoctor ? 'End consultation?' : 'परामर्श छोड़ें?'}
            </h3>
            <p id="confirm-modal-desc" className="sahayak-controls__modal-desc">
              {isDoctor
                ? 'This will conclude the consultation for all participants and close connection streams.'
                : 'क्या आप परामर्श छोड़ना चाहते हैं? आप इस परामर्श से बाहर आ जाएंगे, जबकि डॉक्टर का सत्र जारी रह सकता है।'}
            </p>

            {/* Error in modal if end request failed */}
            {displayError && (
              <div className="sahayak-controls__modal-error" role="alert">
                {displayError}
              </div>
            )}

            <div className="sahayak-controls__modal-actions">
              <button
                ref={cancelBtnRef}
                type="button"
                className="sahayak-controls__modal-btn sahayak-controls__modal-btn--cancel"
                onClick={() => {
                  if (isEnding) return;
                  setShowConfirmModal(false);
                  setLocalEndError(null);
                }}
                disabled={isEnding}
              >
                {isDoctor ? 'Cancel' : 'रद्द करें'}
              </button>
              <button
                type="button"
                className="sahayak-controls__modal-btn sahayak-controls__modal-btn--confirm"
                onClick={handleConfirmEnd}
                disabled={isEnding}
                aria-busy={isEnding}
              >
                {isEnding
                  ? (isDoctor ? 'Ending...' : 'समाप्त किया जा रहा है...')
                  : (isDoctor ? 'Confirm end consultation' : 'हाँ, परामर्श छोड़ें')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
