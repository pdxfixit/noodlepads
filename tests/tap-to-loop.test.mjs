// ⚙️ Settings → 🎨 Look → Hold to loop (five keys for the person's holdToLoop)
// and 🔁 Loop on the Pads bar (the person's tapToLoop): while it is on, a tap
// on a pad or a key starts its loop and a tap on a looping one stops it, with
// no hold at all; off, a tap plays once and a hold loops, as ever.
// Not tested here: a real finger and the sound (audio is spied on, not heard),
// and how the bar looks at each width (just look pads).

import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
let settings;
const looping = new Set();
let loopCalls = 0;
let playCalls = 0;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  settings = await import('../web/settings.js');
  const { audio } = await import('../web/audio.js');
  audio.play = () => { playCalls += 1; };
  audio.loop = (clip) => { loopCalls += 1; looping.add(clip.id); };
  audio.isLooping = (id) => looping.has(id);
  audio.stop = (id) => { looping.delete(id); };
});

afterEach(async () => {
  looping.clear();
  loopCalls = 0;
  playCalls = 0;
  await settings.setSetting('holdToLoop', 350);
  await settings.setSetting('tapToLoop', false);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const padEl = () => $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);
const touchTap = async (id, ms = 0) => {
  padEl().dispatch('pointerdown', { button: 0, pointerId: id, pointerType: 'touch', clientX: 5, clientY: 5 });
  await wait(ms);
  page.winEvent('pointerup', { pointerId: id, pointerType: 'touch', clientX: 5, clientY: 5 });
};
const mousePress = async (id, ms = 0) => {
  padEl().dispatch('pointerdown', { button: 0, pointerId: id });
  await wait(ms);
  page.winEvent('pointerup', { pointerId: id });
};

test('the Hold to loop keys show the person\'s time, and a press sets it', async () => {
  const keys = () => $('#hold-keys').querySelectorAll('[data-hold]');
  const lit = () => keys().filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => k.dataset.hold);
  assert.deepEqual(keys().map((k) => k.dataset.hold), ['350', '500', '750', '1000', '1500'], 'one key per allowed time');
  $('#settings-open').dispatch('click');
  assert.deepEqual(lit(), ['350'], 'the default shows lit');
  keys().find((k) => k.dataset.hold === '750').dispatch('click');
  await page.settle();
  assert.equal(settings.getSetting('holdToLoop'), 750, 'the press sets the setting, as a number');
  assert.deepEqual(lit(), ['750']);
  // A change from elsewhere (a loaded backup, another person) moves the keys too.
  await settings.setSetting('holdToLoop', 1500);
  assert.deepEqual(lit(), ['1500']);
  $('#settings-dialog').close();   // an open dialog stands the page's keys down
});

test('🔁 Loop is off to begin with, and its switch follows the setting', async () => {
  const sw = $('#loop-toggle');
  assert.equal(settings.getSetting('tapToLoop'), false);
  assert.equal(sw.getAttribute('aria-pressed'), 'false');
  sw.dispatch('click');
  await page.settle();
  assert.equal(settings.getSetting('tapToLoop'), true, 'the switch sets it');
  assert.equal(sw.getAttribute('aria-pressed'), 'true');
  sw.dispatch('click');
  await page.settle();
  assert.equal(settings.getSetting('tapToLoop'), false);
  assert.equal(sw.getAttribute('aria-pressed'), 'false');
  await settings.setSetting('tapToLoop', true);
  assert.equal(sw.getAttribute('aria-pressed'), 'true', 'a change from elsewhere lights it');
  // It is the person's own, so it travels in their prefs; only true or false is read.
  assert.deepEqual(settings.cleanPrefs({ personId: 'p', values: { tapToLoop: true } }).values, { tapToLoop: true });
  assert.deepEqual(settings.cleanPrefs({ personId: 'p', values: { tapToLoop: 'yes' } }).values, {});
});

test('🔁 Loop on: a tap on a pad starts its loop with no hold, and a tap on a looping pad stops it', async () => {
  await settings.setSetting('tapToLoop', true);
  await touchTap(50);
  assert.equal(looping.size, 1, 'a finger tap starts the loop');
  assert.equal(playCalls, 0, 'it was not played once first');
  await touchTap(51);
  assert.equal(looping.size, 0, 'a second tap stops it');
  await mousePress(52);
  assert.equal(looping.size, 1, 'a mouse press starts the loop');
  await mousePress(53);
  assert.equal(looping.size, 0, 'and stops it');
});

test('🔁 Loop on: holding a pad loops it once, not twice, and Enter on a pad loops it', async () => {
  await settings.setSetting('tapToLoop', true);
  await touchTap(60, 500);
  assert.equal(loopCalls, 1, 'the hold asked for no second loop');
  assert.equal(looping.size, 1);
  looping.clear();
  loopCalls = 0;
  await mousePress(61, 500);
  assert.equal(loopCalls, 1, 'a mouse held on a pad: the press looped, the hold did not loop again');
  looping.clear();
  padEl().dispatch('click', { detail: 0 });
  assert.equal(looping.size, 1, 'Enter on a pad starts the loop');
});

test('🔁 Loop off: a tap plays once and a short hold does not loop', async () => {
  await touchTap(70);
  assert.equal(playCalls, 1);
  assert.equal(looping.size, 0);
});

test('🔁 Loop on: a key on 🎤 Live loops at once, with a finger, a mouse or the keyboard', async () => {
  await settings.setSetting('tapToLoop', true);
  $('#live-tab').dispatch('click');
  const key = () => $('#dj-keys').querySelector('[data-code="KeyA"]');
  const tapKey = (id) => {
    key().dispatch('pointerdown', { button: 0, pointerId: id, pointerType: 'touch', clientX: 5, clientY: 5 });
    page.winEvent('pointerup', { pointerId: id, pointerType: 'touch', clientX: 5, clientY: 5 });
  };
  tapKey(80);
  assert.equal(looping.size, 1, 'a finger');
  tapKey(81);
  assert.equal(looping.size, 0, 'a second tap stops it');
  key().dispatch('pointerdown', { button: 0, pointerId: 82 });
  await wait(500);
  key().dispatch('pointerup', { pointerId: 82 });
  assert.equal(looping.size, 1, 'a mouse');
  assert.equal(loopCalls, 2, 'held 500 ms, the hold looped nothing more');
  looping.clear();
  loopCalls = 0;
  page.key('a', { code: 'KeyA', timeStamp: 1000 });
  page.key('a', { code: 'KeyA', timeStamp: 1900, repeat: true });
  page.docEvent('keyup', { key: 'a', code: 'KeyA' });
  assert.equal(loopCalls, 1, 'the keyboard: the press loops, held repeats add nothing');
  looping.clear();
  $('#pads-tab').dispatch('click');
});
