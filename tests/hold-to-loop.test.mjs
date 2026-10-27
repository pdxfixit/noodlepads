// How long a hold must last before a pad or a key keeps looping is the
// person's choice (settings.js holdToLoop), so a slow tap does not turn into
// a loop by accident (accessibility seat, council round 1).
// The picker in ⚙️ Settings and 🔁 Loop (a tap loops, no hold) are in
// tests/tap-to-loop.test.mjs.
// Not tested here: a real finger and the sound (audio is spied on, not heard).

import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { fingerTaps } from '../web/finger.js';

let page;
let $;
let settings;
const looping = new Set();

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  settings = await import('../web/settings.js');
  const { audio } = await import('../web/audio.js');
  audio.play = () => {};
  audio.loop = (clip) => { looping.add(clip.id); };
  audio.isLooping = (id) => looping.has(id);
  audio.stop = (id) => { looping.delete(id); };
});

afterEach(async () => {
  looping.clear();
  await settings.setSetting('holdToLoop', 350);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('the hold time is 350 ms to begin with, one of five, and anything else reads as 350', () => {
  const { SETTINGS, allowedValue, cleanPrefs } = settings;
  assert.equal(settings.getSetting('holdToLoop'), 350);
  assert.deepEqual(SETTINGS.holdToLoop.values, [350, 500, 750, 1000, 1500]);
  assert.equal(allowedValue('holdToLoop', 750), 750);
  assert.equal(allowedValue('holdToLoop', 10), undefined);
  assert.equal(allowedValue('holdToLoop', '750'), undefined);
  // It is the person's own, so it travels in their prefs (and so in backups).
  assert.deepEqual(cleanPrefs({ personId: 'p', values: { holdToLoop: 1000 } }).values, { holdToLoop: 1000 });
  assert.deepEqual(cleanPrefs({ personId: 'p', values: { holdToLoop: 5 } }).values, {});
});

test('a finger follower asks for its hold time at each press', async () => {
  let ms = 20;
  const held = [];
  const f = fingerTaps({ onTap: () => {}, onHold: (d) => held.push(d), holdMs: () => ms });
  f.down({ pointerId: 1, clientX: 0, clientY: 0 }, 'a');
  await wait(80);
  assert.deepEqual(held, ['a']);
  ms = 400;
  f.down({ pointerId: 2, clientX: 0, clientY: 0 }, 'b');
  await wait(80);
  assert.deepEqual(held, ['a'], 'the longer hold has not run out');
  f.clear();
});

test('a pad held 500 ms loops at the default and not at 750', async () => {
  const pad = () => $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);
  const press = async (id, type, ms) => {
    pad().dispatch('pointerdown', { button: 0, pointerId: id, pointerType: type, clientX: 5, clientY: 5 });
    await wait(ms);
    page.winEvent('pointerup', { pointerId: id, pointerType: type, clientX: 5, clientY: 5 });
  };
  await press(30, 'touch', 500);
  assert.equal(looping.size, 1, 'a finger, default: it loops');
  looping.clear();
  await settings.setSetting('holdToLoop', 750);
  await press(31, 'touch', 500);
  assert.equal(looping.size, 0, 'a finger, 750: a slow tap is still a tap');
  await press(32, undefined, 500);
  assert.equal(looping.size, 0, 'a mouse, 750: still a tap');
  await press(33, 'touch', 900);
  assert.equal(looping.size, 1, 'a finger held past 750 loops');
});

test('a key held 500 ms loops at the default and not at 750, with a finger, a mouse or the keyboard', async () => {
  $('#live-tab').dispatch('click');
  const key = () => $('#dj-keys').querySelector('[data-code="KeyA"]');
  await settings.setSetting('holdToLoop', 750);
  key().dispatch('pointerdown', { button: 0, pointerId: 40 });
  await wait(500);
  key().dispatch('pointerup', { pointerId: 40 });
  assert.equal(looping.size, 0, 'a mouse');
  key().dispatch('pointerdown', { button: 0, pointerId: 41, pointerType: 'touch', clientX: 5, clientY: 5 });
  await wait(500);
  page.winEvent('pointerup', { pointerId: 41, pointerType: 'touch', clientX: 5, clientY: 5 });
  assert.equal(looping.size, 0, 'a finger');
  page.key('a', { code: 'KeyA', timeStamp: 1000 });
  page.key('a', { code: 'KeyA', timeStamp: 1500, repeat: true });
  page.docEvent('keyup', { key: 'a', code: 'KeyA' });
  assert.equal(looping.size, 0, 'the keyboard');
  page.key('a', { code: 'KeyA', timeStamp: 3000 });
  page.key('a', { code: 'KeyA', timeStamp: 3800, repeat: true });
  page.docEvent('keyup', { key: 'a', code: 'KeyA' });
  assert.equal(looping.size, 1, 'the keyboard, held past 750');
  $('#pads-tab').dispatch('click');
});
