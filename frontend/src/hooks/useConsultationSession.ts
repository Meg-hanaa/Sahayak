import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { ConsultationAdapter } from '../services/consultationAdapter.ts';
import type {
  ConsultationSessionState,
  ParticipantRole,
  SystemActivityState,
} from '../types/consultation.ts';

export interface UseConsultationSessionReturn extends ConsultationSessionState {
  setMuted: (muted: boolean) => void;
  setActivityState: (activity: SystemActivityState) => void;
  endConsultation: () => Promise<void>;
}

export function useConsultationSession(
  sessionId: string,
  role: ParticipantRole,
  token?: string
): UseConsultationSessionReturn {
  const [adapter] = useState(() => new ConsultationAdapter(sessionId, role));

  const state = useSyncExternalStore(
    useCallback((cb) => adapter.subscribe(cb), [adapter]),
    useCallback(() => adapter.getState(), [adapter])
  );

  useEffect(() => {
    adapter.connect(sessionId, role, token);
    return () => {
      // Disconnect active sockets/streams without destroying instance across StrictMode
      adapter.disconnect();
    };
  }, [adapter, sessionId, role, token]);

  const setMuted = useCallback(
    (muted: boolean) => {
      adapter.setMuted(muted);
    },
    [adapter]
  );

  const setActivityState = useCallback(
    (activity: SystemActivityState) => {
      adapter.setActivityState(activity);
    },
    [adapter]
  );

  const endConsultation = useCallback(async () => {
    await adapter.endConsultation();
  }, [adapter]);

  return {
    ...state,
    setMuted,
    setActivityState,
    endConsultation,
  };
}
