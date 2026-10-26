// What `noodlepads.play` counts, on the stand-in page: each play counts once,
// as its kind. A key on 🎤 Live plays through pads.js tapPad, and once
// counted as both a key and a pad (2026-10-26).
// Not tested here: the sound itself (audio is spied on, not heard).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
let takePlay;
const looping = new Set();

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  ({ takePlay } = await import('../web/play-count.js'));
  audio.play = () => {};
  audio.loop = (clip) => { looping.add(clip.id); };   // a loop counts nothing more by itself
  audio.isLooping = (id) => looping.has(id);
  audio.stop = (id) => { looping.delete(id); };
});

test('a key on 🎤 Live counts once, as a key; a pad counts once, as a pad', () => {
  $('#live-tab').dispatch('click');
  const key = $('#dj-keys').querySelector('[data-code="KeyA"]');
  takePlay();
  key.dispatch('pointerdown', { button: 0, pointerId: 1 });
  key.dispatch('pointerup', { pointerId: 1 });
  assert.deepEqual(takePlay(), { keys: 1 });
  key.dispatch('click', { detail: 0 });
  assert.deepEqual(takePlay(), { keys: 1 }, 'Enter on a focused key too');
  $('#pads-tab').dispatch('click');
  const pad = $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);
  pad.dispatch('pointerdown', { button: 0, pointerId: 2 });
  page.winEvent('pointerup', { pointerId: 2 });
  assert.deepEqual(takePlay(), { pads: 1 });
});

test('a 👆 touch tile counts once, as a key', () => {
  $('#live-tab').dispatch('click');
  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  const tile = $('#dj-touch').querySelector('[data-clip]');
  takePlay();
  tile.dispatch('pointerdown', { button: 0, pointerId: 3 });   // a mouse plays on press
  tile.dispatch('pointerup', { pointerId: 3 });
  assert.deepEqual(takePlay(), { keys: 1 });
  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
});

test('Shift+Enter on a key loops it, counted once as a key; a tap that stops the loop counts nothing', () => {
  const key = $('#dj-keys').querySelector('[data-code="KeyA"]');
  takePlay();
  key.dispatch('click', { detail: 0, shiftKey: true });
  assert.equal(looping.size, 1, 'it loops');
  assert.deepEqual(takePlay(), { keys: 1 }, 'started: one play');
  key.dispatch('pointerdown', { button: 0, pointerId: 4 });
  key.dispatch('pointerup', { pointerId: 4 });
  assert.equal(looping.size, 0, 'the tap stopped it');
  assert.equal(takePlay(), null, 'a stop is not a play');
});
