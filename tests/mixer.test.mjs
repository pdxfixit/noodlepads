// 🎚️ Mixer (web/mixer.js, Ben 2026-10-12): per row a fader, Mute, Solo and
// one effect, plus the Master's loudness and effect. Mute and solo save with
// the beat (ADR 0018): the stored fields and their cleaning, the round trips
// a beat makes (beat file, backup, share), the graph every hit plays
// through, then the sheet in the real app on Beats and in Beat Builder.
// Sound itself needs a browser.

import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MIX_FX, cleanFx, fxSteps, masterLevel, silencedBySolo, mixKey, buildMix, followChanges } from '../web/mixer.js';
import { cleanSong, planSong, soundSong } from '../web/playlist.js';
import { gainAt } from '../web/row-volume.js';
import { cleanRow, cleanPattern, planHits, audible, beatToFile, beatFromFile } from '../web/beat.js';
import { samePattern, on } from './helpers.mjs';
import { readBackup, makeBackup } from '../web/backup.js';
import { shareBundle, shareDoc } from '../web/cloud-sync.js';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, newBuilderBeatWithRow, keysOn, keysOff } from './new-beat.mjs';
import { state } from '../web/state.js';
import { createBeatEngine } from '../web/beat-engine.js';


test('a row stores solo and its effect only when set; junk is dropped; an old beat has neither', () => {
  const plain = cleanRow({ clipId: 'x', steps: on(0) });
  assert.equal('solo' in plain, false);
  assert.equal('fx' in plain, false);
  const mixed = cleanRow({ clipId: 'x', solo: true, fx: 'room', muted: true });
  assert.equal(mixed.solo, true);
  assert.equal(mixed.fx, 'room');
  assert.equal(mixed.muted, true);
  for (const junk of [1, 'yes', null]) assert.equal('solo' in cleanRow({ solo: junk }), false);
  for (const junk of ['laser', 7, {}, 'toString']) assert.equal('fx' in cleanRow({ fx: junk }), false, String(junk));
  assert.equal(cleanFx('echo'), 'echo');
  assert.equal(cleanFx('__proto__'), null);
});

test('a beat stores the master\'s level below full and its effect; full and none are left out', () => {
  assert.deepEqual(cleanPattern({ rows: [] }, 'p'), { personId: 'p', name: '', bpm: 100, bars: 1, swing: 0, rows: [] }, 'an old beat is unchanged');
  const p = cleanPattern({ volume: 0.4, fx: 'hall', rows: [] }, 'p');
  assert.equal(p.volume, 0.4);
  assert.equal(p.fx, 'hall');
  assert.equal(masterLevel(p), 0.4);
  assert.equal('volume' in cleanPattern({ volume: 1 }, 'p'), false);
  assert.equal(cleanPattern({ volume: -3 }, 'p').volume, 0);
  assert.equal('fx' in cleanPattern({ fx: 'nope' }, 'p'), false);
  assert.equal(masterLevel(cleanPattern({}, 'p')), 1);
});

test('solo: only soloed rows play; a muted row never plays, soloed or not', () => {
  const p = cleanPattern({ bpm: 120, rows: [
    { clipId: 'a', steps: on(0) }, { clipId: 'b', steps: on(0), solo: true }, { clipId: 'c', steps: on(0), solo: true, muted: true },
  ] }, 'p');
  assert.deepEqual([...new Set(planHits(p, 'plain', 2).map((h) => h.row))], [1]);
  assert.ok(silencedBySolo(p, p.rows[0]));
  assert.ok(!silencedBySolo(p, p.rows[1]));
  assert.equal(audible(p.rows[0]), true, 'on its own a row knows nothing of the others');
  assert.equal(audible(p.rows[0], p), false);
  delete p.rows[1].solo;
  delete p.rows[2].solo;
  assert.deepEqual([...new Set(planHits(p, 'plain', 2).map((h) => h.row))], [0, 1], 'no solo: everyone not muted');
});

test('solo, an effect and the master are changes to the beat', () => {
  const a = cleanPattern({ rows: [{ clipId: 'x', steps: on(0) }] }, 'p');
  for (const b of [{ rows: [{ clipId: 'x', steps: on(0), solo: true }] }, { rows: [{ clipId: 'x', steps: on(0), fx: 'robot' }] },
    { volume: 0.5, rows: [{ clipId: 'x', steps: on(0) }] }, { fx: 'echo', rows: [{ clipId: 'x', steps: on(0) }] }]) {
    assert.ok(!samePattern(a, cleanPattern(b, 'p')), JSON.stringify(b));
  }
  assert.ok(samePattern(a, cleanPattern({ volume: 1, fx: 'x', rows: [{ clipId: 'x', steps: on(0), solo: false }] }, 'p')));
});

