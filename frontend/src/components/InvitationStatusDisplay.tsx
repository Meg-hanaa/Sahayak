import React from 'react';
import {
  Check,
  AlertCircle,
  Clock,
  Users,
  WifiOff,
  HelpCircle,
  Loader2,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { Button } from './Button';
import './InvitationStatusDisplay.css';

export type InvitationState =
  | 'unverified'
  | 'verifying'
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'session_full'
  | 'session_ended'
  | 'network_error';

export interface InvitationStatusDisplayProps {
  state: InvitationState;
  token?: string;
  onRetry?: () => void;
  onBackToHome?: () => void;
  language?: 'en' | 'hi';
}

export const InvitationStatusDisplay: React.FC<InvitationStatusDisplayProps> = ({
  state,
  token,
  onRetry,
  onBackToHome,
  language = 'hi', // Patient side defaults to Hindi
}) => {
  const isHindi = language === 'hi';

  const configs: Record<
    InvitationState,
    {
      title: string;
      description: string;
      icon: React.ReactNode;
      severity: 'neutral' | 'loading' | 'warning' | 'error';
      showRetry?: boolean;
    }
  > = {
    unverified: {
      title: isHindi ? 'आमंत्रण की पुष्टि अभी उपलब्ध नहीं है।' : 'Invitation verification is not connected yet.',
      description: isHindi
        ? 'लाइव सत्र में प्रवेश बैकएंड सेवा जुड़ने के बाद चालू होगा। आप नीचे अपने डिवाइस की ऑडियो जाँच पूरी कर सकते हैं।'
        : 'Joining the live consultation will be enabled once backend verification is connected. You can complete your local audio check below.',
      icon: <Info size={22} aria-hidden="true" />,
      severity: 'neutral',
    },
    verifying: {
      title: isHindi ? 'आमंत्रण की पुष्टि की जा रही है...' : 'Verifying invitation...',
      description: isHindi
        ? 'कृपया प्रतीक्षा करें, हम परामर्श सत्र की स्थिति जाँच रहे हैं।'
        : 'Please wait while we verify your consultation session.',
      icon: <Loader2 size={22} className="sahayak-inv-status__spinner" aria-hidden="true" />,
      severity: 'loading',
    },
    valid: {
      title: isHindi ? 'आमंत्रण मान्य (Preview)' : 'Invitation verified (Preview)',
      description: isHindi
        ? 'डेवलपमेंट प्रिव्यू: यह सत्र मान्य है।'
        : 'Development preview: This session is verified.',
      icon: <Check size={22} aria-hidden="true" />,
      severity: 'neutral',
    },
    invalid: {
      title: isHindi ? 'अमान्य आमंत्रण लिंक' : 'Invalid invitation link',
      description: isHindi
        ? 'यह लिंक सही नहीं लग रहा है या अधूरा है। कृपया डॉक्टर से मिला पूरा लिंक दोबारा जाँचें।'
        : 'This link is not valid or incomplete. Please check the full link received from your doctor.',
      icon: <HelpCircle size={22} aria-hidden="true" />,
      severity: 'error',
    },
    expired: {
      title: isHindi ? 'आमंत्रण समाप्त हो चुका है' : 'Invitation expired',
      description: isHindi
        ? 'इस परामर्श लिंक की समय सीमा समाप्त हो गई है। कृपया डॉक्टर से नया लिंक भेजने का अनुरोध करें।'
        : 'This consultation invitation has expired. Please ask your doctor for a new link.',
      icon: <Clock size={22} aria-hidden="true" />,
      severity: 'warning',
    },
    session_full: {
      title: isHindi ? 'सत्र में स्थान उपलब्ध नहीं है' : 'Session is full',
      description: isHindi
        ? 'इस परामर्श सत्र में पहले से ही दोनों प्रतिभागी जुड़े हुए हैं।'
        : 'Both doctor and patient participants have already joined this session.',
      icon: <Users size={22} aria-hidden="true" />,
      severity: 'warning',
    },
    session_ended: {
      title: isHindi ? 'परामर्श समाप्त हो चुका है' : 'Consultation concluded',
      description: isHindi
        ? 'यह परामर्श सत्र डॉक्टर द्वारा समाप्त कर दिया गया है।'
        : 'This consultation has ended.',
      icon: <AlertCircle size={22} aria-hidden="true" />,
      severity: 'warning',
    },
    network_error: {
      title: isHindi ? 'कनेक्शन समस्या' : 'Connection error',
      description: isHindi
        ? 'सर्वर से संपर्क नहीं हो सका। कृपया अपना इंटरनेट कनेक्शन जाँचें।'
        : 'Could not connect to the consultation service. Please check your connection.',
      icon: <WifiOff size={22} aria-hidden="true" />,
      severity: 'error',
      showRetry: true,
    },
  };

  const config = configs[state];

  return (
    <div
      className={`sahayak-inv-status sahayak-inv-status--${config.severity} ${isHindi ? 'sahayak-lang-hi' : ''}`}
      role={state === 'verifying' ? 'status' : 'region'}
      aria-live="polite"
      lang={isHindi ? 'hi' : 'en'}
    >
      <div className="sahayak-inv-status__icon-box">{config.icon}</div>
      <div className="sahayak-inv-status__content">
        <h3 className="sahayak-inv-status__title">{config.title}</h3>
        <p className="sahayak-inv-status__description">{config.description}</p>
        {token && (
          <p className="sahayak-inv-status__token">
            <span>Token:</span> <code>{token}</code>
          </p>
        )}
        <div className="sahayak-inv-status__actions">
          {config.showRetry && onRetry && (
            <Button variant="primary" onClick={onRetry} className="sahayak-inv-status__btn">
              <span>{isHindi ? 'पुनः प्रयास करें' : 'Try again'}</span>
            </Button>
          )}
          {onBackToHome && state !== 'unverified' && state !== 'verifying' && (
            <Button variant="secondary" onClick={onBackToHome} className="sahayak-inv-status__btn">
              <ArrowLeft size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
              <span>{isHindi ? 'मुखपृष्ठ पर जाएँ' : 'Back to home'}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
