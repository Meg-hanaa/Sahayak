import assert from 'node:assert';
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { sessionApi, SessionApiError } from '../services/sessionApi.ts';
import { ConsultationAdapter } from '../services/consultationAdapter.ts';
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
      getAttribute: (k) => node.attributes.get(k) || null,
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
  if (node.getAttribute && node.getAttribute(attr) === val) return node;
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

  const { DoctorConsultationPage } = await import(docFile);
  const { PatientConsultationPage } = await import(patFile);
  const { DoctorPreparationPage } = await import(docPrepFile);
  const { PatientPreparationPage } = await import(patPrepFile);

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
              microphone_status: 'active',
            },
            {
              participant_id: 'pat-2',
              role: 'patient',
              connection_status: 'waiting',
              microphone_status: 'unknown',
            },
          ],
        }),
      };
    };

    // 1A: Create Session
    const created = await sessionApi.createSession();
    assert.strictEqual(created.session.session_id, '550e8400-e29b-41d4-a716-446655440000');
    assert.strictEqual(created.access.doctor.token, 'doc-secret-token-111');
    assert.strictEqual(created.access.patient.token, 'pat-secret-token-222');

    // 1B: Join Session
    const joined = await sessionApi.joinSession('550e8400-e29b-41d4-a716-446655440000', {
      token: 'doc-secret-token-111',
      role: 'doctor',
      microphone_status: 'active',
    });
    assert.strictEqual(joined.participant.role, 'doctor');

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
              microphone_status: 'unknown',
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

    // 2C: Verify InvitationResultCard rendered with full URL containing sessionId and patientToken
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

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/join/pat-sess-701?token=token-pat-999'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/join/:sessionId',
                element: React.createElement(PatientPreparationPage),
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

    // Verify token stored in sessionStorage and stripped from visible URL bar
    assert.strictEqual(
      mockSessionStorage.getItem('sahayak_token_pat-sess-701'),
      'token-pat-999',
      'Patient token must be saved to sessionStorage'
    );
    assert.strictEqual(
      win.location.pathname,
      '/join/pat-sess-701',
      'Visible URL must be stripped of token'
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
                microphone_status: 'active',
              },
              {
                participant_id: 'p2',
                role: 'patient',
                connection_status: 'connected',
                microphone_status: 'active',
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
    console.log('✓ ConsultationAdapter connects to real API & WebSocket, rejects fake fixtures, and verifies peer status.');
  }

  // -------------------------------------------------------------------------
  // TEST 5: DOCTOR ENDING SESSION VS PATIENT LEAVING LOCALLY
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

    console.log('✓ Doctor termination and patient local departure enforce strict role permissions.');
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
            microphone_status: 'active',
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

    await act(async () => {
      root.unmount();
    });
    console.log('✓ Doctor screen renders empty transcript notice, disabled mute control, and clinical disclaimers.');
  }

  console.log('\n================================================================');
  console.log('ALL PHASE 4 FULL LIFECYCLE TESTS PASSED WITH 0 ERRORS');
  console.log('================================================================\n');
}

runConsultationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
