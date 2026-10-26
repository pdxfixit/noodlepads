// 🧸 Kids showing silences the keys' ⏲️ Click track: with the beat stopped
// it ticks on its own while the keys are on screen (dj.js tick), and it
// ticked on over the kid's screens, where no ⏲️ shows and Kids' ⏹️ could
// not reach it (2026-10-26). Back out of Kids, it ticks again: the kid's
// wish is kept. Not tested here: the ticks as heard (counted as oscillators
// booked on the stand-in audio clock). One tick already booked when Kids
// shows (the click books up to 0.1 s ahead, sequencer.js LOOKAHEAD) still
// sounds: it is counted before Kids, so this test does not see it.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
let ctx;
let ticks = 0;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
  ctx = audio.context();
  const make = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => { ticks++; return make(); };
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The audio clock runs on for a second while the page's timers fire.
async function run() {
  for (let i = 0; i < 10; i++) { ctx.currentTime += 0.1; await wait(30); }
}
const answerSum = () => {
  const answer = String(Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent));
  for (const d of answer) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
};

test('🎤 Live\'s ⏲️ ticks; 🧸 Kids silences it; back on Live it ticks again', async () => {
  $('#live-tab').dispatch('click');
  if ($('#dj-click').getAttribute('aria-pressed') !== 'true') $('#dj-click').dispatch('click');
  ticks = 0;
  await run();
  assert.ok(ticks > 0, 'it ticks on Live');
  $('#kids-open').dispatch('click');
  await page.settle();
  assert.equal(document.body.classList.contains('kids'), true);
  ticks = 0;
  await run();
  assert.equal(ticks, 0, 'no click over the kid\'s screens');
  $('#settings-open').dispatch('click');
  answerSum();
  await page.settle();
  $('#settings-dialog').close();
  assert.equal(document.body.classList.contains('kids'), false);
  ticks = 0;
  await run();
  assert.ok(ticks > 0, 'back on Live, it ticks again');
  $('#stop-all').dispatch('click');
});
