// The keys and a change of person (← →, the corner menu, a link): what one
// kid was recording stays theirs. A 🎤 Live take ran on into the next
// person's board and was filed under them, with the first kid's sounds; and
// ↩️ Undo after ● Record into the beat, tapped once the next person showed,
// put the first kid's beat back as the new person's open beat (2026-10-26).
// Not tested here: the sound (audio is spied on, not heard).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOff, newBuilderBeatWithRow } from './new-beat.mjs';
import { hasUndo } from './banner.mjs';

let page;
let $;
let state;
let ctx;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
  ctx = audio.context();
});

test('a 🎤 Live take recording when the person changes is kept, as the first person\'s', async () => {
  $('#live-tab').dispatch('click');
  const first = state.personId;
  $('#dj-record').dispatch('click');
  ctx.currentTime = 30;
  page.key('a', { code: 'KeyA' });
  ctx.currentTime = 30.4;
  page.key('ArrowRight', { code: 'ArrowRight' });
  await page.settle();
  assert.notEqual(state.personId, first, 'the next person shows');
  assert.equal($('#dj-record').textContent, '● Record', 'the take ended');
  const takes = state.takes.filter((t) => t.events.length);
  assert.equal(takes.length, 1);
  assert.equal(takes[0].personId, first, 'it is the first person\'s');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
  assert.equal(state.personId, first);
  ctx.currentTime = 0;
});

test('● Record into the beat, ended by a person change: its ↩️ Undo goes, and the new person\'s beat stays theirs', async () => {
  await newBuilderBeatWithRow(page);   // a named beat of the first person's, open with ⌨️ Keys
  await page.settle();
  const first = state.personId;
  const name = $('#dj-beatbar').querySelector('[data-beat-name]').value;
  ctx.currentTime = 200;
  $('#dj-record').dispatch('click');
  await page.settle();
  ctx.currentTime = 202.47;   // just after the "1" (one bar of count-in at 100 BPM after 0.05 s)
  page.key('a', { code: 'KeyA' });
  page.key('ArrowRight', { code: 'ArrowRight' });
  const next = state.personId;
  assert.notEqual(next, first);
  const theirs = $('#dj-beatbar').querySelector('[data-beat-name]').value;
  assert.notEqual(theirs, name);
  // The Undo for the notes that went in goes with the first kid (it would
  // put their beat on the new person's screen).
  assert.equal(hasUndo(), false);
  await page.settle();
  assert.equal($('#dj-beatbar').querySelector('[data-beat-name]').value, theirs, 'the new person\'s open beat stays on screen');
  assert.equal(state.patterns.get(next)?.personId ?? next, next, 'and stays theirs');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
  keysOff(page);
  ctx.currentTime = 0;
});

// The council (2026-10-26): a change of person leaves nothing of the first
// kid's live on the next kid's screen. The take card (#dj-done) played,
// undid (deleted) or made a pad of the first kid's take; the beat's ↩️ Undo
// banner stayed as a dead button naming the first kid's beat.
test('the take card goes on a person change, for a take the change ended and one stopped before', async () => {
  $('#live-tab').dispatch('click');
  const first = state.personId;
  const theirs = () => state.takes.filter((t) => t.personId === first);
  // One stopped before the change.
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  assert.equal($('#dj-done').hidden, false, 'the take card shows');
  const had = theirs().length;
  page.key('ArrowRight', { code: 'ArrowRight' });
  await page.settle();
  assert.notEqual(state.personId, first);
  assert.equal($('#dj-done').hidden, true, 'gone with the person');
  $('#dj-done-undo').dispatch('click');
  $('#dj-done-sound').dispatch('click');
  $('#dj-done-play').dispatch('click');
  await page.settle();
  assert.equal(theirs().length, had, 'Undo cannot reach the first kid\'s take');
  assert.equal($('#dj-done-play').textContent, '▶ Play', 'nor can ▶ Play');
  // One the change ended.
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  page.key('ArrowRight', { code: 'ArrowRight' });
  await page.settle();
  assert.equal(theirs().length, had + 1, 'kept as the first kid\'s');
  assert.equal($('#dj-done').hidden, true, 'and its card is not on the next kid\'s screen');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
});

test('a take playing back stops on a person change', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  $('#dj-done-play').dispatch('click');
  assert.equal($('#dj-done-play').textContent, '■ Stop');
  page.key('ArrowRight', { code: 'ArrowRight' });
  assert.equal($('#dj-done-play').textContent, '▶ Play');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
});

test('the beat\'s ↩️ Undo banner goes on a person change', async () => {
  await newBuilderBeatWithRow(page);
  await page.settle();
  ctx.currentTime = 300;
  $('#dj-record').dispatch('click');
  await page.settle();
  ctx.currentTime = 302.47;
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  assert.equal(hasUndo(), true, 'Undo offered for the notes');
  page.key('ArrowRight', { code: 'ArrowRight' });
  assert.equal(hasUndo(), false, 'gone with the person');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
  keysOff(page);
  ctx.currentTime = 0;
});

test('the take card\'s ↩️ Undo banner (a take taken out) goes on a person change', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  $('#dj-done-undo').dispatch('click');
  assert.match($('#banner-text').textContent, /^Took out/);
  assert.equal(hasUndo(), true);
  page.key('ArrowRight', { code: 'ArrowRight' });
  assert.equal(hasUndo(), false, 'its Undo is not on the next kid\'s screen');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
});
