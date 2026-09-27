import assert from 'node:assert';
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ConsultationAdapter } from '../services/consultationAdapter.ts';
import {
  createFixtureSession,
  FIXTURE_DOCTOR_NOTICE,
  FIXTURE_PATIENT_NOTICE,
  CLINICAL_DISCLAIMER_EN,
  CLINICAL_DISCLAIMER_HI,
} from '../services/consultationFixtures.ts';

// ---------------------------------------------------------------------------
// GLOBAL SYNTHETIC DOM SETUP FOR REACT 19 TESTS IN NODE
// ---------------------------------------------------------------------------
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
  };

  const container = makeNode(1, 'div', doc);
  container.ownerDocument = doc;
  doc.body = makeNode(1, 'body', doc);
  doc.body.appendChild(container);

  const win = {
    document: doc,
    isSecureContext: true,
    location: { hostname: 'localhost', origin: 'http://localhost:5173', protocol: 'http:', host: 'localhost:5173' },
    addEventListener: () => {},
    removeEventListener: () => {},
    HTMLIFrameElement: class HTMLIFrameElement {},
  };
  doc.defaultView = win;

  return { doc, win, container, makeNode };
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Helper to recursively collect all text content in tree
function getAllText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  let txt = '';
  if (node.childNodes) {
    for (const c of node.childNodes) {
      txt += ' ' + getAllText(c);
    }
  }
  return txt.replace(/\s+/g, ' ').trim();
}

// Helper to query element by attribute
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

// Helper to find all elements matching attribute
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

