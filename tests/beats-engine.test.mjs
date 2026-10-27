// One beat engine (docs/design/one-beat-engine.md), step 6: 🥁 Beats' loop
// is the engine's. What Beats adds to the run is tested here, on a stand-in
// audio object and a clock moved by hand: hitsDue's `steps` (the playhead's
// pills) and `skip` (a pill a live hit already played); a run whose sounds
// are the caller's (`loaded`) going at once, with its first tick the
// caller's; the hooks Beats uses (`limit`, `beforeRows`, `join`, `afterTick`);
// the cuts and ringing counts its stop logs; a row moved, removed or put in
// while the beat plays keeps its clock and its voices (6b, which had no test
// before); and, through Beats itself, a chip switch at the bar line restarts
// every row and ↩️ Undo of a removed row puts its voices back in step. That
// Beats still books the same hits is tests/beats-same-hits.test.mjs.
//
// Not tested here: how it sounds; timing on a slow phone
// (`just look beats --cpu 4 --height 680`); and the exact pill a row put in
// while the beat plays first sounds on. It copies a same-speed row's clock
// as the clocks came in (the old loop copied clocks that earlier rows had
// already moved on in the same tick), so it may differ from before the
// engine by one tick (up to 0.1 s of pills); the "put in" test's assertion
// about where it starts is loose for that reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRow, hitsDue, moveItem } from '../web/beat.js';
import { createBeatEngine } from '../web/beat-engine.js';

const round = (t) => Math.round(t * 1e9) / 1e9;

// A stand-in audio.js: a clock moved by hand (`t.now`), and every sound
// started on it ({clip, at, src}); `t.faded` the voices stopped by a fade.
function fakeAudio() {
  const t = { now: 0, started: [], faded: [] };
  const ctx = {
    get currentTime() { return t.now; },
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const src = { playbackRate: { value: 1 }, buffer: null, connect() {}, start(at) { t.started.push({ clip: src.buffer.clip, at: round(at), src }); }, stop(at) { t.faded.push({ src, at }); } };
      return src;
    },
  };
  t.audio = { master: {}, context: () => ctx, wake: () => ctx, key: (clip) => clip.id, load: async (clip) => ({ buffer: { clip: clip.id }, duration: 0.3 }) };
  return t;
}

// A run with its tick caught; the caller's first tick is `run.tick()`.
function begin(engine, hooks) {
  const plain = globalThis.setInterval;
  const ticks = [];
  globalThis.setInterval = (fn) => ticks.push(fn);
  try {
    return { run: engine.play(hooks), ticks };
  } finally {
    globalThis.setInterval = plain;
  }
}
const loadedOf = (...ids) => (id) => (ids.includes(id) ? { clip: { id }, loaded: { buffer: { clip: id }, duration: 0.3 } } : null);
const on = (n, ...pills) => Array.from({ length: n }, (_, i) => pills.includes(i));
function runTo(t, run, until) {
  while (t.now < until) { t.now = round(t.now + 0.025); run.tick(); }
}

test('hitsDue: `steps` gives every pill each row passes, with its swung time; `skip` is asked of every pill and takes its hits out', () => {
  const p = { bpm: 150, swing: 50, rows: [cleanRow({ clipId: 'a', steps: on(16, 0, 1, 2) }), cleanRow({ clipId: 'b', muted: true, steps: on(16, 0, 1, 2) })] };
  const at = { clocks: [{ next: 1, step: 0 }, { next: 1, step: 0 }], pass: { next: 1, pill: 0 } };
  const asked = [];
  const due = hitsDue(p, at, 1.35, { swing: 50, steps: true, skip: (row, next, dt) => { asked.push([row, round(next)]); return row === 0 && round(next) === 1.1; } });
  assert.deepEqual(due.steps.filter((s) => s.row === 0).map((s) => [s.step, round(s.time)]), [[0, 1], [1, 1.15], [2, 1.3], [3, 1.35]], 'swung: the "and" two pills late, the odd pill half a pill, as they sound');
  assert.equal(due.steps.filter((s) => s.row === 1).length, 4, 'a muted row passes its pills too');
  assert.deepEqual(due.hits.map((h) => [h.row, round(h.at)]), [[0, 1], [0, 1.3]], 'pill 1 was played live: not booked again; the muted row books none');
  assert.deepEqual(asked.filter(([row]) => row === 1).map(([, next]) => next), [1, 1.1, 1.2, 1.3], 'asked of the muted row too, so a skip is used up where it fell');
  assert.deepEqual(hitsDue(p, at, 1.35, { swing: 50 }).steps, [], 'only when asked for');
});

