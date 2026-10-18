// 🎧 From a song's ears (docs/design/beat-from-a-song.md, "How listening
// works", steps 1 and 6): the signal processing under web/listen.js.
// It turns samples into kick, snare and hat hits, a hit's sound into a
// fingerprint, and finds the app's closest sound for a fingerprint. No DOM,
// no Web Audio, no storage: plain functions over Float32Array samples, so
// node --test runs it.
//
// Hits: each frame's rise in 16 bands (spectral flux) is split into a kick,
// a snare and a hat part, as the mix of three spectral shapes that best
// fits it (non-negative least squares on three unknowns). A snare's noise
// reaches as high as a hat's, so separate bands alone would hear a hat on
// every snare; the snare's body (120-260 Hz) is what tells them apart. Each
// part's peaks, against its own recent level, are its hits. Kick and hat
// shapes learn from clean hits as the song plays; the snare's learns only
// from its least bright hits, so a hat played with it still shows.
//
// The audio itself is never kept: only a short ring of samples for the
// spectrum, and a few numbers per frame.

// The spectrum's window: about 23 ms, a power of two (1024 at 44.1 or
// 48 kHz). A frame every quarter window, about 5.8 ms, places a hit well
// inside a sixteenth even at 180 BPM.
export const fftSize = (sampleRate) => 2 ** Math.round(Math.log2(sampleRate * 0.0232));

export const ROWS = ['kick', 'snare', 'hat'];
const BANDS = 16;
const ENV_WEIGHT = [1, 1, 0.8];        // each row's share of the tempo envelope
const LOOK = 4;                        // frames after a hit's peak needed to hear all of it
const LAG = 2;                         // flux compares a frame with the one LAG before,
const HOLD = 4;                        // ... or the loudest of the HOLD frames up to it
const MIN_GAP = 0.05;                  // seconds between two hits
const REL = [0.5, 0.25, 0.25];         // a hit is at least this share of its row's recent peak
                                       // (a kick's is high: a loud bass line is not a kick)
const MEAN_RATIO = 1.3;                // a hit is this many times the local mean,
const EVENT_REL = 0.1;                 // ... and this share of the recent peak
const FLOOR = 0.03;                    // ... and this share of the loudest row's peak,
const QUIET = 0.003;                   // ... and above the hiss of a quiet room
const PEAK_DECAY = 0.9997;             // a recent peak halves in about 13 s
const HAT_UNDER_SNARE = 0.25;          // see pick()
const SNARE_NOISE = 0.3;               // see snareNoise()
const LEARN = 0.06;                    // how far one clean hit moves its row's shape

// Each row's shape (how much each band rises when it hits), by frequency,
// after the app's own kick, snare and hi-hat clips.
const SHAPES = [
  (hz) => (hz < 50 ? 0.3 : hz < 200 ? 1 : hz < 600 ? 0.3 : 0.05),
  (hz) => (hz < 110 ? 0.03 : hz < 300 ? 0.7 : hz < 1000 ? 0.08 : hz < 2400 ? 0.15 : hz < 5000 ? 0.35 : hz < 11000 ? 0.3 : 0.12),
  (hz) => (hz < 1500 ? 0 : hz < 3500 ? 0.15 : hz < 5000 ? 0.3 : hz < 11000 ? 0.6 : 0.6),
];

// The fingerprint: 16 bands from 40 Hz to 10 kHz (the kit's clips are
// 22.05 kHz, so nothing above 11 kHz could match), in three slices of a
// hit's first 150 ms (attack, body, tail): a dusty kick and a clean one
// differ by their decay as well as their colour.
const PRINT_TOP = 10000;
const PRINT_SLICES = [0.03, 0.08, 0.15];
export const PRINT_LENGTH = BANDS * PRINT_SLICES.length;
const PRINT_GATE = 0.05;

