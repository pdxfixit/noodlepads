// How loud a sound seems, the pure part of 🔊 Even it out. Every sound plays
// with the same loudest moment (peak 0.9), yet two sounds with the same peak
// can seem very different: quiet talking with one loud clap stays quiet,
// because the clap sets the peak. This measures what an ear hears instead,
// and works out the gain that makes a kid's sound seem as loud as the
// presets. No DOM and no Web Audio: anything shaped like an AudioBuffer
// ({sampleRate, numberOfChannels, length, getChannelData}) will do, so Node
// tests run it. chop.js is the button.
//
// The measure is ITU-R BS.1770's: each channel through the K-weighting
// filter (a gentle lift above about 1.5 kHz, a cut below about 40 Hz, as an
// ear hears), then the loudest 400 ms window of it (EBU's "momentary"
// loudness, at its maximum). A sound shorter than 400 ms is measured over
// 400 ms with silence after it, so a short click seems quieter than a held
// note at the same peak, as it does to an ear. One change from BS.1770: the
// channels are averaged, not summed, so a mono recording and the same sound
// in stereo measure the same (a phone plays a mono sound on both speakers).

// A soft ceiling for audio that keeps its own level: under 0.9 it is
// untouched; above, it bends smoothly toward 1 instead of clipping. The
// voices use it on a sound with 🔊 Louder, 🔉 Quieter or Even it out in it.
export function softLimit(v) {
  const a = Math.abs(v);
  return a <= 0.9 ? v : Math.sign(v) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}

// The master output's soft clip (audio.js): softLimit's bend as a WaveShaper
// curve over -1..1. The limiter just before it holds a stack of rows under
// full scale on average, yet its 2 ms attack lets a fast peak through; this
// bends such a peak toward 0.976 instead of the speaker's hard clip. Under
// 0.9 it is the straight line, so nothing a single sound plays is touched.
// An odd number of points puts 0 exactly at the middle (silence stays silence).
export const SOFT_CLIP_POINTS = 2049;
export function softClipCurve(points = SOFT_CLIP_POINTS) {
  const n = Math.max(3, points | 1);   // odd
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = softLimit((i / (n - 1)) * 2 - 1);
  return curve;
}

// How loud the presets seem as the app plays them (each at peak 0.9, then
// turned down by its boards.json `level`): the median of the presets shown
// with Advanced off (web/boards.json `kit`), in LUFS. tests/loudness.test.mjs
// recomputes it from web/clips/kit/, so it stays honest when presets change.
export const PRESET_LOUDNESS = -14.3;

// Within this many dB of the target, a sound is already even.
export const EVEN_ENOUGH = 1;

// The most Even it out turns a sound up or down: the gain edit's own limit (cuts.js).
const MOST = 8;

const WINDOW = 0.4;   // seconds: the momentary window
const BLOCK = 0.01;   // seconds: how far apart the windows start

// The K-weighting filter's two stages for a sample rate, as biquad
// coefficients {b: [b0, b1, b2], a: [a1, a2]} (a0 is 1). The analog
// prototype is BS.1770's (as libebur128 derives it), so any rate works; at
// 48 kHz it gives the standard's own table.
export function kWeighting(rate) {
  // Stage 1: the high shelf, about +4 dB above 1.5 kHz (the head).
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / rate);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
    a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0],
  };
  // Stage 2: the high pass, below about 38 Hz (what an ear barely hears).
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan(Math.PI * f0 / rate);
  a0 = 1 + K / Q + K * K;
  const highPass = { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  return [shelf, highPass];
}

// How loud `buffer` seems, in LUFS (about -3 for a full-scale 1 kHz tone;
// -Infinity for silence). With `scale`, each sample is multiplied by it
// first, and with `limit` then held under full scale by softLimit: the sound
// as the voices would play it, without making a copy.
export function loudness(buffer, { scale = 1, limit = false } = {}) {
  const rate = buffer.sampleRate;
  const n = buffer.length;
  const channels = buffer.numberOfChannels;
  if (!n || !channels) return -Infinity;
  const [s1, s2] = kWeighting(rate);
  const size = Math.max(1, Math.round(BLOCK * rate));
  const blocks = Math.ceil(n / size);
  const energy = new Float64Array(blocks);   // the weighted energy in each block, averaged over channels
  for (let c = 0; c < channels; c++) {
    const d = buffer.getChannelData(c);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0;
    for (let i = 0; i < n; i++) {
      let x = d[i] * scale;
      if (limit) x = softLimit(x);
      const y = s1.b[0] * x + s1.b[1] * x1 + s1.b[2] * x2 - s1.a[0] * y1 - s1.a[1] * y2;
      x2 = x1; x1 = x;
      const z = s2.b[0] * y + s2.b[1] * y1 + s2.b[2] * y2 - s2.a[0] * z1 - s2.a[1] * z2;
      y2 = y1; y1 = y;
      z2 = z1; z1 = z;
      energy[Math.floor(i / size)] += (z * z) / channels;
    }
  }
  // The loudest run of `per` blocks: a 400 ms window sliding 10 ms at a time.
  const per = Math.round(WINDOW / BLOCK);
  let sum = 0;
  let most = 0;
  for (let k = 0; k < blocks; k++) {
    sum += energy[k];
    if (k >= per) sum -= energy[k - per];
    most = Math.max(most, sum);
  }
  const meanSquare = most / (per * size);
  return meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity;
}

// The loudest moment of a buffer (its peak, 0 to 1 and beyond).
export function peakOf(buffer) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  return peak;
}

// The gain that makes `buffer` (already levelled, as the voices start from
// it) seem `target` LUFS loud once softLimit holds its peaks under full
// scale. Turning up past the limiter squashes the loud parts, so the gain is
// found by halving the gap until it lands within 0.05 dB. Between 1/8 and
// 8; 1 for silence.
export function evenGain(buffer, target = PRESET_LOUDNESS) {
  const now = loudness(buffer);
  if (!Number.isFinite(now)) return 1;
  const clamp = (g) => Math.min(MOST, Math.max(1 / MOST, g));
  // Without the limiter, plain arithmetic: every dB up is a dB louder.
  const plain = clamp(10 ** ((target - now) / 20));
  if (plain * peakOf(buffer) <= 0.9) return plain;
  // The limiter only takes loudness away, so the gain is at least `plain`.
  let lo = Math.log(plain);
  let hi = Math.log(MOST);
  const heard = (logGain) => loudness(buffer, { scale: Math.exp(logGain), limit: true });
  if (heard(hi) <= target) return MOST;
  if (heard(lo) >= target) return plain;
  for (let i = 0; i < 30 && hi - lo > 0.005; i++) {
    const mid = (lo + hi) / 2;
    if (heard(mid) < target) lo = mid; else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}
