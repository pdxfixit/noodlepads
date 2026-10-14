// 🎹 The piano roll in the real app (web/roll.js, ADR 0023): 🎹 Add a tune,
// tapping squares and notes, stretching a note, ↩️ Undo, the scale lock,
// ⌃ ⌄, ½ Half pills at Advanced, ✅ Done, the compact row's preview, 🎹 Tune
// in the sound picker, and the roll from ⌨️ Keys. The stand-in page has no
// layout and no sound: a drag is stretched by keys here, and what a note
// sounds like needs a browser.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOn, keysOff } from './new-beat.mjs';

let page;
let $;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const roll = () => $('#roll');
const grid = () => roll().querySelector('[data-roll="grid"]');
const btn = (name) => roll().querySelector(`[data-roll="${name}"]`);
const cell = (p, s) => grid().querySelector(`.note-cell[data-p="${p}"][data-s="${s}"]`);
const notes = () => grid().querySelectorAll('.roll-note');
const names = () => grid().querySelectorAll('.roll-name').filter((x) => !x.classList.contains('roll-corner')).map((x) => x.textContent);
const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
const lastRow = () => rows().at(-1);
const newBeat = () => document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-new]').dispatch('click');
async function setLevel(level) {
  $('#settings-open').dispatch('click');
  $('#level-keys').querySelector(`[data-level="${level}"]`).dispatch('click');
  $('#settings-dialog').close();
  await page.settle();
}

test('🎹 Add a tune makes a tune row of the C note and opens its roll: two octaves of white keys, C rows brighter', () => {
  keysOff(page);
  newBeat();
  $('#seq-add').dispatch('click');                  // a drum row first, for the strip
  rows()[0].querySelectorAll('.pill')[0].dispatch('click');
  $('#seq-add-tune').dispatch('click');
  assert.equal(roll().open, true, 'the roll opens');
  assert.match(btn('title').textContent, /🎹 .* C$/, 'named after its sound');
  assert.deepEqual(names(), ['C', 'B', 'A', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'G', 'F', 'E', 'D', 'C'], 'scale lock on: white keys, highest on top');
  assert.equal(grid().querySelectorAll('.roll-name.c').length, 3);
  assert.equal(grid().querySelectorAll('.note-cell').length, 15 * 16, 'a square a pill, a line a note');
  assert.ok(grid().querySelector('.roll-hit.on'), 'the strip shows the drum row\'s hit');
  assert.equal(btn('half').hidden, true, 'half pills are Advanced');
  assert.ok(lastRow().querySelector('.row-emoji').classList.contains('tune'), 'the row\'s emoji wears 🎹');
});

test('tap a square: a note one pill long; tap it: it goes, and ↩️ Undo brings it back', () => {
  cell(4, 2).dispatch('click');
  assert.equal(notes().length, 1);
  assert.match(notes()[0].getAttribute('aria-label'), /^E, beat 1, part 3, 1 pill long/);
  cell(7, 2).dispatch('click');                     // a G at the same time: a chord
  assert.equal(notes().length, 2);
  notes().find((x) => /^G/.test(x.getAttribute('aria-label'))).dispatch('click');
  assert.equal(notes().length, 1, 'tapping a note takes it out');
  assert.match(btn('status').textContent, /Took out G/);
  assert.equal(btn('undo').disabled, false);
  btn('undo').dispatch('click');
  assert.equal(notes().length, 2, 'Undo puts it back');
  btn('undo').dispatch('click');
  assert.equal(notes().length, 1, 'and the one before');
});

test('Shift and the arrow keys stretch a note, a whole pill at a time; the compact row shows where it starts and lasts', () => {
  const e = () => notes().find((x) => /^E/.test(x.getAttribute('aria-label')));
  e().dispatch('keydown', { key: 'ArrowRight', shiftKey: true });
  e().dispatch('keydown', { key: 'ArrowRight', shiftKey: true });
  assert.match(e().getAttribute('aria-label'), /3 pills long/);
  e().dispatch('keydown', { key: 'ArrowLeft', shiftKey: true });
  assert.match(e().getAttribute('aria-label'), /2 pills long/);
  const pills = lastRow().querySelectorAll('.pill');
  assert.equal(pills[2].getAttribute('aria-pressed'), 'true', 'lit where it starts');
  assert.ok(pills[3].classList.contains('held'), 'half lit while it lasts');
  assert.ok(!pills[4].classList.contains('held'));
});

test('arrow keys move between squares; Enter on a square adds a note there', () => {
  const start = grid().querySelector('.note-cell.cursor');
  start.focus();
  start.dispatch('keydown', { key: 'ArrowRight' });
  const next = document.activeElement;
  assert.equal(Number(next.dataset.s), Number(start.dataset.s) + 1);
  next.dispatch('keydown', { key: 'ArrowUp' });
  assert.ok(Number(document.activeElement.dataset.p) > Number(next.dataset.p), 'up: a higher note');
  document.activeElement.dispatch('click');         // Enter or Space presses the square
  assert.equal(notes().length, 2);
  notes().at(-1).dispatch('keydown', { key: 'Delete' });
  assert.equal(notes().length, 1);
});

