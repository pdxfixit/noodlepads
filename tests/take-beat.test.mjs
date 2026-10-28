// 🥁 Make a beat on a take's card: take-beat.js turns a take's hits into a beat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { beatFromTake, bestTempo } from '../web/take-beat.js';

const BPM = 104;
const STEP = 60 / BPM / 4;
const hit = (clipId, pill, off = 0) => ({ clipId, kind: 'hit', t: Math.max(0, pill * STEP + off) });
const take = (events, duration) => ({ events, duration: duration ?? events.at(-1).t + 0.5 });
const on = (row) => row.steps.flatMap((s, i) => (s ? [i] : []));

test('hits snap to sixteenths, one row per sound in the order first played', () => {
  const b = beatFromTake(take([hit('kick', 0), hit('hat', 0), hit('snare', 4), hit('kick', 8), hit('snare', 12)]), { bpm: BPM });
  assert.deepEqual(b.rows.map((r) => r.clipId), ['kick', 'hat', 'snare']);
  assert.deepEqual(on(b.rows[0]), [0, 8]);
  assert.deepEqual(on(b.rows[2]), [4, 12]);
  assert.equal(b.bars, 1);
  assert.equal(b.bpm, BPM);
});

test('a loose hit lands on its nearest pill', () => {
  const b = beatFromTake(take([hit('kick', 0), hit('kick', 4, 0.03), hit('kick', 8, -0.03)]), { bpm: BPM });
  assert.deepEqual(on(b.rows[0]), [0, 4, 8]);
});

test('the bars are the take up to its last hit, rounded up to 1, 2 or 4', () => {
  const at = (pill) => beatFromTake(take([hit('kick', 0), hit('kick', pill)]), { bpm: BPM }).bars;
  assert.equal(at(15), 1);
  assert.equal(at(16), 2);
  assert.equal(at(33), 4);
  assert.equal(at(63), 4);
});

test('a take past 4 bars keeps its first 4 and counts what it left out', () => {
  const b = beatFromTake(take([hit('kick', 0), hit('kick', 60), hit('kick', 64), hit('kick', 80)]), { bpm: BPM });
  assert.equal(b.bars, 4);
  assert.deepEqual(on(b.rows[0]), [0, 60]);
  assert.equal(b.dropped, 2);
});

test('sounds past the row limit are left out and counted', () => {
  const events = Array.from({ length: 20 }, (_, i) => hit(`s${i}`, i));
  const b = beatFromTake(take(events), { bpm: BPM });
  assert.equal(b.rows.length, 16);
  assert.equal(b.dropped, 4);
});

test('only hits of sounds that are still there count; loops, stops and the beat do not', () => {
  const events = [hit('kick', 0), { clipId: 'kick', kind: 'loop', t: 0.1 }, { clipId: 'kick', kind: 'stop', t: 0.2 },
    { clipId: 'kick', kind: 'beat', t: 0.3 }, hit('gone', 2)];
  const b = beatFromTake(take(events), { bpm: BPM, has: (id) => id !== 'gone' });
  assert.deepEqual(b.rows.map((r) => r.clipId), ['kick']);
  assert.deepEqual(on(b.rows[0]), [0]);
  assert.equal(beatFromTake(take([{ clipId: 'kick', kind: 'loop', t: 0 }], 2), { bpm: BPM }), null);
});

test('the Click track tempo is used as it is, kept to the beat maker\'s range', () => {
  assert.equal(beatFromTake(take([hit('kick', 0), hit('kick', 3)]), { bpm: 90 }).bpm, 90);
  assert.equal(beatFromTake(take([hit('kick', 0), hit('kick', 3)]), { bpm: 400 }).bpm, 180);
});

test('with no click, the tempo is found from the hits', () => {
  const times = [];
  for (let p = 0; p < 32; p += 2) times.push(p * STEP + (p % 3 - 1) * 0.015);
  assert.ok(Math.abs(bestTempo(times) - BPM) <= 2);
  assert.equal(bestTempo([0.5]), 100);
});

test('the beat is made safe by the beat maker\'s own cleaning', async () => {
  const { cleanPattern } = await import('../web/beat.js');
  const b = beatFromTake(take([hit('kick', 0), hit('kick', 20)]), { bpm: BPM });
  const p = cleanPattern({ ...b, name: 'Take 1 beat' }, 'person-1');
  assert.equal(p.bars, 2);
  assert.equal(p.rows[0].steps.length, 32);
  assert.equal(p.signature, '4/4');
});

