// A beat or song playing keeps the sounds its rows need, in the beat
// maker's `ready` map: while 🗂️ See all plays another beat (or a share's
// preview is made), for rows a groove adds while it plays, and when a sound
// fails to load again. A sound that is gone goes quiet. The real app, with
// a live audio clock that counts the hits it is given; sound itself needs a
// browser.
//
// The clock is moved by hand, but the schedulers' 25 ms ticks are real
// intervals: settle() never waits for an interval (by design), and mocking
// the timers would replace the stand-in page's own. So `run` gives each
// step of the clock a real 30 ms, and the checks ask only whether a sound
// was booked at all after the moment that matters, not how many times.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { dropBeat } from './song-ui.mjs';
import { FakeOfflineAudioContext } from './helpers.mjs';

let page;
let $;
let state;
let audio;
let ctx;
let mine;          // the beat these tests play: one row, every pill on
const heard = [];  // whose sound each live hit was
const loads = [];  // each clip id audio.load was asked for
let failing = false;

before(async () => {
  console.error = () => {};
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ audio } = await import('../web/audio.js'));
  audio.load = async (clip) => {
    loads.push(clip.id);
    if (failing) throw new Error('offline');
    return { buffer: { duration: 0.1, clip: clip.id }, duration: 0.1 };
  };
  ctx = audio.wake();
  ctx.sampleRate = 48000;
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  ctx.createBufferSource = () => ({ connect() {}, stop() {}, playbackRate: param(), start() { heard.push(this.buffer?.clip); } });
  ctx.createGain = () => ({ connect() {}, disconnect() {}, gain: param() });
  await page.settle();
});

// The clock from `from` to `to`, a real tick for each 0.05 s.
async function run(from, to) {
  for (let t = from; t < to; t += 0.05) { ctx.currentTime = t; await new Promise((r) => setTimeout(r, 30)); }
}
const heardSince = (mark, clipId) => heard.slice(mark).filter((c) => c === clipId).length;
const playing = () => $('#seq-play').getAttribute('aria-pressed') === 'true';

const closeSeeAll = () => $('#things-dialog').querySelector('[data-close]')?.dispatch('click');
// 🗂️ See all's ▶ on the beat named `name`, from a closed See all (a second
// ▶ on a row that plays would stop it).
async function seeAllPlay(name) {
  if ($('#things-dialog').open) closeSeeAll();
  if (!$('#profile-dialog').open) {
    if (!$('#people-dialog').open) $('#people-open').dispatch('click');
    $('#people-edit').children.find((r) => r.dataset.person === state.personId).querySelector('[data-profile]').dispatch('click');
  }
  $('#profile-counts').dispatch('click');
  await page.settle();
  $('#things-chips').children.find((c) => c.dataset.show === 'beats').dispatch('click');
  $('#things-list').querySelectorAll('.sa-row').find((r) => r.querySelector('.sa-name')?.textContent === name).dispatch('click');
  await page.settle();
}

// See all renders through seq.prepareBeats, which used to empty `ready`
// first, so the playing beat's rows went quiet until the next ▶.
test('See all playing another beat leaves the playing beat its sounds', async () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  const row = $('#seq-rows').children.find((c) => c.classList.contains('seq-row'));
  for (const p of row.querySelectorAll('.pill')) p.dispatch('click');   // every pill on
  const who = state.personId;
  mine = state.savedBeats.find((b) => b.personId === who && !b.id.startsWith('beat-scratch-'));
  const other = state.manifest.people.find((p) => p.id === who).clips.map((c) => c.id).find((id) => id !== mine.rows[0].clipId);
  state.savedBeats.push({ id: 'beat-other', personId: who, name: 'Other one', bpm: 100, bars: 1, swing: 0, saved: 1, created: 1,
    rows: [{ clipId: other, steps: Array.from({ length: 16 }, (_, i) => i % 4 === 0), accents: Array(16).fill(false), rate: 1, ring: false, muted: false }] });

  ctx.currentTime = 100;
  $('#seq-play').dispatch('click');
  await page.settle();
  await run(100, 100.2);
  assert.ok(playing(), 'the beat plays');
  assert.ok(heardSince(0, mine.rows[0].clipId) > 0, 'its pills are booked');

  await seeAllPlay('Other one');
  const mark = heard.length;
  await run(100.2, 102.6);
  assert.ok(heardSince(mark, mine.rows[0].clipId) > 0, 'the beat still books its pills after See all played');
  $('#seq-play').dispatch('click');
  closeSeeAll();
  ctx.currentTime = 0;
});

