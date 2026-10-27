// One beat engine (docs/design/one-beat-engine.md), step 9: one thing plays
// at a time, and the engine is the one owner. A new run takes over from the
// one playing, and the run taken over is stopped through its owner (the beat
// maker's stop, Kids' stopBeat, Song's stop, a groove sample's stopSample),
// so what each does when it stops still happens: Beats reads a beat a sync
// changed again, Kids' ▶ comes back. audio.js stopAll is for pads and keys
// and is not the engine's.
// First the engine alone, with a stand-in audio object and clock; then the
// app, with a clock moved by hand. Sound itself needs a browser.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, keysOn, keysOff } from './new-beat.mjs';
import { dropBeat } from './song-ui.mjs';
import { createBeatEngine } from '../web/beat-engine.js';
import { cleanRow } from '../web/beat.js';

// ── The engine alone ──

function fakeAudio() {
  const t = { now: 1, faded: 0 };
  const gain = () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() { t.faded++; } }, connect() {}, disconnect() {} });
  const ctx = { get currentTime() { return t.now; }, createGain: gain,
    createBufferSource: () => ({ playbackRate: { value: 1 }, connect() {}, start() {}, stop() {} }) };
  t.audio = { master: {}, context: () => ctx, wake: () => ctx, key: (c) => c.id, load: async () => ({ buffer: {}, duration: 1 }) };
  return t;
}
const listRun = (engine, pattern, hooks = {}) => engine.play({ list: { events: [{ at: 1, pattern, row: 0, loud: false, note: 0, len: 0, dest: {}, key: 'k' }] }, ...hooks });

test('a new run takes over: the run playing is stopped through its owner, once, and its sounds fade', async () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const pattern = { bpm: 100, bars: 1, rows: [cleanRow({ clipId: 'kick', steps: [true] })] };
  await engine.prepareBeats([pattern]);
  const told = [];
  const first = listRun(engine, pattern, { onStop: () => told.push('first') });
  first.tick();
  assert.equal(engine.playing(), first);
  const second = listRun(engine, pattern, { onStop: () => told.push('second') });
  assert.deepEqual(told, ['first'], 'the owner of the first was asked to stop it');
  assert.equal(first.on, false);
  assert.ok(t.faded > 0, 'what it was sounding fades');
  assert.equal(engine.playing(), second);
  second.stop();
  assert.equal(engine.playing(), null);
  listRun(engine, pattern, { onStop: () => told.push('third') });
  assert.deepEqual(told, ['first'], 'a run its owner stopped is not stopped again');
});

test('a run whose owner does nothing when asked is stopped anyway; an owner that stops its own run is not looped back to', async () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const pattern = { bpm: 100, bars: 1, rows: [cleanRow({ clipId: 'kick', steps: [true] })] };
  await engine.prepareBeats([pattern]);
  let asked = 0;
  const lazy = listRun(engine, pattern, { onStop: () => { asked++; } });
  const own = listRun(engine, pattern, { onStop: () => { asked++; own.stop(); } });
  assert.equal(lazy.on, false, 'stopped by the engine');
  const next = listRun(engine, pattern);
  assert.equal(own.on, false);
  assert.equal(asked, 2);
  assert.equal(engine.playing(), next);
  engine.stop();
  assert.equal(next.on, false, 'engine.stop() stops whatever plays');
  assert.equal(engine.playing(), null);
});

test('a loop run is taken over the same way, while its sounds still load', async () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 100, bars: 1, rows: [cleanRow({ clipId: 'kick', steps: [true] })] };
  let told = 0;
  const loop = engine.play({ beat: () => beat, onStop: () => { told++; } });   // load not settled yet
  assert.equal(loop.on, true);
  const pattern = { ...beat };
  await engine.prepareBeats([pattern]);
  listRun(engine, pattern);
  assert.equal(told, 1);
  assert.equal(loop.on, false);
  assert.equal(await loop.ready, false, 'it never began');
});

test('an owner whose onStop throws does not keep the new run from starting; the old run is stopped anyway', async () => {
  const t = fakeAudio();
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const pattern = { bpm: 100, bars: 1, rows: [cleanRow({ clipId: 'kick', steps: [true] })] };
  await engine.prepareBeats([pattern]);
  const was = console.error;
  const said = [];
  console.error = (...a) => said.push(a);
  try {
    const broken = listRun(engine, pattern, { onStop: () => { throw new Error('owner broke'); } });
    const next = listRun(engine, pattern);
    assert.equal(broken.on, false, 'stopped by the engine');
    assert.equal(next.on, true, 'the new run started');
    assert.equal(engine.playing(), next);
    assert.equal(said.length, 1, 'and the failure was said');
  } finally {
    console.error = was;
  }
});

// ── The app ──

let page;
let $;
let seq;
let theEngine;
let state;
let ctx;
let audio;

before(async () => {
  console.error = () => {};
  globalThis.noodleTestSeq = (s, e) => { seq = s; theEngine = e; };
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ audio } = await import('../web/audio.js'));
  ctx = audio.context();
  ctx.createBufferSource = () => ({ connect() {}, disconnect() {}, stop() {}, start() {}, playbackRate: { value: 1 }, buffer: null });
  audio.load = async () => ({ buffer: {}, duration: 0.1 });
  await page.settle();
});

