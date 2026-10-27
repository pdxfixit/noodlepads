// Per-row speed (advanced beats) and the hit timetable that both
// playback and Save as a sound follow.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRow, cleanPattern, stepSeconds, planHits, samePattern, pillTarget, ROW_RATES, STEPS, MAX_STEPS, MAX_PILLS, BAR_CHOICES, SIGNATURES, barSteps } from '../web/beat.js';

const on = (...steps) => Array.from({ length: STEPS }, (_, i) => steps.includes(i));
const beat = (rows, bpm = 120) => cleanPattern({ bpm, rows }, 'pip');
const times = (hits, row) => hits.filter((h) => h.row === row).map((h) => +h.time.toFixed(4));

test('cleanRow keeps known tempo fields and replaces anything else with the default', () => {
  assert.deepEqual(cleanRow({ clipId: 'x' }), { clipId: 'x', steps: on(), accents: on(), rate: 1, ring: false, muted: false, collapsed: false, melody: false, notes: Array(16).fill(null) });
  const r = cleanRow({ clipId: 'x', rate: 2, ring: true, length: 12, bpm: 140 });
  assert.deepEqual([r.rate, r.ring], [2, true]);
  assert.equal('length' in r || 'bpm' in r, false);    // pill count and BPM per row are gone
  const bad = cleanRow({ rate: 3, ring: 'yes' });
  assert.deepEqual([bad.rate, bad.ring], [1, false]);
  assert.ok(ROW_RATES.includes(1) && ROW_RATES.includes(2) && ROW_RATES.includes(0.5));
});

test('a beat saved before per-row tempo loads with every row at the defaults', () => {
  const old = cleanPattern({ bpm: 100, rows: [{ clipId: 'x', steps: on(0, 4) }] }, 'juno');
  assert.deepEqual(old.rows[0], { clipId: 'x', steps: on(0, 4), accents: on(), rate: 1, ring: false, muted: false, collapsed: false, melody: false, notes: Array(16).fill(null) });
  assert.equal(old.bars, 1);
});

test('step lengths: speed scales the beat, the simple beat maker ignores it', () => {
  const p = beat([], 120);                         // a quarter beat at 120 BPM is 0.125 s
  assert.equal(stepSeconds(p, cleanRow({ rate: 2 }), 'speed'), 0.0625);
  assert.equal(stepSeconds(p, cleanRow({ rate: 0.5 }), 'speed'), 0.25);
  assert.equal(stepSeconds(p, cleanRow({ rate: 2 }), 'plain'), 0.125);
});

test('planHits, speed mode: a 2× row hits twice as often as a 1× row', () => {
  const p = beat([{ clipId: 'a', steps: on(0, 8) }, { clipId: 'b', steps: on(0, 8), rate: 2 }]);
  const hits = planHits(p, 'speed', 2);            // one bar at 120 BPM is 2 s
  assert.deepEqual(times(hits, 0), [0, 1]);
  assert.deepEqual(times(hits, 1), [0, 0.5, 1, 1.5]);
});

test('samePattern notices a changed row setting, so the unsaved-beat prompt does too', () => {
  const a = beat([{ clipId: 'a', steps: on(0) }]);
  assert.ok(samePattern(a, beat([{ clipId: 'a', steps: on(0) }])));
  assert.ok(!samePattern(a, beat([{ clipId: 'a', steps: on(0), ring: true }])));
  assert.ok(!samePattern(a, beat([{ clipId: 'a', steps: on(0), rate: 2 }])));
});

// ── time signatures ──

test('each time signature has the pills a bar of it should', () => {
  assert.deepEqual(Object.fromEntries(Object.keys(SIGNATURES).map((k) => [k, barSteps(k)])),
    { '4/4': 16, '3/4': 12, '5/4': 20, '6/8': 12, '7/8': 14 });
  assert.equal(barSteps('nonsense'), 16);
  assert.ok(Object.keys(SIGNATURES).every((k) => barSteps(k) <= MAX_STEPS));
});

test('a row keeps 16 pills unless a longer bar used more, so old beats keep their shape', () => {
  assert.equal(cleanRow({ steps: on(0) }).steps.length, 16);
  const long = Array.from({ length: 20 }, (_, i) => i === 18);
  assert.equal(cleanRow({ steps: long }).steps.length, 20);
  assert.equal(cleanRow({ steps: long }).steps[18], true);
  assert.equal(cleanRow({ steps: Array(400).fill(true) }).steps.length, MAX_PILLS);
});

