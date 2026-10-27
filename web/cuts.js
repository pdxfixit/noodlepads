// Trim and chop, the pure part: where each sound in a recording starts
// (onsets), a sound's trim cleaned and fitted to its audio, where the pieces
// of a chop begin and end, the `from` note a chopped pad carries, and the
// wave editor's edits and fades (cleaned, keyed, applied to a buffer). No DOM
// and no Web Audio: functions take anything shaped like an AudioBuffer, so
// Node tests can run them. chop.js is the screen that uses them.

// A trim shorter than this is a slip, not a sound.
export const MIN_PIECE = 0.05;
// The most pads one chop makes.
export const MAX_PIECES = 16;
// A trim that ends further in than this is not a recording the app made.
const MAX_SECONDS = 600;

const ms = (s) => Math.round(s * 1000) / 1000;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// A trim, `{start, end}` in seconds into the stored audio, or null when it is
// not a usable one. With `duration` (the stored audio's length), the end is
// kept inside it.
export function cleanTrim(trim, duration = MAX_SECONDS) {
  if (!trim || typeof trim !== 'object' || !finite(trim.start) || !finite(trim.end)) return null;
  const start = ms(Math.max(0, trim.start));
  const end = ms(Math.min(duration, MAX_SECONDS, trim.end));
  return end - start >= MIN_PIECE ? { start, end } : null;
}

// A short string naming a trim, for the audio caches; '' for none.
export const trimKey = (trim) => {
  const t = cleanTrim(trim);
  return t ? `@${t.start}-${t.end}` : '';
};

// Where a sound came from: `{id, how}`, how being 'chop' or 'mix'. Null for
// anything else, so a backup cannot slip in a long or odd value.
export function cleanFrom(from) {
  if (!from || typeof from !== 'object') return null;
  const id = typeof from.id === 'string' && /^[a-z0-9-]{1,64}$/i.test(from.id) ? from.id : null;
  return id && (from.how === 'chop' || from.how === 'mix') ? { id, how: from.how } : null;
}

// The loudness of each 10 ms slice of a buffer (root mean square, across its
// channels), and how long a slice is.
function envelope(buffer, slice = 0.01) {
  const size = Math.max(1, Math.round(slice * buffer.sampleRate));
  const frames = Math.ceil(buffer.length / size);
  const out = new Float32Array(frames);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let k = 0; k < frames; k++) {
      let sum = 0;
      const end = Math.min(d.length, (k + 1) * size);
      for (let i = k * size; i < end; i++) sum += d[i] * d[i];
      out[k] = Math.max(out[k], Math.sqrt(sum / Math.max(1, end - k * size)));
    }
  }
  return { values: out, step: size / buffer.sampleRate };
}

// Where each sound in a buffer starts, in seconds, earliest first: a word, a
// drum hit, a clap. A sound starts where the level climbs well above the
// recording's own quiet (its noise floor) after a dip, or jumps sharply while
// something else is still ringing out (two hits close together). Starts
// closer than `gap` seconds count as one. At most MAX_PIECES.
export function onsets(buffer, { gap = 0.12 } = {}) {
  if (!buffer?.length) return [];
  const { values, step } = envelope(buffer);
  const sorted = Float32Array.from(values).sort();
  const peak = sorted[sorted.length - 1];
  if (peak < 0.005) return [];
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const high = Math.max(floor * 4, peak * 0.12);
  const low = high * 0.5;
  const gapFrames = Math.max(1, Math.round(gap / step));
  const out = [];
  let armed = true;   // the level has dipped since the last start
  let last = -Infinity;
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    if (v < low) { armed = true; continue; }
    if (v < high) continue;
    if (k - last < gapFrames) { armed = false; continue; }   // part of the start just found
    // A jump: at least three times the quietest of the slices just before.
    let before = Infinity;
    for (let j = Math.max(0, k - 5); j < k; j++) before = Math.min(before, values[j]);
    if (armed || v > before * 3) {
      // Start a slice early, so the very front of the sound is kept.
      out.push(ms(Math.max(0, (k - 1) * step)));
      last = k;
      armed = false;
      if (out.length >= MAX_PIECES) break;
    }
  }
  return out;
}

