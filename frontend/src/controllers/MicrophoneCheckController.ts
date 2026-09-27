/**
 * Production Microphone Check Controller
 * Encapsulates hardware lifecycle, dedicated resource ownership, cancellation across
 * async boundaries, and subscriber notifications without React-specific dependencies.
 */

export type MicrophoneStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'sound_detected'
  | 'no_sound_detected'
  | 'denied'
  | 'no_device'
  | 'error'
  | 'unsupported';

export type MicrophoneErrorCode =
  | 'insecure_context'
  | 'not_supported'
  | 'permission_denied'
  | 'no_device'
  | 'in_use'
  | 'unknown';

export interface MicrophoneCheckState {
  status: MicrophoneStatus;
  audioLevel: number;
  lastReading: number | null;
  errorCode: MicrophoneErrorCode | null;
  errorMessage: string | null;
}

export interface MicOperationResources {
  id: number;
  stream: MediaStream | null;
  audioCtx: AudioContext | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  animationFrame: number | null;
  timeout: ReturnType<typeof setTimeout> | null;
  cleanedUp: boolean;
}

export class MicrophoneCheckController {
  private state: MicrophoneCheckState = {
    status: 'idle',
    audioLevel: 0,
    lastReading: null,
    errorCode: null,
    errorMessage: null,
  };

  private listeners = new Set<(state: MicrophoneCheckState) => void>();
  private operationId = 0;
  private activeOp: MicOperationResources | null = null;
  public isDestroyed = false;

  public get isDisposed(): boolean {
    return this.isDestroyed;
  }

  // Shared hardware references for inspection
  public currentStream: MediaStream | null = null;
  public currentAudioContext: AudioContext | null = null;

  public getState(): MicrophoneCheckState {
    return this.state;
  }

