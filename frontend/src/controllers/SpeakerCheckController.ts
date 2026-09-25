/**
 * Production Speaker Check Controller
 * Encapsulates playback lifecycle, dedicated oscillator and context ownership,
 * cancellation while playing/resuming, and explicit user confirmation.
 */

export type SpeakerStatus =
  | 'idle'
  | 'playing'
  | 'confirming'
  | 'passed'
  | 'failed'
  | 'error';

export type SpeakerErrorCode =
  | 'not_supported'
  | 'playback_failed'
  | 'unknown';

export interface SpeakerCheckState {
  status: SpeakerStatus;
  errorCode: SpeakerErrorCode | null;
  errorMessage: string | null;
}

export interface SpeakerOperationResources {
  id: number;
  audioCtx: AudioContext | null;
  gain: GainNode | null;
  osc1: OscillatorNode | null;
  osc2: OscillatorNode | null;
  cleanedUp: boolean;
}

export class SpeakerCheckController {
  private state: SpeakerCheckState = {
    status: 'idle',
    errorCode: null,
    errorMessage: null,
  };

  private listeners = new Set<(state: SpeakerCheckState) => void>();
  private operationId = 0;
  private activeOp: SpeakerOperationResources | null = null;
  public isDestroyed = false;

  public get isDisposed(): boolean {
    return this.isDestroyed;
  }

  public currentAudioContext: AudioContext | null = null;

  public getState(): SpeakerCheckState {
    return this.state;
  }

  public subscribe(listener: (state: SpeakerCheckState) => void): () => void {
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

  private updateState(partial: Partial<SpeakerCheckState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  public cleanupOperation(op: SpeakerOperationResources | null) {
    if (!op) return;
    op.cleanedUp = true;

    if (this.currentAudioContext === op.audioCtx) {
      this.currentAudioContext = null;
    }

    if (op.osc1) {
      try {
        op.osc1.onended = null;
        op.osc1.stop();
        op.osc1.disconnect();
      } catch {
        // ignore
      }
      op.osc1 = null;
    }

    if (op.osc2) {
      try {
        op.osc2.onended = null;
        op.osc2.stop();
        op.osc2.disconnect();
      } catch {
        // ignore
      }
      op.osc2 = null;
    }

    if (op.gain) {
      try {
        op.gain.disconnect();
      } catch {
        // ignore
      }
      op.gain = null;
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
   * Cancels active playback and releases AudioContext, GainNode, and Oscillators
   * without permanently destroying the controller.
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
      errorCode: null,
      errorMessage: null,
    });
  }

  public confirmHeard(heard: boolean): void {
    if (this.isDestroyed) return;
    this.updateState({
      status: heard ? 'passed' : 'failed',
    });
  }

  public async playTestSound(): Promise<void> {
    // Prevent operations on an actually disposed controller from requesting hardware or changing state
    if (this.isDestroyed) {
      return;
    }

    const currentOpId = ++this.operationId;
    if (this.activeOp) {
      this.cleanupOperation(this.activeOp);
      this.activeOp = null;
    }

    const op: SpeakerOperationResources = {
      id: currentOpId,
      audioCtx: null,
      gain: null,
      osc1: null,
      osc2: null,
      cleanedUp: false,
    };
    this.activeOp = op;

    this.updateState({
      status: 'playing',
      errorCode: null,
      errorMessage: null,
    });

    let audioCtx: AudioContext | null = null;
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) {
        this.cleanupOperation(op);
        this.updateState({
          status: 'error',
          errorCode: 'not_supported',
          errorMessage: 'Web Audio API is not supported in this browser.',
        });
        return;
      }

      audioCtx = new AudioCtxClass();
      op.audioCtx = audioCtx;
      this.currentAudioContext = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Check validity after async resume
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

      const now = audioCtx.currentTime;

      // Master gain node for gentle healthcare chime
      const masterGain = audioCtx.createGain();
      op.gain = masterGain;
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.connect(audioCtx.destination);

      const osc1 = audioCtx.createOscillator();
      op.osc1 = osc1;
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.connect(masterGain);

      const osc2 = audioCtx.createOscillator();
      op.osc2 = osc2;
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.3);
      osc2.connect(masterGain);

      masterGain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      masterGain.gain.setValueAtTime(0.001, now + 0.3);
      masterGain.gain.exponentialRampToValueAtTime(0.14, now + 0.35);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

      osc1.start(now);
      osc1.stop(now + 0.3);
      osc2.start(now + 0.3);
      osc2.stop(now + 0.75);

      osc2.onended = () => {
        if (currentOpId !== this.operationId || this.isDestroyed) {
          this.cleanupOperation(op);
          return;
        }
        this.cleanupOperation(op);
        this.updateState({ status: 'confirming' });
      };
    } catch (err: unknown) {
      if (audioCtx && audioCtx.state !== 'closed') {
        try {
          audioCtx.close().catch(() => {});
        } catch {
          // ignore
        }
      }
      this.cleanupOperation(op);

      if (currentOpId !== this.operationId || this.isDestroyed) {
        return;
      }

      const error = err as { message?: string };
      this.updateState({
        status: 'error',
        errorCode: 'playback_failed',
        errorMessage: error.message || 'Unable to play test sound. Please check your audio output device.',
      });
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
