// 🧸 Kids starts quiet, and its ⏹️ is the whole app's Stop all (council,
// 2026-10-26). Each grown-up thing that can sound is started, then Kids
// shows, and what still sounds is counted on the stand-in clock: the keys'
// ⏲️ ticks (oscillators booked), the beat and the song (their ▶ buttons), a
// held pad's loop. A 🎬 take playing back, booked ahead on the audio clock,
// is take-stop-all.test.mjs's.
// Earlier the click ticked on and a take played on over the kid's screens.
// Not tested here: the sounds as heard.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { dropBeat } from './song-ui.mjs';

let page;
let $;
let audio;
let ctx;
let ticks = 0;
let plays = 0;
const looping = new Set();

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
  audio.play = async () => { plays++; };
  audio.loop = (clip) => { looping.add(clip.id); };
  audio.isLooping = (id) => looping.has(id);
  const stopAll = audio.stopAll.bind(audio);
  audio.stopAll = () => { looping.clear(); stopAll(); };
  ctx = audio.context();
  const make = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => { ticks++; return make(); };
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  for (let i = 0; i < 10; i++) { ctx.currentTime += 0.1; await wait(30); }
}
const answerSum = () => {
  const answer = String(Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent));
  for (const d of answer) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
};
async function intoKids() {
  $('#kids-open').dispatch('click');
  await page.settle();
  assert.equal(document.body.classList.contains('kids'), true);
  ticks = 0;
  plays = 0;
  await run();
}
async function outOfKids() {
  $('#settings-open').dispatch('click');
  answerSum();
  await page.settle();
  $('#settings-dialog').close();
  assert.equal(document.body.classList.contains('kids'), false);
}

test('the keys\' ⏲️ click: silent in Kids', async () => {
  $('#live-tab').dispatch('click');
  if ($('#dj-click').getAttribute('aria-pressed') !== 'true') $('#dj-click').dispatch('click');
  await intoKids();
  assert.equal(ticks, 0, 'no click');
  await outOfKids();
  $('#stop-all').dispatch('click');
});

test('a held pad\'s loop and the beat: silent in Kids', async () => {
  $('#pads-tab').dispatch('click');
  const pad = $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);
  pad.dispatch('pointerdown', { button: 0, pointerId: 1, shiftKey: true });
  page.winEvent('pointerup', { pointerId: 1 });
  assert.equal(looping.size, 1, 'a pad loops');
  $('#beats-toggle').dispatch('click');
  await page.settle();
  newBeatWithRow(page);
  await page.settle();
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'the beat plays');
  await intoKids();
  assert.equal(looping.size, 0, 'no loop');
  assert.equal(plays, 0);
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'false', 'no beat');
  await outOfKids();
});

test('the song: silent in Kids', async () => {
  $('#song-tab').dispatch('click');
  await page.settle();
  dropBeat($);
  $('#song-play').dispatch('click');
  await page.settle();
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'true', 'the song plays');
  await intoKids();
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'false', 'no song');
  assert.equal(plays, 0);
  await outOfKids();
  $('#pads-tab').dispatch('click');
});

test('Kids\' ⏹️ is the whole app\'s Stop all: every ⏲️ off too, as the toolbar\'s', async () => {
  if ($('#seq-click').getAttribute('aria-pressed') !== 'true') $('#seq-click').dispatch('click');
  if ($('#dj-click').getAttribute('aria-pressed') !== 'true') $('#dj-click').dispatch('click');
  $('#kids-open').dispatch('click');
  await page.settle();
  $('#kids-stop').dispatch('click');
  assert.equal($('#seq-click').getAttribute('aria-pressed'), 'false');
  assert.equal($('#dj-click').getAttribute('aria-pressed'), 'false');
  await outOfKids();
});