// Chop marks for a sound `duration` seconds long: the cuts between its
// pieces, from onsets() or dragged by hand. Sorted, inside the sound, no two
// closer than MIN_PIECE, and at most MAX_PIECES - 1 (so MAX_PIECES pieces).
export function cleanMarks(marks, duration) {
  const out = [];
  for (const m of [...marks].filter(finite).sort((a, b) => a - b)) {
    const t = ms(m);
    if (t < MIN_PIECE || t > duration - MIN_PIECE) continue;
    if (out.length && t - out[out.length - 1] < MIN_PIECE) continue;
    out.push(t);
    if (out.length >= MAX_PIECES - 1) break;
  }
  return out;
}

// The pieces a chop makes: [{start, end}] from the start of the sound to the
// first mark, mark to mark, and the last mark to the end.
export function pieces(marks, duration) {
  const cuts = [0, ...cleanMarks(marks, duration), ms(duration)];
  return cuts.slice(1).map((end, i) => ({ start: cuts[i], end }));
}

// Where a new mark goes: the middle of the longest piece, so it never lands
// on top of another. Null when there is no room for one more.
export function newMark(marks, duration) {
  const now = cleanMarks(marks, duration);
  if (now.length >= MAX_PIECES - 1) return null;
  const longest = pieces(now, duration).reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  if (longest.end - longest.start < MIN_PIECE * 2) return null;
  return ms((longest.start + longest.end) / 2);
}

// ── The wave editor: changes to part of a recording, and fades ─────────
// An edit changes one part of the stored recording when it plays: `{kind,
// start, end}` in seconds into the stored audio (the same seconds as a
// trim), plus `amount` for a gain. The recording itself is never changed;
// the edits are applied each time the sound is rendered, in order, before
// the trim and the voices. A fade is `{in, out}` seconds at the two ends of
// what the trim keeps, so it moves with the trim.

export const EDIT_KINDS = ['reverse', 'silence', 'gain'];
export const MAX_EDITS = 16;
// Louder doubles a part, Quieter halves it; taps on the same part add up, to 8× either way.
export const GAIN_STEP = 2;

// 🔊 Louder and 🔉 Quieter skip the usual evening-out (Ben, 2026-10-11): every
// render is normally scaled so its loudest moment is the same, which would
// turn a louder part into a quieter everything else. With a gain edit, the
// kept audio is scaled by the *unedited* recording's peak instead, so the
// rest sounds as it always does and the changed part really is louder or
// quieter. `keepLevel` tells the voices not to level it again. 🔊 Even it
// out (chop.js) is a gain edit over the whole recording, so it keeps its
// level the same way, and an older copy plays it as it is.
export const hasGain = (edits) => Array.isArray(edits) && edits.some((e) => e?.kind === 'gain');
export function levelForGain(kept, reference) {
  let peak = 0;
  for (let c = 0; c < reference.numberOfChannels; c++) for (const v of reference.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  const scale = peak > 0 ? 0.9 / peak : 1;
  for (let c = 0; c < kept.numberOfChannels; c++) { const d = kept.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= scale; }
  kept.keepLevel = true;
  return kept;
}
const GAIN_MAX = 8;
// Seconds blended at each edge of an edited part, so the join never clicks.
const EDGE = 0.005;

// One edit cleaned and fitted to audio `duration` seconds long, or null.
export function cleanEdit(e, duration = MAX_SECONDS) {
  if (!e || typeof e !== 'object' || !EDIT_KINDS.includes(e.kind)) return null;
  const range = cleanTrim(e, duration);
  if (!range) return null;
  if (e.kind !== 'gain') return { kind: e.kind, ...range };
  if (!finite(e.amount) || e.amount <= 0) return null;
  const amount = ms(Math.min(GAIN_MAX, Math.max(1 / GAIN_MAX, e.amount)));
  return amount === 1 ? null : { kind: 'gain', ...range, amount };
}

// A list of edits cleaned (the first MAX_EDITS that are usable), or null for none.
export function cleanEdits(edits, duration = MAX_SECONDS) {
  if (!Array.isArray(edits)) return null;
  const out = edits.slice(0, 50).map((e) => cleanEdit(e, duration)).filter(Boolean).slice(0, MAX_EDITS);
  return out.length ? out : null;
}

// A fade cleaned: seconds in and out, at least one of them above zero, or null.
export function cleanFade(fade) {
  if (!fade || typeof fade !== 'object') return null;
  const side = (v) => (finite(v) ? ms(Math.min(MAX_SECONDS, Math.max(0, v))) : 0);
  const out = { in: side(fade.in), out: side(fade.out) };
  return out.in || out.out ? out : null;
}

// The edits after one more (null for none left): Louder or Quieter on the
// part the last edit changed adds to it, Backwards twice on the same part
// cancels out, and Silence twice is once. Undefined when the list is full.
export function addEdit(edits, edit) {
  const list = cleanEdits(edits) ?? [];
  const next = cleanEdit(edit);
  const last = list.at(-1);
  const same = next && last && last.kind === next.kind && last.start === next.start && last.end === next.end;
  if (!next || (same && next.kind === 'silence')) return cleanEdits(list);
  if (same && next.kind === 'gain') return cleanEdits([...list.slice(0, -1), { ...last, amount: last.amount * next.amount }]);
  if (same && next.kind === 'reverse') return cleanEdits(list.slice(0, -1));
  if (list.length >= MAX_EDITS) return undefined;
  return [...list, next];
}

// Short strings naming the edits and the fade, for the audio caches; '' for none.
export const editsKey = (edits) => (cleanEdits(edits) ?? [])
  .map((e) => `~${e.kind[0]}${e.start}-${e.end}${e.kind === 'gain' ? `x${e.amount}` : ''}`).join('');
export const fadeKey = (fade) => {
  const f = cleanFade(fade);
  return f ? `/${f.in}-${f.out}` : '';
};
// Everything that changes the audio the voices start from: trim, edits, fade.
// An old clip with none of them gives '', so its cache key is as before.
export const cutKey = (c) => `${trimKey(c?.trim)}${editsKey(c?.edits)}${fadeKey(c?.fade)}`;

// Applies `edits` to a buffer in place (anything shaped like an AudioBuffer
// whose channel data can be written). Each edit is blended in over EDGE at
// both ends of its part, so the join never clicks.
export function applyEdits(buffer, edits) {
  const rate = buffer.sampleRate;
  for (const e of cleanEdits(edits, buffer.duration) ?? []) {
    const from = Math.round(e.start * rate);
    const to = Math.min(buffer.length, Math.round(e.end * rate));
    const n = to - from;
    if (n < 2) continue;
    const edge = Math.max(1, Math.min(Math.round(EDGE * rate), Math.floor(n / 2)));
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      const part = d.slice(from, to);
      for (let i = 0; i < n; i++) {
        const changed = e.kind === 'reverse' ? part[n - 1 - i] : e.kind === 'silence' ? 0 : part[i] * e.amount;
        const w = Math.min(1, (i + 1) / edge, (n - i) / edge);
        d[from + i] = part[i] * (1 - w) + changed * w;
      }
    }
  }
  return buffer;
}

