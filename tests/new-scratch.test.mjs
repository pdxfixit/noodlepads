// 🆕 New opens a blank scratch (Ben, 2026-10-12: "if someone taps new, that
// should open up an entirely blank beat screen"), on Beats with ⌨️ Keys off
// and on, and on 🎼 Song. Nothing joins 🗂️ My beats or My songs: only 💾 Keep
// adds one. A named beat open stays in the list as it was. A scratch with
// rows (or slots) that New empties is said in a line with ↩️ Undo, which
// brings it back with the beat (or song) open before. Layout needs a
// browser (`just look new-full`, `just look keys-new-full`, `just look song-new-full`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { keysOn, keysOff, newBeatWithRow } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { dropBeat, allBlocks } from './song-ui.mjs';
import { state } from '../web/state.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const bar = () => document.querySelectorAll('.beat-bar')[0];
const name = () => bar().querySelector('[data-beat-name]').value;
const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
const playing = () => $('#seq-play').getAttribute('aria-pressed') === 'true';
const mine = () => state.savedBeats.filter((b) => b.personId === state.personId && !b.id.startsWith('beat-scratch-'));
const scratch = () => state.savedBeats.find((b) => b.personId === state.personId && b.id.startsWith('beat-scratch-'));
const hitsOf = (b) => (b?.rows ?? []).reduce((n, r) => n + r.steps.filter(Boolean).length, 0);
const tap = (selector) => $(selector).dispatch('click');
// The scratch with one row and a hit, and its tempo and bars changed.
function fillScratch() {
  bar().querySelector('[data-beat-new]').dispatch('click');
  tap('#seq-add');
  rows()[0].querySelectorAll('.pill')[0].dispatch('click');
  $('#seq-bars').querySelector('[data-bars="2"]').dispatch('click');
}

test('🆕 New with a named beat open: a blank scratch, the beat stays in 🗂️ My beats as it was, nothing added', async () => {
  tap('#beats-toggle');
  newBeatWithRow(page);
  rows()[0].querySelectorAll('.pill')[0].dispatch('click');
  const named = name();
  const before = JSON.stringify(mine());
  assert.equal(scratch(), undefined, 'the scratch is empty (💾 Keep emptied it)');
  tap('#seq-play');
  await page.settle();
  assert.equal(playing(), true);
  bar().querySelector('[data-beat-new]').dispatch('click');
  await page.settle();
  assert.equal(playing(), false, 'New stops the beat');
  assert.equal(name(), 'Scratch beat');
  assert.equal(rows().length, 0, 'no rows');
  assert.equal($('#seq-no-rows').hidden, false, 'the dashed line points to + Add a row and 💃 Grooves');
  assert.equal($('#seq-bars').querySelector('[data-bars="1"]').getAttribute('aria-pressed'), 'true', 'one bar, as a new beat has');
  assert.equal($('#seq-undo').hidden, true, 'nothing was lost: no Undo');
  assert.equal(JSON.stringify(mine()), before, `“${named}” stays in 🗂️ My beats as it was, and nothing joins it`);
  assert.equal(scratch(), undefined, 'the blank scratch is saved only once it changes');
  assert.equal(state.patterns.get(state.personId) ?? null, null, 'the scratch is open');
});

test('🆕 New over a scratch with hits: it empties, a line says so, and ↩️ Undo brings the hits back', () => {
  fillScratch();
  assert.equal(hitsOf(scratch()), 1);
  assert.equal(scratch().bars, 2);
  const count = mine().length;
  bar().querySelector('[data-beat-new]').dispatch('click');
  assert.equal(name(), 'Scratch beat');
  assert.equal(rows().length, 0);
  assert.equal($('#seq-bars').querySelector('[data-bars="1"]').getAttribute('aria-pressed'), 'true', 'the bars go back to one');
  assert.equal(scratch(), undefined, 'the scratch is empty');
  assert.equal(mine().length, count, 'nothing joins 🗂️ My beats');
  assert.equal($('#seq-undo').hidden, false);
  assert.equal($('#seq-undo-text').textContent, '🆕 Your scratch beat is blank now.');
  tap('#seq-undo-button');
  assert.equal($('#seq-undo').hidden, true);
  assert.equal(name(), 'Scratch beat');
  assert.equal(rows().length, 1, 'Undo: the row is back');
  assert.equal(hitsOf(scratch()), 1, 'and its hit');
  assert.equal(scratch().bars, 2, 'and its bars');
});

