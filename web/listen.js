// 🎧 From a song's listener (docs/design/beat-from-a-song.md, "How listening
// works"): fed a song's samples as it plays, it finds the tempo, the bar
// lines, the time signature and swing, writes what the kick, snare and hats
// play on a grid of sixteenths, and splits the song into parts. No DOM, no
// Web Audio, no storage: plain functions over Float32Array samples, so
// node --test runs it. The hits come from web/listen-dsp.js. Only hits and
// their timing are kept, never the audio, so it can listen to a whole song.
//
// The contract the screens build on:
//
//   createListener({ sampleRate }) → listener
//   listener.feed(samples)   mono Float32Array frames, any length, in order
//   listener.snapshot() → {
//     status: 'finding-tempo' | 'listening',
//     seconds,                         audio heard so far
//     bpm, signature, swing,           the part playing now (bpm and
//                                      signature null until found; swing
//                                      0 | 33 | 50, the app's Straight,
//                                      Swing and Shuffle)
//     parts: [{ id: 'A', bpm, signature, swing, bars }],
//     current: { partId, bar, step, recent: { kick, snare, hat } },
//       partId null while the first part is being worked out; bar 1-based,
//       counted over the whole song; step 0-based within the bar; recent
//       holds the last 3 bars, oldest first (none while finding the
//       tempo), each Bar one cell per step: 0 silence, 1 a one-off hit, 2 a
//       hit that fits the part's pattern, -1 not played yet
//     tempoChange: null | { atBar, from, to },   the latest one
//   }
//   listener.finish() → {
//     seconds,
//     parts: [{ id, bpm, signature, swing, bars: 1 | 2 | 4,
//               steps: { kick, snare, hat },   boolean[], bars × steps per bar
//               prints: { kick, snare, hat } }],  fingerprints of the row's
//                                                 hits, or null
//     order: [{ partId, startBar, bars }],   every stretch, in song order;
//                                            a part that comes back again
//     tempos: [{ bar, bpm }],                song bars (>= 2) where the
//                                            tempo changed
//   }
//   finish()'s part ids run A, B, C in the order first heard, with no gap:
//   two parts found alike at the end become one, so a later part's letter
//   may differ from the one snapshot() gave it. A snapshot after finish()
//   lists finish()'s parts.
//   fingerprint(samples, sampleRate) → Float32Array, a sound's shape
//   closestSound(print, [{ id, print }]) → the closest id
//
// Steps per bar follow the time signature as web/sequencer.js does (a pill
// is always a sixteenth, BPM counts quarter notes), and the tempo stays in
// the app's beat tempo range, halved or doubled to fit.
//
// How (the design's steps 1-7):
// 1. Hits: listen-dsp.js.
// 2. Tempo: the autocorrelation of all rows' hits, read at a sixteenth and
//    its multiples, picks the sixteenth's length; the beat falls where kick
//    and snare hit. A line fitted through recent hits on the eighths keeps
//    the grid on a drifting drummer, since a hit is placed by beat, never by
//    second.
// 3. The grid: each hit snaps to the nearest sixteenth; an off-beat
//    sixteenth may land late (swing). The time signature is the best fit of
//    the five: how the pattern repeats bar to bar, kick and snare on the
//    beats, a kick on the one.
// 4. Parts: when hits stop landing on the grid for about a bar, the tempo
//    changed: the bars from there are dropped, and a new part starts where
//    the new tempo is found. At a steady tempo, a part ends when 2 bars in
//    a row don't match it (one odd bar is a fill). A new part is compared
//    with every earlier part and reuses one it matches.
// 5. A part's bars vote: a hit that comes back bar after bar stays, a
//    one-off goes. Its beat is 1, 2 or 4 bars, however long it repeats.
// 6. Sounds: each row's hits' fingerprints, for the screens to match.
// 7. Swing: how late the off-beat sixteenths land.
//
// A bar is settled (its part decided) 1.5 bars after it ends, so a tempo
// change found late never leaves a bar in the wrong part.

import { SIGNATURES, barSteps, tempoStops, MAX_PILLS } from './sequencer.js';
import { createHitFinder, fingerprint, closestSound, averagePrint, ROWS } from './listen-dsp.js';

export { fingerprint, closestSound };

const STOPS = tempoStops();
export const MIN_BPM = STOPS[0];
export const MAX_BPM = STOPS.at(-1);
export const SWINGS = [0, 33, 50];