test('a beat file, a backup and a share code carry the mix', async () => {
  const beat = cleanPattern({ name: 'Mix', bpm: 100, volume: 0.6, fx: 'room', rows: [
    { clipId: 'p-kick', steps: on(0), solo: true, muted: false, fx: 'crunch' }, { clipId: 'p-snare', steps: on(4), muted: true }] }, 'p');
  const { file } = beatToFile(beat, ['kick', 'snare']);
  const back = beatFromFile(JSON.stringify(file), 'q', ['kick', 'snare']);
  assert.equal(back.volume, 0.6);
  assert.equal(back.fx, 'room');
  assert.deepEqual(back.rows.map((r) => [!!r.solo, r.fx ?? null, r.muted]), [[true, 'crunch', false], [false, null, true]]);

  const saved = { ...beat, id: 'beat-m-1', personId: 'pip', created: 1, saved: 2, rows: beat.rows.map((r) => ({ ...r, clipId: 'pip-airhorn' })) };
  const out = await readBackup(await makeBackup({ people: [{ id: 'pip', name: 'Pipsqueak', color: '#1F3FA8' }], clips: [], beats: [saved], patterns: [] }, 'dev'),
    { peopleIds: new Set(['pip']), clipIds: new Set(['pip-airhorn']), colorOk: () => true });
  assert.equal(out.beats[0].volume, 0.6);
  assert.equal(out.beats[0].fx, 'room');
  assert.equal(out.beats[0].rows[0].solo, true);
  assert.equal(out.beats[0].rows[1].muted, true);

  const lists = { clips: [], people: [], beats: [{ ...beat, id: 'beat-1', personId: 'p-a', rows: [{ ...beat.rows[0], clipId: 'p-a-kick' }] }] };
  const made = shareBundle('beat', 'beat-1', lists, 'p-a', ['kick', 'snare']);
  let n = 0;
  const { doc } = shareDoc(made.bundle, 'p-c', ['kick', 'snare'], (k) => `${k}-new-${++n}`, { kind: 'beat', title: 'Mix' });
  assert.equal(doc.beats[0].fx, 'room');
  assert.equal(doc.beats[0].rows[0].solo, true);
});

// A context that records its nodes: what connects to what.
function recordingContext() {
  const nodes = [];
  const param = (value = 0) => ({ value, setValueAtTime() {}, setTargetAtTime(v, at) { this.initial ??= this.value; this.value = v; (this.sets ??= []).push([at, v]); }, cancelScheduledValues() {}, linearRampToValueAtTime() {} });
  const node = (kind, extra = {}) => {
    const n = { kind, out: [], stopped: false, connect(next) { n.out.push(next); return next; }, disconnect() { n.out = []; },
      start() {}, stop() { n.stopped = true; }, gain: param(1), frequency: param(), Q: param(), delayTime: param(), threshold: param(), ratio: param(),
      knee: param(), attack: param(), release: param(), ...extra };
    nodes.push(n);
    return n;
  };
  const ctx = {
    sampleRate: 8000, currentTime: 0, nodes,
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'), createDelay: () => node('delay'),
    createWaveShaper: () => node('shaper'), createOscillator: () => node('osc'), createConvolver: () => node('convolver'),
    createDynamicsCompressor: () => node('compressor'),
    createBuffer: (c, len) => ({ numberOfChannels: c, getChannelData: () => new Float32Array(len) }),
  };
  return ctx;
}
const reaches = (from, to, seen = new Set()) => from === to || (!seen.has(from) && (seen.add(from), from.out.some((n) => reaches(n, to, seen))));

