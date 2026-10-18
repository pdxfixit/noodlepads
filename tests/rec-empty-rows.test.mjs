// 🥁 Beats with ⌨️ Keys: while ● Record runs, a new sound takes the first
// row with no hits (from the top) before a new row is added (Ben,
// 2026-10-18). A key played outside recording still gets a new row, since a
// kid may be setting up empty rows on purpose. ↩️ Undo puts the beat back.
// Sound itself needs a browser.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { keysOn, keysOff } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';
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
after(() => keysOff(page));

const scratch = () => state.savedBeats.find((b) => b.id.startsWith('beat-scratch-') && b.personId === state.personId);
const sounds = () => scratch().rows.map((r) => r.clipId);
const hits = () => scratch().rows.map((r) => r.steps.filter(Boolean).length);
const key = (k) => page.key(k, { code: `Key${k.toUpperCase()}` });

async function record(ctx, at) {
  ctx.currentTime = at;
  $('#dj-record').dispatch('click');
  await page.settle();
}

test('while recording, a new sound takes an empty row before a new one; outside recording it gets a new row; Undo puts the beat back', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  $('#dj-bars').querySelector('[data-bars="1"]').dispatch('click');
  // Three empty rows, set up on purpose before recording: each key a new row.
  key('a'); key('s'); key('d');
  const setUp = sounds();
  assert.equal(setUp.length, 3, 'outside recording, each new sound gets a row of its own');
  assert.deepEqual(hits(), [0, 0, 0]);

  // ● Record at 100 BPM: one bar of count-in (2.4 s) after a 0.05 s start.
  await record(ctx, 5000);
  ctx.currentTime = 5000.05 + 16 * 0.15 + 0.02;
  key('f');
  assert.equal(sounds().length, 3, 'no new row while an empty one is there');
  assert.notEqual(sounds()[0], setUp[0], 'the first empty row took the new sound');
  assert.deepEqual(sounds().slice(1), setUp.slice(1), 'the other rows stay where they were');
  assert.deepEqual(hits(), [1, 0, 0], 'and its hit landed there');
  ctx.currentTime += 0.3;
  key('g');
  assert.equal(sounds().length, 3);
  assert.deepEqual(hits(), [1, 1, 0], 'the next new sound took the next empty row, from the top');
  $('#dj-record').dispatch('click');
  assert.match($('#banner-text').textContent, /^Added 2 notes/);
  assert.ok(hasUndo());
  $('#banner-action').dispatch('click');
  assert.deepEqual(sounds(), setUp, '↩️ Undo puts the rows back');
  assert.deepEqual(hits(), [0, 0, 0]);
  ctx.currentTime = 0;
});

test('keys in the count-in: two new sounds take two empty rows, never the same one; Undo still offered with no notes', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  const setUp = sounds();
  assert.equal(setUp.length, 3);
  await record(ctx, 6000);
  ctx.currentTime = 6000.5;   // counting in: no hit lands
  key('h'); key('j');
  assert.equal(sounds().length, 3, 'no new rows');
  assert.notEqual(sounds()[0], setUp[0]);
  assert.notEqual(sounds()[1], setUp[1], 'the second sound took the second empty row');
  assert.notEqual(sounds()[0], sounds()[1]);
  assert.equal(sounds()[2], setUp[2]);
  $('#dj-record').dispatch('click');
  assert.ok(hasUndo(), 'the reused rows can be undone');
  $('#banner-action').dispatch('click');
  assert.deepEqual(sounds(), setUp, '↩️ Undo puts the rows back');
  ctx.currentTime = 0;
});

test('rowSlot: recording puts the first free empty row before a new one; a full beat reuses one either way', async () => {
  const { rowSlot } = await import('../web/sequencer.js');
  const row = (hit) => ({ steps: [hit] });
  assert.equal(rowSlot([row(false), row(true)], 16, new Set(), true), 0, 'recording: the empty row first');
  assert.equal(rowSlot([row(false), row(true)], 16), 2, 'not recording: a new row');
  assert.equal(rowSlot([row(false), row(true)], 16, new Set([0]), true), 2, 'recording, the empty row taken: a new row');
  assert.equal(rowSlot([row(true), row(false)], 2, new Set(), false), 1, 'full: the empty row');
});
