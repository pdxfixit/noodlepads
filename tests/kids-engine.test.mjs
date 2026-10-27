// One beat engine (docs/design/one-beat-engine.md): 🧸 Kids' ▶ plays through
// it. What stays the same as Kids' old player is tests/kids-same-hits.test.mjs
// (it runs on the old code too); this file is what the engine adds and the
// calls made for it (the lead, 2026-10-26): a beat plays in its own bars (a
// grown-up's 3/4 too); Kids leaves out the mixer and row speed; a stall drops
// late hits only; a sound changed or deleted plays as it is now; a double ▶
// starts one run (the child-psychologist's block); the squares light as their
// pill is heard; ● never takes over a run it cannot end.
// A stand-in audio object and clock; the engine's 25 ms tick is caught and
// called by hand, so nothing waits on real time. Not tested here: how it
// sounds, iOS's tap rule itself, and timing on a slow phone
// (`just look kids-beats --cpu 4 --height 680`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import {
  kidsPlayedRows, kidsVoiceFields, newKidsBeat, withBars, withSquare, squaresOf, squareFits, withTuneNote, barOf, totalOf, tuneRowOf, pillAt, KIDS_LOAD_WAIT,
} from '../web/kids-logic.js';
import { STEPS, cleanRow, hitsDue } from '../web/beat.js';
import { createBeatEngine } from '../web/beat-engine.js';
import { LATE_SECONDS } from '../web/audio.js';
import { MAX_RINGING } from '../web/rhythm.js';
import { cleanEntry } from '../web/log-clean.js';

const round = (t) => Math.round(t * 1e9) / 1e9;
const settle = () => new Promise((r) => setImmediate(r));

// A stand-in audio.js: a clock moved by hand (`t.now`), and every sound
// started on it ({clip, at, rate, gain, out}).
function fakeAudio({ load, duration = 0.05 } = {}) {
  const t = { now: 0, started: [], faded: [], disconnected: 0, loads: [], woke: 0 };
  const gain = () => {
    const node = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues(at) { t.faded.push(at); } },
      connect(to) { node.to = to; }, disconnect() { t.disconnected++; } };
    return node;
  };
  const ctx = {
    get currentTime() { return t.now; },
    createGain: gain,
    createBufferSource: () => {
      const src = { playbackRate: { value: 1 }, buffer: null, stop() {}, connect(to) { src.to = to; },
        start(at) { t.started.push({ clip: src.buffer.clip, sound: src.buffer.sound, at: round(at), rate: src.playbackRate.value, gain: src.to.gain.value, out: src.to.to, src }); } };
      return src;
    },
  };
  t.audio = {
    master: { name: 'master' },
    context: () => ctx,
    wake: () => { t.woke++; return ctx; },
    key: (clip) => `${clip.id}:${clip.voice ?? 'normal'}`,
    load: load ?? (async (clip) => { t.loads.push(clip.id); return { buffer: { clip: clip.id, sound: `${clip.id}:${clip.voice ?? 'normal'}` }, duration }; }),
  };
  return t;
}

// Starts a run with its tick caught: `tick()` is one 25 ms tick.
async function start(engine, hooks) {
  const plain = globalThis.setInterval;
  const ticks = [];
  globalThis.setInterval = (fn) => { ticks.push(fn); return 0; };
  try {
    const run = engine.play(hooks);
    const on = await run.ready;
    return { run, on, tick: () => ticks.forEach((f) => f()) };
  } finally {
    globalThis.setInterval = plain;
  }
}
// Moves the clock on 25 ms a tick until `until`.
function runTo(t, tick, until) {
  while (t.now < until) { t.now = round(t.now + 0.025); tick(); }
}

// ── hitsDue: what is due, pure ──

