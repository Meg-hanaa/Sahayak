import assert from 'node:assert';
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { sessionApi, SessionApiError } from '../services/sessionApi.ts';
import { ConsultationAdapter } from '../services/consultationAdapter.ts';
import { mapToBackendMicrophoneStatus } from '../utils/microphoneStatusMapper.ts';
import { parseInvitationInput } from '../utils/invitationParser.ts';
import {
  getSessionToken,
  setSessionToken,
  removeSessionToken,
} from '../utils/tokenStorage.ts';
import {
  CLINICAL_DISCLAIMER_EN,
  CLINICAL_DISCLAIMER_HI,
} from '../services/consultationFixtures.ts';

// ---------------------------------------------------------------------------
// GLOBAL SYNTHETIC DOM & STORAGE SETUP FOR REACT 19 TESTS IN NODE
// ---------------------------------------------------------------------------
function createMockStorage() {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
}

class MockWebSocket {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sentMessages = [];
    MockWebSocket.instances.push(this);

    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen({});
      // Backend automatically sends {"type": "connected", ...}
      if (this.onmessage) {
        this.onmessage({
          data: JSON.stringify({
            type: 'connected',
            service: 'sahayak',
            role: 'doctor',
          }),
        });
      }
    }, 10);
  }

  send(data) {
    this.sentMessages.push(data);
    // Backend echoes with ack
    if (this.onmessage) {
      setTimeout(() => {
        this.onmessage({
          data: JSON.stringify({
            type: 'ack',
            received: data,
          }),
        });
      }, 5);
    }
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({});
  }
}

function createMockDom() {
  function makeNode(type = 1, tag = 'div', doc) {
    const listeners = new Map();
    const node = {
      nodeType: type,
      tagName: tag.toUpperCase(),
      ownerDocument: doc,
      childNodes: [],
      parentNode: null,
      style: {},
      attributes: new Map(),
      setAttribute: (k, v) => node.attributes.set(k, String(v)),
      getAttribute: (k) => (node.attributes.has(k) ? (node.attributes.get(k) ?? '') : null),
      removeAttribute: (k) => node.attributes.delete(k),
      hasAttribute: (k) => node.attributes.has(k),
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
      addEventListener: (type, handler) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      removeEventListener: (type, handler) => {
        if (!listeners.has(type)) return;
        const arr = listeners.get(type);
        const idx = arr.indexOf(handler);
        if (idx !== -1) arr.splice(idx, 1);
      },
      dispatchEvent: (evt) => {
        if (!evt.target) evt.target = node;
        evt.currentTarget = node;
        const arr = listeners.get(evt.type) || [];
        for (const h of arr) h(evt);
        if (node.parentNode) {
          node.parentNode.dispatchEvent(evt);
        } else if (node.ownerDocument && node.ownerDocument !== node) {
          node.ownerDocument.dispatchEvent(evt);
        }
      },
      focus: () => {
        doc.activeElement = node;
      },
    };

    Object.defineProperty(node, 'textContent', {
      get: () => {
        if (node.nodeType === 3) return node.nodeValue || '';
        return node.childNodes.map((c) => c.textContent || c.nodeValue || '').join('');
      },
      set: (val) => {
        node.childNodes = [];
        if (val !== undefined && val !== null && String(val).length > 0) {
          const textNode = doc.createTextNode(String(val));
          textNode.parentNode = node;
          node.childNodes.push(textNode);
        }
      },
      configurable: true,
      enumerable: true,
    });
    return node;
  }

  const docListeners = new Map();
  const doc = {
    nodeType: 9,
    createElement: (tag) => makeNode(1, tag, doc),
    createElementNS: (ns, tag) => {
      const node = makeNode(1, tag, doc);
      node.namespaceURI = ns;
      return node;
    },
    createComment: () => makeNode(8, '#comment', doc),
    createTextNode: (t) => ({
      nodeType: 3,
      nodeValue: t,
      ownerDocument: doc,
      parentNode: null,
    }),
    addEventListener: (type, handler) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(handler);
    },
    removeEventListener: (type, handler) => {
      if (!docListeners.has(type)) return;
      const arr = docListeners.get(type);
      const idx = arr.indexOf(handler);
      if (idx !== -1) arr.splice(idx, 1);
    },
    dispatchEvent: (evt) => {
      const arr = docListeners.get(evt.type) || [];
      for (const h of arr) h(evt);
    },
    activeElement: null,
    title: 'Sahayak',
  };

  const container = makeNode(1, 'div', doc);
  container.ownerDocument = doc;
  doc.body = makeNode(1, 'body', doc);
  doc.body.appendChild(container);

  const mockSessionStorage = createMockStorage();
  const mockLocalStorage = createMockStorage();

  const win = {
    document: doc,
    isSecureContext: true,
    location: {
      hostname: 'localhost',
      origin: 'http://localhost:5173',
      protocol: 'http:',
      host: 'localhost:5173',
      pathname: '/consultation/new',
      search: '',
    },
    history: {
      replaceState: (state, title, url) => {
        win.location.pathname = url;
      },
    },
    sessionStorage: mockSessionStorage,
    localStorage: mockLocalStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    HTMLIFrameElement: class HTMLIFrameElement {},
    WebSocket: MockWebSocket,
  };
  doc.defaultView = win;

  return { doc, win, container, makeNode, mockSessionStorage, mockLocalStorage };
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function getAllText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  let txt = '';
  if (node.childNodes && node.childNodes.length > 0) {
    for (const c of node.childNodes) {
      txt += ' ' + getAllText(c);
    }
  } else if (node.textContent) {
    txt += ' ' + node.textContent;
  }
  return txt.replace(/\s+/g, ' ').trim();
}

function queryByAttr(node, attr, val) {
  if (!node) return null;
  if ((node.getAttribute && node.getAttribute(attr) === val) || node[attr] === val) return node;
  if (node.childNodes) {
    for (const c of node.childNodes) {
      const res = queryByAttr(c, attr, val);
      if (res) return res;
    }
  }
  return null;
}

function queryAllByAttr(node, attr, val) {
  const results = [];
  function walk(n) {
    if (!n) return;
    if (n.getAttribute && n.getAttribute(attr) === val) results.push(n);
    if (n.childNodes) {
      for (const c of n.childNodes) walk(c);
    }
  }
  walk(node);
  return results;
}

