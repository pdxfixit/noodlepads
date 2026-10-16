// Usage events in the shared standard (web/telemetry.js, Arrow-Rama #151):
// the record's columns as flarepress's shared client fills them, events that
// wait for the version, the player id, the usage switch (every device sends,
// question #425), what a details object may hold, and the batches sent to /api/events.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  createTelemetry, cleanDetails, playerId, shouldSend, track, useTelemetry,
  EVENTS, MAX_TEXT, MAX_WAITING, APP,
} from '../web/telemetry.js';
import { setUsage, usageOn } from '../web/usage.js';

let store;
beforeEach(() => {
  store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
  };
  setUsage(true);
});

// A telemetry with the shared client's world faked: storage, a fetch that
// records each batch, no timers, a touch phone.
function make({ status = 204, screen = 'beats' } = {}) {
  const sent = [];
  const tel = createTelemetry({
    screen: () => screen,
    globals: {
      window: { screen: { width: 390, height: 844 }, matchMedia: () => ({ matches: true }) },
      document: undefined,
      navigator: { sendBeacon: () => true },
      storage: globalThis.localStorage,
      fetch: async (url, init) => { sent.push({ url, ...init }); return { status }; },
      setInterval: () => 1,
      clearInterval: () => {},
    },
  });
  return { tel, sent };
}

test('a record has every column of the standard, filled by the shared client from one track() call', () => {
  const { tel } = make();
  tel.setVersion('7b5fc5e');
  tel.track('control.use', { control: 'settings-open', group: 'toolbar', layout: 'base', vw: 390, vh: 844, input: 'touch' });
  const [r] = tel.queued();
  assert.deepEqual(Object.keys(r), ['app', 'platform', 'form', 'version', 'player', 'session', 'seq', 'at', 'tz', 'event', 'screen', 'details']);
  assert.equal(r.app, APP);
  assert.equal(r.app, 'noodlepads');
  assert.equal(r.platform, 'web');
  assert.equal(r.form, 'phone');
  assert.equal(r.version, '7b5fc5e');
  assert.equal(r.screen, 'beats');
  assert.equal(r.seq, 0);
  assert.equal(r.player, tel.player);
  assert.equal(r.tz, 0 - new Date(r.at).getTimezoneOffset());
  tel.track('screen.view', { from: 'pads' });
  assert.equal(tel.queued()[1].seq, 1, 'seq counts up within the session');
});

test('events before the version wait, then go in, in order; at most MAX_WAITING of them', () => {
  const { tel } = make();
  tel.track('app.open', { first_run: true });
  tel.track('screen.view', { from: null });
  assert.deepEqual(tel.queued(), [], 'no client yet');
  assert.equal(tel.waiting().length, 2);
  tel.setVersion('abc');
  assert.deepEqual(tel.queued().map((r) => [r.event, r.version, r.seq]), [['app.open', 'abc', 0], ['screen.view', 'abc', 1]]);
  assert.deepEqual(tel.waiting(), []);
  const late = make().tel;
  for (let i = 0; i < MAX_WAITING + 10; i++) late.track('screen.view', {});
  assert.equal(late.waiting().length, MAX_WAITING);
});

test('the player is one random id kept on the device, made once; each page load is a new session', () => {
  const a = make().tel;
  const b = make().tel;
  a.setVersion('v');
  b.setVersion('v');
  assert.equal(a.player, b.player, 'the same player on this device');
  assert.notEqual(a.client().session, b.client().session);
  assert.equal(a.first, true, 'the first page load made the id');
  assert.equal(b.first, false);
  assert.equal(store.get('telemetry-player'), a.player);
  assert.match(a.player, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'a plain random id (v4 UUID)');
  store.set('telemetry-player', 'p-juno');
  assert.notEqual(playerId().id, 'p-juno', 'anything but a random id (a profile id, say) is replaced');
});

