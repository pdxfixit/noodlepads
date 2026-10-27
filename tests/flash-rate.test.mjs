// No pad, key or tile flashes more than three times in one second (WCAG
// 2.3.1; accessibility seat, council round 1): a pad mashed, a key hit by a
// fast beat, or a short sound on a loop lights it at most three times, while
// the sound itself plays every time.
// Not tested here: how a flash looks, or the size of the area it covers.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { mayFlash, MAX_FLASHES } from '../web/util.js';
import { flash, setProgress } from '../web/pads.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('a node may flash three times in a second, and again once the second is over', () => {
  const node = {};
  assert.equal(MAX_FLASHES, 3);
  assert.deepEqual([0, 100, 200, 300, 900].map((t) => mayFlash(node, t)), [true, true, true, false, false]);
  assert.equal(mayFlash(node, 1000), true, 'the first flash is a second old');
  assert.equal(mayFlash(node, 1050), false);
  assert.equal(mayFlash({}, 100), true, 'another node has its own count');
});

test('a pad lights for three taps in a second and not for a fourth', async () => {
  $('#pads-tab').dispatch('click');
  const pad = $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);
  const lit = [];
  for (let i = 0; i < 5; i++) {
    flash(pad);
    lit.push(pad.classList.contains('hit'));
    await wait(100);   // past the 90 ms light
  }
  assert.deepEqual(lit, [true, true, true, false, false]);
});

test('a pad playing a short sound over and over is lit three times a second, not every time', () => {
  const pad = $('#pads').querySelectorAll('.pad').filter((p) => p.dataset.id)[1];
  const lit = [];
  for (let i = 0; i < 5; i++) {
    setProgress(pad.dataset.id, 0.3);
    lit.push(pad.classList.contains('playing'));
    setProgress(pad.dataset.id, 0);
  }
  assert.deepEqual(lit, [true, true, true, false, false]);
  // Still part way through: it is not lit until the second is over, and a stop clears it.
  setProgress(pad.dataset.id, 0.5);
  assert.ok(!pad.classList.contains('playing'));
});

test('a ⌨️ key hit again and again is lit three times a second', async () => {
  $('#live-tab').dispatch('click');
  const key = () => $('#dj-keys').querySelector('[data-code="KeyA"]');
  const lit = [];
  // The flash cap reads performance.now(): hold it to 150 ms a hit, so a slow
  // run (the whole suite at once) can't stretch the five hits past a second.
  const realNow = performance.now;
  let clock = realNow.call(performance);
  performance.now = () => clock;
  try {
    for (let i = 0; i < 5; i++) {
      page.key('a', { code: 'KeyA', timeStamp: 1000 + i * 150 });
      page.docEvent('keyup', { key: 'a', code: 'KeyA' });
      lit.push(key().classList.contains('hit'));
      await wait(130);   // past the 120 ms light
      clock += 150;
    }
  } finally { performance.now = realNow; }
  assert.deepEqual(lit, [true, true, true, false, false]);
  $('#pads-tab').dispatch('click');
});
