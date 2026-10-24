// ⏹️ Stop all turns every ⏲️ Click track off too (Ben, 2026-10-24: "the
// sticky stop button … should also turn off any click tracks"): Beats' own,
// and the one 🎤 Live and ⌨️ Keys share. Each stays off next visit. The
// ticks themselves need a browser.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { recall } from '../web/util.js';

let page;
let $;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const on = (sel) => $(sel).getAttribute('aria-pressed') === 'true';
function turnOn() {
  if (!on('#seq-click')) $('#seq-click').dispatch('click');
  if (!on('#dj-click')) $('#dj-click').dispatch('click');
  assert.ok(on('#seq-click') && on('#dj-click'), 'both click tracks on to start');
}

test('⏹️ Stop all turns both click tracks off, and they stay off', async () => {
  turnOn();
  $('#stop-all').dispatch('click');
  await page.settle();
  assert.equal(on('#seq-click'), false, "Beats' ⏲️");
  assert.equal(on('#dj-click'), false, "Live's ⏲️");
  assert.equal(on('#dj-beat-click'), false, "the keys view's ⏲️");
  assert.ok(!recall('beat-click') && !recall('dj-click'), 'remembered as off');
});

test('Space, which is Stop all, turns them off too', async () => {
  turnOn();
  page.key(' ');
  await page.settle();
  assert.equal(on('#seq-click'), false);
  assert.equal(on('#dj-click'), false);
});

test('a ⏲️ tapped after Stop all turns the click on, not into tap tempo', async () => {
  $('#dj-click').dispatch('click');                // on
  $('#stop-all').dispatch('click');                // off, taps forgotten
  $('#dj-click').dispatch('click');                // one tap: on again
  await page.settle();
  assert.equal(on('#dj-click'), true);
  assert.equal($('#dj-click').textContent, '⏲️ Click track', 'no "keep tapping…"');
  $('#stop-all').dispatch('click');
});