// ---------------------------------------------------------------------------
// TEST SUITE EXECUTION
// ---------------------------------------------------------------------------
async function runConsultationTests() {
  console.log('================================================================');
  console.log('SAHAYAK PHASE 4: FULL SESSION LIFECYCLE REGRESSION TEST SUITE');
  console.log('================================================================\n');

  const esbuild = await import('esbuild');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');

  const outdir = path.resolve('./node_modules/.cache/test-consultation-pages');
  await esbuild.build({
    entryPoints: {
      doc: './src/pages/DoctorConsultationPage.tsx',
      pat: './src/pages/PatientConsultationPage.tsx',
      docPrep: './src/pages/DoctorPreparationPage.tsx',
      patPrep: './src/pages/PatientPreparationPage.tsx',
      rec: './src/pages/ConsultationRecordPage.tsx',
      speechInput: './src/components/ConsultationSpeechInput.tsx',
    },
    bundle: true,
    format: 'esm',
    outdir,
    external: ['react', 'react-dom', 'react-router-dom', 'lucide-react'],
    loader: { '.css': 'empty' },
  });

  const docFile = pathToFileURL(path.join(outdir, 'doc.js')).href;
  const patFile = pathToFileURL(path.join(outdir, 'pat.js')).href;
  const docPrepFile = pathToFileURL(path.join(outdir, 'docPrep.js')).href;
  const patPrepFile = pathToFileURL(path.join(outdir, 'patPrep.js')).href;
  const recFile = pathToFileURL(path.join(outdir, 'rec.js')).href;
  const speechInputFile = pathToFileURL(path.join(outdir, 'speechInput.js')).href;

  const { DoctorConsultationPage } = await import(docFile);
  const { PatientConsultationPage } = await import(patFile);
  const { DoctorPreparationPage } = await import(docPrepFile);
  const { PatientPreparationPage } = await import(patPrepFile);
  const { ConsultationRecordPage } = await import(recFile);
  const { ConsultationSpeechInput, DOCTOR_QUICK_PHRASES, PATIENT_QUICK_PHRASES } = await import(speechInputFile);

  // -------------------------------------------------------------------------
  // TEST 1: SESSION API CLIENT REQUESTS & RESPONSES
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: REST API CLIENT (SESSION LIFECYCLE) ---');
  {
    const recordedCalls = [];
    globalThis.fetch = async (url, options = {}) => {
      recordedCalls.push({ url, options });
      const strUrl = String(url);

      if (strUrl.endsWith('/api/sessions') && options.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            session: {
              session_id: '550e8400-e29b-41d4-a716-446655440000',
              status: 'created',
              created_at: '2026-09-27T10:00:00Z',
              doctor_language: 'en',
              patient_language: 'hi',
              retention_expires_at: '2026-09-27T10:30:00Z',
              participants: [],
            },
            access: {
              doctor: {
                role: 'doctor',
                token: 'doc-secret-token-111',
                expires_at: '2026-09-27T10:30:00Z',
              },
              patient: {
                role: 'patient',
                token: 'pat-secret-token-222',
                expires_at: '2026-09-27T10:30:00Z',
              },
            },
          }),
        };
      }

      if (strUrl.includes('/join') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session: {
              session_id: '550e8400-e29b-41d4-a716-446655440000',
              status: 'created',
              created_at: '2026-09-27T10:00:00Z',
              doctor_language: 'en',
              patient_language: 'hi',
              retention_expires_at: '2026-09-27T10:30:00Z',
              participants: [
                {
                  participant_id: 'part-uuid-1',
                  role: body.role || 'doctor',
                  connection_status: 'disconnected',
                  microphone_status: body.microphone_status || 'unknown',
                },
              ],
            },
            participant: {
              participant_id: 'part-uuid-1',
              role: body.role || 'doctor',
              connection_status: 'disconnected',
              microphone_status: body.microphone_status || 'unknown',
            },
          }),
        };
      }

      if (strUrl.endsWith('/end') && options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session_id: '550e8400-e29b-41d4-a716-446655440000',
            status: 'ended',
            created_at: '2026-09-27T10:00:00Z',
            doctor_language: 'en',
            patient_language: 'hi',
            retention_expires_at: '2026-09-27T10:30:00Z',
            participants: [],
          }),
        };
      }

      // Default GET session
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'ready',
          created_at: '2026-09-27T10:00:00Z',
          doctor_language: 'en',
          patient_language: 'hi',
          retention_expires_at: '2026-09-27T10:30:00Z',
          participants: [
            {
              participant_id: 'doc-1',
              role: 'doctor',
              connection_status: 'connected',
              microphone_status: 'granted',
            },
            {
              participant_id: 'pat-2',
              role: 'patient',
              connection_status: 'disconnected',
              microphone_status: 'unknown',
            },
          ],
        }),
      };
    };

    // 1-Mapper: Verify mapper translates status to backend enums, never 'active'
    assert.strictEqual(mapToBackendMicrophoneStatus('sound_detected'), 'granted');
    assert.strictEqual(mapToBackendMicrophoneStatus('denied'), 'blocked');
    assert.strictEqual(mapToBackendMicrophoneStatus('idle'), 'unknown');
    assert.strictEqual(mapToBackendMicrophoneStatus('requesting'), 'unknown');
    assert.strictEqual(mapToBackendMicrophoneStatus('listening'), 'unknown');
    assert.strictEqual(mapToBackendMicrophoneStatus('no_sound_detected'), 'unknown');
    assert.strictEqual(mapToBackendMicrophoneStatus('error'), 'unknown');
    const allMicStatuses = ['sound_detected', 'denied', 'idle', 'requesting', 'listening', 'no_sound_detected', 'error'];
    allMicStatuses.forEach((st) => {
      assert.notStrictEqual(
        mapToBackendMicrophoneStatus(st),
        'active',
        `Mapper must never produce active for status ${st}`
      );
    });

    // 1A: Create Session
    const created = await sessionApi.createSession();
    assert.strictEqual(created.session.session_id, '550e8400-e29b-41d4-a716-446655440000');
    assert.strictEqual(created.access.doctor.token, 'doc-secret-token-111');
    assert.strictEqual(created.access.patient.token, 'pat-secret-token-222');

    // 1B: Join Session - Test with granted, blocked, unknown (never active)
    const joinedGranted = await sessionApi.joinSession('550e8400-e29b-41d4-a716-446655440000', {
      token: 'doc-secret-token-111',
      role: 'doctor',
      microphone_status: 'granted',
    });
    assert.strictEqual(joinedGranted.participant.role, 'doctor');
    assert.strictEqual(joinedGranted.participant.microphone_status, 'granted');

    const joinedBlocked = await sessionApi.joinSession('550e8400-e29b-41d4-a716-446655440000', {
      token: 'doc-secret-token-111',
      role: 'doctor',
      microphone_status: 'blocked',
    });
    assert.strictEqual(joinedBlocked.participant.microphone_status, 'blocked');

    const joinedUnknown = await sessionApi.joinSession('550e8400-e29b-41d4-a716-446655440000', {
      token: 'pat-secret-token-222',
      role: 'patient',
      microphone_status: 'unknown',
    });
    assert.strictEqual(joinedUnknown.participant.role, 'patient');
    assert.strictEqual(joinedUnknown.participant.microphone_status, 'unknown');

    // Verify all recorded join requests never sent 'active'
    const joinCalls = recordedCalls.filter((c) => String(c.url).includes('/join'));
    assert.ok(joinCalls.length >= 3, 'Must record all join requests');
    for (const call of joinCalls) {
      const parsedBody = JSON.parse(call.options.body);
      assert.notStrictEqual(parsedBody.microphone_status, 'active', 'Join requests must never send active');
      assert.ok(['granted', 'blocked', 'unknown', 'muted'].includes(parsedBody.microphone_status));
    }

    // 1C: Get Session
    const fetched = await sessionApi.getSession(
      '550e8400-e29b-41d4-a716-446655440000',
      'doc-secret-token-111'
    );
    assert.strictEqual(fetched.status, 'ready');
    assert.strictEqual(fetched.participants.length, 2);

    // 1D: End Session
    const ended = await sessionApi.endSession(
      '550e8400-e29b-41d4-a716-446655440000',
      'doc-secret-token-111'
    );
    assert.strictEqual(ended.status, 'ended');

    // 1E: Error handling without leaking tokens
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'session_not_found', message: 'Session not found' },
      }),
    });

    await assert.rejects(
      async () => {
        await sessionApi.getSession('invalid-id', 'secret-token-xyz');
      },
      (err) => {
        assert.ok(err instanceof SessionApiError);
        assert.strictEqual(err.code, 'session_not_found');
        assert.strictEqual(err.status, 404);
        assert.strictEqual(err.message, 'Session not found');
        assert.ok(!err.message.includes('secret-token-xyz'), 'Tokens must never be in error messages');
        return true;
      }
    );

    console.log('✓ REST API client correctly calls endpoints, verifies headers, and handles errors safely.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: DOCTOR PREPARATION, CREATION & JOIN FLOW
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: DOCTOR PREPARATION & CREATION FLOW ---');
  {
    const { doc, win, container, mockSessionStorage, mockLocalStorage } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    let doctorJoinBody = null;
    globalThis.fetch = async (url, options = {}) => {
      const strUrl = String(url);
      if (strUrl.endsWith('/api/sessions') && options.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            session: {
              session_id: 'doc-sess-501',
              status: 'created',
              created_at: '2026-09-27T10:00:00Z',
              doctor_language: 'en',
              patient_language: 'hi',
              retention_expires_at: '2026-09-27T10:30:00Z',
              participants: [],
            },
            access: {
              doctor: {
                role: 'doctor',
                token: 'doctor-token-safe-123',
                expires_at: '2026-09-27T10:30:00Z',
              },
              patient: {
                role: 'patient',
                token: 'patient-token-safe-456',
                expires_at: '2026-09-27T10:30:00Z',
              },
            },
          }),
        };
      }
      if (strUrl.includes('/join') && options.method === 'POST') {
        doctorJoinBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session: {
              session_id: 'doc-sess-501',
              status: 'created',
              created_at: '2026-09-27T10:00:00Z',
              doctor_language: 'en',
              patient_language: 'hi',
              retention_expires_at: '2026-09-27T10:30:00Z',
              participants: [],
            },
            participant: {
              participant_id: 'p1',
              role: 'doctor',
              connection_status: 'disconnected',
              microphone_status: doctorJoinBody.microphone_status,
            },
          }),
        };
      }
      return { ok: false, status: 500 };
    };

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/consultation/new'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/consultation/new',
                element: React.createElement(DoctorPreparationPage),
              })
            )
          )
        )
      );
    });

    // 2A: Find Create Consultation Session button
    const createBtn = Array.from(queryAllByAttr(container, 'type', 'button')).find((b) =>
      getAllText(b).includes('Create consultation session')
    );
    assert.ok(createBtn, 'Must render Create consultation session button');

    // Click Create Session
    await act(async () => {
      createBtn.dispatchEvent({ type: 'click' });
    });

    // 2B: Verify Token retained in sessionStorage, NEVER in localStorage
    assert.strictEqual(
      mockSessionStorage.getItem('sahayak_token_doc-sess-501'),
      'doctor-token-safe-123',
      'Doctor token must be saved to sessionStorage'
    );
    assert.strictEqual(
      mockLocalStorage.length,
      0,
      'localStorage must remain strictly unused'
    );

    // 2C: Verify join payload sent 'unknown' for initial mic status and never 'active'
    assert.ok(doctorJoinBody, 'Doctor join request must be sent');
    assert.strictEqual(doctorJoinBody.role, 'doctor');
    assert.strictEqual(doctorJoinBody.microphone_status, 'unknown');
    assert.notStrictEqual(doctorJoinBody.microphone_status, 'active');

    // 2D: Verify InvitationResultCard rendered with full URL containing sessionId and patientToken
    const fullText = getAllText(container);
    assert.match(fullText, /doc-sess-501/, 'Must display generated session ID');
    assert.match(fullText, /Enter consultation room/, 'Must offer link to enter consultation room');

    await act(async () => {
      root.unmount();
    });
    console.log('✓ Doctor creation and join flow correctly updates state, secures tokens in sessionStorage, and exposes invitation.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: PATIENT INVITATION & PREPARATION FLOW
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: PATIENT INVITATION & PREPARATION FLOW ---');
  {
    const APP_ORIGIN = 'http://localhost:5173';

    // 3A: Valid Link parsing
    const resValid = parseInvitationInput(
      'http://localhost:5173/join/pat-sess-701?token=token-pat-999',
      APP_ORIGIN
    );
    assert.strictEqual(resValid.ok, true);
    assert.strictEqual(resValid.sessionId, 'pat-sess-701');
    assert.strictEqual(resValid.token, 'token-pat-999');

    // 3B: Legacy link rejection with clear explanation
    const resLegacy = parseInvitationInput('/join/legacy-token-only', APP_ORIGIN);
    assert.strictEqual(resLegacy.ok, false);
    assert.strictEqual(resLegacy.errorCode, 'missing_session_id');
    assert.match(resLegacy.error, /सत्र पहचान/);

    // 3C: Patient Preparation Component with URL query token
    const { doc, win, container, mockSessionStorage } = createMockDom();
    win.location.pathname = '/join/pat-sess-701';
    win.location.search = '?token=token-pat-999';
    globalThis.document = doc;
    globalThis.window = win;

    let joinCalledWith = null;
    globalThis.fetch = async (url, options = {}) => {
      const strUrl = String(url);
      if (strUrl.includes('/join') && options.method === 'POST') {
        joinCalledWith = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session: {
              session_id: 'pat-sess-701',
              status: 'ready',
              created_at: '2026-09-27T10:00:00Z',
              doctor_language: 'en',
              patient_language: 'hi',
              retention_expires_at: '2026-09-27T10:30:00Z',
              participants: [],
            },
            participant: {
              participant_id: 'pat-1',
              role: 'patient',
              connection_status: 'disconnected',
              microphone_status: 'unknown',
            },
          }),
        };
      }
      return { ok: false, status: 500 };
    };

    let patientLocation = null;
    function PatientLocationObserver() {
      patientLocation = useLocation();
      return null;
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            {
              initialEntries: [
                {
                  pathname: '/join/pat-sess-701',
                  search: '?token=token-pat-999',
                  state: { source: 'patient_invite', referrer: 'clinic_sms' },
                },
              ],
            },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/join/:sessionId',
                element: React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(PatientPreparationPage),
                  React.createElement(PatientLocationObserver)
                ),
              }),
              React.createElement(Route, {
                path: '/patient/:sessionId',
                element: React.createElement('div', null, 'Patient Consultation Room'),
              })
            )
          )
        )
      );
    });

    // Verify token stored in sessionStorage and stripped from router location via replace navigation while retaining state
    assert.strictEqual(
      mockSessionStorage.getItem('sahayak_token_pat-sess-701'),
      'token-pat-999',
      'Patient token must be saved to sessionStorage'
    );
    assert.ok(patientLocation, 'Patient location probe must be active');
    assert.strictEqual(
      patientLocation.pathname,
      '/join/pat-sess-701',
      'Router pathname must match session route'
    );
    assert.strictEqual(
      patientLocation.search,
      '',
      'Router search must be stripped of token query param'
    );
    assert.deepStrictEqual(
      patientLocation.state,
      { source: 'patient_invite', referrer: 'clinic_sms' },
      'Router location.state must be preserved across replace navigation'
    );

    // Find and click "सत्र में शामिल हों" (Join session)
    const joinBtn = Array.from(queryAllByAttr(container, 'type', 'button')).find((b) =>
      getAllText(b).includes('सत्र में शामिल हों')
    );
    assert.ok(joinBtn, 'Must render Join session button in Hindi');

    await act(async () => {
      joinBtn.dispatchEvent({ type: 'click' });
    });

    assert.ok(joinCalledWith, 'Must call backend join endpoint');
    assert.strictEqual(joinCalledWith.token, 'token-pat-999');
    assert.strictEqual(joinCalledWith.role, 'patient');
    assert.strictEqual(joinCalledWith.microphone_status, 'unknown');
    assert.notStrictEqual(joinCalledWith.microphone_status, 'active');

    await act(async () => {
      root.unmount();
    });
    console.log('✓ Patient flow parses invitation, protects tokens in sessionStorage, and executes backend join.');
  }

  // -------------------------------------------------------------------------
  // TEST 4: CONSULTATION ADAPTER REAL WEBSOCKET & EMPTY TRANSCRIPT
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: CONSULTATION ADAPTER REAL WEBSOCKET & STATE ---');
  {
    globalThis.fetch = async (url) => {
      const strUrl = String(url);
      if (strUrl.includes('/api/sessions/sess-adapter-test')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session_id: 'sess-adapter-test',
            status: 'active',
            created_at: '2026-09-27T10:00:00Z',
            doctor_language: 'en',
            patient_language: 'hi',
            retention_expires_at: '2026-09-27T10:30:00Z',
            participants: [
              {
                participant_id: 'p1',
                role: 'doctor',
                connection_status: 'connected',
                microphone_status: 'granted',
              },
              {
                participant_id: 'p2',
                role: 'patient',
                connection_status: 'connected',
                microphone_status: 'granted',
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    globalThis.WebSocket = MockWebSocket;
    const adapter = new ConsultationAdapter('sess-adapter-test', 'doctor');

    // 4A: Without token, must honestly error without falling back to simulation fixtures
    await adapter.connect('sess-adapter-test', 'doctor', undefined);
    assert.strictEqual(adapter.getState().status, 'error');
    assert.strictEqual(adapter.getState().isFixture, false, 'Must NOT fall back to fixtures');
    assert.strictEqual(adapter.getState().turns.length, 0, 'Real session must have empty turns');

    // 4B: With token, connects to REST and WebSocket
    await adapter.connect('sess-adapter-test', 'doctor', 'valid-token-123');
    assert.strictEqual(adapter.getState().status, 'active');
    assert.strictEqual(adapter.getState().patient.connectionStatus, 'connected');
    assert.strictEqual(adapter.getState().liveAudioAvailable, false, 'Live audio streaming is not yet supported');

    // Wait for mock WebSocket connection
    await new Promise((r) => setTimeout(r, 25));
    assert.strictEqual(adapter.getState().connectionStatus, 'connected');

    adapter.disconnect();
    adapter.destroy();

    // 4C: Presence mapping tests for absent, connecting, connected, and disconnected
    // 1. Absent participant -> waiting
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'sess-pres-test',
        status: 'active',
        created_at: '2026-09-27T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-27T10:30:00Z',
        participants: [
          { participant_id: 'p1', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
        ],
      }),
    });
    const adapterAbsent = new ConsultationAdapter('sess-pres-test', 'doctor');
    await adapterAbsent.connect('sess-pres-test', 'doctor', 'token-doc-1');
    assert.strictEqual(adapterAbsent.getState().patient.connectionStatus, 'waiting', 'Absent participant must be waiting');
    adapterAbsent.destroy();

    // 2. Connecting participant -> connecting
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'sess-pres-test',
        status: 'active',
        created_at: '2026-09-27T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-27T10:30:00Z',
        participants: [
          { participant_id: 'p1', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
          { participant_id: 'p2', role: 'patient', connection_status: 'connecting', microphone_status: 'unknown' },
        ],
      }),
    });
    const adapterConnecting = new ConsultationAdapter('sess-pres-test', 'doctor');
    await adapterConnecting.connect('sess-pres-test', 'doctor', 'token-doc-1');
    assert.strictEqual(adapterConnecting.getState().patient.connectionStatus, 'connecting', 'Connecting participant must be connecting');
    adapterConnecting.destroy();

    // 3. Connected participant -> connected
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'sess-pres-test',
        status: 'active',
        created_at: '2026-09-27T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-27T10:30:00Z',
        participants: [
          { participant_id: 'p1', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
          { participant_id: 'p2', role: 'patient', connection_status: 'connected', microphone_status: 'granted' },
        ],
      }),
    });
    const adapterConnected = new ConsultationAdapter('sess-pres-test', 'doctor');
    await adapterConnected.connect('sess-pres-test', 'doctor', 'token-doc-1');
    assert.strictEqual(adapterConnected.getState().patient.connectionStatus, 'connected', 'Connected participant must be connected');
    adapterConnected.destroy();

    // 4. Disconnected participant -> disconnected (MUST NOT BE waiting)
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'sess-pres-test',
        status: 'active',
        created_at: '2026-09-27T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-27T10:30:00Z',
        participants: [
          { participant_id: 'p1', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
          { participant_id: 'p2', role: 'patient', connection_status: 'disconnected', microphone_status: 'granted' },
        ],
      }),
    });
    const adapterDisconnected = new ConsultationAdapter('sess-pres-test', 'doctor');
    await adapterDisconnected.connect('sess-pres-test', 'doctor', 'token-doc-1');
    assert.strictEqual(adapterDisconnected.getState().patient.connectionStatus, 'disconnected', 'Disconnected participant must be disconnected');
    assert.notStrictEqual(adapterDisconnected.getState().patient.connectionStatus, 'waiting', 'Disconnected participant must NEVER be reported as waiting');
    adapterDisconnected.destroy();

    console.log('✓ ConsultationAdapter connects to real API & WebSocket, rejects fake fixtures, and verifies peer status.');
  }

  // -------------------------------------------------------------------------
  // TEST 5: DOCTOR ENDING SESSION VS PATIENT LEAVING LOCALLY & FAILURE RETRY
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: DOCTOR ENDING SESSION VS PATIENT LEAVING LOCALLY ---');
  {
    let endSessionCalled = false;
    globalThis.fetch = async (url, options = {}) => {
      const strUrl = String(url);
      if (strUrl.endsWith('/end') && options.method === 'POST') {
        endSessionCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ session_id: 'sess-end-test', status: 'ended' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session_id: 'sess-end-test',
          status: 'active',
          participants: [],
        }),
      };
    };

    // 5A: Doctor ends consultation -> calls backend end endpoint
    const docAdapter = new ConsultationAdapter('sess-end-test', 'doctor');
    await docAdapter.connect('sess-end-test', 'doctor', 'doctor-token');
    await docAdapter.endConsultation();
    assert.strictEqual(endSessionCalled, true, 'Doctor end must call backend /end endpoint');
    assert.strictEqual(docAdapter.getState().status, 'ended');
    docAdapter.destroy();

    // 5B: Patient leaves consultation -> disconnects locally WITHOUT calling backend /end endpoint
    endSessionCalled = false;
    const patAdapter = new ConsultationAdapter('sess-end-test', 'patient');
    await patAdapter.connect('sess-end-test', 'patient', 'patient-token');
    await patAdapter.leaveConsultation();
    assert.strictEqual(
      endSessionCalled,
      false,
      'Patient leave must NOT call backend /end endpoint'
    );
    assert.strictEqual(patAdapter.getState().status, 'ended');
    patAdapter.destroy();

    // 5C: When backend end request fails, session is NOT falsely ended, state and connection are preserved, error is set, and retry succeeds
    let failEnd = true;
    globalThis.fetch = async (url, options = {}) => {
      const strUrl = String(url);
      if (strUrl.endsWith('/end') && options.method === 'POST') {
        if (failEnd) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: { code: 'server_error', message: 'Failed to persist session end' } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ session_id: 'sess-end-retry-test', status: 'ended' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session_id: 'sess-end-retry-test',
          status: 'active',
          participants: [],
        }),
      };
    };

    const retryDocAdapter = new ConsultationAdapter('sess-end-retry-test', 'doctor');
    await retryDocAdapter.connect('sess-end-retry-test', 'doctor', 'retry-doc-token');
    assert.strictEqual(retryDocAdapter.getState().status, 'active');

    // Attempt end when backend fails
    await assert.rejects(
      async () => {
        await retryDocAdapter.endConsultation();
      },
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );

    // Active state and connection preserved
    assert.strictEqual(
      retryDocAdapter.getState().status,
      'active',
      'Session must remain active when backend end call fails'
    );
    assert.ok(retryDocAdapter.getState().errorMessage, 'Error message must be set for user');
    assert.match(retryDocAdapter.getState().errorMessage, /Failed to persist session end/);

    // Doctor retries endConsultation after backend recovers
    failEnd = false;
    await retryDocAdapter.endConsultation();
    assert.strictEqual(
      retryDocAdapter.getState().status,
      'ended',
      'Session transitions to ended after successful end consultation retry'
    );
    retryDocAdapter.destroy();

    console.log('✓ Doctor termination, failure recovery retry, and patient local departure enforce strict contract.');
  }

  // -------------------------------------------------------------------------
  // TEST 6: CONSULTATION SCREENS RENDERING & CONTROLS
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: CONSULTATION SCREENS UI RENDERING & ACCESSIBILITY ---');
  {
    const { doc, win, container, mockSessionStorage } = createMockDom();
    mockSessionStorage.setItem('sahayak_token_med-ui-801', 'token-ui-doc');
    globalThis.document = doc;
    globalThis.window = win;

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'med-ui-801',
        status: 'active',
        created_at: '2026-09-27T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-27T10:30:00Z',
        participants: [
          {
            participant_id: 'doc-ui',
            role: 'doctor',
            connection_status: 'connected',
            microphone_status: 'granted',
          },
        ],
      }),
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/doctor/med-ui-801'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/doctor/:sessionId',
                element: React.createElement(DoctorConsultationPage),
              })
            )
          )
        )
      );
    });

    const fullText = getAllText(container);

    // 6A: Role & Session ID
    assert.match(fullText, /Doctor Consultation/);
    assert.match(fullText, /med-ui-801/);

    // 6B: Empty Transcript Notice
    assert.match(
      fullText,
      /Live speech streaming is not yet supported by the current backend pipeline/,
      'Must explain empty transcript honestly'
    );

    // 6C: Mute button disabled / marked unavailable for real sessions
    const muteBtn = queryByAttr(container, 'aria-label', 'Microphone mute unavailable: Live speech streaming not connected');
    assert.ok(muteBtn, 'Mute button must be disabled/marked unavailable when live streaming is not connected');

    // 6D: Clinical prototype disclaimer
    assert.match(fullText, new RegExp(CLINICAL_DISCLAIMER_EN));

    // 6E: Absent participant displays Waiting banner in Doctor Screen
    assert.match(fullText, /Patient has not joined the consultation yet/);

    await act(async () => {
      root.unmount();
    });

    // 6F: Disconnected patient displays Disconnected banner (not waiting banner)
    mockSessionStorage.setItem('sahayak_token_med-ui-802', 'token-ui-doc-2');
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'med-ui-802',
        status: 'active',
        created_at: '2026-09-27T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-27T10:30:00Z',
        participants: [
          { participant_id: 'doc-ui', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
          { participant_id: 'pat-ui', role: 'patient', connection_status: 'disconnected', microphone_status: 'granted' },
        ],
      }),
    });

    const rootDocDisconn = createRoot(container);
    await act(async () => {
      rootDocDisconn.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/doctor/med-ui-802'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/doctor/:sessionId',
                element: React.createElement(DoctorConsultationPage),
              })
            )
          )
        )
      );
    });

    const textDocDisconn = getAllText(container);
    assert.match(textDocDisconn, /Patient is currently disconnected\. Reconnecting\.\.\./);
    assert.ok(!textDocDisconn.includes('Patient has not joined the consultation yet'), 'Disconnected peer must NOT show waiting banner');
    assert.match(textDocDisconn, /Patient disconnected/);

    await act(async () => {
      rootDocDisconn.unmount();
    });

    // 6G: Patient screen with disconnected doctor displays Hindi Disconnected banner
    mockSessionStorage.setItem('sahayak_token_med-ui-803', 'token-ui-pat-3');
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'med-ui-803',
        status: 'active',
        created_at: '2026-09-27T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-27T10:30:00Z',
        participants: [
          { participant_id: 'doc-ui', role: 'doctor', connection_status: 'disconnected', microphone_status: 'granted' },
          { participant_id: 'pat-ui', role: 'patient', connection_status: 'connected', microphone_status: 'granted' },
        ],
      }),
    });

    const rootPatDisconn = createRoot(container);
    await act(async () => {
      rootPatDisconn.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/patient/med-ui-803'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/patient/:sessionId',
                element: React.createElement(PatientConsultationPage),
              })
            )
          )
        )
      );
    });

    const textPatDisconn = getAllText(container);
    assert.match(textPatDisconn, /डॉक्टर डिस्कनेक्ट हो गए हैं। पुनः कनेक्ट करने का प्रयास किया जा रहा है\.\.\./);
    assert.ok(!textPatDisconn.includes('डॉक्टर की प्रतीक्षा की जा रही है'), 'Disconnected doctor must NOT show waiting banner');
    assert.match(textPatDisconn, /डॉक्टर डिस्कनेक्ट हो गए हैं/);

    await act(async () => {
      rootPatDisconn.unmount();
    });

    // 6H: UI-level test for failed end request (handles error, keeps message accessible, avoids unhandled rejections, lets doctor retry)
    mockSessionStorage.setItem('sahayak_token_med-ui-804', 'token-ui-doc-4');
    let failEndBackend = true;
    let endCallCount = 0;
    const unhandledRejections = [];
    const rejectionHandler = (reason) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', rejectionHandler);

    globalThis.fetch = async (url, options = {}) => {
      const strUrl = String(url);
      if (strUrl.endsWith('/end') && options.method === 'POST') {
        endCallCount++;
        if (failEndBackend) {
          return {
            ok: false,
            status: 500,
            json: async () => ({
              error: { code: 'server_error', message: 'Database failed during consultation termination' },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ session_id: 'med-ui-804', status: 'ended' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session_id: 'med-ui-804',
          status: 'active',
          created_at: '2026-09-27T10:00:00Z',
          doctor_language: 'en',
          patient_language: 'hi',
          retention_expires_at: '2026-09-27T10:30:00Z',
          participants: [
            { participant_id: 'doc-ui', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
            { participant_id: 'pat-ui', role: 'patient', connection_status: 'connected', microphone_status: 'granted' },
          ],
        }),
      };
    };

    const rootFailedEnd = createRoot(container);
    await act(async () => {
      rootFailedEnd.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/doctor/med-ui-804'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/doctor/:sessionId',
                element: React.createElement(DoctorConsultationPage),
              })
            )
          )
        )
      );
    });

    // Doctor clicks "End consultation" button in header (which opens confirmation modal)
    const headerEndBtn = Array.from(queryAllByAttr(container, 'type', 'button')).find((b) =>
      b.getAttribute('class')?.includes('sahayak-consult-header__end-btn')
    );
    assert.ok(headerEndBtn, 'Header must render End consultation button');

    await act(async () => {
      headerEndBtn.dispatchEvent({ type: 'click' });
    });

    // Confirmation modal is opened
    const modalDialog = queryByAttr(container, 'role', 'dialog');
    assert.ok(modalDialog, 'Confirmation modal must open when clicking End consultation');

    const confirmEndBtn = Array.from(queryAllByAttr(container, 'type', 'button')).find((b) =>
      b.getAttribute('class')?.includes('sahayak-controls__modal-btn--confirm')
    );
    assert.ok(confirmEndBtn, 'Modal must render Confirm end consultation button');

    // Doctor clicks "Confirm end consultation" in modal
    await act(async () => {
      confirmEndBtn.dispatchEvent({ type: 'click' });
    });

    // Assert NO unhandled promise rejection occurred
    assert.strictEqual(
      unhandledRejections.length,
      0,
      'Failed end request must NOT cause unhandled promise rejections'
    );

    // Assert EXACTLY ONE accessible error message is displayed with role="alert"
    const alertElements = queryAllByAttr(container, 'role', 'alert');
    assert.strictEqual(
      alertElements.length,
      1,
      'Failed end request must produce EXACTLY ONE accessible error message with role="alert"'
    );
    const alertText = getAllText(alertElements[0]);
    assert.match(
      alertText,
      /Database failed during consultation termination|Failed to end consultation/,
      'Error message must be accessible in the UI'
    );

    // Assert confirmation modal remains open after failure to allow retry
    const modalStillOpen = queryByAttr(container, 'role', 'dialog');
    assert.ok(modalStillOpen, 'Confirmation modal must remain open after failure');

    // Assert session is NOT ended in UI
    const currentText = getAllText(container);
    assert.ok(!currentText.includes('Consultation Ended'), 'Session must not be displayed as ended');
    assert.ok(
      confirmEndBtn.getAttribute('disabled') === null || confirmEndBtn.getAttribute('disabled') === 'false',
      'Confirm button must be re-enabled for retry'
    );

    // Doctor retries end consultation after backend recovers
    failEndBackend = false;
    await act(async () => {
      confirmEndBtn.dispatchEvent({ type: 'click' });
    });

    // Assert session is now ended and error is cleared
    const textAfterRetry = getAllText(container);
    assert.match(textAfterRetry, /Consultation Ended/, 'Session transitions to ended after successful retry');
    assert.ok(endCallCount >= 2, 'End request must have been retried');

    const alertElementsAfterRetry = queryAllByAttr(container, 'role', 'alert');
    assert.strictEqual(
      alertElementsAfterRetry.length,
      0,
      'Accessible alert must be cleared after successful retry'
    );

    await act(async () => {
      rootFailedEnd.unmount();
    });

    process.removeListener('unhandledRejection', rejectionHandler);

    console.log('✓ Doctor and patient screens render accurate empty transcripts, peer connection states, exactly one end error, and handle failed end requests with accessible retry.');
  }

  // -------------------------------------------------------------------------
  // TEST 7: PHASE 6A LIVE TEXT INTERPRETATION EVENTS & ROUTING
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: PHASE 6A LIVE TEXT INTERPRETATION EVENTS & ROUTING ---');
  {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'sess-phase6a',
        status: 'active',
        created_at: '2026-09-28T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-28T10:30:00Z',
        participants: [
          { participant_id: 'p1', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
          { participant_id: 'p2', role: 'patient', connection_status: 'connected', microphone_status: 'granted' },
        ],
      }),
    });

    globalThis.WebSocket = MockWebSocket;
    const docAdapter = new ConsultationAdapter('sess-phase6a', 'doctor');
    await docAdapter.connect('sess-phase6a', 'doctor', 'token-doc-6a');
    await new Promise((r) => setTimeout(r, 25));

    const patAdapter = new ConsultationAdapter('sess-phase6a', 'patient');
    await patAdapter.connect('sess-phase6a', 'patient', 'token-pat-6a');
    await new Promise((r) => setTimeout(r, 25));

    // 7A: Client sending speech sends { type: "speech", text: "..." }
    const docWs = docAdapter.ws;
    const patWs = patAdapter.ws;
    assert.ok(docWs, 'Doctor WebSocket must be created');
    assert.ok(patWs, 'Patient WebSocket must be created');

    docAdapter.sendSpeech('Hello, how are you feeling today?');
    assert.ok(docWs.sentMessages.length > 0, 'Doctor WebSocket must have sent speech message');
    const lastDocMsg = JSON.parse(docWs.sentMessages[docWs.sentMessages.length - 1]);
    assert.strictEqual(lastDocMsg.type, 'speech');
    assert.strictEqual(lastDocMsg.text, 'Hello, how are you feeling today?');

    // 7B: Inbound interpretation routed to Patient
    // Doctor spoke in EN -> backend sends interpretation to Patient in HI
    patWs.onmessage({
      data: JSON.stringify({
        type: 'interpretation',
        session_id: 'sess-phase6a',
        recipient_role: 'patient',
        sender_role: 'doctor',
        timestamp: '2026-09-28T10:00:05Z',
        text: 'नमस्ते, आज आप कैसा महसूस कर रहे हैं?',
        source_language: 'en',
        target_language: 'hi',
        turn_id: 'turn-001',
      }),
    });

    const patState = patAdapter.getState();
    assert.strictEqual(patState.turns.length, 1);
    assert.strictEqual(patState.turns[0].translatedText, 'नमस्ते, आज आप कैसा महसूस कर रहे हैं?');
    assert.strictEqual(patState.turns[0].originalText, undefined, 'Recipient must not fabricate original text when backend only sends translated text');
    assert.strictEqual(patState.turns[0].speakerRole, 'doctor');
    assert.strictEqual(patState.turns[0].translatedLanguage, 'hi');

    // 7C: Cross-role isolation - if Patient receives an event meant for Doctor, it is dropped
    patWs.onmessage({
      data: JSON.stringify({
        type: 'interpretation',
        session_id: 'sess-phase6a',
        recipient_role: 'doctor',
        sender_role: 'patient',
        timestamp: '2026-09-28T10:00:10Z',
        text: 'I have a fever since yesterday',
        source_language: 'hi',
        target_language: 'en',
        turn_id: 'turn-002',
      }),
    });
    assert.strictEqual(patAdapter.getState().turns.length, 1, 'Event for doctor must NOT be accepted by patient');

    // 7D: Cross-session isolation - if event is for another session, it is dropped
    docWs.onmessage({
      data: JSON.stringify({
        type: 'interpretation',
        session_id: 'sess-OTHER',
        recipient_role: 'doctor',
        sender_role: 'patient',
        timestamp: '2026-09-28T10:00:10Z',
        text: 'Other session text',
        source_language: 'hi',
        target_language: 'en',
        turn_id: 'turn-003',
      }),
    });
    assert.strictEqual(docAdapter.getState().turns.length, 0, 'Event for different session must be dropped');

    // 7E: Confirmation prompt and confirmation response
    docWs.onmessage({
      data: JSON.stringify({
        type: 'confirmation_prompt',
        session_id: 'sess-phase6a',
        recipient_role: 'doctor',
        sender_role: 'doctor',
        timestamp: '2026-09-28T10:01:00Z',
        prompt_text: 'Did you specify 500mg paracetamol twice daily?',
        turn_id: 'turn-confirm-1',
        category: 'medication',
      }),
    });
    assert.strictEqual(docAdapter.getState().currentTurn?.confirmation?.promptText, 'Did you specify 500mg paracetamol twice daily?');
    assert.strictEqual(docAdapter.getState().currentTurn?.confirmation?.outcome, 'pending');

    docAdapter.sendConfirmationResponse('turn-confirm-1', 'yes');
    const confirmMsg = JSON.parse(docWs.sentMessages[docWs.sentMessages.length - 1]);
    assert.strictEqual(confirmMsg.type, 'confirmation_response');
    assert.strictEqual(confirmMsg.turn_id, 'turn-confirm-1');
    assert.strictEqual(confirmMsg.response, 'yes');

    // 7F: Verified Fact (Doctor only)
    docWs.onmessage({
      data: JSON.stringify({
        type: 'verified_fact',
        session_id: 'sess-phase6a',
        recipient_role: 'doctor',
        sender_role: 'backend',
        timestamp: '2026-09-28T10:01:05Z',
        fact_id: 'fact-1',
        turn_id: 'turn-confirm-1',
        category: 'medication',
        source_wording: '500mg twice daily',
        translated_wording: '500 मिलीग्राम दिन में दो बार',
      }),
    });
    assert.strictEqual(docAdapter.getState().verifiedFacts.length, 1);
    assert.strictEqual(docAdapter.getState().verifiedFacts[0].id, 'fact-1');
    assert.strictEqual(docAdapter.getState().verifiedFacts[0].category, 'medication');

    // 7G: Repetition Request
    docWs.onmessage({
      data: JSON.stringify({
        type: 'repetition_request',
        session_id: 'sess-phase6a',
        recipient_role: 'doctor',
        sender_role: 'backend',
        timestamp: '2026-09-28T10:02:00Z',
        prompt_text: 'Speech was unclear. Please repeat the statement.',
        turn_id: 'turn-rep-1',
      }),
    });
    assert.strictEqual(docAdapter.getState().repetitionRequest?.promptText, 'Speech was unclear. Please repeat the statement.');

    // 7H: Emergency Alert
    docWs.onmessage({
      data: JSON.stringify({
        type: 'emergency_alert',
        session_id: 'sess-phase6a',
        recipient_role: 'doctor',
        sender_role: 'backend',
        timestamp: '2026-09-28T10:03:00Z',
        alert: 'Patient reported severe acute chest pain radiating to left arm.',
        turn_id: 'turn-emg-1',
      }),
    });
    assert.strictEqual(docAdapter.getState().emergencyAlert?.text, 'Patient reported severe acute chest pain radiating to left arm.');

    patWs.onmessage({
      data: JSON.stringify({
        type: 'emergency_alert',
        session_id: 'sess-phase6a',
        recipient_role: 'patient',
        sender_role: 'backend',
        timestamp: '2026-09-28T10:03:00Z',
        instruction: 'कृपया तुरंत आपातकालीन सहायता प्राप्त करें।',
        turn_id: 'turn-emg-1',
      }),
    });
    assert.strictEqual(patAdapter.getState().emergencyAlert?.text, 'कृपया तुरंत आपातकालीन सहायता प्राप्त करें।');

    // 7I: Unknown event type safety
    docWs.onmessage({
      data: JSON.stringify({
        type: 'future_unknown_event',
        session_id: 'sess-phase6a',
        recipient_role: 'doctor',
        sender_role: 'backend',
        timestamp: '2026-09-28T10:04:00Z',
        unknown_field: 12345,
      }),
    });
    assert.strictEqual(docAdapter.getState().status, 'active');

    docAdapter.destroy();
    patAdapter.destroy();

    console.log('✓ Phase 6A two-way text interpretation, role isolation, confirmations, verified facts, repetition requests, and emergency alerts verified.');
  }

  // -------------------------------------------------------------------------
  // TEST 8: BILINGUAL CONSULTATION RECORD PAGE & API INTEGRATION
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 8: BILINGUAL CONSULTATION RECORD PAGE & API INTEGRATION ---');
  {
    const { doc, win, container, mockSessionStorage } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    let recordApiCalled = false;
    let authHeaderSent = '';

    const mockRecordPayload = {
      session_id: 'rec-test-101',
      ordered_turn_ids: ['turn-1', 'turn-2'],
      verified_fact_ids: ['fact-1'],
      unresolved_turn_ids: ['turn-3'],
      generated_at: '2026-09-28T12:00:00Z',
      conversation: [
        {
          turn_id: 'turn-1',
          speaker_role: 'doctor',
          source_language: 'en',
          target_language: 'hi',
          source_text: 'Take 500mg of paracetamol after meals.',
          translated_text: 'भोजन के बाद 500 मिलीग्राम पैरासिटामोल लें।',
          timestamp: '2026-09-28T11:45:00Z',
          processing_status: 'completed',
          safety_state: 'verified',
          retry_count: 0,
        },
        {
          turn_id: 'turn-2',
          speaker_role: 'patient',
          source_language: 'hi',
          target_language: 'en',
          source_text: 'मुझे दिन में दो बार बुखार आ रहा है।',
          translated_text: 'I have had a fever twice a day.',
          timestamp: '2026-09-28T11:46:00Z',
          processing_status: 'completed',
          safety_state: 'standard',
          retry_count: 1,
        },
      ],
      verified_facts: [
        {
          fact_id: 'fact-1',
          turn_id: 'turn-1',
          category: 'medication',
          original_source_wording: 'Take 500mg of paracetamol after meals.',
          translated_wording: 'भोजन के बाद 500 मिलीग्राम पैरासिटामोल लें।',
          confirmation_reference: 'conf-1234',
          verified_at: '2026-09-28T11:45:30Z',
        },
      ],
      unresolved_items: [
        {
          item_id: 'unres-1',
          turn_id: 'turn-3',
          source_wording: 'I also take some other tablets... [muffled]',
          category: 'medication',
          reason: 'Speech unclear, speaker did not confirm clarification request.',
          timestamp: '2026-09-28T11:48:00Z',
        },
      ],
      latency_metrics: {
        sample_count: 2,
        min_seconds: 0.85,
        max_seconds: 1.45,
        median_seconds: 1.15,
        p95_seconds: 1.42,
        target_met: true,
      },
    };

    globalThis.fetch = async (url, options = {}) => {
      const strUrl = String(url);
      if (strUrl.includes('/api/sessions/rec-test-101/record')) {
        recordApiCalled = true;
        authHeaderSent = options.headers?.Authorization || '';
        return {
          ok: true,
          status: 200,
          json: async () => mockRecordPayload,
        };
      }
      if (strUrl.includes('/api/sessions/rec-404/record')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 'session_not_found', message: 'Session not found' } }),
        };
      }
      if (strUrl.includes('/api/sessions/rec-410/record')) {
        return {
          ok: false,
          status: 410,
          json: async () => ({ error: { code: 'session_expired', message: 'Session has expired' } }),
        };
      }
      if (strUrl.includes('/api/sessions/rec-401/record')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: 'invalid_access_token', message: 'Invalid or missing token' } }),
        };
      }
      if (strUrl.includes('/api/sessions/rec-empty/record')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...mockRecordPayload,
            session_id: 'rec-empty',
            conversation: [],
            verified_facts: [],
            unresolved_items: [],
          }),
        };
      }
      return { ok: false, status: 500 };
    };

    // 8A: Verify sessionApi.getSessionRecord directly
    const apiRes = await sessionApi.getSessionRecord('rec-test-101', 'test-doc-token');
    assert.strictEqual(recordApiCalled, true, 'Must call GET /api/sessions/{id}/record');
    assert.strictEqual(authHeaderSent, 'Bearer test-doc-token', 'Must pass Bearer token in Authorization header');
    assert.strictEqual(apiRes.session_id, 'rec-test-101');
    assert.strictEqual(apiRes.verified_facts.length, 1);
    assert.strictEqual(apiRes.conversation.length, 2);

    // 8B: Render Success State in ConsultationRecordPage
    mockSessionStorage.setItem('sahayak_token_rec-test-101', 'test-doc-token');
    const rootSuccess = createRoot(container);
    await act(async () => {
      rootSuccess.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/record/rec-test-101'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/record/:sessionId',
                element: React.createElement(ConsultationRecordPage),
              })
            )
          )
        )
      );
    });

    const successText = getAllText(container);
    // Session metadata
    assert.match(successText, /Consultation Record/, 'Must render Consultation Record title');
    assert.match(successText, /rec-test-101/, 'Must render session ID');
    assert.match(successText, /Official Bilingual Record/, 'Must render official record badge');
    assert.match(successText, /Prototype interpretation aid/, 'Must render clinical prototype notice');

    // Verified facts section
    assert.match(successText, /Verified Clinical Facts/, 'Must render Verified Clinical Facts heading');
    assert.match(successText, /Take 500mg of paracetamol after meals\./, 'Must render original source wording');
    assert.match(successText, /भोजन के बाद 500 मिलीग्राम पैरासिटामोल लें।/, 'Must render translated wording');
    assert.match(successText, /medication/i, 'Must render category tag');
    assert.match(successText, /conf-1234/, 'Must render confirmation reference');

    // Unresolved items section
    assert.match(successText, /Unresolved Items & Clarifications Needed/, 'Must render Unresolved Items section');
    assert.match(successText, /Speech unclear, speaker did not confirm clarification request\./, 'Must render failure reason');

    // Bilingual conversation turns
    assert.match(successText, /Doctor \(English\)/, 'Must render Doctor speaker role');
    assert.match(successText, /Patient \(Hindi\)/, 'Must render Patient speaker role');
    assert.match(successText, /मुझे दिन में दो बार बुखार आ रहा है।/, 'Must render patient source text');
    assert.match(successText, /I have had a fever twice a day\./, 'Must render patient translated text');
    assert.match(successText, /Resolved after 1 retry/, 'Must indicate turn retry resilience');

    // Metrics summary
    assert.match(successText, /Interpretation Performance & Latency/, 'Must render latency metrics section');
    assert.match(successText, /Target Met/i, 'Must render target met badge');

    // Action buttons
    assert.match(successText, /Print \/ Save Record/, 'Must render Print/Save button');
    assert.match(successText, /New Consultation/, 'Must render New Consultation link');

    await act(async () => {
      rootSuccess.unmount();
    });

    // 8C: Render 404 Not Found State
    const root404 = createRoot(container);
    await act(async () => {
      root404.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/record/rec-404?token=tok-404'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/record/:sessionId',
                element: React.createElement(ConsultationRecordPage),
              })
            )
          )
        )
      );
    });

    const notFoundText = getAllText(container);
    assert.match(notFoundText, /Consultation Record Not Found/, 'Must render Record Not Found title');
    assert.match(notFoundText, /rec-404/, 'Must cite missing session ID');

    await act(async () => {
      root404.unmount();
    });

    // 8D: Render 410 Expired State
    const root410 = createRoot(container);
    await act(async () => {
      root410.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/record/rec-410?token=tok-410'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/record/:sessionId',
                element: React.createElement(ConsultationRecordPage),
              })
            )
          )
        )
      );
    });

    const expiredText = getAllText(container);
    assert.match(expiredText, /Consultation Record Expired/, 'Must render Record Expired title');
    assert.match(expiredText, /retention period/i, 'Must explain clinical data retention policy');

    await act(async () => {
      root410.unmount();
    });

    // 8E: Render 401 Unauthorized State & Form
    const root401 = createRoot(container);
    await act(async () => {
      root401.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/record/rec-401'] }, // No token supplied
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/record/:sessionId',
                element: React.createElement(ConsultationRecordPage),
              })
            )
          )
        )
      );
    });

    const unauthText = getAllText(container);
    assert.match(unauthText, /Access Token Required/, 'Must prompt for access token when absent');
    assert.ok(queryByAttr(container, 'type', 'password'), 'Must render password/token input field');

    await act(async () => {
      root401.unmount();
    });

    // 8F: Render Empty Session Record
    const rootEmpty = createRoot(container);
    mockSessionStorage.setItem('sahayak_token_rec-empty', 'token-empty');
    await act(async () => {
      rootEmpty.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/record/rec-empty'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/record/:sessionId',
                element: React.createElement(ConsultationRecordPage),
              })
            )
          )
        )
      );
    });

    const emptyText = getAllText(container);
    assert.match(emptyText, /Consultation Record/, 'Must render record card');
    assert.match(emptyText, /No dialogue turns were recorded/, 'Must explain empty conversation history');

    await act(async () => {
      rootEmpty.unmount();
    });

    console.log('✓ ConsultationRecordPage successfully handles loading, success, 404 not-found, 410 expired, 401 unauthorized, empty state, and renders full bilingual clinical records.');
  }

  // -------------------------------------------------------------------------
  // TEST 9: PHASE 6B LIVE CONSULTATION SPEECH INPUT & DICTATION
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 9: PHASE 6B LIVE CONSULTATION SPEECH INPUT & DICTATION ---');
  {
    // 9A: ConsultationSpeechInput Unit Tests (Doctor & Patient roles, phrase populating, dispatch, reset)
    const { doc, win, container, mockSessionStorage } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    let dispatchedText = null;
    const mockSend = (t) => {
      dispatchedText = t;
      return true;
    };

    // Render standalone Doctor input
    const rootDocInput = createRoot(container);
    await act(async () => {
      rootDocInput.render(
        React.createElement(ConsultationSpeechInput, {
          role: 'doctor',
          onSendSpeech: mockSend,
          connectionStatus: 'connected',
          sessionStatus: 'active',
          activityState: 'idle',
        })
      );
    });

    const docInputText = getAllText(container);
    assert.match(docInputText, /Quick phrases:/, 'Doctor input must render quick phrases header');
    assert.match(docInputText, /How long have you had this fever\?/, 'Must render first doctor preset phrase');
    assert.match(docInputText, /Take this medicine twice a day after food\./, 'Must render second doctor preset phrase');

    // Click quick phrase button
    const phraseBtns = queryAllByAttr(container, 'type', 'button').filter((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__chip')
    );
    assert.strictEqual(phraseBtns.length, 2, 'Doctor must have 2 quick phrases');

    await act(async () => {
      phraseBtns[0].dispatchEvent({ type: 'click' });
    });

    // Clicking phrase populates textarea but does NOT automatically send
    const textarea = queryByAttr(container, 'id', 'sahayak-speech-textarea-doctor');
    assert.ok(textarea, 'Doctor textarea must be present');
    assert.strictEqual(textarea.value, DOCTOR_QUICK_PHRASES[0], 'Quick phrase must populate textarea');
    assert.strictEqual(dispatchedText, null, 'Populating quick phrase must NOT send automatically');

    // Submit via Send button
    const sendBtn = queryAllByAttr(container, 'type', 'button').find((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__btn--send')
    );
    assert.ok(sendBtn, 'Send button must be present');

    await act(async () => {
      sendBtn.dispatchEvent({ type: 'click' });
    });

    assert.strictEqual(dispatchedText, DOCTOR_QUICK_PHRASES[0], 'Send button must dispatch speech text');
    assert.strictEqual(textarea.value, '', 'Input must be cleared after successful dispatch');

    // 9B: Whitespace-only submission is blocked
    dispatchedText = null;
    await act(async () => {
      textarea.value = '   \t  \n  ';
      textarea.dispatchEvent({ type: 'change', target: { value: '   \t  \n  ' } });
    });
    await act(async () => {
      sendBtn.dispatchEvent({ type: 'click' });
    });
    assert.strictEqual(dispatchedText, null, 'Whitespace-only submission must be blocked');

    // 9C: Disconnected state disables input and renders warning notice
    await act(async () => {
      rootDocInput.render(
        React.createElement(ConsultationSpeechInput, {
          role: 'doctor',
          onSendSpeech: mockSend,
          connectionStatus: 'disconnected',
          sessionStatus: 'active',
          activityState: 'idle',
        })
      );
    });

    const disconnText = getAllText(container);
    assert.match(disconnText, /Disconnected from consultation session/, 'Must explain disconnected state');
    const sendBtnDisconn = queryAllByAttr(container, 'type', 'button').find((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__btn--send')
    );
    assert.ok(sendBtnDisconn.disabled || sendBtnDisconn.getAttribute('disabled') !== null, 'Send button must be disabled when disconnected');

    await act(async () => {
      rootDocInput.unmount();
    });

    // 9D: Patient role renders Hindi quick phrases and submits Hindi text
    let patDispatchedText = null;
    const patSend = (t) => {
      patDispatchedText = t;
      return true;
    };

    const rootPatInput = createRoot(container);
    await act(async () => {
      rootPatInput.render(
        React.createElement(ConsultationSpeechInput, {
          role: 'patient',
          onSendSpeech: patSend,
          connectionStatus: 'connected',
          sessionStatus: 'active',
          activityState: 'idle',
        })
      );
    });

    const patInputText = getAllText(container);
    assert.match(patInputText, /त्वरित वाक्य:/, 'Patient input must render Hindi quick phrases header');
    assert.match(patInputText, /मुझे दो दिन से बुखार है/, 'Must render first Hindi preset phrase');
    assert.match(patInputText, /मुझे इस दवा से एलर्जी है।/, 'Must render second Hindi preset phrase');

    const patPhraseBtns = queryAllByAttr(container, 'type', 'button').filter((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__chip')
    );
    assert.strictEqual(patPhraseBtns.length, 2, 'Patient must have 2 quick phrases');

    await act(async () => {
      patPhraseBtns[0].dispatchEvent({ type: 'click' });
    });

    const patTextarea = queryByAttr(container, 'id', 'sahayak-speech-textarea-patient');
    assert.strictEqual(patTextarea.value, PATIENT_QUICK_PHRASES[0], 'Hindi phrase must populate textarea');
    assert.strictEqual(patDispatchedText, null, 'Hindi phrase must NOT send automatically');

    const patSendBtn = queryAllByAttr(container, 'type', 'button').find((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__btn--send')
    );
    await act(async () => {
      patSendBtn.dispatchEvent({ type: 'click' });
    });

    assert.strictEqual(patDispatchedText, PATIENT_QUICK_PHRASES[0], 'Send button must dispatch Hindi text');
    assert.strictEqual(patTextarea.value, '', 'Hindi textarea must clear after dispatch');

    await act(async () => {
      rootPatInput.unmount();
    });

    // 9E: Progressive Enhancement - Web Speech API
    // Unsupported browser:
    win.SpeechRecognition = undefined;
    win.webkitSpeechRecognition = undefined;
    const rootUnsupported = createRoot(container);
    await act(async () => {
      rootUnsupported.render(
        React.createElement(ConsultationSpeechInput, {
          role: 'doctor',
          onSendSpeech: mockSend,
          connectionStatus: 'connected',
          sessionStatus: 'active',
        })
      );
    });

    const dictateBtnUnsupported = queryAllByAttr(container, 'type', 'button').find((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__btn--dictate')
    );
    assert.strictEqual(dictateBtnUnsupported, undefined, 'Must not render broken mic button when SpeechRecognition is unsupported');

    await act(async () => {
      rootUnsupported.unmount();
    });

    // Supported browser:
    class MockSpeechRecognition {
      static instances = [];
      constructor() {
        this.continuous = false;
        this.interimResults = true;
        this.lang = '';
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this.aborted = false;
        MockSpeechRecognition.instances.push(this);
      }
      start() {
        if (this.onstart) this.onstart({});
      }
      stop() {
        if (this.onend) this.onend({});
      }
      abort() {
        this.aborted = true;
        if (this.onend) this.onend({});
      }
    }

    win.SpeechRecognition = MockSpeechRecognition;
    const rootSupported = createRoot(container);
    await act(async () => {
      rootSupported.render(
        React.createElement(ConsultationSpeechInput, {
          role: 'doctor',
          onSendSpeech: mockSend,
          connectionStatus: 'connected',
          sessionStatus: 'active',
        })
      );
    });

    const dictateBtnSupported = queryAllByAttr(container, 'type', 'button').find((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__btn--dictate')
    );
    assert.ok(dictateBtnSupported, 'Must render dictation button when SpeechRecognition is supported');

    // Start dictation
    await act(async () => {
      dictateBtnSupported.dispatchEvent({ type: 'click' });
    });

    const activeRec = MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
    assert.ok(activeRec, 'Must instantiate SpeechRecognition');
    assert.strictEqual(activeRec.lang, 'en-US', 'Doctor dictation language must default to en-US');

    const listeningBadge = getAllText(container);
    assert.match(listeningBadge, /Listening in English/, 'Must indicate active dictation');

    // Simulate recognition result
    await act(async () => {
      activeRec.onresult({
        resultIndex: 0,
        results: [
          [{ transcript: 'Patient has reported mild chest pain', confidence: 0.95 }],
        ],
      });
    });

    const supportedTextarea = queryByAttr(container, 'id', 'sahayak-speech-textarea-doctor');
    assert.strictEqual(supportedTextarea.value, 'Patient has reported mild chest pain', 'Dictation result must populate textarea for review');

    // Stop dictation
    await act(async () => {
      dictateBtnSupported.dispatchEvent({ type: 'click' });
    });
    assert.ok(!getAllText(container).includes('Listening in English'), 'Listening badge must be removed on stop');

    // Graceful error handling (permission denied)
    await act(async () => {
      dictateBtnSupported.dispatchEvent({ type: 'click' });
    });
    const errorRec = MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
    await act(async () => {
      errorRec.onerror({ error: 'not-allowed' });
    });

    const errorMsg = getAllText(container);
    assert.match(errorMsg, /Microphone permission was denied/, 'Must display accessible permission error');

    // Unmount cleanup when active
    await act(async () => {
      dictateBtnSupported.dispatchEvent({ type: 'click' });
    });
    const unmountRec = MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];
    await act(async () => {
      rootSupported.unmount();
    });
    assert.strictEqual(unmountRec.aborted, true, 'Unmounting must abort active SpeechRecognition');

    // 9F: Full Integration in DoctorConsultationPage
    mockSessionStorage.setItem('sahayak_token_doc-room-9', 'token-doc-room-9');
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'doc-room-9',
        status: 'active',
        created_at: '2026-09-28T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-28T10:30:00Z',
        participants: [
          { participant_id: 'p-doc', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
          { participant_id: 'p-pat', role: 'patient', connection_status: 'connected', microphone_status: 'granted' },
        ],
      }),
    });

    const rootDocRoom = createRoot(container);
    await act(async () => {
      rootDocRoom.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/doctor/doc-room-9'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/doctor/:sessionId',
                element: React.createElement(DoctorConsultationPage),
              })
            )
          )
        )
      );
    });

    // Wait for mock WebSocket connection inside act
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    // Find quick phrases in Doctor Consultation room
    const docRoomChips = queryAllByAttr(container, 'type', 'button').filter((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__chip')
    );
    assert.ok(docRoomChips.length >= 2, 'Doctor room must render quick phrases');

    await act(async () => {
      docRoomChips[1].dispatchEvent({ type: 'click' });
    });

    const docRoomTextarea = queryByAttr(container, 'id', 'sahayak-speech-textarea-doctor');
    assert.strictEqual(docRoomTextarea.value, DOCTOR_QUICK_PHRASES[1]);

    const docRoomSendBtn = queryAllByAttr(container, 'type', 'button').find((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__btn--send')
    );
    assert.ok(docRoomSendBtn, 'Doctor room must have send button');

    await act(async () => {
      docRoomSendBtn.dispatchEvent({ type: 'click' });
    });

    // Verify WebSocket message dispatched from doctor consultation room
    const latestDocWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    assert.ok(latestDocWs.sentMessages.length > 0, 'WebSocket must have sent message');
    const sentPayload = JSON.parse(latestDocWs.sentMessages[latestDocWs.sentMessages.length - 1]);
    assert.strictEqual(sentPayload.type, 'speech');
    assert.strictEqual(sentPayload.text, DOCTOR_QUICK_PHRASES[1]);
    assert.strictEqual(docRoomTextarea.value, '', 'Doctor room textarea must be cleared after sending');

    await act(async () => {
      rootDocRoom.unmount();
    });

    // 9G: Full Integration in PatientConsultationPage
    mockSessionStorage.setItem('sahayak_token_pat-room-9', 'token-pat-room-9');
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: 'pat-room-9',
        status: 'active',
        created_at: '2026-09-28T10:00:00Z',
        doctor_language: 'en',
        patient_language: 'hi',
        retention_expires_at: '2026-09-28T10:30:00Z',
        participants: [
          { participant_id: 'p-doc', role: 'doctor', connection_status: 'connected', microphone_status: 'granted' },
          { participant_id: 'p-pat', role: 'patient', connection_status: 'connected', microphone_status: 'granted' },
        ],
      }),
    });

    const rootPatRoom = createRoot(container);
    await act(async () => {
      rootPatRoom.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/patient/pat-room-9'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/patient/:sessionId',
                element: React.createElement(PatientConsultationPage),
              })
            )
          )
        )
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const patRoomChips = queryAllByAttr(container, 'type', 'button').filter((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__chip')
    );
    assert.ok(patRoomChips.length >= 2, 'Patient room must render Hindi quick phrases');

    await act(async () => {
      patRoomChips[0].dispatchEvent({ type: 'click' });
    });

    const patRoomTextarea = queryByAttr(container, 'id', 'sahayak-speech-textarea-patient');
    assert.strictEqual(patRoomTextarea.value, PATIENT_QUICK_PHRASES[0]);

    const patRoomSendBtn = queryAllByAttr(container, 'type', 'button').find((b) =>
      b.getAttribute('class')?.includes('sahayak-speech-input__btn--send')
    );
    assert.ok(patRoomSendBtn, 'Patient room must have send button');

    await act(async () => {
      patRoomSendBtn.dispatchEvent({ type: 'click' });
    });

    const latestPatWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    assert.ok(latestPatWs.sentMessages.length > 0, 'Patient WebSocket must have sent message');
    const sentPatPayload = JSON.parse(latestPatWs.sentMessages[latestPatWs.sentMessages.length - 1]);
    assert.strictEqual(sentPatPayload.type, 'speech');
    assert.strictEqual(sentPatPayload.text, PATIENT_QUICK_PHRASES[0]);
    assert.strictEqual(patRoomTextarea.value, '', 'Patient room textarea must be cleared after sending');

    await act(async () => {
      rootPatRoom.unmount();
    });

    console.log('✓ Phase 6B Consultation speech input, quick phrases, Web Speech API progressive enhancement, and consultation room WebSocket integration verified.');
  }

  console.log('\n================================================================');
  console.log('ALL FRONTEND REGRESSION, LIFECYCLE & RECORD TESTS PASSED');
  console.log('================================================================\n');
}

runConsultationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
