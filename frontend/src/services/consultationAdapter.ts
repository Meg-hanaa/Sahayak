import type {
  ConnectionStatus,
  ConsultationSessionState,
  ParticipantRole,
  SystemActivityState,
} from '../types/consultation.ts';
import {
  sessionApi,
  getWebSocketUrl,
  type ParticipantResponse,
  type SessionResponse,
} from './sessionApi.ts';

export interface IConsultationAdapter {
  connect(sessionId: string, role: ParticipantRole, token?: string): Promise<void>;
  disconnect(): void;
  setMuted(muted: boolean): void;
  endConsultation(): Promise<void>;
  leaveConsultation(): Promise<void>;
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
          if (data.type === 'connected') {
            this.updateState({
              connectionStatus: 'connected',
              activityState: 'idle',
            });
          }
        } catch {
          // Non-JSON ack or message
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
