import assert from 'node:assert';
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseInvitationInput } from '../utils/invitationParser.ts';
import { MicrophoneCheckController } from '../controllers/MicrophoneCheckController.ts';
import { SpeakerCheckController } from '../controllers/SpeakerCheckController.ts';
import { copyTextToClipboard } from '../utils/clipboard.ts';
import { useMicrophoneCheck } from '../hooks/useMicrophoneCheck.ts';
import { useSpeakerCheck } from '../hooks/useSpeakerCheck.ts';

// ---------------------------------------------------------------------------
// GLOBAL BROWSER ENVIRONMENT SETUP FOR NODE TESTS
// ---------------------------------------------------------------------------
function createMockTrack() {
  let stopped = false;
  return {
    stop: () => {
      stopped = true;
    },
    isStopped: () => stopped,
  };
}

function createMockStream() {
  const tracks = [createMockTrack(), createMockTrack()];
  return {
    getTracks: () => tracks,
    areAllStopped: () => tracks.every((t) => t.isStopped()),
  };
}

// Setup standard browser globals in Node
globalThis.window = {
  isSecureContext: true,
  location: { hostname: 'localhost', origin: 'http://localhost:5173' },
};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

// ---------------------------------------------------------------------------
// SCENARIO 1: INVITATION PARSER - VALID INPUTS & CASING PRESERVATION
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 1: INVITATION PARSER (VALID INPUTS) ---');
const APP_ORIGIN = 'http://localhost:5173';

// 1A: Relative path with single token segment
const res1A = parseInvitationInput('/join/med-token-884', APP_ORIGIN);
assert.strictEqual(res1A.ok, true);
assert.strictEqual(res1A.token, 'med-token-884');

// 1B: Relative path with single trailing slash
const res1B = parseInvitationInput('/join/med-token-884/', APP_ORIGIN);
assert.strictEqual(res1B.ok, true);
assert.strictEqual(res1B.token, 'med-token-884');

// 1C: Full absolute URL matching current origin
const res1C = parseInvitationInput('http://localhost:5173/join/dr-sharma-991', APP_ORIGIN);
assert.strictEqual(res1C.ok, true);
assert.strictEqual(res1C.token, 'dr-sharma-991');

// 1D: Case preservation of token
const res1D = parseInvitationInput('/join/Rx_Special_Case-123', APP_ORIGIN);
assert.strictEqual(res1D.ok, true);
assert.strictEqual(res1D.token, 'Rx_Special_Case-123');

// 1E: Preserves valid URI-encoded characters
const res1E = parseInvitationInput('/join/consultation%20patient-42', APP_ORIGIN);
assert.strictEqual(res1E.ok, true);
assert.strictEqual(res1E.token, 'consultation%20patient-42');

console.log('✓ Valid relative paths, URLs, trailing slashes, and casing correctly accepted.');

// ---------------------------------------------------------------------------
// SCENARIO 2: INVITATION PARSER - STRICT REJECTIONS & EDGE CASES
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 2: INVITATION PARSER (STRICT REJECTIONS) ---');

// 2A: Empty or whitespace input
const res2A = parseInvitationInput('', APP_ORIGIN);
assert.strictEqual(res2A.ok, false);
assert.strictEqual(res2A.errorCode, 'empty');

const res2A_ws = parseInvitationInput('    ', APP_ORIGIN);
assert.strictEqual(res2A_ws.ok, false);
assert.strictEqual(res2A_ws.errorCode, 'empty');

// 2B: Bare token without /join/ prefix
const res2B = parseInvitationInput('med-8492', APP_ORIGIN);
assert.strictEqual(res2B.ok, false);

// 2C: Foreign origin (phishing prevention)
const res2C = parseInvitationInput('https://evil-hacker.com/join/token123', APP_ORIGIN);
assert.strictEqual(res2C.ok, false);

// 2D: Embedded credentials
const res2D = parseInvitationInput('http://user:pass@localhost:5173/join/token123', APP_ORIGIN);
assert.strictEqual(res2D.ok, false);

// 2E: Path missing token segment
const res2E = parseInvitationInput('/join/', APP_ORIGIN);
assert.strictEqual(res2E.ok, false);
const res2E2 = parseInvitationInput('http://localhost:5173/join', APP_ORIGIN);
assert.strictEqual(res2E2.ok, false);

