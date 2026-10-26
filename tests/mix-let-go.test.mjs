// 〰️ Warble and 🤖 Robot (🎚️ Mixer, ADR 0018) run oscillators inside the
// beat's mix graph (mixer.js buildMix) until the graph is disposed. A graph
// was disposed only when rebuilt for the same beat object, and a song, a
// groove sample, a chip switch or a beat opened again each play through new
// ones, so their oscillators ran on after the music stopped, one more set
// each time. Now each graph is let go once what played through it stops,
// and disposed after its tails ring (6 s). The real app, with a live audio
// clock that keeps the oscillators it makes; sound needs a browser.

import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { dropBeat } from './song-ui.mjs';

let page;
let $;
let ctx;
const oscillators = [];   // every oscillator the live context made: {stopped}

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  const { audio } = await import('../web/audio.js');
  audio.load = async () => ({ buffer: { duration: 0.1 }, duration: 0.1 });
  ctx = audio.wake();
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  ctx.createBufferSource = () => ({ connect() {}, stop() {}, start() {}, playbackRate: param() });
  ctx.createGain = () => ({ connect() {}, disconnect() {}, gain: param() });
  ctx.createOscillator = () => {
    const o = { stopped: false, connect() {}, start() {}, stop() { o.stopped = true; }, frequency: param() };
    oscillators.push(o);
    return o;
  };
  await page.settle();
});

const wait = () => new Promise((r) => setTimeout(r, 60));
const running = () => oscillators.filter((o) => !o.stopped).length;
// Runs `fn` (which stops something) with the clock's timers held, then lets
// 7 s pass for them: the graphs it let go are disposed.
async function stopAndRingOut(fn) {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    fn();
    mock.timers.tick(7000);
  } finally {
    mock.timers.reset();
  }
  await page.settle();
}

test('a beat with 🤖 Robot: its oscillator stops once the beat stops and rings out', async () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  for (const p of $('#seq-rows').querySelectorAll('.pill')) p.dispatch('click');
  document.querySelectorAll('[data-mixer]')[0].dispatch('click');
  const fx = $('#mixer-strips').children.find((c) => c.classList.contains('mix-strip')).querySelector('[data-fx]');
  fx.value = 'robot';
  fx.dispatch('change');
  $('#mixer').close();
  ctx.currentTime = 10;
  $('#seq-play').dispatch('click');
  await page.settle();
  await wait();
  assert.ok(running() > 0, 'Robot runs while the beat plays');
  await stopAndRingOut(() => $('#seq-play').dispatch('click'));
  assert.equal(running(), 0, 'none left running');
});

test('a song of that beat: its oscillators stop once the song stops and rings out', async () => {
  const made = oscillators.length;
  $('#song-tab').dispatch('click');
  dropBeat($);
  dropBeat($);
  ctx.currentTime = 20;
  $('#song-play').dispatch('click');
  await page.settle();
  await wait();
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'true', 'the song plays');
  ctx.currentTime = 20.5;   // its first bar is due
  await wait();
  assert.ok(oscillators.length > made && running() > 0, 'the song plays the beat through its own Robot');
  await stopAndRingOut(() => $('#song-play').dispatch('click'));
  assert.equal(running(), 0, 'none left running');
  ctx.currentTime = 0;
});