// The same for 🎼 Song: it plays every hit through `ready` too.
test('See all playing another beat leaves a playing song its sounds', async () => {
  $('#song-tab').dispatch('click');
  dropBeat($, { name: mine.name });
  ctx.currentTime = 150;
  $('#song-play').dispatch('click');
  await page.settle();
  await run(150, 150.3);
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'true', 'the song plays');
  await seeAllPlay('Other one');
  const mark = heard.length;
  await run(150.3, 152.4);
  assert.ok(heardSince(mark, mine.rows[0].clipId) > 0, 'the song still books its beat after See all played');
  $('#song-play').dispatch('click');
  closeSeeAll();
  $('#beats-toggle').dispatch('click');
  ctx.currentTime = 0;
});

// ➕ Add to this beat (💃 Grooves) while the beat plays: the rows it adds
// play from their next pill, as a row added with + Add a row does. Their
// sounds were never loaded, so they stayed quiet until the next ▶ Play.
test('rows a groove adds while the beat plays are heard at once', async () => {
  ctx.currentTime = 200;
  $('#seq-play').dispatch('click');
  await page.settle();
  await run(200, 200.1);
  assert.ok(playing(), 'the beat plays');
  const kick = `${state.personId}-kick`;
  assert.equal(heardSince(0, kick), 0, 'no kick in the beat yet');
  $('#seq-grooves').dispatch('click');
  $('#groove-how').querySelector('[data-how="add"]').dispatch('click');
  const l0 = loads.length;
  $('#groove-list').querySelector('[data-groove="four"]').dispatch('click');
  await page.settle();
  assert.ok(loads.slice(l0).includes(kick), "the groove's new rows load");
  assert.ok(!loads.slice(l0).includes(mine.rows[0].clipId), 'the rows already playing are not loaded again');
  await run(200.1, 202.6);
  assert.ok(heardSince(0, kick) > 0, "the groove's kick plays while the beat goes on");
  $('#seq-play').dispatch('click');
  $('#seq-grooves').dispatch('click');
  $('#groove-how').querySelector('[data-how="load"]').dispatch('click');
  $('#grooves').close();
  ctx.currentTime = 0;
});

// A sound that fails to load on the next ▶ (a slow phone, storage busy)
// keeps the copy it had; one that is gone (deleted) goes quiet.
test('a sound that fails to load again keeps playing; a sound deleted goes quiet', async () => {
  const own = { id: 'user-wren-hum', personId: state.personId, label: 'Hum', emoji: '🐝', created: 1, voice: 'normal', blob: new Blob(['x'], { type: 'audio/webm' }), mime: 'audio/webm' };
  state.userClips.push(own);
  state.savedBeats.push({ id: 'beat-own-sound', personId: state.personId, name: 'Own sound', bpm: 100, bars: 1, swing: 0, saved: Date.now() + 1e6, created: Date.now() + 1e6,
    rows: [{ clipId: own.id, steps: Array(16).fill(true), accents: Array(16).fill(false), rate: 1, ring: false, muted: false }] });
  $('#beats-toggle').dispatch('click');
  await page.settle();
  const chip = document.querySelectorAll('[data-beat-chips]')[0].children.find((c) => c.dataset.chip === 'beat-own-sound');
  assert.ok(chip, 'the beat has a chip');
  chip.dispatch('click');
  await page.settle();
  const go = async (at) => {
    ctx.currentTime = at;
    $('#seq-play').dispatch('click');
    await page.settle();
    const mark = heard.length;
    await run(at, at + 0.6);
    $('#seq-play').dispatch('click');
    return heardSince(mark, own.id);
  };
  assert.ok(await go(300) > 0, 'it plays');
  failing = true;
  try {
    assert.ok(await go(310) > 0, 'a load that fails keeps the copy it had');
  } finally {
    failing = false;
  }
  state.userClips.splice(state.userClips.indexOf(own), 1);
  assert.equal(await go(320), 0, 'a deleted sound goes quiet');
  ctx.currentTime = 0;
});