// 2F: Multiple path segments
const res2F = parseInvitationInput('/join/abc/extra', APP_ORIGIN);
assert.strictEqual(res2F.ok, false);

// 2G: Double slashes
const res2G = parseInvitationInput('/join/abc//', APP_ORIGIN);
assert.strictEqual(res2G.ok, false);
const res2G2 = parseInvitationInput('/join//', APP_ORIGIN);
assert.strictEqual(res2G2.ok, false);

// 2H: Malformed percent-encoding
const res2H = parseInvitationInput('/join/%8G-invalid', APP_ORIGIN);
assert.strictEqual(res2H.ok, false);

// 2I: Unsupported protocol
const res2I = parseInvitationInput('javascript:alert(1)', APP_ORIGIN);
assert.strictEqual(res2I.ok, false);

console.log('✓ Malformed inputs, foreign origins, credentials, extra segments, and invalid encodings rejected.');

// ---------------------------------------------------------------------------
// SCENARIO 3: OPERATION A RESOLVES AFTER OPERATION B STARTS (NON-INTERFERENCE)
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 3: MULTI-OPERATION ISOLATION (OP A RESOLVES AFTER OP B STARTS) ---');

{
  let resolveA;
  let resolveB;

  let callCount = 0;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: () => {
        callCount++;
        if (callCount === 1) {
          return new Promise((r) => {
            resolveA = r;
          });
        }
        return new Promise((r) => {
          resolveB = r;
        });
      },
    },
    configurable: true,
  });

  const controller = new MicrophoneCheckController();

  // Operation A starts
  const promiseA = controller.startCheck();
  assert.strictEqual(controller.getState().status, 'requesting');

  // Operation B starts before Operation A resolves
  const promiseB = controller.startCheck();
  assert.strictEqual(controller.getState().status, 'requesting');

  // Operation A resolves late with Stream A
  const streamA = createMockStream();
  resolveA(streamA);
  await promiseA;

  // Stale Operation A must have its tracks immediately halted
  assert.strictEqual(streamA.areAllStopped(), true, 'Stream A tracks must be stopped immediately when A resolves late');

  // Operation B must remain active and unaffected
  assert.strictEqual(controller.getState().status, 'requesting', 'Operation B must still be actively requesting');

  // AudioContext mock for Operation B
  class MockAudioContext {
    constructor() {
      this.state = 'running';
    }
    resume() {
      return Promise.resolve();
    }
    createAnalyser() {
      return {
        fftSize: 256,
        smoothingTimeConstant: 0.4,
        frequencyBinCount: 128,
        getByteFrequencyData: () => {},
        connect: () => {},
        disconnect: () => {},
      };
    }
    createMediaStreamSource() {
      return { connect: () => {}, disconnect: () => {} };
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
  }
  globalThis.window.AudioContext = MockAudioContext;

  // Operation B now resolves with Stream B
  const streamB = createMockStream();
  resolveB(streamB);
  await promiseB;

  // Operation B succeeds and enters listening state
  assert.strictEqual(controller.getState().status, 'listening');
  assert.strictEqual(streamB.areAllStopped(), false, 'Stream B tracks must remain active for listening');
  assert.strictEqual(controller.currentStream, streamB, 'Controller currentStream must reference Stream B');

  controller.destroy();
  assert.strictEqual(streamB.areAllStopped(), true, 'Stream B tracks must stop when controller is destroyed');
  console.log('✓ Stale Operation A resolving late halts its own tracks and leaves Operation B entirely unaffected.');
}

// ---------------------------------------------------------------------------
// SCENARIO 4: ESTABLISH NON-NULL READING, SUCCESS CLEANUP & RETRY CLEAR
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 4: NON-NULL READING ESTABLISHED, SUCCESS CLEANUP & RETRY CLEAR ---');

