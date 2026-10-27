// ✏️ Edit sounds with several sounds chosen (web/bulk.js), and groups of a
// kid's own sounds on the pads, driven through the real app on the stand-in
// page. Nothing is heard: audio.start is replaced, and clips never decode.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';

let page;
let $;
let state;
let audio;

const mine = () => state.userClips.filter((c) => c.personId === state.personId);
const pad = (id) => $('#pads').querySelector(`.pad[data-id="${id}"]`);
const bar = (what) => $('#pads-chosen').querySelector(`[data-bulk="${what}"]`);
const kickPad = () => $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id?.endsWith('-kick'));
const ownHeaders = () => $('#pads').querySelectorAll('.pad-group').filter((h) => h.dataset.own !== undefined).map((h) => h.children.map((c) => c.textContent).join(''));

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ({ state } = await import('../web/state.js'));
  ({ audio } = await import('../web/audio.js'));
  audio.start = () => {};
  const { renderPads } = await import('../web/pads.js');
  for (const [i, label] of ['Moo', 'Baa', 'Oink', 'Zap'].entries()) {
    state.userClips.push({ id: `user-t-${i}`, personId: state.personId, label, emoji: '🐮', color: 'red', voice: 'normal', blob: new Blob(['x']), mime: 'audio/webm', created: i + 1 });
  }
  renderPads();
  $('#edit-toggle').dispatch('click');
});

test('📁 Move to group → a new group: the sounds go under its header, and Not in a group holds the rest', async () => {
  pad('user-t-0').dispatch('click');
  pad('user-t-1').dispatch('click');
  assert.equal($('#chosen-count').textContent, '2 selected');
  assert.equal(bar('move').disabled, false);
  bar('move').dispatch('click');
  assert.equal($('#bulk-dialog').open, true);
  assert.equal($('#bulk-group-name').value, '', 'a new group is never given a name');
  $('#bulk-group-name').value = '  Farm  ';
  $('#bulk-body').querySelector('form').dispatch('submit');
  await page.settle();
  assert.equal($('#bulk-dialog').open, false);
  const groups = state.orders.get(state.personId).groups;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Farm');
  assert.deepEqual(mine().filter((c) => c.group === groups[0].id).map((c) => c.label), ['Moo', 'Baa']);
  assert.ok(ownHeaders()[0].includes('Farm') && ownHeaders()[0].endsWith('2'), ownHeaders().join(' / '));
  assert.ok(ownHeaders()[1].includes('Not in a group'));
  assert.equal($('#pads-chosen').hidden, true, 'the move lets go of the selection');
});

test('a group\'s ✏️ renames it; a closed group shows just its header', async () => {
  const id = state.orders.get(state.personId).groups[0].id;
  $('#pads').querySelector(`[data-group-edit="${id}"]`).dispatch('click');
  assert.equal($('#bulk-group-rename').value, 'Farm');
  $('#bulk-group-rename').value = 'Animals';
  $('#bulk-body').querySelector('form').dispatch('submit');
  await page.settle();
  assert.equal(state.orders.get(state.personId).groups[0].name, 'Animals');
  const header = $('#pads').querySelector(`.pad-group[data-group="${id}"]`);
  header.dispatch('click');
  assert.equal(pad('user-t-0'), null, 'closed');
  $('#pads').querySelector(`.pad-group[data-group="${id}"]`).dispatch('click');
  assert.ok(pad('user-t-0'), 'open again');
});

test('🎨 Color · picture and 🪄 Voice change every chosen sound; presets chosen make Move and Share wait', async () => {
  pad('user-t-2').dispatch('click');
  pad('user-t-3').dispatch('click');
  bar('look').dispatch('click');
  $('#bulk-body').querySelector('[data-color="blue"]').dispatch('click');
  $('#bulk-body').querySelector('[data-emoji="🚀"]').dispatch('click');
  $('#bulk-body').querySelector('.bulk-apply').dispatch('click');
  await page.settle();
  assert.deepEqual(mine().slice(2).map((c) => [c.color, c.emoji]), [['blue', '🚀'], ['blue', '🚀']]);
  bar('voice').dispatch('click');
  assert.equal($('#bulk-body').querySelector('.bulk-apply').disabled, true, 'nothing to apply until something is picked');
  const robot = $('#bulk-body').querySelector('[data-preset="robot"]');
  assert.equal(robot.getAttribute('aria-label'), 'Robot', 'the sound sheet\'s chips: emoji only, named');
  robot.dispatch('click');
  assert.equal($('#bulk-body').querySelector('.voice-line').textContent, 'Robot is: robot');
  const rows = () => $('#bulk-body').querySelector('.layer-rows').children.map((li) => li.dataset.layer);
  assert.deepEqual(rows(), ['pitch', 'speed', 'robot', 'warble', 'volume', 'echo'], 'the sound sheet\'s Layers rows: Robot\'s row joins in play order');
  assert.equal($('#bulk-body').querySelector('[data-mute]'), null, 'no 🔈 here');
  $('#bulk-body').querySelector('[data-preset="stadium"]').dispatch('click');
  const echoKeys = $('#bulk-body').querySelector('input[data-layer-knob="echo"]').parentElement.querySelector('.slider-keys').children;
  assert.deepEqual(echoKeys.map((b) => [b.textContent, b.getAttribute('aria-pressed')]).filter(([, on]) => on === 'true'), [['Echo', 'true']], 'Echo is keys, and Stadium pressed Echo');
  $('#bulk-body').querySelector('.bulk-apply').dispatch('click');
  await page.settle();
  assert.deepEqual(mine().slice(2).map((c) => [c.voice, c.tweaks]), [['normal', { echo: 3, robot: 1 }], ['normal', { echo: 3, robot: 1 }]], 'the knobs, on every one');
  // A preset joins the selection: Move and Share wait, and say why.
  kickPad().dispatch('click');
  assert.equal($('#chosen-count').textContent, '3 selected');
  assert.equal(bar('move').disabled, true);
  assert.equal(bar('share').disabled, true);
  assert.equal($('#chosen-why').hidden, false);
  $('#chosen-clear').dispatch('click');
  assert.equal($('#pads-chosen').hidden, true);
});