test('a run on the caller\'s own sounds goes at once; its first tick, the hooks and the playhead\'s pills are the caller\'s', () => {
  const t = fakeAudio();
  t.now = 3;
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'kick', steps: on(16, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15), ring: true })] };
  const order = [];
  let limit = Infinity;
  const { run, ticks } = begin(engine, {
    beat: () => beat, from: 3.2, steps: true, loaded: loadedOf('kick', 'snare'), limit: () => limit,
    beforeRows: (until) => order.push(['before', round(until)]), afterTick: () => order.push(['after']), onHit: (clip, at) => order.push(['hit', clip, round(at)]),
  });
  assert.equal(ticks.length, 1, 'its timer is going');
  assert.equal(run.t0, 3.2, 'from the caller');
  assert.deepEqual(run.clocks, [{ next: 3.2, step: 0 }]);
  assert.deepEqual([run.voices.length, run.shown, run.queue], [1, [-1], []]);
  assert.equal(t.started.length, 0, 'nothing is booked until the caller ticks');
  t.now = 3.11;
  run.tick();
  assert.deepEqual(order.slice(0, 2), [['before', 3.21], ['hit', 'kick', 3.2]], 'the click first, then the hits (the lookahead is 0.1 s)');
  assert.deepEqual(order.at(-1), ['after']);
  assert.deepEqual(run.queue.map((q) => [q.row, q.step, round(q.time)]), [[0, 0, 3.2]], 'the pill booked, to be heard');
  assert.equal(run.stats.hits, 1);
  // The latest moment to book up to, as the chip switch asks for the bar line.
  limit = 3.31;
  runTo(t, run, 3.6);
  assert.equal(t.started.at(-1).at, 3.3, 'nothing at or past the limit');
  limit = Infinity;
  runTo(t, run, 3.9);
  assert.ok(t.started.at(-1).at > 3.7, 'and on again once the limit lifts');
  assert.ok(run.stats.maxRinging > 1 && run.stats.cuts === 0, `a row that rings: ${run.stats.maxRinging} voices, no cuts`);
  run.stop();
  assert.deepEqual([run.queue, run.shown], [[], [-1]], 'a stop leaves nothing to light');
  assert.ok(t.faded.length > 0, 'and fades what sounds');
});

test('a sound the caller has not got is silent and counted; a row with no clock yet joins where the caller says (before the clocks move on)', () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'kick', steps: on(16, 0, 4, 8, 12) })] };
  const joined = [];
  const { run } = begin(engine, { beat: () => beat, from: 0, loaded: loadedOf('kick'), join: (i) => { joined.push([i, round(run.clocks[0].next)]); return { next: 0.3, step: 3 }; } });
  run.tick();
  assert.deepEqual(joined, [], 'row 0 has its clock');
  beat.rows.push(cleanRow({ clipId: 'gone', steps: on(16, 3, 4) }));   // a row added while playing, with no sound
  t.now = 0.2;
  run.tick();
  assert.equal(joined.length, 1);
  assert.deepEqual(run.clocks[1].step, 4, 'it joined at pill 3 and is on pill 4 after the one pill booked');
  runTo(t, run, 0.6);
  assert.ok(run.stats.silent >= 1, 'its hit had no sound to play');
  assert.equal(t.started.filter((h) => h.clip === 'gone').length, 0);
  run.stop();
});
// ── 6b: row edits while the beat plays ──