test('hitsDue: a beat\'s hits, pills and passes before a time, in its own bars, with its swing; the clocks move on', () => {
  const p = { bpm: 150, bars: 1, signature: '3/4', rows: [cleanRow({ clipId: 'kick', steps: [true, true, false, false] })] };
  const at = { clocks: [{ next: 1, step: 0 }], pass: { next: 1, pill: 0 } };
  const due = hitsDue(p, at, 1 + 14 * 0.1, { swing: 50 });
  // A pill is 0.1 s; a 3/4 bar is 12 pills, so it comes round after 12.
  assert.deepEqual(due.hits.map((h) => round(h.at)), [1, 1.15, 2.2, 2.35], 'the odd pill late by half a pill, round again at pill 12');
  assert.deepEqual(due.passes.map(round), [2.2]);
  assert.equal(due.pills.length, 14);
  assert.equal(at.clocks[0].next, 1, 'the clocks given are left as they were');
  assert.equal(round(due.clocks[0].next), 2.4);
});

test('hitsDue: an uncleaned beat books nothing it cannot time, and never loops for ever', () => {
  const at = { clocks: [], pass: { next: 0, pill: 0 } };
  for (const bpm of [-1, 0, NaN, undefined, Infinity]) {
    const due = hitsDue({ bpm, rows: [cleanRow({ clipId: 'kick', steps: [true] })] }, at, 10);
    assert.deepEqual([due.hits.length, due.pills.length], [0, 0], String(bpm));
  }
  const due = hitsDue({ bpm: 150, bars: -2, rows: [{ clipId: 'odd' }, null, cleanRow({ clipId: 'kick', steps: [true] })] }, at, 0.05);
  assert.deepEqual(due.hits.map((h) => h.row), [2], 'a row with no pills, or none at all, is skipped; the rest play');
});

test('hitsDue: only the rows asked for; with no mixer a muted, turned-down row still plays', () => {
  const p = { bpm: 150, rows: [cleanRow({ clipId: 'a', steps: [true], muted: true }), cleanRow({ clipId: 'b', steps: [true], volume: 0 }), cleanRow({ clipId: 'c', steps: [true] })] };
  const at = { clocks: [], pass: { next: 0, pill: 0 } };
  assert.deepEqual(hitsDue(p, at, 0.05).hits.map((h) => h.row), [2], 'with the mixer: mute and level 0 are silent');
  assert.deepEqual(hitsDue(p, at, 0.05, { mixer: false }).hits.map((h) => h.row), [0, 1, 2]);
  assert.deepEqual(hitsDue(p, at, 0.05, { mixer: false, rows: new Set([1]) }).hits.map((h) => h.row), [1]);
});

// ── The run ──

test('the engine: onPill every pill, onPass as it comes round, a row added while playing loads and joins on the grid, stop fades', async () => {
  const t = fakeAudio();
  t.now = 2;
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, bars: 1, rows: [cleanRow({ clipId: 'kick', steps: [true, false, false, false, true] })] };
  const pills = [];
  const passes = [];
  const { run, on, tick } = await start(engine, { beat: () => beat, startIn: 0.06, ring: () => true, onPill: (p, at) => pills.push([p, round(at)]), onPass: (at) => passes.push(round(at)) });
  const dt = 0.1;
  const t0 = 2.06;
  assert.equal(on, true);
  assert.equal(run.t0, t0);
  assert.deepEqual(pills, [[0, t0]], 'booked up to now + 0.1: the first pill');
  beat.rows.push(cleanRow({ clipId: 'snare', steps: Array(STEPS).fill(true) }));   // its sound not loaded yet
  runTo(t, tick, 2.5);
  await settle();
  runTo(t, tick, 4);
  run.stop();
  assert.ok(t.loads.includes('snare'), 'its sound loaded once it was needed');
  const snares = t.started.filter((h) => h.clip === 'snare').map((h) => h.at);
  assert.ok(snares.length > 10, `it plays: ${snares.length}`);
  for (const at of snares) assert.ok(Math.abs((at - t0) / dt - Math.round((at - t0) / dt)) < 1e-6, `on the beat's grid: ${at}`);
  assert.deepEqual(t.started.filter((h) => h.clip === 'kick').map((h) => h.at).slice(0, 3), [t0, t0 + 4 * dt, t0 + 16 * dt].map(round));
  assert.deepEqual(passes, [round(t0 + 16 * dt)], 'came round once, told when the next time round starts');
  assert.ok(t.faded.length > 0, 'stop fades what still sounds');
  assert.equal(run.stats.hits, t.started.length);
  assert.ok(run.stats.silent > 0, 'the snare\'s first hits came before its sound had loaded, and were counted');
});

