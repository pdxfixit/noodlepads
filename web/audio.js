// Audio: one shared AudioContext, decoded and voiced clips cached by id, and
// playing, looping and stopping. A clip's voice is a setting, never baked in:
// the original audio is kept and the voice is rendered from it on load.
//
// This module knows nothing about pads. What the page should show (progress,
// "looping", a broken clip) is reported through `audio.on`, which app code
// fills in.

import { applyChain, chainOf, recipeKey } from './voices.js';
import { showNotice } from './ui.js';
import { ringOver } from './rhythm.js';
import { cleanTrim, cleanEdits, applyEdits, applyFade, cutKey, hasGain, levelForGain } from './cuts.js';
import { voicingOf, voice } from './instruments.js';

const MAX_LOOP_SECONDS = 600;

// A sound that is stopped early fades out over this long instead of being cut
// mid-wave, which clicks. Short enough to still sound like a cut-off.
export const FADE_SECONDS = 0.008;

// One playing sound: a buffer source through its own gain, so it can be faded
// out on its own. `dest` is where it goes (the master, or an offline render).
export function makeVoice(ctx, buffer, dest) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(dest);
  return { src, gain };
}

// Fades a voice out starting at `at` (audio-clock seconds) and stops it once
// silent. Safe on a voice that already ended.
export function fadeStop(voice, at) {
  try {
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setValueAtTime(voice.level ?? 1, at);  // a loud hit fades from its own level
    voice.gain.gain.linearRampToValueAtTime(0, at + FADE_SECONDS);
    voice.src.stop(at + FADE_SECONDS);
  } catch { /* already stopped */ }
}

// Finds the audible part of a clip, so a tap sounds right away. The threshold
// is relative to the clip's own peak, so quiet recordings still trim sensibly.
// Takes anything shaped like an AudioBuffer.
export function trimBounds(buffer) {
  const n = buffer.length;
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  if (peak < 0.005) return { start: 0, duration: buffer.duration, silent: true };
  const threshold = Math.min(0.02, peak * 0.1);
  let first = n, last = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    let i = 0; while (i < n && Math.abs(d[i]) < threshold) i++;
    let j = n - 1; while (j > i && Math.abs(d[j]) < threshold) j--;
    first = Math.min(first, i);
    last = Math.max(last, j);
  }
  const pad = Math.round(0.03 * buffer.sampleRate);
  const s = Math.max(0, first - pad);
  const e = Math.min(n, last + pad);
  return { start: s / buffer.sampleRate, duration: (e - s) / buffer.sampleRate, silent: false };
}

// How a recording came out, for the sound sheet's after-recording tip:
// 'silent' (nothing there), 'quiet' (move closer), 'loud' (it hit the top
// and crackled: move back) or 'ok'. `peak` is the loudest sample (0 to 1)
// and `rms` the average level of the part with sound in it.
export const TOO_LOUD = 0.98;    // a sample this close to full scale was clipped
export function levelVerdict(peak, rms) {
  if (!(peak >= 0.005)) return 'silent';            // trimBounds' floor; NaN counts as silent
  if (peak >= TOO_LOUD) return 'loud';
  if (peak < 0.1 || rms < 0.01) return 'quiet';     // about -20 dB peak, -40 dB average
  return 'ok';
}

// The peak of a buffer, and the average (RMS) level of its audible span.
export function levelsOf(buffer) {
  const { start, duration } = trimBounds(buffer);
  const from = Math.floor(start * buffer.sampleRate);
  const to = Math.min(buffer.length, from + Math.round(duration * buffer.sampleRate));
  let peak = 0, sum = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    for (let i = from; i < to; i++) sum += d[i] * d[i];
  }
  const count = Math.max(1, (to - from) * buffer.numberOfChannels);
  return { peak, rms: Math.sqrt(sum / count) };
}

// A copy of part of a buffer.
export function slice(buffer, start, duration) {
  const from = Math.floor(start * buffer.sampleRate);
  const length = Math.max(1, Math.min(buffer.length - from, Math.round(duration * buffer.sampleRate)));
  const out = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(from, from + length), c);
  }
  return out;
}

// The loudest sample in each of `columns` equal slices of a buffer, across
// all its channels (0 to 1): the shape the sound sheet draws as its wave.
// Takes anything shaped like an AudioBuffer.
export function peaks(buffer, columns) {
  const n = buffer.length;
  const out = new Float32Array(Math.max(0, Math.floor(columns) || 0));
  if (!n) return out;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let k = 0; k < out.length; k++) {
      const from = Math.floor((k * n) / out.length);
      const to = Math.max(from + 1, Math.floor(((k + 1) * n) / out.length));
      let m = out[k];
      for (let i = from; i < to && i < n; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
      out[k] = Math.min(1, m);
    }
  }
  return out;
}