test('planHits in 3/4: a row starts over every 12 pills', () => {
  const p = beat([{ clipId: 'a', steps: on(0) }]);
  assert.deepEqual(times(planHits(p, 'plain', 4.5, 12), 0), [0, 1.5, 3]);   // 12 × 0.125 s
});

test('the simple beat maker ignores rows\' stored speed', () => {
  const p = beat([{ clipId: 'a', steps: on(0, 8), rate: 2 }]);
  assert.deepEqual(times(planHits(p, 'plain', 2), 0), [0, 1]);
});

// ── mute ──

test('a muted row keeps its pills but plays nothing, live or in Save as a sound', () => {
  const p = beat([{ clipId: 'a', steps: on(0, 8) }, { clipId: 'b', steps: on(0, 8), muted: true }]);
  assert.equal(p.rows[1].muted, true);
  assert.deepEqual(p.rows[1].steps, on(0, 8));
  const hits = planHits(p, 'plain', 2);
  assert.deepEqual(times(hits, 0), [0, 1]);
  assert.deepEqual(times(hits, 1), []);
  assert.equal(cleanRow({ muted: 'yes' }).muted, false);
  assert.ok(!samePattern(beat([{ clipId: 'a', steps: on(0) }]), beat([{ clipId: 'a', steps: on(0), muted: true }])));
});

// ── bars ──

test('a beat is 1, 2 or 4 bars; anything else, and beats saved before bars, are 1', () => {
  assert.deepEqual(BAR_CHOICES, [1, 2, 4]);
  assert.equal(cleanPattern({ bars: 2 }, 'x').bars, 2);
  assert.equal(cleanPattern({ bars: 3 }, 'x').bars, 1);
  assert.equal(cleanPattern({}, 'x').bars, 1);
  assert.equal(MAX_PILLS, MAX_STEPS * 4);
});

test('a 2-bar beat plays every pill of both bars, then starts over', () => {
  const steps = Array.from({ length: 32 }, (_, i) => i === 0 || i === 16);   // the first pill of each bar
  const p = cleanPattern({ bpm: 120, bars: 2, rows: [{ clipId: 'a', steps }] }, 'x');
  assert.deepEqual(times(planHits(p, 'plain', 8), 0), [0, 2, 4, 6]);          // a bar is 2 s: hits on each bar
  const one = cleanPattern({ bpm: 120, bars: 1, rows: [{ clipId: 'a', steps }] }, 'x');
  assert.deepEqual(times(planHits(one, 'plain', 8), 0), [0, 2, 4, 6]);       // 1 bar: pill 16 is beyond the beat, unplayed
  const onlyBar2 = cleanPattern({ bpm: 120, bars: 1, rows: [{ clipId: 'a', steps: Array.from({ length: 32 }, (_, i) => i === 16) }] }, 'x');
  assert.deepEqual(times(planHits(onlyBar2, 'plain', 8), 0), []);
});

test('changing the bars changes the beat, so the unsaved-beat prompt notices', () => {
  const rows = [{ clipId: 'a', steps: on(0) }];
  assert.ok(!samePattern(cleanPattern({ rows, bars: 1 }, 'x'), cleanPattern({ rows, bars: 2 }, 'x')));
});

test('End goes to the last pill of a long row', () => {
  assert.deepEqual(pillTarget('End', 0, 0, 1, () => 64), [0, 63]);
});

test('a collapsed row is kept, and collapsing is not an unsaved change', () => {
  assert.equal(cleanRow({ clipId: 'x', collapsed: true }).collapsed, true);
  assert.equal(cleanRow({ clipId: 'x', collapsed: 'yes' }).collapsed, false);
  assert.ok(samePattern(beat([{ clipId: 'a', steps: on(0) }]), beat([{ clipId: 'a', steps: on(0), collapsed: true }])));
});

test('loud hits: only a pill that is on can be loud, they play loud, and they count as a change', () => {
  const r = cleanRow({ clipId: 'a', steps: on(0, 4), accents: [true, false, true, false, true] });
  assert.deepEqual(r.accents.map((x, i) => (x ? i : -1)).filter((i) => i >= 0), [0, 4], 'pill 2 is off, so not loud');
  assert.equal(cleanRow({ steps: on(0), accents: ['yes'] }).accents[0], false);
  const p = beat([{ clipId: 'a', steps: on(0, 4), accents: on(4) }]);
  assert.deepEqual(planHits(p, 'plain', 0.6).map((h) => h.loud), [false, true]);
  assert.ok(!samePattern(beat([{ clipId: 'a', steps: on(0) }]), beat([{ clipId: 'a', steps: on(0), accents: on(0) }])));
});

