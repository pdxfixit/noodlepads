// 🧸 Kids' first steps have no words (ADR 0028): a 👆 hand pulses over the
// first pad until a pad is tapped, and the mic wiggles until the first
// recording; once per person. The real app on the stand-in page with first
// steps on. The motion, and its stillness under reduced motion, need a
// browser: `just look kids-hand` (and `--reduced-motion`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { getSetting, setSetting } from '../web/settings.js';

let page;
let $;
before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();
  page = installPage({ firstSteps: true });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  $('#wl-skip').dispatch('click');   // this new device's welcome
  await setSetting('level', 'kids');
  await page.settle();
});

const pads = () => $('#kids-pages').querySelectorAll('.kids-pad');
const hands = () => $('#kids-pages').querySelectorAll('.kids-hand');
const tab = async (name) => { $(`[data-kids-tab="${name}"]`).dispatch('click'); await page.settle(); };

test('👆 over the first pad, and only there, until a pad is tapped; then never again', async () => {
  await tab('pads');
  assert.equal(hands().length, 1);
  assert.equal(hands()[0].parent, pads()[0], 'on the first pad');
  assert.equal(hands()[0].getAttribute('aria-hidden'), 'true', 'a picture, nothing to read');
  pads()[1].dispatch('pointerdown');   // a mouse plays on press
  await page.settle();
  assert.equal(hands().length, 0);
  assert.ok(getSetting('seen').split(',').includes('kids-pad'), "kept as this person's");
  await tab('record');
  await tab('pads');
  assert.equal(hands().length, 0, 'once per person');
});

test('the mic wiggles until the first recording; a mic that can\'t record never wiggles', async () => {
  await tab('record');
  assert.equal($('#kids-mic').disabled, true, 'the stand-in page has no microphone');
  assert.equal($('#kids-mic').classList.contains('kids-nudge'), false, 'off: nothing to nudge toward');
  // A stand-in microphone: the mic records, so it wiggles.
  window.MediaRecorder = class {};
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [] }) };
  await tab('pads');
  await tab('record');
  assert.equal($('#kids-mic').disabled, false);
  assert.equal($('#kids-mic').classList.contains('kids-nudge'), true);
  await (await import('../web/tips.js')).markSeen('kids-mic');   // as a kept recording does (kids.js keep)
  await tab('pads');
  await tab('record');
  assert.equal($('#kids-mic').classList.contains('kids-nudge'), false);
});

test('Regular and Advanced never get the hand', async () => {
  await setSetting('seen', '');
  await setSetting('level', 'regular');
  const { kidsHint } = await import('../web/tips.js');
  assert.equal(kidsHint('pad'), false);
  assert.equal(kidsHint('mic'), false);
});
