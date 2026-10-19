// Feedback (Ben, 2026-10-19): ⚙️ Settings → About → Feedback asks the
// grown-up sum at every level, then opens a centered dialog that sends what
// was typed, as typed, to /api/feedback, only from noodlepads.com. The text
// never reaches the event log, problem reports or usage events. The sending
// first (web/feedback.js), then the real app on the stand-in page.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { appVersion, createFeedbackSender, SAY, SEND_URL, MAX_BYTES } from '../web/feedback.js';

const web = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');

// ── The sending ──

function sender({ live = true, version = 'fd576a9', answer = () => ({ status: 204 }) } = {}) {
  const calls = [];
  let n = 0;
  const send = createFeedbackSender({
    fetch: async (url, opts) => { calls.push({ url, opts }); return answer(calls.length); },
    live: () => live,
    version: () => version,
    newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
  });
  return { send, calls };
}

test('the version header is the deployed commit, or "dev" for anything the Worker would refuse', () => {
  assert.equal(appVersion('fd576a9'), 'fd576a9');
  assert.equal(appVersion('1.0.3+dirty'), '1.0.3+dirty');
  for (const bad of ['dev copy', '', 'a'.repeat(33), 'v1/../x', null, undefined, 7]) assert.equal(appVersion(bad), 'dev', String(bad));
});

test('Send posts the text as typed, without cookies, with its id and the version; 204 is sent', async () => {
  const { send, calls } = sender();
  const text = '  The burp pad is the best.\nCould Beats have a cowbell? 🐄  ';
  assert.equal(await send(text), 'sent');
  assert.equal(calls.length, 1);
  const { url, opts } = calls[0];
  assert.equal(url, SEND_URL);
  assert.equal(url, '/api/feedback');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.credentials, 'omit');
  assert.deepEqual(opts.headers, { 'content-type': 'text/plain;charset=UTF-8', 'x-feedback': '00000000-0000-4000-8000-000000000001', 'x-app-version': 'fd576a9' });
  assert.equal(opts.body, text, 'as typed: nothing trimmed, nothing redacted');
});

test('a failed send keeps the id for a retry of the same text; new text or a success gets a new one', async () => {
  const { send, calls } = sender({ answer: (n) => (n <= 2 ? { status: 503 } : { status: 204 }) });
  assert.equal(await send('Hello'), 'failed');
  assert.equal(await send('Hello'), 'failed');
  assert.equal(calls[0].opts.headers['x-feedback'], calls[1].opts.headers['x-feedback'], 'a retry overwrites itself');
  assert.equal(await send('Hello'), 'sent');
  assert.equal(calls[2].opts.headers['x-feedback'], calls[0].opts.headers['x-feedback']);
  assert.equal(await send('Hello'), 'sent');
  assert.notEqual(calls[3].opts.headers['x-feedback'], calls[2].opts.headers['x-feedback'], 'a fresh id after a success');
  const other = sender({ answer: () => ({ status: 500 }) });
  await other.send('One');
  await other.send('One, edited');
  assert.notEqual(other.calls[0].opts.headers['x-feedback'], other.calls[1].opts.headers['x-feedback'], 'new text, new id');
});

test('nothing is sent when empty, from a dev copy, or over the Worker\'s byte cap; a thrown fetch is a failure', async () => {
  const { send, calls } = sender();
  assert.equal(await send(''), 'empty');
  assert.equal(await send('   \n '), 'empty');
  assert.equal(await send('🐙'.repeat(MAX_BYTES / 4 + 1)), 'too-long', '2000 characters can be more than 4096 bytes');
  assert.equal(calls.length, 0);
  assert.equal(await sender({ live: false }).send('Hello'), 'not-live');
  const dev = sender({ version: 'dev' });
  await dev.send('Hello');
  assert.equal(dev.calls[0].opts.headers['x-app-version'], 'dev');
  const broken = createFeedbackSender({ fetch: async () => { throw new TypeError('offline'); }, live: () => true, version: () => 'dev', newId: () => 'x' });
  assert.equal(await broken('Hello'), 'failed');
  assert.equal((await sender({ answer: () => ({ status: 200 }) }).send('Hello')), 'failed', 'only 204 means stored');
});

