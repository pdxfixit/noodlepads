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
