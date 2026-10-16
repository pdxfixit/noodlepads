// Visits on the device (web/visits.js, ADR 0016): a visit starts when the
// page shows and ends when it hides; what it keeps (screens, level, load
// time, the sound's delay, where errors came from) and never more; what
// waits in localStorage `visits`, what a send takes off; and a sync sending
// them beside the feature-use counts.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  VISIT_LEVELS, VISIT_SCREENS, MIN_SECS, MAX_ERRORS, MAX_WAITING, MAX_SEND,
  cleanVisit, errorSig, keepVisit, pendingVisits, sentVisits, trackVisits, clearVisits,
} from '../web/visits.js';
import { setUsage } from '../web/usage.js';
import { LEVELS } from '../web/settings.js';
import { cleanVisits } from '../worker/metrics.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
beforeEach(() => store.clear());

const T0 = Date.parse('2026-10-14T18:00:00Z');   // in the past: a visit from the future is refused
const visit = (over = {}) => ({ at: T0, secs: 30, first: 'pads', screens: ['pads'], level: 'regular', load: 900, latency: 20, errors: {}, ...over });

// A page with a clock, a log and a visibility switch.
function page({ hidden = false } = {}) {
  let now = T0;
  const listeners = { doc: {}, win: {}, log: [] };
  const doc = {
    visibilityState: hidden ? 'hidden' : 'visible',
    addEventListener: (type, fn) => { listeners.doc[type] = fn; },
  };
  const win = { addEventListener: (type, fn) => { listeners.win[type] = fn; } };
  const ctl = {
    person: 'p-a', level: 'regular', load: 1234, latency: null, loadAsks: 0,
    tick: (secs) => { now += secs * 1000; },
    hide: () => { doc.visibilityState = 'hidden'; listeners.doc.visibilitychange(); },
    show: () => { doc.visibilityState = 'visible'; listeners.doc.visibilitychange(); },
    close: () => listeners.win.pagehide(),
    log: (entry) => { for (const fn of listeners.log) fn(entry); },
  };
  ctl.tracker = trackVisits({
    now: () => now,
    who: () => ctl.person,
    level: () => ctl.level,
    load: () => { ctl.loadAsks++; return ctl.load; },
    latency: () => ctl.latency,
    onLog: (fn) => { listeners.log.push(fn); return () => {}; },
    doc,
    win,
  });
  return ctl;
}

// Ben, 2026-10-16: the usage switch off sends nothing, ever.
test('with the usage switch off no visit is kept or waiting, and clearVisits empties the store', () => {
  const v = { at: Date.now() - 60_000, secs: 30, screens: ['pads'] };
  assert.equal(keepVisit('p-a', v), true);
  setUsage(false);
  try {
    assert.equal(keepVisit('p-a', { ...v, at: v.at + 1 }), false);
    assert.equal(pendingVisits('p-a'), null);
  } finally {
    setUsage(true);
  }
  assert.equal(pendingVisits('p-a').length, 1);
  clearVisits();
  assert.equal(pendingVisits('p-a'), null);
});

test('the lists match the app: levels as settings.js has them, screen names only', () => {
  assert.deepEqual(VISIT_LEVELS, LEVELS);
  for (const s of ['pads', 'beats', 'song', 'live', 'kids']) assert.ok(VISIT_SCREENS.includes(s), s);
});

test('a visit runs from showing to hiding, with its screens, level, load time, sound delay and errors', () => {
  const p = page();
  p.tracker.screen('beats');
  p.tick(5);
  p.tracker.screen('pads');
  p.tracker.screen('beats');
  p.tracker.screen('a-name');
  p.log({ kind: 'error', data: { message: 'Pip broke it', source: 'https://noodlepads.com/sequencer.js?v=3', line: 120 } });
  p.log({ kind: 'error', data: { message: 'again', source: 'https://noodlepads.com/sequencer.js', line: 120 } });
  p.log({ kind: 'error', data: { storage: 'QuotaExceededError' } });
  p.log({ kind: 'error', data: { message: 'rejected' } });
  p.log({ kind: 'beat', data: { action: 'play' } });
  p.latency = 23.6;
  p.tick(70);
  p.hide();
  const [v] = pendingVisits('p-a');
  assert.deepEqual(v, {
    at: T0, secs: 75, first: 'beats', screens: ['beats', 'pads'], level: 'regular', load: 1234, latency: 24,
    errors: { 'sequencer.js:120': 2, storage: 1, promise: 1 },
  });
  assert.ok(!JSON.stringify(store.get('visits')).includes('Pip'), 'nothing of an error message is kept');
});

test('showing again starts a new visit; the load time belongs to the first only; closing ends one too', () => {
  const p = page();
  p.tracker.screen('pads');
  p.tick(10);
  p.hide();
  p.tick(600);
  p.show();
  p.tick(20);
  p.close();
  const vs = pendingVisits('p-a');
  assert.equal(vs.length, 2);
  assert.equal(vs[0].load, 1234);
  assert.equal(vs[1].load, null, 'a later visit of the same page');
  assert.equal(p.loadAsks, 1);
  assert.equal(vs[1].at, T0 + 610_000);
  assert.equal(vs[1].first, 'pads', 'the screen on show is its first');
  p.hide();
  assert.equal(pendingVisits('p-a').length, 2, 'hiding after closing keeps nothing more');
});

