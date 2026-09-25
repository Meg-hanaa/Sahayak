import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { SpeakerCheckController } from '../controllers/SpeakerCheckController.ts';
import type {
  SpeakerStatus,
  SpeakerErrorCode,
  SpeakerCheckState,
} from '../controllers/SpeakerCheckController.ts';

export type { SpeakerStatus, SpeakerErrorCode, SpeakerCheckState };

export interface UseSpeakerCheckReturn {
  status: SpeakerStatus;
  errorCode: SpeakerErrorCode | null;
  errorMessage: string | null;
  playTestSound: () => Promise<void>;
  stopCheck: () => void;
  confirmHeard: (heard: boolean) => void;
  resetCheck: () => void;
}

export function useSpeakerCheck(): UseSpeakerCheckReturn {
  const [controller] = useState(() => new SpeakerCheckController());

  const state = useSyncExternalStore(
    useCallback((cb) => controller.subscribe(cb), [controller]),
    useCallback(() => controller.getState(), [controller])
  );

  useEffect(() => {
    return () => {
      // Cancels active playback and releases AudioContext, GainNode, and Oscillators
      // without permanently destroying the controller instance across StrictMode cycles
      controller.cleanup();
    };
  }, [controller]);

  return {
    ...state,
    playTestSound: useCallback(() => controller.playTestSound(), [controller]),
    stopCheck: useCallback(() => controller.stopCheck(), [controller]),
    confirmHeard: useCallback((heard: boolean) => controller.confirmHeard(heard), [controller]),
    resetCheck: useCallback(() => controller.resetCheck(), [controller]),
  };
}
