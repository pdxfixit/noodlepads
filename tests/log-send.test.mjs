// 📮 Problem reports: the device code (log-send.js). Sending is tested below
// it with a stand-in fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDeviceCode, deviceCode, forgetDeviceCode, createLogSender,
  SEND_URL, LIVE_HOST, MIN_GAP_MS, ERROR_DELAY_MS, MAX_BODY_BYTES,
} from '../web/log-send.js';
import { cleanPayload } from '../web/log-clean.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

test('a device code is two groups of four, with no 0, O, 1 or I', () => {
  for (let i = 0; i < 200; i++) assert.match(makeDeviceCode(), /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(makeDeviceCode(() => 0), 'AAAA-AAAA');
});

test('the device code is remembered on this device, and forgotten when reports are switched off', () => {
  forgetDeviceCode();
  const code = deviceCode();
  assert.equal(memory.get('log-device'), code);
  assert.equal(deviceCode(), code);
  forgetDeviceCode();
  assert.equal(memory.has('log-device'), false);
  assert.notEqual(deviceCode(), code);
});

test('a damaged stored code is replaced', () => {
  forgetDeviceCode();
  memory.set('log-device', 'Juno');
  assert.match(deviceCode(), /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
});

// ── Sending, with a stand-in fetch, clock and timer ──

function rig({ enabled = true, live = true, reply = { ok: true, status: 204 } } = {}) {
  const log = [];
  let n = 0;
  const r = {
    log, clock: 0, calls: [], timers: [], reply, enabled, live,
    add(kind, data = {}) { const e = { n: ++n, t: n * 10, kind, data }; log.push(e); sender.entry(e); return e; },
  };
  const sender = createLogSender({
    fetch: async (url, opts) => {
      r.calls.push({ url, opts, body: JSON.parse(opts.body) });
      if (r.reply instanceof Error) throw r.reply;
      return r.reply;
    },
    getLog: () => log.slice(),
    enabled: () => r.enabled,
    live: () => r.live,
    build: (entries) => cleanPayload({ format: 1, app: 'test', device: 'K7Q4-M2XD', dropped: 0, entries }, { names: ['Toby'] }),
    now: () => r.clock,
    setTimer: (fn, ms) => { r.timers.push({ fn, ms }); return r.timers.length; },
    clearTimer: (id) => { r.timers[id - 1].fn = null; },
  });
  r.sender = sender;
  return r;
}

test('hiding the page sends the cleaned entries as one keepalive POST to /api/log', async () => {
  const r = rig();
  r.add('storage', { opened: true });
  r.add('notice', { text: '“Toby” said hi' });
  assert.equal(await r.sender.hidden(), true);
  assert.equal(r.calls.length, 1);
  const { url, opts, body } = r.calls[0];
  assert.equal(url, SEND_URL);
  assert.equal(opts.method, 'POST');
  assert.equal(opts.keepalive, true);
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.equal(body.device, 'K7Q4-M2XD');
  assert.deepEqual(body.entries.map((e) => e.kind), ['storage', 'notice']);
  assert.ok(!opts.body.includes('Toby'));
});

test('each upload holds only what came since the last one that got through, at most once a minute', async () => {
  const r = rig();
  r.add('storage', { opened: true });
  await r.sender.hidden();
  r.add('song', { action: 'play' });
  r.clock = MIN_GAP_MS - 1;
  assert.equal(await r.sender.hidden(), false, 'under a minute: nothing');
  r.clock = MIN_GAP_MS;
  assert.equal(await r.sender.hidden(), true);
  assert.deepEqual(r.calls[1].body.entries.map((e) => e.kind), ['song']);
  r.clock = 3 * MIN_GAP_MS;
  assert.equal(await r.sender.hidden(), false, 'nothing new: no empty upload');
  assert.equal(r.calls.length, 2);
});

test('a failed send keeps the entries for the next one, and never throws', async () => {
  const r = rig({ reply: { ok: false, status: 503 } });
  r.add('storage', { opened: true });
  assert.equal(await r.sender.hidden(), false);
  r.reply = new Error('offline');
  r.clock = MIN_GAP_MS;
  assert.equal(await r.sender.hidden(), false);
  r.reply = { ok: false, status: 429 };
  r.clock = 2 * MIN_GAP_MS;
  assert.equal(await r.sender.hidden(), false);
  r.reply = { ok: true, status: 204 };
  r.clock = 3 * MIN_GAP_MS;
  r.add('song', { action: 'stop' });
  assert.equal(await r.sender.hidden(), true);
  assert.deepEqual(r.calls.at(-1).body.entries.map((e) => e.kind), ['storage', 'song']);
});

test('an error sends 10 s later, one timer at a time, and later still inside the minute', async () => {
  const r = rig();
  r.add('error', { message: 'boom' });
  r.add('error', { message: 'boom again' });
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0].ms, ERROR_DELAY_MS);
  r.clock = ERROR_DELAY_MS;
  await r.timers[0].fn();
  assert.equal(r.calls.length, 1);
  r.clock = ERROR_DELAY_MS + 5_000;
  r.add('error', { message: 'third' });
  assert.equal(r.timers[1].ms, MIN_GAP_MS - 5_000, 'waits out the minute');
});

test('nothing is sent with the switch off, or from a dev copy', async () => {
  const off = rig({ enabled: false });
  off.add('error', { message: 'x' });
  assert.equal(await off.sender.hidden(), false);
  assert.equal(off.timers.length, 0);
  const dev = rig({ live: false });
  dev.add('error', { message: 'x' });
  assert.equal(await dev.sender.hidden(), false);
  assert.equal(off.calls.length + dev.calls.length, 0);
});

test('switching on sends only what happens from then on', async () => {
  const r = rig();
  r.add('storage', { opened: true });
  r.sender.start();
  assert.equal(await r.sender.hidden(), false);
  r.add('song', { action: 'play' });
  assert.equal(await r.sender.hidden(), true);
  assert.deepEqual(r.calls[0].body.entries.map((e) => e.kind), ['song']);
});

test('an upload too big for one request leaves out the oldest entries, and counts them', async () => {
  const r = rig();
  for (let i = 0; i < 400; i++) r.add('notice', { text: `${i} ${'x'.repeat(190)}` });
  assert.equal(await r.sender.hidden(), true);
  const { opts, body } = r.calls[0];
  assert.ok(new TextEncoder().encode(opts.body).length <= MAX_BODY_BYTES);
  assert.ok(body.dropped > 0);
  assert.equal(body.entries.length + body.dropped, 400);
  assert.match(body.entries.at(-1).data.text, /^399 /, 'the newest are kept');
});

test('the live site is the only host that sends', () => {
  assert.equal(LIVE_HOST, 'noodlepads.com');
});
