// What `noodlepads.play` counts, on the stand-in page: each play counts once,
// as its kind. A key on 🎤 Live plays through pads.js tapPad, and once
// counted as both a key and a pad (2026-10-26).
// Not tested here: the sound itself (audio is spied on, not heard).

import { test, before, beforeEach } from 'node:test';
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

// Each test starts the same: nothing looping, the ⌨️ keys (not 👆 tiles),
// on 🔊 Pads, nothing counted yet. A test that failed half way leaves
// nothing behind for the next.
beforeEach(() => {
  looping.clear();
  const keysInput = $('#ke-input').querySelector('[data-input="keys"]');
  if (keysInput.getAttribute('aria-pressed') !== 'true') keysInput.dispatch('click');
  $('#pads-tab').dispatch('click');
  takePlay();
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
});

test('Shift+Enter on a key loops it, counted once as a key; a tap that stops the loop counts nothing', () => {
  $('#live-tab').dispatch('click');
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

// A loop's start is one play, wherever it starts (a key's already counted
// once): a pad's Shift-click, Shift+Enter and a finger held on it counted
// nothing, while a mouse held on it counted its tap (council, 2026-10-26).
test('a pad\'s loop counts once, as a pad, however it starts; a tap that stops it counts nothing', async () => {
  const pad = () => $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);
  pad().dispatch('pointerdown', { button: 0, pointerId: 10, shiftKey: true });
  page.winEvent('pointerup', { pointerId: 10 });
  assert.equal(looping.size, 1);
  assert.deepEqual(takePlay(), { pads: 1 }, 'Shift-click');
  pad().dispatch('pointerdown', { button: 0, pointerId: 11 });
  page.winEvent('pointerup', { pointerId: 11 });
  assert.equal(looping.size, 0);
  assert.equal(takePlay(), null, 'the tap that stopped it');
  pad().dispatch('click', { detail: 0, shiftKey: true });
  assert.deepEqual(takePlay(), { pads: 1 }, 'Shift+Enter');
  looping.clear();
  pad().dispatch('pointerdown', { button: 0, pointerId: 12, pointerType: 'touch', clientX: 5, clientY: 5 });
  await new Promise((r) => setTimeout(r, 450));
  page.winEvent('pointerup', { pointerId: 12, pointerType: 'touch', clientX: 5, clientY: 5 });
  assert.equal(looping.size, 1, 'a finger held: it loops');
  assert.deepEqual(takePlay(), { pads: 1 }, 'a finger held');
  looping.clear();
  pad().dispatch('pointerdown', { button: 0, pointerId: 13 });
  await new Promise((r) => setTimeout(r, 450));
  page.winEvent('pointerup', { pointerId: 13 });
  assert.equal(looping.size, 1, 'a mouse held: it loops');
  assert.deepEqual(takePlay(), { pads: 1 }, 'a mouse held: its tap, once');
});
