// The beat, 🎼 Song and 🧸 Kids book their hits a little ahead on the audio
// clock. After a stall (a busy page, a tab put in the background, the clock
// running on while the timers slept) a hit whose moment has passed is
// dropped, as the ⏲️ click's missed ticks always were: the beat goes on in
// time instead of playing a burst of every hit it missed. Here the
// stand-in's audio clock is moved by hand, 25 ms at a time, with one 300 ms
// stall, and its sources say when each hit was booked to start.
// Sound itself needs a browser: this checks the booking, by numbers.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { dropBeat } from './song-ui.mjs';
import { tooLate, LATE_SECONDS } from '../web/audio.js';

let page;
let $;
let ctx;
const booked = [];   // {at, now}: when a hit was booked to start, and the clock then

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  ctx = audio.context();
  ctx.createBufferSource = () => ({
    connect() {}, disconnect() {}, stop() {}, playbackRate: { value: 1 }, buffer: null,
    start(at) { booked.push({ at, now: ctx.currentTime }); },
  });
  audio.load = async () => ({ buffer: {}, duration: 0.05 });
});

const tick = () => new Promise((r) => setTimeout(r, 35));   // longer than a scheduler's 25 ms
// Runs the clock from `from` for `seconds`, 25 ms a step, with one stall of
// 300 ms in the middle: the timers did not run while the clock went on.
async function runWithStall(from, seconds) {
  let t = from;
  for (; t < from + seconds / 2; t += 0.025) { ctx.currentTime = t; await tick(); }
  const stalled = t + 0.3;
  ctx.currentTime = stalled;
  await tick();
  for (t = stalled; t < stalled + seconds / 2; t += 0.025) { ctx.currentTime = t; await tick(); }
  return stalled;
}
function assertInTime(what, stalled) {
  assert.ok(booked.length > 4, `${what}: hits were booked (${booked.length})`);
  const late = booked.filter((b) => tooLate(b.at, b.now));
  assert.deepEqual(late, [], `${what}: no hit booked after its moment passed`);
  assert.ok(booked.some((b) => b.at >= stalled + 0.1), `${what}: it goes on after the stall`);
}

test('the rule: a hit up to 20 ms late still plays; one later than that is dropped', () => {
  assert.equal(LATE_SECONDS, 0.02);
  assert.equal(tooLate(10, 10), false);
  assert.equal(tooLate(9.99, 10), false, 'just late: still heard');
  assert.equal(tooLate(9.97, 10), true);
  assert.equal(tooLate(10.05, 10), false, 'ahead');
});

test('🥁 Beats: after a 300 ms stall the beat carries on in time, with no burst of missed hits', async () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  // Every pill on, so a hit is due every 0.15 s (100 BPM).
  for (const pill of $('#seq-rows').querySelectorAll('.pill')) if (pill.getAttribute('aria-pressed') !== 'true') pill.dispatch('click');
  ctx.currentTime = 500;
  $('#seq-play').dispatch('click');
  await page.settle();
  booked.length = 0;
  const stalled = await runWithStall(500, 1.5);
  $('#seq-play').dispatch('click');
  assertInTime('Beats', stalled);
});

test('🎼 Song: after a 300 ms stall the song carries on in time, with no burst of missed hits', async () => {
  $('#song-tab').dispatch('click');
  await page.settle();
  dropBeat($, { lane: 0, bar: 0 });
  dropBeat($, { lane: 1, bar: 0 });
  ctx.currentTime = 600;
  $('#song-play').dispatch('click');
  await page.settle();
  booked.length = 0;
  const stalled = await runWithStall(600, 1.5);
  $('#song-play').dispatch('click');
  assertInTime('Song', stalled);
  $('#pads-tab').dispatch('click');
});

test('🧸 Kids: after a 300 ms stall the kid\'s beat carries on in time, with no burst of missed hits', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', 'kids');
  await page.settle();
  $('[data-kids-tab="beats"]').dispatch('click');
  for (const sq of $('#kids-beat').querySelectorAll('.kids-square')) if (sq.getAttribute('aria-pressed') !== 'true') sq.dispatch('click');
  await page.settle();
  ctx.currentTime = 700;
  $('#kids-play').dispatch('click');
  await page.settle();
  booked.length = 0;
  const stalled = await runWithStall(700, 2);
  $('#kids-play').dispatch('click');
  assertInTime('Kids', stalled);
  await setSetting('level', 'regular');
  await page.settle();
});