// Three rows, every pill on, ringing, a run going and some time played.
function playing(rows = ['a', 'b', 'c']) {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: rows.map((clipId) => cleanRow({ clipId, steps: on(16, ...Array.from({ length: 16 }, (_, i) => i)), ring: true })) };
  const { run } = begin(engine, { beat: () => beat, from: 0.05, steps: true, loaded: loadedOf(...rows, 'd'), join: () => ({ next: run.clocks.find(Boolean).next, step: run.clocks.find(Boolean).step }) });
  run.tick();
  runTo(t, run, 0.5);
  return { t, beat, run };
}

test('a row moved while the beat plays takes its clock, its sounding voices and its playhead with it', () => {
  const { t, beat, run } = playing();
  run.shown = [3, 5, 7];
  const clocks = run.clocks.map((c) => ({ ...c }));
  const voices = run.voices.map((list) => [...list]);
  run.queue = [{ row: 0, step: 4, time: 9 }, { row: 2, step: 4, time: 9 }];
  const where = moveItem(beat.rows, 0, 2);   // a b c -> b c a
  run.moveRow(0, 2, where);
  assert.deepEqual(beat.rows.map((r) => r.clipId), ['b', 'c', 'a']);
  assert.deepEqual(run.clocks, [clocks[1], clocks[2], clocks[0]], 'its clock moved with it: still in time');
  assert.ok(run.voices[2].every((v, i) => v === voices[0][i]) && run.voices[2].length > 1, 'its ringing voices are still its own');
  assert.deepEqual(run.shown, [5, 7, 3]);
  assert.deepEqual(run.queue.map((q) => q.row), [2, 1], 'the pills booked for it are now row 2');
  const before = t.started.length;
  runTo(t, run, 1.3);
  const a = t.started.slice(before).filter((h) => h.clip === 'a');
  assert.ok(a.length > 4);
  for (const h of a) assert.ok(Math.abs((h.at - 0.05) / 0.1 - Math.round((h.at - 0.05) / 0.1)) < 1e-6, `row a is still on the grid: ${h.at}`);
  const gaps = a.map((h, i) => (i ? round(h.at - a[i - 1].at) : 0.1)).filter((g) => g !== 0.1);
  assert.deepEqual(gaps, [], 'no pill lost or doubled where it moved');
  run.stop();
});

test('a row removed while the beat plays fades its own voices only, and the rows after it keep their clocks and voices', () => {
  const { t, beat, run } = playing();
  const clocks = run.clocks.map((c) => ({ ...c }));
  const keep = [run.voices[0], run.voices[2]];
  const gone = [...run.voices[1]];
  run.shown = [3, 5, 7];
  run.queue = [{ row: 0, step: 4, time: 9 }, { row: 1, step: 4, time: 9 }, { row: 2, step: 4, time: 9 }];
  t.faded.length = 0;
  run.removeRow(1);
  beat.rows.splice(1, 1);
  assert.deepEqual(t.faded.map((f) => f.src).sort(), gone.map((v) => v.src).sort(), 'only the removed row\'s sounding voices fade');
  assert.ok(run.voices[0] === keep[0] && run.voices[1] === keep[1], 'the others keep theirs');
  assert.deepEqual(run.clocks, [clocks[0], clocks[2]]);
  assert.deepEqual(run.shown, [3, 7]);
  assert.deepEqual(run.queue.map((q) => q.row), [0, 1], 'its pills are gone, the later row\'s renumbered');
  const before = t.started.length;
  runTo(t, run, 0.8);
  const after = t.started.slice(before);
  assert.ok(after.some((h) => h.clip === 'a') && after.some((h) => h.clip === 'c') && !after.some((h) => h.clip === 'b'));
  run.stop();
});