// An in-place radix-2 FFT of n real samples, giving the n/2 + 1 magnitudes.
function makeFft(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0, x = i; b < levels; b++, x >>= 1) r = (r << 1) | (x & 1);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  return (frame, out) => {
    for (let i = 0; i < n; i++) { re[i] = frame[rev[i]]; im[i] = 0; }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const p = i + j;
          const q = p + half;
          const tr = re[q] * cos[k] + im[q] * sin[k];
          const ti = im[q] * cos[k] - re[q] * sin[k];
          re[q] = re[p] - tr; im[q] = im[p] - ti;
          re[p] += tr; im[p] += ti;
        }
      }
    }
    for (let k = 0; k <= n / 2; k++) out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
  };
}

// Frames of magnitudes from a stream of samples: onFrame(index, mags) every
// hop. Frame f's window ends at sample (f + 1) × hop. Magnitudes are scaled
// so a full-scale sine reads about 1.
export function createFrames(sampleRate, onFrame) {
  const n = fftSize(sampleRate);
  const hop = n / 4;
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const ring = new Float32Array(n);
  const frame = new Float64Array(n);
  const mags = new Float32Array(n / 2 + 1);
  const scale = 4 / n;
  const fft = makeFft(n);
  let pos = 0;
  let since = 0;
  let index = 0;
  return {
    n, hop,
    push(samples) {
      for (let s = 0; s < samples.length; s++) {
        ring[pos] = samples[s];
        pos = pos + 1 === n ? 0 : pos + 1;
        if (++since < hop) continue;
        since = 0;
        for (let i = 0, j = pos; i < n; i++, j = j + 1 === n ? 0 : j + 1) frame[i] = ring[j] * win[i];
        fft(frame, mags);
        for (let k = 0; k < mags.length; k++) mags[k] *= scale;
        onFrame(index++, mags);
      }
    },
  };
}

// 16 log-spaced bands from `low` Hz to `top` Hz: which band each bin adds
// to (-1 for none), and each band's middle frequency.
function bandLayout(sampleRate, n, low, top) {
  const binHz = sampleRate / n;
  const map = new Int8Array(n / 2 + 1).fill(-1);
  for (let k = 1; k <= n / 2; k++) {
    const hz = k * binHz;
    if (hz >= low && hz < top) map[k] = Math.min(BANDS - 1, Math.floor((Math.log(hz / low) / Math.log(top / low)) * BANDS));
  }
  const middles = Array.from({ length: BANDS }, (_, b) => low * (top / low) ** ((b + 0.5) / BANDS));
  return { map, middles };
}

// Each band's amplitude (the root of its bins' summed power).
function bandAmplitudes(mags, map, out) {
  out.fill(0);
  for (let k = 0; k < mags.length; k++) if (map[k] >= 0) out[map[k]] += mags[k] * mags[k];
  for (let b = 0; b < out.length; b++) out[b] = Math.sqrt(out[b]);
  return out;
}

// A fingerprint from per-slice band amplitudes: relative to the loudest,
// log-compressed, then scaled to length 1, so how loud the sound was does
// not matter, only its shape.
function finishPrint(slices) {
  const out = new Float32Array(PRINT_LENGTH);
  let max = 0;
  for (let i = 0; i < PRINT_LENGTH; i++) { out[i] = Math.max(0, slices[i]); max = Math.max(max, out[i]); }
  if (!(max > 0)) return null;
  let sum = 0;
  for (let i = 0; i < PRINT_LENGTH; i++) {
    // Under a twentieth of the loudest is the room (or the rest of a mix).
    const x = out[i] / max;
    out[i] = x < PRINT_GATE ? 0 : Math.log1p(20 * x) / Math.log1p(20);
    sum += out[i] * out[i];
  }
  const norm = Math.sqrt(sum);
  for (let i = 0; i < PRINT_LENGTH; i++) out[i] /= norm;
  return out;
}

const sliceOf = (dt) => PRINT_SLICES.findIndex((end) => dt < end);