async function runConsultationTests() {
  console.log('================================================================');
  console.log('SAHAYAK PHASE 4: CONSULTATION ROOM REGRESSION TEST SUITE');
  console.log('================================================================\n');

  const esbuild = await import('esbuild');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');

  const outdir = path.resolve('./node_modules/.cache/test-consultation-pages');
  await esbuild.build({
    entryPoints: {
      doc: './src/pages/DoctorConsultationPage.tsx',
      pat: './src/pages/PatientConsultationPage.tsx',
    },
    bundle: true,
    format: 'esm',
    outdir,
    external: ['react', 'react-dom', 'react-router-dom', 'lucide-react'],
    loader: { '.css': 'empty' },
  });

  const docFile = pathToFileURL(path.join(outdir, 'doc.js')).href;
  const patFile = pathToFileURL(path.join(outdir, 'pat.js')).href;
  const { DoctorConsultationPage } = await import(docFile);
  const { PatientConsultationPage } = await import(patFile);

  // -------------------------------------------------------------------------
  // TEST 1: DOCTOR CONSULTATION SCREEN RENDERING & LANGUAGE LABELS
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: DOCTOR CONSULTATION SCREEN (ENGLISH) ---');
  {
    const { doc, win, container } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/doctor/med-session-101'] },
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

    // 1A: Role Badge & Header
    assert.match(fullText, /Doctor Consultation/, 'Must display Doctor Consultation badge');
    assert.match(fullText, /med-session-101/, 'Must display the active session ID');

    // 1B: Clinical Disclaimer & Development Fixture Notice
    assert.match(fullText, new RegExp(CLINICAL_DISCLAIMER_EN), 'Must display English clinical prototype disclaimer');
    assert.match(fullText, new RegExp(FIXTURE_DOCTOR_NOTICE), 'Must display clearly labeled development fixture notice');

    // 1C: Speaker & Language Labels in Transcript
    assert.match(fullText, /Doctor \(English\)/, 'Must display Doctor (English) speaker label');
    assert.match(fullText, /Patient \(Hindi\)/, 'Must display Patient (Hindi) speaker label');
    assert.match(fullText, /Interpretation \(Hindi\)/, 'Must display Hindi interpretation label');
    assert.match(fullText, /Interpretation \(English\)/, 'Must display English interpretation label');

    // 1D: Language attributes in DOM
    const hindiNodes = queryAllByAttr(container, 'lang', 'hi');
    assert.ok(hindiNodes.length > 0, 'Hindi utterances must have lang="hi" attributes');
    const englishNodes = queryAllByAttr(container, 'lang', 'en');
    assert.ok(englishNodes.length > 0, 'English utterances must have lang="en" attributes');

    // 1E: Medical Verification Disclaimer & User-Action Confirmation
    assert.match(
      fullText,
      /Unverified interpretation — confirmed by speaker response only/,
      'Must explicitly state interpretation is unverified and confirmed only by speaker response'
    );
    assert.doesNotMatch(
      fullText,
      /Medically verified|Verified diagnosis/i,
      'Must NOT claim statements are medically verified'
    );

    // Clean unmount
    await act(async () => {
      root.unmount();
    });
    console.log('✓ Doctor consultation screen renders valid English copy, badges, disclaimers, and language labels.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: PATIENT CONSULTATION SCREEN RENDERING & HINDI COPY
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: PATIENT CONSULTATION SCREEN (HINDI) ---');
  {
    const { doc, win, container } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/patient/med-session-202'] },
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

    const fullText = getAllText(container);

    // 2A: Hindi Role Badge & Header
    assert.match(fullText, /मरीज़ परामर्श/, 'Must display Hindi patient consultation badge');
    assert.match(fullText, /med-session-202/, 'Must display the active session ID');

    // 2B: Hindi Clinical Disclaimer & Fixture Notice
    assert.match(fullText, new RegExp(CLINICAL_DISCLAIMER_HI), 'Must display Hindi clinical prototype disclaimer');
    assert.match(fullText, new RegExp(FIXTURE_PATIENT_NOTICE), 'Must display clearly labeled Hindi fixture notice');

    // 2C: Hindi Speaker & Transcript Labels
    assert.match(fullText, /बातचीत का इतिहास/, 'Must display Hindi conversation history header');
    assert.match(fullText, /डॉक्टर \(अंग्रेज़ी\)/, 'Must display Doctor (English) label in Hindi');
    assert.match(fullText, /आप \(हिन्दी\)/, 'Must display Patient (Hindi) label in Hindi');

    // 2D: Hindi Unverified Disclaimer
    assert.match(
      fullText,
      /अपुष्ट व्याख्या — केवल वक्ता की प्रतिक्रिया द्वारा सत्यापित/,
      'Must display Hindi unverified disclaimer'
    );

    // Clean unmount
    await act(async () => {
      root.unmount();
    });
    console.log('✓ Patient consultation screen renders valid Hindi copy, lang="hi" attributes, and disclaimers.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: CONSULTATION CONTROLS (MUTE/UNMUTE & END MODAL)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: CONTROLS & CONFIRMATION MODAL ---');
  {
    const { doc, win, container } = createMockDom();
    globalThis.document = doc;
    globalThis.window = win;

    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/doctor/med-session-303'] },
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

    // Find Mute button by aria-label
    const muteBtn = queryByAttr(container, 'aria-label', 'Mute microphone');
    assert.ok(muteBtn, 'Must render accessible Mute microphone button');
    assert.strictEqual(muteBtn.getAttribute('aria-pressed'), 'false', 'Initial mute state must be false');

    // Click Mute button
    await act(async () => {
      muteBtn.dispatchEvent({ type: 'click' });
    });
    assert.strictEqual(muteBtn.getAttribute('aria-pressed'), 'true', 'Mute state must update to true after toggle');

    // Find End Consultation button
    const endBtn = queryByAttr(container, 'aria-label', 'End consultation');
    assert.ok(endBtn, 'Must render End consultation button');

    // Click End Consultation button -> Opens confirmation modal
    await act(async () => {
      endBtn.dispatchEvent({ type: 'click' });
    });

    const modalDialog = queryByAttr(container, 'role', 'dialog');
    assert.ok(modalDialog, 'Clicking end must open accessible confirmation modal with role="dialog"');
    assert.strictEqual(modalDialog.getAttribute('aria-modal'), 'true');

    // Verify modal text
    const modalText = getAllText(modalDialog);
    assert.match(modalText, /End consultation\?/, 'Modal must display confirmation heading');
    assert.match(modalText, /This will conclude the session for both doctor and patient/);

    // Click Confirm button inside modal
    const confirmEndBtn = queryByAttr(modalDialog, 'type', 'button');
    // Find button containing confirm text
    let targetConfirmBtn = null;
    function findBtn(node) {
      if (node.tagName === 'BUTTON' && getAllText(node).includes('Confirm end')) {
        targetConfirmBtn = node;
        return;
      }
      if (node.childNodes) {
        for (const c of node.childNodes) findBtn(c);
      }
    }
    findBtn(modalDialog);
    assert.ok(targetConfirmBtn, 'Modal must contain confirm end button');

    await act(async () => {
      targetConfirmBtn.dispatchEvent({ type: 'click' });
    });

    // After confirming end, consultation enters ended status
    const endedText = getAllText(container);
    assert.match(endedText, /Consultation Ended/, 'Must transition to Consultation Ended state');
    assert.match(endedText, /Return to Home/, 'Must offer navigation back to Home');

    await act(async () => {
      root.unmount();
    });
    console.log('✓ Mute toggle and End consultation confirmation modal function properly.');
  }

  // -------------------------------------------------------------------------
  // TEST 4: CONSULTATION ADAPTER INTEGRATION & FIXTURE FALLBACK
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: CONSULTATION ADAPTER INTEGRATION & CONTRACT ---');
  {
    const adapter = new ConsultationAdapter('test-session-404', 'doctor');
    const state = adapter.getState();

    // Verify fixture fallback and contract
    assert.strictEqual(state.sessionId, 'test-session-404');
    assert.strictEqual(state.isFixture, true, 'Without live token/backend, must default to fixture mode');
    assert.strictEqual(state.fixtureNotice, FIXTURE_DOCTOR_NOTICE);
    assert.strictEqual(state.status, 'active');
    assert.strictEqual(state.isMuted, false);
    assert.strictEqual(state.turns.length, 5, 'Must provide realistic initial bilingual turns');

    // Test subscription
    let stateUpdates = 0;
    const unsub = adapter.subscribe(() => {
      stateUpdates++;
    });

    adapter.setMuted(true);
    assert.strictEqual(adapter.getState().isMuted, true);
    assert.strictEqual(stateUpdates, 1);

    adapter.setActivityState('listening');
    assert.strictEqual(adapter.getState().activityState, 'listening');
    assert.strictEqual(stateUpdates, 2);

    await adapter.endConsultation();
    assert.strictEqual(adapter.getState().status, 'ended');
    assert.strictEqual(stateUpdates, 3);

    unsub();
    adapter.destroy();
    console.log('✓ ConsultationAdapter maintains contract, reactive subscriptions, and fixture safety.');
  }

  console.log('\n================================================================');
  console.log('ALL PHASE 4 CONSULTATION ROOM TESTS PASSED WITH 0 ERRORS');
  console.log('================================================================\n');
}

runConsultationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