// The text goes only to /api/feedback: feedback.js has no way into the log,
// problem reports or usage events.
test('feedback.js never reaches the event log, problem reports or usage events', () => {
  const code = web('feedback.js');
  const imports = [...code.matchAll(/from '\.\/([a-z0-9-]+)\.js'/g)].map((m) => m[1]);
  for (const banned of ['log', 'log-clean', 'telemetry', 'track-page', 'usage', 'events-client', 'cloud', 'cloud-api', 'store']) {
    assert.ok(!imports.includes(banned), `feedback.js imports ${banned}.js`);
  }
  assert.doesNotMatch(code, /logEvent|sendBeacon|localStorage|indexedDB/);
});

test('the dialog is centered on every width: it undoes the bottom sheet np-dialog becomes under 600 px', () => {
  const css = web('styles.css');
  const rule = css.match(/dialog\.np-dialog\.feedback \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /margin: auto;/);
  assert.match(rule, /border-radius: 24px;/);
  assert.match(rule, /max-width: none;/);
});

// ── The real app ──

let page;
let $;
let getLog;
const posts = [];
let answer = 204;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url === '/api/feedback') { posts.push(opts); return { ok: answer < 300, status: answer }; }
    return pageFetch(url, opts);
  };
  await (await import('../web/app.js')).ready;
  ({ getLog } = await import('../web/log.js'));
  await page.settle();
});

const sum = () => Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent);
const typeSum = (digits) => { for (const d of String(digits)) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click'); };
const type = (text) => { $('#feedback-text').value = text; $('#feedback-text').dispatch('input'); };
function openSettings() {
  if (!$('#settings-dialog').open) $('#settings-open').dispatch('click');
  assert.equal($('#settings-dialog').open, true);
}
function openFeedback() {
  openSettings();
  $('#feedback-open').focus();
  $('#feedback-open').dispatch('click');
  typeSum(sum());
  assert.equal($('#feedback-dialog').open, true);
}

test('Feedback sits on About\'s version line, after the Privacy policy, a button named for screen readers', () => {
  const line = $('.set-version');
  const button = $('#feedback-open');
  assert.ok(line.contains(button) && line.contains($('#about-version')));
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.textContent, 'Feedback');
  assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
  const html = web('index.html');
  const about = html.match(/<p class="set-version">[\s\S]*?<\/p>/)[0];
  assert.ok(about.indexOf('Privacy policy') < about.indexOf('id="feedback-open"'));
});

test('Feedback asks the grown-up sum first, on Regular too; a wrong answer says so, stays open and asks another', () => {
  openSettings();
  $('#feedback-open').dispatch('click');
  assert.equal($('#kids-sum').open, true);
  assert.equal($('#feedback-dialog').open, false, 'not Feedback yet');
  assert.equal($('#kids-sum-note').hidden, true);
  const first = [$('#kids-sum-a').textContent, $('#kids-sum-b').textContent];
  typeSum(sum() === 12 ? 13 : 12);
  assert.equal($('#kids-sum').open, true, 'still open');
  assert.equal($('#kids-sum-note').hidden, false);
  assert.equal($('#kids-sum-note').textContent, "That's not it. Here's another one.");
  assert.equal($('#kids-sum-typed').textContent, '?', 'a new sum to answer');
  assert.ok(Number($('#kids-sum-a').textContent) >= 6 && Number($('#kids-sum-b').textContent) <= 9, String(first));
  assert.equal($('#feedback-dialog').open, false);
  typeSum(sum());
  assert.equal($('#kids-sum').open, false);
  assert.equal($('#feedback-dialog').open, true);
  assert.equal(document.activeElement, $('#feedback-text'), 'ready to type');
  // ✕ closes it, and focus goes back to Feedback.
  $('#feedback-dialog').querySelector('[data-close]').dispatch('click');
  assert.equal($('#feedback-dialog').open, false);
});

