/**
 * Types and data models for Phase 4 consultation room interfaces.
 * Aligned with backend schemas and domain models (FastAPI / WebSocket).
 */

export type ParticipantRole = 'doctor' | 'patient';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'waiting' | 'connecting' | 'error';

export type SessionStatus = 'created' | 'ready' | 'active' | 'paused' | 'ended' | 'error' | 'loading';

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
  connectionStatus: ConnectionStatus;
  activityState: SystemActivityState;
  isFixture: boolean; // True only when running explicit development preview fixtures
  fixtureNotice?: string;
  liveAudioAvailable: boolean; // False because current backend does not support audio streaming
  doctor: ParticipantInfo;
  patient: ParticipantInfo;
  currentTurn?: ConversationTurn | null;
  turns: ConversationTurn[];
  isMuted: boolean;
  errorMessage?: string | null;
}
