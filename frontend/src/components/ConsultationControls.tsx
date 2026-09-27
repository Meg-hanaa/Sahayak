import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { ParticipantRole } from '../types/consultation.ts';
import './ConsultationControls.css';

export interface ConsultationControlsProps {
  viewerRole: ParticipantRole;
  isMuted: boolean;
  onToggleMute: () => void;
  onEndConsultation: () => void;
  disabled?: boolean;
}

export const ConsultationControls: React.FC<ConsultationControlsProps> = ({
  viewerRole,
  isMuted,
  onToggleMute,
  onEndConsultation,
  disabled = false,
}) => {
  const isDoctor = viewerRole === 'doctor';
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Close modal on Escape key
  useEffect(() => {
    if (!showConfirmModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowConfirmModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    cancelBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmModal]);

  const handleConfirmEnd = () => {
    setShowConfirmModal(false);
    onEndConsultation();
  };

  return (
    <>
      <div className="sahayak-controls" role="toolbar" aria-label={isDoctor ? 'Consultation controls' : 'परामर्श नियंत्रण'}>
        <div className="sahayak-controls__inner">
          {/* Mute / Unmute Button */}
          <button
            type="button"
            className={`sahayak-controls__btn sahayak-controls__btn--mute ${isMuted ? 'sahayak-controls__btn--muted' : ''}`}
            onClick={onToggleMute}
            disabled={disabled}
            aria-pressed={isMuted}
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
                ? 'This will conclude the session for both doctor and patient. Audio streams will be closed immediately.'
                : 'क्या आप परामर्श छोड़ना चाहते हैं? आपका ऑडियो कनेक्शन बंद कर दिया जाएगा।'}
            </p>
            <div className="sahayak-controls__modal-actions">
              <button
                ref={cancelBtnRef}
                type="button"
                className="sahayak-controls__modal-btn sahayak-controls__modal-btn--cancel"
                onClick={() => setShowConfirmModal(false)}
              >
                {isDoctor ? 'Cancel' : 'रद्द करें'}
              </button>
              <button
                type="button"
                className="sahayak-controls__modal-btn sahayak-controls__modal-btn--confirm"
                onClick={handleConfirmEnd}
              >
                {isDoctor ? 'Confirm end consultation' : 'हाँ, छोड़ें'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
