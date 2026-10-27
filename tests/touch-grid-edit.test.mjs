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
    assert.match($('#te-note').textContent, /kept in ⭐ Layout/);
    assert.ok(state.decks.get('pip').touchMine?.bands?.length, 'the stack it replaced is ⭐ Layout');
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

test('an edge drags like a window splitter, in twelfths, ⅙ at least; the arrow keys move it; one ↩️ Undo a move', async () => {
  $('#dj-change').dispatch('click');
  const edges = qa('[data-edge-k]');
  assert.deepEqual(edges.map((e) => [e.dataset.edgePath, e.dataset.edgeK, e.dataset.dir]), [['0', '0', 'across'], ['', '0', 'down']],
    'between drums and chords, then between the top line and the bottom');
  const side = q('[data-edge-path="0"]');
  assert.equal(side.getAttribute('role'), 'separator');
  assert.equal(side.getAttribute('aria-orientation'), 'vertical');
  assert.equal(side.getAttribute('aria-valuenow'), '8');
  assert.equal(side.getAttribute('aria-label'), 'The edge between 🥁 Drums (⅔) and 🎶 Chords (⅓): drag it, or press ← or →');
  assert.equal(side.dataset.label, '⅔ · ⅓');

  side.dispatch('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(touch().grid.parts[0].parts.map((p) => p.size), [7, 5]);
  assert.equal($('#te-note').textContent, '🥁 Drums takes 7/12, 🎶 Chords 5/12.');
  assert.ok(document.activeElement === q('[data-edge-path="0"]'), 'the edge keeps focus');
  q('[data-edge-path="0"]').dispatch('keydown', { key: 'ArrowUp' });
  assert.deepEqual(touch().grid.parts[0].parts.map((p) => p.size), [7, 5], 'up and down move only an edge lying flat');
  q('[data-edge-path=""]').dispatch('keydown', { key: 'ArrowDown' });
  assert.deepEqual(touch().grid.parts.map((p) => p.size), [9, 3], 'the top line takes ¾');
  $('#te-undo').dispatch('click');
  $('#te-undo').dispatch('click');
  assert.deepEqual(touch().grid.parts[0].parts.map((p) => p.size), [8, 4]);
  assert.deepEqual(touch().grid.parts.map((p) => p.size), [8, 4]);

  // A drag: the two sides measure 0–200 and 216–300 px, so 12 twelfths over 300 px.
  const edge = q('[data-edge-path="0"]');
  const [left, , right] = edge.parentElement.children;
  left.getBoundingClientRect = () => ({ left: 0, right: 200, top: 0, bottom: 100 });
  right.getBoundingClientRect = () => ({ left: 216, right: 300, top: 0, bottom: 100 });
  edge.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 208, clientY: 50, button: 0 });
  $('#touch-edit').dispatch('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 50 });
  assert.equal(edge.dataset.label, '½ · ½', 'the shares while it moves');
  assert.equal(String(left.style.getPropertyValue('--part')), '6', 'its two sides move on screen');
  assert.deepEqual(touch().grid.parts[0].parts.map((p) => p.size), [8, 4], 'nothing kept until it is let go');
  $('#touch-edit').dispatch('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 296, clientY: 50 });
  assert.equal(edge.dataset.label, '⅚ · ⅙', 'chords keeps ⅙');
  $('#touch-edit').dispatch('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 50 });
  $('#touch-edit').dispatch('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 50 });
  assert.deepEqual(touch().grid.parts[0].parts.map((p) => p.size), [4, 8], 'drums ⅓, chords ⅔');
  $('#te-undo').dispatch('click');
  assert.deepEqual(touch().grid.parts[0].parts.map((p) => p.size), [8, 4], 'one Undo for the whole drag');
  $('#touch-edit').close();
});

test('⋯ on a block: split it across or down (a new empty block), or join it to its neighbour; each says why it can\'t', () => {
  $('#dj-change').dispatch('click');
  q('[data-block-more="0-0"]').dispatch('click');
  assert.equal(q('[data-block-more="0-0"]').getAttribute('aria-expanded'), 'true');
  const menu = q('.te-block-menu');
  assert.ok(menu && menu.parentElement === $('#te-bands'), 'a menu under the grid');
  assert.equal(menu.getAttribute('aria-label'), 'The 🥁 Drums block:');
  assert.deepEqual(menu.querySelectorAll('button').map((b) => b.textContent), ['⇹ Split across', '⇳ Split down', 'Join with the one on its right', 'Cancel']);

  q('[data-split="down"]').dispatch('click');
  assert.deepEqual(held(), ['drums', null, 'chords', 'bass'], 'drums keeps the top half, a new empty block under it');
  assert.deepEqual(touch().grid.parts[0].parts[0], { size: 8, dir: 'down', parts: [{ size: 6, band: 0 }, { size: 6 }] });
  assert.equal($('#te-note').textContent, 'Split: a new empty block under 🥁 Drums.');
  assert.ok(document.activeElement === q('[data-drop="0-0-1"]'), 'the new block has focus, ready for a group');
  assert.ok(q('.te-block-menu') === null, 'the menu closes');
  q('[data-add-group="animals"]').dispatch('click');
  assert.deepEqual(held(), ['drums', 'animals', 'chords', 'bass'], 'a tap fills the new block');

  q('[data-block-more="1"]').dispatch('click');
  q('[data-split="across"]').dispatch('click');
  assert.deepEqual(touch().grid.parts[1], { size: 4, dir: 'across', parts: [{ size: 6, band: 3 }, { size: 6 }] }, 'a split the other way nests');
  q('[data-block-more="1-1"]').dispatch('click');
  assert.match(q('.te-block-menu').querySelectorAll('button')[2].textContent, /^Join with the one on its left$/);
  q('[data-join]').dispatch('click');
  assert.deepEqual(touch().grid.parts[1], { size: 4, band: 3 }, 'joined: bass takes the bottom again');
  assert.equal($('#te-note').textContent, 'Joined: its neighbour takes its room.');

  // Drums sits three splits deep now: across would nest a fourth, so it waits, and the menu says why.
  q('[data-block-more="0-0-0"]').dispatch('click');
  const why = q('.te-block-menu');
  assert.equal(why.querySelector('[data-split="across"]').disabled, true);
  assert.equal(why.querySelector('[data-split="down"]').disabled, false, 'down, its own split\'s way, is fine');
  assert.match(why.querySelectorAll('.ke-hint').map((h) => h.textContent).join(' '), /Split across: Blocks inside blocks go three deep at most\./);
  assert.match(why.querySelector('[data-join]').textContent, /^Join with the one below$/);
  q('[data-block-close]').dispatch('click');
  assert.ok(q('.te-block-menu') === null);

  q('[data-block-more="0-0-0"]').dispatch('click');
  q('[data-join]').dispatch('click');
  assert.match($('#te-note').textContent, /^Joined: 🥁 Drums went with its block\./);
  $('#te-undo').dispatch('click');
  assert.ok(held().includes('drums'), 'and ↩️ Undo brings it back');
  for (let i = 0; i < 4; i += 1) $('#te-undo').dispatch('click');
  assert.deepEqual(held(), ['drums', 'chords', 'bass'], 'Undo all the way back');
  $('#touch-edit').close();
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
