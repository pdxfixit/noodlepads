// Made-up songs for tests/listen.test.mjs: drums placed on a grid of
// sixteenths, with a bass line, a pad and a little hiss under them, so the
// listener hears more than clean clicks. Every song is built from a seed,
// so a run is the same every time.
//
// render({ sampleRate, lead, tail, seed, bass, pad, voice, noise, jitter,
//          ghosts, hatLevel, sections })
//   bass, pad, voice: true, false, or a level (1 is the usual)
//   ghosts: the share of bars with one quiet snare on an off-beat
//   sections: [{ bars, bpm, bpmEnd?, signature?, swing?, kick, snare, hat,
//                fills?: { [barIndex]: { kick, snare, hat } } }]
//   kick/snare/hat: the steps (0-based within the bar) that hit, or for a
//   pattern longer than a bar, an array of such arrays, one per bar.
// → { samples, hits: [{ t, row, bar, step }], barStarts: [seconds] }

import { barSteps } from '../web/beat.js';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One-pole filters, for colouring noise.
function lowpass(x, sr, hz) {
  const a = Math.exp((-2 * Math.PI * hz) / sr);
  let y = 0;
  return x.map((v) => (y = (1 - a) * v + a * y));
}
const highpass = (x, sr, hz) => { const lp = lowpass(x, sr, hz); return x.map((v, i) => v - lp[i]); };

// The drum sounds. Each is a few variants, so no two hits are identical.
export function drumSounds(sr, seed = 7, kinds = {}) {
  const r = rng(seed);
  const noise = (n) => Float32Array.from({ length: n }, () => r() * 2 - 1);
  const make = {
    // A decaying low sine whose pitch falls, with a tiny click.
    kick: ({ top = 70, bottom = 45, decay = 0.15 } = {}) => {
      const n = Math.round(sr * 0.35);
      const out = new Float32Array(n);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        phase += (2 * Math.PI * (bottom + top * Math.exp(-t / 0.03))) / sr;
        out[i] = 0.9 * Math.sin(phase) * Math.exp(-t / decay) + (i < sr * 0.002 ? 0.15 * (r() * 2 - 1) : 0);
      }
      return out;
    },
    // A noise burst (no air above 5 kHz) and a mid tone.
    snare: ({ tone = 190, decay = 0.07 } = {}) => {
      const n = Math.round(sr * 0.25);
      const hiss = lowpass(lowpass(noise(n), sr, 5000), sr, 6000);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        out[i] = 1.1 * hiss[i] * Math.exp(-t / decay) + 0.4 * Math.sin(2 * Math.PI * tone * t) * Math.exp(-t / 0.06);
      }
      return out;
    },
    // Short high noise.
    hat: ({ decay = 0.025 } = {}) => {
      const n = Math.round(sr * 0.08);
      const hiss = highpass(highpass(noise(n), sr, 7000), sr, 7000);
      return hiss.map((v, i) => 0.85 * v * Math.exp(-i / sr / decay));
    },
  };
  const out = {};
  for (const row of ['kick', 'snare', 'hat']) out[row] = [0, 1, 2, 3].map(() => make[row](kinds[row]));
  return out;
}

const NOTES = [55, 43.65, 65.41, 49];            // A1 F1 C2 G1: one per bar
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];