{
  let contextClosed = false;
  class MockAudioContextWithCapture {
    constructor() {
      this.state = 'running';
    }
    resume() {
      return Promise.resolve();
    }
    createAnalyser() {
      return {
        fftSize: 256,
        smoothingTimeConstant: 0.4,
        frequencyBinCount: 8,
        getByteFrequencyData: (arr) => {
          // Fill with loud frequencies to trigger threshold (>= 12%)
          arr.fill(120);
        },
        connect: () => {},
        disconnect: () => {},
      };
    }
    createMediaStreamSource() {
      return { connect: () => {}, disconnect: () => {} };
    }
    close() {
      contextClosed = true;
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  globalThis.window.AudioContext = MockAudioContextWithCapture;

  let animFrameCallback = null;
  globalThis.requestAnimationFrame = (cb) => {
    animFrameCallback = cb;
    return 1;
  };

  const stream = createMockStream();
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: async () => stream,
    },
    configurable: true,
  });

  const controller = new MicrophoneCheckController();
  await controller.startCheck();
  assert.strictEqual(controller.getState().status, 'listening');

  // Trigger measurement frames to cross detection threshold twice
  assert.strictEqual(typeof animFrameCallback, 'function');
  animFrameCallback(); // frame 1
  animFrameCallback(); // frame 2 (sound_detected!)

  // 1. Establish non-null reading
  assert.strictEqual(controller.getState().status, 'sound_detected');
  const establishedReading = controller.getState().lastReading;
  assert.strictEqual(typeof establishedReading, 'number');
  assert.strictEqual(establishedReading > 0, true, 'Established reading must be non-null and greater than 0');

  // 2. Verify microphone cleanup on success
  assert.strictEqual(stream.areAllStopped(), true, 'Microphone tracks must be immediately stopped on sound detection');
  assert.strictEqual(contextClosed, true, 'AudioContext must be closed immediately on sound detection');
  assert.strictEqual(controller.getState().audioLevel, 0, 'Audio level meter must be reset to 0');

  // 3. Test that retry clears the non-null reading
  const retryStream = createMockStream();
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: async () => retryStream,
    },
    configurable: true,
  });

  const retryPromise = controller.startCheck();
  // Immediately upon starting a new attempt, lastReading must be cleared to null
  assert.strictEqual(controller.getState().lastReading, null, 'Retry must immediately reset retained reading to null');

  await retryPromise;
  controller.destroy();
  assert.strictEqual(retryStream.areAllStopped(), true);
  console.log('✓ Non-null reading established, hardware fully cleaned on success, and retry clears retained reading.');
}

// ---------------------------------------------------------------------------
// SCENARIO 5: MICROPHONE CLEANUP ON TIMEOUT
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 5: MICROPHONE TIMEOUT CLEANUP ---');

{
  let contextClosed = false;
  class MockAudioContext {
    constructor() {
      this.state = 'running';
    }
    resume() {
      return Promise.resolve();
    }
    createAnalyser() {
      return {
        fftSize: 256,
        smoothingTimeConstant: 0.4,
        frequencyBinCount: 8,
        getByteFrequencyData: () => {},
        connect: () => {},
        disconnect: () => {},
      };
    }
    createMediaStreamSource() {
      return { connect: () => {}, disconnect: () => {} };
    }
    close() {
      contextClosed = true;
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  globalThis.window.AudioContext = MockAudioContext;

  // Intercept the setTimeout callback for the 7000ms detection timeout
  let timeoutCallback = null;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (cb, delay) => {
    if (delay === 7000) {
      timeoutCallback = cb;
    }
    return 101;
  };

  const stream = createMockStream();
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: async () => stream,
    },
    configurable: true,
  });

  const controller = new MicrophoneCheckController();
  await controller.startCheck();
  assert.strictEqual(controller.getState().status, 'listening');

  // Fire 7-second timeout
  assert.strictEqual(typeof timeoutCallback, 'function');
  timeoutCallback();

  assert.strictEqual(controller.getState().status, 'no_sound_detected');
  assert.strictEqual(stream.areAllStopped(), true, 'Microphone tracks must be stopped on timeout');
  assert.strictEqual(contextClosed, true, 'AudioContext must be closed on timeout');
  assert.strictEqual(controller.getState().audioLevel, 0);

  globalThis.setTimeout = originalSetTimeout;
  controller.destroy();
  console.log('✓ Microphone timeout triggers full resource cleanup and updates status to no_sound_detected.');
}