test('a row put in while the beat plays has no clock and no voices yet, and joins on the grid at the next tick; the rows after it move down', () => {
  const { t, beat, run } = playing(['a', 'c']);
  const clocks = run.clocks.map((c) => ({ ...c }));
  run.shown = [3, 7];
  run.queue = [{ row: 0, step: 4, time: 9 }, { row: 1, step: 4, time: 9 }];
  beat.rows.splice(1, 0, cleanRow({ clipId: 'd', steps: on(16, ...Array.from({ length: 16 }, (_, i) => i)) }));
  run.insertRow(1);
  assert.deepEqual([run.voices.length, run.voices[1], run.clocks[1], run.shown], [3, [], undefined, [3, -1, 7]]);
  assert.deepEqual(run.clocks[0], clocks[0], 'the row before it is untouched');
  assert.deepEqual(run.clocks[2], clocks[1], 'the row after it moved down with its clock');
  assert.deepEqual(run.queue.map((q) => q.row), [0, 2]);
  const next = run.clocks[0].next;
  assert.deepEqual(run.shown, [3, -1, 7]);
  t.now += 0.025;
  run.tick();
  assert.ok(run.clocks[1], 'joined');
  runTo(t, run, 1);
  const d = t.started.filter((h) => h.clip === 'd');
  assert.ok(d.length > 3);
  for (const h of d) assert.ok(Math.abs((h.at - 0.05) / 0.1 - Math.round((h.at - 0.05) / 0.1)) < 1e-6, `on the grid: ${h.at}`);
  // Loose on purpose (see the header): it joins a same-speed row's clock as it came in, so within one tick of it.
  assert.ok(d[0].at >= next - 1e-9 - 0.1, 'from about where the other rows are');
  run.stop();
});

test('a tempo change maps the run\'s times; another beat taking over restarts every row on the bar line', () => {
  const { t, run } = playing(['a', 'b']);
  const nexts = run.clocks.map((c) => c.next);
  run.retime((x) => x + 10);
  assert.deepEqual([run.t0, ...run.clocks.map((c) => c.next)].map(round), [10.05, ...nexts.map((x) => round(x + 10))]);
  const voices = run.voices.flat();
  assert.ok(voices.length > 0);
  run.restart(3, 20);
  assert.deepEqual([run.t0, run.pass, run.clocks, run.voices, run.shown, run.queue], [20, { next: 20, pill: 0 }, Array(3).fill({ next: 20, step: 0 }), [[], [], []], [-1, -1, -1], []]);
  run.stop();
  assert.ok(t.faded.length === 0, 'the old voices were the caller\'s to ring on, not faded by a restart');
});

// ── Through 🥁 Beats itself ──

// The real app, once, with its test hook. Each test plays a beat of its own as
// the scratch (rows named by kit sound) on a stand-in clock moved by hand,
// the engine's 25 ms tick caught and called by hand, every source saying which
// sound it plays and when it was stopped.
let world = null;
async function beatsWorld() {
  if (world) return world;
  const { installPage } = await import('./fake-dom.mjs');
  const { testManifest } = await import('./test-board.mjs');
  const page = installPage({ manifest: testManifest() });
  const w = { page, $: page.$, seq: null };
  globalThis.noodleTestSeq = (q) => { w.seq = q; };
  console.error = () => {};
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state: w.state } = await import('../web/state.js'));
  ({ audio: w.audio } = await import('../web/audio.js'));
  w.pid = w.state.personId;
  return (world = w);
}
const every = (n) => Array.from({ length: n }, (_, i) => i);