test('a stall: after the clock jumps 0.5 s nothing older than 20 ms is booked, and the beat goes on in time; the pills and passes still come', async () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, bars: 1, rows: [cleanRow({ clipId: 'hat', steps: Array(STEPS).fill(true) })] };
  const pills = [];
  const { run, tick } = await start(engine, { beat: () => beat, onPill: (p, at) => pills.push(round(at)) });
  runTo(t, tick, 0.5);
  const before = t.started.length;
  t.now = 1;   // the timers slept half a second
  const bookedAt = t.now;
  tick();
  const after = t.started.slice(before);
  assert.ok(after.every((h) => h.at >= bookedAt - LATE_SECONDS), JSON.stringify(after.map((h) => h.at)));
  assert.ok(run.stats.late >= 4, `the missed hits were dropped: ${run.stats.late}`);
  runTo(t, tick, 1.5);
  run.stop();
  const all = t.started.map((h) => h.at);
  for (const at of all) assert.ok(Math.abs((at - run.t0) / 0.1 - Math.round((at - run.t0) / 0.1)) < 1e-6, `still on the grid: ${at}`);
  for (let k = 1; k < pills.length; k++) assert.ok(Math.abs(pills[k] - pills[k - 1] - 0.1) < 1e-6, 'every pill told, the missed ones too');
});

test('a sound changed between two plays plays as it is now; a deleted one is silent', async () => {
  const t = fakeAudio();
  const own = { id: 'own-1', voice: 'normal' };
  let gone = false;
  const engine = createBeatEngine({ audio: t.audio, clipById: () => null });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'own-1', steps: [true] })] };
  const hooks = { beat: () => beat, clip: (id) => (id === 'own-1' && !gone ? own : null) };
  let { run, tick } = await start(engine, hooks);
  runTo(t, tick, 0.05);
  run.stop();
  own.voice = 'robot';   // 🤖 put on it while the beat was stopped
  ({ run, tick } = await start(engine, hooks));
  runTo(t, tick, 0.1);
  run.stop();
  assert.deepEqual(t.started.map((h) => h.sound), ['own-1:normal', 'own-1:robot']);
  gone = true;   // the recording deleted
  const count = t.started.length;
  ({ run, tick } = await start(engine, hooks));
  runTo(t, tick, 0.5);
  run.stop();
  assert.equal(t.started.length, count, 'nothing plays');
  assert.ok(run.stats.silent > 0);
});

test('only the rows that play are waited for: one that never loads, and does not play, never holds ▶ up', async () => {
  const t = fakeAudio();
  const plain = t.audio.load;
  t.audio.load = (clip) => (clip.id === 'stuck' ? new Promise(() => {}) : plain(clip));
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'kick', steps: [true] }), cleanRow({ clipId: 'stuck', steps: [true] })] };
  const { run, on } = await start(engine, { beat: () => beat, rows: () => new Set([0]) });
  run.stop();
  assert.equal(on, true);
  assert.ok(!t.loads.includes('stuck'));
});

test('▶ wakes the audio first, before anything waits; a stop while the sounds load calls the start off and books nothing', async () => {
  const t = fakeAudio();
  let release;
  t.audio.load = (clip) => new Promise((r) => { release = () => r({ buffer: { clip: clip.id }, duration: 0.05 }); });
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'kick', steps: [true] })] };
  const run = engine.play({ beat: () => beat });
  assert.equal(t.woke, 1, 'woken in the same tap, before the first await');
  run.stop();
  release();
  assert.equal(await run.ready, false);
  assert.equal(run.t0, null);
  assert.equal(t.started.length, 0);
});

test('a hit that has ended lets go of its gain', async () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'kick', steps: [true] })] };
  const { run, tick } = await start(engine, { beat: () => beat });
  runTo(t, tick, 0.05);
  run.stop();
  t.started[0].src.onended();
  assert.equal(t.disconnected, 1);
});

