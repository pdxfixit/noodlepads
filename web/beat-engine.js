// The beat engine: what plays a beat's hits, for every screen that plays
// one. The sounds loaded for it (`ready`), one hit (`sound`), the beat's mix
// graph (`busFor`, `letGo`) and the "play a saved beat" path (`prepareBeats`,
// `soundHit`) that 🎼 Song, the share preview, 🗂️ See all and 💃 Grooves'
// ▶ book through. It knows no screen, DOM or storage: app.js makes the one
// engine and hands it to the beat maker (sequencer.js), 🎼 Song and 🧸 Kids.
// Its player (`play`) books a beat's hits on the audio clock: a loop for 🥁
// Beats and 🧸 Kids, and a planned list for 🎼 Song and 💃 Grooves' sample
// (docs/design/one-beat-engine.md). The pure rule for which hits are due is
// beat.js hitsDue.

import { makeVoice, fadeStop, tooLate } from './audio.js';
import { ACCENT_GAIN, hitGain, hitsDue, moveItem, noteRate } from './beat.js';
import { rootShift } from './pitch.js';
import { ringOver } from './rhythm.js';
import { masterLevel, mixKey, buildMix } from './mixer.js';

// How often a run books the hits due, and how many seconds it books ahead of
// the audio clock: the one pair for the beat, 🎼 Song and the beat maker's click.
export const TICK_MS = 25;
export const LOOKAHEAD = 0.1;
// ▶ to the first pill, in seconds, once the sounds are loaded.
const START_IN = 0.05;
// Mix graphs on the live context at once (busFor); past this the one used
// longest ago is let go.
const MAX_MIXES = 8;

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
    if (ctx === audio.context()) track(voice, inputs.get(dest));
    const { keep: kept, cut } = ringOver(list, time, ring || row.ring || row.melody);
    for (const v of cut) fadeStop(v, time);
    list.splice(0, list.length, ...kept, voice);
    return cut.length;
  }

  // ── The mix (mixer.js): each beat plays through its rows' effects and the
  // master's, one graph per beat and destination, built again when its
  // effects change. The master's level is set on every use, so a fader moved
  // while playing is heard at once.
  //
  // A graph belongs to a beat's id, so a beat opened, switched to or played
  // again uses the one it has; a beat with no id (a groove sample, a share
  // preview, 🎧's ▶ part) belongs to the beat object of its run. On the live
  // context a graph is listed (`liveMixes`) and let go (`letGo`) when what
  // played through it stops, or its beat is deleted, or more than MAX_MIXES
  // are listed. A graph let go is forgotten at once, so a later hit builds a
  // fresh one, and is disposed only after the last voice through it has
  // ended and its effects' tail (🔁 Echo, ⛪ Hall) has rung: 〰️ Warble and
  // 🤖 Robot run oscillators until then.
  const buses = new WeakMap();   // dest -> {ids: Map(beat id -> mix), objs: WeakMap(beat -> mix)}
  const liveMixes = new Set();   // the mixes on the live context: {id, dest, p, bus, voices, ...}
  const inputs = new WeakMap();  // a mix's input node -> its live mix, for the voices through it
  let used = 0;                  // counts busFor calls, to find the mix used longest ago
  const keyOf = (p) => (typeof p.id === 'string' && p.id ? p.id : null);
  function mixesOn(dest) {
    let held = buses.get(dest);
    if (!held) buses.set(dest, (held = { ids: new Map(), objs: new WeakMap() }));
    return held;
  }

  // A voice through a live mix is kept until it ends, and lets go of its gain
  // then. (`done` is its real end: a stopped voice ends sooner than `end`.)
  function track(voice, mix) {
    voice.src.onended = () => {
      voice.done = true;
      try { voice.gain.disconnect(); } catch { /* gone */ }
      if (mix) {
        mix.voices.delete(voice);
        mix.over = Math.max(mix.over, audio.context()?.currentTime ?? 0);
        if (mix.released) ringOut(mix);
      }
    };
    mix?.voices.add(voice);
  }
  // Disposes a mix let go once its last voice has ended and its tail rung;
  // until then looks again when the next voice ends (by its clock or its
  // own `onended`).
  function ringOut(mix) {
    clearTimeout(mix.timer);
    mix.timer = 0;
    const now = audio.context()?.currentTime ?? 0;
    let pending = -1;
    for (const v of [...mix.voices]) {
      if (v.done) mix.voices.delete(v);
      else if (v.end <= now) { mix.over = Math.max(mix.over, v.end); mix.voices.delete(v); }
      else pending = Math.max(pending, v.end);
    }
    const at = pending >= 0 ? pending : mix.over + mix.tail;
    if (pending < 0 && now >= at) { mix.bus.dispose(); return; }
    mix.timer = setTimeout(() => ringOut(mix), Math.max(0.05, at - now) * 1000);
  }
  function release(mix) {
    if (mix.released) return;
    mix.released = true;
    liveMixes.delete(mix);
    const held = buses.get(mix.dest);
    if (held && mix.id !== null && held.ids.get(mix.id) === mix) held.ids.delete(mix.id);
    else if (held && held.objs.get(mix.p) === mix) held.objs.delete(mix.p);
    ringOut(mix);
  }
  function busFor(ctx, dest, p) {
    const id = keyOf(p);
    const held = mixesOn(dest);
    let mix = id !== null ? held.ids.get(id) : held.objs.get(p);
    if (!mix || mix.bus.key !== mixKey(p)) {
      if (mix) release(mix);
      let bus;
      let made = true;
      try { bus = buildMix(ctx, dest, p); } catch { made = false; bus = { key: mixKey(p), master: null, tail: 0, input: () => dest, dispose() {} }; }
      mix = { id, dest, p, bus, voices: new Set(), over: 0, tail: bus.tail ?? 0, timer: 0, released: false, used: 0 };
      if (id !== null) held.ids.set(id, mix); else held.objs.set(p, mix);
      if (ctx === audio.context()) {
        if (made) {
          const own = bus.input;
          bus.input = (i) => { const node = own(i); inputs.set(node, mix); return node; };
        }
        liveMixes.add(mix);
        while (liveMixes.size > MAX_MIXES) {
          release([...liveMixes].filter((m) => m !== mix).reduce((a, b) => (b.used < a.used ? b : a)));
        }
      }
    }
    mix.p = p;
    mix.used = ++used;
    const gain = mix.bus.master?.gain;
    if (gain) {
      if (ctx === audio.context() && gain.setTargetAtTime) gain.setTargetAtTime(masterLevel(p), ctx.currentTime, 0.02);
      else gain.value = masterLevel(p);
    }
    return mix.bus;
  }

  // Lets go of the live graphs `which({id, dest, p})` picks: forgotten now,
  // disposed once their voices have ended and their tails rung.
  function letGo(which) {
    for (const mix of [...liveMixes]) if (which(mix)) release(mix);
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
    return hitCuts(ctx, dest, list, p, i, time, loud, note, len) !== null;
  }
  // The same, answering how many earlier hits it cut off, or null when the sound is gone.
  function hitCuts(ctx, dest, list, p, i, time, loud, note, len) {
    const loaded = ready.get(p.rows[i]?.clipId);
    if (!loaded) return null;
    return sound(ctx, busFor(ctx, dest, p).input(i), list, p.rows[i], loaded, time, loud, note, len);
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
  // A planned list in place of the loop (🎼 Song, 💃 Grooves' sample): pass
  // `hooks.list` = {events} instead of `beat`. Each event is {at (audio-clock
  // time), pattern (the planned beat), row, loud, note, len, dest (where it
  // sounds: a lane's gain, the master), key (which earlier hits it may cut)},
  // in time order. Its sounds are the caller's (prepareBeats); the run starts
  // at once and its first tick is the caller's (`run.tick()`). The tick, the
  // lookahead, the late-hit rule, the cuts, `onHit`, `afterTick`, `lookahead`,
  // the stats and `stop()` are the loop's. `onHit(clipId, at, event)`.
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
  //   onHit(clipId, at, hit) each hit booked
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
    const run = { t0: null, on: true, timer: 0, clocks: [], pass: null, voices: [], shown: [], queue: [], sounds: new Map(), loads: [], lists: new Map(), next: 0, stats: { hits: 0, late: 0, silent: 0, cuts: 0, maxRinging: 0 } };
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
    // A hit booked: counted, and told to onHit.
    const booked = (cuts, list, clipId, at, hit) => {
      run.stats.hits++;
      run.stats.cuts += cuts;
      run.stats.maxRinging = Math.max(run.stats.maxRinging, list.length);
      hooks.onHit?.(clipId, at, hit);
    };
    // The loop: every hit hitsDue says is due before `until`.
    const bookLoop = (until) => {
      const p = hooks.beat();
      // A row new since the last tick joins where the caller says (before hitsDue moves any clock on).
      if (hooks.join) p.rows.forEach((_, i) => { run.clocks[i] ??= hooks.join(i); });
      const due = hitsDue(p, run, until, { mode: hooks.mode?.() ?? 'plain', swing: hooks.swing?.(p) ?? 0, rows: hooks.rows?.(p) ?? null, mixer: mixed, steps: hooks.steps === true, skip: hooks.skip });
      run.clocks = due.clocks;
      run.pass = due.pass;
      const found = new Map();
      for (const h of due.hits) {
        if (tooLate(h.at, ctx.currentTime)) { run.stats.late++; continue; }   // missed in a stall: the beat goes on in time
        const row = p.rows[h.row];
        const got = hooks.loaded ? hooks.loaded(row.clipId) : soundOf(row.clipId, found);
        if (!got) { run.stats.silent++; continue; }
        const list = run.voices[h.row] ??= [];
        const dest = mixed ? busFor(ctx, audio.master, p).input(h.row) : audio.master;
        const cuts = sound(ctx, dest, list, row, got.loaded, h.at, h.loud, h.note, h.len, { clipOf: () => got.clip, ring: hooks.ring?.(row), level: mixed ? null : hitGain(row, h.loud) * masterLevel(p) });
        booked(cuts, list, row.clipId, h.at, h);
      }
      if (due.steps.length) {
        run.queue.push(...due.steps);
        run.queue.sort((a, b) => a.time - b.time);
      }
      for (const { pill, at } of due.pills) hooks.onPill?.(pill, at);
      for (const at of due.passes) hooks.onPass?.(at);
    };
    // The list: every event due before `until`, through its beat's mix into its destination.
    const bookList = (until) => {
      const { events } = hooks.list;
      while (run.next < events.length && events[run.next].at < until) {
        const e = events[run.next++];
        if (tooLate(e.at, ctx.currentTime)) { run.stats.late++; continue; }   // missed in a stall: the song goes on in time
        if (!run.lists.has(e.key)) run.lists.set(e.key, []);
        const list = run.lists.get(e.key);
        const cuts = hitCuts(ctx, e.dest, list, e.pattern, e.row, e.at, e.loud, e.note, e.len);
        if (cuts === null) { run.stats.silent++; continue; }
        booked(cuts, list, e.pattern.rows[e.row].clipId, e.at, e);
      }
    };
    const tick = () => {
      if (!run.on) return;
      const until = Math.min(ctx.currentTime + (hooks.lookahead ?? LOOKAHEAD), hooks.limit?.() ?? Infinity);
      hooks.beforeRows?.(until);
      if (hooks.list) bookList(until); else bookLoop(until);
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
      for (const list of [...run.voices, ...run.lists.values()]) for (const v of list ?? []) fadeStop(v, now);
      run.voices = [];
      run.lists = new Map();
      run.queue = [];
      run.shown = run.shown.map(() => -1);
      return run.stats;
    };
    if (hooks.list) {
      // A planned list on the caller's own sounds: going at once, its first tick the caller's.
      run.timer = setInterval(tick, TICK_MS);
      run.ready = Promise.resolve(true);
      return run;
    }
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
    preparing: () => preparing, mixes: () => liveMixes.size, has, get, drop, keep, held,
    prepare, refresh, sound, busFor, letGo, prepareBeats, soundHit, play,
  };
}
