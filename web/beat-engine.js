// The beat engine: what plays a beat's hits, for every screen that plays
// one. The sounds loaded for it (`ready`), one hit (`sound`), the beat's mix
// graph (`busFor`, `letGo`) and the "play a saved beat" path (`prepareBeats`,
// `soundHit`) that 🎼 Song, the share preview, 🗂️ See all and 💃 Grooves'
// ▶ book through. It knows no screen, DOM or storage: app.js makes the one
// engine and hands it to the beat maker (sequencer.js), 🎼 Song and 🧸 Kids.
// Its player (`play`) loops a beat on the audio clock for 🥁 Beats and 🧸
// Kids; the loop in song.js still books its own hits until it moves onto it
// (docs/design/one-beat-engine.md). The pure rule for which hits are due is
// beat.js hitsDue.

import { makeVoice, fadeStop, tooLate } from './audio.js';
import { ACCENT_GAIN, RING_MS, hitGain, hitsDue, moveItem, noteRate } from './beat.js';
import { rootShift } from './pitch.js';
import { ringOver } from './rhythm.js';
import { masterLevel, mixKey, buildMix } from './mixer.js';

// How often a run books the hits due, and how many seconds it books ahead of
// the audio clock; the beat maker and 🎼 Song keep the same pair.
const TICK_MS = 25;
const LOOKAHEAD = 0.1;
// ▶ to the first pill, in seconds, once the sounds are loaded.
const START_IN = 0.05;

