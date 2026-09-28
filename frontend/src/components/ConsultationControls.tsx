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
  isOpenConfirmModal?: boolean;
  onOpenConfirmModal?: () => void;
  onCloseConfirmModal?: () => void;
}

export const ConsultationControls: React.FC<ConsultationControlsProps> = ({
  viewerRole,
  isMuted,
  onToggleMute,
  onEndConsultation,
  disabled = false,
  liveAudioAvailable: _liveAudioAvailable = false,
  errorMessage,
  isOpenConfirmModal,
  onOpenConfirmModal,
  onCloseConfirmModal,
}) => {
  const isDoctor = viewerRole === 'doctor';
  const [localShowConfirmModal, setLocalShowConfirmModal] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const showConfirmModal =
    isOpenConfirmModal !== undefined ? isOpenConfirmModal : localShowConfirmModal;

  const handleOpenModal = () => {
    if (onOpenConfirmModal) {
      onOpenConfirmModal();
    } else {
      setLocalShowConfirmModal(true);
    }
  };

  const handleCloseModal = () => {
    if (onCloseConfirmModal) {
      onCloseConfirmModal();
    } else {
      setLocalShowConfirmModal(false);
    }
  };

  // Close modal on Escape key
  useEffect(() => {
    if (!showConfirmModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEnding) {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    cancelBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmModal, isEnding]);

  const handleConfirmEnd = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      await onEndConsultation();
      handleCloseModal();
    } catch {
      // Intentionally caught: session.errorMessage is the single source of truth.
      // Keep confirmation modal open after failure to allow retry without unhandled rejection.
    } finally {
      setIsEnding(false);
    }
  };

  const isMuteDisabled = disabled;

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
              isMuted
                ? isDoctor
                  ? 'Unmute microphone'
                  : 'माइक्रोफ़ोन चालू करें'
                : isDoctor
                ? 'Mute microphone'
                : 'माइक्रोफ़ोन बंद करें'
            }
            aria-label={
              isMuted
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
              {isMuted
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
            onClick={handleOpenModal}
            disabled={disabled}
            aria-label={isDoctor ? 'End consultation' : 'परामर्श छोड़ें'}
          >
            <PhoneOff size={20} aria-hidden="true" />
            <span className="sahayak-controls__label">
              {isDoctor ? 'End consultation' : 'परामर्श छोड़ें'}
            </span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="sahayak-controls__modal-backdrop"
          onClick={isEnding ? undefined : handleCloseModal}
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
            {errorMessage && (
              <div className="sahayak-controls__modal-error" role="alert">
                {errorMessage}
              </div>
            )}

            <div className="sahayak-controls__modal-actions">
              <button
                ref={cancelBtnRef}
                type="button"
                className="sahayak-controls__modal-btn sahayak-controls__modal-btn--cancel"
                onClick={handleCloseModal}
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
