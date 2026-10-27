// One beat engine (docs/design/one-beat-engine.md), step 6: 🥁 Beats' loop
// is the engine's. What Beats adds to the run is tested here, on a stand-in
// audio object and a clock moved by hand: hitsDue's `steps` (the playhead's
// pills) and `skip` (a pill a live hit already played); a run whose sounds
// are the caller's (`loaded`) going at once, with its first tick the
// caller's; the hooks Beats uses (`limit`, `beforeRows`, `join`, `afterTick`);
// the cuts and ringing counts its stop logs; and a row moved, removed or
// put in while the beat plays keeps its clock and its voices (6b, which had
// no test before). That Beats still books the same hits is tests/beats-same-hits.test.mjs. Not tested
// here: how it sounds, and timing on a slow phone
// (`just look beats --cpu 4 --height 680`).

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

test('on 🥁 Beats: a row moved down from its menu and then removed, while it plays: the others keep their pills in time, and only the removed row\'s own voices fade', async () => {
  const { installPage } = await import('./fake-dom.mjs');
  const { testManifest } = await import('./test-board.mjs');
  const { cleanPattern } = await import('../web/beat.js');
  const { scratchId } = await import('../web/scratch.js');
  const page = installPage({ manifest: testManifest() });
  const $ = page.$;
  let seq = null;
  globalThis.noodleTestSeq = (s) => { seq = s; };
  console.error = () => {};
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { state } = await import('../web/state.js');
  const { audio } = await import('../web/audio.js');
  const pid = state.personId;
  const ids = ['kick', 'snare', 'shaker'].map((k) => `${pid}-${k}`);
  const beat = cleanPattern({ id: scratchId(pid), name: 'Scratch', bpm: 120, rows: ids.map((clipId) => ({ clipId, ring: true, ...(() => { const steps = on(16, ...Array.from({ length: 16 }, (_, i) => i)); return { steps }; })() })) }, pid);
  state.savedBeats = [...state.savedBeats.filter((b) => b.id !== beat.id), { ...beat, created: 1, saved: 1 }];

  // The stand-in clock; every source says which sound it plays and when it was stopped.
  const ctx = audio.context();
  let now = 5;
  Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => now });
  const started = [];
  const stopped = [];
  ctx.createBufferSource = () => {
    const src = { connect() {}, disconnect() {}, playbackRate: { value: 1 }, buffer: null, start(at) { started.push({ clip: src.buffer.clip, at: round(at) }); }, stop() { stopped.push(src.buffer.clip); } };
    return src;
  };
  audio.load = async (clip) => ({ buffer: { clip: clip.id }, duration: 0.3 });
  const plainInterval = globalThis.setInterval;
  const ticks = [];
  globalThis.setInterval = (fn, ms) => (ms === 25 ? ticks.push(fn) : plainInterval(fn, ms));
  try {
    $('#beats-toggle').dispatch('click');
    await page.settle();
    $('#seq-play').dispatch('click');
    await page.settle();
    globalThis.setInterval = plainInterval;
    const t0 = now + 0.05;
    const to = (until) => { while (now < until) { now = round(now + 0.025); ticks[0](); } };
    to(t0 + 1);
    const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
    const moveDown = (row) => {
      rows()[row].querySelector('.seq-head [data-more]').dispatch('click');
      document.body.children.find((c) => c.classList.contains('more-pop')).querySelectorAll('[data-more-item]').find((b) => b.textContent.includes('Move down')).dispatch('click');
    };
    stopped.length = 0;
    moveDown(0);   // kick, snare, shaker -> snare, kick, shaker
    assert.deepEqual(seq.beat().rows.map((r) => r.clipId), [ids[1], ids[0], ids[2]]);
    assert.deepEqual(stopped, [], 'moving a row cuts nothing off');
    // At once, so the voices a row had still sound: the kick is the second row now.
    const removeAt = started.length;
    seq.dropRow(1);   // ✕ Remove, as the keys' Undo and the row's button reach it
    assert.deepEqual(seq.beat().rows.map((r) => r.clipId), [ids[1], ids[2]]);
    assert.ok(stopped.length > 0 && stopped.every((c) => c === ids[0]), `only the kick's own voices fade, not the row that took its place: ${[...new Set(stopped)]}`);
    to(t0 + 2);
    const after = started.slice(removeAt);
    assert.ok(!after.some((h) => h.clip === ids[0]), 'the removed row plays no more');
    for (const id of [ids[1], ids[2]]) {
      const mine = started.filter((h) => h.clip === id).map((h) => h.at);
      assert.ok(mine.length > 14, `${id} plays on: ${mine.length}`);
      mine.forEach((at, i) => { if (i) assert.ok(Math.abs(at - mine[i - 1] - 0.125) < 1e-6, `${id}: every pill, in time, across the move and the removal (${mine[i - 1]} → ${at})`); });
      assert.ok(after.some((h) => h.clip === id), `${id} keeps being booked`);
    }
    const kick = started.filter((h) => h.clip === ids[0]).map((h) => h.at);
    kick.forEach((at, i) => { if (i) assert.ok(Math.abs(at - kick[i - 1] - 0.125) < 1e-6, 'the kick was in time until it went'); });
    $('#seq-play').dispatch('click');
  } finally {
    globalThis.setInterval = plainInterval;
    delete ctx.currentTime;
  }
});