// deps: audio (audio.js's), clipById(id) (any board's sound, or null).
export function createBeatEngine({ audio, clipById }) {
  const ready = new Map();   // clip id -> {buffer, duration}, for scheduling without awaiting; read through has/get/drop/keep/held
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


  // What is decoded for scheduling, by clip id (nothing outside reaches `ready`).
  const has = (id) => ready.has(id);
  const get = (id) => ready.get(id);
  const drop = (id) => ready.delete(id);
  const held = () => [...ready.keys()];
  // Keeps only the sounds of these clip ids (a Set); the others are let go.
  function keep(ids) {
    for (const id of held()) if (!ids.has(id)) ready.delete(id);
  }

  // Plays row i's sound at `time` into `dest`. Its earlier hits still sounding
  // fade out at `time`, unless the row rings, when they overlap (up to
  // MAX_RINGING, oldest faded first). Returns how many it cut off.
  // A tune row's note (ADR 0023) plays the sound faster or slower, as a
  // sampler does, so higher notes are also shorter; a sound whose note was
  // found (🎵 Find its note, its `root`) is moved so its C plays a C. The
  // note lasts `len` seconds, then fades out (a sound shorter than that
  // ends sooner). A tune row's notes overlap, so it can play chords.
  // `opts` (a player that is not the beat maker's): clipOf(id) finds the
  // row's sound (its `root`); ring true lets every hit ring; level is the
  // hit's own gain (a player with no 🎚️ Mixer, 🧸 Kids, gives it).
  function sound(ctx, dest, list, row, loaded, time, loud = false, note = 0, len = 0, { clipOf = clipById, ring = false, level = null } = {}) {
    const voice = makeVoice(ctx, loaded.buffer, dest);
    voice.lift = loud ? ACCENT_GAIN : 1;   // kept, so a level change can reach a hit still ringing
    voice.level = level ?? hitGain(row, loud);
    voice.gain.gain.value = voice.level;
    const rate = noteRate(note + (row.melody ? rootShift(clipOf(row.clipId)?.root) : 0));
    if (rate !== 1) voice.src.playbackRate.value = rate;
    voice.src.start(time, 0, loaded.duration);
    voice.end = time + loaded.duration / rate;
    if (len > 0 && time + len < voice.end) {
      fadeStop(voice, time + len);
      voice.end = time + len;
    }
    const { keep: kept, cut } = ringOver(list, time, ring || row.ring || row.melody);
    for (const v of cut) fadeStop(v, time);
    list.splice(0, list.length, ...kept, voice);
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

  // Loops the beat `hooks.beat()` from its first pill until the run's
  // stop(). Returns the run at once, before its sounds have loaded, so a
  // second ▶ or a ⏹ in the meantime sees it: `ready` resolves true once it
  // plays, false when it was stopped (or `go()` said no) first, and a run
  // stopped while loading books nothing. The beat is read again on every
  // tick, so a pill, a row or a tempo changed while it plays lands at once.
  // Each tick asks hitsDue (beat.js) for what is due and books it; a hit
  // whose moment passed in a stall is dropped (audio.js tooLate) while the
  // clocks, the pills and the passes go on in time. A row's sound is found
  // again each tick (`clip`) and kept by how it sounds now (audio.key: its
  // voice, trim, edits), so a sound changed or deleted while the screen was
  // away plays as it is now, or not at all.
  // hooks (only `beat` is needed):
  //   beat()            the beat to play now: rows, bpm, bars, signature, swing
  //   clip(id)          a row's sound, or null when it is gone (else the engine's clipById)
  //   from              the audio-clock time of the first pill; else
  //   startIn           seconds after the sounds have loaded (0.05)
  //   go()              asked once they have: false calls it off
  //   lookahead         seconds booked ahead (0.1)
  //   mode()            'plain' (every row on the beat) or 'speed' (a row's own rate)
  //   swing(beat)       0-50 (else 0)
  //   ring(row)         true: its hits never cut each other (else its 🔔); at most MAX_RINGING sound
  //   rows(beat)        a Set of the row indexes that play (else every row);
  //                     only their sounds are waited for before the first pill
  //   mixer             false: no 🎚️ Mixer (no effects, mute or solo), straight into
  //                     the output: every row it plays sounds, at its own volume
  //                     times the beat's Master volume as a plain gain (a loud hit
  //                     at ACCENT_GAIN times that)
  //   onPill(pill, at)  each pill of the beat's plain grid, as it is booked
  //   onPass(at)        each time round, as it is booked: `at` the next one's start
  //   onHit(clipId, at) each hit booked
  // Only the beat maker (🥁 Beats) uses these:
  //   loaded(id)        the row's sound {clip, loaded} from the caller's own
  //                     (the engine's `ready`), or null: the run loads nothing,
  //                     starts at `from` at once, and the caller books the first
  //                     tick itself (`run.tick()`) when it is ready for it
  //   steps             true: every pill each row passes is kept in run.queue, to light the playhead as it is heard
  //   limit()           the latest moment to book up to (a chip switch waits for its bar line)
  //   beforeRows(until) asked at the start of a tick, before any row: the click
  //   join(i)           a row new since the last tick, its clock {next, step} (else it joins a same-speed row)
  //   skip(row, next, dt)  true: this pill was played live, book none of its hits
  //   afterTick()       asked at the end of a tick
  // The run: {t0, ready, tick(), stop(), stats: {hits, late, silent, cuts, maxRinging}} and what it
  // keeps for the playhead and the row edits: clocks (per row {next, step}), pass,
  // voices (per row), shown (per row the pill heard, or -1) and queue (the pills
  // booked, {row, step, time}, to be heard).
  function play(hooks) {
    const ctx = audio.wake();   // first, in the tap itself: iOS starts audio only there
    const clipOf = hooks.clip ?? clipById;
    const mixed = hooks.mixer !== false;
    const run = { t0: null, on: true, timer: 0, clocks: [], pass: null, voices: [], shown: [], queue: [], sounds: new Map(), loads: [], stats: { hits: 0, late: 0, silent: 0, cuts: 0, maxRinging: 0 } };
    const stopped = new Promise((resolve) => { run.cancel = resolve; });   // a stop ends the wait for sounds that never come
    // A row's sound as it is now: {clip, loaded}, or null while it loads or when it is gone.
    const soundOf = (id, found) => {
      if (!found.has(id)) found.set(id, id ? clipOf(id) ?? null : null);
      const clip = found.get(id);
      if (!clip) return null;
      const key = audio.key?.(clip) ?? clip.id;
      if (!run.sounds.has(key)) {
        run.sounds.set(key, null);
        const loading = Promise.resolve(audio.load(clip)).then((got) => { run.sounds.set(key, got); }, () => {});
        run.loads?.push(loading);   // before the first pill ▶ waits for them; later a sound plays once it has loaded
        return null;
      }
      const loaded = run.sounds.get(key);
      return loaded ? { clip, loaded } : null;
    };
    const tick = () => {
      if (!run.on) return;
      const now = ctx.currentTime;
      const until = Math.min(now + (hooks.lookahead ?? LOOKAHEAD), hooks.limit?.() ?? Infinity);
      hooks.beforeRows?.(until);
      const p = hooks.beat();
      // A row new since the last tick joins where the caller says (before hitsDue moves any clock on).
      if (hooks.join) p.rows.forEach((_, i) => { run.clocks[i] ??= hooks.join(i); });
      const due = hitsDue(p, run, until, { mode: hooks.mode?.() ?? 'plain', swing: hooks.swing?.(p) ?? 0, rows: hooks.rows?.(p) ?? null, mixer: mixed, steps: hooks.steps === true, skip: hooks.skip });
      run.clocks = due.clocks;
      run.pass = due.pass;
      const found = new Map();
      for (const h of due.hits) {
        if (tooLate(h.at, now)) { run.stats.late++; continue; }   // missed in a stall: the beat goes on in time
        const row = p.rows[h.row];
        const got = hooks.loaded ? hooks.loaded(row.clipId) : soundOf(row.clipId, found);
        if (!got) { run.stats.silent++; continue; }
        const list = run.voices[h.row] ??= [];
        const dest = mixed ? busFor(ctx, audio.master, p).input(h.row) : audio.master;
        const cuts = sound(ctx, dest, list, row, got.loaded, h.at, h.loud, h.note, h.len, { clipOf: () => got.clip, ring: hooks.ring?.(row), level: mixed ? null : hitGain(row, h.loud) * masterLevel(p) });
        // A hit that has ended lets go of its gain, so a long play holds no nodes.
        const voice = list.at(-1);
        voice.src.onended = () => { try { voice.gain.disconnect(); } catch { /* gone */ } };
        run.stats.hits++;
        run.stats.cuts += cuts;
        run.stats.maxRinging = Math.max(run.stats.maxRinging, list.length);
        hooks.onHit?.(row.clipId, h.at);
      }
      if (due.steps.length) {
        run.queue.push(...due.steps);
        run.queue.sort((a, b) => a.time - b.time);
      }
      for (const { pill, at } of due.pills) hooks.onPill?.(pill, at);
      for (const at of due.passes) hooks.onPass?.(at);
      hooks.afterTick?.();
    };
    run.tick = tick;
    // The first pill's time, every row's clock on it, and the timer.
    const begin = (first) => {
      run.t0 = hooks.from ?? ctx.currentTime + (hooks.startIn ?? START_IN);
      run.pass = { next: run.t0, pill: 0 };
      run.clocks = (first.rows ?? []).map(() => ({ next: run.t0, step: 0 }));
      run.voices = (first.rows ?? []).map(() => []);
      run.shown = (first.rows ?? []).map(() => -1);
      run.timer = setInterval(tick, TICK_MS);
    };
    // The run keeps its rows' clocks, voices and playhead in lists with one
    // entry a row. The beat maker edits its rows while the beat plays; these
    // keep the lists in step, so a row moved or removed carries on in time
    // with its own sounds ringing, and one put in joins on the grid.
    // `where` is moveItem's answer for the rows: where each row went.
    run.moveRow = (from, to, where) => {
      for (const list of [run.voices, run.clocks, run.shown]) moveItem(list, from, to);
      run.queue = run.queue.map((q) => ({ ...q, row: where[q.row] }));
    };
    run.removeRow = (i) => {
      for (const v of run.voices[i] || []) fadeStop(v, ctx.currentTime);
      run.voices.splice(i, 1);
      run.clocks.splice(i, 1);
      run.shown.splice(i, 1);
      run.queue = run.queue.filter((q) => q.row !== i).map((q) => (q.row > i ? { ...q, row: q.row - 1 } : q));
    };
    run.insertRow = (i) => {
      run.voices.splice(i, 0, []);
      run.clocks.splice(i, 0, undefined);   // joins on the next tick (hooks.join)
      run.shown.splice(i, 0, -1);
      run.queue = run.queue.map((q) => (q.row >= i ? { ...q, row: q.row + 1 } : q));
    };
    // A tempo change: every time not yet booked, mapped by `move` (beat.js retimeAt).
    run.retime = (move) => {
      run.t0 = move(run.t0);
      for (const c of run.clocks) if (c) c.next = move(c.next);
      if (run.pass) run.pass.next = move(run.pass.next);
    };
    // Another beat takes over from its first pill at `at`, on the same clock:
    // `rows` clocks start there; the old beat's voices are the caller's to keep ringing.
    run.restart = (rows, at) => {
      run.t0 = at;
      run.pass = { next: at, pill: 0 };
      run.clocks = Array.from({ length: rows }, () => ({ next: at, step: 0 }));
      run.voices = Array.from({ length: rows }, () => []);
      run.shown = Array.from({ length: rows }, () => -1);
      run.queue = [];
    };
    run.stop = () => {
      if (!run.on) return run.stats;
      run.on = false;
      run.cancel();
      clearInterval(run.timer);
      run.timer = 0;
      const now = ctx.currentTime;
      for (const list of run.voices) for (const v of list ?? []) fadeStop(v, now);
      run.voices = [];
      run.queue = [];
      run.shown = run.shown.map(() => -1);
      return run.stats;
    };
    if (hooks.loaded) {
      // The caller's own sounds are there: the run is going at once, and its
      // first tick is the caller's to call (run.tick()).
      begin(hooks.beat());
      run.ready = Promise.resolve(true);
      return run;
    }
    run.ready = (async () => {
      // Only the sounds of the rows that play are waited for.
      const first = hooks.beat();
      const plays = hooks.rows?.(first) ?? null;
      const found = new Map();
      (first.rows ?? []).forEach((r, i) => { if (r && (!plays || plays.has(i))) soundOf(r.clipId, found); });
      await Promise.race([Promise.all(run.loads), stopped]);
      run.loads = null;
      if (!run.on || hooks.go?.() === false) { run.on = false; return false; }
      begin(first);
      tick();
      return true;
    })();
    return run;
  }

  return {
    preparing: () => preparing, has, get, drop, keep, held,
    prepare, refresh, sound, busFor, letGo, prepareBeats, soundHit, play,
  };
}
