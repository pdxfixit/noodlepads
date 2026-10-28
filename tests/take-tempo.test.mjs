// A take keeps the ⏲️ Click track's tempo when it was on for the whole take
// (`bpm`, optional), so 🥁 Make a beat snaps to it; a take made with no click
// has none and the beat's tempo is guessed from the hits. cleanTake keeps
// the field only as a whole number in the beat maker's range (a backup
// carries it: tests/backup.test.mjs). And a take's first hit is
// stamped when the key was pressed, not after the sound or the first-key
// redraw (it sat about 0.3 s late in headless Chrome, which put the first
// hit off the grid the others snap to).
// Not tested here: sound (audio is spied on, not heard).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { cleanTake, cleanTakeBpm } from '../web/rhythm.js';

let page;
let $;
let state;
let ctx;
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
  ctx = audio.context();
});

const mine = () => state.takes.filter((t) => t.personId === state.personId);
const clickOn = () => $('#dj-click').getAttribute('aria-pressed') === 'true';
const setClick = (on) => { if (clickOn() !== on) $('#dj-click').dispatch('click'); };
const hit = (code, at) => { ctx.currentTime = at; page.key(code.slice(3).toLowerCase(), { code }); };

test('cleanTake keeps a take\'s tempo only as a whole number in the beat maker\'s range', () => {
  const base = { id: 'take-a', personId: 'p-1', name: 'T', created: 1, duration: 2, events: [] };
  assert.equal(cleanTake({ ...base, bpm: 104 }).bpm, 104);
  assert.equal(cleanTake({ ...base, bpm: 60 }).bpm, 60);
  assert.equal(cleanTake({ ...base, bpm: 180 }).bpm, 180);
  for (const bad of [59, 181, 104.5, '104', NaN, null, -90, 1e9, {}]) assert.ok(!('bpm' in cleanTake({ ...base, bpm: bad })), `${String(bad)} is dropped`);
  assert.ok(!('bpm' in cleanTake(base)), 'a take from before has none');
  assert.equal(cleanTakeBpm(120), 120);
  assert.equal(cleanTakeBpm(5), 0);
});

test('a take made with the ⏲️ Click track on keeps its tempo; with it off, or changed on while recording, it has none', async () => {
  $('#live-tab').dispatch('click');
  setClick(true);
  const bpm = Number($('#dj-click-bpm-out').textContent.replace(/\D/g, ''));
  assert.ok(bpm >= 60 && bpm <= 180, `the click shows a tempo: ${bpm}`);
  $('#dj-record').dispatch('click');
  hit('KeyA', 10);
  hit('KeyS', 10.5);
  $('#dj-record').dispatch('click');
  assert.equal(mine().at(-1).bpm, bpm, 'the click\'s tempo is kept');
  $('#dj-done-close').dispatch('click');

  setClick(false);
  $('#dj-record').dispatch('click');
  hit('KeyA', 20);
  $('#dj-record').dispatch('click');
  assert.ok(!('bpm' in mine().at(-1)), 'no click, no tempo');
  $('#dj-done-close').dispatch('click');

  $('#dj-record').dispatch('click');
  hit('KeyA', 30);
  setClick(true);   // turned on part way through: the take was not made to it
  hit('KeyS', 30.5);
  $('#dj-record').dispatch('click');
  assert.ok(!('bpm' in mine().at(-1)), 'a click turned on during the take is not its tempo');
  setClick(false);
  $('#dj-done-close').dispatch('click');
  ctx.currentTime = 0;
});

test('🥁 Make a beat uses the take\'s own tempo, and guesses for a take that has none', async () => {
  $('#live-tab').dispatch('click');
  const pid = state.personId;
  const events = [0, 4, 8, 12].map((p) => ({ t: p * (60 / 100 / 4), clipId: `${pid}-kick`, kind: 'hit' }));
  const made = (id, bpm) => {
    state.takes.push({ id, personId: pid, name: id, created: 5, duration: 2, events, ...(bpm ? { bpm } : {}) });
  };
  made('take-tempo-yes', 140);
  made('take-tempo-no');
  const { beatFromTake } = await import('../web/take-beat.js');
  assert.equal(beatFromTake(state.takes.find((t) => t.id === 'take-tempo-yes')).bpm, 140, 'the saved tempo wins');
  assert.equal(beatFromTake(state.takes.find((t) => t.id === 'take-tempo-no')).bpm, 100, 'no tempo: the best fit');
});

test('a take\'s first hit is stamped at the press, not after the first play or the first-key redraw', async () => {
  $('#live-tab').dispatch('click');
  let slow = true;
  audio.play = async () => {};
  const plays = [];
  audio.play = () => { if (slow) { ctx.currentTime += 0.3; slow = false; } plays.push(ctx.currentTime); };
  $('#dj-record').dispatch('click');
  hit('KeyA', 40);
  hit('KeyS', 40.5);
  $('#dj-record').dispatch('click');
  const take = mine().at(-1);
  audio.play = async () => {};
  assert.deepEqual(take.events.map((e) => e.t), [0, 0.5], 'the second hit is half a second after the first, however long the first took to sound');
  $('#dj-done-close').dispatch('click');
  ctx.currentTime = 0;
});

test('🥁 Make a beat opens the take as a beat on Beats, at the take\'s tempo, and the banner\'s ↩️ Undo takes it out and goes back to Live', async () => {
  $('#live-tab').dispatch('click');
  setClick(true);
  const bpm = Number($('#dj-click-bpm-out').textContent.replace(/\D/g, ''));
  const step = 60 / bpm / 4;
  $('#dj-record').dispatch('click');
  for (const [pill, code] of [[0, 'KeyA'], [4, 'KeyA'], [4, 'KeyS'], [8, 'KeyA'], [12, 'KeyA'], [12, 'KeyS']]) hit(code, 60 + pill * step);
  $('#dj-record').dispatch('click');
  setClick(false);
  assert.equal(mine().at(-1).bpm, bpm);
  const beats = () => state.savedBeats.filter((b) => b.personId === state.personId && b.name.endsWith(' beat'));
  const before = beats().length;
  $('#dj-done-beat').dispatch('click');
  await page.settle();
  assert.equal(document.body.classList.contains('screen-beats'), true, 'Beats opens');
  assert.equal(beats().length, before + 1, 'a beat joined 🗂️ Beats');
  const made = beats().at(-1);
  assert.equal(made.bpm, bpm);
  assert.equal(made.bars, 1);
  assert.deepEqual(made.rows.map((r) => r.steps.flatMap((s, i) => (s ? [i] : []))), [[0, 4, 8, 12], [4, 12]]);
  assert.match($('#banner-text').textContent, new RegExp(`from your take: ${bpm} BPM, 1 bar\\.`));
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.equal(beats().length, before, 'Undo took the beat out');
  assert.equal(document.body.classList.contains('screen-live'), true, 'and Live is back');
  ctx.currentTime = 0;
});
