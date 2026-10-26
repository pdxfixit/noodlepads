// A beat playing on Beats keeps the sounds its rows need, in the beat
// maker's `ready` map: while 🗂️ See all plays another beat (or a share's
// preview is made), and for rows a groove adds while it plays. The real
// app, with a live audio clock that counts the hits it is given; sound
// itself needs a browser.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { FakeOfflineAudioContext } from './helpers.mjs';

let page;
let $;
let state;
let audio;
let ctx;
const hits = [];   // when each live hit was booked to sound
const heard = [];  // and whose sound it was

before(async () => {
  console.error = () => {};
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ audio } = await import('../web/audio.js'));
  audio.load = async (clip) => ({ buffer: { duration: 0.1, clip: clip.id }, duration: 0.1 });
  ctx = audio.wake();
  ctx.sampleRate = 48000;
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  ctx.createBufferSource = () => ({ connect() {}, stop() {}, playbackRate: param(), start(at) { hits.push(at); heard.push(this.buffer?.clip); } });
  ctx.createGain = () => ({ connect() {}, disconnect() {}, gain: param() });
  await page.settle();
});

const wait = () => new Promise((r) => setTimeout(r, 60));

// See all renders through seq.prepareBeats, which used to empty `ready`
// first, so the playing beat's rows went quiet until the next ▶.
test('See all playing another beat leaves the playing beat its sounds', async () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  const row = $('#seq-rows').children.find((c) => c.classList.contains('seq-row'));
  for (const p of row.querySelectorAll('.pill')) p.dispatch('click');   // every pill on
  const who = state.personId;
  const mine = state.savedBeats.find((b) => b.personId === who && !b.id.startsWith('beat-scratch-'));
  const other = state.manifest.people.find((p) => p.id === who).clips.map((c) => c.id).find((id) => id !== mine.rows[0].clipId);
  state.savedBeats.push({ id: 'beat-other', personId: who, name: 'Other one', bpm: 100, bars: 1, swing: 0, saved: 1, created: 1,
    rows: [{ clipId: other, steps: Array.from({ length: 16 }, (_, i) => i % 4 === 0), accents: Array(16).fill(false), rate: 1, ring: false, muted: false }] });

  ctx.currentTime = 100;
  $('#seq-play').dispatch('click');
  await page.settle();
  await wait();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'the beat plays');
  assert.ok(hits.length > 0, 'its first pill is booked');

  // 🗂️ See all: the other beat's ▶.
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === who).querySelector('[data-profile]').dispatch('click');
  $('#profile-counts').dispatch('click');
  await page.settle();
  $('#things-chips').children.find((c) => c.dataset.show === 'beats').dispatch('click');
  $('#things-list').querySelectorAll('.sa-row').find((r) => r.querySelector('.sa-name')?.textContent === 'Other one').dispatch('click');
  await page.settle();
  await wait();

  // A whole pass later, the playing beat still books its pills.
  const before = hits.length;
  for (let t = 100.2; t < 102.6; t += 0.05) { ctx.currentTime = t; await new Promise((r) => setTimeout(r, 30)); }
  assert.ok(hits.length - before >= 12, `the beat kept playing its pills (${hits.length - before} booked)`);
  $('#seq-play').dispatch('click');
  $('#things-dialog').querySelector('[data-close]')?.dispatch('click');
  ctx.currentTime = 0;
});

// ➕ Add to this beat (💃 Grooves) while the beat plays: the rows it adds
// play from their next pill, as a row added with + Add a row does. Their
// sounds were never loaded, so they stayed quiet until the next ▶ Play.
test('rows a groove adds while the beat plays are heard at once', async () => {
  ctx.currentTime = 200;
  $('#seq-play').dispatch('click');
  await page.settle();
  await wait();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'the beat plays');
  const kick = `${state.personId}-kick`;
  assert.ok(!heard.includes(kick), 'no kick in the beat yet');
  $('#seq-grooves').dispatch('click');
  $('#groove-how').querySelector('[data-how="add"]').dispatch('click');
  $('#groove-list').querySelector('[data-groove="four"]').dispatch('click');
  await page.settle();
  for (let t = 200.1; t < 202.6; t += 0.05) { ctx.currentTime = t; await new Promise((r) => setTimeout(r, 30)); }
  assert.ok(heard.includes(kick), "the groove's kick plays while the beat goes on");
  $('#seq-play').dispatch('click');
  $('#seq-grooves').dispatch('click');
  $('#groove-how').querySelector('[data-how="load"]').dispatch('click');
  $('#grooves').close();
  ctx.currentTime = 0;
});