test('a long sound hit at a fast tempo rings over itself, but at most MAX_RINGING at once; the oldest fades first', async () => {
  const t = fakeAudio({ duration: 5 });
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 180, rows: [cleanRow({ clipId: 'gong', steps: Array(STEPS).fill(true) })] };
  const { run, tick } = await start(engine, { beat: () => beat, ring: () => true, mixer: false });
  runTo(t, tick, 2);
  const hits = run.stats.hits;
  const cut = t.faded.length;   // before stop() fades what is left
  run.stop();
  assert.ok(hits > MAX_RINGING + 4, `a pile of hits: ${hits}`);
  assert.equal(MAX_RINGING, 8);
  assert.equal(cut, hits - MAX_RINGING, 'each hit past the eighth faded the oldest: 8 sound together, never more');
});

test('the engine holds its decoded sounds behind has, get, drop, keep and held', async () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  await Promise.all(['a', 'b', 'c'].map((id) => engine.prepare({ id })));
  assert.deepEqual(engine.held(), ['a', 'b', 'c']);
  assert.equal(engine.has('a'), true);
  assert.equal(engine.get('b').duration, 0.05);
  engine.drop('a');
  assert.equal(engine.has('a'), false);
  engine.keep(new Set(['c']));
  assert.deepEqual(engine.held(), ['c']);
  assert.equal(engine.ready, undefined, 'the map itself is not handed out');
});

// ── 🧸 Kids' rows and bars ──

test('🧸 Kids\' rows: each drum\'s first plain row and the first tune row; a tune row on a drum\'s sound is the tune, playing its notes only', () => {
  const beat = { rows: [
    cleanRow({ clipId: 'kick', melody: true, tune: [{ p: 0, s: 3, l: 1 }] }),   // a tune made on the kick's sound, first
    cleanRow({ clipId: 'kick', steps: [true] }),
    cleanRow({ clipId: 'bass', steps: [true] }),
    cleanRow({ clipId: 'snare', steps: [true] }),
    cleanRow({ clipId: 'kick', steps: [true] }),
  ] };
  assert.deepEqual([...kidsPlayedRows(beat, ['kick', 'snare', 'hihat', null])].sort(), [0, 1, 3]);
  const due = hitsDue({ bpm: 150, ...beat }, { clocks: [], pass: { next: 0, pill: 0 } }, 0.35, { mixer: false, rows: kidsPlayedRows(beat, ['kick', 'snare', 'hihat', null]) });
  assert.deepEqual(due.hits.filter((h) => h.row === 0).map((h) => round(h.at)), [0.3], 'the tune row: its note on pill 3, no square');
});

// A grown-up's 3/4 beat plays in 12-pill bars (the engine), so the squares, the
// bars a ● grows it to and the pill a note lands on count 12, not 16.
test('🧸 Kids\' squares, bars and notes count a grown-up\'s 3/4 bar of 12 pills, not 16', () => {
  const ids = ['kick', 'snare', 'shaker', 'clap'];
  const waltz = { ...newKidsBeat('p-a', ids, 'beat-scratch-p-a', 5), signature: '3/4' };
  assert.equal(barOf(waltz), 12);
  assert.equal(totalOf(waltz), 12);
  assert.deepEqual([0, 5, 6, 7].map((s) => squareFits(waltz, s)), [true, true, false, false], 'six squares fit a 12-pill bar');
  assert.equal(squareFits(newKidsBeat('p-a', ids, 'x', 5), 7), true, 'a 4/4 bar fits all eight');
  assert.equal(withSquare(waltz, ids, 0, 7, true), waltz, 'a square past the bar has no pill: nothing is stored');
  const grown = withBars(withSquare(waltz, ids, 2, 1, true, 6), 4, 7);
  const row = grown.rows.find((r) => r.clipId === 'shaker');
  assert.equal(grown.bars, 4);
  assert.deepEqual([2, 14, 26, 38].map((i) => row.steps[i]), [true, true, true, true], 'square 1 (pill 2) is in each 12-pill bar');
  assert.deepEqual([16, 18, 30].map((i) => row.steps[i]), [false, false, false], 'not at the 16-pill places');
  assert.equal(totalOf(grown), 48);
  assert.deepEqual(squaresOf(grown, ids)[2], [false, true, false, false, false, false, false, false], 'the grid reads bar 1; squares past the bar are never lit');
  const off = withSquare(grown, ids, 2, 1, false);
  assert.deepEqual([2, 14, 26, 38].map((i) => off.rows.find((r) => r.clipId === 'shaker').steps[i]), [false, false, false, false], 'turning it off clears every bar');
  const tuned = withTuneNote(grown, { clipId: 'note-c', pitch: 0, s: 40, l: 1, fresh: true });
  assert.equal(tuned.rows.find((r) => r.melody).steps.length, 48, 'the tune row is the beat\'s whole length');
  assert.equal(pillAt(0.025 * 50, 0.025, totalOf(grown)), 2, 'a key at pill 50 comes round to pill 2 of 48');
});