// Esc in 🪄 Voice's + Add a layer palette closes the palette alone: before,
// it had no Esc of its own.
test('🪄 Voice: Esc closes the open + Add a layer palette, and only that', async () => {
  pad('user-t-2').dispatch('click');
  bar('voice').dispatch('click');
  const add = $('#bulk-body').querySelectorAll('button').find((b) => b.textContent === '+ Add a layer');
  const palette = $('#bulk-body').querySelector('.layer-palette');
  add.dispatch('click');
  assert.equal(palette.hidden, false);
  const e = palette.dispatch('keydown', { key: 'Escape' });
  assert.equal(palette.hidden, true, 'closed');
  assert.equal(e.defaultPrevented, true, 'so the sheet stays open and nothing stops');
  assert.equal($('#bulk-dialog').open, true);
  // A layer picked from it: the palette hides, and focus goes back to + Add a layer.
  add.dispatch('click');
  const knob = palette.querySelector('[data-add-knob]');
  knob.focus();   // a pick by keyboard: the focus is on it as the palette hides
  knob.dispatch('click');
  assert.equal(palette.hidden, true);
  assert.ok(document.activeElement === add || document.activeElement === $('#bulk-body').querySelector('.bulk-apply'), 'never left in the hidden palette');
  $('#bulk-dialog').close();
  $('#chosen-clear').dispatch('click');
});

test('🗑️ Delete asks first, deletes sounds and hides a preset, and ↩️ Undo brings it all back', async () => {
  pad('user-t-2').dispatch('click');
  kickPad().dispatch('click');
  bar('delete').dispatch('click');
  assert.ok(bar('delete').classList.contains('armed'), 'the first tap only asks');
  assert.equal(mine().length, 4);
  bar('delete').dispatch('click');
  await page.settle();
  assert.equal(mine().length, 3);
  const kick = [...state.overrides.values()].find((o) => o.id.endsWith('-kick'));
  assert.equal(kick?.hidden, true);
  assert.equal(hasUndo(), true);
  assert.match($('#banner-text').textContent, /^Deleted Oink, hid Kick\.$/);
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.equal(mine().length, 4);
  assert.ok(mine().some((c) => c.label === 'Oink' && c.tweaks?.robot === 1), 'as it was');
  assert.ok(![...state.overrides.values()].some((o) => o.id.endsWith('-kick') && o.hidden));
});

test('a pad\'s own 🗑️ deletes in two taps, with Undo; a group left empty goes', async () => {
  const id = state.orders.get(state.personId).groups[0].id;
  for (const clipId of ['user-t-0', 'user-t-1']) {
    const x = () => pad(clipId).parent.querySelector('[data-x]');
    assert.equal(x().getAttribute('aria-label'), `Delete ${clipId === 'user-t-0' ? 'Moo' : 'Baa'}`);
    x().dispatch('click');
    assert.match(x().getAttribute('aria-label'), /Tap again to delete$/);
    x().dispatch('click');
    await page.settle();
  }
  assert.equal(state.orders.get(state.personId).groups, undefined, 'the empty group is gone');
  assert.deepEqual(ownHeaders(), [], 'no groups, no headers');
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.ok(mine().some((c) => c.label === 'Baa' && c.group === id));
  assert.equal(state.orders.get(state.personId).groups[0].id, id, 'Undo brings the group back with it');
});

// Ben, 2026-10-11: sharing a kid's 27 sounds should be two taps.
test('Select all: one tap on a pad, then Select all chooses every sound you made (not presets); a group\'s ✏️ selects just its sounds', async () => {
  kickPad().dispatch('click');
  assert.equal($('#chosen-all').hidden, false);
  $('#chosen-all').dispatch('click');
  assert.equal($('#chosen-count').textContent, `${mine().length + 1} selected`, 'the preset stays chosen');
  $('#chosen-clear').dispatch('click');
  pad('user-t-2').dispatch('click');
  $('#chosen-all').dispatch('click');
  assert.equal($('#chosen-count').textContent, `${mine().length} selected`);
  assert.equal($('#chosen-all').hidden, true, 'nothing more to select');
  assert.equal(bar('share').disabled, false, 'all yours, so Share is open');
  $('#chosen-clear').dispatch('click');
  assert.equal($('#pads-chosen').hidden, true);
  const id = state.orders.get(state.personId).groups[0].id;
  $('#pads').querySelector(`[data-group-edit="${id}"]`).dispatch('click');
  const pick = $('#bulk-body').querySelector(`[data-select-group="${id}"]`);
  const n = mine().filter((c) => c.group === id).length;
  assert.equal(pick.textContent, `☑️ Select its ${n} sound${n === 1 ? '' : 's'}`);
  pick.dispatch('click');
  assert.equal($('#bulk-dialog').open, false);
  assert.equal($('#chosen-count').textContent, `${n} selected`);
  $('#chosen-clear').dispatch('click');
});
