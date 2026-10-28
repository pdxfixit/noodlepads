// ✏️ on a selected Song block opens its beat in 🥁 Beats, and "↩ Back to song"
// brings the person back to the same block (Ben, 2026-10-28). A beat the song
// plays once opens at once; one it plays more often asks first ("Used 3× in
// this song"): ✏️ Edit it changes the beat for every block, ⧉ Edit a copy
// points just this block at a copy. The real app.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { dropBeat, blocksOn } from './song-ui.mjs';

let page;
let $;
let state;
let scrolled;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  // The stand-in page has no scrolling: a window that remembers where it was sent.
  window.scrollY = 0;
  window.scrollTo = (x, y) => { scrolled = [x, y]; window.scrollY = y; };
});

const open = () => state.songbook.filter((s) => s.personId === state.personId).sort((a, b) => b.saved - a.saved)[0];   // the song just changed
const beatIds = () => open().lanes[0].blocks.map((b) => b.beatId);
const select = (i) => blocksOn($, 0)[i].el.dispatch('click');
// A kept beat, then a fresh song with it on lane 1 `n` times.
function songWith(n) {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  $('#song-tab').dispatch('click');
  $('#song-new').dispatch('click');
  for (let i = 0; i < n; i++) dropBeat($);
}

test('✏️ on a beat the song plays once opens it in Beats at once, with the chip to come back', () => {
  songWith(1);
  select(0);
  const name = blocksOn($, 0)[0].name;
  assert.equal($('#song-edit').disabled, false);
  $('#song-edit').dispatch('click');
  assert.equal($('#song-edit-ask').hidden, true, 'no question for a beat used once');
  assert.ok(document.body.classList.contains('screen-beats'), 'Beats is showing');
  assert.equal(document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value, name, 'the block\'s beat is the open one');
  assert.equal($('#song-back').hidden, false, '↩ Back to song is shown');
});

test('✏️ on a beat the song plays more often asks with the count, and nothing opens yet', () => {
  $('#song-back-go').dispatch('click');
  $('#song-new').dispatch('click');
  songWith(0);
  dropBeat($);
  dropBeat($);
  dropBeat($);
  select(0);
  $('#song-edit').dispatch('click');
  assert.equal($('#song-edit-ask').hidden, false);
  assert.equal($('#song-edit-ask-text').textContent, 'Used 3× in this song');
  assert.ok(document.body.classList.contains('screen-song'), 'still on Song');
  assert.equal($('#song-back').hidden, true);
  $('#song-edit').dispatch('click');
  assert.equal($('#song-edit-ask').hidden, true, '✏️ again puts the question away');
});

test('⧉ Edit a copy points just this block at a copy, and Undo points it back', () => {
  $('#song-new').dispatch('click');
  songWith(0);
  dropBeat($);
  dropBeat($);
  const [first, second] = beatIds();
  assert.equal(first, second);
  const beats = state.savedBeats.length;
  select(0);
  $('#song-edit').dispatch('click');
  $('#song-edit-copy').dispatch('click');
  assert.equal(state.savedBeats.length, beats + 1, 'a copy joined 🗂️ Beats');
  const [now0, now1] = beatIds();
  assert.notEqual(now0, first, 'this block plays the copy');
  assert.equal(now1, first, 'the other block still plays the beat');
  assert.ok(document.body.classList.contains('screen-beats'), 'the copy is open in Beats');
  assert.equal($('#song-back').hidden, false);
  $('#song-back-go').dispatch('click');
  $('#song-step-undo').dispatch('click');
  assert.deepEqual(beatIds(), [first, first], 'Undo takes the block back to the beat');
});

test('✏️ Edit it opens the beat all its blocks share', () => {
  $('#song-new').dispatch('click');
  songWith(0);
  dropBeat($);
  dropBeat($);
  const ids = beatIds();
  select(1);
  $('#song-edit').dispatch('click');
  $('#song-edit-it').dispatch('click');
  assert.ok(document.body.classList.contains('screen-beats'));
  $('#song-back-go').dispatch('click');
  assert.deepEqual(beatIds(), ids, 'no block changed');
});

test('↩ Back to song returns to the same block and the same scroll', () => {
  $('#song-new').dispatch('click');
  songWith(0);
  dropBeat($);
  dropBeat($);
  select(1);
  const text = $('#song-sel-text').textContent;
  $('#song-lanes').scrollLeft = 40;
  window.scrollY = 120;
  $('#song-edit').dispatch('click');
  $('#song-edit-it').dispatch('click');
  $('#song-lanes').scrollLeft = 0;
  window.scrollY = 0;
  $('#song-back-go').dispatch('click');
  assert.ok(document.body.classList.contains('screen-song'), 'Song is showing');
  assert.equal($('#song-sel').hidden, false, 'a block is selected');
  assert.equal($('#song-sel-text').textContent, text);
  assert.ok(blocksOn($, 0)[1].el.classList.contains('chosen'), 'the second block, not the first');
  assert.equal($('#song-lanes').scrollLeft, 40);
  assert.deepEqual(scrolled, [0, 120]);
  assert.equal($('#song-back').hidden, true, 'the chip is used up');
});

test('the chip clears on any other navigation: another screen, or another beat', () => {
  select(0);
  $('#song-edit').dispatch('click');
  $('#song-edit-it').dispatch('click');
  assert.equal($('#song-back').hidden, false);
  $('#song-tab').dispatch('click');
  $('#beats-toggle').dispatch('click');
  assert.equal($('#song-back').hidden, true, 'gone after a trip to Song and back');
  // Another beat opened on Beats itself.
  $('#song-tab').dispatch('click');
  select(0);
  $('#song-edit').dispatch('click');
  $('#song-edit-it').dispatch('click');
  assert.equal($('#song-back').hidden, false);
  $('.beat-bar [data-beat-new]').dispatch('click');
  assert.equal($('#song-back').hidden, true, '🆕 New opens another beat: the chip goes');
});

test('a block whose beat was deleted has a ✏️ that is switched off', () => {
  $('#song-tab').dispatch('click');
  $('#song-new').dispatch('click');
  songWith(0);
  dropBeat($);
  const name = blocksOn($, 0)[0].name;
  $('#beats-toggle').dispatch('click');
  document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-open]').dispatch('click');
  const row = () => $('#lib-list').children.find((li) => li.querySelector('.lib-name').textContent === name);
  row().querySelector('[data-delete]').dispatch('click');
  row().querySelector('[data-delete]').dispatch('click');
  $('#library').close();
  $('#song-tab').dispatch('click');
  select(0);
  assert.equal(blocksOn($, 0)[0].name, 'Deleted beat');
  assert.equal($('#song-edit').disabled, true);
});
