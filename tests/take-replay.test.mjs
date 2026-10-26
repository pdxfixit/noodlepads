// A take played back on 🎤 Live: every hit is booked on the audio clock at
// once, at the take's start plus its time, so the replay keeps time however
// busy the page is (a timer per hit came late whenever the page was busy).
// Sound itself needs a browser: here the stand-in's sources say when they
// were told to start and stop.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { state } from '../web/state.js';

let page;
let $;
let audio;
let FADE;
const sources = [];

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ audio, FADE_SECONDS: FADE } = await import('../web/audio.js'));
  const ctx = audio.context();
  ctx.currentTime = 50;
  ctx.createBufferSource = () => {
    const s = { starts: [], stops: [], playbackRate: { value: 1 }, connect() {}, disconnect() {}, start(t) { s.starts.push(t); }, stop(t) { s.stops.push(t); } };
    sources.push(s);
    return s;
  };
  audio.load = async () => ({ buffer: {}, duration: 0.4 });
});

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('▶ Play on a take books every hit ahead on the audio clock, each cutting the last as it did; ■ Stop silences the ones to come', async () => {
  const take = {
    id: 'take-replay-1', personId: state.personId, name: 'Clock Jam', created: 1, duration: 0.6,
    events: [
      { t: 0, clipId: 'pip-kick', kind: 'hit' },
      { t: 0.25, clipId: 'pip-clap', kind: 'hit' },
      { t: 0.5, clipId: 'pip-kick', kind: 'hit' },
    ],
  };
  state.takes.push(take);
  $('#live-tab').dispatch('click');
  $('#dj-takes-open').dispatch('click');
  const play = () => $('#takes-list').querySelector('[data-play="take-replay-1"]');
  play().dispatch('click');
  assert.equal(play().textContent, '■ Stop');
  await new Promise((r) => setImmediate(r));   // the sounds load; no time passes on the audio clock
  assert.equal(sources.length, 3, 'all three hits booked at once, before any of them is due');
  const t0 = sources[0].starts[0];
  assert.ok(t0 > 50 && t0 < 50.2, `the first hit a moment from now: ${t0}`);
  assert.ok(near(sources[1].starts[0], t0 + 0.25), `the clap at +0.25 s: ${sources[1].starts[0] - t0}`);
  assert.ok(near(sources[2].starts[0], t0 + 0.5), 'the second kick at +0.5 s');
  assert.ok(near(sources[0].stops.at(-1), t0 + 0.5 + FADE), 'the second kick cuts the first when it starts, not now');
  assert.ok(near(sources[1].stops.at(-1), t0 + 0.25 + 0.4), 'the clap plays out');

  play().dispatch('click');   // ■ Stop, with the audio clock still before the first hit
  assert.equal(play().textContent, '▶ Play');
  for (const s of sources) assert.ok(s.stops.at(-1) <= 50 + FADE + 1e-9, `every booked hit is stopped now, so none sounds: ${s.stops.at(-1)}`);
  $('#takes').close();
  state.takes = state.takes.filter((t) => t !== take);
  $('#pads-tab').dispatch('click');
});

test('a take stopped while its sounds load books nothing', async () => {
  const take = { id: 'take-replay-2', personId: state.personId, name: 'Late Jam', created: 2, duration: 0.3, events: [{ t: 0, clipId: 'pip-kick', kind: 'hit' }] };
  state.takes.push(take);
  sources.length = 0;
  let release;
  const plain = audio.load;
  audio.load = () => new Promise((r) => { release = () => r({ buffer: {}, duration: 0.4 }); });
  $('#live-tab').dispatch('click');
  $('#dj-takes-open').dispatch('click');
  const play = () => $('#takes-list').querySelector('[data-play="take-replay-2"]');
  play().dispatch('click');
  play().dispatch('click');   // ■ Stop before it loaded
  release();
  await new Promise((r) => setImmediate(r));
  assert.equal(sources.length, 0);
  audio.load = plain;
  $('#takes').close();
  state.takes = state.takes.filter((t) => t !== take);
  $('#pads-tab').dispatch('click');
});