export function render({ sampleRate: sr = 44100, lead = 0, tail = 1, seed = 1, bass = true, pad = true, voice = false, noise = 0.002, jitter = 0, ghosts = 0, hatLevel = 1, sections, sounds }) {
  const r = rng(seed);
  const drums = sounds || drumSounds(sr, seed + 11);
  const hits = [];
  const barStarts = [];
  const beats = [];                                  // quarter-note times, for the bass
  let t = lead;
  let bar = 0;
  for (const sec of sections) {
    const sig = sec.signature || '4/4';
    const B = barSteps(sig);
    const total = sec.bars * B;
    for (let b = 0; b < sec.bars; b++, bar++) {
      barStarts.push(t);
      const fill = sec.fills?.[b];
      const pick = (row) => {
        const p = (fill || sec)[row] || [];
        return Array.isArray(p[0]) ? p[b % p.length] : p;
      };
      for (let step = 0; step < B; step++) {
        const done = (b * B + step) / total;
        const bpm = sec.bpm + ((sec.bpmEnd ?? sec.bpm) - sec.bpm) * done;
        const s = 15 / bpm;
        const late = step % 2 ? ((sec.swing || 0) / 100) * s : 0;
        if (step % 4 === 0) beats.push(t);
        for (const row of ['kick', 'snare', 'hat']) {
          if (!pick(row).includes(step)) continue;
          const at = t + late + (jitter ? (r() - 0.5) * 2 * jitter : 0);
          hits.push({ t: at, row, bar, step });
        }
        t += s;
      }
    }
  }
  const length = Math.ceil((t + tail) * sr);
  const out = new Float32Array(length);
  // Ghost notes: quiet snares, at random, a share `ghosts` of the bars.
  if (ghosts) {
    for (let b = 0; b < barStarts.length - 1; b++) {
      if (r() >= ghosts) continue;
      const s = (barStarts[b + 1] - barStarts[b]) / 16;
      hits.push({ t: barStarts[b] + s * (1 + 2 * Math.floor(r() * 8)), row: 'snare', bar: b, step: -1, ghost: true });
    }
  }
  for (const h of hits) {
    const v = drums[h.row][Math.floor(r() * 4)];
    const gain = (0.8 + 0.2 * r()) * (h.ghost ? 0.25 : h.row === 'hat' ? hatLevel : 1);
    const start = Math.round(h.t * sr);
    for (let i = 0; i < v.length && start + i < length; i++) out[start + i] += gain * v[i];
  }
  const end = t;
  if (bass) {
    // A note on every beat, softly plucked, a fourteenth of the kick's level.
    let phase = 0;
    for (let k = 0; k < beats.length; k++) {
      const from = Math.round(beats[k] * sr);
      const to = Math.round((beats[k + 1] ?? end) * sr);
      const bi = barStarts.findLastIndex((x) => x <= beats[k] + 1e-9);
      const hz = NOTES[bi % NOTES.length] * (k % 2 ? 1.5 : 1);
      for (let i = from; i < to && i < length; i++) {
        const dt = (i - from) / sr;
        const env = Math.min(1, dt / 0.03) * (0.6 + 0.4 * Math.exp(-dt / 0.1)) * Math.min(1, (to - i) / (0.01 * sr));
        phase += (2 * Math.PI * hz) / sr;
        out[i] += 0.16 * +bass * env * (Math.sin(phase) + 0.3 * Math.sin(2 * phase));
      }
    }
  }
  if (pad) {
    // A chord every two bars, fading in slowly.
    for (let k = 0; k < barStarts.length; k += 2) {
      const from = Math.round(barStarts[k] * sr);
      const to = Math.round((barStarts[k + 2] ?? end) * sr);
      const chord = CHORDS[(k / 2) % CHORDS.length];
      for (let i = from; i < to && i < length; i++) {
        const dt = (i - from) / sr;
        const env = Math.min(1, dt / 0.3) * Math.min(1, (to - i) / (0.2 * sr));
        let v = 0;
        for (const hz of chord) v += Math.sin(2 * Math.PI * hz * dt) + 0.25 * Math.sin(6 * Math.PI * hz * dt);
        out[i] += 0.05 * +pad * env * v;
      }
    }
  }
  if (voice) {
    // A singing voice: a note a beat long, with vibrato and bright
    // harmonics up to 4 kHz, starting softly; it sits where a snare's noise
    // does.
    const notes = [392, 440, 494, 440, 392, 330, 349, 392];
    for (let k = 0; k < beats.length; k++) {
      const from = Math.round(beats[k] * sr);
      const to = Math.round((beats[k + 1] ?? end) * sr);
      const hz = notes[k % notes.length];
      let phase = 0;
      for (let i = from; i < to && i < length; i++) {
        const dt = (i - from) / sr;
        const env = Math.min(1, dt / 0.05) * Math.min(1, (to - i) / (0.03 * sr));
        phase += (2 * Math.PI * hz * (1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * dt))) / sr;
        let v = 0;
        for (let h = 1; h <= 10; h++) v += Math.sin(h * phase) / h;
        out[i] += 0.08 * +voice * env * v;
      }
    }
  }
  if (noise) for (let i = 0; i < length; i++) out[i] += noise * (r() * 2 - 1);
  return { samples: out, hits, barStarts, seconds: length / sr };
}

// Feeds samples to a listener in chunks of uneven length, as an AudioWorklet
// might (128 frames) or a file reader (thousands).
export function feedAll(listener, samples, seed = 3) {
  const r = rng(seed);
  for (let i = 0; i < samples.length;) {
    const n = Math.min(samples.length - i, r() < 0.5 ? 128 : 1 + Math.floor(r() * 4000));
    listener.feed(samples.subarray(i, i + n));
    i += n;
  }
}

// Common grooves, as steps in a 16-step bar.
export const GROOVE = {
  rock: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  chorus: { kick: [0, 3, 8, 10], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  fill: { kick: [0], snare: [4, 8, 10, 12, 13, 14, 15], hat: [0, 2] },
};