test('the mix graph: a row with no effect goes straight to the master; one with an effect through it; the master\'s level and effect', () => {
  const ctx = recordingContext();
  const dest = { kind: 'dest', out: [] };
  const p = cleanPattern({ bpm: 100, volume: 0.5, rows: [{ clipId: 'a' }, { clipId: 'b', fx: 'robot' }] }, 'p');
  const bus = buildMix(ctx, dest, p);
  assert.equal(bus.master.gain.value, 0.5);
  assert.ok(reaches(bus.input(0), dest));
  assert.equal(bus.input(0), bus.master, 'no effect anywhere: the row goes into the master');
  assert.notEqual(bus.input(1), bus.master);
  assert.ok(reaches(bus.input(1), dest));
  assert.ok(ctx.nodes.some((n) => n.kind === 'osc'), 'Robot runs an oscillator');
  bus.dispose();
  assert.ok(ctx.nodes.filter((n) => n.kind === 'osc').every((n) => n.stopped), 'put aside, it stops what it started');

  const withMaster = buildMix(recordingContext(), dest, cleanPattern({ fx: 'hall', rows: [{ clipId: 'a' }] }, 'p'));
  assert.notEqual(withMaster.input(0), withMaster.master, 'a master effect sits before the master\'s level');
  assert.ok(reaches(withMaster.input(0), dest));
  assert.notEqual(mixKey(p), mixKey({ ...p, fx: 'room' }), 'a new effect builds a new graph');
});

test('every effect is the sound sheet\'s own, live, and Echo keeps the beat\'s time', () => {
  for (const f of MIX_FX) assert.ok(fxSteps(f.id).length > 0, f.id);
  assert.equal(fxSteps('echo', 100)[0].gap, 0.3, 'an eighth note at 100 BPM');
  assert.equal(fxSteps('echo', 150)[0].gap, 0.2);
  assert.deepEqual(fxSteps('nope'), []);
});

// ── One graph per beat, let go when its last voice has ended ──
// The engine's busFor (beat-engine.js): a graph belongs to a beat's id (a beat
// with no id, to the beat of its run), at most 8 stand on the live context,
// and one let go (a stop, a delete, a ninth) is disposed only once the last
// voice through it has ended and its effects' tail has rung.

function mixEngine() {
  const ctx = recordingContext();
  ctx.createBufferSource = () => ({ connect() {}, start() {}, stop() {}, playbackRate: { value: 1 } });
  const dest = { kind: 'dest', out: [] };
  const audio = { master: dest, context: () => ctx, wake: () => ctx, load: async () => ({ buffer: {}, duration: 1 }), key: (c) => c.id };
  const engine = createBeatEngine({ audio, clipById: () => null });
  const beat = (id, extra = {}) => cleanPattern({ id, bpm: 100, rows: [{ clipId: 'x', steps: on(0), ...extra.row }], ...extra.beat }, 'p');
  // One hit of `seconds` through row 0 of `p`'s graph at the clock now.
  const hit = (p, seconds, to = dest) => {
    const list = [];
    engine.sound(ctx, engine.busFor(ctx, to, p).input(0), list, p.rows[0], { buffer: {}, duration: seconds }, ctx.currentTime);
    return list[0];
  };
  // Moves the clock and the held timers on together.
  const pass = (seconds) => { ctx.currentTime += seconds; mock.timers.tick(seconds * 1000); };
  const watch = (bus) => { const seen = { disposed: 0 }; const was = bus.dispose; bus.dispose = () => { seen.disposed++; was(); }; return seen; };
  return { ctx, dest, engine, beat, hit, pass, watch };
}
const held = async (fn) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try { return await fn(); } finally { mock.timers.reset(); }
};

test('one graph per beat id: a beat opened again uses its own; a beat with no id is its own, per run', () => {
  const { ctx, dest, engine, beat } = mixEngine();
  const a = engine.busFor(ctx, dest, beat('beat-a'));
  const made = ctx.nodes.length;
  assert.equal(engine.busFor(ctx, dest, beat('beat-a')), a, 'a copy of the same beat: the same graph');
  assert.equal(ctx.nodes.length, made, 'nothing built again');
  assert.notEqual(engine.busFor(ctx, dest, beat('beat-b')), a, 'another beat: its own');
  assert.notEqual(engine.busFor(ctx, { kind: 'lane', out: [] }, beat('beat-a')), a, 'another destination (a song lane): its own');
  const run1 = beat(undefined);
  const first = engine.busFor(ctx, dest, run1);
  assert.equal(engine.busFor(ctx, dest, run1), first, 'a run keeps its graph');
  assert.notEqual(engine.busFor(ctx, dest, beat(undefined)), first, 'the next run has its own');
  assert.equal(engine.mixes(), 5);
  assert.equal(engine.busFor(ctx, dest, beat('beat-a', { beat: { fx: 'room' } })).key, mixKey(beat('beat-a', { beat: { fx: 'room' } })), 'a new effect builds a new one');
  assert.equal(engine.mixes(), 5, 'in the old one\'s place');
});

