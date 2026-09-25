import React, { useState, useRef, useEffect, useId } from 'react';
import { Copy, Check, AlertCircle, Share2 } from 'lucide-react';
import { Button } from './Button';
import { copyTextToClipboard } from '../utils/clipboard';
import './InvitationResultCard.css';

export interface InvitationResultCardProps {
  invitationUrl: string;
  sessionCode?: string;
  isFixture?: boolean;
}

export const InvitationResultCard: React.FC<InvitationResultCardProps> = ({
  invitationUrl,
  sessionCode,
  isFixture = false,
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyOpIdRef = useRef<number>(0);
  const isComponentMountedRef = useRef<boolean>(true);
  const headingId = useId();
  const inputId = useId();

  useEffect(() => {
    isComponentMountedRef.current = true;
    return () => {
      isComponentMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleCopy = async () => {
    const currentOpId = ++copyOpIdRef.current;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const { success } = await copyTextToClipboard(invitationUrl, {
      activeElement: document.activeElement as HTMLElement | null,
    });

    // Guard async clipboard completion after unmount or superseded operation
    if (!isComponentMountedRef.current || currentOpId !== copyOpIdRef.current) {
      return;
    }

    if (success) {
      setCopyStatus('copied');
      timerRef.current = setTimeout(() => {
        if (isComponentMountedRef.current && currentOpId === copyOpIdRef.current) {
          setCopyStatus('idle');
        }
      }, 2500);
    } else {
      setCopyStatus('failed');
      if (inputRef.current) {
        inputRef.current.select();
      }
      timerRef.current = setTimeout(() => {
        if (isComponentMountedRef.current && currentOpId === copyOpIdRef.current) {
          setCopyStatus('idle');
        }
      }, 4000);
    }
  };

  return (
    <section className="sahayak-invitation-card" aria-labelledby={headingId}>
      <div className="sahayak-invitation-card__header">
        {!isFixture && (
          <div className="sahayak-invitation-card__badge-row">
            <span className="sahayak-invitation-card__badge">
              <Share2 size={14} aria-hidden="true" />
              <span>Invitation ready</span>
            </span>
          </div>
        )}
        <h2 id={headingId} className="sahayak-invitation-card__title">
          Share this link with your patient
        </h2>
        <p className="sahayak-invitation-card__subtitle">
          The patient opens this private link on their phone or tablet to complete their audio check and join.
        </p>
      </div>

      {sessionCode && (
        <div className="sahayak-invitation-card__code-row">
          <span className="sahayak-invitation-card__code-label">Session ID:</span>
          <code className="sahayak-invitation-card__code-value">{sessionCode}</code>
        </div>
      )}

      {isFixture && (
        <p className="sahayak-invitation-card__fixture-note">
          Example invitation. This link cannot join a session.
        </p>
      )}

      <div className="sahayak-invitation-card__input-group">
        <label htmlFor={inputId} className="visually-hidden">
          Patient invitation link
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          readOnly
          value={invitationUrl}
          className="sahayak-invitation-card__input"
          onFocus={(e) => e.target.select()}
        />
        <Button
          type="button"
          variant="primary"
          onClick={handleCopy}
          className="sahayak-invitation-card__copy-btn"
          aria-label={
            copyStatus === 'copied'
              ? 'Invitation link copied to clipboard'
              : copyStatus === 'failed'
              ? 'Copy failed. Select and copy manually'
              : 'Copy invitation link'
          }
        >
          {copyStatus === 'copied' ? (
            <>
              <Check size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
              <span>Copied</span>
            </>
          ) : copyStatus === 'failed' ? (
            <>
              <AlertCircle size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
              <span>Copy failed</span>
            </>
          ) : (
            <>
              <Copy size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
              <span>Copy link</span>
            </>
          )}
        </Button>
      </div>

      {/* Accessible feedback live region (success only; failure announced exclusively via role="alert" below to prevent duplicate announcements) */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {copyStatus === 'copied' && 'Invitation link copied to clipboard.'}
      </div>

      {copyStatus === 'failed' && (
        <p className="sahayak-invitation-card__copy-error" role="alert">
          Unable to copy automatically. The link has been selected above—please press Ctrl+C or Cmd+C to copy.
        </p>
      )}

      <div className="sahayak-invitation-card__help">
        <div className="sahayak-invitation-card__help-item">
          <strong>Language:</strong> The patient will see instructions in Hindi (हिन्दी).
        </div>
        <div className="sahayak-invitation-card__help-item">
          <strong>Privacy:</strong> This link is unique to this consultation. No account is required for the patient.
        </div>
      </div>
    </section>
  );
};
