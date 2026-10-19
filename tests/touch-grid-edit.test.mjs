// 👆 Layout grids on screen (ADR 0032, Ben 2026-10-19): in ✏️ Layout with
// 👆 Pads, Grids offers ☰ Stacked and ready-made grids of empty blocks; a
// group goes into a block by a tap (the block picked, else the first empty
// one) or a drag; ✕ empties a block; playing, the blocks sit side by side,
// each block's pads filling it. Where they sit is checked with `just look
// grid-edit grid-play grid-beats`; this checks what they hold.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { blocks } from '../web/touch-grid.js';

const remembered = new Map();
const storage = {
  getItem: (k) => (remembered.has(k) ? remembered.get(k) : null),
  setItem: (k, v) => { remembered.set(k, String(v)); },
  removeItem: (k) => { remembered.delete(k); },
};

let page;
let $;
let state;

before(async () => {
  console.error = () => {};
  page = installPage({ storage, manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = () => {};
  $('#live-tab').dispatch('click');
  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  $('#dj-change').dispatch('click');
});

const touch = () => state.decks.get('pip')?.touch;
const q = (sel) => $('#touch-edit').querySelector(sel);
const qa = (sel) => $('#touch-edit').querySelectorAll(sel);
const held = () => blocks(touch().grid).map((b) => (b.band == null ? null : touch().bands[b.band].group));
const pressed = () => qa('[data-shape]').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.shape);

test('Grids: ☰ Stacked to start, then four ready-made grids; one turns the layout into its empty blocks', () => {
  assert.equal($('#touch-edit').open, true);
  assert.deepEqual(qa('[data-shape]').map((b) => b.dataset.shape), ['stacked', 'two-one', 'corners', 'three', 'halves']);
  assert.deepEqual(qa('.te-shape-name').map((n) => n.textContent), ['Stacked', 'Two and one', 'Four corners', 'Three across', 'Side by side']);
  assert.deepEqual(pressed(), ['stacked']);
  assert.ok(q('[data-handle="0"]'), 'stacked, a band has ⠿');
  assert.ok(q('[data-size="m"][data-band="0"]'), 'and S M L');
  const before = touch()?.bands?.length ?? 0;

  q('[data-shape="two-one"]').dispatch('click');
  assert.deepEqual(pressed(), ['two-one']);
  assert.deepEqual(touch().bands, []);
  assert.deepEqual(held(), [null, null, null]);
  assert.equal($('#te-bands-title').textContent, 'Blocks');
  assert.deepEqual(qa('[data-drop]').map((b) => b.dataset.drop), ['0-0', '0-1', '1']);
  assert.match($('#te-note').textContent, /^Two and one: tap a block, then a group, or drag a group onto a block\./);
  if (before) {
    assert.match($('#te-note').textContent, /kept in ⭐ My layout/);
    assert.ok(state.decks.get('pip').touchMine?.bands?.length, 'the stack it replaced is ⭐ My layout');
  }
  q('[data-shape="two-one"]').dispatch('click');
  assert.deepEqual(held(), [null, null, null], 'the grid already on: nothing changes');
});

test('a group goes in the block picked, else the first empty one; every block full says so', () => {
  q('[data-add-group="drums"]').dispatch('click');
  assert.deepEqual(held(), ['drums', null, null], 'nothing picked: the first empty block');
  assert.equal(touch().bands[0].sounds.length, 4, 'with its starting sounds');
  q('[data-drop="1"]').dispatch('click');
  assert.equal(q('[data-drop="1"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('#te-note').textContent, 'Now tap a group below for this block.');
  q('[data-add-group="bass"]').dispatch('click');
  assert.deepEqual(held(), ['drums', null, 'bass'], 'the block picked');
  q('[data-add-group="chords"]').dispatch('click');
  assert.deepEqual(held(), ['drums', 'chords', 'bass']);
  assert.deepEqual(touch().bands.map((b) => b.group), ['drums', 'chords', 'bass'], 'bands in the blocks\' reading order');
  assert.ok(q('[data-handle]') === null, 'in a block: no ⠿, its place is the block');
  assert.ok(q('[data-size][data-band]') === null, 'and no S M L: the block decides');
  q('[data-add-group="animals"]').dispatch('click');
  assert.deepEqual(held(), ['drums', 'chords', 'bass'], 'full: nothing moves');
  assert.match($('#te-note').textContent, /^Every block holds a group\./);
  assert.match($('#te-add-hint').textContent, /^Every block holds a group\./);
});

test('a group dragged onto a block takes its place (a mouse at once, a finger after holding still)', async () => {
  const drag = async (group, cell, pointerType = 'mouse') => {
    document.elementFromPoint = () => q(`.te-cell[data-cell="${cell}"]`);
    const g = q(`[data-add-group="${group}"]`);
    g.dispatch('pointerdown', { pointerId: 7, pointerType, clientX: 0, clientY: 0, button: 0 });
    if (pointerType === 'touch') await new Promise((r) => setTimeout(r, 320));
    $('#touch-edit').dispatch('pointermove', { pointerId: 7, pointerType, clientX: 0, clientY: pointerType === 'touch' ? 4 : 40 });
    $('#touch-edit').dispatch('pointerup', { pointerId: 7, pointerType, clientX: 0, clientY: 40 });
    g.dispatch('click');   // the click after a drag is no tap
    await new Promise((r) => setTimeout(r, 0));
  };
  await drag('animals', '0-1');
  assert.deepEqual(held(), ['drums', 'animals', 'bass']);
  assert.equal($('#te-note').textContent, '🐵 Animals is in the block now, in place of 🎶 Chords.');
  await drag('chords', '0-1', 'touch');
  assert.deepEqual(held(), ['drums', 'chords', 'bass']);
  assert.deepEqual(touch().bands[1].sounds.length, 4, 'chords start again with their four');
});

test('✕ empties a block, and ↩️ Undo fills it again', () => {
  q('[data-cell="0-1"] [data-remove]').dispatch('click');
  q('[data-cell="0-1"] [data-remove]').dispatch('click');
  assert.deepEqual(held(), ['drums', null, 'bass']);
  assert.ok(q('[data-drop="0-1"]'), 'dashed again');
  $('#te-undo').dispatch('click');
  assert.deepEqual(held(), ['drums', 'chords', 'bass']);
});

test('a pad in a block swaps or more are added, in the picker under the grid', () => {
  q('[data-cell="0-0"] [data-tile="0"]').dispatch('click');
  const picker = q('.te-picker');
  assert.ok(picker, 'the picker opens');
  assert.ok(picker.parentElement === $('#te-bands'), 'under the grid, not inside a narrow block');
  assert.match(picker.getAttribute('aria-label'), /^Swap 🦶 Kick for:/);
  q('[data-pick-close]').dispatch('click');
  assert.ok(q('.te-picker') === null);
});

test('playing: the blocks side by side in the grid, each block\'s pads in the columns that fill it', () => {
  $('#touch-edit').close();
  const grid = $('#dj-touch').querySelector('.touch-grid');
  assert.ok(grid, 'a grid, not bands');
  const root = grid.querySelector('.grid-split');
  assert.equal(root.dataset.dir, 'down');
  assert.equal(root.style.getPropertyValue('--part'), '', 'the top split fills the grid');
  const cells = $('#dj-touch').querySelectorAll('.touch-cell');
  assert.deepEqual(cells.map((c) => c.querySelector('.touch-head').textContent), ['🥁 Drums', '🎶 Chords', '🎸 Bass']);
  assert.deepEqual(cells.map((c) => String(c.style.getPropertyValue('--part'))), ['8', '4', '4'], 'drums ⅔ of the top line, chords ⅓; bass the bottom ⅓');
  for (const c of cells) assert.ok(Number(c.querySelector('.cell-tiles').style.getPropertyValue('--cols')) >= 1);
  assert.equal(cells[0].querySelectorAll('[data-clip]').length, 4, 'every pad plays as a tile does');
});

test('a saved layout keeps its grid; ☰ Stacked puts the groups one under another, in the blocks\' order', () => {
  $('#dj-change').dispatch('click');
  q('#te-save').dispatch('click');
  $('#te-save-name').value = 'Gridlock';
  $('#te-save-ok').dispatch('click');
  const saved = state.touchLayouts.find((l) => l.name === 'Gridlock');
  assert.deepEqual(saved.grid, touch().grid);
  q('[data-shape="stacked"]').dispatch('click');
  assert.equal(touch().grid, undefined);
  assert.deepEqual(touch().bands.map((b) => b.group), ['drums', 'chords', 'bass']);
  assert.equal($('#te-bands-title').textContent, 'Groups, top to bottom');
  assert.ok(q('[data-handle="0"]'));
  q(`[data-layout="${saved.id}"]`).dispatch('click');
  assert.deepEqual(held(), ['drums', 'chords', 'bass'], 'loading it brings the grid back');
  assert.deepEqual(pressed(), ['two-one']);
  q('[data-shape="stacked"]').dispatch('click');
  $('#touch-edit').close();
});