// A sound's fingerprint: the shape of its first 150 ms, from where it
// starts (the first sample above a twentieth of its peak). The screens
// take it of the app's kit clips, decoded, to match a song's rows with
// closestSound. null for silence.
export function fingerprint(samples, sampleRate) {
  if (!samples?.length || !(sampleRate > 0)) return null;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (!(peak > 0)) return null;
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < peak / 20) start++;
  const n = fftSize(sampleRate);
  const { map } = bandLayout(sampleRate, n, 40, Math.min(PRINT_TOP, sampleRate * 0.45));
  const slices = new Float64Array(PRINT_LENGTH);
  const counts = new Float64Array(PRINT_SLICES.length);
  const amps = new Float64Array(BANDS);
  const frames = createFrames(sampleRate, (f, mags) => {
    const dt = ((f + 1) * frames.hop - n / 2) / sampleRate;   // the window's middle, from the start
    const slice = sliceOf(dt);
    if (dt < 0 || slice < 0) return;
    bandAmplitudes(mags, map, amps);
    for (let b = 0; b < BANDS; b++) slices[slice * BANDS + b] += amps[b];
    counts[slice]++;
  });
  // Half a window of silence first, so the first frame centres on the start.
  const take = Math.min(samples.length - start, Math.ceil(sampleRate * (PRINT_SLICES.at(-1) + 0.03)));
  const padded = new Float32Array(n / 2 + take + n);
  padded.set(samples.subarray(start, start + take), n / 2);
  frames.push(padded);
  for (let s = 0; s < PRINT_SLICES.length; s++) for (let b = 0; b < BANDS; b++) if (counts[s]) slices[s * BANDS + b] /= counts[s];
  return finishPrint(slices);
}

// The id of the candidate ([{ id, print }]) whose print is nearest, or null.
export function closestSound(print, candidates) {
  if (!print || !Array.isArray(candidates)) return null;
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    if (!c?.print || c.print.length !== print.length) continue;
    let d = 0;
    for (let i = 0; i < print.length; i++) d += (print[i] - c.print[i]) ** 2;
    if (d < bestD) { bestD = d; best = c.id; }
  }
  return best;
}

// The average of several prints, scaled to length 1 again (null for none).
export function averagePrint(prints) {
  const list = prints.filter(Boolean);
  if (!list.length) return null;
  const out = new Float32Array(PRINT_LENGTH);
  for (const p of list) for (let i = 0; i < PRINT_LENGTH; i++) out[i] += p[i];
  let norm = 0;
  for (let i = 0; i < PRINT_LENGTH; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm);
  if (!(norm > 0)) return null;
  for (let i = 0; i < PRINT_LENGTH; i++) out[i] /= norm;
  return out;
}

// A growing Float32Array, for one number per frame (5 minutes is about
// 52,000 frames, 200 KB a series).
export function series() {
  let data = new Float32Array(4096);
  let length = 0;
  return {
    get length() { return length; },
    push(x) {
      if (length === data.length) { const next = new Float32Array(data.length * 2); next.set(data); data = next; }
      data[length++] = x;
    },
    at: (i) => (i >= 0 && i < length ? data[i] : 0),
    slice: (from, to) => data.slice(Math.max(0, from), Math.min(length, to)),
  };
}

const unit = (v) => { const norm = Math.hypot(...v) || 1; return v.map((x) => x / norm); };