test('batches go to POST /api/events as one JSON line per record, and leave the queue only on a 2xx', async () => {
  const { tel, sent } = make({ status: 503 });
  tel.setVersion('v');
  tel.track('screen.view', { from: 'pads' });
  tel.track('dialog.open', { dialog: 'help' });
  await tel.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, '/api/events');
  assert.equal(sent[0].method, 'POST');
  assert.match(sent[0].headers['content-type'], /^text\/plain/);
  assert.match(sent[0].headers['x-batch'], /^[0-9a-f-]{36}$/);
  assert.deepEqual(sent[0].body.trim().split('\n').map((l) => JSON.parse(l).event), ['screen.view', 'dialog.open']);
  assert.equal(tel.queued().length, 2, 'refused: kept for the next send');
  const ok = make();
  ok.tel.setVersion('v');
  ok.tel.track('screen.view', {});
  await ok.tel.flush();
  assert.equal(ok.sent.length, 1);
  assert.deepEqual(ok.tel.queued(), [], 'taken: gone');
});

test('the usage switch off: track() does nothing, the queue and what waited are dropped, nothing is sent', async () => {
  const { tel, sent } = make();
  tel.track('app.open', {});
  setUsage(false);
  assert.equal(usageOn(), false);
  assert.equal(tel.track('screen.view', {}), false);
  tel.clear();
  assert.deepEqual(tel.waiting(), []);
  tel.setVersion('v');
  setUsage(true);
  tel.track('screen.view', {});
  setUsage(false);
  await tel.flush();
  assert.deepEqual(sent, [], 'nothing sent');
  assert.deepEqual(tel.queued(), [], 'the client dropped its queue');
  assert.ok(![...store.keys()].some((k) => k.startsWith('events:')), 'and its localStorage');
  useTelemetry(tel);
  assert.equal(track('screen.view', {}), false, 'the page-wide track() too');
  setUsage(true);
  assert.equal(track('screen.view', {}), true);
  useTelemetry(null);
  assert.equal(track('screen.view', {}), false, 'no telemetry yet: nothing, and no error');
});

// Ben, 2026-10-16 (question #425): "Yes, everyone".
test('every device sends while the switch is on, in the cloud or not, with its own code and never a profile', async () => {
  assert.equal(shouldSend({ enabled: true }), true);
  assert.equal(shouldSend({ enabled: false }), false, 'off sends nothing, ever');
  const { tel, sent } = make();
  tel.setVersion('v');
  tel.track('screen.view', {});
  await tel.flush();
  assert.equal(sent.length, 1, 'nobody here is in the cloud, and it still sends');
  assert.equal(JSON.parse(sent[0].body.trim()).player, tel.player);
  assert.match(tel.player, /^[0-9a-f-]{36}$/, 'the device\'s random code, never a p- profile id');
});

test('details keep only the event\'s listed keys and plain values; an unknown event is not recorded', () => {
  assert.deepEqual(cleanDetails('setting.change', { key: 'level', from: 'regular', to: 'kids', name: 'Pip' }), { key: 'level', from: 'regular', to: 'kids' });
  assert.deepEqual(cleanDetails('dialog.close', { dialog: 'x'.repeat(200), ms: 1234.56789, answer: { a: 1 } }), { dialog: 'x'.repeat(MAX_TEXT), ms: 1234.568 });
  assert.deepEqual(cleanDetails('app.open', { first_run: false, vw: NaN, lang: '', dark: null }), { first_run: false, dark: null });
  const { tel } = make();
  tel.setVersion('v');
  assert.equal(tel.track('made.up', {}), false);
  assert.deepEqual(tel.queued(), []);
});

test('the queue this app kept before the shared client is dropped', () => {
  store.set('telemetry-queue', '[{"event":"app.open"}]');
  make();
  assert.equal(store.get('telemetry-queue'), undefined);
});

// The standard's list lives in pdxfixit/telemetry; checked when it sits beside this repo.
const list = new URL('../../telemetry/events.toml', import.meta.url);
test('every event and key this app sends, its own included, is in the standard\'s events.toml', { skip: !existsSync(list) && 'pdxfixit/telemetry is not beside this checkout' }, () => {
  const toml = readFileSync(list, 'utf8');
  for (const [event, keys] of Object.entries(EVENTS)) {
    const block = toml.split(`[events."${event}"]`)[1]?.split('\n[')[0];
    assert.ok(block, `${event} is in events.toml`);
    const listed = JSON.parse(block.match(/^details = (\[.*\])$/m)[1]);
    for (const k of keys) assert.ok(listed.includes(k), `${event}.${k} is listed`);
    assert.match(block.match(/^apps = (.*)$/m)[1], /"noodlepads"/, `events.toml says noodlepads sends ${event}`);
  }
});