// Steady playing with each hit up to 40 ms early or late, from a seeded
// generator so a run is the same every time. Council (producer, 2026-10-28):
// the best fit used to land on 3/4 or 1/2 of the real tempo (quarters at 120
// fit 90 BPM just as well, on every third pill).
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const steady = (bpm, every, count, seed) => {
  const rnd = seeded(seed);
  const pill = 60 / bpm / 4;
  const times = Array.from({ length: count }, (_, i) => i * every * pill + (rnd() - 0.5) * 0.08);
  return times.map((t) => Math.max(0, t - times[0]));
};

test('steady quarters and eighths, up to 40 ms loose, are fitted to their own tempo', () => {
  const cases = [['quarters@120', 120, 4, 16], ['eighths@120', 120, 2, 24], ['eighths@140', 140, 2, 24], ['quarters@90', 90, 4, 16], ['eighths@100', 100, 2, 24], ['quarters@80', 80, 4, 12]];
  for (const [name, bpm, every, count] of cases) {
    for (let seed = 1; seed <= 25; seed++) {
      const got = bestTempo(steady(bpm, every, count, seed * 7919));
      assert.ok(Math.abs(got - bpm) <= 2, `${name}, seed ${seed}: found ${got}`);
    }
  }
});

test('the kick, snare and hat take of the mockup, 35 ms loose, is found at 104', () => {
  const rnd = seeded(7);
  const pill = 60 / 104 / 4;
  const on = { kick: [0, 6, 8, 14, 16, 22, 24, 30], snare: [4, 12, 20, 28], hat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30] };
  const events = Object.entries(on).flatMap(([clipId, ps]) => ps.map((p) => ({ clipId, kind: 'hit', t: p * pill + (rnd() - 0.5) * 0.07 })));
  events.sort((a, b) => a.t - b.t);
  const base = events[0].t;
  for (const e of events) e.t = Math.max(0, e.t - base);
  const b = beatFromTake({ events, duration: 5 });
  assert.ok(Math.abs(b.bpm - 104) <= 2, `found ${b.bpm}`);
  assert.equal(b.bars, 2);
  assert.deepEqual(b.rows.map((r) => on[r.clipId].length), b.rows.map((r) => r.steps.filter(Boolean).length), 'every hit on its own pill');
});

test('the grid starts at the first hit, not at the take\'s zero: a loop or stop before it moves nothing', () => {
  const events = [
    { clipId: 'kick', kind: 'loop', t: 0 },
    { clipId: 'kick', kind: 'stop', t: 0.4 },
    hit('snare', 0, 0.9), hit('snare', 4, 0.9), hit('snare', 8, 0.9), hit('hat', 8, 0.9),
  ];
  const b = beatFromTake({ events, duration: 4 }, { bpm: BPM });
  assert.deepEqual(b.rows.map((r) => r.clipId), ['snare', 'hat']);
  assert.deepEqual(on(b.rows[0]), [0, 4, 8], 'the first hit is pill 0');
  assert.deepEqual(on(b.rows[1]), [8]);
  const more = events.concat(hit('snare', 12, 0.9), hit('snare', 16, 0.9), hit('snare', 20, 0.9));
  const guessed = beatFromTake({ events: more, duration: 4 });
  assert.ok(Math.abs(guessed.bpm - BPM) <= 3, `found ${guessed.bpm}`);
  assert.deepEqual(on(guessed.rows[0]), [0, 4, 8, 12, 16, 20]);
});

test('two hits of one sound on one pill are counted as merged, and none are merged otherwise', () => {
  const b = beatFromTake(take([hit('kick', 0), hit('kick', 0, 0.02), hit('kick', 4), hit('snare', 4), hit('snare', 4, -0.01)]), { bpm: BPM });
  assert.equal(b.merged, 2);
  assert.deepEqual(on(b.rows[0]), [0, 4]);
  assert.equal(beatFromTake(take([hit('kick', 0), hit('kick', 4)]), { bpm: BPM }).merged, 0);
});

test('the beat is straight and 4/4, with swing 0 said outright', () => {
  const b = beatFromTake(take([hit('kick', 0), hit('kick', 4)]), { bpm: BPM });
  assert.equal(b.swing, 0);
  assert.equal(b.signature, '4/4');
});

test('half a pill rounds up', () => {
  const half = (60 / 120 / 4) * 4.5;   // pill 4.5 at 120 BPM
  const b = beatFromTake(take([hit('kick', 0), { clipId: 'kick', kind: 'hit', t: half }]), { bpm: 120 });
  assert.deepEqual(on(b.rows[0]), [0, 5]);
});
