// What the beat maker holds decoded (`ready`, read through seq.held()):
// ▶ Play keeps only the open beat's sounds, so a sound taken off every row
// does not stay decoded all visit; but it leaves `ready` whole while a
// prepareBeats caller (🗂️ See all, a share's preview, 🎼 Song) may still be
// booking hits from it. The real app, reached through its test hook
// (app.js noodleTestSeq); each clip's load can be held back, to put the
// loads in the order a slow phone might.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { FakeOfflineAudioContext } from './helpers.mjs';

let page;
let $;
let state;
let seq;
let ctx;
const gates = new Map();   // clip id -> {promise, open()}: its load waits for open()
const hold = (id) => { let open; const promise = new Promise((r) => { open = r; }); gates.set(id, { promise, open }); return () => { gates.delete(id); open(); }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

before(async () => {
  console.error = () => {};
  globalThis.noodleTestSeq = (s) => { seq = s; };
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.load = async (clip) => {
    await gates.get(clip.id)?.promise;
    return { buffer: { duration: 0.1 }, duration: 0.1 };
  };
  ctx = audio.wake();
  await page.settle();
});

let mine;   // the beat on Beats (sound X)
let other;  // another beat's pattern, as See all plans it (sound Y)
const playing = () => $('#seq-play').getAttribute('aria-pressed') === 'true';

test('▶ Play while See all is loading another beat leaves that beat its sounds', async () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  mine = state.savedBeats.find((b) => b.personId === state.personId && !b.id.startsWith('beat-scratch-'));
  const x = mine.rows[0].clipId;
  const y = state.manifest.people.find((p) => p.id === state.personId).clips.map((c) => c.id).find((id) => id !== x);
  other = seq.beatPlan({ id: 'beat-y', personId: state.personId, name: 'Y', bpm: 100, bars: 1, rows: [{ clipId: y, steps: [true] }] }).pattern;
  // See all asks for Y's sounds; ▶ Play asks for X's meanwhile.
  const openY = hold(y);
  const openX = hold(x);
  const asked = seq.prepareBeats([other]);
  $('#seq-play').dispatch('click');
  // Y comes first: See all would book its hits as soon as it has them.
  openY();
  await asked;
  // Then X, and ▶ Play goes on, before See all has booked.
  openX();
  await flush();
  assert.ok(playing(), 'the beat plays');
  const offline = new FakeOfflineAudioContext(1, 100, 22050);
  assert.equal(seq.soundHit(offline, offline.destination, [], other, 0, 0, false, 0), true, "See all still has Y's sound to book");
  $('#seq-play').dispatch('click');
});

test('▶ Play keeps only the open beat\'s sounds: one no row uses is let go', async () => {
  await page.settle();   // See all is done with Y
  if (playing()) $('#seq-play').dispatch('click');   // whatever the test before left
  assert.ok(seq.held().includes(other.rows[0].clipId), 'Y is held from before');
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.ok(playing());
  assert.deepEqual(seq.held(), [mine.rows[0].clipId], 'only the open beat\'s sound');
  $('#seq-play').dispatch('click');
});
