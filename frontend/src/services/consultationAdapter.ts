import type {
  ConnectionStatus,
  ConsultationSessionState,
  ConversationTurn,
  ConfirmationOutcome,
  LanguageCode,
  ParticipantRole,
  SystemActivityState,
  VerifiedFactItem,
} from '../types/consultation.ts';
import {
  sessionApi,
  getWebSocketUrl,
  type ParticipantResponse,
  type SessionResponse,
} from './sessionApi.ts';

function formatTimestamp(isoString?: string): string {
  if (!isoString) {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

export interface IConsultationAdapter {
  connect(sessionId: string, role: ParticipantRole, token?: string): Promise<void>;
  disconnect(): void;
  setMuted(muted: boolean): void;
  endConsultation(): Promise<void>;
  leaveConsultation(): Promise<void>;
  sendSpeech(text: string, confidenceData?: Record<string, number>): boolean;
  sendConfirmationResponse(turnId: string, response: string): boolean;
  subscribe(listener: (state: ConsultationSessionState) => void): () => void;
  getState(): ConsultationSessionState;
}

export class ConsultationAdapter implements IConsultationAdapter {
  private state: ConsultationSessionState;
  private listeners = new Set<(state: ConsultationSessionState) => void>();
  private ws: WebSocket | null = null;
  private role: ParticipantRole = 'doctor';
  private token?: string;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;

  constructor(sessionId: string, role: ParticipantRole) {
    this.role = role;
    this.state = {
      sessionId,
      status: 'loading',
      connectionStatus: 'connecting',
      activityState: 'idle',
      isFixture: false,
      liveAudioAvailable: false,
      doctor: {
        participantId: '',
        role: 'doctor',
        connectionStatus: 'waiting',
        isMuted: false,
      },
      patient: {
        participantId: '',
        role: 'patient',
        connectionStatus: 'waiting',
        isMuted: false,
      },
      currentTurn: null,
      turns: [], // Empty initially: no fake fixtures in real sessions
      isMuted: false,
      errorMessage: null,
      verifiedFacts: [],
      emergencyAlert: null,
      repetitionRequest: null,
    };
  }

  public getState(): ConsultationSessionState {
    return this.state;
  }

  public get currentRole(): ParticipantRole {
    return this.role;
  }

  public subscribe(listener: (state: ConsultationSessionState) => void): () => void {
    if (this.isDestroyed) return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private updateState(partial: Partial<ConsultationSessionState>): void {
    if (this.isDestroyed) return;
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  public async connect(sessionId: string, role: ParticipantRole, token?: string): Promise<void> {
    if (this.isDestroyed) return;
    this.role = role;
    this.token = token;

    // Reject missing access tokens honestly without falling back to simulation fixtures
    if (!token) {
      this.updateState({
        status: 'error',
        connectionStatus: 'disconnected',
        errorMessage:
          role === 'doctor'
            ? 'Access token missing. Please create and join the consultation from the preparation screen.'
            : 'सुरक्षा टोकन मौजूद नहीं है। कृपया तैयारी पृष्ठ से जुड़ें।',
      });
      return;
    }

    // 1. Fetch live session status and participants from REST API
    try {
      const sessionData = await sessionApi.getSession(sessionId, token);
      if (this.isDestroyed) return;

      this.applySessionResponse(sessionData);

      if (sessionData.status === 'ended') {
        this.updateState({
          status: 'ended',
          connectionStatus: 'disconnected',
        });
        return;
      }
    } catch (err: unknown) {
      if (this.isDestroyed) return;
      const message =
        err instanceof Error ? err.message : 'Unable to connect to consultation session.';
      this.updateState({
        status: 'error',
        connectionStatus: 'disconnected',
        errorMessage: message,
      });
      return;
    }

    // 2. Connect role-aware WebSocket
    this.connectWebSocket(sessionId, token);

    // 3. Start periodic session polling to update participant presence honestly
    this.startPresencePolling(sessionId, token);
  }

  private mapParticipantConnectionStatus(
    participant: ParticipantResponse | undefined
  ): ConnectionStatus {
    if (!participant) {
      return 'waiting';
    }
    // Match backend actual values: 'connected' | 'connecting' | 'disconnected'
    // An absent participant is 'waiting'. An existing participant who is disconnected must NOT be shown as waiting.
    if (participant.connection_status === 'connected') {
      return 'connected';
    }
    if (participant.connection_status === 'connecting') {
      return 'connecting';
    }
    return 'disconnected';
  }

  private applySessionResponse(sessionData: SessionResponse): void {
    const docParticipant = sessionData.participants.find((p) => p.role === 'doctor');
    const patParticipant = sessionData.participants.find((p) => p.role === 'patient');

    this.updateState({
      status: sessionData.status,
      doctor: {
        participantId: docParticipant?.participant_id || '',
        role: 'doctor',
        connectionStatus: this.mapParticipantConnectionStatus(docParticipant),
        microphoneStatus: docParticipant?.microphone_status || 'unknown',
        isMuted: docParticipant?.microphone_status === 'muted',
      },
      patient: {
        participantId: patParticipant?.participant_id || '',
        role: 'patient',
        connectionStatus: this.mapParticipantConnectionStatus(patParticipant),
        microphoneStatus: patParticipant?.microphone_status || 'unknown',
        isMuted: patParticipant?.microphone_status === 'muted',
      },
    });
  }

  private connectWebSocket(sessionId: string, token: string): void {
    if (this.isDestroyed) return;

    try {
      const wsUrl = getWebSocketUrl(sessionId, token);
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        if (this.isDestroyed) return;
        try {
          const data = JSON.parse(event.data);
          if (!data || typeof data !== 'object') return;

          const msgType = data.type;
          if (msgType === 'connected') {
            this.updateState({
              connectionStatus: 'connected',
              activityState: 'idle',
            });
            return;
          }

          if (msgType === 'ack') {
            return;
          }

          // Cross-session filtering: ignore if session_id does not match
          if (data.session_id && data.session_id !== this.state.sessionId) {
            return;
          }

          // Cross-role filtering: ignore if recipient_role does not match this participant's role
          if (data.recipient_role && data.recipient_role !== this.role) {
            return;
          }

          this.handleServerEvent(data);
        } catch {
          // Non-JSON ack or malformed message
        }
      };

      this.ws.onerror = () => {
        if (this.isDestroyed) return;
        this.updateState({
          connectionStatus: 'disconnected',
          errorMessage: 'WebSocket transport connection failed.',
        });
      };

      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        this.updateState({
          connectionStatus: 'disconnected',
        });
      };
    } catch {
      if (!this.isDestroyed) {
        this.updateState({
          connectionStatus: 'disconnected',
          errorMessage: 'Failed to establish WebSocket connection.',
        });
      }
    }
  }

  private startPresencePolling(sessionId: string, token: string): void {
    this.stopPresencePolling();
    this.pollIntervalId = setInterval(async () => {
      if (this.isDestroyed || this.state.status === 'ended') {
        this.stopPresencePolling();
        return;
      }
      try {
        const sessionData = await sessionApi.getSession(sessionId, token);
        if (this.isDestroyed) return;
        this.applySessionResponse(sessionData);
        if (sessionData.status === 'ended') {
          this.stopPresencePolling();
          this.disconnect();
          this.updateState({
            status: 'ended',
            connectionStatus: 'disconnected',
          });
        }
      } catch {
        // Polling failure, maintain current state
      }
    }, 5000);
  }

  private stopPresencePolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  public setMuted(muted: boolean): void {
    if (this.isDestroyed) return;
    this.updateState({ isMuted: muted });
  }

  public setActivityState(activity: SystemActivityState): void {
    if (this.isDestroyed) return;
    this.updateState({ activityState: activity });
  }

  /**
   * Doctor ends consultation via backend POST /api/sessions/{id}/end.
   * Only marks ended and disconnects after the backend confirms the end request.
   */
  public async endConsultation(): Promise<void> {
    if (this.isDestroyed) return;

    if (!this.token || this.role !== 'doctor') {
      const err = new Error('Only the doctor with an issued access token can end the consultation.');
      this.updateState({ errorMessage: err.message });
      throw err;
    }

    try {
      const endResponse = await sessionApi.endSession(this.state.sessionId, this.token);
      // Confirmed by backend
      this.stopPresencePolling();
      this.disconnect();
      this.updateState({
        status: endResponse.status || 'ended',
        connectionStatus: 'disconnected',
        activityState: 'idle',
        currentTurn: null,
        errorMessage: null,
      });
    } catch (err: unknown) {
      // On failure, preserve active session status and connection; do not disconnect
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to end consultation on server. Please try again.';
      this.updateState({
        errorMessage: message,
      });
      throw err;
    }
  }

  /**
   * Patient leaves consultation by disconnecting locally without ending the session.
   */
  public async leaveConsultation(): Promise<void> {
    if (this.isDestroyed) return;
    this.stopPresencePolling();
    this.disconnect();
    this.updateState({
      status: 'ended',
      connectionStatus: 'disconnected',
      activityState: 'idle',
      currentTurn: null,
    });
  }

  public sendSpeech(text: string, confidenceData?: Record<string, number>): boolean {
    if (this.isDestroyed || !this.ws || this.ws.readyState !== 1) {
      return false;
    }
    const payload: Record<string, any> = {
      type: 'speech',
      text,
    };
    if (confidenceData) {
      payload.confidence_data = confidenceData;
    }
    this.ws.send(JSON.stringify(payload));
    this.updateState({ activityState: 'processing', repetitionRequest: null });
    return true;
  }

  public sendConfirmationResponse(turnId: string, response: string): boolean {
    if (this.isDestroyed || !this.ws || this.ws.readyState !== 1) {
      return false;
    }
    const payload = {
      type: 'confirmation_response',
      turn_id: turnId,
      response,
    };
    this.ws.send(JSON.stringify(payload));

    const turnIndex = this.state.turns.findIndex((t) => t.id === turnId);
    if (turnIndex >= 0) {
      const prev = this.state.turns[turnIndex];
      const normalized = response.trim().toLowerCase();
      const isAffirmative =
        normalized.includes('yes') ||
        normalized.includes('haan') ||
        normalized.includes('ha') ||
        normalized === 'true' ||
        normalized.includes('confirm');
      const outcome: ConfirmationOutcome = isAffirmative ? 'confirmed' : 'rejected';
      const updatedTurn: ConversationTurn = {
        ...prev,
        confirmation: {
          ...(prev.confirmation || { promptText: '', responderRole: this.role }),
          outcome,
          userActionLabel: isAffirmative
            ? this.role === 'doctor'
              ? 'Confirmed by speaker'
              : 'पुष्टि की गई'
            : this.role === 'doctor'
            ? 'Clarified by speaker'
            : 'स्पष्ट किया गया',
        },
      };
      this.updateState({
        turns: this.state.turns.map((t, idx) => (idx === turnIndex ? updatedTurn : t)),
      });
    }
    return true;
  }

  private handleServerEvent(event: Record<string, any>): void {
    const eventType = event.type;

    switch (eventType) {
      case 'interpretation': {
        const turnId = String(event.turn_id || event.event_id || Date.now());
        const senderRole: ParticipantRole =
          event.sender_role === 'doctor' || event.sender_role === 'patient'
            ? event.sender_role
            : this.role === 'doctor'
            ? 'patient'
            : 'doctor';
        const sourceLanguage: LanguageCode = event.source_language || (senderRole === 'doctor' ? 'en' : 'hi');
        const targetLanguage: LanguageCode = event.target_language || (this.role === 'doctor' ? 'en' : 'hi');
        const text = String(event.text || '');
        const isVerified = Boolean(event.verified);
        const formattedTime = formatTimestamp(event.timestamp);

        const existingTurnIndex = this.state.turns.findIndex((t) => t.id === turnId);
        let updatedTurn: ConversationTurn;

        if (existingTurnIndex >= 0) {
          const prev = this.state.turns[existingTurnIndex];
          updatedTurn = {
            ...prev,
            translatedText: text,
            translatedLanguage: targetLanguage,
            status: 'completed',
            isVerified: isVerified || prev.isVerified,
          };
        } else {
          updatedTurn = {
            id: turnId,
            timestamp: formattedTime,
            speakerRole: senderRole,
            originalText: undefined, // Backend does not send source text to the recipient
            originalLanguage: sourceLanguage,
            translatedText: text,
            translatedLanguage: targetLanguage,
            status: 'completed',
            isVerified,
          };
        }

        const newTurns =
          existingTurnIndex >= 0
            ? this.state.turns.map((t, idx) => (idx === existingTurnIndex ? updatedTurn : t))
            : [...this.state.turns, updatedTurn];

        this.updateState({
          currentTurn: updatedTurn,
          turns: newTurns,
          activityState: 'idle',
          repetitionRequest: null,
        });
        break;
      }

      case 'confirmation_prompt': {
        const turnId = String(event.turn_id || '');
        const promptText = String(event.prompt_text || '');
        const category = event.category || null;
        const formattedTime = formatTimestamp(event.timestamp);

        const existingTurnIndex = this.state.turns.findIndex((t) => t.id === turnId);
        let turnToUpdate: ConversationTurn;

        if (existingTurnIndex >= 0) {
          const prev = this.state.turns[existingTurnIndex];
          turnToUpdate = {
            ...prev,
            confirmation: {
              promptText,
              outcome: 'pending',
              category,
              responderRole: this.role,
            },
          };
        } else {
          turnToUpdate = {
            id: turnId,
            timestamp: formattedTime,
            speakerRole: this.role,
            originalText: undefined,
            originalLanguage: this.role === 'doctor' ? 'en' : 'hi',
            status: 'translating',
            confirmation: {
              promptText,
              outcome: 'pending',
              category,
              responderRole: this.role,
            },
          };
        }

        const newTurns =
          existingTurnIndex >= 0
            ? this.state.turns.map((t, idx) => (idx === existingTurnIndex ? turnToUpdate : t))
            : [...this.state.turns, turnToUpdate];

        this.updateState({
          currentTurn: turnToUpdate,
          turns: newTurns,
          activityState: 'processing',
        });
        break;
      }

      case 'verified_fact': {
        const factId = String(event.fact_id || '');
        const turnId = String(event.turn_id || '');
        const category = String(event.category || '');
        const sourceWording = String(event.source_wording || '');
        const translatedWording = String(event.translated_wording || '');
        const formattedTime = formatTimestamp(event.timestamp);

        const newFact: VerifiedFactItem = {
          id: factId,
          turnId,
          category,
          sourceWording,
          translatedWording,
          timestamp: formattedTime,
        };

        const factExists = this.state.verifiedFacts.some((f) => f.id === factId);
        const updatedFacts = factExists
          ? this.state.verifiedFacts
          : [...this.state.verifiedFacts, newFact];

        const existingTurnIndex = this.state.turns.findIndex((t) => t.id === turnId);
        let newTurns = this.state.turns;

        if (existingTurnIndex >= 0) {
          const prev = this.state.turns[existingTurnIndex];
          const updatedTurn: ConversationTurn = {
            ...prev,
            originalText: sourceWording || prev.originalText,
            translatedText: translatedWording || prev.translatedText,
            isVerified: true,
            confirmation: {
              ...(prev.confirmation || { promptText: '', responderRole: 'patient' }),
              outcome: 'confirmed',
              userActionLabel: `Verified: ${category}`,
              category,
            },
          };
          newTurns = this.state.turns.map((t, idx) => (idx === existingTurnIndex ? updatedTurn : t));
        }

        this.updateState({
          verifiedFacts: updatedFacts,
          turns: newTurns,
          activityState: 'idle',
        });
        break;
      }

      case 'repetition_request': {
        const turnId = String(event.turn_id || '');
        const promptText = String(event.prompt_text || '');
        const formattedTime = formatTimestamp(event.timestamp);

        this.updateState({
          repetitionRequest: {
            promptText,
            turnId,
            timestamp: formattedTime,
          },
          activityState: 'listening',
        });
        break;
      }

      case 'emergency_alert': {
        const turnId = String(event.turn_id || '');
        const alertText = String(event.alert || event.instruction || '');
        const formattedTime = formatTimestamp(event.timestamp);

        this.updateState({
          emergencyAlert: {
            text: alertText,
            turnId,
            role: this.role,
            timestamp: formattedTime,
          },
          activityState: 'error',
        });
        break;
      }

      case 'system_event': {
        const turnId = String(event.turn_id || '');
        const outcome = String(event.outcome || '');
        const existingTurnIndex = this.state.turns.findIndex((t) => t.id === turnId);

        if (existingTurnIndex >= 0) {
          const prev = this.state.turns[existingTurnIndex];
          const updatedTurn: ConversationTurn = {
            ...prev,
            confirmation: {
              ...(prev.confirmation || { promptText: '', responderRole: this.role }),
              outcome: outcome === 'rejected' ? 'rejected' : 'unresolved',
              userActionLabel: `Clinical fact: ${outcome}`,
            },
          };
          this.updateState({
            turns: this.state.turns.map((t, idx) => (idx === existingTurnIndex ? updatedTurn : t)),
          });
        }
        break;
      }

      default:
        // Safely ignore unknown event types without throwing
        break;
    }
  }

  public disconnect(): void {
    this.stopPresencePolling();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
    this.listeners.clear();
  }
}
