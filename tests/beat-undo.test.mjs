// ↩️ Undo · ↪️ Redo on Beats (Ben, 2026-11-04: "undo in general"; ADR 0036):
// every change to the open beat, a pill tap too, steps back and forward, for
// the visit; Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z where the buttons show, never in
// a text field; a beat playing keeps playing. How it sounds while playing
// needs a phone; `just look beat-undo` shows the buttons.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { newBeatWithRow } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { state } from '../web/state.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  $('#beats-toggle').dispatch('click');
});

const undo = () => $('[data-beat-undo]');
const off = (b) => b.getAttribute('aria-disabled') === 'true';
const redo = () => $('[data-beat-redo]');
const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
const pill = (r, s) => rows()[r].querySelectorAll('.pill')[s];
const lit = (r, s) => pill(r, s).getAttribute('aria-pressed') === 'true';
const name = () => document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value;
const stored = () => state.savedBeats.find((b) => b.name === name() && b.personId === state.personId);
const playing = () => $('#seq-play').getAttribute('aria-pressed') === 'true';

test('a pill tap on a kept beat: ↩️ turns it off again, and the kept beat is as it was; ↪️ turns it back on', () => {
  newBeatWithRow(page);
  assert.equal(off(undo()), true, 'nothing to undo on a beat just opened');
  assert.equal(off(redo()), true);
  const was = JSON.stringify(stored().rows);
  pill(0, 2).dispatch('click');
  assert.equal(lit(0, 2), true);
  assert.equal(off(undo()), false);
  undo().dispatch('click');
  assert.equal(lit(0, 2), false, 'the pill is off again');
  assert.equal(JSON.stringify(stored().rows), was, 'and the stored beat is as it was');
  assert.equal(off(undo()), true, 'back at the beat as opened');
  assert.equal(off(redo()), false);
  redo().dispatch('click');
  assert.equal(lit(0, 2), true, '↪️ turns it back on');
  assert.equal(stored().rows[0].steps[2], true);
});

test('steps go back one at a time, a tempo change and a row added too; a new change ends Redo', () => {
  newBeatWithRow(page);
  const bpm = stored().bpm;
  pill(0, 0).dispatch('click');
  $('#seq-bpm').dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(stored().bpm, bpm + 1);
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  assert.equal(rows().length, 2);
  undo().dispatch('click');
  assert.equal(rows().length, 1, 'the row added goes');
  undo().dispatch('click');
  assert.equal(stored().bpm, bpm, 'then the tempo');
  assert.equal($('#seq-bpm-out').textContent, `${bpm} BPM`, 'and the tempo shows it');
  undo().dispatch('click');
  assert.equal(lit(0, 0), false, 'then the pill');
  redo().dispatch('click');
  assert.equal(lit(0, 0), true);
  pill(0, 5).dispatch('click');
  assert.equal(off(redo()), true, 'a new change ends Redo');
});

test('Ctrl+Z and Shift+Ctrl+Z (Cmd too) step back and forward; never in a text field', () => {
  newBeatWithRow(page);
  pill(0, 3).dispatch('click');
  const field = document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]');
  const typed = page.key('z', { ctrlKey: true, target: field });
  assert.equal(typed.defaultPrevented, false, 'the name keeps its own undo');
  assert.equal(lit(0, 3), true);
  const e = page.key('z', { ctrlKey: true });
  assert.equal(e.defaultPrevented, true);
  assert.equal(lit(0, 3), false);
  page.key('Z', { metaKey: true, shiftKey: true });
  assert.equal(lit(0, 3), true, 'Shift+Cmd+Z redoes');
});

test('Undo while the beat plays: it keeps playing, a row put back too', async () => {
  newBeatWithRow(page);
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  pill(1, 0).dispatch('click');
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal(playing(), true);
  undo().dispatch('click');
  undo().dispatch('click');
  assert.equal(rows().length, 1, 'the row added is gone');
  assert.equal(playing(), true, 'the beat plays on');
  redo().dispatch('click');
  assert.equal(rows().length, 2, 'and back');
  assert.equal(playing(), true);
  $('#seq-play').dispatch('click');
  await page.settle();
});

test('each beat keeps its own steps for the visit: back on a beat, its Undo is still there', () => {
  newBeatWithRow(page);
  const first = name();
  pill(0, 6).dispatch('click');
  newBeatWithRow(page);
  assert.equal(off(undo()), true, 'a new beat has none');
  const bar = document.querySelectorAll('.beat-bar')[0];
  bar.querySelector('[data-beat-open]').dispatch('click');
  $('#lib-list').children.find((li) => li.querySelector('.lib-name')?.textContent === first).querySelector('[data-load]').dispatch('click');
  assert.equal(name(), first);
  assert.equal(off(undo()), false, 'back on the first beat: its step is there');
  undo().dispatch('click');
  assert.equal(lit(0, 6), false);
});

test('⌨️ Keys on: Ctrl+Z undoes there too (its bar has no ↩️ yet); 🎤 Live leaves it alone', async () => {
  const { keysOn, keysOff } = await import('./new-beat.mjs');
  newBeatWithRow(page);
  pill(0, 7).dispatch('click');
  const id = stored().id;
  keysOn(page);
  const e = page.key('z', { ctrlKey: true });
  assert.equal(e.defaultPrevented, true);
  assert.equal(state.savedBeats.find((b) => b.id === id).rows[0].steps[7], false, 'the pill is off again');
  keysOff(page);
  page.key('y', { ctrlKey: true });
  assert.equal(lit(0, 7), true, 'Ctrl+Y redoes');
  pill(0, 7).dispatch('click');
  $('#live-tab').dispatch('click');
  const live = page.key('z', { ctrlKey: true });
  assert.equal(live.defaultPrevented, false, '🎤 Live: no beat to undo');
  $('#beats-toggle').dispatch('click');
  assert.equal(lit(0, 7), false, 'the beat is as it was left');
});

test('a removed row brought back by the banner Undo is a step back: ↪️ removes it again, ↩️ goes on back', () => {
  newBeatWithRow(page);
  pill(0, 1).dispatch('click');
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  pill(1, 4).dispatch('click');
  rows()[1].querySelector('[data-remove]').dispatch('click');
  rows()[1].querySelector('[data-remove]').dispatch('click');
  assert.equal(rows().length, 1);
  $('#banner-action').dispatch('click');
  assert.equal(rows().length, 2, 'the banner puts the row back');
  assert.equal(off(redo()), false, 'and that was a step back: ↪️ can take it out again');
  undo().dispatch('click');
  assert.equal(lit(1, 4), false, 'the next ↩️ goes on back: the pill on the second row');
  redo().dispatch('click');
  redo().dispatch('click');
  assert.equal(rows().length, 1, '↪️ twice: the row is out again');
});

test('a middle row put back while playing: every row is there and the beat plays on', async () => {
  newBeatWithRow(page);
  for (let i = 0; i < 2; i++) { $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click'); }
  for (let r = 0; r < 3; r++) pill(r, r).dispatch('click');
  $('#seq-play').dispatch('click');
  await page.settle();
  rows()[1].querySelector('[data-remove]').dispatch('click');
  rows()[1].querySelector('[data-remove]').dispatch('click');
  assert.equal(rows().length, 2);
  undo().dispatch('click');
  assert.equal(rows().length, 3, 'the middle row is back');
  assert.deepEqual([0, 1, 2].map((r) => lit(r, r)), [true, true, true], 'with its pill, in its place');
  assert.equal(playing(), true);
  await page.settle();
  assert.equal(playing(), true, 'and the beat plays on past the next tick');
  $('#seq-play').dispatch('click');
  await page.settle();
});