// Plays `rows` ([{sound, steps, ...}]) as the open beat, `others` ([{id, name, ...}]) saved beside it,
// and hands `check` the clock, what started and what was stopped. It stops the beat afterwards.
async function playOnBeats({ rows, bars = 1, others = [] }, check) {
  const w = await beatsWorld();
  const { $, page, seq, state, audio, pid } = w;
  const { cleanPattern } = await import('../web/beat.js');
  const { scratchId } = await import('../web/scratch.js');
  const id = (sound) => `${pid}-${sound}`;
  const own = cleanPattern({ id: scratchId(pid), name: 'Scratch', bpm: 120, bars, rows: rows.map(({ sound, ...row }) => ({ ...row, clipId: id(sound) })) }, pid);
  const saved = others.map((o) => ({ ...cleanPattern({ ...o, rows: o.rows.map(({ sound, ...row }) => ({ ...row, clipId: id(sound) })) }, pid), created: 1, saved: 1 }));
  state.savedBeats = [...state.savedBeats.filter((b) => b.id !== own.id && !saved.some((o) => o.id === b.id)), { ...own, created: 1, saved: 1 }, ...saved];

  const ctx = audio.context();
  const clock = { now: 5 };
  Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => clock.now });
  const started = [];
  const stopped = [];
  const plainSource = ctx.createBufferSource;
  const plainLoad = audio.load;
  ctx.createBufferSource = () => {
    const src = { connect() {}, disconnect() {}, playbackRate: { value: 1 }, buffer: null, start(at) { started.push({ clip: src.buffer.clip, at: round(at) }); }, stop() { stopped.push(src.buffer.clip); } };
    return src;
  };
  audio.load = async (clip) => ({ buffer: { clip: clip.id }, duration: 0.3 });
  const plainInterval = globalThis.setInterval;
  const ticks = [];
  globalThis.setInterval = (fn, ms) => (ms === 25 ? ticks.push(fn) : plainInterval(fn, ms));
  try {
    $('#pads-tab').dispatch('click');
    $('#beats-toggle').dispatch('click');   // Beats
    await page.settle();
    seq.restore(own);   // the beat to play is the open one (an earlier test may have left another open)
    $('#seq-play').dispatch('click');
    await page.settle();
    globalThis.setInterval = plainInterval;
    assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'playing');
    const to = (until) => { while (clock.now < until) { clock.now = round(clock.now + 0.025); ticks[0](); } };
    await check({ $, page, seq, id, started, stopped, t0: clock.now + 0.05, to, now: () => clock.now });
    if ($('#seq-play').getAttribute('aria-pressed') === 'true') $('#seq-play').dispatch('click');
  } finally {
    globalThis.setInterval = plainInterval;
    ctx.createBufferSource = plainSource;
    audio.load = plainLoad;
    delete ctx.currentTime;
    ctx.currentTime = 0;
  }
}
const inTime = (started, clip, what) => {
  const at = started.filter((h) => h.clip === clip).map((h) => h.at);
  at.forEach((x, i) => { if (i) assert.ok(Math.abs(x - at[i - 1] - 0.125) < 1e-6, `${what}: every pill, in time (${at[i - 1]} → ${x})`); });
  return at;
};

test('on 🥁 Beats: a row moved down from its menu and then removed, while it plays: the others keep their pills in time, and only the removed row\'s own voices fade', async () => {
  const rows = ['kick', 'snare', 'shaker'].map((sound) => ({ sound, ring: true, steps: on(16, ...every(16)) }));
  await playOnBeats({ rows }, async ({ $, seq, id, started, stopped, t0, to }) => {
    to(t0 + 1);
    const menuRows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
    stopped.length = 0;
    menuRows()[0].querySelector('.seq-head [data-more]').dispatch('click');
    document.body.children.find((c) => c.classList.contains('more-pop')).querySelectorAll('[data-more-item]').find((b) => b.textContent.includes('Move down')).dispatch('click');   // kick, snare, shaker -> snare, kick, shaker
    assert.deepEqual(seq.beat().rows.map((r) => r.clipId), [id('snare'), id('kick'), id('shaker')]);
    assert.deepEqual(stopped, [], 'moving a row cuts nothing off');
    // At once, so the voices a row had still sound: the kick is the second row now.
    const removeAt = started.length;
    seq.dropRow(1);   // ✕ Remove, as the keys' Undo and the row's button reach it
    assert.deepEqual(seq.beat().rows.map((r) => r.clipId), [id('snare'), id('shaker')]);
    assert.ok(stopped.length > 0 && stopped.every((c) => c === id('kick')), `only the kick's own voices fade, not the row that took its place: ${[...new Set(stopped)]}`);
    to(t0 + 2);
    const after = started.slice(removeAt);
    assert.ok(!after.some((h) => h.clip === id('kick')), 'the removed row plays no more');
    for (const sound of ['snare', 'shaker']) {
      assert.ok(inTime(started, id(sound), sound).length > 14, `${sound} plays on`);
      assert.ok(after.some((h) => h.clip === id(sound)), `${sound} keeps being booked`);
    }
    inTime(started, id('kick'), 'the kick until it went');
  });
});

