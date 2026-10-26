// ⏹️ Stop all "stops every sound" (❓ Help), a 🎬 take playing back too: its
// hits are booked ahead on the audio clock as voices of their own, outside
// audio.playing, so audio.stopAll alone left the rest of the take to play
// on after ⏹️, its button still ■ Stop (2026-10-26). 🧸 Kids showing stops
// it the same way. Sound itself needs a browser: here the stand-in's sources
// say when they were told to stop.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { state } from '../web/state.js';

let page;
let $;
let ctx;
const sources = [];

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  ctx = audio.context();
  ctx.currentTime = 50;
  ctx.createBufferSource = () => {
    const s = { starts: [], stops: [], playbackRate: { value: 1 }, connect() {}, disconnect() {}, start(t) { s.starts.push(t); }, stop(t) { s.stops.push(t); } };
    sources.push(s);
    return s;
  };
  audio.load = async () => ({ buffer: {}, duration: 0.2 });
  state.takes.push({
    id: 'take-stop-1', personId: state.personId, name: 'Stop Jam', created: 1, duration: 3,
    events: [
      { t: 0, clipId: 'pip-kick', kind: 'hit' },
      { t: 1, clipId: 'pip-clap', kind: 'hit' },
      { t: 2, clipId: 'pip-kick', kind: 'hit' },
    ],
  });
});

const play = () => $('#takes-list').querySelector('[data-play="take-stop-1"]');
async function playTake() {
  $('#live-tab').dispatch('click');
  $('#dj-takes-open').dispatch('click');
  sources.length = 0;
  play().dispatch('click');
  await new Promise((r) => setImmediate(r));   // the sounds load; the hits are booked
  assert.equal(sources.length, 3, 'every hit booked ahead');
  $('#takes').close();
}
// Every booked hit told to stop by now (a short fade at most): none still to come.
const allCut = () => sources.every((s) => s.stops.some((t) => t <= ctx.currentTime + 0.1));

test('⏹️ Stop all cuts a take playing back: its hits still to come never sound, and ▶ Play is back', async () => {
  await playTake();
  $('#stop-all').dispatch('click');
  assert.ok(allCut(), JSON.stringify(sources.map((s) => s.stops)));
  $('#dj-takes-open').dispatch('click');
  assert.equal(play().textContent, '▶ Play');
  $('#takes').close();
});

test('🧸 Kids showing cuts a take playing back', async () => {
  await playTake();
  $('#kids-open').dispatch('click');
  await page.settle();
  assert.equal(document.body.classList.contains('kids'), true);
  assert.ok(allCut(), JSON.stringify(sources.map((s) => s.stops)));
});
