// 🎵 Find its note (Advanced): which musical note a sound is, so a kid hears
// "your burp is a G", and so melody rows can play any pitched sound in tune.
// Pure: arrays in, a note out.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (midi) => NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12];
export const midiOf = (hz) => 69 + 12 * Math.log2(hz / 440);

const WINDOW_SECONDS = 0.045;    // long enough for a 45 Hz hum to repeat twice
const LOWEST = 50, HIGHEST = 2000;
const CLEAR = 0.2;                // YIN: below this a repeat is clear enough to be a note

// The pitch of one stretch of samples, by YIN (how much the sound looks like
// itself shifted by each candidate period), or null when nothing repeats.
function windowPitch(x, from, size, rate) {
  const tauMin = Math.max(2, Math.floor(rate / HIGHEST));
  const tauMax = Math.min(Math.floor(size / 2), Math.ceil(rate / LOWEST));
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < size - tauMax; j++) { const diff = x[from + j] - x[from + j + tau]; sum += diff * diff; }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference: 1 means "nothing like itself".
  let running = 0;
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) { running += d[tau]; cmnd[tau] = running ? (d[tau] * tau) / running : 1; }
  let tau = tauMin;
  while (tau <= tauMax && cmnd[tau] >= CLEAR) tau++;
  if (tau > tauMax) return null;
  while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
  // A parabola through the dip and its neighbours finds the period between samples.
  const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1] ?? b;
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return { hz: rate / (tau + (Math.abs(shift) < 1 ? shift : 0)), clarity: 1 - b };
}

// The note a sound (anything shaped like an AudioBuffer) sounds like:
// {midi, name, hz}, or null when it is more noise than note (a clap, a hiss).
// Looks at several stretches of its loudest part and takes the middle answer.
export function findNote(buffer) {
  const rate = buffer.sampleRate;
  const n = buffer.length;
  const x = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i]; }
  const size = Math.round(WINDOW_SECONDS * rate);
  if (n < size * 2) return null;
  // Where it is loudest, in steps of half a window.
  const hop = Math.floor(size / 2);
  const levels = [];
  for (let from = 0; from + size <= n; from += hop) {
    let sum = 0;
    for (let i = from; i < from + size; i++) sum += x[i] * x[i];
    levels.push({ from, level: sum });
  }
  levels.sort((p, q) => q.level - p.level);
  const loudest = levels[0]?.level || 0;
  if (!loudest) return null;
  const found = levels.slice(0, 7)
    .filter((w) => w.level > loudest * 0.2)
    .map((w) => windowPitch(x, w.from, size, rate))
    .filter(Boolean);
  if (found.length < Math.min(2, levels.length)) return null;
  const midis = found.map((f) => midiOf(f.hz)).sort((p, q) => p - q);
  const midi = midis[Math.floor(midis.length / 2)];
  if (!(midi >= 0 && midi <= 127)) return null;
  return { midi: Math.round(midi), name: noteName(midi), hz: 440 * 2 ** ((midi - 69) / 12) };
}

// How many notes a melody row moves a sound with root note `root` so its
// lowest lane plays a C: the nearest way, at most 6 notes either way, so the
// sound stays itself. 0 for a sound with no known note.
export function rootShift(root) {
  if (!Number.isInteger(root)) return 0;
  return ((((60 - root) % 12) + 18) % 12) - 6;
}