const openBeat = () => state.savedBeats.find((b) => b.id === seq.beat().id);

test('a sync lands while Beats plays and Song ▶ takes over: Beats shows the synced beat, and a pill tapped keeps it', async () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  await page.settle();
  ctx.currentTime = 10;
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal(seq.playing(), true);
  // The sync: another device changed the open beat; the same person shows again.
  const id = seq.beat().id;
  state.savedBeats = state.savedBeats.map((b) => (b.id === id ? { ...b, bpm: 140, saved: Date.now() + 5 } : b));
  seq.setPerson(state.personId);
  assert.equal(seq.playing(), true, 'the beat carries on through a sync');
  assert.equal(seq.beat().bpm, 100, 'and is read again when it stops');
  $('#song-tab').dispatch('click');
  await page.settle();
  dropBeat($);
  ctx.currentTime = 20;
  $('#song-play').dispatch('click');
  await page.settle();
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'true', 'Song plays');
  assert.equal(seq.playing(), false, 'Beats was stopped');
  $('#song-play').dispatch('click');
  $('#beats-toggle').dispatch('click');
  await page.settle();
  assert.equal(seq.beat().bpm, 140, 'Beats shows the synced beat');
  const pill = $('#seq-rows').querySelectorAll('.pill').find((p) => p.getAttribute('aria-pressed') !== 'true');
  pill.dispatch('click');
  assert.equal(seq.beat().bpm, 140, 'a pill tapped keeps it');
  assert.equal(openBeat().bpm, 140);
  assert.ok(openBeat().rows[0].steps.some(Boolean), 'and the pill');
});

test('a groove sample is taken over by ▶ on Beats, and the beat by the next sample', async () => {
  ctx.currentTime = 30;
  const beat = { ...openBeat() };
  await seq.hearBeat('one', beat, { seconds: 2 });
  await page.settle();
  assert.equal(seq.sampling(), 'one');
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal(seq.playing(), true);
  assert.equal(seq.sampling(), null, 'the sample was stopped through its owner');
  await seq.hearBeat('two', beat, { seconds: 2 });
  await page.settle();
  assert.equal(seq.sampling(), 'two');
  assert.equal(seq.playing(), false, 'a sample stops the beat');
  seq.stopHearing();
});

test('🧸 Kids\' ▶ comes back when another run takes over', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', 'kids');
  await page.settle();
  $('[data-kids-tab="beats"]').dispatch('click');
  for (const sq of $('#kids-beat').querySelectorAll('.kids-square')) if (sq.getAttribute('aria-pressed') !== 'true') sq.dispatch('click');
  await page.settle();
  ctx.currentTime = 40;
  $('#kids-play').dispatch('click');
  await page.settle();
  assert.equal($('#kids-play').getAttribute('aria-pressed'), 'true', 'Kids plays');
  await seq.hearBeat('three', { ...openBeat() }, { seconds: 2 });
  await page.settle();
  assert.equal($('#kids-play').getAttribute('aria-pressed'), 'false', 'Kids\' beat stopped through stopBeat: ▶ is back');
  seq.stopHearing();
  await setSetting('level', 'regular');
  await page.settle();
});

// ⌨️ Keys records into the beat while it plays. Whatever takes over, the beat
// stops through the beat maker's stop, which tells ⌨️ Keys (dj.beatStopped),
// so the recording ends and its notes are kept, with their Undo.
async function recordOneNote(at) {
  keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  $('#dj-bars').querySelector('[data-bars="1"]').dispatch('click');
  ctx.currentTime = at;
  $('#dj-record').dispatch('click');
  await page.settle();
  ctx.currentTime = at + 0.05 + 16 * 0.15;
  await new Promise((r) => setTimeout(r, 60));
  page.key('a', { code: 'KeyA' });
  assert.equal($('#dj-record').textContent, '■ Stop', 'recording');
}
const scratchHits = () => {
  const b = state.savedBeats.find((x) => x.id.startsWith('beat-scratch-') && x.personId === state.personId);
  return b?.rows.reduce((n, r) => n + r.steps.filter(Boolean).length, 0) ?? 0;
};

for (const [what, takeOver] of [
  ['a run of the engine (what Song and 🧸 Kids start)', () => theEngine.play({ list: { events: [] } })],
  ['a groove\'s sample', () => seq.hearBeat('keys', { ...openBeat() }, { seconds: 1 })],
]) {
  test(`a ⌨️ Keys recording is kept when ${what} takes over`, async () => {
    const { getLog } = await import('../web/log.js');
    await recordOneNote(5000);
    await takeOver();
    await page.settle();
    assert.equal($('#dj-record').textContent, '● Record', 'the recording ended');
    assert.equal(seq.playing(), false);
    assert.equal(getLog().filter((e) => e.kind === 'dj').at(-1).data.why, 'stopped');
    assert.equal(scratchHits(), 1, 'its note is kept');
    assert.match($('#banner-text').textContent, /^Added 1 note/);
    seq.stopHearing();
    theEngine.stop();
    keysOff(page);
    ctx.currentTime = 0;
  });
}
