// A share's preview: the shared sound, beat or song recorded as it plays on
// the sharer's device, so anyone with the code can hear it without the app
// rebuilding it (cloud.js shareItem). Mono at 22,050 Hz keeps a 3-minute
// song near 8 MB, under the 25 MB a sound may be.

import { audio, makeVoice, fadeStop } from './audio.js';
import { encodeWav, normalize } from './wav.js';
import { cleanSong, planSong, soundSong, MAX_SONG_SECONDS } from './song.js';
import { planTake, MAX_TAKE_SECONDS } from './rhythm.js';

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

const offline = (seconds, rate = PREVIEW_RATE, channels = 1) => new OfflineAudioContext(channels, Math.max(1, Math.ceil(seconds * rate)), rate);

// deps: {seq (the beat maker: beatPlan, prepareBeats, soundHit), clipById,
// beatById, songById, leave?}. `leave`: clip ids never to sound in it (a share
// leaves out sounds too long for the cloud, cloud.js shareItem): their rows are
// taken out of every beat. Returns a WAV Blob, or null when there is nothing to hear.
export async function renderPreview(kind, id, deps) {
  const out = await renderAudio(kind, id, deps);
  return out ? encodeWav(out) : null;
}

// A take as it was heard (rhythm.js planTake): every play mixed, loops
// repeated, a hit the next one cut off stopped there with the same short
// fade, scaled just under full scale. Null when none of its sounds are here.
// deps: {clipById, loadSound (clip -> {buffer, duration}), rate, channels}.
export async function renderTake(take, { clipById, loadSound = (clip) => audio.load(clip), rate = PREVIEW_RATE, channels = 1 }) {
  const clips = [...new Set((take?.events ?? []).map((e) => e.clipId))].map((cid) => clipById(cid)).filter(Boolean);
  const loaded = new Map();
  for (const clip of clips) { try { loaded.set(clip.id, await loadSound(clip)); } catch { /* left out */ } }
  const plays = planTake(take, new Map([...loaded].map(([cid, l]) => [cid, l.duration])));
  if (!plays.length) return null;
  const seconds = Math.min(MAX_TAKE_SECONDS, Math.max(Number(take.duration) || 0, ...plays.map((p) => p.at + loaded.get(p.clipId).duration)));
  const ctx = offline(seconds, rate, channels);
  for (const { clipId, at, end } of plays) {
    const { buffer, duration } = loaded.get(clipId);
    const voice = makeVoice(ctx, buffer, ctx.destination);
    voice.src.start(at, 0, duration);
    if (end != null && end < at + duration) fadeStop(voice, end);
  }
  return normalize(await ctx.startRendering());
}

// `deps` with the sounds in `deps.leave` gone: no clip by those ids, and no
// beat row playing one.
function leaving(deps) {
  const leave = deps.leave;
  if (!leave?.size) return deps;
  const beatById = (bid) => {
    const beat = deps.beatById?.(bid);
    return beat && Array.isArray(beat.rows) ? { ...beat, rows: beat.rows.filter((r) => !leave.has(r?.clipId)) } : beat;
  };
  return { ...deps, beatById, clipById: (cid) => (leave.has(cid) ? null : deps.clipById?.(cid)) };
}

// The same as an AudioBuffer, at `deps.rate` (PREVIEW_RATE when not given),
// for playing it here: 🗂️ See all plays a beat, song or take in its list.
// `takeById` finds a take. Null when there is nothing to hear.
export async function renderAudio(kind, id, given) {
  const deps = leaving(given);
  const rate = deps.rate ?? PREVIEW_RATE;
  if (kind === 'take') {
    const take = deps.takeById?.(id);
    return take ? renderTake(take, { clipById: deps.clipById, rate }) : null;
  }
  if (kind === 'sound' && Array.isArray(id)) {
    // Several sounds in one code: each in turn, a short gap between, up to the song limit.
    const loaded = [];
    for (const x of id) {
      const clip = deps.clipById(x);
      if (clip) loaded.push(await audio.load(clip));
    }
    if (!loaded.length) return null;
    const total = Math.min(MAX_SONG_SECONDS, loaded.reduce((t, l) => t + l.duration + SOUNDS_GAP, 0));
    const ctx = offline(total, rate);
    let at = 0;
    for (const { buffer, duration } of loaded) {
      if (at >= total) break;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(at, 0, Math.min(duration, total - at));
      at += duration + SOUNDS_GAP;
    }
    return normalize(await ctx.startRendering());
  }
  if (kind === 'sound') {
    const clip = deps.clipById(id);
    if (!clip) return null;
    const { buffer, duration } = await audio.load(clip);
    const ctx = offline(duration, rate);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0, 0, duration);
    return ctx.startRendering();
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
    const ctx = offline(Math.min(MAX_SONG_SECONDS, planned.seconds) + TAIL_SECONDS, rate);
    const gains = song.lanes.map((lane) => {
      const g = ctx.createGain();
      g.gain.value = lane.volume;
      g.connect(ctx.destination);
      return g;
    });
    if (!soundSong(ctx, gains, planned, seq)) return null;
    return normalize(await ctx.startRendering());
  } else {
    return null;
  }
  if (!events.length) return null;
  await seq.prepareBeats([...plans.values()].map((p) => p.pattern));
  const ctx = offline(seconds, rate);
  const lists = new Map();
  let hits = 0;
  for (const e of events) {
    const key = `${e.beatId}:${e.row}`;
    if (!lists.has(key)) lists.set(key, []);
    if (seq.soundHit(ctx, ctx.destination, lists.get(key), plans.get(e.beatId).pattern, e.row, e.time, e.loud, e.note, e.len)) hits++;
  }
  if (!hits) return null;
  return normalize(await ctx.startRendering());
}
