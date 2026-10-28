// 🥁 Make a beat (🎤 Live's take card): a take's hits laid on a beat's grid.
// Pure rules, no screen: the take card (dj-takes.js) hands a take in and
// the beat maker (sequencer.js openMade) takes the result. Each hit snaps to
// the nearest sixteenth at one tempo: the take's own (the ⏲️ Click track's,
// kept with the take when it was on), else the tempo whose grid the hits sit
// nearest. One row per sound, in the order the sounds were first played; the
// take's first hit is the beat's "1".

import { STEPS, MAX_ROWS, MIN_BPM, MAX_BPM, DEFAULT_BPM, BAR_CHOICES, STEPS_PER_BEAT } from './beat.js';

// How much a tempo far from the usual one costs against a better fit: a
// finer grid always fits a little better, so without it every take would
// pick the fastest tempo.
const FAR_COST = 0.0008;

// The tempo (whole BPM, MIN_BPM to MAX_BPM) whose sixteenths the hit times
// (seconds from the first hit) sit nearest. Each hit's miss is measured in
// pills, so a coarse grid is not rewarded; ties go to the tempo nearest
// `around`. Fewer than two hits say nothing, so `around`.
export function bestTempo(times, { around = DEFAULT_BPM } = {}) {
  if (times.length < 2) return around;
  let best = around;
  let bestCost = Infinity;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm++) {
    const step = 60 / bpm / STEPS_PER_BEAT;
    let miss = 0;
    for (const t of times) { const x = t / step; miss += Math.abs(x - Math.round(x)); }
    const cost = miss / times.length + Math.abs(bpm - around) * FAR_COST;
    if (cost < bestCost) { bestCost = cost; best = bpm; }
  }
  return best;
}

// A take as a beat: `{bpm, bars, signature, rows: [{clipId, steps}], dropped}`
// ready for sequencer.js cleanPattern, or null when the take has no hit of a
// sound `has` knows. `bpm` is the take's own tempo, the Click track's when it
// was on while the take was made (an older take has none: found by bestTempo). The beat is 1, 2 or 4 bars (BAR_CHOICES): the take's
// length up to its last hit, rounded up; a longer take keeps its first 4
// bars. `dropped` counts the hits left out: past bar 4, or on a row over the
// limit. Only hits are used: loops, stops and the beat under the take are left out.
export function beatFromTake(take, { bpm = take.bpm ?? null, has = () => true } = {}) {
  const hits = take.events.filter((e) => e.kind === 'hit' && has(e.clipId));
  if (!hits.length) return null;
  const tempo = Number.isFinite(bpm) && bpm > 0
    ? Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)))
    : bestTempo(hits.map((h) => h.t));
  const step = 60 / tempo / STEPS_PER_BEAT;
  const placed = hits.map((h) => ({ clipId: h.clipId, n: Math.round(h.t / step) }));
  const last = Math.max(...placed.map((h) => h.n));
  const barsNeeded = Math.ceil((last + 1) / STEPS);
  const bars = BAR_CHOICES.find((b) => b >= barsNeeded) ?? BAR_CHOICES.at(-1);
  const total = bars * STEPS;
  const rows = [];
  let dropped = 0;
  for (const { clipId, n } of placed) {
    if (n >= total) { dropped++; continue; }
    let row = rows.find((r) => r.clipId === clipId);
    if (!row) {
      if (rows.length >= MAX_ROWS) { dropped++; continue; }
      row = { clipId, steps: Array.from({ length: total }, () => false) };
      rows.push(row);
    }
    row.steps[n] = true;
  }
  return { bpm: tempo, bars, signature: '4/4', rows, dropped };
}