// ── The real 🧸 Kids ──

let page;
let $;
let state;
let audio;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  ({ audio } = await import('../web/audio.js'));
  audio.play = async () => {};
});

// Kids with a stand-in clock, loads held until `release()` when `slow`, and
// the engine's tick caught. `tick()` also catches the timeouts the tick
// makes (the squares to light) in `timeouts`, {fn, ms, at}: `at` the audio-clock
// time each waits for, to be called by hand.
async function kidsWithClock(slow = false) {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', 'kids');
  await page.settle();
  const ctx = audio.context();
  const t = { now: 5, booked: [], ticks: [], pending: [], timeouts: [] };
  Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => t.now });
  const plainSource = ctx.createBufferSource;
  ctx.createBufferSource = () => {
    const src = { disconnect() {}, stop() {}, playbackRate: { value: 1 }, buffer: null, connect(to) { src.to = to; },
      start(at) { t.booked.push({ clip: src.buffer?.clip, at: round(at), rate: src.playbackRate.value, gain: src.to?.gain?.value, out: src.to?.to }); } };
    return src;
  };
  const plainGain = ctx.createGain;
  ctx.createGain = () => { const g = plainGain.call(ctx); g.connect = (to) => { g.to = to; }; return g; };
  const plainLoad = audio.load;
  audio.load = (clip) => {
    const got = { buffer: { clip: clip.id }, duration: 0.05 };
    return slow ? new Promise((r) => t.pending.push(() => r(got))) : Promise.resolve(got);
  };
  t.release = () => { for (const r of t.pending.splice(0)) r(); };
  const plainInterval = globalThis.setInterval;
  globalThis.setInterval = (fn, ms) => { if (ms === 25) { t.ticks.push(fn); return 0; } return plainInterval(fn, ms); };
  const plainTimeout = globalThis.setTimeout;
  t.tick = () => {
    globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, at: round(t.now + ms / 1000) }; t.timeouts.push(h); return h; };
    try { t.ticks.forEach((f) => f()); } finally { globalThis.setTimeout = plainTimeout; }
  };
  t.rawTick = () => t.ticks.forEach((f) => f());   // the tick, with the page's own timers
  // Settles the page with the same catch, for the first tick ▶ itself makes.
  t.settle = async () => {
    globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, at: round(t.now + ms / 1000) }; t.timeouts.push(h); return h; };
    try { await page.settle(); } finally { globalThis.setTimeout = plainTimeout; }
  };
  t.done = async () => {
    globalThis.setInterval = plainInterval;
    globalThis.setTimeout = plainTimeout;
    ctx.createBufferSource = plainSource;
    ctx.createGain = plainGain;
    audio.load = plainLoad;
    delete ctx.currentTime;
    ctx.currentTime = 0;
    await setSetting('level', 'regular');
    await page.settle();
  };
  return t;
}

// The kid's scratch beat, with the squares it needs to play something.
async function kidsBeatTab() {
  const { scratchOf } = await import('../web/scratch.js');
  $('[data-kids-tab="beats"]').dispatch('click');
  if (!scratchOf(state.savedBeats.filter((b) => b.personId === state.personId), state.personId) || $('#kids-beat').querySelectorAll('.kids-square[aria-pressed="true"]').length === 0) {
    $('#kids-beat').querySelectorAll('.kids-square')[0].dispatch('click');
  }
  return () => scratchOf(state.savedBeats.filter((b) => b.personId === state.personId), state.personId);
}