test('a beat deleted: its graph is forgotten at once and disposed after its last voice and the Echo tail, not after a fixed 6 s', async () => {
  const { ctx, dest, engine, beat, hit, pass, watch } = mixEngine();
  await held(() => {
    const p = beat('beat-gone', { row: { fx: 'echo' } });
    const bus = engine.busFor(ctx, dest, p);
    const seen = watch(bus);
    assert.ok(bus.tail >= 1.2, 'Echo at 100 BPM rings three eighths and a bit on');
    hit(p, 10);                                  // a long sound, over at 10 s
    pass(1);
    engine.letGo((m) => m.id === 'beat-gone');   // the delete
    assert.equal(engine.mixes(), 0, 'no longer listed');
    assert.notEqual(engine.busFor(ctx, dest, p), bus, 'a later hit builds a fresh graph');
    pass(7);                                     // 8 s: the old fixed 6 s are over, the voice is not
    assert.equal(seen.disposed, 0, 'its voice still sounds');
    pass(2.5);                                   // 10.5 s: the voice has ended, the tail rings
    assert.equal(seen.disposed, 0, 'the Echo tail is not chopped');
    pass(1);                                     // 11.5 s: past 10 s + the tail
    assert.equal(seen.disposed, 1, 'then it is disposed');
  });
});

test('a voice that ends early (a stop fades it) lets its graph go then, once; a graph with no voice goes at once', async () => {
  const { ctx, dest, engine, beat, hit, pass, watch } = mixEngine();
  await held(() => {
    const p = beat('beat-early');
    const bus = engine.busFor(ctx, dest, p);
    const seen = watch(bus);
    const voice = hit(p, 30);
    pass(2);
    engine.letGo((m) => m.dest === dest);
    pass(1);
    assert.equal(seen.disposed, 0, 'its voice has 27 s to go');
    voice.src.onended();                          // the stop's fade is over
    pass(0.1);
    assert.equal(seen.disposed, 1, 'the end of the voice is enough (no effect: no tail)');
    pass(40);
    assert.equal(seen.disposed, 1, 'once');
    const idle = watch(engine.busFor(ctx, dest, beat('beat-idle')));
    engine.letGo(() => true);
    pass(0.1);
    assert.equal(idle.disposed, 1);
  });
});

test('at most 16 graphs stand on the live context (more than a song\'s 8 lanes); the idle one used longest ago is let go', async () => {
  const { ctx, dest, engine, beat, pass, watch } = mixEngine();
  await held(() => {
    const seen = [];
    for (let i = 0; i < 16; i++) seen.push(watch(engine.busFor(ctx, dest, beat(`beat-${i}`))));
    assert.equal(engine.mixes(), 16);
    engine.busFor(ctx, dest, beat('beat-0'));   // used again: not the oldest now
    engine.busFor(ctx, dest, beat('beat-16'));
    assert.equal(engine.mixes(), 16, 'a 17th let one go');
    pass(0.1);
    assert.deepEqual(seen.map((s) => s.disposed), [0, 1, ...Array(14).fill(0)], 'beat-1, used longest ago');
    for (let i = 17; i < 60; i++) engine.busFor(ctx, dest, beat(`beat-${i}`));
    assert.equal(engine.mixes(), 16, 'however many beats play through it');
  });
});