// How many beats a looping pad repeats over while a beat plays: the fewest
// of 1, 2, 4, 8 or 16 that holds the whole sound, then whole bars of 4 beyond
// that, so every loop lines up with the beat. A sound a hair too long (2%)
// still counts as fitting.
export function loopBeats(duration, beat) {
  const need = (duration * 0.98) / beat;
  for (const n of [1, 2, 4, 8, 16]) if (n >= need) return n;
  return Math.min(MAX_LOOP_BEATS, Math.ceil(need / 4) * 4);
}
const MAX_LOOP_BEATS = 128;

// A buffer exactly `seconds` long: the first `keep` seconds of `buffer`, then
// silence. Looping it repeats the sound on a fixed grid.
export function padTo(buffer, seconds, keep = buffer.duration) {
  const length = Math.max(1, Math.round(seconds * buffer.sampleRate));
  const out = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  const copy = Math.min(length, Math.round(keep * buffer.sampleRate), buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(0, copy), c);
  return out;
}

// What the trim keeps of a stored recording, `{start, end}` seconds: the
// clip's trim, or all of it for a beat made into a sound (its length is the
// bars), or else the quiet at both ends taken off.
export function keptRange(buffer, clip) {
  const kept = cleanTrim(clip?.trim, buffer.duration);
  if (kept) return kept;
  if (clip?.exact) return { start: 0, end: buffer.duration };
  const { start, duration } = trimBounds(buffer);
  return { start, end: start + duration };
}

// The audio a clip's voices start from, out of its whole stored recording:
// its edits applied (to a copy), cut to keptRange(), then faded. The quiet
// ends are found on the recording as stored, before any edit.
export function keptAudio(buffer, clip) {
  const range = keptRange(buffer, clip);
  const edits = cleanEdits(clip?.edits, buffer.duration);
  if (!edits && !clip?.fade && clip?.exact && !cleanTrim(clip?.trim, buffer.duration)) return buffer;
  const source = edits ? applyEdits(slice(buffer, 0, buffer.duration), edits) : buffer;
  const kept = applyFade(slice(source, range.start, range.end - range.start), clip?.fade);
  return hasGain(edits) ? levelForGain(kept, slice(buffer, range.start, range.end - range.start)) : kept;
}

const noop = () => {};