// A recording's two edges: a few milliseconds of fade in and out, so a trim
// that lands mid-wave (or a recording that starts or stops on a loud sample)
// never clicks. Too short to hear as a fade, long enough to take the jump out.
export const EDGE_FADE_SECONDS = 0.003;

// Fades the first and last `seconds` of one channel's samples in place, a
// straight ramp from silence to full, never more than half the sound at each
// end. Returns the samples.
export function fadeEdges(samples, rate, seconds = EDGE_FADE_SECONDS) {
  const n = Math.min(Math.round(seconds * rate), Math.floor(samples.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    samples[i] *= g;
    samples[samples.length - 1 - i] *= g;
  }
  return samples;
}

// Whether a clip's kept audio gets those edges: a kid's own recording or
// sound does; a bundled preset (its loudness is measured as it is) and a beat
// made into a sound (`exact`: it loops on a grid) do not. No clip is a new
// recording that has no clip yet.
export const wantsEdges = (clip) => !clip?.exact && clip?.source !== 'bundled';

// A buffer's channels with fadeEdges applied, in place; returns the buffer.
export function softEdges(buffer, seconds = EDGE_FADE_SECONDS) {
  for (let c = 0; c < buffer.numberOfChannels; c++) fadeEdges(buffer.getChannelData(c), buffer.sampleRate, seconds);
  return buffer;
}

// Fades a buffer in place between `start` and `end` seconds: up from silence
// over the first `fade.in` seconds, down to silence over the last
// `fade.out`. Where the two overlap, the lower one wins.
export function applyFade(buffer, fade, start = 0, end = buffer.duration) {
  const f = cleanFade(fade);
  if (!f) return buffer;
  const rate = buffer.sampleRate;
  const from = Math.max(0, Math.round(start * rate));
  const n = Math.min(buffer.length, Math.round(end * rate)) - from;
  const fin = Math.round(f.in * rate), fout = Math.round(f.out * rate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const up = fin ? Math.min(1, i / fin) : 1;
      const down = fout ? Math.min(1, (n - 1 - i) / fout) : 1;
      d[from + i] *= Math.min(up, down);
    }
  }
  return buffer;
}