// The council's block (2026-10-26): a double ▶ while the sounds loaded
// started two runs, and ⏹ stopped only one.
test('🧸 Kids ▶: shows ⏹ at once; three taps while the sounds load leave one run ticking; ⏹ then books nothing more', async () => {
  const t = await kidsWithClock(true);
  try {
    await kidsBeatTab();
    const play = $('#kids-play');
    play.dispatch('click');
    assert.equal(play.getAttribute('aria-pressed'), 'true', '⏹ on the first tap, before the sounds load');
    play.dispatch('click');
    assert.equal(play.getAttribute('aria-pressed'), 'false', 'the second tap is ⏹');
    play.dispatch('click');
    assert.equal(play.getAttribute('aria-pressed'), 'true');
    t.release();
    await page.settle();
    t.release();
    await page.settle();
    assert.equal(t.ticks.length, 1, 'one run ticking');
    for (let k = 0; k < 40; k++) { t.now += 0.025; t.tick(); }
    assert.ok(t.booked.length > 0, 'it plays');
    play.dispatch('click');
    assert.equal(play.getAttribute('aria-pressed'), 'false');
    const n = t.booked.length;
    for (let k = 0; k < 40; k++) { t.now += 0.025; t.tick(); }
    assert.equal(t.booked.length, n, '⏹ silences it');
  } finally {
    await t.done();
  }
});

test('🧸 Kids ⏹ while the sounds load calls the start off: nothing is booked and nothing ticks', async () => {
  const t = await kidsWithClock(true);
  try {
    await kidsBeatTab();
    const play = $('#kids-play');
    play.dispatch('click');
    play.dispatch('click');
    t.release();
    await page.settle();
    assert.equal(t.ticks.length, 0, 'no run ever started');
    assert.equal(t.booked.length, 0);
    assert.equal(play.getAttribute('aria-pressed'), 'false');
  } finally {
    await t.done();
  }
});

test('🧸 Kids ▶ that waits too long for its sounds gives ▶ back, not a ⏹ that stays silent', async () => {
  const t = await kidsWithClock(true);
  const wait = KIDS_LOAD_WAIT.ms;
  KIDS_LOAD_WAIT.ms = 30;
  try {
    await kidsBeatTab();
    const play = $('#kids-play');
    play.dispatch('click');
    assert.equal(play.getAttribute('aria-pressed'), 'true', 'waiting: ⏹ for now');
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(play.getAttribute('aria-pressed'), 'false', 'the wait is over: ▶ again');
    t.release();
    await page.settle();
    assert.equal(t.ticks.length, 0, 'and the late sounds start nothing');
    assert.equal(t.booked.length, 0);
  } finally {
    KIDS_LOAD_WAIT.ms = wait;
    await t.done();
  }
});

// The engine's tick calls onPill when a pill is booked; Kids lights a square
// when its pill is heard (the booking time plus the output's delay).
test('🧸 Kids\' squares light as their pill is heard, one moving per pair of pills, and go out on ⏹', async () => {
  const t = await kidsWithClock();
  const ctx = audio.context();
  ctx.outputLatency = 0.08;
  try {
    const mine = await kidsBeatTab();
    mine().bpm = 120;   // a pill is 0.125 s
    $('#kids-play').dispatch('click');
    await t.settle();
    for (let k = 0; k < 24; k++) { t.now += 0.025; t.tick(); }
    const lit = () => $('#kids-beat').querySelectorAll('.kids-square').filter((q) => q.classList.contains('now')).map((q) => Number(q.dataset.square)).filter((n, i, all) => all.indexOf(n) === i);   // one column of the four drums
    const squares = t.timeouts.filter((h) => /showSquare/.test(String(h.fn)));
    assert.ok(squares.length >= 3, `a timer a pair of pills: ${squares.length}`);
    // Pill 0 sounds at 5.06 and is heard 0.08 s later; the next square is two pills (0.25 s) on.
    assert.deepEqual(squares.slice(0, 3).map((h) => h.at), [5.14, 5.39, 5.64], 'each waits for the output');
    assert.ok(t.booked.length > 0);
    assert.deepEqual(lit(), [], 'nothing lit while it is only booked');
    squares[0].fn();
    assert.deepEqual(lit(), [0]);
    squares[1].fn();
    assert.deepEqual(lit(), [1], 'it moved on: one lit at a time');
    squares[2].fn();
    assert.deepEqual(lit(), [2]);
    $('#kids-play').dispatch('click');
    assert.deepEqual(lit(), [], '⏹ puts them out');
  } finally {
    delete ctx.outputLatency;
    await t.done();
  }
});

