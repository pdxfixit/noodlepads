// "🆕 An update for Noodle Pads is ready.": when the bar shows, when it waits, and
// that it asks version.json only when it should (update.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateOffer, liveVersionOf, initUpdate, MIN_GAP_MS, CHECK_MS, TICK_MS } from '../web/update.js';

const offer = (o) => updateOffer({ loaded: 'aaa1111', live: 'bbb2222', busy: false, dismissed: null, ...o });

test('a newer live version shows the bar; the same one, or none known, does not', () => {
  assert.equal(offer({}), 'show');
  assert.equal(offer({ live: 'aaa1111' }), 'none');
  assert.equal(offer({ live: null }), 'none');
  assert.equal(offer({ live: '' }), 'none');
});

test('a dev copy never offers, and never takes a dev file for news', () => {
  assert.equal(offer({ loaded: 'dev' }), 'none');
  assert.equal(offer({ loaded: undefined }), 'none');   // before version.json first answered
  assert.equal(offer({ live: 'dev' }), 'none');
});

test('busy: it waits, and shows after', () => {
  assert.equal(offer({ busy: true }), 'wait');
  assert.equal(offer({ busy: false }), 'show');
});

test('✕ hides it until a newer version still', () => {
  assert.equal(offer({ dismissed: 'bbb2222' }), 'none');
  assert.equal(offer({ dismissed: 'bbb2222', live: 'ccc3333' }), 'show');
});

test('liveVersionOf reads a version.json, and nothing else', () => {
  assert.equal(liveVersionOf({ version: 'bbb2222', date: '2026-10-11 13:45 PDT' }), 'bbb2222');
  assert.equal(liveVersionOf({ version: 'dev' }), null);
  assert.equal(liveVersionOf(null), null);
  assert.equal(liveVersionOf('bbb2222'), null);
});

// The bar wired to stand-ins: a clock, a version.json, timers run by hand.
function rig({ loaded = 'aaa1111', live = 'bbb2222' } = {}) {
  const listeners = { doc: new Map(), win: new Map() };
  const target = (map) => ({ addEventListener: (t, fn) => map.set(t, fn) });
  const doc = { visibilityState: 'visible', ...target(listeners.doc) };
  const win = target(listeners.win);
  const button = () => { const b = { fns: [], addEventListener: (_t, fn) => b.fns.push(fn), click: () => b.fns.forEach((f) => f()) }; return b; };
  const r = {
    t: 0, busy: false, live, fails: false, asked: [], reloads: 0, timers: [],
    bar: { hidden: true }, reloadBtn: button(), closeBtn: button(), doc, win, listeners,
  };
  r.api = initUpdate({
    bar: r.bar, reloadBtn: r.reloadBtn, closeBtn: r.closeBtn,
    loaded: () => loaded, busy: () => r.busy,
    fetch: async (url, opts) => {
      r.asked.push({ url, opts });
      if (r.fails) throw new Error('offline');
      return { ok: true, json: async () => ({ version: r.live }) };
    },
    reload: () => { r.reloads++; },
    now: () => r.t,
    every: (fn, ms) => r.timers.push({ fn, ms }),
    doc, win,
  });
  r.run = async (ms) => { for (const x of r.timers) if (x.ms === ms) await x.fn(); };
  r.focus = async () => { await listeners.win.get('focus')(); };
  return r;
}

test('it asks no-store, every 10 minutes and on focus, at most once a minute', async () => {
  const r = rig();
  await r.focus();
  assert.equal(r.asked.length, 0, 'the page just loaded');
  r.t = MIN_GAP_MS;
  await r.focus();
  assert.equal(r.asked.length, 1);
  assert.deepEqual(r.asked[0], { url: 'version.json', opts: { cache: 'no-store' } });
  assert.equal(r.bar.hidden, false);
  await r.focus();
  assert.equal(r.asked.length, 1, 'not again within the minute');
  r.t += CHECK_MS;
  await r.run(CHECK_MS);
  assert.equal(r.asked.length, 2);
});

test('a hidden page does not ask; showing again does', async () => {
  const r = rig();
  r.t = CHECK_MS;
  r.doc.visibilityState = 'hidden';
  await r.run(CHECK_MS);
  assert.equal(r.asked.length, 0);
  r.doc.visibilityState = 'visible';
  await r.listeners.doc.get('visibilitychange')();
  assert.equal(r.asked.length, 1);
});

test('while busy it neither asks nor shows, and catches up after', async () => {
  const r = rig();
  r.t = MIN_GAP_MS;
  r.busy = true;
  await r.focus();
  assert.equal(r.asked.length, 0, 'not while recording or playing');
  r.busy = false;
  await r.run(TICK_MS);
  assert.equal(r.asked.length, 1, 'owed, so it asks once quiet');
  assert.equal(r.bar.hidden, false);
  r.busy = true;                       // a beat starts with the bar up
  await r.run(TICK_MS);
  assert.equal(r.bar.hidden, true);
  r.reloadBtn.click();
  assert.equal(r.reloads, 0, 'Reload never fires while busy');
  r.busy = false;
  await r.run(TICK_MS);
  assert.equal(r.bar.hidden, false);
  r.reloadBtn.click();
  assert.equal(r.reloads, 1);
});

test('✕ hides it until the next check; errors are ignored', async () => {
  const r = rig();
  r.t = MIN_GAP_MS;
  await r.focus();
  r.closeBtn.click();
  assert.equal(r.bar.hidden, true);
  r.t += MIN_GAP_MS;
  await r.focus();
  assert.equal(r.bar.hidden, false, 'the next check offers it again');
  r.closeBtn.click();
  r.fails = true;
  r.t += MIN_GAP_MS;
  await r.focus();                     // throws inside: nothing breaks
  assert.equal(r.bar.hidden, true, 'a failed check keeps it put away');
  r.fails = false;
  r.t += MIN_GAP_MS;
  await r.focus();
  assert.equal(r.bar.hidden, false);
});

test('a dev copy never asks', async () => {
  const r = rig({ loaded: 'dev' });
  r.t = CHECK_MS * 3;
  await r.focus();
  await r.run(CHECK_MS);
  assert.equal(r.asked.length, 0);
  assert.equal(r.bar.hidden, true);
});
