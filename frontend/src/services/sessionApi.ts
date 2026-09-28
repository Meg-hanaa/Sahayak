/**
 * Backend Session Lifecycle API Client
 * Verified against FastAPI routes in backend/sahayak/api/sessions.py
 * and domain models in backend/sahayak/domain/enums.py
 */

import type { SessionRecordResponse } from '../types/record.ts';

export type BackendConnectionStatus = 'connected' | 'connecting' | 'disconnected';
export type BackendMicrophoneStatus = 'unknown' | 'granted' | 'blocked' | 'muted';

export interface ParticipantResponse {
  participant_id: string;
  role: 'doctor' | 'patient';
  connection_status: BackendConnectionStatus;
  microphone_status: BackendMicrophoneStatus;
}

export interface SessionResponse {
  session_id: string;
  status: 'created' | 'ready' | 'active' | 'ended';
  created_at: string;
  doctor_language: string;
  patient_language: string;
  retention_expires_at: string;
  participants: ParticipantResponse[];
}

export interface AccessTokenResponse {
  role: 'doctor' | 'patient';
  token: string;
  expires_at: string;
}

export interface CreateSessionResponse {
  session: SessionResponse;
  access: {
    doctor: AccessTokenResponse;
    patient: AccessTokenResponse;
  };
}

export interface JoinSessionRequest {
  token: string;
  role?: 'doctor' | 'patient';
  microphone_status?: BackendMicrophoneStatus;
}

export interface JoinSessionResponse {
  session: SessionResponse;
  participant: ParticipantResponse;
}

export interface ApiErrorResponse {
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class SessionApiError extends Error {
  public code: string;
  public status: number;

  constructor(message: string, code: string = 'api_error', status: number = 0) {
    super(message);
    this.name = 'SessionApiError';
    this.code = code;
    this.status = status;
  }
}

export const getApiBaseUrl = (): string => {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  return '';
};

export const getWebSocketUrl = (sessionId: string, token: string): string => {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL;
  if (envUrl) {
    const wsBase = envUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    return `${wsBase}/ws/sessions/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/sessions/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
  }
  return `ws://localhost:8000/ws/sessions/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
    let errorCode = 'http_error';
    try {
      const data = (await res.json()) as ApiErrorResponse;
      if (data?.error?.message) {
        errorMessage = data.error.message;
      }
      if (data?.error?.code) {
        errorCode = data.error.code;
      }
    } catch {
      // response was not JSON
    }
    throw new SessionApiError(errorMessage, errorCode, res.status);
  }
  return res.json() as Promise<T>;
}

export const sessionApi = {
  /**
   * Create a new consultation session.
   * Route: POST /api/sessions
   */
  async createSession(): Promise<CreateSessionResponse> {
    const res = await fetch(`${getApiBaseUrl()}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<CreateSessionResponse>(res);
  },

  /**
   * Join an existing consultation session using an issued access token.
   * Route: POST /api/sessions/{sessionId}/join
   */
  async joinSession(
    sessionId: string,
    payload: JoinSessionRequest
  ): Promise<JoinSessionResponse> {
    const res = await fetch(`${getApiBaseUrl()}/api/sessions/${encodeURIComponent(sessionId)}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<JoinSessionResponse>(res);
  },

  /**
   * Retrieve session state using an issued access token.
   * Route: GET /api/sessions/{sessionId}
   */
  async getSession(sessionId: string, token: string): Promise<SessionResponse> {
    const res = await fetch(`${getApiBaseUrl()}/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse<SessionResponse>(res);
  },

  /**
   * End a consultation session (Doctor only).
   * Route: POST /api/sessions/{sessionId}/end
   */
  async endSession(sessionId: string, token: string): Promise<SessionResponse> {
    const res = await fetch(`${getApiBaseUrl()}/api/sessions/${encodeURIComponent(sessionId)}/end`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse<SessionResponse>(res);
  },

  /**
   * Retrieve the final bilingual session record for an authorized session.
   * Route: GET /api/sessions/{sessionId}/record
   */
  async getSessionRecord(sessionId: string, token: string): Promise<SessionRecordResponse> {
    const res = await fetch(`${getApiBaseUrl()}/api/sessions/${encodeURIComponent(sessionId)}/record`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse<SessionRecordResponse>(res);
  },
};