// Non-negative least squares for three shapes: the amounts a ≥ 0 that make
// a[0]·S0 + a[1]·S1 + a[2]·S2 nearest to the rise r. With three unknowns,
// trying every set of shapes is quicker than iterating.
function makeSplitter() {
  let shapes = null;
  let subsets = [];
  return {
    setShapes(next) {
      shapes = next;
      const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
      subsets = [];
      for (let mask = 1; mask < 8; mask++) {
        const idx = [0, 1, 2].filter((i) => mask & (1 << i));
        const g = idx.map((i) => idx.map((j) => dot(shapes[i], shapes[j])));
        const inv = invert(g);
        if (inv) subsets.push({ idx, inv });
      }
    },
    split(r, out) {
      const proj = shapes.map((s) => { let x = 0; for (let b = 0; b < r.length; b++) x += s[b] * r[b]; return x; });
      let best = -Infinity;
      out.fill(0);
      for (const { idx, inv } of subsets) {
        const a = inv.map((row) => row.reduce((s, x, j) => s + x * proj[idx[j]], 0));
        if (a.some((x) => x < 0)) continue;
        // For a least-squares fit, how much of r it explains is a · proj.
        const explained = a.reduce((s, x, j) => s + x * proj[idx[j]], 0);
        if (explained > best) { best = explained; out.fill(0); idx.forEach((i, j) => { out[i] = a[j]; }); }
      }
      return out;
    },
  };
}

function invert(m) {
  const n = m.length;
  if (n === 1) return Math.abs(m[0][0]) > 1e-12 ? [[1 / m[0][0]]] : null;
  if (n === 2) {
    const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
    return Math.abs(det) > 1e-9 ? [[m[1][1] / det, -m[0][1] / det], [-m[1][0] / det, m[0][0] / det]] : null;
  }
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) return null;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

