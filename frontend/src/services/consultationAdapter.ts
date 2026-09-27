import type {
  ConsultationSessionState,
  ParticipantRole,
  SystemActivityState,
} from '../types/consultation.ts';
import {
  createFixtureSession,
  FIXTURE_DOCTOR_NOTICE,
  FIXTURE_PATIENT_NOTICE,
} from './consultationFixtures.ts';

export interface IConsultationAdapter {
  connect(sessionId: string, role: ParticipantRole, token?: string): Promise<void>;
  disconnect(): void;
  setMuted(muted: boolean): void;
  endConsultation(): Promise<void>;
  subscribe(listener: (state: ConsultationSessionState) => void): () => void;
  getState(): ConsultationSessionState;
}

export class ConsultationAdapter implements IConsultationAdapter {
  private state: ConsultationSessionState;
  private listeners = new Set<(state: ConsultationSessionState) => void>();
  private ws: WebSocket | null = null;
  private role: ParticipantRole = 'doctor';
  private token?: string;
  private isDestroyed = false;

  constructor(sessionId: string, role: ParticipantRole) {
    this.role = role;
    this.state = createFixtureSession(sessionId, role);
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

    // Check if live backend is available via REST check
    if (token) {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok && !this.isDestroyed) {
          const sessionData = await response.json();
          // Real connected session from backend
          this.updateState({
            sessionId,
            status: sessionData.status || 'active',
            isFixture: false,
            fixtureNotice: undefined,
            activityState: 'idle',
          });

          // Connect role-aware WebSocket
          this.connectWebSocket(sessionId, token);
          return;
        }
      } catch {
        // Network or server unavailable; fall through to fixture mode
      }
    }

    // Fixture Mode with explicit label
    if (!this.isDestroyed) {
      this.updateState({
        sessionId,
        status: 'active',
        isFixture: true,
        fixtureNotice: role === 'doctor' ? FIXTURE_DOCTOR_NOTICE : FIXTURE_PATIENT_NOTICE,
        activityState: 'idle',
      });
    }
  }

  private connectWebSocket(sessionId: string, token: string): void {
    if (this.isDestroyed) return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/sessions/${sessionId}?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        if (this.isDestroyed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            this.updateState({
              activityState: 'idle',
            });
          }
        } catch {
          // Non-JSON message
        }
      };

      this.ws.onerror = () => {
        if (this.isDestroyed) return;
        this.updateState({
          activityState: 'error',
          errorMessage: 'Connection to consultation server failed.',
        });
      };

      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.state.status === 'active') {
          this.updateState({
            activityState: 'reconnecting',
          });
        }
      };
    } catch {
      // WebSocket creation failed
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

  public async endConsultation(): Promise<void> {
    if (this.isDestroyed) return;

    if (!this.state.isFixture && this.token) {
      try {
        await fetch(`/api/sessions/${this.state.sessionId}/end`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });
      } catch {
        // ignore network error on ending
      }
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.updateState({
      status: 'ended',
      activityState: 'idle',
      currentTurn: null,
    });
  }

  public disconnect(): void {
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
