// 🎚️ Mixer (web/mixer.js, Ben 2026-10-12): per row a fader, Mute, Solo and
// one effect, plus the Master's loudness and effect. Mute and solo save with
// the beat (ADR 0018): the stored fields and their cleaning, the round trips
// a beat makes (beat file, backup, share), the graph every hit plays
// through, then the sheet in the real app on Beats and in Beat Builder.
// Sound itself needs a browser.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { MIX_FX, cleanFx, fxSteps, masterLevel, silencedBySolo, mixKey, buildMix } from '../web/mixer.js';
import { cleanRow, cleanPattern, samePattern, planHits, audible, beatToFile, beatFromFile } from '../web/beat.js';
import { readBackup, makeBackup } from '../web/backup.js';
import { shareBundle, shareDoc } from '../web/cloud-sync.js';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, newBuilderBeatWithRow, keysOn, keysOff } from './new-beat.mjs';
import { state } from '../web/state.js';

const on = (...at) => Array.from({ length: 16 }, (_, i) => at.includes(i));

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
  const param = (value = 0) => ({ value, setValueAtTime() {}, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {}, linearRampToValueAtTime() {} });
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
  assert.equal(openBeat().rows[0].volume, 0.4, 'saved');
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
  assert.equal(openBeat().volume, 0.7);
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
