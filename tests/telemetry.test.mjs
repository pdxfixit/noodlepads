// Usage events in the shared standard (web/telemetry.js, Arrow-Rama #151):
// the record's columns, the queue in memory and localStorage, the player id,
// the usage switch, and what a details object may hold.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  createTelemetry, cleanDetails, formOf, playerId, readQueue, shouldSend, track, useTelemetry,
  EVENTS, MAX_QUEUE, MAX_TEXT, SEND_WITHOUT_CLOUD, APP, PLATFORM,
} from '../web/telemetry.js';
import { setUsage, usageOn } from '../web/usage.js';

let store;
beforeEach(() => {
  store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  setUsage(true);
});

// A telemetry whose timer runs only when the test says.
function make(over = {}) {
  const timers = [];
  let t = 1_791_000_000_000;
  const tel = createTelemetry({
    now: () => (t += 1000),
    screen: () => 'beats',
    size: () => ({ width: 390, height: 844, touch: true }),
    later: (fn) => timers.push(fn),
    ...over,
  });
  return { tel, run: () => { while (timers.length) timers.shift()(); } };
}

test('a record has every column of the standard, in order, from one track() call', () => {
  const { tel } = make();
  tel.setVersion('7b5fc5e');
  const r = tel.track('control.use', { control: 'settings-open', group: 'toolbar', layout: 'base', vw: 390, vh: 844, input: 'touch' });
  assert.deepEqual(Object.keys(r), ['app', 'platform', 'form', 'version', 'player', 'session', 'seq', 'at', 'tz', 'event', 'screen', 'details']);
  assert.equal(r.app, APP);
  assert.equal(r.app, 'noodlepads');
  assert.equal(r.platform, PLATFORM);
  assert.equal(r.platform, 'web');
  assert.equal(r.form, 'phone');
  assert.equal(r.version, '7b5fc5e');
  assert.equal(r.screen, 'beats');
  assert.equal(r.seq, 0);
  assert.equal(r.tz, -new Date(r.at).getTimezoneOffset());
  assert.match(r.session, /^[0-9a-f-]{36}$/);
  assert.equal(r.player, tel.player);
  assert.equal(tel.track('screen.view', { from: 'pads' }).seq, 1, 'seq counts up within the session');
});

test('the session is one page load; the player is one random id kept on the device, made once', () => {
  const a = make().tel;
  const b = make().tel;
  assert.notEqual(a.session, b.session, 'each page load is a new session');
  assert.equal(a.player, b.player, 'the same player on this device');
  assert.equal(a.first, true, 'the first page load made the id');
  assert.equal(b.first, false);
  assert.equal(store.get('telemetry-player'), a.player);
  assert.match(a.player, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'a plain random id (v4 UUID)');
  store.set('telemetry-player', 'p-juno');
  assert.notEqual(playerId().id, 'p-juno', 'anything but a random id (a profile id, say) is replaced');
});

test('records wait in memory until the version is known, then go to localStorage, at most every few seconds', () => {
  const { tel, run } = make();
  tel.track('app.open', { first_run: true });
  run();
  assert.equal(store.get('telemetry-queue'), undefined, 'no version yet: memory only');
  tel.setVersion('abc');
  tel.track('screen.view', { from: null });
  assert.equal(store.get('telemetry-queue'), undefined, 'not on every event');
  run();
  const kept = JSON.parse(store.get('telemetry-queue'));
  assert.deepEqual(kept.map((r) => [r.event, r.version]), [['app.open', 'abc'], ['screen.view', 'abc']]);
  // The next page load finds them and adds its own.
  const next = make().tel;
  next.setVersion('abc');
  next.track('app.open', {});
  assert.equal(next.queued().length, 3);
  assert.deepEqual(readQueue().map((r) => r.event), ['app.open', 'screen.view']);
});

