// One beat engine (docs/design/one-beat-engine.md), step 6: 🥁 Beats' loop
// is the engine's. What Beats adds to the run is tested here, on a stand-in
// audio object and a clock moved by hand: hitsDue's `steps` (the playhead's
// pills) and `skip` (a pill a live hit already played); a run whose sounds
// are the caller's (`loaded`) going at once, with its first tick the
// caller's; the hooks Beats uses (`limit`, `beforeRows`, `join`, `afterTick`);
// and the cuts and ringing counts its stop logs. That Beats still books the same hits is tests/beats-same-hits.test.mjs. Not tested
// here: how it sounds, and timing on a slow phone
// (`just look beats --cpu 4 --height 680`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRow, hitsDue } from '../web/beat.js';
import { createBeatEngine } from '../web/beat-engine.js';

const round = (t) => Math.round(t * 1e9) / 1e9;

// A stand-in audio.js: a clock moved by hand (`t.now`), and every sound
// started on it ({clip, at, src}); `t.faded` the voices stopped by a fade.
function fakeAudio() {
  const t = { now: 0, started: [], faded: [] };
  const ctx = {
    get currentTime() { return t.now; },
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const src = { playbackRate: { value: 1 }, buffer: null, connect() {}, start(at) { t.started.push({ clip: src.buffer.clip, at: round(at), src }); }, stop(at) { t.faded.push({ src, at }); } };
      return src;
    },
  };
  t.audio = { master: {}, context: () => ctx, wake: () => ctx, key: (clip) => clip.id, load: async (clip) => ({ buffer: { clip: clip.id }, duration: 0.3 }) };
  return t;
}

// A run with its tick caught; the caller's first tick is `run.tick()`.
function begin(engine, hooks) {
  const plain = globalThis.setInterval;
  const ticks = [];
  globalThis.setInterval = (fn) => ticks.push(fn);
  try {
    return { run: engine.play(hooks), ticks };
  } finally {
    globalThis.setInterval = plain;
  }
}
const loadedOf = (...ids) => (id) => (ids.includes(id) ? { clip: { id }, loaded: { buffer: { clip: id }, duration: 0.3 } } : null);
const on = (n, ...pills) => Array.from({ length: n }, (_, i) => pills.includes(i));
function runTo(t, run, until) {
  while (t.now < until) { t.now = round(t.now + 0.025); run.tick(); }
}

test('hitsDue: `steps` gives every pill each row passes, with its swung time; `skip` is asked of every pill and takes its hits out', () => {
  const p = { bpm: 150, swing: 50, rows: [cleanRow({ clipId: 'a', steps: on(16, 0, 1, 2) }), cleanRow({ clipId: 'b', muted: true, steps: on(16, 0, 1, 2) })] };
  const at = { clocks: [{ next: 1, step: 0 }, { next: 1, step: 0 }], pass: { next: 1, pill: 0 } };
  const asked = [];
  const due = hitsDue(p, at, 1.35, { swing: 50, steps: true, skip: (row, next, dt) => { asked.push([row, round(next)]); return row === 0 && round(next) === 1.1; } });
  assert.deepEqual(due.steps.filter((s) => s.row === 0).map((s) => [s.step, round(s.time)]), [[0, 1], [1, 1.15], [2, 1.3], [3, 1.35]], 'swung: the "and" two pills late, the odd pill half a pill, as they sound');
  assert.equal(due.steps.filter((s) => s.row === 1).length, 4, 'a muted row passes its pills too');
  assert.deepEqual(due.hits.map((h) => [h.row, round(h.at)]), [[0, 1], [0, 1.3]], 'pill 1 was played live: not booked again; the muted row books none');
  assert.deepEqual(asked.filter(([row]) => row === 1).map(([, next]) => next), [1, 1.1, 1.2, 1.3], 'asked of the muted row too, so a skip is used up where it fell');
  assert.deepEqual(hitsDue(p, at, 1.35, { swing: 50 }).steps, [], 'only when asked for');
});

test('a run on the caller\'s own sounds goes at once; its first tick, the hooks and the playhead\'s pills are the caller\'s', () => {
  const t = fakeAudio();
  t.now = 3;
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'kick', steps: on(16, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15), ring: true })] };
  const order = [];
  let limit = Infinity;
  const { run, ticks } = begin(engine, {
    beat: () => beat, from: 3.2, steps: true, loaded: loadedOf('kick', 'snare'), limit: () => limit,
    beforeRows: (until) => order.push(['before', round(until)]), afterTick: () => order.push(['after']), onHit: (clip, at) => order.push(['hit', clip, round(at)]),
  });
  assert.equal(ticks.length, 1, 'its timer is going');
  assert.equal(run.t0, 3.2, 'from the caller');
  assert.deepEqual(run.clocks, [{ next: 3.2, step: 0 }]);
  assert.deepEqual([run.voices.length, run.shown, run.queue], [1, [-1], []]);
  assert.equal(t.started.length, 0, 'nothing is booked until the caller ticks');
  t.now = 3.11;
  run.tick();
  assert.deepEqual(order.slice(0, 2), [['before', 3.21], ['hit', 'kick', 3.2]], 'the click first, then the hits (the lookahead is 0.1 s)');
  assert.deepEqual(order.at(-1), ['after']);
  assert.deepEqual(run.queue.map((q) => [q.row, q.step, round(q.time)]), [[0, 0, 3.2]], 'the pill booked, to be heard');
  assert.equal(run.stats.hits, 1);
  // The latest moment to book up to, as the chip switch asks for the bar line.
  limit = 3.31;
  runTo(t, run, 3.6);
  assert.equal(t.started.at(-1).at, 3.3, 'nothing at or past the limit');
  limit = Infinity;
  runTo(t, run, 3.9);
  assert.ok(t.started.at(-1).at > 3.7, 'and on again once the limit lifts');
  assert.ok(run.stats.maxRinging > 1 && run.stats.cuts === 0, `a row that rings: ${run.stats.maxRinging} voices, no cuts`);
  run.stop();
  assert.deepEqual([run.queue, run.shown], [[], [-1]], 'a stop leaves nothing to light');
  assert.ok(t.faded.length > 0, 'and fades what sounds');
});

test('a sound the caller has not got is silent and counted; a row with no clock yet joins where the caller says (before the clocks move on)', () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'kick', steps: on(16, 0, 4, 8, 12) })] };
  const joined = [];
  const { run } = begin(engine, { beat: () => beat, from: 0, loaded: loadedOf('kick'), join: (i) => { joined.push([i, round(run.clocks[0].next)]); return { next: 0.3, step: 3 }; } });
  run.tick();
  assert.deepEqual(joined, [], 'row 0 has its clock');
  beat.rows.push(cleanRow({ clipId: 'gone', steps: on(16, 3, 4) }));   // a row added while playing, with no sound
  t.now = 0.2;
  run.tick();
  assert.equal(joined.length, 1);
  assert.deepEqual(run.clocks[1].step, 4, 'it joined at pill 3 and is on pill 4 after the one pill booked');
  runTo(t, run, 0.6);
  assert.ok(run.stats.silent >= 1, 'its hit had no sound to play');
  assert.equal(t.started.filter((h) => h.clip === 'gone').length, 0);
  run.stop();
});
