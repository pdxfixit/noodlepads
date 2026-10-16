// 🎛️ The level-up nudge (ADR 0028, web/nudge.js): a Regular person who
// keeps reaching for what Advanced adds (🎚️ Mixer, 🎹 a tune, + Add a layer)
// is offered Advanced once, in the update bar's place; never 🧸 Kids; the
// update bar wins. The pure trigger first, then the real app on the stand-in
// page with first steps on. The fade and the running line need a browser:
// `just look nudge`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { getSetting, setSetting, allowedValue } from '../web/settings.js';
import { nudgeDue, withReach, cleanReaches, REACH_KEEP } from '../web/firsts.js';

test('the trigger: three reaches over at least two visits, Regular only, once', () => {
  const at = (reaches, level = 'regular', seen = '') => nudgeDue({ level, seen, reaches });
  assert.equal(at('a,a'), false, 'two reaches');
  assert.equal(at('a,a,a'), false, 'three in one visit');
  assert.equal(at('a,a,b'), true);
  assert.equal(at('a,b,c', 'kids'), false, 'never 🧸 Kids');
  assert.equal(at('a,b,c', 'advanced'), false);
  assert.equal(at('a,b,c', 'regular', 'nudge,tip-pads'), false, 'offered once');
  assert.equal(withReach('', 'k1'), 'k1');
  assert.equal(withReach('a,a', 'a'), 'a,a,a', 'repeats count');
  assert.equal(cleanReaches('1,2,3,4,5,6,7,8,9,10').split(',').length, REACH_KEEP, 'the last few kept');
  assert.equal(cleanReaches('ok,NOT OK,<x>'), 'ok');
  assert.equal(allowedValue('reaches', 5), undefined);
});

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
  await page.settle();
});

const bar = () => $('#nudge-bar');

// The stand-in page can't draw the mixer or the roll, so they open as
// dialogs.js opens every dialog, which is what the nudge listens to.
test('🎚️ Mixer, 🎹 a tune and + Add a layer, over two visits: "Want more knobs?" in the update bar\'s place', async () => {
  const { openDialog } = await import('../web/dialogs.js');
  await setSetting('reaches', 'oldvisit');   // a reach on an earlier visit
  openDialog($('#mixer'));
  await page.settle();
  assert.equal(bar().hidden, true, 'two reaches: not yet');
  $('#mixer').close();
  openDialog($('#roll'));
  await page.settle();
  assert.equal(getSetting('reaches').split(',').length, 3);
  assert.equal(bar().hidden, true, 'due, but never over a dialog');
  $('#roll').close();
  $('#layer-add').dispatch('click');   // + Add a layer, opening its palette
  await page.settle();
  assert.equal(getSetting('reaches').split(',').length, 4);
  const { nudgeTick } = await import('../web/nudge.js');
  $('#update-bar').hidden = false;
  assert.equal(nudgeTick(), false, 'the update bar wins');
  assert.equal(bar().hidden, true);
  $('#update-bar').hidden = true;
  assert.equal(nudgeTick(), true);
  assert.equal(bar().hidden, false);
  assert.ok(bar().classList.contains('update-bar'), 'its look and place');
  assert.match(bar().querySelector('.update-text').textContent, /Want more knobs\?/);
  assert.ok(!getSetting('seen').includes('nudge'), 'showing is not answering');
  $('#update-bar').hidden = false;
  nudgeTick();
  assert.equal(bar().hidden, true, 'an update coming hides it, unseen');
  $('#update-bar').hidden = true;
  nudgeTick();
  assert.equal(bar().hidden, false, 'and it comes back');
});

test('Try Advanced sets the level, with Undo in the banner; then never again', async () => {
  $('#nudge-try').dispatch('click');
  await page.settle();
  assert.equal(bar().hidden, true);
  assert.equal(getSetting('level'), 'advanced');
  assert.ok(getSetting('seen').split(',').includes('nudge'));
  assert.equal($('#banner').hidden, false);
  assert.match($('#banner-text').textContent, /Advanced is on/);
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.equal(getSetting('level'), 'regular', '↩️ Undo');
  const { nudgeTick, reach } = await import('../web/nudge.js');
  await reach();
  await reach();
  assert.equal(nudgeTick(), false, 'offered once');
});

test('✕ answers it for good, and 🧸 Kids never counts a reach', async () => {
  const { nudgeTick, reach } = await import('../web/nudge.js');
  await setSetting('seen', '');
  await setSetting('reaches', 'a,b,c');
  assert.equal(nudgeTick(), true);
  $('#nudge-close').dispatch('click');
  await page.settle();
  assert.equal(bar().hidden, true);
  assert.ok(getSetting('seen').split(',').includes('nudge'));
  await setSetting('seen', '');
  await setSetting('reaches', '');
  await setSetting('level', 'kids');
  await reach();
  assert.equal(getSetting('reaches'), '');
  await setSetting('level', 'regular');
});