// The squares match the hits: a square waits for the very time its pill's
// hits were booked for (the stand-in has no output delay).
test('🧸 Kids\' square for a pill lights at the time that pill\'s hit sounds', async () => {
  const t = await kidsWithClock();
  try {
    const mine = await kidsBeatTab();
    mine().bpm = 120;
    const pid = state.personId;
    mine().rows = [cleanRow({ clipId: `${pid}-kick`, steps: [true, false, true, false, true] })];
    $('#kids-play').dispatch('click');
    await t.settle();
    for (let k = 0; k < 24; k++) { t.now += 0.025; t.tick(); }
    const kicks = t.booked.filter((h) => h.clip === `${pid}-kick`).map((h) => h.at);
    assert.deepEqual(kicks.slice(0, 3), [5.06, 5.31, 5.56], 'the kick on pills 0, 2 and 4');
    assert.deepEqual(t.timeouts.filter((h) => /showSquare/.test(String(h.fn))).slice(0, 3).map((h) => h.at), kicks.slice(0, 3), 'each square lights as its hit sounds');
    $('#kids-play').dispatch('click');
  } finally {
    await t.done();
  }
});

// ● grows the beat to four bars, counts 3, 2, 1, then starts the beat from
// `from` and ends as it comes round (onPass). A run it did not start cannot
// end it: so ● always gets a run of its own.
test('● never takes the run of a ▶ that is already playing: it ends that one, starts its own, and the recording ends as the beat comes round', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('instNotes', 'piano');
  const t = await kidsWithClock();
  try {
    const mine = await kidsBeatTab();
    mine().bpm = 600;   // a pill is 25 ms: the count is 0.3 s
    const rec = $('#kids-rec');
    $('[data-kids-tab="keys"]').dispatch('click');
    rec.dispatch('click');
    await page.settle();
    assert.equal(rec.classList.contains('counting'), true);
    // A ▶ tapped in the count (a switch, a keyboard) starts a run of its own.
    $('#kids-play').dispatch('click');
    await page.settle();
    assert.equal(t.ticks.length, 1, 'the ▶ run is ticking');
    const until = async (fn, what, ms = 3000) => {
      const t0 = Date.now();
      while (!fn()) { if (Date.now() - t0 > ms) throw new Error(`still waiting for ${what}`); await new Promise((r) => setTimeout(r, 4)); }
    };
    await until(() => rec.classList.contains('recording'), 'recording');
    assert.equal(t.ticks.length, 2, '● started a run of its own');
    assert.equal($('#kids-play').getAttribute('aria-pressed'), 'true');
    // The beat comes round: 4 bars of 16 pills, 25 ms each, from 5.3.
    for (let k = 0; k < 80; k++) { t.now += 0.025; t.rawTick(); }
    await until(() => !rec.classList.contains('recording'), 'the recording ended as the beat came round', 1000);
    assert.equal($('#kids-play').getAttribute('aria-pressed'), 'true', 'the beat plays on');
    $('#kids-stop').dispatch('click');
  } finally {
    await t.done();
  }
});