export const audio = {
  ctx: null,
  master: null,
  analyser: null,
  limiter: null,         // on the master output: several loud sounds at once get held under full scale instead of clipping
  playing: new Map(),    // clip id (or 'preview') -> {src, gain, t0, duration, loop}
  ringing: new Map(),    // clip id -> its earlier hits still ringing under 🔔 Overlap: [{src, gain, end}]
  originals: new Map(),  // clip id -> Promise<AudioBuffer>, decoded and trimmed
  originalTrims: new Map(),  // clip id -> cutKey() of the trim, edits and fade `originals` holds it with
  rendered: new Map(),   // `${clip id}:${recipeKey}` -> Promise<{buffer, duration}>
  broken: new Set(),     // clip ids whose audio failed to load, decode or render

  // What the page should do when audio changes. Set once by the app.
  on: {
    started: noop,        // a sound began (start the level meter)
    progress: noop,       // (id, 0-1)
    looping: noop,        // (id, on)
    broken: noop,         // (id)
  },

  context() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      // Every clip is scaled to the same peak, so two or more at once can add
      // up past full scale; the browser would clip that into crackle. A fast,
      // hard limiter just under full scale holds the sum down instead.
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -2;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.15;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.master.connect(this.limiter);
      this.limiter.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  },

  wake() {
    const ctx = this.context();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  },

  decode(arrayBuffer) {
    return this.context().decodeAudioData(arrayBuffer);
  },

  // The clip's stored audio, decoded whole: nothing trimmed. Not cached;
  // the trim screen holds it while it is open. An instrument's preset (ADR
  // 0030) is its recording moved to its note, or several notes of it at
  // once for a chord (boards.json `shift`, `chord`): that is its stored
  // audio, so a trim, an edit or a voice works on it as on any sound.
  async decoded(clip) {
    if (clip.source === 'bundled' && voicingOf(clip)) {
      const whole = await this.recording(clip.file);
      const channels = Array.from({ length: whole.numberOfChannels }, (_, c) => voice(whole.getChannelData(c), voicingOf(clip)));
      const moved = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate: whole.sampleRate });
      channels.forEach((d, c) => moved.copyToChannel(d, c));
      return moved;
    }
    let data;
    if (clip.source === 'bundled') {
      const res = await fetch(clip.file);
      if (!res.ok) throw new Error(`${clip.file}: HTTP ${res.status}`);
      data = await res.arrayBuffer();
    } else {
      data = await clip.blob.arrayBuffer();
    }
    return this.decode(data);
  },

  // A bundled file decoded once, however many presets play it (an
  // instrument's recording: every note and chord of it reads this). Never
  // handed out to be changed: decoded() reads it and makes its own.
  recordings: new Map(),   // file -> Promise<AudioBuffer>
  recording(file) {
    if (!this.recordings.has(file)) {
      const job = fetch(file).then((res) => {
        if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
        return res.arrayBuffer();
      }).then((data) => this.decode(data));
      job.catch(() => this.recordings.delete(file));   // a failed fetch is tried again next time
      this.recordings.set(file, job);
    }
    return this.recordings.get(file);
  },

  // The clip's audio as its voices start from (keptAudio): its trim, or
  // else the quiet at both ends taken off, with the wave editor's edits and
  // fade. Cached until any of those change.
  original(clip) {
    const key = cutKey(clip);
    if (!this.originals.has(clip.id) || (this.originalTrims.get(clip.id) ?? '') !== key) {
      this.originalTrims.set(clip.id, key);
      this.originals.set(clip.id, this.decoded(clip).then((buffer) => keptAudio(buffer, clip)));
    }
    return this.originals.get(clip.id);
  },

  // Sets what original() gives for a clip as it is now (the sound sheet
  // already has it, so a new or retrimmed sound is not decoded again).
  keepOriginal(clip, promise) {
    this.originalTrims.set(clip.id, cutKey(clip));
    this.originals.set(clip.id, promise);
  },

  // Names a clip as it sounds now: its id and its voice chain. A clip with one
  // voice gets `id:voice:amount`, as before chains existed; a trim adds
  // `@start-end`, and the wave editor's edits and fade add theirs.
  key(clip) {
    return `${clip.id}:${recipeKey(clip)}${cutKey(clip)}`;
  },

  load(clip) {
    const key = this.key(clip);
    if (!this.rendered.has(key)) {
      // An exact-length clip in its normal voice keeps its full length, silent
      // tail included, so looping it keeps time.
      const plain = recipeKey(clip) === 'normal:null';
      const job = this.original(clip).then((buffer) => applyChain(buffer, chainOf(clip), clip.tweaks))
        .then((r) => (clip.exact && plain ? { ...r, duration: r.buffer.duration } : r));
      job.catch((err) => {
        console.error(`Clip ${clip.id} (${recipeKey(clip)}) did not load:`, err);
        this.broken.add(clip.id);
        this.on.broken(clip.id);
      });
      this.rendered.set(key, job);
    }
    return this.rendered.get(key);
  },

  // Drops everything cached for a clip (it was deleted, or its audio replaced).
  forget(id) {
    this.originals.delete(id);
    this.originalTrims.delete(id);
    this.dropRendered(id);
  },

  // Drops the voiced copies of a clip except the one `keep` names, so trying
  // voices on a sound doesn't leave every try in memory.
  dropRendered(id, keep) {
    for (const key of [...this.rendered.keys()]) if (key.startsWith(`${id}:`) && key !== keep) this.rendered.delete(key);
  },

  // `ring` (🔔 Overlap on 🎤 Live): the clip's earlier hits ring on under
  // this one instead of being cut off (rhythm.js ringOver). `rate` plays it
  // faster (higher) or slower, as a tune row's note does: 2 is an octave up
  // (🧸 Kids' high keys). `id` names what plays, when it is not the clip's own.
  async play(clip, { loop = false, ring = false, rate = 1, id = clip.id } = {}) {
    this.wake();
    let loaded;
    try {
      loaded = await this.load(clip);
    } catch {
      showNotice(`“${clip.label}” didn't load, so it can't play. ${clip.source === 'bundled'
        ? `Check that ${clip.file} exists and is an MP3, M4A or WAV.`
        : 'Delete it in Edit sounds and record it again.'}`);
      return;
    }
    this.start(id, loaded, { loop, clip, ring, rate });
  },

  // Every source is set to loop over the clip, and a scheduled stop decides how
  // many times it plays: once, or (looping) until loop() or stop() says so.
  // `via(ctx, src)`, when given, puts nodes between the sound and its fader
  // (the sound sheet's live preview) and returns the last of them.
  // With `ring`, a hit of the same clip still sounding (not looping) rings
  // on under the new one, up to MAX_RINGING at once; else it is cut off.
  start(id, { buffer, duration }, { loop = false, clip = null, via = null, ring = false, rate = 1 } = {}) {
    const ctx = this.wake();
    const before = this.playing.get(id);
    if (ring && before && !before.loop) {
      this.playing.delete(id);
      const { keep, cut } = ringOver([...(this.ringing.get(id) ?? []), { ...before, end: before.t0 + before.duration }], ctx.currentTime, true);
      for (const v of cut) fadeStop(v, ctx.currentTime);
      this.ringing.set(id, keep);
    } else this.stop(id);
    const { src, gain } = makeVoice(ctx, buffer, this.master);
    if (via) {
      src.disconnect();
      via(ctx, src).connect(gain);
    }
    src.loop = true;
    src.loopEnd = duration;
    if (rate !== 1) src.playbackRate.value = rate;
    const heard = duration / rate;   // how long one pass lasts at that rate
    const entry = { src, gain, t0: ctx.currentTime, duration: heard, loop, clip };  // clip: so syncLoops can restart it
    src.start(entry.t0);
    src.stop(entry.t0 + (loop ? MAX_LOOP_SECONDS : heard));
    this.playing.set(id, entry);
    this.on.looping(id, loop);
    src.onended = () => {
      if (this.playing.get(id) !== entry) return;
      this.playing.delete(id);
      this.on.progress(id, 0);
      this.on.looping(id, false);
    };
    this.on.started();
  },

  // Turns a clip that is playing into one that repeats. Its stop is pushed
  // back (a later stop() call replaces an earlier one). A clip that already
  // ended, or is still loading, is (re)started looping.
  loop(clip) {
    // While a beat plays, a loop waits for the next bar and repeats in time.
    const grid = this.grid();
    if (grid) { this.loopInTime(clip, grid); return; }
    const entry = this.playing.get(clip.id);
    if (!entry) { this.play(clip, { loop: true }); return; }
    entry.loop = true;
    entry.src.stop(entry.t0 + MAX_LOOP_SECONDS);
    this.on.looping(clip.id, true);
  },

  // Where the beat is, when one is playing: {next, beat}, the audio-clock time
  // of the next bar's "1" and the length of a beat. The app wires this to the
  // beat maker; null means no beat is playing.
  grid: () => null,

  // Starts a clip looping on the beat: from grid.next, repeating every
  // loopBeats() beats. What it was playing rings on until then.
  async loopInTime(clip, grid) {
    let loaded;
    try { loaded = await this.load(clip); } catch { return; }
    const ctx = this.wake();
    const period = loopBeats(loaded.duration, grid.beat) * grid.beat;
    const at = Math.max(grid.next, ctx.currentTime + 0.01);
    const { src, gain } = makeVoice(ctx, padTo(loaded.buffer, period, loaded.duration), this.master);
    src.loop = true;
    const entry = { src, gain, t0: at, duration: period, loop: true, clip };
    src.start(at);
    src.stop(at + MAX_LOOP_SECONDS);
    const before = this.playing.get(clip.id);
    if (before) fadeStop(before, at);
    this.playing.set(clip.id, entry);
    this.on.looping(clip.id, true);
    src.onended = () => {
      if (this.playing.get(clip.id) !== entry) return;
      this.playing.delete(clip.id);
      this.on.progress(clip.id, 0);
      this.on.looping(clip.id, false);
    };
    this.on.started();
  },

  // A beat started, or its tempo changed: every looping pad restarts on the
  // beat from its next bar.
  syncLoops() {
    const grid = this.grid();
    if (!grid) return;
    for (const entry of [...this.playing.values()]) if (entry.loop && entry.clip) this.loopInTime(entry.clip, grid);
  },

  // A looping sound plays to the end of the pass it is on, then stops.
  unloop(id) {
    const entry = this.playing.get(id);
    if (!entry?.loop) return;
    entry.loop = false;
    const passes = Math.max(1, Math.ceil((this.ctx.currentTime - entry.t0) / entry.duration));
    entry.src.stop(entry.t0 + passes * entry.duration);
    this.on.looping(id, false);
  },

  isLooping(id) {
    return !!this.playing.get(id)?.loop;
  },

  stop(id) {
    for (const v of this.ringing.get(id) ?? []) fadeStop(v, this.ctx.currentTime);   // and its hits ringing under it
    this.ringing.delete(id);
    const entry = this.playing.get(id);
    if (!entry) return;
    this.playing.delete(id);
    fadeStop(entry, this.ctx.currentTime);
    this.on.progress(id, 0);
    this.on.looping(id, false);
  },

  stopAll() {
    for (const id of new Set([...this.playing.keys(), ...this.ringing.keys()])) this.stop(id);
  },
};
