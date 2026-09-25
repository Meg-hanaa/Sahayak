import React, { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link as LinkIcon, AlertCircle, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import { TaskHeader } from '../components/TaskHeader';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { parseInvitationInput } from '../utils/invitationParser';
import './PatientJoinEntryPage.css';

export const PatientJoinEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const inputId = useId();
  const errorId = useId();
  const helpId = useId();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = parseInvitationInput(inputValue, window.location.origin);
    if (!result.ok) {
      setError(result.error);
    } else {
      navigate(`/join/${result.token}`);
    }
  };

  return (
    <div className="sahayak-join-entry-page sahayak-lang-hi" lang="hi">
      <TaskHeader containerSize="sm" badge="मरीज़ प्रवेश" />

      <main id="main-content" className="sahayak-join-entry-main">
        <Container size="sm">
          <div className="sahayak-join-entry-card">
            {/* Header */}
            <div className="sahayak-join-entry-header">
              <h1 className="sahayak-join-title">परामर्श में शामिल हों</h1>
              <p className="sahayak-join-subtitle">
                डॉक्टर द्वारा एसएमएस या संदेश में भेजा गया आमंत्रण लिंक यहाँ दर्ज करें।
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="sahayak-join-form" noValidate>
              <div className="sahayak-join-field">
                <label htmlFor={inputId} className="sahayak-join-label">
                  <LinkIcon size={16} aria-hidden="true" />
                  <span>आमंत्रण लिंक</span>
                </label>
                <div className="sahayak-join-input-wrapper">
                  <input
                    id={inputId}
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="https://.../join/... या /join/..."
                    className={`sahayak-join-input ${error ? 'sahayak-join-input--error' : ''}`}
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? errorId : helpId}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                </div>
                {error ? (
                  <p id={errorId} className="sahayak-join-error" role="alert">
                    <AlertCircle size={15} aria-hidden="true" />
                    <span>{error}</span>
                  </p>
                ) : (
                  <p id={helpId} className="sahayak-join-help">
                    उदाहरण: /join/your-link या डॉक्टर से मिला पूरा लिंक
                  </p>
                )}
              </div>

              <Button type="submit" variant="primary" className="sahayak-join-submit-btn">
                <span>आगे बढ़ें</span>
                <ArrowRight size={18} aria-hidden="true" style={{ marginLeft: '6px' }} />
              </Button>
            </form>

            {/* Helpful guidance notes */}
            <div className="sahayak-join-info-box">
              <h2 className="sahayak-join-info-title">
                <HelpCircle size={16} aria-hidden="true" />
                <span>लिंक कहाँ मिलेगा?</span>
              </h2>
              <ul className="sahayak-join-info-list">
                <li>डॉक्टर या क्लिनिक द्वारा आपके मोबाइल पर भेजा गया संदेश देखें।</li>
                <li>अगले चरण में आपके माइक्रोफ़ोन और स्पीकर की छोटी जाँच होगी।</li>
                <li>इसके लिए किसी पासवर्ड या ऐप डाउनलोड की आवश्यकता नहीं है।</li>
              </ul>
            </div>

            {/* Privacy notice - Accurate local audio note */}
            <div className="sahayak-join-privacy">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>ऑडियो जाँच पूरी तरह आपके डिवाइस पर स्थानीय रूप से होती है।</span>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
};