test('on 🥁 Beats: a chip tapped while it plays takes over at the bar line from the new beat\'s first pill (the run restarts every row on that line)', async () => {
  // Two bars of 4/4: a bar is 2 s at 120 BPM, so the first bar line is 5.05 + 2 = 7.05, 16 pills in.
  const rows = ['kick', 'snare'].map((sound) => ({ sound, ring: true, steps: on(32, ...every(32)) }));
  const other = { id: 'beat-chip-b', name: 'Chip B', bpm: 120, bars: 2, rows: [{ sound: 'clap', steps: on(32, 0, 8) }] };
  await playOnBeats({ rows, bars: 2, others: [other] }, async ({ $, page, seq, id, started, t0, to }) => {
    to(t0 + 0.55);
    document.querySelector('[data-chip="beat-chip-b"]').dispatch('click');
    await page.settle();   // its sounds are loaded by the bar line
    to(t0 + 4);
    assert.equal(seq.beat().name, 'Chip B', 'it took over');
    const bar = round(t0 + 2);
    // Its pills 0 and 8 (a second apart), counted from the bar line: not from where the old beat's clocks were (pill 16 of 32).
    assert.deepEqual(started.filter((h) => h.clip === id('clap')).map((h) => h.at), [bar, round(bar + 1)]);
    assert.ok(!started.some((h) => (h.clip === id('kick') || h.clip === id('snare')) && h.at >= bar - 1e-6), 'the old beat books nothing from the bar line on');
    assert.ok(started.some((h) => h.clip === id('kick') && h.at > bar - 0.2), 'and it played right up to it');
  });
});

test('on 🥁 Beats: ↩️ Undo of a removed row, while it plays, puts the row back with its own voices and the others untouched', async () => {
  const rows = ['kick', 'snare', 'shaker'].map((sound) => ({ sound, ring: true, steps: on(16, ...every(16)) }));
  await playOnBeats({ rows }, async ({ $, seq, id, started, stopped, t0, to }) => {
    to(t0 + 1);
    // ✕ Remove from the first row's menu: it asks first, then removes and offers Undo.
    $('#seq-rows').children.find((c) => c.classList.contains('seq-row')).querySelector('.seq-head [data-more]').dispatch('click');
    const remove = () => document.body.children.find((c) => c.classList.contains('more-pop')).querySelectorAll('[data-more-item]').find((b) => b.textContent.includes('Remove'));
    remove().dispatch('click');
    remove().dispatch('click');
    assert.deepEqual(seq.beat().rows.map((r) => r.clipId), [id('snare'), id('shaker')]);
    to(t0 + 1.3);
    $('#banner-action').dispatch('click');   // ↩️ Undo
    assert.deepEqual(seq.beat().rows.map((r) => r.clipId), [id('kick'), id('snare'), id('shaker')], 'back where it was');
    const back = started.length;
    to(t0 + 1.45);   // soon, while the voices the other rows had are still sounding
    assert.ok(started.slice(back).some((h) => h.clip === id('kick')), 'it plays again');
    // Muting it stops its own sounding voices, and only those: it did not take the list of the row that moved up into its place.
    stopped.length = 0;
    seq.toggleMute(0);
    assert.ok(stopped.length > 0 && stopped.every((c) => c === id('kick')), `only the kick's voices: ${[...new Set(stopped)]}`);
    to(t0 + 3);
    for (const sound of ['snare', 'shaker']) assert.ok(inTime(started, id(sound), sound).length > 20, `${sound} played on through it all`);
  });
});