test('♯ All notes shows all twelve; ⌃ ⌄ move an octave and count the notes out of sight', () => {
  btn('scale').dispatch('click');
  assert.equal(btn('scale').getAttribute('aria-pressed'), 'true');
  assert.equal(names().length, 25);
  cell(6, 0).dispatch('click');                     // an F♯
  btn('scale').dispatch('click');
  assert.ok(names().includes('F♯'), 'a row with a note stays, scale lock or not');
  assert.equal(names().length, 16);
  btn('up').dispatch('click');
  assert.equal(btn('down').textContent, '⌄ 2', 'the E and F♯ are below now');
  assert.equal(notes().length, 0);
  btn('down').dispatch('click');
  assert.equal(notes().length, 2);
  notes().find((x) => /^F♯/.test(x.getAttribute('aria-label'))).dispatch('click');
});

test('▶ Play plays the whole beat; ✅ Done goes back to it, and the emoji or a pill opens the roll again', async () => {
  btn('play').dispatch('click');
  await page.settle();
  assert.equal(btn('play').getAttribute('aria-pressed'), 'true');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'the beat plays');
  btn('play').dispatch('click');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'false');
  btn('done').dispatch('click');
  assert.equal(roll().open, false);
  lastRow().querySelectorAll('.pill')[9].dispatch('click');
  assert.equal(roll().open, true, 'a pill of a tune row opens the roll');
  assert.equal(lastRow().querySelectorAll('.pill')[9].getAttribute('aria-pressed'), 'false', 'and is not switched on');
  roll().close();
  lastRow().querySelector('[data-pick]').dispatch('click');
  assert.equal(roll().open, true, 'so does its emoji');
  assert.equal($('#chooser').open, false);
});

test('🔊 Sound in the roll opens the row\'s sound picker; 🎹 Tune off asks first, then the notes become pills', () => {
  btn('sound').dispatch('click');
  assert.equal($('#chooser').open, true);
  assert.equal($('#chooser-melody').getAttribute('aria-pressed'), 'true');
  $('#chooser-melody').dispatch('click');
  assert.match($('#chooser-melody').textContent, /Off\?/, 'an E two pills long would lose its pitch and length');
  assert.equal(roll().open, true);
  $('#chooser-melody').dispatch('click');
  assert.equal(roll().open, false, 'not a tune any more: the roll closes');
  $('#chooser').close();
  const pills = lastRow().querySelectorAll('.pill');
  assert.equal(pills[2].getAttribute('aria-pressed'), 'true', 'the note became a pill');
  assert.ok(!lastRow().querySelector('.row-emoji').classList.contains('tune'));
  // And on again: its pills become notes, and the roll opens.
  lastRow().querySelector('[data-pick]').dispatch('click');
  $('#chooser-melody').dispatch('click');
  assert.equal($('#chooser').open, false);
  assert.equal(roll().open, true);
  assert.equal(notes().length, 1);
  roll().close();
});

test('🧹 on a tune row takes out its notes', () => {
  const clear = lastRow().querySelector('[data-clear]');
  assert.match(clear.getAttribute('aria-label'), /notes/);
  clear.dispatch('click');
  lastRow().querySelector('[data-clear]').dispatch('click');
  assert.ok(lastRow().querySelectorAll('.pill').every((p) => p.getAttribute('aria-pressed') === 'false'));
});

test('Advanced: ½ Half pills makes the squares half a pill, so a note can start between pills', async () => {
  await setLevel('advanced');
  lastRow().querySelector('[data-pick]').dispatch('click');
  assert.equal(btn('half').hidden, false);
  btn('half').dispatch('click');
  assert.equal(grid().querySelectorAll('.note-cell').length, 15 * 32);
  cell(0, 1.5).dispatch('click');
  assert.match(notes()[0].getAttribute('aria-label'), /part 2 and a half, 0.5 pills long/);
  btn('half').dispatch('click');
  roll().close();
  await setLevel('regular');
});

test('⌨️ Keys: a tune row shows its notes in the grid, and a tap on it opens the roll', () => {
  keysOn(page);
  const tuneAt = String(rows().length - 1);
  const line = $('#dj-grid').querySelectorAll('.dj-grid-row').find((l) => l.dataset.row === tuneAt);
  assert.ok(line.querySelectorAll('.dj-grid-pills i')[1].classList.contains('on'), 'the tune row, lit where its note starts');
  line.querySelectorAll('.dj-grid-pills i')[5].dispatch('click');
  assert.equal(roll().open, true);
  btn('done').dispatch('click');
  keysOff(page);
});