test('a flick past is not a visit; a page opened hidden starts on show; the person is whoever is current at the end', () => {
  const p = page({ hidden: true });
  assert.equal(p.tracker.current(), null);
  p.show();
  p.tick(MIN_SECS - 1);
  p.hide();
  assert.equal(pendingVisits('p-a'), null);
  p.show();
  p.person = 'p-b';
  p.level = 'kids';
  p.tick(9);
  p.hide();
  assert.equal(pendingVisits('p-a'), null);
  assert.equal(pendingVisits('p-b')[0].level, 'kids');
  p.person = null;
  p.show();
  p.tick(9);
  p.hide();
  assert.equal(JSON.parse(store.get('visits')).length, 1, 'no person, nothing kept');
});

test('one visit names at most MAX_ERRORS places, and counts on in the ones it has', () => {
  const p = page();
  for (let i = 0; i < MAX_ERRORS + 5; i++) p.log({ kind: 'error', data: { source: `/m${i}.js`, line: 1 } });
  p.log({ kind: 'error', data: { source: '/m0.js', line: 1 } });
  p.tick(10);
  p.hide();
  const { errors } = pendingVisits('p-a')[0];
  assert.equal(Object.keys(errors).length, MAX_ERRORS);
  assert.equal(errors['m0.js:1'], 2);
});

test('an error is named by its file and line, or by one word', () => {
  assert.equal(errorSig({ source: 'https://noodlepads.com/web/app.js#x', line: 7 }), 'app.js:7');
  assert.equal(errorSig({ source: 'https://noodlepads.com/App.JS', line: 7 }), 'app.js:7');
  assert.equal(errorSig({ storage: 'x' }), 'storage');
  assert.equal(errorSig({ message: 'x' }), 'promise');
  assert.equal(errorSig({ source: 'https://noodlepads.com/', line: 1 }), 'other');
  assert.equal(errorSig({ source: 'chrome-extension://abc/Pip Juno.js', line: 1 }), 'other', 'nothing odd gets through');
  assert.equal(errorSig({ source: '/app.js' }), 'app.js:0');
  assert.equal(errorSig(), 'promise');
});

test('a visit is checked the same on the device and in the Worker; junk is dropped', () => {
  assert.deepEqual(cleanVisit(visit(), T0), visit());
  assert.equal(cleanVisit(visit({ secs: MIN_SECS - 1 }), T0), null);
  assert.equal(cleanVisit(visit({ at: T0 + 3_600_000 }), T0), null, 'not from the future');
  assert.equal(cleanVisit(visit({ at: 'now' }), T0), null);
  assert.equal(cleanVisit([1], T0), null);
  const odd = cleanVisit(visit({ first: 'nope', screens: ['nope', 'song', 'song'], level: 'boss', load: -1, latency: 1e9, errors: { 'a.js:1': 1, 'Juno said': 2, 'b.js:2': 0 } }), T0);
  assert.deepEqual(odd, { at: T0, secs: 30, first: 'song', screens: ['song'], level: null, load: null, latency: null, errors: { 'a.js:1': 1 } });
  const sent = [visit(), visit({ at: 'x' }), ...Array.from({ length: MAX_SEND + 5 }, (_, i) => visit({ at: T0 - i }))];
  const took = cleanVisits({ visits: sent }, T0);
  assert.equal(took.length, MAX_SEND - 1, 'at most MAX_SEND looked at, the bad one dropped');
  assert.deepEqual(cleanVisits({}, T0), []);
  assert.deepEqual(cleanVisits({ visits: 'x' }, T0), []);
});

test('visits wait per person, oldest first; a send takes off only what it sent; the oldest go past MAX_WAITING', () => {
  keepVisit('p-a', visit({ at: T0 - 3000 }));
  keepVisit('p-b', visit({ at: T0 - 2000 }));
  keepVisit('p-a', visit({ at: T0 - 1000 }));
  assert.equal(keepVisit('', visit()), false);
  assert.equal(keepVisit('p-a', { at: 'x' }), false);
  const sending = pendingVisits('p-a');
  assert.deepEqual(sending.map((v) => v.at), [T0 - 3000, T0 - 1000]);
  keepVisit('p-a', visit({ at: T0 }));
  sentVisits('p-a', sending);
  assert.deepEqual(pendingVisits('p-a').map((v) => v.at), [T0], 'one kept while sending stays');
  assert.deepEqual(pendingVisits('p-b').map((v) => v.at), [T0 - 2000]);
  for (let i = 0; i < MAX_WAITING + 5; i++) keepVisit('p-c', visit({ at: T0 - 100_000 + i }));
  const all = JSON.parse(store.get('visits'));
  assert.equal(all.length, MAX_WAITING);
  assert.equal(pendingVisits('p-a'), null, 'the oldest went');
  assert.equal(pendingVisits('p-c').length, MAX_SEND, 'a send takes at most MAX_SEND');
  store.set('visits', 'not json');
  assert.equal(pendingVisits('p-a'), null);
});
