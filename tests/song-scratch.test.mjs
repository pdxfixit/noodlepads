// 🎼 Song's strip shows the scratch beat (Mission keeper, council round 1,
// 2026-10-27): a beat goofed on goes on a lane without a trip to 💾 Keep. It
// is kept in 🗂️ Beats as its block goes in, and the block holds the kept
// beat, so 🆕 New or a second scratch cannot take the block's beat away. The
// real app.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { stripChips, chipName, dropBeat, blocksOn, allBlocks } from './song-ui.mjs';
import { state } from '../web/state.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const bar = () => document.querySelectorAll('.beat-bar')[0];
const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
const mine = () => state.savedBeats.filter((b) => b.personId === state.personId);
const scratch = () => mine().find((b) => b.id.startsWith('beat-scratch-'));
const kept = () => mine().filter((b) => !b.id.startsWith('beat-scratch-'));
const names = () => stripChips($).map(chipName);
// A scratch beat with one row and a hit, on Beats.
function goofOn() {
  $('#beats-toggle').dispatch('click');
  bar().querySelector('[data-beat-new]').dispatch('click');
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  rows()[0].querySelectorAll('.pill')[0].dispatch('click');
}

test('an empty scratch is not in the strip; one with a hit is, first, in italics', () => {
  $('#song-tab').dispatch('click');
  assert.deepEqual(names(), []);
  goofOn();
  assert.ok(scratch(), 'the scratch beat is stored');
  $('#song-tab').dispatch('click');
  assert.deepEqual(names(), ['Scratch beat']);
  assert.ok(stripChips($)[0].classList.contains('scratch'));
});

test('the scratch goes on a lane without 💾 Keep: it is kept, and the block holds the kept beat', () => {
  const before = kept().length;
  dropBeat($);
  assert.equal(kept().length, before + 1, 'one beat joined 🗂️ Beats');
  assert.equal(scratch(), undefined, 'the scratch is empty again');
  const [block] = blocksOn($, 0);
  assert.ok(block, 'the block is on the lane');
  const beat = kept().at(-1);
  assert.equal(block.name, beat.name, 'the block shows the kept beat, not "Deleted beat"');
  assert.ok(beat.rows[0].steps[0], 'its hit came with it');
  assert.ok(!names().includes('Scratch beat'), 'the strip lists the kept beat now');
  assert.ok(names().includes(beat.name));
});

test('the song keeps its beat when the scratch is replaced: 🆕 New and a second scratch', () => {
  const beat = kept().at(-1);
  goofOn();   // 🆕 New, a new row and a hit: a second scratch beat
  assert.ok(scratch(), 'a new scratch beat');
  $('#song-tab').dispatch('click');
  assert.deepEqual(names().slice(0, 2), ['Scratch beat', beat.name]);
  assert.equal(blocksOn($, 0)[0].name, beat.name);
  // Replaced by 🆕 New before it ever goes on a lane: the first block stays.
  $('#beats-toggle').dispatch('click');
  bar().querySelector('[data-beat-new]').dispatch('click');
  $('#song-tab').dispatch('click');
  assert.equal(allBlocks($).length, 1);
  assert.equal(blocksOn($, 0)[0].name, beat.name, 'the block still has its beat');
  assert.ok(kept().some((b) => b.id === beat.id), 'and the beat is still in 🗂️ Beats');
});

test('a second scratch goes on another lane, as its own kept beat', () => {
  goofOn();
  $('#song-tab').dispatch('click');
  dropBeat($, { lane: 1 });
  assert.equal(allBlocks($).length, 2);
  const [first] = blocksOn($, 0);
  const [second] = blocksOn($, 1);
  assert.notEqual(first.name, second.name, 'two beats, two names');
  assert.equal(scratch(), undefined);
});
