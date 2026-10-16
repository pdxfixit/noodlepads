// Usage events in the real app (web/telemetry.js, web/track-page.js): the
// screen switch, a toolbar tap, a dialog and a setting each make their event;
// and with the usage switch off nothing is kept or said: no events, no
// feature-use counts, no visits, no X-Noodle-App header.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { state } from '../web/state.js';

let page;
let store;
let tel;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  await (await import('../web/app.js')).ready;
  await page.settle();
  // track() reaches the app's own instance (useTelemetry).
  tel = await import('../web/telemetry.js');
});

// A probe event: its seq and screen show what the session has recorded.
const probe = () => tel.track('perf.longtask', { n: 0, ms: 0 });

test('the app opens with app.open and its first screen, and every record names the app and the screen', async () => {
  const p = probe();
  assert.equal(p.app, 'noodlepads');
  assert.equal(p.screen, state.screen);
  assert.ok(p.seq >= 2, 'app.open and the first screen.view came first');
});

test('a tab, a toolbar button, a dialog and a setting each make their event', async () => {
  const $ = page.$;
  const from = probe().seq + 1;
  $('#beats-toggle').dispatch('click');
  $('#settings-open').dispatch('click');
  const { setSetting } = await import('../web/settings.js');
  await setSetting('timeSignature', '3/4');
  $('#settings-dialog').close();
  const mine = tel.currentTelemetry().queued().filter((r) => r.seq >= from);
  // The stand-in page runs a control's own handler before the page's
  // listener (a browser's capture phase hears the tap first), so each
  // control.use follows what it did here.
  assert.deepEqual(mine.map((r) => r.event), ['screen.view', 'control.use', 'dialog.open', 'control.use', 'setting.change', 'dialog.close']);
  assert.ok(mine.every((r) => r.screen === 'beats'));
  assert.deepEqual(mine[0].details, { from: 'pads' });
  assert.equal(mine[1].details.control, 'beats-toggle', 'a tab whose label the stand-in page cannot read is named by its id');
  assert.equal(mine[1].details.group, 'toolbar');
  assert.equal(mine[2].details.dialog, 'settings-dialog');
  assert.deepEqual([mine[3].details.control, mine[3].details.group], ['Settings', 'top']);
  assert.deepEqual(mine[4].details, { key: 'timeSignature', from: '4/4', to: '3/4' });
  await setSetting('timeSignature', '4/4');
});

test('the usage switch off: nothing tracked, counted or kept, what waited is gone, and cloud calls carry no X-Noodle-App', async () => {
  const { setSetting, getSetting } = await import('../web/settings.js');
  const { countUse, pendingUses, appMeta } = await import('../web/uses.js');
  const { keepVisit, pendingVisits } = await import('../web/visits.js');
  assert.equal(getSetting('sendUsage'), true, 'on by default');
  countUse('pad', state.personId);
  keepVisit(state.personId, { at: Date.now() - 10_000, secs: 9, screens: ['pads'] });
  assert.ok(pendingUses(state.personId) && pendingVisits(state.personId));
  await setSetting('sendUsage', false);
  assert.equal(tel.track('screen.view', { from: 'pads' }), null, 'no events');
  assert.equal(store.get('telemetry-queue'), undefined, 'the queue is gone');
  assert.equal(store.get('uses'), undefined, 'waiting counts are gone');
  assert.equal(store.get('visits'), undefined, 'waiting visits are gone');
  countUse('pad', state.personId);
  page.$('#pads-tab').dispatch('click');
  assert.equal(pendingUses(state.personId), null, 'nothing is counted');
  assert.equal(keepVisit(state.personId, { at: Date.now() - 10_000, secs: 9 }), false, 'no visit is kept');
  assert.equal(appMeta('abc', 400, true), null, 'no header for the Worker');
  await setSetting('sendUsage', true);
  assert.ok(tel.track('screen.view', { from: 'pads' }), 'on again, it tracks again');
});
