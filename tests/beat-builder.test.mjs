// Beat Builder's tempo and bars while recording, and tap tempo
// (docs/design/beat-builder-tempo-bars.md): the pure parts. Each tap is
// snapped once with the clock of its moment; a tempo change moves t0 so
// later taps land right and earlier hits stay; a growing beat copies itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapper, snapHits, tapTempo } from '../web/rhythm.js';
import { retimeAt, multiplyRows, COMMON_BPMS } from '../web/sequencer.js';

// 100 BPM, one bar of 4/4: a pill is 0.15 s, 16 pills, recording from t0 = 10.
const clock = { t0: 10, step: 0.15, total: 16 };

test('the snapper keeps the design\'s rules between taps: double taps, one per pill, count-in taps, the next pass\'s "1"', () => {
  const snap = createSnapper(10);
  assert.equal(snap({ t: 9.6, row: 0 }, clock), null, 'a count-in tap is not recorded');
  assert.deepEqual(snap({ t: 9.8, row: 1 }, clock), { row: 1, step: 0, n: 0 }, 'just before the "1" lands on it');
  assert.deepEqual(snap({ t: 10.58, row: 0 }, clock), { row: 0, step: 4, n: 4 });
  assert.equal(snap({ t: 10.62, row: 0 }, clock), null, 'a quick double tap counts once');
  assert.equal(snap({ t: 10.66, row: 0 }, clock), null, 'one hit per pill per pass');
  assert.deepEqual(snap({ t: 12.37, row: 2 }, clock), { row: 2, step: 0, n: 16 }, 'just before the loop restarts: the next pass\'s "1"');
  // The same answers as snapping the whole list at once.
  const hits = [{ t: 9.8, row: 1 }, { t: 10.58, row: 0 }, { t: 10.62, row: 0 }, { t: 12.37, row: 2 }];
  assert.deepEqual(snapHits({ ...clock, from: 10, hits }).map((k) => k.n), [0, 4, 16]);
});

test('a tempo change while playing moves t0: pills already heard stay, later pills are at the new tempo', () => {
  // At 11.2 s (pill 8, the first not yet booked) the tempo goes 100 → 120.
  const move = retimeAt(11.2, 100, 120);
  const t0 = move(10);
  assert.equal(+t0.toFixed(6), 10.2, 'pill 0 is where it would have been at 120');
  assert.equal(+(t0 + 8 * 0.125).toFixed(6), 11.2, 'pill 8 has not moved');
  assert.equal(+move(11.8).toFixed(6), 11.7, 'pill 12 comes 4 new pills after pill 8');
  assert.equal(retimeAt(5, 100, 100)(3), 3, 'the same tempo moves nothing');
});

test('after a tempo change a tap lands on the right pill, and hits placed before stay on theirs', () => {
  const snap = createSnapper(10);
  assert.equal(snap({ t: 10.6, row: 0 }, clock).step, 4, 'pill 4 at 100 BPM');
  const later = { ...clock, t0: retimeAt(11.2, 100, 120)(10), step: 0.125 };
  assert.equal(snap({ t: 11.71, row: 0 }, later).step, 12, 'pill 12 at 120 BPM');
  // Snapping every tap again with the new clock (the old way) would have put
  // the first on pill 3: a stray hit. Snapped once, it stays on 4.
  assert.equal(snapHits({ ...later, from: 10, hits: [{ t: 10.6, row: 0 }] })[0].step, 3);
  // The old clock would have put the new tap on pill 11.
  assert.equal(snapHits({ ...clock, from: 10, hits: [{ t: 11.71, row: 0 }] })[0].step, 11);
});

test('a beat that grew: a tap is placed with the bars of its moment', () => {
  const snap = createSnapper(10);
  // Grown to 2 bars at the end of bar 1: pill 16 is bar 2's first, not the "1".
  assert.deepEqual(snap({ t: 12.4, row: 0 }, { ...clock, total: 32 }), { row: 0, step: 16, n: 16 });
  // Gone round at 2 bars: pill 32 is the "1" again.
  assert.deepEqual(snap({ t: 14.8, row: 0 }, { ...clock, total: 32 }), { row: 0, step: 0, n: 32 });
});

test('growing copies the beat into the new bars, after clearing old hidden pills', () => {
  const on = (...idx) => Array.from({ length: 64 }, (_, i) => idx.includes(i));
  // A 1-bar beat with hits on 0 and 4, plus hits left hidden from when it was 4 bars (20, 40).
  const rows = [{ clipId: 'kick', steps: on(0, 4, 20, 40), accents: on(4), notes: Array.from({ length: 64 }, (_, i) => (i === 4 ? 7 : null)), rate: 1 }];
  const [two] = multiplyRows(rows, 16, 32);
  const lit = (r) => r.steps.flatMap((v, i) => (v ? [i] : []));
  assert.deepEqual(lit(two), [0, 4, 16, 20], 'bar 2 is a copy of bar 1; the hidden 20 and 40 are gone');
  assert.equal(two.accents[20], true, 'loud hits copy too');
  assert.equal(two.notes[20], 7, 'and notes');
  assert.equal(two.clipId, 'kick');
  assert.deepEqual(lit(rows[0]), [0, 4, 20, 40], 'the old rows are untouched (Undo)');
  const [four] = multiplyRows([two], 32, 64);
  assert.deepEqual(lit(four), [0, 4, 16, 20, 32, 36, 48, 52], '2 bars doubled to 4');
  // A row stored with only 16 pills grows to hold the new bars.
  const [short] = multiplyRows([{ clipId: 'hat', steps: on(2).slice(0, 16), accents: [], notes: [] }], 16, 32);
  assert.equal(short.steps.length, 32);
  assert.deepEqual(lit(short), [2, 18]);
});

test('tap tempo: the median gap of the last taps, a beat per tap, kept in range', () => {
  const at = (gap, n, from = 0) => Array.from({ length: n }, (_, i) => from + i * gap);
  assert.equal(tapTempo(at(0.625, 2)), null, 'one gap is not enough');
  assert.equal(tapTempo(at(0.625, 3)), 96, 'three taps 0.625 s apart: 96 BPM');
  assert.equal(tapTempo(at(0.625, 3), 6), 144, '6/8: a tap is a dotted quarter');
  assert.equal(tapTempo([0, 0.6, 1.2, 2.2, 2.8]), 100, 'the median ignores one slow gap');
  assert.equal(tapTempo([0, 0.6, 0.65, 1.2, 1.8]), 100, 'a bounce under 0.25 s is ignored');
  assert.equal(tapTempo([0, 0.3, 5, 5.5, 6]), 120, 'a gap over 1.5 s starts again');
  assert.equal(tapTempo(at(0.2 + 0.1, 4)), 180, 'kept to 180');
  assert.equal(tapTempo(at(1.4, 4)), 60, 'kept to 60');
  assert.equal(tapTempo(at(60 / 99, 4), 4, { common: COMMON_BPMS }), 100, 'within 2 BPM of a common tempo: pulled to it');
  assert.equal(tapTempo(at(60 / 96, 4), 4, { common: COMMON_BPMS }), 96, 'further off: kept');
  assert.equal(tapTempo([0, 1, 2, 3, 4, 4.5, 5, 5.5]), 120, 'only the last 5 taps count (all of them: 60)');
});