test('a graph with a voice booked ahead is never let go for the cap; a song of 8 lanes changing beats keeps every lane\'s mix', async () => {
  const { ctx, dest, engine, beat, hit, pass, watch } = mixEngine();
  await held(() => {
    const lanes = Array.from({ length: 8 }, (_, i) => ({ kind: 'lane', i, out: [] }));
    const playing = lanes.map((lane, i) => { const p = beat(`beat-lane-${i}`); const w = watch(engine.busFor(ctx, lane, p)); hit(p, 5, lane); return w; });
    // Each lane moves to a second beat: 16 mixes, then a third for lane 0.
    lanes.forEach((lane, i) => engine.busFor(ctx, lane, beat(`beat-next-${i}`)));
    engine.busFor(ctx, lanes[0], beat('beat-third'));
    pass(0.5);
    assert.deepEqual(playing.map((w) => w.disposed), Array(8).fill(0), 'every mix still sounding is kept');
    assert.equal(engine.mixes(), 16, 'an idle one went for the third');
    const busy = [];
    for (let i = 0; i < 20; i++) { const p = beat(`beat-busy-${i}`); const w = watch(engine.busFor(ctx, dest, p)); hit(p, 5); busy.push(w); }
    assert.ok(engine.mixes() > 16, 'booked-ahead voices keep their mixes past the cap');
    assert.deepEqual(busy.map((w) => w.disposed), Array(20).fill(0));
    pass(6);
    engine.busFor(ctx, dest, beat('beat-after'));
    assert.equal(engine.mixes(), 16, 'once they have sounded the cap holds again');
  });
});

test('a graph with no effect is not disposed while the fade that cuts its hit is still going', async () => {
  const { ctx, dest, engine, beat, pass, watch } = mixEngine();
  await held(() => {
    const p = beat('beat-fade');
    const seen = watch(engine.busFor(ctx, dest, p));
    const list = [];
    engine.sound(ctx, engine.busFor(ctx, dest, p).input(0), list, p.rows[0], { buffer: {}, duration: 10 }, ctx.currentTime, false, 0, 1);   // cut after 1 s
    engine.letGo(() => true);
    ctx.currentTime = 1.004;
    mock.timers.tick(1100);
    assert.equal(seen.disposed, 0, 'the 8 ms fade runs to 1.008 s');
    ctx.currentTime = 1.1;
    mock.timers.tick(200);
    assert.equal(seen.disposed, 1);
  });
});

test('rung resolves once every mix it asks about is disposed, its Echo tail included', async () => {
  const { ctx, dest, engine, beat, hit, pass } = mixEngine();
  await held(async () => {
    const p = beat('beat-rung', { row: { fx: 'echo' } });
    hit(p, 2);
    engine.letGo(() => true);
    let rung = false;
    const waiting = engine.rung((m) => m.dest === dest).then(() => { rung = true; });
    pass(1);
    await Promise.resolve();
    assert.equal(rung, false, 'the voice still sounds');
    pass(2);   // 3 s: the voice ended at 2, the Echo tail (1.2 s) has not
    await Promise.resolve();
    assert.equal(rung, false, 'the tail still rings');
    pass(0.5);
    await waiting;
    assert.equal(rung, true);
    await engine.rung(() => true);   // nothing left ringing: at once
  });
});

test('an offline render keeps its graphs off the live list', () => {
  const { ctx, engine, beat } = mixEngine();
  const offline = recordingContext();
  const out = { kind: 'dest', out: [] };
  const bus = engine.busFor(offline, out, beat('beat-a'));
  assert.equal(engine.busFor(offline, out, beat('beat-a')), bus, 'still one graph per beat');
  assert.equal(engine.mixes(), 0);
  assert.ok(ctx);
});

// ── The sheet in the real app ──

let page;
let $;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  $('#beats-toggle').dispatch('click');
  await page.settle();
  newBeatWithRow(page);
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  await page.settle();
});

const mixerButton = (i = 0) => document.querySelectorAll('[data-mixer]')[i];
const strips = () => $('#mixer-strips').children.filter((c) => c.classList.contains('mix-strip'));
const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
const openBeat = () => {
  const id = state.patterns.get(state.personId).id;
  return state.savedBeats.find((b) => b.id === id);
};

test('🎚️ opens the mixer: a column per row, then the Master', () => {
  assert.ok(mixerButton(), 'on the control bar');
  mixerButton().dispatch('click');
  assert.ok($('#mixer').open);
  assert.equal(strips().length, 3);
  assert.equal(strips().at(-1).dataset.strip, 'master');
  for (const s of strips().slice(0, 2)) {
    for (const sel of ['[data-fader]', '[data-mute]', '[data-solo]', '[data-fx]']) assert.ok(s.querySelector(sel), sel);
  }
});

test('a fader sets its row\'s loudness, the same level the row\'s speaker shows', () => {
  const f = strips()[0].querySelector('[data-fader]');
  f.value = '40';
  f.dispatch('input');
  f.dispatch('change');
  assert.match(rows()[0].querySelector('[data-speaker]').getAttribute('aria-label'), / loudness 40 %$/);
  assert.equal(openBeat().rows[0].volume, gainAt(0.4), 'saved as the gain at that position of the taper');
  assert.equal(strips()[0].querySelector('[data-pct="0"]').textContent, '40 %');
});

