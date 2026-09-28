import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, AlertCircle } from 'lucide-react';
import {
  ConnectionStatus,
  ParticipantRole,
  SessionStatus,
  SystemActivityState,
} from '../types/consultation.ts';
import './ConsultationSpeechInput.css';

export interface ConsultationSpeechInputProps {
  role: ParticipantRole;
  onSendSpeech: (text: string) => boolean;
  connectionStatus: ConnectionStatus;
  sessionStatus?: SessionStatus;
  activityState?: SystemActivityState;
  disabled?: boolean;
  isMuted?: boolean;
}

// Compact clinical presets for reliable hackathon demonstrations
export const DOCTOR_QUICK_PHRASES = [
  'How long have you had this fever?',
  'Take this medicine twice a day after food.',
];

export const PATIENT_QUICK_PHRASES = [
  'मुझे दो दिन से बुखार है',
  'मुझे इस दवा से एलर्जी है।',
];

// Web Speech API progressive enhancement type declarations
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): any;
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem;
    isFinal: boolean;
    length: number;
  };
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: BrowserSpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: BrowserSpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: BrowserSpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: BrowserSpeechRecognition, ev: Event) => void) | null;
}

function getSpeechRecognitionConstructor(): (new () => BrowserSpeechRecognition) | undefined {
  if (typeof window === 'undefined') return undefined;
  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || undefined;
}