// The hit finder. push(samples) calls onHit({ t, row, w, alone, print }) for
// each hit, a few frames late: t in seconds from the first sample, row 0
// kick, 1 snare, 2 hat, w its strength (about 0 to 1, against the row's
// recent peak), alone when no other row hit with it, and print filled in
// once the hit's 150 ms have passed (null until then). `env` holds one
// number per frame, every row's part, for finding the tempo; `horizon` is
// the time before which every hit has been reported.
export function createHitFinder(sampleRate, onHit) {
  const frames = createFrames(sampleRate, onFrame);
  const { n, hop } = frames;
  const frameRate = sampleRate / hop;
  const hits = bandLayout(sampleRate, n, 30, Math.min(16000, sampleRate * 0.45));
  const defaults = SHAPES.map((shape) => unit(hits.middles.map(shape)));
  // What a shape may learn outside its own range: a kick's shape never
  // grows a hat's highs, a hat's never a kick's or a snare's lows.
  const OWN = [(hz) => hz < 1000, (hz) => hz > 110, (hz) => hz > 1000];
  const caps = defaults.map((d, i) => d.map((x, b) => (OWN[i](hits.middles[b]) ? Infinity : 1.5 * x + 0.01)));
  const capped = (v, i) => unit(v.map((x, b) => Math.min(x, caps[i][b])));
  const shapes = defaults.map((s) => s.slice());
  const splitter = makeSplitter();
  splitter.setShapes(shapes);
  const amps = Array.from({ length: 16 }, () => new Float64Array(BANDS));
  const rise = new Float64Array(BANDS);
  const parts = new Float64Array(3);
  const act = ROWS.map(() => series());
  const env = series();
  const actPeak = [0, 0, 0];            // each row's recent loudest part, frame by frame
  const hitPeak = [0, 0, 0];            // ... and hit by hit
  let envPeak = 0;
  let lastEvent = -Infinity;
  const minGap = Math.round(MIN_GAP * frameRate);
  const snareRises = [];                // recent snare hits' rises, for the snare's shape
  // Fingerprints: the last few frames' band amplitudes (for what was
  // sounding before a hit), and the hits still gathering their 150 ms.
  const prints = bandLayout(sampleRate, n, 40, Math.min(PRINT_TOP, sampleRate * 0.45));
  const recent = Array.from({ length: 16 }, () => new Float64Array(BANDS));
  const pending = [];
  const printFrames = Math.ceil(PRINT_SLICES.at(-1) * frameRate) + 1;
  const time = (f) => ((f + 1) * hop - n / 2) / sampleRate;
  const ring = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
  let horizon = 0;

  function onFrame(f, mags) {
    // The rise over the loudest of frames f - LAG - HOLD + 1 to f - LAG, so
    // a held note whose partials beat (a pad, a chord) gives no rise.
    const now = bandAmplitudes(mags, hits.map, ring(amps, f));
    for (let b = 0; b < BANDS; b++) {
      let before = 0;
      for (let j = LAG; j < LAG + HOLD; j++) before = Math.max(before, ring(amps, f - j)[b]);
      rise[b] = f >= LAG + HOLD ? Math.max(0, now[b] - before) : 0;
    }
    splitter.split(rise, parts);
    let e = 0;
    for (let i = 0; i < 3; i++) {
      act[i].push(parts[i]);
      actPeak[i] = Math.max(actPeak[i] * PEAK_DECAY, parts[i]);
      e += (ENV_WEIGHT[i] * parts[i]) / Math.max(actPeak[i], QUIET);
    }
    env.push(e);
    envPeak = Math.max(envPeak * PEAK_DECAY, e);
    const energies = bandAmplitudes(mags, prints.map, ring(recent, f));
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      addToPrint(p, f, energies);
      if (f - p.frame >= printFrames) {
        for (let s = 0; s < PRINT_SLICES.length; s++) for (let b = 0; b < BANDS; b++) if (p.counts[s]) p.slices[s * BANDS + b] /= p.counts[s];
        p.hit.print = finishPrint(p.slices);
        pending.splice(i, 1);
      }
    }
    pick(f - LOOK, f);
  }

  function addToPrint(p, g, energies) {
    const slice = sliceOf((g - p.frame) / frameRate);
    if (slice < 0) return;
    for (let b = 0; b < BANDS; b++) p.slices[slice * BANDS + b] += Math.max(0, energies[b] - p.before[b]);
    p.counts[slice]++;
  }

  // Is frame m the peak of a hit, of any row?
  function isEvent(m) {
    const x = env.at(m);
    if (!(x > EVENT_REL * envPeak) || m - lastEvent < minGap) return false;
    for (let j = m - 3; j <= m + LOOK; j++) if (j !== m && (env.at(j) > x || (j < m && env.at(j) === x))) return false;
    let mean = 0;
    for (let j = m - 16; j <= m + LOOK; j++) mean += env.at(j);
    return x >= (MEAN_RATIO * mean) / (17 + LOOK);
  }

  // A hit at frame m: its whole attack (the loudest of the frames from just
  // before it to LOOK after, over the loudest of the frames before that),
  // split into kick, snare and hat. Each row whose part is loud enough
  // against its own recent hits played.
  function pick(m, f) {
    if (m < 0) return;
    horizon = time(m - 1);
    if (!isEvent(m)) return;
    const r = new Float64Array(BANDS);
    let total = 0;
    for (let b = 0; b < BANDS; b++) {
      let peakAmp = 0;
      let before = 0;
      for (let j = m - 1; j <= m + LOOK; j++) peakAmp = Math.max(peakAmp, ring(amps, j)[b]);
      for (let j = m - 3 - HOLD; j <= m - 3; j++) before = Math.max(before, ring(amps, j)[b]);
      r[b] = Math.max(0, peakAmp - before);
      total += r[b];
    }
    if (total < QUIET) return;
    const a = splitter.split(r, new Float64Array(3));
    const decay = PEAK_DECAY ** Math.min(1e6, m - lastEvent);
    lastEvent = m;
    const floor = Math.max(QUIET, FLOOR * Math.max(...hitPeak));
    const rel = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      hitPeak[i] = Math.max(hitPeak[i] * decay, a[i]);
      rel[i] = a[i] / Math.max(hitPeak[i], 1e-9);
    }
    // A hat under a snare is told from the snare's own brightness only when
    // it is at least HAT_UNDER_SNARE of it (listen.js fills a steady hat
    // stream back in where the snare covered it).
    const found = [0, 1, 2].filter((i) => a[i] > floor && rel[i] >= REL[i])
      .filter((i, _, all) => !(i === 2 && all.includes(1) && a[2] < HAT_UNDER_SNARE * a[1]))
      .filter((i) => i !== 1 || snareNoise(r, a) >= SNARE_NOISE);
    if (!found.length) return;
    learn(r, found, rel);
    // Where the peak really is, between frames.
    const y0 = env.at(m - 1), y1 = env.at(m), y2 = env.at(m + 1);
    const den = y0 - 2 * y1 + y2;
    const t = time(m + (den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0));
    const before = new Float64Array(BANDS);
    for (let j = 3; j <= 6; j++) { const e = ring(recent, m - j); for (let b = 0; b < BANDS; b++) before[b] = Math.max(before[b], e[b]); }
    for (const i of found) {
      const hit = { t, row: i, w: Math.min(1, rel[i]), alone: found.length === 1, print: null };
      const p = { hit, frame: m - 1, before, slices: new Float64Array(PRINT_LENGTH), counts: new Float64Array(PRINT_SLICES.length) };
      for (let g = m - 1; g <= f; g++) addToPrint(p, g, ring(recent, g));   // the frames already gone by
      pending.push(p);
      onHit(hit);
    }
  }

  // A snare is a noise burst over a body. A rise in the body's range alone
  // (a bass note's second harmonic, a low piano note, a tom) is not one:
  // how much of the noise the snare's part should bring (1-8 kHz) is
  // really there, beyond what the kick and hat parts explain.
  function snareNoise(r, a) {
    let want = 0;
    let got = 0;
    for (let b = 0; b < BANDS; b++) {
      if (hits.middles[b] < 1000 || hits.middles[b] > 8000) continue;
      want += a[1] * shapes[1][b];
      got += Math.max(0, r[b] - a[0] * shapes[0][b] - a[2] * shapes[2][b]);
    }
    return want > 0 ? got / want : 0;
  }

  // A clean hit (no other row in it) pulls its row's shape a little toward
  // its own rise. The snare's shape follows the least bright of its recent
  // hits instead, band by band, so a hat played with a snare stays a hat
  // rather than teaching the snare to sound like one.
  function learn(r, found, rel) {
    const u = unit(Array.from(r));
    const clean = found.length === 1 && [0, 1, 2].every((j) => j === found[0] || rel[j] < 0.15);
    let changed = false;
    if (found.includes(1) && !found.includes(0) && rel[1] >= 0.4) {
      const body = u.reduce((s, x, b) => s + (hits.middles[b] > 110 && hits.middles[b] < 300 ? x : 0), 0);
      if (body > 0.2) {
        snareRises.push(u.map((x) => x / body));
        if (snareRises.length > 24) snareRises.shift();
        if (snareRises.length >= 4) {
          const low = Array.from({ length: BANDS }, (_, b) => {
            const v = snareRises.map((s) => s[b]).sort((x, y) => x - y);
            return v[Math.floor(v.length * 0.25)];
          });
          shapes[1] = capped(low, 1);
          changed = true;
        }
      }
    }
    if (clean && found[0] !== 1 && rel[found[0]] >= 0.4) {
      const i = found[0];
      shapes[i] = capped(shapes[i].map((x, b) => (1 - LEARN) * x + LEARN * u[b]), i);
      changed = true;
    }
    if (changed) splitter.setShapes(shapes);
  }

  return {
    frameRate, hop, n, env, act, shapes,
    push: (samples) => frames.push(samples),
    get horizon() { return horizon; },
    frameAt: (t) => Math.round((t * sampleRate + n / 2) / hop - 1),
    timeAt: time,
    // Lets the last frames through (silence), at the end.
    flush() { frames.push(new Float32Array(n + (LOOK + 2) * hop + Math.ceil(sampleRate * PRINT_SLICES.at(-1)))); },
  };
}
