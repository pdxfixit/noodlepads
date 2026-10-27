// 〰️ Warble and 🤖 Robot (🎚️ Mixer, ADR 0018) run oscillators inside the
// beat's mix graph (mixer.js buildMix) until the graph is disposed. A graph
// was disposed only when rebuilt for the same beat object, and a song, a
// groove sample, a chip switch or a beat opened again each play through new
// ones, so their oscillators ran on after the music stopped, one more set
// each time. Now each graph is let go once what played through it stops,
// and disposed once its last voice has ended and its effects' tail has rung
// (beat-engine.js ringOut), by the audio clock: these tests move that clock
// by hand with the timers. The real app, with a live audio clock that keeps
// the oscillators it makes; sound needs a browser.

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
// 7 s pass on the audio clock and the timers: the graphs it let go are disposed.
async function stopAndRingOut(fn) {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    fn();
    ctx.currentTime += 7;
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

// 🎹 A note placed in the roll while the beat is stopped is heard through
// the beat's mix (previewNote). That mix was let go only by a later stop.
test('a 🎹 note heard while the beat is stopped: its Robot stops once the roll closes', async () => {
  $('#beats-toggle').dispatch('click');
  document.querySelectorAll('[data-mixer]')[0].dispatch('click');
  const master = $('#mixer-strips').children.find((c) => c.dataset.strip === 'master').querySelector('[data-fx]');
  master.value = 'robot';
  master.dispatch('change');
  $('#mixer').close();
  await stopAndRingOut(() => {});   // what the beat left is gone
  assert.equal(running(), 0);
  $('#seq-add-tune').dispatch('click');
  $('#tune-who-list').querySelectorAll('[data-inst]').find((b) => b.dataset.inst === 'pluck').dispatch('click');
  assert.equal($('#roll').open, true);
  $('#roll').querySelector('.note-cell').dispatch('click');
  await page.settle();
  assert.ok(running() > 0, 'the note plays through the Master Robot');
  await stopAndRingOut(() => $('#roll').close());
  assert.equal(running(), 0, 'none left running');
});

// 🎼 Song: a lane done with a beat lets that beat's mix go there while the
// song plays on, so a busy song holds no more Robots than it is playing.
test("a song's Robot beat stops running once its lane's last block of it ends, while the song plays on", async () => {
  // A beat with no effect, on lane 2 for four bars; the Robot beat (from
  // above) is on lane 1 for two.
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  $('#seq-rows').querySelectorAll('.pill')[0].dispatch('click');
  const plain = document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value;
  $('#song-tab').dispatch('click');
  for (let bar = 0; bar < 4; bar++) dropBeat($, { lane: 1, bar, name: plain });
  ctx.currentTime = 40;
  $('#song-play').dispatch('click');
  await page.settle();
  ctx.currentTime = 40.5;
  await wait();
  assert.ok(running() > 0, 'the Robot beat plays');
  // The song started at 40.1; two bars at 100 BPM are 4.8 s. At 45.2 lane
  // 1 is done with the Robot beat; lane 2 plays on to 49.7.
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    ctx.currentTime = 45.2;
    await new Promise((r) => { const t = setInterval(() => { clearInterval(t); r(); }, 60); });   // a real tick
    ctx.currentTime = 46;   // its last Robot hit has ended; lane 2 plays on to 49.7
    mock.timers.tick(7000);
  } finally {
    mock.timers.reset();
  }
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'true', 'the song still plays');
  assert.equal(running(), 0, 'the Robot is gone with its last block');
  $('#song-play').dispatch('click');
  ctx.currentTime = 0;
});

// The same with the roll left open: the mix is let go RING_MS (6 s) after the
// last note heard, and disposed then, its note long over. A note heard
// meanwhile starts the 6 s again. The timers are mocked before the note's tap, so the timer
// the preview sets is the mock's; the preview's load is awaited as
// microtasks (settle() would wait on the mocked timers).
test('a 🎹 note heard with the roll left open: its Robot stops 6 s after the last note, once rung out', async () => {
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  $('#beats-toggle').dispatch('click');
  document.querySelectorAll('[data-mixer]')[0].dispatch('click');
  const master = $('#mixer-strips').children.find((c) => c.dataset.strip === 'master').querySelector('[data-fx]');
  master.value = 'robot';
  master.dispatch('change');
  $('#mixer').close();
  $('#seq-add-tune').dispatch('click');
  $('#tune-who-list').querySelectorAll('[data-inst]').find((b) => b.dataset.inst === 'pluck').dispatch('click');
  assert.equal($('#roll').open, true);
  await stopAndRingOut(() => {});   // what came before is gone
  assert.equal(running(), 0);
  const cells = () => $('#roll').querySelectorAll('.note-cell');
  // A mocked tick moves its clock to the end first, so a timer set inside
  // it counts from there: step 100 ms at a time to keep the times true.
  const advance = (ms) => { for (let t = 0; t < ms; t += 100) { ctx.currentTime += 0.1; mock.timers.tick(100); } };
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    cells()[0].dispatch('click');
    await flush();
    assert.ok(running() > 0, 'the note plays through the Master Robot');
    advance(5000);
    cells()[3].dispatch('click');   // a second note at 5 s
    await flush();
    // From the first note alone it would go at 6 s; the second note's 6 s
    // run to 11 s, and the notes are long over by then.
    advance(5500);                  // 10.5 s
    assert.ok(running() > 0, 'the second note started the 6 s again');
    advance(1000);                  // 11.5 s
    assert.equal(running(), 0, 'none left running, the roll still open');
    assert.equal($('#roll').open, true);
  } finally {
    mock.timers.reset();
  }
  $('#roll').close();
});

// A song with ⛪ Hall on the Master: the song stops, and Hall's tail (about
// 2.4 s) rings out through the lane gains, which stay connected until the
// mix behind them is gone. They were disconnected a second after the stop.
test('a song with Hall: its lane gains stay connected past 1 s so the tail rings, and go once the mix has', async () => {
  const gains = [];
  const made = ctx.createGain;
  ctx.createGain = () => {
    const g = { disconnected: false, connect() {}, disconnect() { g.disconnected = true; }, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} } };
    gains.push(g);
    return g;
  };
  try {
    $('#beats-toggle').dispatch('click');
    newBeatWithRow(page);
    $('#seq-rows').querySelectorAll('.pill')[0].dispatch('click');
    document.querySelectorAll('[data-mixer]')[0].dispatch('click');
    const master = $('#mixer-strips').children.find((c) => c.dataset.strip === 'master').querySelector('[data-fx]');
    master.value = 'hall';
    master.dispatch('change');
    $('#mixer').close();
    $('#song-tab').dispatch('click');
    dropBeat($);
    ctx.currentTime = 60;
    gains.length = 0;
    $('#song-play').dispatch('click');
    await page.settle();
    const lanes = [...gains];   // the song's lane gains: all it has made so far, one a lane
    assert.ok(lanes.length > 0 && lanes.every((g) => !g.disconnected));
    ctx.currentTime = 60.5;   // its first bar is due
    await wait();
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      $('#song-play').dispatch('click');   // stop
      ctx.currentTime = 61.7;
      mock.timers.tick(1200);
      await Promise.resolve();
      assert.ok(lanes.every((g) => !g.disconnected), 'past 1 s, Hall still rings');
      ctx.currentTime = 66;
      mock.timers.tick(5000);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      assert.ok(lanes.every((g) => g.disconnected), 'gone once the mix is');
    } finally {
      mock.timers.reset();
    }
  } finally {
    ctx.createGain = made;
    ctx.currentTime = 0;
  }
});
