/**
 * Types and data models for Phase 4 consultation room interfaces.
 * Aligned with backend schemas and domain models (FastAPI / WebSocket).
 */

export type ParticipantRole = 'doctor' | 'patient';

/**
 * Participant connection status:
 * - 'connected': Participant has an active authenticated connection.
 * - 'connecting': Participant socket is currently establishing connection.
 * - 'disconnected': Participant exists in session but has disconnected.
 * - 'waiting': Participant is absent and has not joined the session yet.
 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'waiting';

export type SessionStatus = 'created' | 'ready' | 'active' | 'paused' | 'ended' | 'error' | 'loading';

export type LanguageCode = 'en' | 'hi';

/**
 * Backend-verified microphone status enum:
 * 'unknown' | 'granted' | 'blocked' | 'muted'
 */
export type BackendMicrophoneStatus = 'unknown' | 'granted' | 'blocked' | 'muted';

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
  microphoneStatus?: BackendMicrophoneStatus;
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
  category?: string | null;
}

export interface ConversationTurn {
  id: string;
  timestamp: string; // User-facing timestamp e.g. "10:32 AM"
  speakerRole: ParticipantRole;
  originalText?: string;
  originalLanguage?: LanguageCode;
  translatedText?: string;
  translatedLanguage?: LanguageCode;
  status: 'transcribing' | 'translating' | 'completed' | 'failed';
  confirmation?: TurnConfirmation;
  isVerified?: boolean;
}

export interface VerifiedFactItem {
  id: string;
  factId?: string;
  turnId: string;
  category: string;
  sourceWording: string;
  translatedWording: string;
  timestamp: string;
}

export interface EmergencyAlertItem {
  text: string;
  turnId: string;
  role: ParticipantRole;
  timestamp: string;
}

export interface RepetitionRequestItem {
  promptText: string;
  turnId: string;
  timestamp: string;
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
  verifiedFacts: VerifiedFactItem[];
  emergencyAlert?: EmergencyAlertItem | null;
  repetitionRequest?: RepetitionRequestItem | null;
}

export * from './record.ts';