export const ConsultationSpeechInput: React.FC<ConsultationSpeechInputProps> = ({
  role,
  onSendSpeech,
  connectionStatus,
  sessionStatus,
  activityState,
  disabled = false,
  isMuted = false,
}) => {
  const isDoctor = role === 'doctor';
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
  const isDictationSupported = Boolean(SpeechRecognitionConstructor);

  const quickPhrases = isDoctor ? DOCTOR_QUICK_PHRASES : PATIENT_QUICK_PHRASES;

  const isEnded = sessionStatus === 'ended';
  const isDisconnected = connectionStatus === 'disconnected';
  const isConnecting = connectionStatus === 'connecting';
  const isProcessing = activityState === 'processing';

  const isInputDisabled = disabled || isEnded || isDisconnected;
  const isSendDisabled = isInputDisabled || isConnecting || !text.trim() || isProcessing;

  // Cleanup Web Speech API instance on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore cleanup errors
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  // Automatically abort dictation if microphone is muted from controls
  useEffect(() => {
    if (isMuted && isListening && recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [isMuted, isListening]);

  const handleStartDictation = () => {
    if (!SpeechRecognitionConstructor || isInputDisabled) return;
    setDictationError(null);

    try {
      const recognition = new SpeechRecognitionConstructor();
      recognition.lang = isDoctor ? 'en-US' : 'hi-IN';
      recognition.continuous = false;
      recognition.interimResults = true;

      const baseText = text;

      recognition.onstart = () => {
        setIsListening(true);
        setDictationError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item && item[0]) {
            transcript += item[0].transcript;
          }
        }
        const updated = baseText ? `${baseText} ${transcript}`.trim() : transcript;
        setText(updated);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        const err = event.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setDictationError(
            isDoctor
              ? 'Microphone permission was denied for browser dictation.'
              : 'ब्राउज़र डिक्टेशन के लिए माइक्रोफ़ोन की अनुमति अस्वीकृत कर दी गई।'
          );
        } else if (err !== 'no-speech') {
          setDictationError(
            isDoctor
              ? 'Speech recognition error. Please type your message.'
              : 'डिक्टेशन में त्रुटि हुई। कृपया लिखकर भेजें।'
          );
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setDictationError(
        isDoctor
          ? 'Unable to start speech recognition. Please type your message.'
          : 'डिक्टेशन शुरू करने में असमर्थ। कृपया लिखकर भेजें।'
      );
    }
  };

  const handleStopDictation = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const handleToggleDictation = () => {
    if (isListening) {
      handleStopDictation();
    } else {
      handleStartDictation();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isSendDisabled) return;

    if (isListening) {
      handleStopDictation();
    }

    const dispatched = onSendSpeech(trimmed);
    if (dispatched) {
      setText('');
      setDictationError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectPhrase = (phrase: string) => {
    setText(phrase);
    setDictationError(null);
    textareaRef.current?.focus();
  };

  return (
    <section
      className={`sahayak-speech-input sahayak-speech-input--${role}`}
      aria-label={isDoctor ? 'Speech and message input' : 'भाषण और संदेश इनपुट'}
    >
      {/* Quick Demo Phrases */}
      <div
        className="sahayak-speech-input__phrases"
        role="group"
        aria-label={isDoctor ? 'Quick demo phrases' : 'त्वरित वाक्य'}
      >
        <span className="sahayak-speech-input__phrases-label">
          {isDoctor ? 'Quick phrases:' : 'त्वरित वाक्य:'}
        </span>
        <div className="sahayak-speech-input__phrases-list">
          {quickPhrases.map((phrase, idx) => (
            <button
              key={idx}
              type="button"
              className="sahayak-speech-input__chip"
              onClick={() => handleSelectPhrase(phrase)}
              disabled={isInputDisabled}
              title={isDoctor ? `Insert: "${phrase}"` : `जोड़ें: "${phrase}"`}
            >
              {phrase}
            </button>
          ))}
        </div>
      </div>

      {/* Disconnected Notice */}
      {isDisconnected && (
        <div
          className="sahayak-speech-input__notice sahayak-speech-input__notice--warning"
          role="status"
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>
            {isDoctor
              ? 'Disconnected from consultation session. Reconnecting...'
              : 'परामर्श सत्र डिस्कनेक्ट हो गया है। पुनः कनेक्ट करने का प्रयास किया जा रहा है...'}
          </span>
        </div>
      )}

      {/* Dictation Permission/Runtime Error */}
      {dictationError && (
        <div className="sahayak-speech-input__error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{dictationError}</span>
        </div>
      )}

      {/* Active Dictation Live Indicator */}
      {isListening && (
        <div
          className="sahayak-speech-input__listening-badge"
          role="status"
          aria-live="polite"
        >
          <span className="sahayak-speech-input__pulse" aria-hidden="true" />
          <span>
            {isDoctor
              ? 'Listening in English... Speak clearly'
              : 'हिंदी में सुन रहे हैं... कृपया स्पष्ट बोलें'}
          </span>
        </div>
      )}

      {/* Main Input Area */}
      <div className="sahayak-speech-input__box">
        <label
          htmlFor={`sahayak-speech-textarea-${role}`}
          className="sahayak-speech-input__sr-label"
        >
          {isDoctor ? 'Doctor statement in English' : 'मरीज़ का संदेश (हिंदी में)'}
        </label>
        <textarea
          ref={textareaRef}
          id={`sahayak-speech-textarea-${role}`}
          className="sahayak-speech-input__textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (dictationError) setDictationError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isDoctor
              ? "Type doctor's statement in English or use dictation..."
              : 'यहाँ हिंदी में लिखें या बोलकर डिक्टेट करें...'
          }
          rows={2}
          disabled={isInputDisabled}
          aria-label={isDoctor ? 'Doctor statement in English' : 'मरीज़ का संदेश (हिंदी में)'}
        />

        <div className="sahayak-speech-input__actions">
          {/* Progressive Enhancement: Browser Dictation */}
          {isDictationSupported && (
            <button
              type="button"
              className={`sahayak-speech-input__btn sahayak-speech-input__btn--dictate ${
                isListening ? 'sahayak-speech-input__btn--listening' : ''
              } ${isMuted ? 'sahayak-speech-input__btn--muted' : ''}`}
              onClick={handleToggleDictation}
              disabled={isInputDisabled || isMuted}
              aria-pressed={isListening}
              title={
                isMuted
                  ? isDoctor
                    ? 'Microphone is muted from controls. Unmute to dictate.'
                    : 'माइक म्यूट है। डिक्टेट करने के लिए अनम्यूट करें।'
                  : isListening
                  ? isDoctor
                    ? 'Stop dictation'
                    : 'डिक्टेशन रोकें'
                  : isDoctor
                  ? 'Start voice dictation in English'
                  : 'हिंदी में वॉइस डिक्टेशन शुरू करें'
              }
              aria-label={
                isMuted
                  ? isDoctor
                    ? 'Microphone is muted. Unmute to dictate.'
                    : 'माइक म्यूट है। बोलने के लिए अनम्यूट करें।'
                  : isListening
                  ? isDoctor
                    ? 'Stop voice dictation'
                    : 'वॉइस डिक्टेशन रोकें'
                  : isDoctor
                  ? 'Start voice dictation in English'
                  : 'हिंदी में वॉइस डिक्टेशन शुरू करें'
              }
            >
              {isMuted ? (
                <MicOff size={18} aria-hidden="true" />
              ) : isListening ? (
                <MicOff size={18} aria-hidden="true" />
              ) : (
                <Mic size={18} aria-hidden="true" />
              )}
              <span className="sahayak-speech-input__btn-text">
                {isMuted
                  ? isDoctor
                    ? 'Muted'
                    : 'म्यूट'
                  : isListening
                  ? isDoctor
                    ? 'Stop'
                    : 'रोकें'
                  : isDoctor
                  ? 'Dictate'
                  : 'बोलें'}
              </span>
            </button>
          )}

          {/* Send Action */}
          <button
            type="button"
            className="sahayak-speech-input__btn sahayak-speech-input__btn--send"
            onClick={handleSend}
            disabled={isSendDisabled}
            aria-busy={isProcessing}
            aria-label={isDoctor ? 'Send doctor statement' : 'संदेश भेजें'}
          >
            <Send size={18} aria-hidden="true" />
            <span className="sahayak-speech-input__btn-text">
              {isProcessing
                ? isDoctor
                  ? 'Sending...'
                  : 'भेजा जा रहा है...'
                : isDoctor
                ? 'Send'
                : 'भेजें'}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};
