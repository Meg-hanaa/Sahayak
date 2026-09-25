import React from 'react';
import { Check, Circle, AlertCircle, Clock } from 'lucide-react';
import { MicrophoneStatus } from '../hooks/useMicrophoneCheck';
import { SpeakerStatus } from '../hooks/useSpeakerCheck';
import './PreparationChecklist.css';

export interface PreparationChecklistProps {
  micStatus: MicrophoneStatus;
  speakerStatus: SpeakerStatus;
  language?: 'en' | 'hi';
}

export const PreparationChecklist: React.FC<PreparationChecklistProps> = ({
  micStatus,
  speakerStatus,
  language = 'en',
}) => {
  const isHindi = language === 'hi';

  const isMicPassed = micStatus === 'sound_detected';
  const isMicFailed = ['denied', 'no_device', 'error', 'unsupported', 'no_sound_detected'].includes(micStatus);
  const isMicActive = ['requesting', 'listening'].includes(micStatus);

  const isSpeakerPassed = speakerStatus === 'passed';
  const isSpeakerFailed = ['failed', 'error'].includes(speakerStatus);
  const isSpeakerActive = ['playing', 'confirming'].includes(speakerStatus);

  const completedCount = (isMicPassed ? 1 : 0) + (isSpeakerPassed ? 1 : 0);
  const allPassed = isMicPassed && isSpeakerPassed;

  const strings = {
    title: isHindi ? 'ऑडियो तैयारी सूची' : 'Audio checklist',
    summary: isHindi
      ? `${completedCount}/2 जाँच पूरी`
      : `${completedCount} of 2 completed`,
    micLabel: isHindi ? 'माइक्रोफ़ोन इनपुट' : 'Microphone input',
    speakerLabel: isHindi ? 'स्पीकर आउटपुट' : 'Speaker output',
    readyNotice: isHindi
      ? 'दोनों ऑडियो जाँच पूरी हो चुकी हैं।'
      : 'Both audio checks have completed.',
    pendingNotice: isHindi
      ? 'परामर्श से पहले दोनों परीक्षण पूरे करें।'
      : 'Complete both checks before starting the consultation.',
    status: {
      passed: isHindi ? 'पूरा हुआ' : 'Ready',
      checking: isHindi ? 'जाँच जारी...' : 'Checking...',
      pending: isHindi ? 'बाकी है' : 'Pending',
      issue: isHindi ? 'पुनः प्रयास करें' : 'Action needed',
    },
  };

  const renderStatusBadge = (passed: boolean, active: boolean, failed: boolean) => {
    if (passed) {
      return (
        <span className="sahayak-checklist-badge sahayak-checklist-badge--completed">
          <Check size={14} aria-hidden="true" />
          <span>{strings.status.passed}</span>
        </span>
      );
    }
    if (active) {
      return (
        <span className="sahayak-checklist-badge sahayak-checklist-badge--active">
          <Clock size={14} aria-hidden="true" />
          <span>{strings.status.checking}</span>
        </span>
      );
    }
    if (failed) {
      return (
        <span className="sahayak-checklist-badge sahayak-checklist-badge--failed">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{strings.status.issue}</span>
        </span>
      );
    }
    return (
      <span className="sahayak-checklist-badge sahayak-checklist-badge--idle">
        <Circle size={14} aria-hidden="true" />
        <span>{strings.status.pending}</span>
      </span>
    );
  };

  return (
    <div
      className={`sahayak-checklist-card ${allPassed ? 'sahayak-checklist-card--completed' : ''} ${isHindi ? 'sahayak-lang-hi' : ''}`}
      aria-label={strings.title}
      lang={isHindi ? 'hi' : 'en'}
    >
      <div className="sahayak-checklist-card__header">
        <h3 className="sahayak-checklist-card__title">{strings.title}</h3>
        <span className="sahayak-checklist-card__summary">{strings.summary}</span>
      </div>

      <ul className="sahayak-checklist-list" role="list">
        <li className={`sahayak-checklist-item ${isMicPassed ? 'sahayak-checklist-item--completed' : ''}`}>
          <span className="sahayak-checklist-item__name">{strings.micLabel}</span>
          {renderStatusBadge(isMicPassed, isMicActive, isMicFailed)}
        </li>
        <li className={`sahayak-checklist-item ${isSpeakerPassed ? 'sahayak-checklist-item--completed' : ''}`}>
          <span className="sahayak-checklist-item__name">{strings.speakerLabel}</span>
          {renderStatusBadge(isSpeakerPassed, isSpeakerActive, isSpeakerFailed)}
        </li>
      </ul>

      <p className="sahayak-checklist-card__notice">
        {allPassed ? strings.readyNotice : strings.pendingNotice}
      </p>
    </div>
  );
};