test('the queue keeps the newest MAX_QUEUE records, and junk in localStorage is dropped', () => {
  store.set('telemetry-queue', JSON.stringify(['junk', { app: 'isopix' }, { app: 'noodlepads', session: 's', seq: 0, at: 1, event: 'no.such' }]));
  const { tel, run } = make();
  assert.equal(tel.queued().length, 0);
  tel.setVersion('v');
  for (let i = 0; i < MAX_QUEUE + 5; i++) tel.track('screen.view', {});
  assert.equal(tel.queued().length, MAX_QUEUE);
  assert.equal(tel.queued()[0].seq, 5, 'the oldest went');
  run();
  assert.equal(JSON.parse(store.get('telemetry-queue')).length, MAX_QUEUE);
});

test('with the usage switch off, track() does nothing; clear() empties memory and localStorage', () => {
  const { tel, run } = make();
  tel.setVersion('v');
  tel.track('screen.view', {});
  run();
  setUsage(false);
  assert.equal(usageOn(), false);
  assert.equal(tel.track('screen.view', {}), null);
  tel.clear();
  assert.deepEqual(tel.queued(), []);
  assert.equal(store.get('telemetry-queue'), undefined);
  useTelemetry(tel);
  assert.equal(track('screen.view', {}), null, 'the page-wide track() too');
  setUsage(true);
  assert.equal(track('screen.view', {}).event, 'screen.view');
  useTelemetry(null);
  assert.equal(track('screen.view', {}), null, 'no telemetry yet: nothing, and no error');
});

test('details keep only the event\'s listed keys and plain values; an unknown event is not recorded', () => {
  assert.deepEqual(cleanDetails('setting.change', { key: 'level', from: 'regular', to: 'kids', name: 'Pip' }), { key: 'level', from: 'regular', to: 'kids' });
  assert.deepEqual(cleanDetails('dialog.close', { dialog: 'x'.repeat(200), ms: 1234.56789, answer: { a: 1 } }), { dialog: 'x'.repeat(MAX_TEXT), ms: 1234.568 });
  assert.deepEqual(cleanDetails('app.open', { first_run: false, vw: NaN, lang: '', dark: null }), { first_run: false, dark: null });
  assert.equal(make().tel.track('made.up', {}), null);
});

test('form: no touch is a desktop; a touch screen under 600 px on its short side is a phone, else a tablet', () => {
  assert.equal(formOf(1920, 1080, false), 'desktop');
  assert.equal(formOf(390, 844, true), 'phone');
  assert.equal(formOf(844, 390, true), 'phone', 'turned sideways');
  assert.equal(formOf(820, 1180, true), 'tablet');
  assert.equal(formOf(undefined, undefined, true), 'tablet');
});

test('question #425 is one flag: until Ben answers, only devices where someone syncs may send', () => {
  assert.equal(SEND_WITHOUT_CLOUD, false);
  assert.equal(shouldSend({ enabled: true, cloud: true }), true);
  assert.equal(shouldSend({ enabled: true, cloud: false }), SEND_WITHOUT_CLOUD);
  assert.equal(shouldSend({ enabled: false, cloud: true }), false, 'off sends nothing, ever');
});

// The standard's list lives in pdxfixit/telemetry; checked when it sits beside this repo.
const list = new URL('../../telemetry/events.toml', import.meta.url);
test('every standard event and key this app sends is in the standard\'s events.toml', { skip: !existsSync(list) && 'pdxfixit/telemetry is not beside this checkout' }, () => {
  const toml = readFileSync(list, 'utf8');
  for (const [event, keys] of Object.entries(EVENTS)) {
    if (event.startsWith('noodlepads.')) continue;   // this app's own: the list's owner adds them
    const block = toml.split(`[events."${event}"]`)[1]?.split('\n[')[0];
    assert.ok(block, `${event} is in events.toml`);
    const listed = JSON.parse(block.match(/^details = (\[.*\])$/m)[1]);
    for (const k of keys) assert.ok(listed.includes(k), `${event}.${k} is listed`);
    assert.match(block.match(/^apps = (.*)$/m)[1], /"noodlepads"/, `events.toml says noodlepads sends ${event}`);
  }
});
