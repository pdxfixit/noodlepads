// Feedback (Ben, 2026-10-19: "next to the version in about, there should be a
// feedback button… which opens a dialog to send the feedback"). ⚙️ Settings
// → About → Feedback asks the grown-up sum first, at every level (grown-up.js:
// kids use the app), then opens #feedback-dialog: a box to type in, Send and
// Cancel. Send posts what was typed, as typed, to /api/feedback (the Worker's
// shared handleFeedback stores it in R2; the telemetry runner's daily pull
// moves it to Ben's notes, kept 90 days at most).
//
// What a grown-up types here goes only to /api/feedback: never into the event
// log, problem reports or usage events. That is why it is sent as typed,
// without log-clean.js's redaction: the dialog asks for no names or contact
// details, and nothing else carries the text. Only noodlepads.com sends; a dev
// copy says it can't.

import { setupDialog, openDialog } from './dialogs.js';
import { askSum } from './grown-up.js';
import { state } from './state.js';
import { LIVE_HOST } from './log-send.js';

export const SEND_URL = '/api/feedback';
export const MAX_CHARS = 2000;     // the box's maxlength
export const MAX_BYTES = 4096;     // the Worker's cap (handleFeedback MAX_FEEDBACK), in UTF-8 bytes

// What each outcome says under the box.
export const SAY = {
  sending: 'Sending…',
  sent: 'Thanks! Sent. 💌',
  failed: "Couldn't send. Please try again.",
  'not-live': "Feedback sends only from noodlepads.com, not from this copy.",
  'too-long': "That's too long to send. Please make it shorter.",
};

// The X-App-Version header: the deployed commit, or 'dev' for anything the
// Worker would refuse (a dev copy, a missing version.json).
export const appVersion = (v) => (typeof v === 'string' && /^[0-9A-Za-z.+_]{1,32}$/.test(v) ? v : 'dev');

// The sending, apart from the page so it can be tested.
// deps: {fetch, live(), version(), newId()}
// send(text) resolves to 'sent', 'failed', 'not-live', 'too-long' or 'empty';
// it never throws. A message keeps its id until it gets through, so a retry of
// the same text overwrites itself in the bucket; new text gets a new id.
export function createFeedbackSender(deps) {
  let id = null;
  let idFor = null;   // the text `id` was made for
  return async function send(text) {
    if (typeof text !== 'string' || !text.trim()) return 'empty';
    if (!deps.live()) return 'not-live';
    if (new TextEncoder().encode(text).length > MAX_BYTES) return 'too-long';
    if (id === null || idFor !== text) { id = deps.newId(); idFor = text; }
    try {
      const res = await deps.fetch(SEND_URL, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'text/plain;charset=UTF-8', 'x-feedback': id, 'x-app-version': appVersion(deps.version()) },
        body: text,
      });
      if (res?.status !== 204) return 'failed';
      id = null;
      idFor = null;
      return 'sent';
    } catch {
      return 'failed';
    }
  };
}

const el = {};
let sending = false;

// Send is pressable only with something typed, and not while sending.
function showSend() {
  el.send.disabled = sending || !el.text.value.trim();
}

function say(what) {
  el.status.textContent = SAY[what] ?? '';
}

function openFeedback() {
  // A draft kept from earlier this visit stays (it is never stored); the last word under it goes.
  say('');
  showSend();
  openDialog(el.dialog, { focus: el.text, returnTo: () => el.open });
}

// Call once at start-up.
export function initFeedback({ fetch = (...a) => globalThis.fetch(...a), live = () => globalThis.location?.hostname === LIVE_HOST } = {}) {
  const q = (s) => document.querySelector(s);
  Object.assign(el, {
    open: q('#feedback-open'), dialog: q('#feedback-dialog'), text: q('#feedback-text'),
    status: q('#feedback-status'), send: q('#feedback-send'),
  });
  const send = createFeedbackSender({
    fetch, live,
    version: () => state.version,
    newId: () => globalThis.crypto.randomUUID(),
  });
  setupDialog(el.dialog);
  el.open.addEventListener('click', () => askSum({ owner: 'feedback', stay: true, right: openFeedback }));
  el.text.addEventListener('input', () => { showSend(); if (!sending) say(''); });
  el.send.addEventListener('click', async () => {
    const text = el.text.value;
    if (sending || !text.trim()) return;
    sending = true;
    showSend();
    say('sending');
    const got = await send(text);
    sending = false;
    if (got === 'sent' && el.text.value === text) el.text.value = '';
    say(got);
    showSend();
  });
}