// ---------------------------------------------------------------------------
// SCENARIO 6: MICROPHONE ERROR RECOVERY & CONTEXT CLOSURE
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 6: MICROPHONE ERROR RECOVERY & CONTEXT CLOSURE ---');

{
  let contextClosed = false;
  let trackStopped = false;

  class FailingAudioContext {
    constructor() {
      this.state = 'suspended';
    }
    resume() {
      return Promise.reject(new Error('AudioContext resume rejected'));
    }
    close() {
      contextClosed = true;
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  globalThis.window.AudioContext = FailingAudioContext;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            stop: () => {
              trackStopped = true;
            },
          },
        ],
      }),
    },
    configurable: true,
  });

  const controller = new MicrophoneCheckController();
  await controller.startCheck();

  assert.strictEqual(contextClosed, true, 'AudioContext must be closed when initialization fails in try block');
  assert.strictEqual(trackStopped, true, 'MediaStream tracks must be stopped on error');
  assert.strictEqual(controller.getState().status, 'error');

  controller.destroy();
  console.log('✓ Catch handler safely closes AudioContext and halts tracks upon initialization error.');
}

// ---------------------------------------------------------------------------
// SCENARIO 7: SPEAKER CHECK CANCELLATION & EXPLICIT CONFIRMATION
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 7: SPEAKER CHECK CANCELLATION & EXPLICIT CONFIRMATION ---');

{
  let speakerContextClosed = false;
  let oscStopped = false;

  class MockSpeakerAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      return Promise.resolve();
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
        disconnect: () => {},
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {
          oscStopped = true;
        },
        disconnect: () => {},
      };
    }
    close() {
      speakerContextClosed = true;
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  globalThis.window.AudioContext = MockSpeakerAudioContext;

  const controller = new SpeakerCheckController();
  const playPromise = controller.playTestSound();
  assert.strictEqual(controller.getState().status, 'playing');

  // User triggers cancellation action while playback/resume is pending
  controller.stopCheck();
  await playPromise;

  assert.strictEqual(speakerContextClosed, true, 'Speaker AudioContext must close on stopCheck');
  assert.strictEqual(oscStopped, true, 'Oscillator must stop on stopCheck');
  assert.strictEqual(controller.getState().status, 'idle', 'Status must return to idle');

  // Test explicit confirmation
  controller.confirmHeard(true);
  assert.strictEqual(controller.getState().status, 'passed');

  controller.confirmHeard(false);
  assert.strictEqual(controller.getState().status, 'failed');

  controller.resetCheck();
  assert.strictEqual(controller.getState().status, 'idle');

  controller.destroy();
  console.log('✓ Speaker cancellation cleanly aborts playback, closes context, and requires explicit user confirmation.');
}

// ---------------------------------------------------------------------------
// SCENARIO 8: CONTROLLER DESTRUCTION & PERMANENT DISPOSAL
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 8: CONTROLLER DESTRUCTION & PERMANENT DISPOSAL ---');

{
  // Test that controller.destroy() permanently disposes controller,
  // releases active hardware resources, and prevents subsequent operations from executing.
  const micStream = createMockStream();
  let micContextClosed = false;

  class MockContext {
    constructor() {
      this.state = 'running';
    }
    resume() {
      return Promise.resolve();
    }
    createAnalyser() {
      return {
        fftSize: 256,
        smoothingTimeConstant: 0.4,
        frequencyBinCount: 8,
        getByteFrequencyData: () => {},
        connect: () => {},
        disconnect: () => {},
      };
    }
    createMediaStreamSource() {
      return { connect: () => {}, disconnect: () => {} };
    }
    close() {
      micContextClosed = true;
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  globalThis.window.AudioContext = MockContext;
  let gumCallCount = 0;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: async () => {
        gumCallCount++;
        return micStream;
      },
    },
    configurable: true,
  });

  const micController = new MicrophoneCheckController();
  await micController.startCheck();
  assert.strictEqual(micController.getState().status, 'listening');
  assert.strictEqual(gumCallCount, 1);

  // Permanently destroy controller
  micController.destroy();
  assert.strictEqual(micStream.areAllStopped(), true, 'Active mic stream tracks must be halted on destroy');
  assert.strictEqual(micContextClosed, true, 'Active AudioContext must be closed on destroy');
  assert.strictEqual(micController.getState().status, 'idle');

  // Verify that subsequent operations on disposed controller are no-ops
  await micController.startCheck();
  assert.strictEqual(gumCallCount, 1, 'Destroyed controller must not request getUserMedia');
  assert.strictEqual(micController.getState().status, 'idle', 'Destroyed controller must not mutate state');
  // Verify that subscriptions on destroyed controllers are no-ops
  let listenerCalled = false;
  const unsub = micController.subscribe(() => {
    listenerCalled = true;
  });
  assert.strictEqual(typeof unsub, 'function');
  assert.strictEqual(listenerCalled, false);

  // Verify SpeakerCheckController permanent destruction
  const spkController = new SpeakerCheckController();
  spkController.destroy();
  await spkController.playTestSound();
  assert.strictEqual(spkController.getState().status, 'idle', 'Destroyed speaker controller must not initiate playback');

  console.log('✓ Controller destruction permanently releases hardware and safely rejects subsequent operations.');
}

