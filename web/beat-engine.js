// The beat engine: what plays a beat's hits, for every screen that plays
// one. The sounds loaded for it (`ready`), one hit (`sound`), the beat's mix
// graph (`busFor`, `letGo`) and the "play a saved beat" path (`prepareBeats`,
// `soundHit`) that 🎼 Song, the share preview, 🗂️ See all and 💃 Grooves'
// ▶ book through. It knows no screen, DOM or storage: app.js makes the one
// engine and hands it to the beat maker (sequencer.js), 🎼 Song and 🧸 Kids.
// There is no player in it yet; the loops in sequencer.js, song.js and
// kids.js still book their own hits (docs/design/one-beat-engine.md).

import { makeVoice, fadeStop } from './audio.js';
import { ACCENT_GAIN, hitGain, noteRate } from './beat.js';
import { rootShift } from './pitch.js';
import { ringOver } from './rhythm.js';
import { masterLevel, mixKey, buildMix } from './mixer.js';

export const RING_MS = 6000;   // a mix graph let go is disposed after its tails ring out

// deps: audio (audio.js's), clipById(id) (any board's sound, or null).
export function createBeatEngine({ audio, clipById }) {
  const ready = new Map();   // clip id -> {buffer, duration}, for scheduling without awaiting
  let preparing = 0;         // prepareBeats calls whose callers may still be booking from `ready`

  function prepare(clip) {
    if (!clip) return Promise.resolve();
    return audio.load(clip).then((loaded) => { ready.set(clip.id, loaded); }, () => {});
  }
  // These rows' sounds, loaded afresh (a voice may have changed since the
  // last play) without emptying `ready`: a beat or a song still playing
  // reads it. A sound that is gone is taken out, so its row stays quiet; one
  // that fails to load this time keeps the copy it had.
  function refresh(rows) {
    return Promise.all(rows.map((r) => {
      const clip = clipById(r.clipId);
      if (!clip) { ready.delete(r.clipId); return undefined; }
      return audio.load(clip).then((loaded) => { ready.set(clip.id, loaded); }, () => {});
    }));
  }


  // Plays row i's sound at `time` into `dest`. Its earlier hits still sounding
  // fade out at `time`, unless the row rings, when they overlap (up to
  // MAX_RINGING, oldest faded first). Returns how many it cut off.
  // A tune row's note (ADR 0023) plays the sound faster or slower, as a
  // sampler does, so higher notes are also shorter; a sound whose note was
  // found (🎵 Find its note, its `root`) is moved so its C plays a C. The
  // note lasts `len` seconds, then fades out (a sound shorter than that
  // ends sooner). A tune row's notes overlap, so it can play chords.
  function sound(ctx, dest, list, row, loaded, time, loud = false, note = 0, len = 0) {
    const voice = makeVoice(ctx, loaded.buffer, dest);
    voice.lift = loud ? ACCENT_GAIN : 1;   // kept, so a level change can reach a hit still ringing
    voice.level = hitGain(row, loud);
    voice.gain.gain.value = voice.level;
    const rate = noteRate(note + (row.melody ? rootShift(clipById(row.clipId)?.root) : 0));
    if (rate !== 1) voice.src.playbackRate.value = rate;
    voice.src.start(time, 0, loaded.duration);
    voice.end = time + loaded.duration / rate;
    if (len > 0 && time + len < voice.end) {
      fadeStop(voice, time + len);
      voice.end = time + len;
    }
    const { keep, cut } = ringOver(list, time, row.ring || row.melody);
    for (const v of cut) fadeStop(v, time);
    list.splice(0, list.length, ...keep, voice);
    return cut.length;
  }

  // ── The mix (mixer.js): each beat plays through its rows' effects and the
  // master's, one graph per beat and destination, built again when its
  // effects change. The master's level is set on every use, so a fader moved
  // while playing is heard at once. A graph put aside rings out first.
  const buses = new WeakMap();   // dest -> WeakMap(beat -> graph)
  // The graphs on the live context, {dest, p, bus}: 〰️ Warble and 🤖 Robot
  // run oscillators until their graph is disposed, so each is let go
  // (letGo) once what played through it stops.
  const liveMixes = new Set();
  function busFor(ctx, dest, p) {
    let made = buses.get(dest);
    if (!made) buses.set(dest, (made = new WeakMap()));
    let bus = made.get(p);
    if (!bus || bus.key !== mixKey(p)) {
      const old = bus;
      try { bus = buildMix(ctx, dest, p); } catch { bus = { key: mixKey(p), master: null, input: () => dest, dispose() {} }; }
      made.set(p, bus);
      if (ctx === audio.context()) {
        for (const m of liveMixes) if (m.bus === old) liveMixes.delete(m);
        liveMixes.add({ dest, p, bus });
        if (old) setTimeout(() => old.dispose(), RING_MS);
      }
    }
    const gain = bus.master?.gain;
    if (gain) {
      if (ctx === audio.context() && gain.setTargetAtTime) gain.setTargetAtTime(masterLevel(p), ctx.currentTime, 0.02);
      else gain.value = masterLevel(p);
    }
    return bus;
  }

  // Lets go of the live graphs `which({dest, p})` picks: forgotten now,
  // disposed once their tails have rung. A later hit builds a fresh one.
  function letGo(which) {
    for (const m of [...liveMixes]) {
      if (!which(m)) continue;
      liveMixes.delete(m);
      if (buses.get(m.dest)?.get(m.p) === m.bus) buses.get(m.dest).delete(m.p);
      setTimeout(() => m.bus.dispose(), RING_MS);
    }
  }

  // Loads every sound the beats use (fresh: a voice may have changed),
  // keeping the ones a beat or song playing now still needs. play() leaves
  // `ready` whole until a task after this settles (`preparing`), so a
  // caller must book its hits as soon as it resolves, in the same turn.
  function prepareBeats(patterns) {
    preparing++;
    let done;
    try { done = refresh(patterns.flatMap((p) => p.rows)); } catch (err) { done = Promise.reject(err); }
    done.finally(() => setTimeout(() => { preparing--; }, 0)).catch(() => {});   // whatever happened
    return done;
  }
  // Sounds row i of beat `p` at `time` into `dest`, cutting off or
  // overlapping the row's earlier hits in `list`. False if its sound is gone.
  function soundHit(ctx, dest, list, p, i, time, loud, note, len = 0) {
    const loaded = ready.get(p.rows[i]?.clipId);
    if (!loaded) return false;
    sound(ctx, busFor(ctx, dest, p).input(i), list, p.rows[i], loaded, time, loud, note, len);
    return true;
  }

  return { ready, preparing: () => preparing, prepare, refresh, sound, busFor, letGo, prepareBeats, soundHit };
}