test('✕ on the sum closes it without opening Feedback; the next tap asks a fresh sum with no note', () => {
  openSettings();
  $('#feedback-open').dispatch('click');
  typeSum(sum() === 12 ? 13 : 12);
  $('#kids-sum').querySelector('[data-close]').dispatch('click');
  assert.equal($('#kids-sum').open, false);
  typeSum(sum());
  assert.equal($('#feedback-dialog').open, false, 'keys tapped after closing do nothing');
  $('#feedback-open').dispatch('click');
  assert.equal($('#kids-sum-note').hidden, true);
  $('#kids-sum').close();
});

test('the dialog: heading, the line about names and 90 days, a 2000-character box, Cancel and Send', () => {
  const d = $('#feedback-dialog');
  assert.ok(d.classList.contains('np-dialog') && d.classList.contains('feedback'));
  assert.equal($('#feedback-title').textContent, 'Send feedback');
  assert.equal($('#feedback-hint').textContent, "Ideas, problems, anything. Please don't include names or contact details: we can't write back. We keep messages for 90 days.");
  const box = $('#feedback-text');
  assert.equal(box.tagName, 'TEXTAREA');
  assert.equal(box.getAttribute('maxlength'), '2000');
  assert.equal(box.getAttribute('aria-label'), 'Your feedback');
  assert.equal($('#feedback-cancel').hasAttribute('data-close'), true);
  assert.equal($('#feedback-send').textContent, 'Send');
  assert.equal(d.querySelector('form'), null, 'no form: the CSP has form-action \'none\'');
});

test('Send waits for something typed; Cancel closes and focus goes back to Feedback', () => {
  openFeedback();
  type('');
  assert.equal($('#feedback-send').disabled, true);
  type('   ');
  assert.equal($('#feedback-send').disabled, true, 'spaces alone are nothing');
  type('Hi');
  assert.equal($('#feedback-send').disabled, false);
  $('#feedback-cancel').dispatch('click');
  assert.equal($('#feedback-dialog').open, false);
  assert.equal(document.activeElement, $('#feedback-open'));
});

test('from a dev copy, Send says it can\'t send from here, and sends nothing', async () => {
  globalThis.location.hostname = 'localhost';
  openFeedback();
  type('Hello from a dev copy');
  $('#feedback-send').dispatch('click');
  await page.settle();
  assert.equal(posts.length, 0);
  assert.equal($('#feedback-status').textContent, SAY['not-live']);
  assert.equal($('#feedback-text').value, 'Hello from a dev copy', 'the text stays');
  $('#feedback-dialog').close();
});

test('on noodlepads.com: a failure keeps the text and says try again; 204 thanks, clears the box and logs nothing of it', async () => {
  globalThis.location.hostname = 'noodlepads.com';
  globalThis.location.origin = 'https://noodlepads.com';
  const secret = 'Wren loves the squid pad, ring me on 555-0100';
  openFeedback();
  type(secret);
  answer = 503;
  $('#feedback-send').dispatch('click');
  assert.equal($('#feedback-send').disabled, true, 'not twice while sending');
  assert.equal($('#feedback-status').textContent, 'Sending…');
  await page.settle();
  assert.equal(posts.length, 1);
  assert.equal($('#feedback-status').textContent, "Couldn't send. Please try again.");
  assert.equal($('#feedback-text').value, secret);
  assert.equal($('#feedback-send').disabled, false);
  answer = 204;
  $('#feedback-send').dispatch('click');
  await page.settle();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].headers['x-feedback'], posts[0].headers['x-feedback'], 'the retry keeps its id');
  assert.match(posts[1].headers['x-feedback'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(posts[1].headers['x-app-version'], 'dev', 'the stand-in page has no version.json');
  assert.equal(posts[1].body, secret);
  assert.equal($('#feedback-status').textContent, 'Thanks! Sent. 💌');
  assert.equal($('#feedback-text').value, '');
  assert.equal($('#feedback-send').disabled, true);
  // The next message gets a fresh id.
  type('Another idea');
  $('#feedback-send').dispatch('click');
  await page.settle();
  assert.notEqual(posts[2].headers['x-feedback'], posts[1].headers['x-feedback']);
  $('#feedback-dialog').close();
  // Nothing typed is in the event log (problem reports and usage events read it).
  const log = JSON.stringify(getLog());
  for (const words of ['squid pad', '555-0100', 'Another idea']) assert.ok(!log.includes(words), words);
});
