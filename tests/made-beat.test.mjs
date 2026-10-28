// 🥁 Make a beat's ↩️ Undo (council, storage-sync, 2026-10-28): it takes out
// only the beat that was made, and only while it is as it was made. A beat
// the kid has started on (a pill, the tempo, its name) is theirs and stays;
// Undo then only ends. A change of person ends the banner, and the beat
// stays the first kid's. Not tested here: sound (audio is spied on).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';

let page;
let $;
let state;
let ctx;
let seq;
const idb = fakeIndexedDB();

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = idb;
  globalThis.noodleTestSeq = (s) => { seq = s; };
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
  ctx = audio.context();
});

const hit = (code, at) => { ctx.currentTime = at; page.key(code.slice(3).toLowerCase(), { code }); };
const mine = () => state.savedBeats.filter((b) => b.personId === state.personId && b.name.endsWith(' beat'));
const onBeats = () => document.body.classList.contains('screen-beats');

// A take of two sounds on the card, then 🥁 Make a beat.
async function makeOne(start) {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  for (const [at, code] of [[0, 'KeyA'], [0.6, 'KeyA'], [0.6, 'KeyS'], [1.2, 'KeyA']]) hit(code, start + at);
  $('#dj-record').dispatch('click');
  $('#dj-done-beat').dispatch('click');
  await page.settle();
}

test('Undo takes out only the beat that was made, and opens the beat that was open before', async () => {
  const prior = { id: 'beat-prior-1', personId: state.personId, name: 'Prior Groove', bpm: 100, bars: 1, swing: 0, created: 1, saved: 1, rows: [{ clipId: `${state.personId}-kick`, steps: Array.from({ length: 16 }, (_, i) => i % 4 === 0) }] };
  state.savedBeats.push(prior);
  assert.ok(seq.openSaved(prior.id));
  const others = state.savedBeats.length;
  await makeOne(100);
  assert.ok(onBeats(), 'Beats opens');
  assert.equal(mine().length, 1, 'one beat was made');
  assert.equal(state.savedBeats.length, others + 1);
  assert.equal(seq.beat().id, mine()[0].id, 'and it is the open one');
  assert.ok(hasUndo());
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.equal(mine().length, 0, 'Undo took it out');
  assert.equal(state.savedBeats.length, others, 'and nothing else');
  assert.ok(state.savedBeats.some((b) => b.id === prior.id), 'the prior beat is still there');
  assert.ok(document.body.classList.contains('screen-live'), 'Live is back');
  $('#beats-toggle').dispatch('click');
  await page.settle();
  assert.equal(seq.beat().id, prior.id, 'and the prior beat is the open one again');
  $('#live-tab').dispatch('click');
  ctx.currentTime = 0;
});

test('a made beat the kid has changed stays when Undo is tapped: Undo only ends', async () => {
  await makeOne(200);
  const made = mine()[0];
  assert.ok(made);
  seq.cyclePill(0, 1);   // the kid turns a pill on: it is theirs now
  await page.settle();
  assert.ok(hasUndo(), 'the line is still up');
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.ok(state.savedBeats.some((b) => b.id === made.id), 'the beat is kept');
  assert.ok(onBeats(), 'and Beats stays open on it');
  assert.equal(hasUndo(), false, 'the banner ended');
  state.savedBeats.splice(state.savedBeats.findIndex((b) => b.id === made.id), 1);
  ctx.currentTime = 0;
});

test('a change of person ends the banner, and the beat stays the first kid\'s', async () => {
  await makeOne(300);
  const first = state.personId;
  const made = mine()[0];
  assert.ok(made && hasUndo());
  page.key('ArrowRight', { code: 'ArrowRight' });
  await page.settle();
  assert.notEqual(state.personId, first);
  assert.equal(hasUndo(), false, 'no Undo for the next kid');
  assert.ok(state.savedBeats.some((b) => b.id === made.id && b.personId === first), 'the beat is still the first kid\'s');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
  state.savedBeats.splice(state.savedBeats.findIndex((b) => b.id === made.id), 1);
  ctx.currentTime = 0;
});

test('the banner says when hits shared a step', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  for (const [at, code] of [[0, 'KeyA'], [0.01, 'KeyA'], [0.6, 'KeyS']]) hit(code, 400 + at);
  $('#dj-record').dispatch('click');
  $('#dj-done-beat').dispatch('click');
  await page.settle();
  assert.match($('#banner-text').textContent, /1 hit shared a step\.$/);
  const made = mine().at(-1);
  state.savedBeats.splice(state.savedBeats.findIndex((b) => b.id === made.id), 1);
  ctx.currentTime = 0;
});