const ROW_WEIGHT = [1, 1, 0.5];       // a row's say in comparing bars, and in fitting the grid
const SEEK_AFTER = 3;                 // seconds of hits before guessing a tempo
const SEEK_EVERY = 0.5;               // ... then a guess this often
const SEEK_WINDOW = 8;                // ... from at most this many seconds back
const AGREE = 0.025;                  // two guesses this close in a row lock the tempo
const METER_STEPS = 64;               // sixteenths heard before choosing the time signature
const FIT = 0.2;                      // a hit this close to its line (in sixteenths) fits
const LOST = 0.5;                     // under this share of hits fitting for a bar, the tempo changed
const MATCH = 0.8;                    // a bar this like its part's pattern belongs to it
const SETTLE = 1.5;                   // bars after a bar ends before its part is decided
const ANCHORS = 32;                   // hits the grid's line is fitted through
const ANCHOR_HALF = 12;               // ... each counting half as much this many sixteenths back
const DRIFT_MARK = 0.06;              // a drift this far from the last tempo makes a tempo mark
// How likely each signature is before hearing anything: most songs are 4/4.
const METER_PRIOR = { '4/4': 0.06, '3/4': 0, '6/8': 0, '5/4': -0.04, '7/8': -0.04 };

const median = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
// The app's swing for a median lateness (in sixteenths) of off-beats.
const swingFor = (late) => (late === null ? 0 : late < 0.165 ? 0 : late < 0.415 ? 33 : 50);
const partName = (n) => (n < 26 ? String.fromCharCode(65 + n) : partName(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26)));
// Group starts within a bar: [0, 4, 8, 12] for 4/4, [0, 6] for 6/8.
const groupStarts = (sig) => SIGNATURES[sig].reduce((out, g) => [...out, out.at(-1) + g], [0]).slice(0, -1);
const emptyCells = (B) => ROWS.map(() => new Uint8Array(B));

// The app's tempo for a sixteenth s seconds long: whole BPM within the
// beat tempo range, halved or doubled to fit. null for a length that is no
// tempo (none, zero or endless), which would otherwise halve forever.
export function bpmFor(s) {
  let bpm = 15 / s;
  if (!(Number.isFinite(bpm) && bpm > 0)) return null;
  while (bpm > MAX_BPM + 0.5) bpm /= 2;
  while (bpm < MIN_BPM - 0.5) bpm *= 2;
  return Math.round(clamp(bpm, MIN_BPM, MAX_BPM));
}

// How alike two bars are (rows of cells), from 1 (the same) down: the
// cells that differ, weighted by row, against an allowance for a hit
// missed or heard wrong (1.5, or an eighth of the hits in a busy bar). At
// the allowance it is MATCH; two kicks more is a different bar, a missed
// hat is not. A hat on a step where both bars have a snare is not counted:
// listen-dsp.js cannot always hear a quiet hat inside a snare.
export function barLikeness(a, b) {
  let diff = 0;
  let union = 0;
  for (let r = 0; r < ROWS.length; r++) {
    const x = a[r];
    const y = b[r];
    for (let i = 0; i < x.length; i++) {
      if (r === 2 && a[1][i] && b[1][i]) continue;
      if (x[i] || y[i]) union += ROW_WEIGHT[r];
      if (!x[i] !== !y[i]) diff += ROW_WEIGHT[r];
    }
  }
  const allow = Math.max(1.5, 0.12 * union);
  const like = diff <= allow ? 1 - ((1 - MATCH) * diff) / allow : (MATCH * allow) / diff;
  return Math.round(like * 1e9) / 1e9;   // so the allowance itself is MATCH, not a hair under
}

// The cells hit in at least half of `bars` (all of them when two), or
// null for none: one-offs go.
function vote(bars, B) {
  if (!bars.length) return null;
  const n = bars.length;
  const need = n <= 1 ? 1 : Math.max(2, Math.ceil(n / 2));
  const out = emptyCells(B);
  for (let r = 0; r < ROWS.length; r++) {
    for (let i = 0; i < B; i++) {
      let c = 0;
      for (const b of bars) c += b.cells[r][i];
      out[r][i] = c >= need ? 1 : 0;
    }
  }
  return out;
}

// A steady hat stream (every sixteenth, eighth or beat) with gaps only
// where the snare hits had its hat hidden by the snare (listen-dsp.js
// cannot tell a quiet hat inside a loud snare): fill those gaps.
export function fillHats(cells, B) {
  const [, snare, hat] = cells;
  for (const p of [1, 2, 4]) {
    for (let o = 0; o < p; o++) {
      const lattice = [];
      for (let i = o; i < B; i += p) lattice.push(i);
      const missing = lattice.filter((i) => !hat[i]);
      if (!missing.length || lattice.length - missing.length < 0.6 * lattice.length || missing.length > lattice.length / 3) continue;
      if (!missing.every((i) => snare[i])) continue;
      for (const i of missing) hat[i] = 1;
      return cells;
    }
  }
  return cells;
}

