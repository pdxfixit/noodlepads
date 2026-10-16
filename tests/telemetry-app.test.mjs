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
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
  };
  await (await import('../web/app.js')).ready;
  await page.settle();
  // track() reaches the app's own instance (useTelemetry).
  tel = await import('../web/telemetry.js');
});

const records = () => tel.currentTelemetry().queued();

// Ben, 2026-10-16 (question #425): "Yes, everyone".
test('the shared client starts once the version is known, and keeps events with nobody in the cloud', () => {
  assert.ok(tel.currentTelemetry().client(), 'started');
  assert.equal(state.cloud.size, 0);
  const before = records().length;
  page.$('#pads-tab').dispatch('click');
  assert.ok(records().length > before);
  tel.currentTelemetry().clear();
});

test('a tab, a toolbar button, a dialog and a setting each make their event, with the app and the screen', async () => {
  {
    const $ = page.$;
    $('#beats-toggle').dispatch('click');
    $('#settings-open').dispatch('click');
    const { setSetting } = await import('../web/settings.js');
    await setSetting('timeSignature', '3/4');
    $('#settings-dialog').close();
    const mine = records();
    // The stand-in page runs a control's own handler before the page's
    // listener (a browser's capture phase hears the tap first), so each
    // control.use follows what it did here.
    assert.deepEqual(mine.map((r) => r.event), ['screen.view', 'control.use', 'dialog.open', 'control.use', 'setting.change', 'dialog.close']);
    assert.ok(mine.every((r) => r.screen === 'beats' && r.app === 'noodlepads' && r.player === tel.currentTelemetry().player));
    assert.deepEqual(mine[0].details, { from: 'pads' });
    assert.equal(mine[1].details.control, 'beats-toggle', 'a tab whose label the stand-in page cannot read is named by its id');
    assert.equal(mine[1].details.group, 'toolbar');
    assert.equal(mine[2].details.dialog, 'settings-dialog');
    assert.deepEqual([mine[3].details.control, mine[3].details.group], ['Settings', 'top']);
    assert.deepEqual(mine[4].details, { key: 'timeSignature', from: '4/4', to: '3/4' });
    await setSetting('timeSignature', '4/4');
  }
});

test('the usage switch off: nothing tracked, counted or kept, what waited is gone, and cloud calls carry no X-Noodle-App', async () => {
  const { setSetting, getSetting } = await import('../web/settings.js');
  const { appMeta } = await import('../web/device-meta.js');
  const { countPlay, takePlay } = await import('../web/play-count.js');
  assert.equal(getSetting('sendUsage'), true, 'on by default');
  countPlay('pads');
  {
    tel.track('screen.view', { from: 'pads' });
    assert.ok(records().length > 0);
    await setSetting('sendUsage', false);
    assert.equal(tel.track('screen.view', { from: 'pads' }), false, 'no events');
    assert.deepEqual(records(), [], 'the queue is gone');
    assert.ok(![...store.keys()].some((k) => k.startsWith('events:')), 'from localStorage too');
  }
  countPlay('pads');
  assert.equal(takePlay(), null, 'what was counted went with the switch');
  countPlay('pads');
  assert.equal(takePlay(), null, 'and no play is counted while it is off');
  assert.equal(appMeta('abc', 400, true), null, 'no header for the Worker');
  await setSetting('sendUsage', true);
  assert.equal(tel.track('screen.view', { from: 'pads' }), true, 'on again, it tracks again');
});
