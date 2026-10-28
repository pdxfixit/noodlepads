// 🥁 Make a beat (🎤 Live's take card): a take's hits laid on a beat's grid.
// Pure rules, no screen: the take card (dj-takes.js) hands a take in and
// the beat maker (sequencer.js openMade) takes the result. Each hit snaps to
// the nearest sixteenth at one tempo: the take's own (the ⏲️ Click track's,
// kept with the take when it was on), else the tempo whose grid the hits sit
// nearest. One row per sound, in the order the sounds were first played; the
// take's first hit is the beat's "1". docs/formats.md writes the rules out
// for v2, which must make the same beat from the same take.

import { STEPS, MAX_ROWS, MIN_BPM, MAX_BPM, DEFAULT_BPM, BAR_CHOICES, STEPS_PER_BEAT } from './beat.js';

// The cost of a tempo, per hit, in pills (one sixteenth): the miss to the
// nearest pill, plus QUARTER_COST for a hit not on a quarter (pill number not
// a multiple of 4) and EIGHTH_COST more for one not on an eighth (an odd
// pill). Steady playing sits on the quarters and eighths of its own tempo,
// while a tempo that is 3/4 or 1/2 of it fits the same hits just as well,
// only on odd pills (quarters at 120 fit 90 BPM exactly, as every third
// pill): the costs make the beat's own tempo the cheaper. Tuned on seeded
// takes with hits up to 40 ms early or late (tests/take-beat.test.mjs).
export const QUARTER_COST = 0.3;
export const EIGHTH_COST = 0.3;
// A tempo's pull toward `around`: a finer grid always fits a little better,
// so without it every take would pick the fastest tempo. Per BPM away.
export const FAR_COST = 0.0008;

// The tempo (whole BPM) whose sixteenths the hit times (seconds from the
// first hit, so the first is 0) sit best on. Scan every whole BPM from
// MIN_BPM up to MAX_BPM; a tempo's pill is 60 / bpm / 4 seconds (STEPS_PER_BEAT);
// each hit goes to pill n = Math.round(t / pill) (half up); the tempo's cost is
// the mean over the hits of (|t / pill - n| + the odd-pill costs above) plus
// FAR_COST * |bpm - around|. The lowest cost wins, and the first tempo scanned
// (the lowest BPM) keeps an exact tie (a strict "less than"). Fewer than two
// hits say nothing, so `around`.
export function bestTempo(times, { around = DEFAULT_BPM } = {}) {
  if (times.length < 2) return around;
  let best = around;
  let bestCost = Infinity;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm++) {
    const pill = 60 / bpm / STEPS_PER_BEAT;
    let sum = 0;
    for (const t of times) {
      const x = t / pill;
      const n = Math.round(x);
      sum += Math.abs(x - n) + (n % 4 !== 0 ? QUARTER_COST : 0) + (n % 2 !== 0 ? EIGHTH_COST : 0);
    }
    const cost = sum / times.length + Math.abs(bpm - around) * FAR_COST;
    if (cost < bestCost) { bestCost = cost; best = bpm; }
  }
  return best;
}

// A take as a beat: `{bpm, bars, signature: '4/4', swing: 0, rows: [{clipId, steps}], dropped, merged}`
// ready for sequencer.js cleanPattern, or null when the take has no hit of a
// sound `has` knows. Only `hit` events count (loops, stops and the beat under
// the take are left out). Times are measured from the first of those hits,
// which is the beat's pill 0 (a take's own zero can be an earlier loop or
// stop, rhythm.js takeFrom). `bpm` is the take's own tempo, the Click track's
// when it was on while the take was made (an older take has none: bestTempo).
// Each hit goes to pill n = Math.round(t / (60 / bpm / 4)), half up. The beat
// is 4/4 and straight (swing 0: a swung beat's playing does not move the pills
// a take was snapped to). Bars: ceil((last pill + 1) / 16), up to the next of
// BAR_CHOICES (1, 2, 4), so a longer take keeps its first 4 bars. One row per
// sound in the order its first hit came, at most MAX_ROWS (16). `dropped`
// counts the hits left out (a pill past the last bar, or a 17th sound);
// `merged` the hits that landed on a pill their row already had.
export function beatFromTake(take, { bpm = take.bpm ?? null, has = () => true } = {}) {
  const hits = take.events.filter((e) => e.kind === 'hit' && has(e.clipId));
  if (!hits.length) return null;
  const first = Math.min(...hits.map((h) => h.t));
  const at = hits.map((h) => ({ clipId: h.clipId, t: h.t - first }));
  const tempo = Number.isFinite(bpm) && bpm > 0
    ? Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)))
    : bestTempo(at.map((h) => h.t));
  const pill = 60 / tempo / STEPS_PER_BEAT;
  const placed = at.map((h) => ({ clipId: h.clipId, n: Math.round(h.t / pill) }));
  const last = Math.max(...placed.map((h) => h.n));
  const barsNeeded = Math.ceil((last + 1) / STEPS);
  const bars = BAR_CHOICES.find((b) => b >= barsNeeded) ?? BAR_CHOICES.at(-1);
  const total = bars * STEPS;
  const rows = [];
  let dropped = 0;
  let merged = 0;
  for (const { clipId, n } of placed) {
    if (n >= total) { dropped++; continue; }
    let row = rows.find((r) => r.clipId === clipId);
    if (!row) {
      if (rows.length >= MAX_ROWS) { dropped++; continue; }
      row = { clipId, steps: Array.from({ length: total }, () => false) };
      rows.push(row);
    }
    if (row.steps[n]) merged++;
    row.steps[n] = true;
  }
  return { bpm: tempo, bars, signature: '4/4', swing: 0, rows, dropped, merged };
}