// ---------------------------------------------------------------------------
// SCENARIO 9: PRODUCTION CLIPBOARD UTILITY WITH TRY/FINALLY CLEANUP
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 9: PRODUCTION CLIPBOARD UTILITY (TRY/FINALLY CLEANUP) ---');

{
  // Test 9A: Modern Clipboard API success in secure context
  let clipboardText = '';
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: {
      writeText: async (t) => {
        clipboardText = t;
      },
    },
    configurable: true,
  });

  const resModern = await copyTextToClipboard('https://sahayak.health/join/demo-123');
  assert.strictEqual(resModern.success, true);
  assert.strictEqual(resModern.method, 'clipboard-api');
  assert.strictEqual(clipboardText, 'https://sahayak.health/join/demo-123');

  // Test 9B: Fallback when clipboard API is unavailable, testing DOM cleanup & focus restoration
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  });

  let textareaCreated = false;
  let textareaRemoved = false;
  let focusRestored = false;

  const mockPreviouslyFocused = {
    focus: () => {
      focusRestored = true;
    },
  };

  const mockBody = {
    appendChild: (el) => {
      el.parentNode = mockBody;
      textareaCreated = true;
    },
    removeChild: (el) => {
      el.parentNode = null;
      textareaRemoved = true;
    },
  };

  globalThis.document = {
    activeElement: mockPreviouslyFocused,
    body: mockBody,
    createElement: (tag) => ({
      tagName: tag,
      value: '',
      style: {},
      setAttribute: () => {},
      focus: () => {},
      select: () => {},
      parentNode: null,
    }),
    execCommand: (cmd) => {
      if (cmd === 'copy') return true;
      return false;
    },
  };

  const resFallback = await copyTextToClipboard('https://sahayak.health/join/fallback-456', {
    activeElement: mockPreviouslyFocused,
  });

  assert.strictEqual(resFallback.success, true);
  assert.strictEqual(resFallback.method, 'exec-command');
  assert.strictEqual(textareaCreated, true, 'Textarea must be created in fallback');
  assert.strictEqual(textareaRemoved, true, 'Textarea must be removed from body in finally block');
  assert.strictEqual(focusRestored, true, 'Focus must be restored to previous element in finally block');

  // Test 9C: Fallback failure when execCommand throws
  globalThis.document.execCommand = () => {
    throw new Error('Blocked by security policy');
  };
  textareaRemoved = false;
  focusRestored = false;

  const resFailed = await copyTextToClipboard('https://sahayak.health/join/failed-789', {
    activeElement: mockPreviouslyFocused,
  });

  assert.strictEqual(resFailed.success, false);
  assert.strictEqual(resFailed.method, 'failed');
  assert.strictEqual(textareaRemoved, true, 'Textarea must still be removed in finally block even when execCommand throws');
  assert.strictEqual(focusRestored, true, 'Focus must still be restored in finally block even when execCommand throws');

  console.log('✓ Production clipboard utility correctly uses Clipboard API, provides fallback, preserves focus, and safely cleans DOM elements in try/finally.');
}

