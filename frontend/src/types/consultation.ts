/**
 * Types and data models for Phase 4 consultation room interfaces.
 * Aligned with backend schemas and domain models (FastAPI / WebSocket).
 */

export type ParticipantRole = 'doctor' | 'patient';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'waiting';

export type SessionStatus = 'created' | 'active' | 'paused' | 'ended' | 'error';

export type LanguageCode = 'en' | 'hi';

export type SystemActivityState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'playing'
  | 'reconnecting'
  | 'error';

export interface ParticipantInfo {
  participantId: string;
  role: ParticipantRole;
  connectionStatus: ConnectionStatus;
  isMuted: boolean;
}

export type ConfirmationOutcome =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'ambiguous'
  | 'unresolved';

export interface TurnConfirmation {
  promptText: string;
  outcome: ConfirmationOutcome;
  responderRole?: ParticipantRole;
  userActionLabel?: string;
}

export interface ConversationTurn {
  id: string;
  timestamp: string; // User-facing timestamp e.g. "10:32 AM"
  speakerRole: ParticipantRole;
  originalText: string;
  originalLanguage: LanguageCode;
  translatedText?: string;
  translatedLanguage?: LanguageCode;
  status: 'transcribing' | 'translating' | 'completed' | 'failed';
  confirmation?: TurnConfirmation;
}

export interface ConsultationSessionState {
  sessionId: string;
  status: SessionStatus;
  activityState: SystemActivityState;
  isFixture: boolean; // True when running on development fixtures
  fixtureNotice?: string;
  doctor: ParticipantInfo;
  patient: ParticipantInfo;
  currentTurn?: ConversationTurn | null;
  turns: ConversationTurn[];
  isMuted: boolean;
  errorMessage?: string | null;
}
