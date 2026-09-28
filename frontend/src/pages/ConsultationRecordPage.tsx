import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { Container } from '../components/Container';
import { TaskHeader } from '../components/TaskHeader';
import { sessionApi, SessionApiError } from '../services/sessionApi';
import { getSessionToken, setSessionToken } from '../utils/tokenStorage';
import type { SessionRecordResponse } from '../types/record';
import './ConsultationRecordPage.css';

type RecordPageState = 'loading' | 'success' | 'not_found' | 'expired' | 'unauthorized' | 'error';

export const ConsultationRecordPage: React.FC = () => {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const location = useLocation();

  const [state, setState] = useState<RecordPageState>('loading');
  const [record, setRecord] = useState<SessionRecordResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual token input state for unauthorized or missing token scenarios
  const [tokenInput, setTokenInput] = useState('');
  const [manualTokenError, setManualTokenError] = useState<string | null>(null);

  const fetchRecord = useCallback(async (tokenToUse?: string) => {
    if (!sessionId) {
      setState('not_found');
      return;
    }

    // Resolve token: explicit param > sessionStorage > router location.search > window.location.search
    const queryToken =
      new URLSearchParams(location.search).get('token') ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null);

    const activeToken =
      tokenToUse ||
      (typeof window !== 'undefined' ? getSessionToken(sessionId) : null) ||
      queryToken ||
      undefined;

    if (!activeToken) {
      setState('unauthorized');
      return;
    }

    setState('loading');
    setErrorMessage(null);

    try {
      const data = await sessionApi.getSessionRecord(sessionId, activeToken);
      setRecord(data);
      setState('success');
      // Store token in session storage for refreshing
      setSessionToken(sessionId, activeToken);
    } catch (err: unknown) {
      if (err instanceof SessionApiError) {
        if (err.status === 404 || err.code === 'session_not_found') {
          setState('not_found');
        } else if (err.status === 410 || err.code === 'session_expired') {
          setState('expired');
        } else if (err.status === 401 || err.code === 'invalid_access_token') {
          setState('unauthorized');
          setManualTokenError('The provided access token is invalid or expired.');
        } else {
          setState('error');
          setErrorMessage(err.message || 'Failed to load consultation record.');
        }
      } else {
        setState('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to retrieve consultation record.'
        );
      }
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    if (!cancelled) {
      fetchRecord();
    }

    return () => {
      cancelled = true;
    };
  }, [fetchRecord]);

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setManualTokenError('Please enter an access token.');
      return;
    }
    setManualTokenError(null);
    fetchRecord(tokenInput.trim());
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const formatDate = (isoString?: string): string => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatTimeOnly = (isoString?: string): string => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="sahayak-record-page" lang="en">
      <TaskHeader containerSize="lg" badge="Consultation Record" />

      <main id="main-content" className="sahayak-record-main">
        <Container size="lg">
          {/* Loading State */}
          {state === 'loading' && (
            <div
              className="sahayak-record__card sahayak-record__card--center"
              role="status"
              aria-live="polite"
            >
              <div className="sahayak-record__spinner" aria-hidden="true" />
              <h2 className="sahayak-record__state-title">Loading Consultation Record</h2>
              <p className="sahayak-record__state-desc">
                Retrieving bilingual conversation turns and verified clinical facts for session{' '}
                <code>{sessionId}</code>...
              </p>
            </div>
          )}

          {/* Not Found State (404) */}
          {state === 'not_found' && (
            <div className="sahayak-record__card sahayak-record__card--center" role="alert">
              <h2 className="sahayak-record__state-title">Consultation Record Not Found</h2>
              <p className="sahayak-record__state-desc">
                No recorded consultation could be found for session ID <code>{sessionId}</code>. The
                session may not exist or may not have concluded yet.
              </p>
              <div className="sahayak-record__state-actions">
                <Link to="/" className="sahayak-record__btn sahayak-record__btn--primary">
                  Return to Home
                </Link>
                <Link
                  to="/consultation/new"
                  className="sahayak-record__btn sahayak-record__btn--secondary"
                >
                  Start New Consultation
                </Link>
              </div>
            </div>
          )}

          {/* Expired State (410) */}
          {state === 'expired' && (
            <div className="sahayak-record__card sahayak-record__card--center" role="alert">
              <h2 className="sahayak-record__state-title">Consultation Record Expired</h2>
              <p className="sahayak-record__state-desc">
                The data retention period for session <code>{sessionId}</code> has expired. In
                compliance with clinical data privacy policies, records are automatically purged
                once retention limits expire.
              </p>
              <div className="sahayak-record__state-actions">
                <Link to="/" className="sahayak-record__btn sahayak-record__btn--primary">
                  Return to Home
                </Link>
                <Link
                  to="/consultation/new"
                  className="sahayak-record__btn sahayak-record__btn--secondary"
                >
                  Start New Consultation
                </Link>
              </div>
            </div>
          )}

          {/* Unauthorized / Missing Token State (401) */}
          {state === 'unauthorized' && (
            <div className="sahayak-record__card sahayak-record__card--center" role="alert">
              <h2 className="sahayak-record__state-title">Access Token Required</h2>
              <p className="sahayak-record__state-desc">
                Viewing this consultation record requires an authorized doctor or patient access
                token for session <code>{sessionId}</code>.
              </p>

              {manualTokenError && (
                <div className="sahayak-record__inline-error" role="alert">
                  {manualTokenError}
                </div>
              )}

              <form onSubmit={handleManualTokenSubmit} className="sahayak-record__token-form">
                <label htmlFor="record-token-input" className="sahayak-record__form-label">
                  Enter Session Access Token:
                </label>
                <div className="sahayak-record__form-row">
                  <input
                    id="record-token-input"
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Enter access token"
                    className="sahayak-record__input"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="sahayak-record__btn sahayak-record__btn--primary"
                  >
                    View Record
                  </button>
                </div>
              </form>

              <div className="sahayak-record__state-actions" style={{ marginTop: 'var(--space-6)' }}>
                <Link to="/" className="sahayak-record__btn sahayak-record__btn--secondary">
                  Return to Home
                </Link>
              </div>
            </div>
          )}

          {/* General Error State */}
          {state === 'error' && (
            <div className="sahayak-record__card sahayak-record__card--center" role="alert">
              <h2 className="sahayak-record__state-title">Unable to Load Record</h2>
              <p className="sahayak-record__state-desc">
                {errorMessage || 'A network or server error occurred while retrieving the consultation record.'}
              </p>
              <div className="sahayak-record__state-actions">
                <button
                  type="button"
                  onClick={() => fetchRecord()}
                  className="sahayak-record__btn sahayak-record__btn--primary"
                >
                  Retry
                </button>
                <Link to="/" className="sahayak-record__btn sahayak-record__btn--secondary">
                  Return to Home
                </Link>
              </div>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && record && (
            <div className="sahayak-record__content">
              {/* Record Summary Header Card */}
              <div className="sahayak-record__card sahayak-record__header-card">
                <div className="sahayak-record__header-meta">
                  <span className="sahayak-record__badge">Official Bilingual Record</span>
                  <span className="sahayak-record__timestamp">
                    Generated: {formatDate(record.generated_at)}
                  </span>
                </div>

                <h1 className="sahayak-record__title">Consultation Record</h1>

                <div className="sahayak-record__meta-grid">
                  <div className="sahayak-record__meta-item">
                    <span className="sahayak-record__meta-label">Session ID</span>
                    <span className="sahayak-record__meta-value">
                      <code>{record.session_id}</code>
                    </span>
                  </div>
                  <div className="sahayak-record__meta-item">
                    <span className="sahayak-record__meta-label">Total Utterances</span>
                    <span className="sahayak-record__meta-value">
                      {record.conversation.length} {record.conversation.length === 1 ? 'turn' : 'turns'}
                    </span>
                  </div>
                  <div className="sahayak-record__meta-item">
                    <span className="sahayak-record__meta-label">Verified Facts</span>
                    <span className="sahayak-record__meta-value">
                      {record.verified_facts.length}
                    </span>
                  </div>
                  <div className="sahayak-record__meta-item">
                    <span className="sahayak-record__meta-label">Unresolved Items</span>
                    <span className="sahayak-record__meta-value">
                      {record.unresolved_items.length}
                    </span>
                  </div>
                </div>

                {/* Clinical Prototype Notice */}
                <aside className="sahayak-record__disclaimer" aria-label="Clinical disclaimer">
                  <strong>Clinical Notice:</strong> Prototype interpretation aid. Verified facts
                  reflect speaker confirmations recorded during session. Review and verify before
                  making clinical decisions or updating patient medical records.
                </aside>

                {/* Action Bar (Hidden in Print) */}
                <div className="sahayak-record__actions no-print">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="sahayak-record__btn sahayak-record__btn--primary"
                  >
                    Print / Save Record
                  </button>
                  <Link
                    to="/consultation/new"
                    className="sahayak-record__btn sahayak-record__btn--secondary"
                  >
                    New Consultation
                  </Link>
                  <Link to="/" className="sahayak-record__btn sahayak-record__btn--secondary">
                    Return to Home
                  </Link>
                </div>
              </div>

              {/* Verified Clinical Facts Section */}
              {record.verified_facts.length > 0 && (
                <section
                  className="sahayak-record__section"
                  aria-labelledby="verified-facts-heading"
                >
                  <div className="sahayak-record__section-header">
                    <h2 id="verified-facts-heading" className="sahayak-record__section-title">
                      Verified Clinical Facts
                    </h2>
                    <span className="sahayak-record__count-badge sahayak-record__count-badge--success">
                      {record.verified_facts.length} confirmed
                    </span>
                  </div>
                  <p className="sahayak-record__section-desc">
                    Clinical statements explicitly confirmed by the speaker during the consultation.
                  </p>

                  <div className="sahayak-record__facts-grid">
                    {record.verified_facts.map((fact) => (
                      <article key={fact.fact_id} className="sahayak-record__fact-card">
                        <div className="sahayak-record__fact-header">
                          <span className="sahayak-record__category-tag">
                            {fact.category || 'Clinical Fact'}
                          </span>
                          <span className="sahayak-record__fact-time">
                            {formatTimeOnly(fact.verified_at)}
                          </span>
                        </div>

                        <div className="sahayak-record__fact-body">
                          <div className="sahayak-record__fact-col">
                            <span className="sahayak-record__fact-sublabel">Original Statement</span>
                            <p className="sahayak-record__fact-text">
                              {fact.original_source_wording}
                            </p>
                          </div>
                          <div className="sahayak-record__fact-col">
                            <span className="sahayak-record__fact-sublabel">Verified Translation</span>
                            <p className="sahayak-record__fact-text sahayak-record__fact-text--translated">
                              {fact.translated_wording}
                            </p>
                          </div>
                        </div>

                        <footer className="sahayak-record__fact-footer">
                          <span>Confirmation Ref: <code>{fact.confirmation_reference}</code></span>
                        </footer>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {/* Unresolved Statements Section */}
              {record.unresolved_items.length > 0 && (
                <section
                  className="sahayak-record__section"
                  aria-labelledby="unresolved-items-heading"
                >
                  <div className="sahayak-record__section-header">
                    <h2
                      id="unresolved-items-heading"
                      className="sahayak-record__section-title sahayak-record__section-title--warning"
                    >
                      Unresolved Items &amp; Clarifications Needed
                    </h2>
                    <span className="sahayak-record__count-badge sahayak-record__count-badge--warning">
                      {record.unresolved_items.length} unverified
                    </span>
                  </div>
                  <p className="sahayak-record__section-desc">
                    Statements where interpretation was unclear, clarification was rejected, or confirmation was incomplete. Follow up directly with the patient.
                  </p>

                  <div className="sahayak-record__unresolved-list">
                    {record.unresolved_items.map((item) => (
                      <article key={item.item_id} className="sahayak-record__unresolved-card">
                        <div className="sahayak-record__unresolved-header">
                          <span className="sahayak-record__warning-tag">
                            {item.category ? `Unresolved ${item.category}` : 'Clarification Required'}
                          </span>
                          <span className="sahayak-record__fact-time">
                            {formatTimeOnly(item.timestamp)}
                          </span>
                        </div>
                        <p className="sahayak-record__unresolved-wording">
                          <strong>Statement:</strong> &ldquo;{item.source_wording}&rdquo;
                        </p>
                        <p className="sahayak-record__unresolved-reason">
                          <strong>Reason:</strong> {item.reason}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {/* Bilingual Conversation History Section */}
              <section
                className="sahayak-record__section"
                aria-labelledby="conversation-history-heading"
              >
                <div className="sahayak-record__section-header">
                  <h2 id="conversation-history-heading" className="sahayak-record__section-title">
                    Bilingual Conversation History
                  </h2>
                  <span className="sahayak-record__count-badge">
                    {record.conversation.length} {record.conversation.length === 1 ? 'turn' : 'turns'}
                  </span>
                </div>

                {record.conversation.length === 0 ? (
                  <div className="sahayak-record__empty-turns" role="note">
                    <p>No dialogue turns were recorded during this consultation session.</p>
                  </div>
                ) : (
                  <div className="sahayak-record__turns-list" role="feed" aria-label="Consultation turns">
                    {record.conversation.map((turn, index) => {
                      const isDoctor = turn.speaker_role === 'doctor';
                      const hasTranslated = Boolean(turn.translated_text);

                      return (
                        <article
                          key={turn.turn_id}
                          className={`sahayak-record__turn-card sahayak-record__turn-card--${turn.speaker_role}`}
                        >
                          <header className="sahayak-record__turn-header">
                            <span className="sahayak-record__turn-speaker">
                              #{index + 1} {isDoctor ? 'Doctor (English)' : 'Patient (Hindi)'}
                            </span>
                            <div className="sahayak-record__turn-meta">
                              {turn.safety_state !== 'standard' && (
                                <span className={`sahayak-record__safety-pill sahayak-record__safety-pill--${turn.safety_state}`}>
                                  {turn.safety_state.replace('_', ' ')}
                                </span>
                              )}
                              <time className="sahayak-record__turn-time">
                                {formatTimeOnly(turn.timestamp)}
                              </time>
                            </div>
                          </header>

                          <div className={`sahayak-record__turn-body ${!hasTranslated ? 'sahayak-record__turn-body--single' : ''}`}>
                            {/* Source Speech */}
                            <div className="sahayak-record__utterance">
                              <span className="sahayak-record__utterance-label">
                                {isDoctor ? 'Original Speech (English)' : 'मूल आवाज़ (हिन्दी)'}
                              </span>
                              <p
                                className="sahayak-record__utterance-text"
                                lang={turn.source_language}
                              >
                                {turn.source_text}
                              </p>
                            </div>

                            {/* Interpreted Speech */}
                            {hasTranslated && (
                              <div className="sahayak-record__utterance sahayak-record__utterance--interpreted">
                                <span className="sahayak-record__utterance-label">
                                  {isDoctor ? 'Interpretation for Patient (Hindi)' : 'Interpretation for Doctor (English)'}
                                </span>
                                <p
                                  className="sahayak-record__utterance-text sahayak-record__utterance-text--translated"
                                  lang={turn.target_language}
                                >
                                  {turn.translated_text}
                                </p>
                              </div>
                            )}
                          </div>

                          {(turn.retry_count > 0 || turn.error_message) && (
                            <footer className="sahayak-record__turn-footer">
                              {turn.retry_count > 0 && (
                                <span className="sahayak-record__turn-resilience">
                                  Resolved after {turn.retry_count} {turn.retry_count === 1 ? 'retry' : 'retries'}
                                </span>
                              )}
                              {turn.error_message && (
                                <span className="sahayak-record__turn-error">
                                  {turn.error_message}
                                </span>
                              )}
                            </footer>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Latency & Metrics Summary (if available) */}
              {record.latency_metrics && record.latency_metrics.sample_count > 0 && (
                <section
                  className="sahayak-record__section no-print"
                  aria-labelledby="metrics-heading"
                >
                  <div className="sahayak-record__section-header">
                    <h2 id="metrics-heading" className="sahayak-record__section-title">
                      Interpretation Performance &amp; Latency
                    </h2>
                    {record.latency_metrics.target_met && (
                      <span className="sahayak-record__count-badge sahayak-record__count-badge--success">
                        Target Met (&le; 2.0s)
                      </span>
                    )}
                  </div>

                  <div className="sahayak-record__metrics-grid">
                    <div className="sahayak-record__metric-card">
                      <span className="sahayak-record__metric-label">Sample Count</span>
                      <span className="sahayak-record__metric-val">
                        {record.latency_metrics.sample_count}
                      </span>
                    </div>
                    <div className="sahayak-record__metric-card">
                      <span className="sahayak-record__metric-label">Median Latency</span>
                      <span className="sahayak-record__metric-val">
                        {record.latency_metrics.median_seconds != null
                          ? `${record.latency_metrics.median_seconds.toFixed(2)}s`
                          : '—'}
                      </span>
                    </div>
                    <div className="sahayak-record__metric-card">
                      <span className="sahayak-record__metric-label">P95 Latency</span>
                      <span className="sahayak-record__metric-val">
                        {record.latency_metrics.p95_seconds != null
                          ? `${record.latency_metrics.p95_seconds.toFixed(2)}s`
                          : '—'}
                      </span>
                    </div>
                    <div className="sahayak-record__metric-card">
                      <span className="sahayak-record__metric-label">Min / Max</span>
                      <span className="sahayak-record__metric-val">
                        {record.latency_metrics.min_seconds != null &&
                        record.latency_metrics.max_seconds != null
                          ? `${record.latency_metrics.min_seconds.toFixed(2)}s / ${record.latency_metrics.max_seconds.toFixed(2)}s`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </Container>
      </main>
    </div>
  );
};