// ---------------------------------------------------------------------------
// SCENARIO 10: REACT STRICTMODE HOOK INTEGRATION & ASYNC LIFECYCLE
// ---------------------------------------------------------------------------
console.log('--- SCENARIO 10: REACT STRICTMODE HOOK INTEGRATION & ASYNC LIFECYCLE ---');

{
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  function createMockDom() {
    function makeNode(type = 1, tag = 'div', doc) {
      const node = {
        nodeType: type,
        tagName: tag,
        ownerDocument: doc,
        childNodes: [],
        parentNode: null,
        style: {},
        appendChild: (c) => {
          c.parentNode = node;
          node.childNodes.push(c);
          return c;
        },
        removeChild: (c) => {
          const idx = node.childNodes.indexOf(c);
          if (idx !== -1) node.childNodes.splice(idx, 1);
          c.parentNode = null;
          return c;
        },
        insertBefore: (c, ref) => {
          c.parentNode = node;
          const idx = node.childNodes.indexOf(ref);
          if (idx !== -1) node.childNodes.splice(idx, 0, c);
          else node.childNodes.push(c);
          return c;
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        removeAttribute: () => {},
      };
      return node;
    }

    const doc = {
      nodeType: 9,
      createElement: (tag) => makeNode(1, tag, doc),
      createComment: () => makeNode(8, '#comment', doc),
      createTextNode: (t) => ({ nodeType: 3, nodeValue: t, ownerDocument: doc, parentNode: null }),
      addEventListener: () => {},
      removeEventListener: () => {},
      activeElement: null,
    };

    const container = makeNode(1, 'div', doc);
    container.ownerDocument = doc;
    doc.body = makeNode(1, 'body', doc);
    doc.body.appendChild(container);

    const win = {
      document: doc,
      isSecureContext: true,
      location: { hostname: 'localhost', origin: 'http://localhost:5173' },
      addEventListener: () => {},
      removeEventListener: () => {},
      HTMLIFrameElement: class HTMLIFrameElement {},
    };
    doc.defaultView = win;

    return { doc, win, container };
  }

  // 10A: StrictMode mount replay + progression test
  {
    const { doc, win, container } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    let rafCallbacks = [];
    globalThis.requestAnimationFrame = (cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };
    globalThis.cancelAnimationFrame = () => {
      rafCallbacks = [];
    };

    const micStream = createMockStream();
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => micStream,
      },
      configurable: true,
    });

    class MockAudioContext {
      constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.isClosed = false;
        this.destination = {};
      }
      resume() {
        return Promise.resolve();
      }
      createAnalyser() {
        return {
          fftSize: 256,
          smoothingTimeConstant: 0.4,
          frequencyBinCount: 8,
          getByteFrequencyData: (arr) => {
            arr.fill(50); // Simulate strong audio level
          },
          connect: () => {},
          disconnect: () => {},
        };
      }
      createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
      }
      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {
            setTimeout(() => {
              if (osc.onended) osc.onended();
            }, 10);
          },
          disconnect: () => {},
          onended: null,
        };
        return osc;
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
          disconnect: () => {},
        };
      }
      close() {
        this.isClosed = true;
        this.state = 'closed';
        return Promise.resolve();
      }
    }
    globalThis.window.AudioContext = MockAudioContext;
    globalThis.AudioContext = MockAudioContext;

    let currentHooks = null;
    function StrictModeAudioTestComponent() {
      const mic = useMicrophoneCheck();
      const speaker = useSpeakerCheck();
      currentHooks = { mic, speaker };
      return React.createElement('div', null, `${mic.status}:${speaker.status}`);
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(StrictModeAudioTestComponent))
      );
    });

    // Verify both hooks survived StrictMode effect replay (setup -> cleanup -> setup)
    assert.strictEqual(currentHooks.mic.status, 'idle', 'Mic hook must be idle after StrictMode setup replay');
    assert.strictEqual(currentHooks.speaker.status, 'idle', 'Speaker hook must be idle after StrictMode setup replay');

    // Exercise mic hook: idle -> listening -> sound_detected
    await act(async () => {
      await currentHooks.mic.startCheck();
    });
    assert.strictEqual(currentHooks.mic.status, 'listening', 'Mic hook must enter listening after startCheck()');

    // Pump RAF callbacks to simulate audio analysis
    await act(async () => {
      if (rafCallbacks.length > 0) rafCallbacks.shift()(performance.now());
      if (rafCallbacks.length > 0) rafCallbacks.shift()(performance.now());
    });
    assert.strictEqual(currentHooks.mic.status, 'sound_detected', 'Mic hook must progress to sound_detected');

    // Exercise speaker hook: idle -> playing -> confirming -> passed
    await act(async () => {
      await currentHooks.speaker.playTestSound();
      await new Promise((r) => setTimeout(r, 25));
    });
    assert.strictEqual(currentHooks.speaker.status, 'confirming', 'Speaker hook must enter confirming state after playback');

    await act(async () => {
      currentHooks.speaker.confirmHeard(true);
    });
    assert.strictEqual(currentHooks.speaker.status, 'passed', 'Speaker hook must enter passed state upon confirmation');

    // Clean unmount
    await act(async () => {
      root.unmount();
    });

    console.log('✓ StrictMode mount replay succeeds: both hooks progress to sound_detected and passed.');
  }

  // 10B: Unmount during pending getUserMedia
  {
    const { doc, win, container } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    let resolveGUM;
    const pendingGUMPromise = new Promise((resolve) => {
      resolveGUM = resolve;
    });
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => pendingGUMPromise,
      },
      configurable: true,
    });

    let micHook = null;
    function PendingGUMComponent() {
      micHook = useMicrophoneCheck();
      return React.createElement('div', null, micHook.status);
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(StrictMode, null, React.createElement(PendingGUMComponent)));
    });

    let startPromise;
    await act(async () => {
      startPromise = micHook.startCheck();
    });
    assert.strictEqual(micHook.status, 'requesting', 'Mic check must be requesting while GUM is pending');

    // Unmount during pending getUserMedia
    await act(async () => {
      root.unmount();
    });

    // Late resolution of getUserMedia
    const lateStream = createMockStream();
    await act(async () => {
      resolveGUM(lateStream);
      await startPromise;
    });

    assert.strictEqual(lateStream.areAllStopped(), true, 'Late-resolved stream tracks must be halted when unmounted during getUserMedia');
    console.log('✓ Unmount during pending getUserMedia halts late stream tracks without errors.');
  }

  // 10C: Unmount during pending AudioContext.resume
  {
    const { doc, win, container } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    let resolveResume;
    const pendingResumePromise = new Promise((resolve) => {
      resolveResume = resolve;
    });

    let pendingAudioCtxInstance = null;
    class PendingResumeAudioContext {
      constructor() {
        pendingAudioCtxInstance = this;
        this.state = 'suspended';
        this.currentTime = 0;
        this.destination = {};
      }
      resume() {
        return pendingResumePromise.then(() => {
          this.state = 'running';
        });
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
          disconnect: () => {},
        };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {},
          disconnect: () => {},
          onended: null,
        };
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    }
    globalThis.window.AudioContext = PendingResumeAudioContext;
    globalThis.AudioContext = PendingResumeAudioContext;

    let speakerHook = null;
    function PendingResumeComponent() {
      speakerHook = useSpeakerCheck();
      return React.createElement('div', null, speakerHook.status);
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(StrictMode, null, React.createElement(PendingResumeComponent)));
    });

    let playPromise;
    await act(async () => {
      playPromise = speakerHook.playTestSound();
    });
    assert.strictEqual(speakerHook.status, 'playing', 'Speaker check must be playing while resume is pending');

    // Unmount during pending AudioContext.resume
    await act(async () => {
      root.unmount();
    });

    // Late resolution of AudioContext.resume
    await act(async () => {
      resolveResume();
      await playPromise;
    });

    assert.strictEqual(pendingAudioCtxInstance.state, 'closed', 'Late-resolved AudioContext must be closed when unmounted during resume');
    console.log('✓ Unmount during pending AudioContext.resume cleanly closes late AudioContext.');
  }
}

console.log('\n--- VERIFICATION COMPLETE: ALL REGRESSION SCENARIOS VERIFIED ---');