  public subscribe(listener: (state: MicrophoneCheckState) => void): () => void {
    if (this.isDestroyed) {
      return () => {};
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private updateState(partial: Partial<MicrophoneCheckState>) {
    if (this.isDestroyed) {
      return;
    }
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  public cleanupOperation(op: MicOperationResources | null) {
    if (!op) return;
    op.cleanedUp = true;

    if (op.animationFrame !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(op.animationFrame);
      }
      op.animationFrame = null;
    }

    if (op.timeout !== null) {
      clearTimeout(op.timeout);
      op.timeout = null;
    }

    // Clear shared references only if they refer to this specific operation
    if (this.currentStream === op.stream) {
      this.currentStream = null;
    }
    if (this.currentAudioContext === op.audioCtx) {
      this.currentAudioContext = null;
    }

    if (op.stream) {
      try {
        op.stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
      op.stream = null;
    }

    if (op.source) {
      try {
        op.source.disconnect();
      } catch {
        // ignore
      }
      op.source = null;
    }

    if (op.analyser) {
      try {
        op.analyser.disconnect();
      } catch {
        // ignore
      }
      op.analyser = null;
    }

    if (op.audioCtx && op.audioCtx.state !== 'closed') {
      try {
        op.audioCtx.close().catch(() => {});
      } catch {
        // ignore
      }
      op.audioCtx = null;
    }
  }

  /**
   * Cancels any active operation and releases all hardware resources
   * (streams, audio contexts, timers, animation frames) without permanently destroying the controller.
   * Compatible with repeated effect setup and cleanup in React StrictMode.
   */
  public cleanup(): void {
    this.operationId += 1;
    if (this.activeOp) {
      this.cleanupOperation(this.activeOp);
      this.activeOp = null;
    }
    if (!this.isDestroyed) {
      this.updateState({
        status: 'idle',
        audioLevel: 0,
      });
    }
  }

  public stopCheck(): void {
    if (this.isDestroyed) return;
    this.cleanup();
  }

  public resetCheck(): void {
    if (this.isDestroyed) return;
    this.operationId += 1;
    if (this.activeOp) {
      this.cleanupOperation(this.activeOp);
      this.activeOp = null;
    }
    this.updateState({
      status: 'idle',
      audioLevel: 0,
      lastReading: null,
      errorCode: null,
      errorMessage: null,
    });
  }

  public async startCheck(): Promise<void> {
    // Prevent operations on an actually disposed controller from requesting hardware or changing state
    if (this.isDestroyed) {
      return;
    }

    const currentOpId = ++this.operationId;
    if (this.activeOp) {
      this.cleanupOperation(this.activeOp);
      this.activeOp = null;
    }

    const op: MicOperationResources = {
      id: currentOpId,
      stream: null,
      audioCtx: null,
      source: null,
      analyser: null,
      animationFrame: null,
      timeout: null,
      cleanedUp: false,
    };
    this.activeOp = op;

    // Establishing a new check resets any retained readings immediately
    this.updateState({
      lastReading: null,
      audioLevel: 0,
      errorCode: null,
      errorMessage: null,
    });

    // Insecure context check
    if (typeof window !== 'undefined') {
      const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
      if (!window.isSecureContext && !isLocalhost) {
        this.updateState({
          status: 'unsupported',
          errorCode: 'insecure_context',
          errorMessage: 'Microphone check requires a secure connection (HTTPS) or localhost.',
        });
        return;
      }
    }

    // MediaDevices check
    if (
      typeof window === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      this.updateState({
        status: 'unsupported',
        errorCode: 'not_supported',
        errorMessage: 'Microphone access is not supported by this browser.',
      });
      return;
    }

    this.updateState({ status: 'requesting' });

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      op.stream = stream;

      // Invalidation check after async getUserMedia resolves:
      // If superseded by a newer operation or cleaned up/destroyed, stop tracks immediately
      // and do NOT modify active state or touch newer operations!
      if (currentOpId !== this.operationId || this.isDestroyed) {
        if (stream) {
          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch {
            // ignore
          }
        }
        this.cleanupOperation(op);
        return;
      }

      this.currentStream = stream;

      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) {
        this.cleanupOperation(op);
        this.updateState({
          status: 'unsupported',
          errorCode: 'not_supported',
          errorMessage: 'Web Audio API is not supported in this browser.',
        });
        return;
      }

      const audioCtx = new AudioCtxClass();
      op.audioCtx = audioCtx;
      this.currentAudioContext = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Invalidation check after async audioCtx.resume resolves
      if (currentOpId !== this.operationId || this.isDestroyed) {
        if (audioCtx && audioCtx.state !== 'closed') {
          try {
            audioCtx.close().catch(() => {});
          } catch {
            // ignore
          }
        }
        this.cleanupOperation(op);
        return;
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      op.analyser = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      op.source = source;
      source.connect(analyser);

      this.updateState({ status: 'listening' });

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let detectedCount = 0;

      // 7-second timeout for sound detection
      op.timeout = setTimeout(() => {
        if (currentOpId !== this.operationId || this.isDestroyed) {
          return;
        }
        this.cleanupOperation(op);
        this.updateState({
          status: 'no_sound_detected',
          audioLevel: 0,
        });
      }, 7000);

      const checkAudio = () => {
        if (currentOpId !== this.operationId || this.isDestroyed) {
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 110) * 100));

        this.updateState({ audioLevel: normalized });

        if (normalized >= 12) {
          detectedCount += 1;
          if (detectedCount >= 2) {
            // Successful detection: stop tracks immediately, release AudioContext, update status
            this.cleanupOperation(op);
            this.updateState({
              status: 'sound_detected',
              lastReading: normalized,
              audioLevel: 0,
            });
            return;
          }
        } else {
          detectedCount = Math.max(0, detectedCount - 1);
        }

        if (typeof requestAnimationFrame === 'function') {
          op.animationFrame = requestAnimationFrame(checkAudio);
        }
      };

      if (typeof requestAnimationFrame === 'function') {
        op.animationFrame = requestAnimationFrame(checkAudio);
      }
    } catch (err: unknown) {
      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
      }
      // Guarantee any opened AudioContext is closed on error
      this.cleanupOperation(op);

      if (currentOpId !== this.operationId || this.isDestroyed) {
        return;
      }

      this.updateState({ audioLevel: 0 });

      const error = err as { name?: string; message?: string };
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        this.updateState({
          status: 'denied',
          errorCode: 'permission_denied',
          errorMessage: 'Microphone permission was denied. Please allow microphone access in your browser settings.',
        });
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        this.updateState({
          status: 'no_device',
          errorCode: 'no_device',
          errorMessage: 'No microphone was found on this device. Please connect a microphone or headset.',
        });
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        this.updateState({
          status: 'error',
          errorCode: 'in_use',
          errorMessage: 'Microphone is currently unavailable or being used by another application.',
        });
      } else {
        this.updateState({
          status: 'error',
          errorCode: 'unknown',
          errorMessage: error.message || 'An unexpected error occurred while accessing your microphone.',
        });
      }
    }
  }

  /**
   * Permanently disposes the controller instance.
   * Once disposed, the controller can no longer start operations or change state.
   */
  public destroy(): void {
    this.cleanup();
    this.isDestroyed = true;
    this.listeners.clear();
  }
}
