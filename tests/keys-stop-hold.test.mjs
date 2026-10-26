// A press on a key whose sound loops stops it, and stays stopped however
// long the press lasts, as on 🔊 Pads and with a finger. A mouse held on
// the key, or a keyboard key held into its repeats, stopped the loop and
// then, past the hold time, started it again (2026-10-26).
// Not tested here: the sound (audio is spied on, not heard), real key repeat.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
const calls = [];
const looping = new Set();

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = (clip) => { calls.push(['play', clip.id]); };
  audio.loop = (clip) => { calls.push(['loop', clip.id]); looping.add(clip.id); };
  audio.isLooping = (id) => looping.has(id);
  audio.stop = (id) => { calls.push(['stop', id]); looping.delete(id); };
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => $('#dj-keys').querySelector('[data-code="KeyA"]');
// Shift-click: the key's sound loops at once.
function loopA() {
  key().dispatch('pointerdown', { button: 0, pointerId: 1, shiftKey: true });
  key().dispatch('pointerup', { pointerId: 1 });
  assert.equal(looping.size, 1);
}

test('a mouse held on a looping key stops it, and it stays stopped', async () => {
  $('#live-tab').dispatch('click');
  loopA();
  calls.length = 0;
  key().dispatch('pointerdown', { button: 0, pointerId: 2 });
  await wait(450);   // past the 350 ms hold
  key().dispatch('pointerup', { pointerId: 2 });
  assert.deepEqual(calls.map(([w]) => w), ['stop']);
  assert.equal(looping.size, 0);
});

test('a keyboard key held on a looping sound stops it, and its repeats do not loop it again', () => {
  loopA();
  calls.length = 0;
  page.key('a', { code: 'KeyA', timeStamp: 1000 });
  page.key('a', { code: 'KeyA', timeStamp: 1500, repeat: true });
  page.key('a', { code: 'KeyA', timeStamp: 1550, repeat: true });
  page.docEvent('keyup', { key: 'a', code: 'KeyA' });
  assert.deepEqual(calls.map(([w]) => w), ['stop']);
  assert.equal(looping.size, 0);
  // A key not looping still loops when held.
  calls.length = 0;
  page.key('a', { code: 'KeyA', timeStamp: 2000 });
  page.key('a', { code: 'KeyA', timeStamp: 2500, repeat: true });
  page.docEvent('keyup', { key: 'a', code: 'KeyA' });
  assert.deepEqual(calls.map(([w]) => w), ['play', 'loop']);
  looping.clear();
});