test('Mute and Solo save with the beat and show in the compact rows', () => {
  strips()[1].querySelector('[data-solo]').dispatch('click');
  assert.equal(openBeat().rows[1].solo, true);
  assert.ok(rows()[1].classList.contains('solo'), 'the soloed row is marked');
  assert.ok(rows()[0].classList.contains('silenced'), 'the other row dims');
  assert.equal(strips()[1].querySelector('[data-solo]').getAttribute('aria-pressed'), 'true');
  strips()[0].querySelector('[data-mute]').dispatch('click');
  assert.equal(openBeat().rows[0].muted, true);
  assert.ok(rows()[0].classList.contains('muted'));
  const all = strips().at(-1).querySelector('[data-all-on]');
  assert.equal(all.disabled, false);
  all.dispatch('click');
  assert.ok(openBeat().rows.every((r) => !r.muted && !r.solo), 'All on: every row heard');
  assert.ok(rows().every((r) => !r.classList.contains('silenced') && !r.classList.contains('muted')));
});

test('an effect per row and on the Master, and the Master\'s loudness, save with the beat', () => {
  const fx = strips()[0].querySelector('[data-fx]');
  fx.value = 'echo';
  fx.dispatch('change');
  assert.equal(openBeat().rows[0].fx, 'echo');
  const mfx = strips().at(-1).querySelector('[data-fx]');
  mfx.value = 'hall';
  mfx.dispatch('change');
  assert.equal(openBeat().fx, 'hall');
  const mf = strips().at(-1).querySelector('[data-fader]');
  mf.value = '70';
  mf.dispatch('input');
  mf.dispatch('change');
  assert.equal(openBeat().volume, gainAt(0.7), 'the Master\'s fader is on the taper too');
  fx.value = '';
  strips()[0].querySelector('[data-fx]').value = '';
  strips()[0].querySelector('[data-fx]').dispatch('change');
  assert.equal('fx' in openBeat().rows[0], false, 'No effect is stored as nothing');
  $('#mixer').close();
});

