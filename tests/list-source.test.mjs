// One beat engine (docs/design/one-beat-engine.md), step 8: the engine's play
// on a planned list, as 🎼 Song and 💃 Grooves' sample use it. The same tick
// as the loop: it books the events due before the lookahead, drops a hit whose
// moment passed (read from the clock for each hit, not once a tick), cuts an
// earlier hit of the same key, tells onHit with the event, counts what it did,
// and fades everything on stop. What Song and the sample book, hit for hit, is
// tests/song-same-hits.test.mjs. A stand-in audio object and clock; the
// engine's 25 ms tick is caught and called by hand. Not tested here: how it
// sounds, and timing on a slow phone (`just look song --cpu 4 --height 680`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBeatEngine, TICK_MS, LOOKAHEAD } from '../web/beat-engine.js';
import { cleanRow } from '../web/beat.js';

const round = (t) => Math.round(t * 1e9) / 1e9;

// A stand-in audio.js with a clock moved by hand (`t.now`) and every sound
// started on it. `t.onStart` runs as each starts: a slow page moving the clock.
function fakeAudio({ duration = 0.05 } = {}) {
  const t = { now: 0, started: [], stopped: [], onStart: null };
  const gain = () => {
    const node = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect(to) { node.to = to; }, disconnect() {} };
    return node;
  };
  const ctx = {
    get currentTime() { return t.now; },
    createGain: gain,
    createBufferSource: () => {
      const src = { playbackRate: { value: 1 }, buffer: null, connect(to) { src.to = to; },
        stop(at) { t.stopped.push(round(at)); },
        start(at) { t.started.push({ clip: src.buffer.clip, at: round(at) }); t.onStart?.(); } };
      return src;
    },
  };
  t.audio = { master: { name: 'master' }, context: () => ctx, wake: () => ctx, key: (clip) => clip.id,
    load: async (clip) => ({ buffer: { clip: clip.id }, duration }) };
  return t;
}

// Starts a run on `events` with its interval caught: `tick()` is one tick.
async function start(t, hooks, clips = ['kick', 'snare']) {
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const pattern = { bpm: 100, bars: 1, rows: clips.map((clipId) => cleanRow({ clipId, steps: [true] })) };
  await engine.prepareBeats([pattern]);
  const plain = globalThis.setInterval;
  const caught = [];
  globalThis.setInterval = (fn, ms) => caught.push([fn, ms]);
  try {
    const run = engine.play({ list: { events: hooks.events(pattern) }, ...hooks.hooks });
    return { run, pattern, tick: () => caught.forEach(([fn]) => fn()), caught };
  } finally {
    globalThis.setInterval = plain;
  }
}
const event = (pattern, row, at, extra = {}) => ({ at, pattern, row, loud: false, note: 0, len: 0, dest: { name: 'lane' }, key: `lane:${row}`, ...extra });

test('the tick and the lookahead are one pair, exported by the engine', () => {
  assert.equal(TICK_MS, 25);
  assert.equal(LOOKAHEAD, 0.1);
});

test('a list: events due before the lookahead are booked on a 25 ms tick, in order, each told to onHit with its event', async () => {
  const t = fakeAudio();
  t.now = 10;
  const told = [];
  const { run, tick, caught } = await start(t, {
    events: (p) => [event(p, 0, 10.02), event(p, 1, 10.05), event(p, 0, 10.2), event(p, 1, 10.5)],
    hooks: { onHit: (clipId, at, e) => told.push([clipId, round(at), e.row]) },
  });
  assert.equal(caught.length, 1, 'one timer');
  assert.equal(caught[0][1], TICK_MS);
  assert.equal(await run.ready, true);
  assert.equal(t.started.length, 0, 'nothing is booked until the caller\'s first tick');
  run.tick();
  assert.deepEqual(t.started, [{ clip: 'kick', at: 10.02 }, { clip: 'snare', at: 10.05 }], 'up to now + 0.1');
  t.now = 10.12;
  tick();
  assert.deepEqual(t.started.map((h) => h.at), [10.02, 10.05, 10.2]);
  t.now = 10.45;
  tick();
  assert.deepEqual(t.started.map((h) => h.at), [10.02, 10.05, 10.2, 10.5]);
  assert.deepEqual(told, [['kick', 10.02, 0], ['snare', 10.05, 1], ['kick', 10.2, 0], ['snare', 10.5, 1]]);
  assert.equal(run.stats.hits, 4);
});

test('a stall drops the hits whose moment passed (read for each hit); the rest carry on in time', async () => {
  const t = fakeAudio();
  t.now = 20;
  const { run, tick } = await start(t, {
    events: (p) => [event(p, 0, 20.0), event(p, 0, 20.3), event(p, 1, 20.31), event(p, 0, 20.45)],
    hooks: {},
  });
  t.now = 20.4;   // the timers slept: the clock ran on 0.4 s
  tick();
  assert.deepEqual(t.started.map((h) => h.at), [20.45], 'two hits past by more than 20 ms are dropped; one just past would still sound');
  assert.equal(run.stats.late, 3);
  // A slow booking moves the clock while the tick books: a hit that was in time
  // when the tick began is late by the time its turn comes.
  const slow = fakeAudio();
  slow.now = 30;
  const next = await start(slow, {
    events: (p) => [event(p, 0, 30.0), event(p, 1, 30.01), event(p, 0, 30.08)],
    hooks: {},
  });
  slow.onStart = () => { slow.now += 0.05; };
  next.run.tick();
  assert.deepEqual(slow.started.map((h) => h.at), [30.0, 30.08], 'the second was in time at the tick\'s start, 50 ms late by its turn');
  assert.equal(next.run.stats.late, 1);
});

test('a key cuts the earlier hit of that key; another key rings on; a sound that is not there is counted, not booked', async () => {
  const t = fakeAudio({ duration: 1 });
  t.now = 40;
  const { run, tick } = await start(t, {
    events: (p) => [event(p, 0, 40.0), event(p, 0, 40.05), event(p, 0, 40.06, { key: 'lane:other' }), event(p, 1, 40.07)],
    hooks: {},
  }, ['kick', 'snare']);
  run.tick();
  // The kick on 'lane:0' was cut where the next one starts: faded, then stopped.
  assert.ok(t.stopped.some((at) => Math.abs(at - 40.05) < 0.05), 'the first kick was faded out at the second');
  assert.equal(t.stopped.length, 1, 'only that one');
  assert.equal(run.stats.cuts, 1);
  assert.equal(run.stats.hits, 4);
  const gone = await start(fakeAudio(), { events: (p) => [event({ ...p, rows: [cleanRow({ clipId: 'never', steps: [true] })] }, 0, 0)], hooks: {} });
  gone.run.tick();
  assert.equal(gone.run.stats.silent, 1);
  assert.equal(gone.run.stats.hits, 0);
  tick();
});

test('afterTick runs after each tick; stop() ends the timer, fades what sounds and books nothing more', async () => {
  const t = fakeAudio({ duration: 5 });
  t.now = 50;
  let after = 0;
  const { run, tick } = await start(t, {
    events: (p) => [event(p, 0, 50.0), event(p, 1, 50.2)],
    hooks: { afterTick: () => { after++; } },
  });
  run.tick();
  assert.equal(after, 1);
  const stats = run.stop();
  assert.equal(stats.hits, 1);
  assert.ok(t.stopped.length >= 1, 'the sounding hit is faded out and stopped');
  t.now = 50.3;
  tick();
  assert.equal(t.started.length, 1, 'nothing booked after stop');
  assert.equal(after, 1);
});