// The time signature and the bar's first sixteenth that best fit rows of
// hits x (x[row][i], i from 0 = a beat) between sixteenths `from` and
// `to`. Simple meters start a bar on a beat (a multiple of 4); 6/8 and 7/8
// on an eighth. Where a groove reads the same from either half of the bar
// (kick on 1 and 3), the song's first strong kick (sixteenth `firstKick`)
// is taken as a one.
export function chooseMeter(x, from, to, firstKick = from) {
  const len = to - from;
  const likeAt = (lag) => {
    let ab = 0, aa = 0, bb = 0;
    for (let r = 0; r < ROWS.length; r++) {
      for (let i = from; i + lag < to; i++) {
        const a = x[r][i] || 0;
        const b = x[r][i + lag] || 0;
        ab += ROW_WEIGHT[r] * a * b; aa += ROW_WEIGHT[r] * a * a; bb += ROW_WEIGHT[r] * b * b;
      }
    }
    return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
  };
  let best = null;
  for (const sig of Object.keys(SIGNATURES)) {
    const B = barSteps(sig);
    if (len < B + 4) continue;
    const repeat = len >= 2 * B + 8 ? 0.5 * likeAt(B) + 0.5 * likeAt(2 * B) : likeAt(B);
    const starts = groupStarts(sig);
    const step = sig === '6/8' || sig === '7/8' ? 2 : 4;
    for (let o = 0; o < B; o += step) {
      let onGroups = 0, beats = 0, ones = 0, bars = 0;
      for (let i = from; i < to; i++) {
        const pos = (((i - o) % B) + B) % B;
        const ks = (x[0][i] || 0) + (x[1][i] || 0);
        beats += ks;
        if (starts.includes(pos)) onGroups += ks;
        if (pos === 0) { bars++; ones += x[0][i] || 0; }
      }
      const score = repeat + 0.25 * (beats ? onGroups / beats : 0) + 0.15 * (bars ? ones / bars : 0)
        + METER_PRIOR[sig] + ((((firstKick - o) % B) + B) % B === 0 ? 0.05 : 0);
      if (!best || score > best.score + 1e-9) best = { signature: sig, B, offset: o, score };
    }
  }
  return best;
}

