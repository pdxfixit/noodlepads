// A share's preview: the shared sound, beat or song recorded as it plays on
// the sharer's device, so anyone with the code can hear it without the app
// rebuilding it (cloud.js shareItem). Mono at 22,050 Hz keeps a 3-minute
// song near 8 MB, under the 25 MB a sound may be.

import { audio } from './audio.js';
import { encodeWav, normalize } from './sequencer.js';
import { cleanSong, planSong, soundSong, MAX_SONG_SECONDS } from './song.js';

export const PREVIEW_RATE = 22_050;
export const BEAT_PASSES = 2;          // a beat plays round twice
export const TAIL_SECONDS = 1;         // room for the last hit to ring
export const SOUNDS_GAP = 0.3;         // between sounds when several are shared in one code

// How many times a beat of `seconds` plays in its preview, and how long that
// is: twice, or once when twice would pass the song limit.
export function beatPreview(seconds) {
  const passes = seconds * BEAT_PASSES <= MAX_SONG_SECONDS ? BEAT_PASSES : 1;
  return { passes, seconds: Math.min(MAX_SONG_SECONDS, seconds * passes) + TAIL_SECONDS };
}

const offline = (seconds) => new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * PREVIEW_RATE)), PREVIEW_RATE);

// deps: {seq (the beat maker: beatPlan, prepareBeats, soundHit), clipById,
// beatById, songById}. Returns a WAV Blob, or null when there is nothing to hear.
export async function renderPreview(kind, id, deps) {
  if (kind === 'sound' && Array.isArray(id)) {
    // Several sounds in one code: each in turn, a short gap between, up to the song limit.
    const loaded = [];
    for (const x of id) {
      const clip = deps.clipById(x);
      if (clip) loaded.push(await audio.load(clip));
    }
    if (!loaded.length) return null;
    const total = Math.min(MAX_SONG_SECONDS, loaded.reduce((t, l) => t + l.duration + SOUNDS_GAP, 0));
    const ctx = offline(total);
    let at = 0;
    for (const { buffer, duration } of loaded) {
      if (at >= total) break;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(at, 0, Math.min(duration, total - at));
      at += duration + SOUNDS_GAP;
    }
    return encodeWav(normalize(await ctx.startRendering()));
  }
  if (kind === 'sound') {
    const clip = deps.clipById(id);
    if (!clip) return null;
    const { buffer, duration } = await audio.load(clip);
    const ctx = offline(duration);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0, 0, duration);
    return encodeWav(await ctx.startRendering());
  }
  const { seq } = deps;
  let plans;
  let events;
  let seconds;
  if (kind === 'beat') {
    const beat = deps.beatById(id);
    if (!beat) return null;
    const plan = seq.beatPlan(beat);
    const length = beatPreview(plan.seconds);
    plans = new Map([[beat.id, plan]]);
    events = [];
    for (let pass = 0; pass < length.passes; pass++) {
      for (const h of plan.hits) events.push({ ...h, beatId: beat.id, time: h.time + pass * plan.seconds });
    }
    seconds = length.seconds;
  } else if (kind === 'song') {
    // Every lane mixed, at the song's tempo, muted lanes left out (ADR 0024).
    const song = cleanSong(deps.songById(id) ?? {}, () => 'Song', deps.beatById);
    if (!song) return null;
    const planned = planSong(song, deps.beatById, seq, { skipMuted: true });
    planned.events = planned.events.filter((e) => e.time < MAX_SONG_SECONDS);
    if (!planned.events.length) return null;
    await seq.prepareBeats([...planned.plans.values()].map((p) => p.pattern));
    const ctx = offline(Math.min(MAX_SONG_SECONDS, planned.seconds) + TAIL_SECONDS);
    const gains = song.lanes.map((lane) => {
      const g = ctx.createGain();
      g.gain.value = lane.volume;
      g.connect(ctx.destination);
      return g;
    });
    if (!soundSong(ctx, gains, planned, seq)) return null;
    return encodeWav(normalize(await ctx.startRendering()));
  } else {
    return null;
  }
  if (!events.length) return null;
  await seq.prepareBeats([...plans.values()].map((p) => p.pattern));
  const ctx = offline(seconds);
  const lists = new Map();
  let hits = 0;
  for (const e of events) {
    const key = `${e.beatId}:${e.row}`;
    if (!lists.has(key)) lists.set(key, []);
    if (seq.soundHit(ctx, ctx.destination, lists.get(key), plans.get(e.beatId).pattern, e.row, e.time, e.loud, e.note, e.len)) hits++;
  }
  if (!hits) return null;
  return encodeWav(normalize(await ctx.startRendering()));
}