test('🆕 New with a named beat open over a full scratch: Undo brings back both, the named beat open', () => {
  const named = mine()[0].name;
  bar().querySelector('[data-beat-open]').dispatch('click');
  $('#lib-list').children.find((li) => li.querySelector('.lib-name').textContent === named).querySelector('[data-load]').dispatch('click');
  assert.equal(name(), named);
  bar().querySelector('[data-beat-new]').dispatch('click');
  assert.equal(name(), 'Scratch beat');
  assert.equal($('#seq-undo').hidden, false, 'the scratch it emptied had hits');
  tap('#seq-undo-button');
  assert.equal(name(), named, 'the beat open before');
  assert.equal(hitsOf(scratch()), 1, 'and the scratch as it was');
});

test('⌨️ Keys on: 🆕 New opens the blank scratch; a full one is said on the keys\' line, with ↩️ Undo', () => {
  keysOn(page);
  const djName = () => $('#dj-beatbar').querySelector('[data-beat-name]').value;
  const named = djName();
  const count = mine().length;
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  assert.equal(djName(), 'Scratch beat');
  assert.equal($('#dj-grid').children.length, 0, 'no rows');
  assert.equal($('#dj-no-rows').hidden, false, 'the line points to the keys');
  assert.equal(scratch(), undefined);
  assert.equal(mine().length, count, 'nothing joins 🗂️ My beats');
  assert.equal($('#dj-done').hidden, false);
  assert.equal($('#dj-done-text').textContent, '🆕 Your scratch beat is blank now.');
  tap('#dj-done-undo');
  assert.equal($('#dj-done').hidden, true);
  assert.equal(djName(), named, 'Undo: the beat open before');
  assert.equal(hitsOf(scratch()), 1, 'and the scratch as it was');
  // An empty scratch emptied: no line.
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  $('#dj-done-close').dispatch('click');
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  assert.equal($('#dj-done').hidden, true, 'nothing lost, nothing to undo');
  keysOff(page);
});

test('🎼 Song: 🆕 New opens a blank scratch song; nothing joins 🗂️ My songs; a full one has ↩️ Undo', () => {
  tap('#song-tab');
  const songs = () => state.songbook.filter((s) => s.personId === state.personId && !s.id.startsWith('song-scratch-'));
  const songScratch = () => state.songbook.find((s) => s.personId === state.personId && s.id.startsWith('song-scratch-'));
  const addBeat = () => dropBeat($);
  const blocks = (s) => s.lanes.reduce((n, l) => n + l.blocks.length, 0);
  // A named song open: New leaves it in the list as it was.
  addBeat();
  tap('#song-keep');
  const named = $('#song-name').value;
  const before = JSON.stringify(songs());
  tap('#song-new');
  assert.equal($('#song-name').value, 'Scratch song');
  assert.equal(allBlocks($).length, 0);
  assert.equal($('#song-undo').hidden, true, 'the scratch was empty: no Undo');
  assert.equal(JSON.stringify(songs()), before, `“${named}” stays as it was, and nothing joins the list`);
  // A scratch with slots: emptied, with Undo.
  addBeat();
  addBeat();
  assert.equal(blocks(songScratch()), 2);
  tap('#song-new');
  assert.equal(allBlocks($).length, 0);
  assert.equal(songScratch(), undefined);
  assert.equal(JSON.stringify(songs()), before);
  assert.equal($('#song-undo').hidden, false);
  assert.equal($('#song-undo-text').textContent, '🆕 Your scratch song is blank now.');
  tap('#song-undo-button');
  assert.equal($('#song-undo').hidden, true);
  assert.equal(allBlocks($).length, 2, 'Undo: the blocks are back');
  assert.equal(blocks(songScratch()), 2);
  // A change ends the Undo: it would undo that too.
  tap('#song-new');
  addBeat();
  assert.equal($('#song-undo').hidden, true);
  tap('#pads-tab');
});
