// 🆕 New opens a blank scratch (Ben, 2026-10-12: "if someone taps new, that
// should open up an entirely blank beat screen"), on Beats with ⌨️ Keys off
// and on, and on 🎼 Song. A named beat open stays in the list as it was. A
// scratch with hits (or blocks) is kept first (Ben, 2026-10-24: 🗂️ See all
// lists it as theirs, and New had deleted it): it joins 🗂️ Beats or
// 🗂️ Songs, named as 💾 Keep would name it, whether it was open or not, and a
// line says so. Nothing is lost, so there is no Undo. Layout needs a
// browser (`just look new-full`, `just look keys-new-full`, `just look song-new-full`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { keysOn, keysOff, newBeatWithRow } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';
import { dropBeat, allBlocks } from './song-ui.mjs';
import { state } from '../web/state.js';
import { personThings } from '../web/model.js';

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
  tap('#seq-add'); tap('#chooser-ok');
  rows()[0].querySelectorAll('.pill')[0].dispatch('click');
  $('#seq-bars').querySelector('[data-bars="2"]').dispatch('click');
}

test('🆕 New with a named beat open: a blank scratch, the beat stays in 🗂️ Beats as it was, nothing added', async () => {
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
  assert.equal(hasUndo(), false, 'nothing was lost: no Undo');
  assert.equal(JSON.stringify(mine()), before, `“${named}” stays in 🗂️ Beats as it was, and nothing joins it`);
  assert.equal(scratch(), undefined, 'the blank scratch is saved only once it changes');
  assert.equal(state.patterns.get(state.personId) ?? null, null, 'the scratch is open');
});

// What 🗂️ See all lists as this person's beats, by name.
const seeAll = () => personThings({ beats: state.savedBeats }, state.personId).beats;
const added = (before) => mine().filter((b) => !before.has(b.id));

test('🆕 New over a scratch with hits: it joins 🗂️ Beats as it was, a line says so, and the scratch is blank', () => {
  fillScratch();
  assert.equal(hitsOf(scratch()), 1);
  assert.equal(scratch().bars, 2);
  assert.equal(seeAll().filter((b) => b.name === 'Scratch beat').length, 1, '🗂️ See all lists the scratch');
  const before = new Set(mine().map((b) => b.id));
  bar().querySelector('[data-beat-new]').dispatch('click');
  assert.equal(name(), 'Scratch beat');
  assert.equal(rows().length, 0);
  assert.equal($('#seq-bars').querySelector('[data-bars="1"]').getAttribute('aria-pressed'), 'true', 'the bars go back to one');
  assert.equal(scratch(), undefined, 'the scratch is empty');
  const kept = added(before);
  assert.equal(kept.length, 1, 'one beat joins 🗂️ Beats');
  assert.equal(hitsOf(kept[0]), 1, 'with its hit');
  assert.equal(kept[0].bars, 2, 'and its bars');
  assert.ok(seeAll().some((b) => b.name === kept[0].name), '🗂️ See all still lists it, under its new name');
  assert.equal($('#banner-text').textContent, `Kept as “${kept[0].name}” in 🗂️ Beats. A blank scratch beat.`);
  assert.equal(hasUndo(), false, 'nothing was lost: no Undo');
});

// A groove nobody changed is the same as the one in 💃 Grooves: New lets it go.
test('🆕 New over a groove nobody changed: nothing is kept; change one pill and it is', () => {
  const before = new Set(mine().map((b) => b.id));
  const load = () => {
    $('#seq-grooves').dispatch('click');
    $('#groove-list').querySelector('[data-groove="four"]').dispatch('click');
  };
  load();
  assert.equal(name(), 'Four on the floor (scratch)');
  bar().querySelector('[data-beat-new]').dispatch('click');
  assert.equal(scratch(), undefined, 'the scratch is blank');
  assert.equal(added(before).length, 0, 'nothing joins 🗂️ Beats');
  assert.notEqual($('#banner-text').textContent.slice(0, 8), 'Kept as ', 'and no line says it was kept');
  load();
  rows()[0].querySelectorAll('.pill')[1].dispatch('click');
  bar().querySelector('[data-beat-new]').dispatch('click');
  assert.equal(added(before).length, 1, 'one pill changed: it is kept');
  assert.match(added(before)[0].name, /Four on the floor/);
});

test('🆕 New with a named beat open over an unchanged groove in the scratch: the groove goes, the named beat is as it was', () => {
  const named = mine().find((b) => !/Four on the floor/.test(b.name));
  $('#seq-grooves').dispatch('click');
  $('#groove-list').querySelector('[data-groove="four"]').dispatch('click');
  bar().querySelector('[data-beat-open]').dispatch('click');
  $('#lib-list').children.find((li) => li.querySelector('.lib-name').textContent === named.name).querySelector('[data-load]').dispatch('click');
  assert.equal(name(), named.name, 'the named beat is open; the groove waits in the scratch');
  const was = JSON.stringify(state.savedBeats.find((b) => b.id === named.id));
  const before = new Set(mine().map((b) => b.id));
  bar().querySelector('[data-beat-new]').dispatch('click');
  assert.equal(name(), 'Scratch beat');
  assert.equal(scratch(), undefined);
  assert.equal(added(before).length, 0, 'the unchanged groove is not kept');
  assert.equal(JSON.stringify(state.savedBeats.find((b) => b.id === named.id)), was, `“${named.name}” is as it was`);
  assert.equal(hasUndo(), false);
});

test('⌨️ Keys on: 🆕 New opens the blank scratch; a full one is kept, with a line', () => {
  fillScratch();
  keysOn(page);
  const djName = () => $('#dj-beatbar').querySelector('[data-beat-name]').value;
  const before = new Set(mine().map((b) => b.id));
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  assert.equal(djName(), 'Scratch beat');
  assert.equal($('#dj-grid').children.length, 0, 'no rows');
  assert.equal($('#dj-no-rows').hidden, false, 'the line points to the keys');
  assert.equal(scratch(), undefined);
  const kept = added(before);
  assert.equal(kept.length, 1, 'it joins 🗂️ Beats');
  assert.equal(hitsOf(kept[0]), 1);
  assert.equal($('#banner-text').textContent, `Kept as “${kept[0].name}” in 🗂️ Beats. A blank scratch beat.`);
  assert.equal(hasUndo(), false);
  // An empty scratch: nothing kept.
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  assert.equal(added(before).length, 1, 'nothing more joins');
  keysOff(page);
});

test('🎼 Song: 🆕 New opens a blank scratch song; a scratch with blocks joins 🗂️ Songs, with a line', () => {
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
  assert.equal(hasUndo(), false, 'the scratch was empty: nothing kept, no Undo');
  assert.equal(JSON.stringify(songs()), before, `“${named}” stays as it was, and nothing joins the list`);
  // A scratch with blocks: kept, then blank.
  addBeat();
  addBeat();
  assert.equal(blocks(songScratch()), 2);
  const ids = new Set(songs().map((x) => x.id));
  tap('#song-new');
  assert.equal($('#song-name').value, 'Scratch song');
  assert.equal(allBlocks($).length, 0);
  assert.equal(songScratch(), undefined);
  const kept = songs().filter((x) => !ids.has(x.id));
  assert.equal(kept.length, 1, 'it joins 🗂️ Songs');
  assert.equal(blocks(kept[0]), 2, 'with its blocks');
  assert.equal($('#banner-text').textContent, `Kept as “${kept[0].name}” in 🗂️ Songs. A blank scratch song.`);
  assert.equal(hasUndo(), false);
  tap('#pads-tab');
});