test('● on a grown-up\'s 3/4 beat: a key lands on the 12-pill bar, and the ring fills over the beat\'s own length', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('instNotes', 'piano');
  const t = await kidsWithClock();
  const plainRaf = globalThis.requestAnimationFrame;
  let ring = null;
  globalThis.requestAnimationFrame = (fn) => { ring = fn; return 1; };
  try {
    const mine = await kidsBeatTab();
    mine().bpm = 600;
    mine().signature = '3/4';
    mine().bars = 1;
    mine().rows = mine().rows.filter((r) => !r.melody).map((r) => ({ ...r, steps: r.steps.slice(0, STEPS) }));
    $('[data-kids-tab="keys"]').dispatch('click');
    const rec = $('#kids-rec');
    rec.dispatch('click');
    await page.settle();
    assert.equal(mine().bars, 4);
    assert.equal(mine().rows[0].steps.length, 48, 'four 12-pill bars');
    const until = async (fn, what, ms = 3000) => {
      const t0 = Date.now();
      while (!fn()) { if (Date.now() - t0 > ms) throw new Error(`still waiting for ${what}`); await new Promise((r) => setTimeout(r, 4)); }
    };
    await until(() => rec.classList.contains('recording'), 'recording');
    const t0 = 5.3;   // the count is 3 beats of 0.1 s from the clock's 5
    const dt = 0.025;
    t.now = t0 + 24 * dt;
    ring();
    assert.ok(Math.abs(Number(rec.style.getPropertyValue('--kids-rec')) - 0.5) < 1e-9, 'half way round 48 pills (it would be 0.375 of 64)');
    t.now = t0 + 50 * dt;   // pill 50 of a 48-pill beat: round again to pill 2
    const keys = $('#kids-keys').querySelectorAll('.kids-key');
    keys[0].dispatch('pointerdown', { pointerId: 21 });
    t.now += 2 * dt;
    keys[0].dispatch('pointerup', { pointerId: 21 });
    const tune = tuneRowOf(mine());
    assert.ok(tune, 'a tune row');
    assert.deepEqual(tune.tune.map((n) => n.s), [2], 'on pill 2 of the 12-pill bar');
    rec.dispatch('click');
    $('#kids-stop').dispatch('click');
  } finally {
    globalThis.requestAnimationFrame = plainRaf;
    await t.done();
  }
});

// What a loud pill and a found note sound like in Kids stays as it was in this
// commit (the next one changes both, as Ben decided): full level, no root.
test('🧸 Kids ▶ through kids.js sounds a loud pill and a found note as Kids always did: full level, the sound\'s own pitch', async () => {
  const t = await kidsWithClock();
  try {
    const pid = state.personId;
    const hum = { id: `user-hum-${pid}`, personId: pid, label: 'Hum', emoji: '🐝', color: 'teal', ...kidsVoiceFields(null), root: 62, created: 1 };
    state.userClips.push(hum);
    const mine = await kidsBeatTab();
    mine().bpm = 150;
    mine().bars = 1;
    mine().rows = [
      cleanRow({ clipId: `${pid}-kick`, steps: [true], accents: [true] }),
      cleanRow({ clipId: hum.id, melody: true, steps: [true], tune: [{ p: 0, s: 0, l: 1 }] }),
    ];
    $('#kids-play').dispatch('click');
    await page.settle();
    for (let k = 0; k < 2; k++) { t.now += 0.025; t.tick(); }
    $('#kids-play').dispatch('click');
    const first = t.booked.filter((h) => h.at === round(5.06));
    assert.deepEqual(first.map(({ clip, rate, gain }) => ({ clip, rate, gain })).sort((a, b) => (a.clip < b.clip ? -1 : 1)),
      [{ clip: hum.id, rate: 1, gain: 1 }, { clip: `${pid}-kick`, rate: 1, gain: 1 }].sort((a, b) => (a.clip < b.clip ? -1 : 1)));
    assert.ok(first.every((h) => h.out === audio.master), 'straight into the output');
    state.userClips.splice(state.userClips.indexOf(hum), 1);
  } finally {
    await t.done();
  }
});

test('a Kids beat stopped logs how it went, and a problem report keeps only the numbers', () => {
  const entry = cleanEntry({ kind: 'kids', data: { stopped: true, hits: 40, late: 2, silent: 1, label: 'Pip' } });
  assert.deepEqual(entry.data, { stopped: true, hits: 40, late: 2, silent: 1 });
});
