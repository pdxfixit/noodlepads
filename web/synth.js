// ✨ Make one: sounds made from nothing, no microphone. A recipe is a tone
// (smooth, buzzy or hiss) whose pitch slides from one note to another over a
// length, with a shape for how it rises and dies away: a boom is a falling
// smooth tone, a hi-hat a short high hiss, a laser a fast buzzy drop. Kids
// learn that drum and game sounds are made, not found.
//
// Pure: recipes in, samples out (plain JavaScript, a fixed random seed), so
// a stored recipe always makes the same sound and Node can test it. The
// sheet turns the samples into a WAV, the clip's blob, and keeps the recipe
// as the clip's `synth` so its sliders can be moved again.

export const TONES = ['smooth', 'buzzy', 'hiss'];
// How the pitch and the loudness move: 'drop' (a hit that dies away),
// 'jump' (two notes, like a coin), 'siren' (up and down twice, steady),
// 'swell' (fades in and out, like wind).
export const SHAPES = ['drop', 'jump', 'siren', 'swell'];
export const LIMITS = {
  from: { min: 30, max: 12000 },    // Hz
  to: { min: 30, max: 12000 },
  length: { min: 0.05, max: 3 },     // seconds
  pulses: { min: 1, max: 4 },        // a clap is a few quick hits
};
export const RATE = 44100;

export const STARTERS = [
  { id: 'laser', name: 'Laser', emoji: '🔫', recipe: { tone: 'buzzy', from: 1600, to: 120, length: 0.35, shape: 'drop', pulses: 1 } },
  { id: 'boom', name: 'Boom', emoji: '💥', recipe: { tone: 'smooth', from: 160, to: 38, length: 0.8, shape: 'drop', pulses: 1 } },
  { id: 'tss', name: 'Tss', emoji: '🫧', recipe: { tone: 'hiss', from: 9000, to: 7000, length: 0.18, shape: 'drop', pulses: 1 } },
  { id: 'clap', name: 'Clap', emoji: '👏', recipe: { tone: 'hiss', from: 1500, to: 1100, length: 0.25, shape: 'drop', pulses: 3 } },
  { id: 'siren', name: 'Siren', emoji: '🚨', recipe: { tone: 'smooth', from: 600, to: 1300, length: 1.6, shape: 'siren', pulses: 1 } },
  { id: 'coin', name: 'Coin', emoji: '🪙', recipe: { tone: 'buzzy', from: 988, to: 1319, length: 0.45, shape: 'jump', pulses: 1 } },
  { id: 'wind', name: 'Wind', emoji: '🌬️', recipe: { tone: 'hiss', from: 400, to: 1400, length: 2.4, shape: 'swell', pulses: 1 } },
];

const clamp = (v, { min, max }, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

// A recipe from anywhere (a slider, a backup) made safe, or null when it
// isn't a recipe at all. Missing numbers take the Boom's.
export function cleanSynth(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const base = STARTERS[1].recipe;
  return {
    tone: TONES.includes(raw.tone) ? raw.tone : base.tone,
    from: Math.round(clamp(raw.from, LIMITS.from, base.from)),
    to: Math.round(clamp(raw.to, LIMITS.to, base.to)),
    length: Math.round(clamp(raw.length, LIMITS.length, base.length) * 100) / 100,
    shape: SHAPES.includes(raw.shape) ? raw.shape : 'drop',
    pulses: Math.round(clamp(raw.pulses, LIMITS.pulses, 1)),
  };
}

// 🎲: a random recipe from ranges that sound like something.
export function surpriseSynth(random = Math.random) {
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const between = (lo, hi) => lo * (hi / lo) ** random();   // even in ratio, as pitch is heard
  const tone = pick(TONES);
  const shape = pick(SHAPES);
  return cleanSynth({
    tone, shape,
    from: between(tone === 'hiss' ? 300 : 60, tone === 'hiss' ? 9000 : 2500),
    to: between(tone === 'hiss' ? 300 : 40, tone === 'hiss' ? 9000 : 2500),
    length: shape === 'swell' || shape === 'siren' ? 0.8 + random() * 1.6 : 0.12 + random() * 0.7,
    pulses: shape === 'drop' && tone === 'hiss' && random() < 0.3 ? 3 : 1,
  });
}

// The same "random" every time, so a recipe always makes the same hiss.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The pitch at time t (0 to 1 of the length).
function pitchAt(r, t) {
  const ratio = r.to / r.from;
  switch (r.shape) {
    case 'jump': return t < 0.3 ? r.from : r.to;
    case 'siren': return r.from * ratio ** ((1 - Math.cos(2 * Math.PI * 2 * t)) / 2);
    default: return r.from * ratio ** t;
  }
}

// The loudness at `sec` seconds in.
function levelAt(r, sec) {
  const len = r.length;
  const attack = Math.min(0.005, len / 10);
  const fadeIn = Math.min(1, sec / attack);
  switch (r.shape) {
    case 'siren': return fadeIn * Math.min(1, (len - sec) / 0.08);
    case 'swell': return Math.sin(Math.PI * Math.min(1, sec / len)) ** 1.5;
    case 'jump': return fadeIn * Math.exp(-sec * Math.log(30) / len);
    default: {
      // A clap: a few quick slaps 12 ms apart, then the last one rings out.
      const gap = 0.012;
      const last = (r.pulses - 1) * gap;
      if (sec < last) { const p = sec % gap; return Math.exp(-p / 0.004); }
      return fadeIn * Math.exp(-(sec - last) * Math.log(50) / Math.max(0.01, len - last));
    }
  }
}

// The samples of recipe `r` at `rate` Hz, mono, peak 0.9.
export function renderSynth(raw, rate = RATE) {
  const r = cleanSynth(raw);
  const n = Math.max(1, Math.round(r.length * rate));
  const out = new Float32Array(n);
  const noise = seeded(7);
  let phase = 0;
  let low = 0, band = 0;   // the hiss's filter (a state-variable band-pass)
  for (let i = 0; i < n; i++) {
    const sec = i / rate;
    const f = pitchAt(r, i / n);
    let v;
    if (r.tone === 'hiss') {
      // White noise through a band-pass centred on the pitch: high is a hi-hat, low is wind.
      const fc = Math.min(f, rate / 7);
      const k = 2 * Math.sin(Math.PI * fc / rate);
      const x = noise() * 2 - 1;
      low += k * band;
      const high = x - low - 1.2 * band;
      band += k * high;
      v = band + 0.25 * high * (fc > 4000 ? 1 : 0);
    } else {
      phase = (phase + f / rate) % 1;
      const sine = Math.sin(2 * Math.PI * phase);
      v = r.tone === 'smooth' ? sine : 0.55 * (2 * phase - 1) + 0.45 * Math.tanh(3 * sine);   // buzzy: saw and a squared-off sine
    }
    out[i] = v * levelAt(r, sec);
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak;
  return out;
}