test('swing plays the off-beat eighths late, by swing/100 of an eighth; the pills between move half as much', async () => {
  const { swingDelay, MAX_SWING } = await import('../web/beat.js');
  const dt = 0.125;   // 120 BPM: a pill (a sixteenth) is 0.125 s, an eighth 0.25 s
  const at = (n, swing, groups) => [...Array(n).keys()].map((step) => swingDelay(step, dt, swing, groups));
  assert.deepEqual(at(8, 0), [0, 0, 0, 0, 0, 0, 0, 0], 'straight');
  // Shuffle (50): the "and" (pill 2) waits half an eighth; pills 1 and 3 a quarter of one.
  assert.deepEqual(at(8, 50), [0, 0.0625, 0.125, 0.0625, 0, 0.0625, 0.125, 0.0625]);
  assert.deepEqual(at(4, 33).map((d) => Math.round(d * 1e4) / 1e4), [0, 0.0413, 0.0825, 0.0413], 'Swing (33) is the triplet feel: the "and" lands 2/3 of the way through the beat');
  assert.deepEqual(at(24, 50, [6, 6]).slice(0, 12), [0, 0.0625, 0, 0.0625, 0, 0.0625, 0, 0.0625, 0, 0.0625, 0, 0.0625], '6/8 groups of 6: only odd pills move, as before');
  assert.deepEqual(at(14, 50, SIGNATURES['7/8']).slice(8), [0, 0.0625, 0, 0.0625, 0, 0.0625], '7/8: its 6-pill group is left rolling');
  assert.deepEqual(at(12, 50, SIGNATURES['3/4']).slice(4, 8), [0, 0.0625, 0.125, 0.0625], '3/4: beats of 4');
  assert.equal(cleanPattern({ swing: 99 }, 'pip').swing, MAX_SWING);
  assert.equal(cleanPattern({ swing: 'lots' }, 'pip').swing, 0);
});

test('planHits swings eighth-note hats and sixteenth-note hats, and only when asked', () => {
  const eighths = beat([{ clipId: 'a', steps: on(0, 2, 4, 6) }]);               // 120 BPM: a pill is 0.125 s
  assert.deepEqual(times(planHits(eighths, 'plain', 0.9, 16, 40), 0), [0, 0.25 + 0.1, 0.5, 0.75 + 0.1], 'the "and" of each beat is 40% of an eighth late');
  assert.deepEqual(times(planHits(eighths, 'plain', 0.9), 0), [0, 0.25, 0.5, 0.75], 'straight unless asked');
  const sixteenths = beat([{ clipId: 'a', steps: on(0, 1, 2, 3, 4) }]);
  const swung = times(planHits(sixteenths, 'plain', 0.6, 16, 50), 0);
  assert.deepEqual(swung, [0, 0.1875, 0.375, 0.4375, 0.5], 'each beat bounces long-long-short-short; none lands on another');
  assert.deepEqual(times(planHits(eighths, 'plain', 0.9, 12, 50, SIGNATURES['6/8']), 0).slice(0, 2), [0, 0.25], '6/8 pill 2 stays put');
  assert.ok(!samePattern(eighths, { ...eighths, swing: 20 }));
});

test('an old melody row (a note per pill from the five-note scale) is read as notes a pill long, played at that pitch', async () => {
  const { MELODY_NOTES } = await import('../web/notes.js');
const { noteRate } = await import('../web/beat.js');
  const r = cleanRow({ clipId: 'a', melody: true, steps: on(0, 4, 8), notes: [7, null, 3, null, 12, null, null, null, 99] });
  assert.equal(r.melody, true);
  assert.deepEqual(r.tune, [{ p: 7, s: 0, l: 1 }, { p: 12, s: 4, l: 1 }, { p: 0, s: 8, l: 1 }], 'an off-scale note played the sound as itself, and still does');
  assert.deepEqual([r.notes[0], r.notes[4], r.notes[8], r.notes[2]], [7, 12, 0, null], 'the per-pill notes an older copy reads');
  assert.equal(cleanRow({ clipId: 'a' }).melody, false);
  assert.deepEqual(MELODY_NOTES.length, 8);
  assert.equal(noteRate(12), 2);
  assert.equal(noteRate(0), 1);
  const p = beat([{ clipId: 'a', melody: true, steps: on(0, 4), notes: [7, null, null, null, 12] }]);
  assert.deepEqual(planHits(p, 'plain', 0.6).map((h) => h.note), [7, 12]);
  assert.ok(!samePattern(p, beat([{ clipId: 'a', melody: true, steps: on(0, 4), notes: [7, null, null, null, 14] }])), 'a changed note is a change');
});