test('Beats with ⌨️ Keys has the same 🎚️, on the open beat, and its grid shows a solo', async () => {
  keysOn(page);
  await newBuilderBeatWithRow(page);
  page.key('a', { code: 'KeyA' });   // playing a key gives its sound a row: a second row
  const dj = state.patterns.get(state.personId).id;
  mixerButton(1).dispatch('click');
  assert.ok($('#mixer').open);
  const beat = () => state.savedBeats.find((b) => b.id === dj);
  assert.equal(beat().rows.length, 2);
  assert.equal(strips().length, 3);
  strips()[0].querySelector('[data-solo]').dispatch('click');
  assert.equal(beat().rows[0].solo, true, 'the open beat');
  assert.ok($('#dj-grid').children.some((l) => l.classList.contains('solo')));
  $('#mixer').close();
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

// ── 🎼 Song's tempo marks and an Echo on the beat (Ben, 2026-10-28) ──
// An Echo set to a note length keeps that gap when a mark changes the tempo,
// in a song that plays, in 🔊 and ⬇️ (an offline render), and in a share's preview.

test('followChanges: only a step set on the beat changes at a mark, to the gap the new tempo gives', () => {
  const follow = { start: 120, marks: [{ time: 2, bpm: 60 }, { time: 5, bpm: 60 }, { time: 8, bpm: 90 }], origin: 0 };
  // An eighth note: 0.25 s at 120 BPM, 0.5 s at 60, 1/3 s at 90.
  assert.deepEqual(followChanges('echo', follow).map((c) => [c.time, c.step.gap]), [[2, 0.5], [8, 0.333]], 'a mark that keeps the tempo changes nothing');
  assert.deepEqual(followChanges('room', follow), [], 'a room has no note length');
  assert.deepEqual(followChanges('echo', null), [], 'a song with one tempo: nothing to follow');
  assert.deepEqual(followChanges('echo', { start: 120, marks: [], origin: 0 }), []);
});

test('buildMix: the Echo delay starts at the tempo heard first and is set again at each mark, on the clock', () => {
  const dest = { kind: 'dest', out: [] };
  const p = cleanPattern({ bpm: 120, rows: [{ clipId: 'a', fx: 'echo' }, { clipId: 'b' }] }, 'p');
  const delayOf = (ctx) => ctx.nodes.find((n) => n.kind === 'delay').delayTime;
  const plain = recordingContext();
  buildMix(plain, dest, p);
  assert.equal(delayOf(plain).value, 0.25, 'an eighth at 120 BPM');
  assert.equal(delayOf(plain).sets, undefined, 'no marks: nothing scheduled, as before');

  const ctx = recordingContext();
  const bus = buildMix(ctx, dest, { ...p, follow: { start: 100, marks: [{ time: 2, bpm: 60 }, { time: 6, bpm: 150 }], origin: 10 } });
  assert.equal(delayOf(ctx).initial, 0.3, 'it starts at the tempo heard first (an eighth at 100 BPM)');
  assert.deepEqual(delayOf(ctx).sets, [[12, 0.5], [16, 0.2]], 'two and six seconds after the song began sounding at 10 s');
  assert.ok(bus.tail >= 0.5 * 3 + 0.3, 'the tail is rung out at the slowest tempo it plays at');
  assert.notEqual(mixKey(p), mixKey({ ...p, follow: { start: 100, marks: [], origin: 0 } }));
  const start = { ...p, follow: { start: 100, marks: [], origin: 10 } };
  assert.notEqual(mixKey(start), mixKey({ ...start, follow: { start: 100, marks: [], origin: 11 } }), 'a song begun at another moment builds a new graph');
});

// A song of one beat with an Echo on its row, planned and sounded as the player and the renders do.
function songWithEcho(tempos, plan = {}) {
  const ctx = recordingContext();
  ctx.createBufferSource = () => ({ connect() {}, start() {}, stop() {}, playbackRate: { value: 1 } });
  const lane = { kind: 'lane', out: [] };
  const audio = { master: lane, context: () => null, wake: () => ctx, load: async () => ({ buffer: {}, duration: 0.2 }), key: (c) => c.id };
  const engine = createBeatEngine({ audio, clipById: (id) => ({ id }) });
  const beat = cleanPattern({ id: 'beat-e', personId: 'pip', bpm: 90, bars: 1, rows: [{ clipId: 'kick', fx: 'echo', steps: on(0, 8) }] }, 'pip');
  const seq = {
    beatPlan: (raw) => { const p = cleanPattern(raw, raw.personId); const seconds = 16 * (60 / p.bpm / 4); return { pattern: p, seconds, hits: planHits(p, 'plain', seconds, 16) }; },
    soundHit: engine.soundHit,
  };
  const song = cleanSong({ personId: 'pip', tempo: 120, tempos, lanes: [{ blocks: [{ beatId: 'beat-e', bar: 0, times: 4 }] }] });
  const planned = planSong(song, () => beat, seq, plan);
  return { ctx, planned, play: async (origin = 0) => {
    await engine.prepareBeats([beat]);
    if (planned.follow) planned.follow.origin = origin;
    soundSong(ctx, [lane], planned, seq, origin);
    return ctx.nodes.find((n) => n.kind === 'delay').delayTime;
  } };
}

test('a song with a tempo mark: its Echo on the beat is set to the new tempo at the mark, from the start or from a bar', async () => {
  // 120 BPM a bar is 2 s; from bar 3 it is 60 BPM. An eighth is 0.25 s at 120 and 0.5 s at 60.
  const marked = await songWithEcho([{ bar: 3, bpm: 60 }]).play(0.1);
  assert.equal(marked.initial, 0.25);
  assert.deepEqual(marked.sets.map(([at, gap]) => [+at.toFixed(3), gap]), [[4.1, 0.5]], 'at the mark, 4 s in');
  // Begun past the mark: the Echo starts at the new gap and nothing is set later.
  const late = songWithEcho([{ bar: 3, bpm: 60 }], { from: 6 });
  assert.deepEqual(late.planned.follow, { start: 60, marks: [], origin: 0 });
  const after = await late.play();
  assert.equal(after.value, 0.5);
  assert.equal(after.sets, undefined);
  // No marks: the song plays as it always did.
  const steady = songWithEcho(undefined);
  assert.equal(steady.planned.follow, null);
  const flat = await steady.play();
  assert.equal(flat.value, 0.25);
  assert.equal(flat.sets, undefined);
});