export function createListener({ sampleRate } = {}) {
  if (!(sampleRate > 0)) throw new Error('createListener needs a sampleRate');
  const hits = [];
  const finder = createHitFinder(sampleRate, (h) => { hits.push(h); if (seg) place(h); });
  let heard = 0;                     // samples fed
  let seg = null;                    // the stretch of song at one locked tempo
  let seekFrom = 0;
  let guess = null;
  let nextGuess = 0;
  let nextBar = 1;                   // the song bar a new segment starts at
  const parts = [];
  const order = [];                  // stretches: { part, startBar, bars: [] }
  const settled = [];                // every settled bar, in order
  let cur = null;                    // { part, stretch }
  let pending = [];                  // odd bars not yet given to a part
  let tempoChange = null;
  let lastBpm = null;
  let result = null;

  // ---- 2. Tempo -----------------------------------------------------------

  // The sixteenth's length in seconds that best explains the hits from t0
  // to t1, or null when nothing repeats.
  function guessTempo(t0, t1) {
    const f0 = finder.frameAt(t0);
    const x = finder.env.slice(f0, finder.frameAt(t1));
    const N = x.length;
    const fr = finder.frameRate;
    const sMin = (15 / MAX_BPM) * fr;
    const sMax = (15 / MIN_BPM) * fr;
    const terms = [[1, 0.4], [2, 1], [4, 1]];
    if (8 * sMax < N / 2) terms.push([8, 0.5]);
    const maxLag = Math.ceil(terms.at(-1)[0] * sMax) + 2;
    if (N < 2 * maxLag) return null;
    let mean = 0;
    for (let i = 0; i < N; i++) mean += x[i];
    mean /= N;
    for (let i = 0; i < N; i++) x[i] -= mean;
    const r = new Float64Array(maxLag + 1);
    for (let l = 0; l <= maxLag; l++) {
      let sum = 0;
      for (let i = 0; i + l < N; i++) sum += x[i] * x[i + l];
      r[l] = sum / (N - l);
    }
    if (!(r[0] > 0)) return null;
    const at = (lag) => { const i = Math.floor(lag); const f = lag - i; return ((1 - f) * r[i] + f * r[i + 1]) / r[0]; };
    const weight = terms.reduce((s, [, w]) => s + w, 0);
    const salience = (s) => terms.reduce((sum, [m, w]) => sum + w * at(m * s), 0) / weight;
    // Most songs sit near 110 BPM: between a tempo and its double, lean
    // toward the one nearer.
    const prior = (s) => Math.exp(-0.5 * (Math.log2(15 * fr / s / 110) / 0.9) ** 2);
    let best = null;
    const step = 0.05;
    const score = [];
    for (let s = sMin; s <= sMax; s += step) score.push(salience(s) * prior(s));
    let bi = 0;
    for (let i = 1; i < score.length; i++) if (score[i] > score[bi]) bi = i;
    if (!(salience(sMin + bi * step) > 0.12)) return null;
    let s = sMin + bi * step;
    if (bi > 0 && bi < score.length - 1) {
      const [a, b, c] = [score[bi - 1], score[bi], score[bi + 1]];
      const den = a - 2 * b + c;
      if (den < 0) s += step * clamp((0.5 * (a - c)) / den, -0.5, 0.5);
    }
    // Half or double speed is the common miss. Read at half speed, half the
    // kicks and snares fall between the beats; at the right speed they sit
    // on them.
    for (const c of [s, s / 2, s * 2]) {
      if (c < sMin - 1e-9 || c > sMax + 1e-9) continue;
      const on = onBeats(c / fr, t0, t1);
      const sc = salience(c) * prior(c) * on * on;
      if (!best || sc > best.score) best = { s: c / fr, score: sc };
    }
    return best;
  }

  // The share of snare hits (by strength) on the quarter notes, for
  // sixteenth s, with the beats where kick and snare fit best: a backbeat
  // is on the beat. Kicks count only when there are few snares, since a
  // kick between the beats is common.
  function onBeats(s, from, to) {
    const phi = beatPhase(s, from, to);
    const share = (rows) => {
      let on = 0;
      let all = 0;
      let count = 0;
      for (const h of hits) {
        if (h.t < from || h.t > to || !rows.includes(h.row)) continue;
        const u = (h.t - phi) / s;
        all += h.w;
        count++;
        if (Math.abs(u - 4 * Math.round(u / 4)) <= 0.5) on += h.w;
      }
      return count >= 3 ? on / all : null;
    };
    return share([1]) ?? share([0, 1]) ?? 1;
  }

  // Where the beats fall for sixteenth s: the phase that puts kick and
  // snare hits nearest the quarter notes.
  function beatPhase(s, from, to) {
    const near = hits.filter((h) => h.t >= from && h.t <= to);
    const rowW = [1, 0.8, 0.15];
    const score = (phi) => near.reduce((sum, h) => {
      const u = (h.t - phi) / s;
      const d = u - 4 * Math.round(u / 4);
      return sum + rowW[h.row] * h.w * Math.exp(-((d / 0.25) ** 2));
    }, 0);
    let best = 0;
    let bestScore = -1;
    for (let k = 0; k < 64; k++) {
      const phi = from + (k / 16) * s;
      const sc = score(phi);
      if (sc > bestScore) { bestScore = sc; best = phi; }
    }
    for (let k = -8; k <= 8; k++) {
      const phi = best + (k / 128) * s;
      const sc = score(phi);
      if (sc > bestScore) { bestScore = sc; best = phi; }
    }
    return best;
  }

  function seek(now, final = false) {
    if (now < nextGuess && !final) return;
    nextGuess = now + SEEK_EVERY;
    const first = hits.find((h) => h.t >= Math.max(seekFrom, now - SEEK_WINDOW));
    if (!first || (now - first.t < SEEK_AFTER && !(final && now - first.t > 2))) return;
    const g = guessTempo(Math.max(0, first.t - 0.05), now);
    if (!g) { guess = null; return; }
    if (final || (guess && Math.abs(g.s / guess.s - 1) < AGREE)) lock(g.s, first.t, now);
    else guess = g;
  }

  // The tempo is found: a new segment, its grid through the hits so far.
  function lock(s, from, now) {
    const phi = beatPhase(s, from, now);
    const a = phi + 4 * s * Math.floor((from - phi) / (4 * s) + 1e-6);
    seg = {
      from, lockedAt: now, firstBar: nextBar, grid: { a, s, s0: s, anchors: [] },
      iStart: 0, meter: null, bars: new Map(), committed: -1, fits: [], offs: [], hits: [],
    };
    // Fit the line through every hit since `from`, twice (the second
    // placing them with the first's line).
    for (let pass = 0; pass < 2; pass++) {
      const anchors = [];
      for (const h of hits) {
        if (h.t < from - 0.02) continue;
        const u = (h.t - seg.grid.a) / seg.grid.s;
        const e = 2 * Math.round(u / 2);
        if (Math.abs(u - e) <= 0.25) anchors.push({ i: e, t: h.t, w: h.w * ROW_WEIGHT[h.row] });
      }
      fitLine(anchors, () => 1);
    }
    for (const h of hits) if (h.t >= from - 0.02) place(h);
    seg.iStart = Math.max(0, Math.min(...seg.hits.map((h) => h.i)));
    guess = null;
  }

  // Weighted least squares of t = a + s·i through anchors; kept within 10%
  // of the tempo at the last settled bar (a sudden bigger change is a tempo
  // change, found by hits not fitting).
  function fitLine(anchors, weightOf) {
    let sw = 0, si = 0, st = 0, sii = 0, sit = 0;
    for (const p of anchors) {
      const w = p.w * weightOf(p);
      sw += w; si += w * p.i; st += w * p.t; sii += w * p.i * p.i; sit += w * p.i * p.t;
    }
    const den = sw * sii - si * si;
    if (anchors.length < 6 || !(den > 0)) return;
    const s = (sw * sit - si * st) / den;
    if (!(Math.abs(s / seg.grid.s0 - 1) < 0.1)) return;
    seg.grid.s = s;
    seg.grid.a = (st - s * si) / sw;
  }

  function refit() {
    const list = seg.grid.anchors.slice(-ANCHORS);
    const last = list.at(-1).i;
    const span = last - list[0].i;
    if (span < 8) return;
    fitLine(list, (p) => 0.5 ** ((last - p.i) / ANCHOR_HALF));
  }

  // The swing heard so far in this segment, as a lateness in sixteenths
  // (0, 1/3 or 1/2), or null with too few off-beats to tell.
  function segSwing() {
    const recent = seg.offs.slice(-64);
    return recent.length >= 6 ? swingFor(median(recent)) / 100 : null;
  }

  // ---- 3. The grid ---------------------------------------------------------

  // A hit's sixteenth (i), how late it is if an off-beat (off), whether it
  // fits the grid, and its bar once the time signature is known.
  function place(h) {
    const g = seg.grid;
    const u = (h.t - g.a) / g.s;
    const e = 2 * Math.floor(u / 2);
    const d = u - e;
    let dev = null;
    let off = null;
    if (d < 0.5) { h.i = e; dev = d; } else if (d >= 1.75) { h.i = e + 2; dev = d - 2; } else { h.i = e + 1; off = d - 1; }
    h.off = off;
    h.seg = seg;
    seg.hits.push(h);
    const sw = segSwing();
    const ok = off === null ? Math.abs(dev) <= FIT : sw === null ? off > -FIT && off < 0.5 + FIT : Math.abs(off - sw) <= FIT;
    seg.fits.push({ t: h.t, w: h.w, ok });
    if (off === null && Math.abs(dev) <= 0.25) {
      g.anchors.push({ i: h.i, t: h.t, w: h.w * ROW_WEIGHT[h.row] });
      if (g.anchors.length > ANCHORS * 2) g.anchors.splice(0, ANCHORS);
      refit();
    }
    if (off !== null) { seg.offs.push(off); if (seg.offs.length > 256) seg.offs.splice(0, 128); }
    if (seg.meter) toBar(h);
  }

  const timeOf = (i) => seg.grid.a + seg.grid.s * i;

  function toBar(h) {
    const { B, D } = seg.meter;
    const k = Math.floor((h.i - D) / B);
    if (k < 0 || k <= seg.committed) return;
    let bar = seg.bars.get(k);
    if (!bar) { bar = { k, cells: emptyCells(B), hits: [], offs: [] }; seg.bars.set(k, bar); }
    bar.cells[h.row][h.i - D - k * B] = 1;
    bar.hits.push(h);
    bar.s = seg.grid.s;                 // the tempo as the bar played
    if (h.off !== null) bar.offs.push(h.off);
  }

  function chooseSegMeter(now, final = false) {
    const iNow = Math.floor((now - seg.grid.a) / seg.grid.s);
    if (iNow - seg.iStart < (final ? 24 : METER_STEPS)) return;
    const x = ROWS.map(() => []);
    for (const h of seg.hits) if (h.i >= seg.iStart && h.i < iNow) x[h.row][h.i] = 1;
    const kick = seg.hits.find((h) => h.row === 0 && h.w >= 0.6 && h.i >= seg.iStart);
    const m = chooseMeter(x, seg.iStart, iNow, kick ? kick.i : seg.iStart);
    if (!m) return;
    // The first bar line at or after the first hit (a hit just before it,
    // a pickup, is dropped).
    const D = seg.iStart - 1 + ((((m.offset - seg.iStart + 1) % m.B) + m.B) % m.B);
    seg.meter = { signature: m.signature, B: m.B, D };
    for (const h of seg.hits) toBar(h);
    const bpm = bpmFor(seg.grid.s);
    if (lastBpm !== null && Math.abs(bpm / lastBpm - 1) >= 0.03) tempoChange = { atBar: seg.firstBar, from: lastBpm, to: bpm };
  }

  // ---- 4. Parts --------------------------------------------------------------

  function settle(now, force = false) {
    const { B, D } = seg.meter;
    for (;;) {
      const k = seg.committed + 1;
      const end = timeOf(D + (k + 1) * B);
      if (force ? end > now + 0.5 * seg.grid.s : end + SETTLE * B * seg.grid.s > now) break;
      const raw = seg.bars.get(k) || { cells: emptyCells(B), hits: [], offs: [] };
      seg.bars.delete(k - 4);
      seg.committed = k;
      // A gradual change is followed: the line may move 10% from here on.
      seg.grid.s0 = seg.grid.s;
      const bar = {
        song: seg.firstBar + k, signature: seg.meter.signature, B, cells: raw.cells, hits: raw.hits, offs: raw.offs,
        tempo: 15 / (raw.s || seg.grid.s), seg, rest: raw.hits.length === 0, part: null, pos: 0, voting: false,
      };
      settled.push(bar);
      addBar(bar);
    }
  }

  function proto(part, c, j, all = false) {
    let voters = part.voters.filter((v) => v.pos % c === j);
    if (!all) voters = voters.slice(-16);
    return vote(voters, part.B);
  }

  // How well a bar fits a part at position pos of a stretch, or at any
  // position (pos null), over its 1, 2 and 4 bar patterns.
  function fitness(part, bar, pos) {
    if (part.signature !== bar.signature) return 0;
    let best = 0;
    for (const c of [1, 2, 4]) {
      for (let j = 0; j < c; j++) {
        if (pos !== null && j !== pos % c) continue;
        const p = proto(part, c, j);
        if (p) best = Math.max(best, barLikeness(bar.cells, p));
      }
    }
    return best;
  }

  function attach(bar, voting) {
    bar.part = cur.part;
    bar.pos = bar.song - cur.stretch.startBar;
    bar.voting = voting;
    cur.stretch.bars.push(bar);
    if (voting) { cur.part.voters.push(bar); cur.part.cycle = cycleOf(cur.part); }
  }

  // Does a bar belong to the part playing? It fits the part's pattern, or
  // repeats the bar 2 or 4 before it (a pattern longer than a bar, or a
  // fill played every 4 bars, which then votes too).
  function fitsCurrent(bar) {
    const pos = bar.song - cur.stretch.startBar;
    if (fitness(cur.part, bar, pos) >= MATCH) return true;
    for (const c of [2, 4]) {
      const earlier = cur.stretch.bars.find((b) => b.pos === pos - c);
      if (!earlier || earlier.rest || barLikeness(bar.cells, earlier.cells) < MATCH) continue;
      if (!earlier.voting) {
        earlier.voting = true;
        cur.part.voters.push(earlier);
        cur.part.voters.sort((x, y) => x.song - y.song);
      }
      return true;
    }
    return false;
  }

  function addBar(bar) {
    if (bar.rest) { if (cur) attach(bar, false); else pending.push(bar); return; }
    if (cur && fitsCurrent(bar)) {
      for (const p of pending) attach(p, false);     // one odd bar between: a fill
      pending = [];
      attach(bar, true);
      return;
    }
    pending.push(bar);
    if (pending.filter((b) => !b.rest).length >= 2) startStretch();
  }

  // The odd bars waiting start a stretch: of an earlier part they match,
  // or of a new one.
  function startStretch() {
    const bars = pending;
    pending = [];
    while (bars.length && bars[0].rest && cur) attach(bars.shift(), false);
    if (!bars.length) return;
    const last = bars.findLast((b) => !b.rest) || bars.at(-1);
    let part = null;
    let best = MATCH;
    for (const p of parts) {
      const f = fitness(p, last, null);
      if (f >= best) { best = f; part = p; }
    }
    const reused = !!part;
    if (!part) {
      part = { id: partName(parts.length), signature: last.signature, B: last.B, voters: [], cycle: 1 };
      parts.push(part);
    }
    const stretch = { part, startBar: bars[0].song, bars: [] };
    order.push(stretch);
    cur = { part, stretch };
    for (const b of bars) attach(b, !b.rest && (!reused || fitness(part, b, null) >= MATCH));
  }

  // The segment is over (a tempo change, or the end): its bars still
  // waiting go to the part before them as fills, or make a part.
  function endSegment() {
    if (pending.some((b) => !b.rest)) {
      if (cur) { for (const b of pending) attach(b, false); pending = []; } else startStretch();
    } else if (cur) { for (const b of pending) attach(b, false); }
    pending = [];
    cur = null;
    if (settled.length) nextBar = settled.at(-1).song + 1;
    if (seg?.meter) lastBpm = bpmFor(seg.grid.s);
  }

  // A part's beat length: the shortest of 1, 2 or 4 bars that repeats as
  // well as the best.
  function cycleOf(part) {
    const score = {};
    for (const c of [1, 2, 4]) {
      if (c * part.B > MAX_PILLS) continue;
      const sims = [];
      for (const v of part.voters.slice(-24)) {
        const u = part.voters.find((x) => x.seg === v.seg && x.song === v.song - c && x.part === part);
        if (u && u.pos === v.pos - c) sims.push(barLikeness(v.cells, u.cells));
      }
      if (sims.length >= (c === 4 ? 2 : 1)) score[c] = sims.reduce((a, b) => a + b, 0) / sims.length;
    }
    const top = Math.max(...Object.values(score), 0);
    return [1, 2, 4].find((c) => score[c] !== undefined && score[c] >= top - 0.05) || 1;
  }

  function lose(lostAt) {
    if (seg.meter) {
      const { B, D } = seg.meter;
      const kLost = Math.floor((((lostAt - seg.grid.a) / seg.grid.s) - D) / B);
      // Bars that ended before the change are fine: settle them now.
      while (seg.committed + 1 < kLost && timeOf(D + (seg.committed + 2) * B) <= lostAt + 0.5 * seg.grid.s) settleOne();
      endSegment();
    }
    seg = null;
    seekFrom = lostAt;
    guess = null;
    nextGuess = 0;
  }

  function settleOne() {
    const { D, B } = seg.meter;
    // settle() with a far-future now settles one bar per loop; do one.
    const k = seg.committed + 1;
    settle(timeOf(D + (k + 1) * B) - 0.5 * seg.grid.s, true);
  }

  function checkLost(now) {
    const barTime = (seg.meter ? seg.meter.B : 16) * seg.grid.s;
    if (now - seg.lockedAt < barTime) return;
    const recent = seg.fits.filter((f) => f.t >= now - barTime && f.t >= seg.lockedAt - barTime);
    if (seg.fits.length > 512) seg.fits.splice(0, 256);
    if (recent.length < 6) return;
    let ok = 0;
    let all = 0;
    for (const f of recent) { all += f.w; if (f.ok) ok += f.w; }
    if (ok / all >= LOST) return;
    lose(recent.find((f) => !f.ok).t);
  }

  function step(now) {
    if (!seg) seek(now);
    if (!seg) return;
    if (!seg.meter) chooseSegMeter(now);
    if (seg.meter) settle(now);
    checkLost(now);
  }

  // ---- 5-7. What a part's bars add up to -------------------------------------

  function partSwing(part) {
    return swingFor(median(part.voters.flatMap((v) => v.offs)));
  }

  // A part's tempo is where it starts (its first 4 bars), so a song that
  // speeds up starts right and its tempo marks follow it up.
  function partBpm(part) {
    return bpmFor(15 / median(part.voters.slice(0, 4).map((v) => v.tempo)));
  }

  function partSteps(part) {
    const c = part.cycle;
    const steps = { kick: [], snare: [], hat: [] };
    for (let j = 0; j < c; j++) {
      const cells = fillHats(proto(part, c, j, true) || proto(part, 1, 0, true) || emptyCells(part.B), part.B);
      ROWS.forEach((row, r) => { for (let i = 0; i < part.B; i++) steps[row].push(!!cells[r][i]); });
    }
    return steps;
  }

  function partPrints(part) {
    const out = {};
    ROWS.forEach((row, r) => {
      const hitsOf = part.voters.flatMap((v) => v.hits.filter((h) => h.row === r && h.print));
      const alone = hitsOf.filter((h) => h.alone);
      out[row] = averagePrint((alone.length >= 2 ? alone : hitsOf).slice(-32).map((h) => h.print));
    });
    return out;
  }

  function tempos() {
    const out = [];
    if (!order.length) return out;
    let current = partBpm(order[0].part);
    let prevSeg = order[0].bars[0]?.seg;
    const bars = order.flatMap((s) => s.bars);
    for (let b = 0; b < bars.length; b++) {
      const bar = bars[b];
      // The bar's tempo, steadied by its neighbours in the same segment.
      const near = [];
      for (let j = Math.max(0, b - 1); j < bars.length && j <= b + 2; j++) if (bars[j].seg === bar.seg) near.push(bars[j].tempo);
      const bpm = bpmFor(15 / median(near));
      const newSeg = bar.seg !== prevSeg;
      prevSeg = bar.seg;
      if (bar.song < 2) continue;
      if ((newSeg && Math.abs(bpm - current) >= 2) || Math.abs(bpm / current - 1) > DRIFT_MARK) {
        out.push({ bar: bar.song, bpm });
        current = bpm;
      }
    }
    return out;
  }

  // Two parts whose beats turned out alike are one (two odd bars at the
  // start, say, that a chance ghost note made a part of their own): the
  // later one's bars go to the earlier, and stretches side by side join.
  function mergeAlike() {
    for (let j = 1; j < parts.length; j++) {
      const later = parts[j];
      const into = parts.slice(0, j).find((p) => p.voters.length && later.voters.length && p.signature === later.signature
        && barLikeness(proto(p, 1, 0, true), proto(later, 1, 0, true)) >= MATCH);
      if (!into) continue;
      for (const st of order) if (st.part === later) { st.part = into; for (const b of st.bars) b.part = into; }
      into.voters = [...into.voters, ...later.voters].sort((x, y) => x.song - y.song);
      later.voters = [];
      into.cycle = cycleOf(into);
    }
    for (let i = order.length - 1; i > 0; i--) {
      const [a, b] = [order[i - 1], order[i]];
      if (a.part !== b.part || a.bars.at(-1)?.seg !== b.bars[0]?.seg) continue;
      for (const bar of b.bars) bar.pos = bar.song - a.startBar;
      a.bars.push(...b.bars);
      order.splice(i, 1);
    }
  }

  // ---- The contract ------------------------------------------------------------

  function feed(samples) {
    if (result || !samples?.length) return;
    heard += samples.length;
    finder.push(samples);
    step(finder.horizon);
  }

  function snapshot() {
    const listening = !!seg?.meter;
    const recent = { kick: [], snare: [], hat: [] };
    let bar = nextBar;
    let at = 0;
    if (listening) {
      const { B, D } = seg.meter;
      // The step just heard: a little behind what has been listened to, so
      // its hits (a late off-beat too) are in.
      const iNow = Math.floor((finder.horizon - seg.grid.a) / seg.grid.s - 0.75);
      const k = Math.max(0, Math.floor((iNow - D) / B));
      bar = seg.firstBar + k;
      at = clamp(iNow - D - k * B, 0, B - 1);
      for (let kk = Math.max(0, k - 2); kk <= k; kk++) {
        const song = seg.firstBar + kk;
        const done = settled.find((x) => x.seg === seg && x.song === song);
        const raw = done || seg.bars.get(kk) || { cells: emptyCells(B) };
        const part = done?.part || cur?.part;
        const stretchStart = done?.part ? song - done.pos : cur?.stretch.startBar;
        const p = part && part.signature === seg.meter.signature ? proto(part, part.cycle, (((song - stretchStart) % part.cycle) + part.cycle) % part.cycle) : null;
        ROWS.forEach((row, r) => {
          recent[row].push(Array.from({ length: B }, (_, i) => {
            if (kk === k && i > at) return -1;
            if (!raw.cells[r][i]) return 0;
            return p && p[r][i] ? 2 : 1;
          }));
        });
      }
    }
    const part = cur?.part;
    const swing = part?.voters.length ? partSwing(part) : seg ? Math.round((segSwing() ?? 0) * 100) : 0;
    return {
      status: listening ? 'listening' : 'finding-tempo',
      seconds: heard / sampleRate,
      bpm: seg ? bpmFor(seg.grid.s) : guess ? bpmFor(guess.s) : null,
      signature: seg?.meter?.signature ?? null,
      swing: SWINGS.includes(swing) ? swing : swingFor(swing / 100),
      parts: parts.filter((p) => p.voters.length).map((p) => ({ id: p.id, bpm: partBpm(p), signature: p.signature, swing: partSwing(p), bars: p.cycle })),
      current: { partId: part?.id ?? null, bar, step: at, recent },
      tempoChange,
    };
  }

  function finish() {
    if (result) return result;
    const end = heard / sampleRate;
    finder.flush();
    if (!seg) seek(end, true);
    if (seg && !seg.meter) chooseSegMeter(end, true);
    if (seg?.meter) settle(end, true);
    if (seg) endSegment();
    mergeAlike();
    // Silence at the end is not part of the song.
    const lastStretch = order.at(-1);
    while (lastStretch?.bars.length && lastStretch.bars.at(-1).rest) lastStretch.bars.pop();
    if (lastStretch && !lastStretch.bars.length) order.pop();
    const used = parts.filter((p) => p.voters.length);
    // Letters run A, B, C with no gap: a part merged away gives its letter
    // to the next, so the parts heard live may have had other letters.
    used.forEach((p, n) => { p.id = partName(n); });
    result = {
      seconds: end,
      parts: used.map((p) => ({
        id: p.id, bpm: partBpm(p), signature: p.signature, swing: partSwing(p), bars: p.cycle,
        steps: partSteps(p), prints: partPrints(p),
      })),
      order: order.filter((s) => used.includes(s.part)).map((s) => ({ partId: s.part.id, startBar: s.startBar, bars: s.bars.length })),
      tempos: tempos(),
    };
    return result;
  }

  return { feed, snapshot, finish };
}
