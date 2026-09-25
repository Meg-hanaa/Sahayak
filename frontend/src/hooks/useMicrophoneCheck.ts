import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { MicrophoneCheckController } from '../controllers/MicrophoneCheckController.ts';
import type {
  MicrophoneStatus,
  MicrophoneErrorCode,
  MicrophoneCheckState,
} from '../controllers/MicrophoneCheckController.ts';

export type { MicrophoneStatus, MicrophoneErrorCode, MicrophoneCheckState };

export interface UseMicrophoneCheckReturn {
  status: MicrophoneStatus;
  audioLevel: number;
  lastReading: number | null;
  errorCode: MicrophoneErrorCode | null;
  errorMessage: string | null;
  startCheck: () => Promise<void>;
  stopCheck: () => void;
  resetCheck: () => void;
}

export function useMicrophoneCheck(): UseMicrophoneCheckReturn {
  const [controller] = useState(() => new MicrophoneCheckController());

  const state = useSyncExternalStore(
    useCallback((cb) => controller.subscribe(cb), [controller]),
    useCallback(() => controller.getState(), [controller])
  );

  useEffect(() => {
    return () => {
      // Cancels active operations and releases streams, audio contexts, timers,
      // and animation frames without permanently destroying the controller instance across StrictMode cycles
      controller.cleanup();
    };
  }, [controller]);

  return {
    ...state,
    startCheck: useCallback(() => controller.startCheck(), [controller]),
    stopCheck: useCallback(() => controller.stopCheck(), [controller]),
    resetCheck: useCallback(() => controller.resetCheck(), [controller]),
  };
}
