// Shift does what a hold does (Ben, 2026-10-11: "hold operations can also be
// performed with shift when that's possible"), on the stand-in page: a pad
// and a DJ key loop, a row's speaker opens its slider, 🎲 opens Pick a name,
// a voice chip shows its recipe. A plain tap still does what it did.
// Not tested here: the sound itself (audio is spied on, not heard).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { fakeBuffer } from './helpers.mjs';
import { newBeatWithRow } from './new-beat.mjs';

let page;
let $;
let audio;
let state;
const calls = [];
const looping = new Set();

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
  ({ state } = await import('../web/state.js'));
  // What the pads and DJ keys ask of the audio, recorded instead of heard.
  audio.play = (clip) => { calls.push(['play', clip.id]); };
  audio.loop = (clip) => { calls.push(['loop', clip.id]); looping.add(clip.id); };
  audio.isLooping = (id) => looping.has(id);
  audio.stop = (id) => { calls.push(['stop', id]); looping.delete(id); };
});

const pads = () => $('#pads').querySelectorAll('.pad').filter((p) => p.dataset.id);

test('Shift-click a pad loops it at once; Shift-click it again (or tap it) stops it; a plain click only plays', () => {
  const pad = pads()[0];
  const id = pad.dataset.id;
  calls.length = 0;
  pad.dispatch('pointerdown', { button: 0, pointerId: 1, shiftKey: true });
  page.winEvent('pointerup', { pointerId: 1 });
  pad.dispatch('click', { detail: 1, shiftKey: true });
  assert.deepEqual(calls, [['loop', id]], 'loops at once, without playing it twice');
  pad.dispatch('pointerdown', { button: 0, pointerId: 2, shiftKey: true });
  page.winEvent('pointerup', { pointerId: 2 });
  assert.deepEqual(calls.at(-1), ['stop', id], 'a looping pad stops, as a tap does');
  calls.length = 0;
  pad.dispatch('pointerdown', { button: 0, pointerId: 3 });
  page.winEvent('pointerup', { pointerId: 3 });
  assert.deepEqual(calls, [['play', id]], 'a plain click plays once');
  // From the keyboard: Shift+Enter loops, Enter on a looping pad stops it.
  calls.length = 0;
  pad.dispatch('click', { detail: 0, shiftKey: true });
  assert.deepEqual(calls, [['loop', id]]);
  pad.dispatch('click', { detail: 0 });
  assert.deepEqual(calls.at(-1), ['stop', id]);
});

test('Shift-click a key loops its sound; Shift+Enter on a focused key does too; a plain click plays once', () => {
  $('#live-tab').dispatch('click');
  const key = $('#dj-keys').querySelector('[data-code="KeyA"]');
  const id = state.decks.get(state.personId)?.keys?.KeyA ?? null;
  calls.length = 0;
  key.dispatch('pointerdown', { button: 0, pointerId: 4, shiftKey: true });
  key.dispatch('pointerup', { pointerId: 4 });
  const looped = calls.filter(([w]) => w === 'loop');
  assert.equal(looped.length, 1, JSON.stringify(calls));
  if (id) assert.equal(looped[0][1], id);
  const clipId = looped[0][1];
  key.dispatch('pointerdown', { button: 0, pointerId: 5, shiftKey: true });
  key.dispatch('pointerup', { pointerId: 5 });
  assert.deepEqual(calls.at(-1), ['stop', clipId], 'Shift-click again stops it');
  calls.length = 0;
  key.dispatch('pointerdown', { button: 0, pointerId: 6 });
  key.dispatch('pointerup', { pointerId: 6 });
  assert.deepEqual(calls, [['play', clipId]], 'a plain click plays once (the hold timer was cleared)');
  calls.length = 0;
  key.dispatch('click', { detail: 0, shiftKey: true });
  assert.deepEqual(calls.filter(([w]) => w !== 'play'), [['loop', clipId]]);
  key.dispatch('click', { detail: 0 });
  assert.deepEqual(calls.at(-1), ['stop', clipId]);
  $('#pads-toggle')?.dispatch('click');
});

test('Shift-click a beat row\'s speaker opens its loudness slider and does not mute', async () => {
  $('#beats-toggle').dispatch('click');
  await page.settle();
  if (!$('#seq-rows').querySelector('.seq-row')) {
    newBeatWithRow(page);
    await page.settle();
  }
  const speaker = () => $('#seq-rows').children.find((c) => c.classList.contains('seq-row')).querySelector('[data-speaker]');
  const pop = () => document.querySelector('.vol-pop');
  speaker().dispatch('pointerdown', { button: 0, clientX: 10, clientY: 10, shiftKey: true });
  page.winEvent('pointerup', {});
  speaker().dispatch('click', { shiftKey: true });
  assert.equal(pop()?.hidden, false, 'the slider shows');
  assert.equal(speaker().getAttribute('aria-pressed'), 'false', 'not muted');
  page.docEvent('pointerdown', { target: document.body });
  assert.equal(pop().hidden, true);
  // Shift+Enter is the same click from the keyboard.
  speaker().dispatch('click', { detail: 0, shiftKey: true });
  assert.equal(pop().hidden, false);
  assert.equal(speaker().getAttribute('aria-pressed'), 'false');
  page.docEvent('pointerdown', { target: document.body });
  speaker().dispatch('click');
  assert.equal(speaker().getAttribute('aria-pressed'), 'true', 'a plain click still mutes');
  speaker().dispatch('click');
});

test('Shift-click 🎲 opens Pick a name and keeps the name; so does a plain click (Ben, 2026-10-12)', async () => {
  $('#people-open').dispatch('click');
  await page.settle();
  $('#people-dialog').querySelectorAll('[data-profile]')[0].dispatch('click');
  const name = () => $('#profile-name').textContent;
  const dice = () => $('#profile-dialog').querySelector('[data-reroll]');
  const before = name();
  dice().dispatch('click', { shiftKey: true });
  await page.settle();
  assert.equal($('#names-dialog').open, true, 'Pick a name opens');
  assert.equal(name(), before, 'no reroll');
  $('#names-dialog').close();
  dice().dispatch('click');
  await page.settle();
  assert.equal($('#names-dialog').open, true, 'a plain click opens it too');
  assert.equal(name(), before, 'and changes nothing yet');
  $('#names-dialog').close();
  $('#profile-dialog').close();
  $('#people-dialog').close();
});

test('Shift-click a voice chip shows its name and recipe without using it', async () => {
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads()[0];
  audio.originals.set(pad.dataset.id, Promise.resolve(fakeBuffer([Array.from({ length: 800 }, (_, i) => Math.sin(i / 3) * 0.5)], 8000)));
  pad.parent.querySelector('[data-edit]').dispatch('click');
  await page.settle();
  const chip = (p) => $('#voices').children.find((b) => b.dataset.preset === p);
  const lit = () => $('#voices').children.filter((b) => b.getAttribute('aria-pressed') === 'true').length;
  chip('chipmunk').dispatch('click', { shiftKey: true });
  assert.match($('#voice-line').textContent, /^🐿️ Chipmunk: /);
  assert.equal(lit(), 0, 'not used');
  chip('chipmunk').dispatch('click');
  assert.equal(lit(), 1, 'a plain tap uses it');
  $('#sheet').close();
});

test('Help and the mouse how-to say Shift-click wherever they say hold', async () => {
  const { screenHint } = await import('../web/app.js');
  for (const screen of ['pads', 'live']) assert.match(screenHint(screen, false, true), /Shift-click/, screen);
  // A mouse's Shift-click on a pill picks (Ben, 2026-10-19: loud is "only the hold").
  assert.doesNotMatch(screenHint('beats', false, true), /Shift/);
  for (const screen of ['pads', 'beats', 'live', 'keys']) assert.doesNotMatch(screenHint(screen, false, false), /Shift/, `${screen} on a touch screen`);
  const { HELP } = await import('../web/help.js');
  const texts = HELP.flatMap((s) => s.items.map((i) => i.text));
  // Each line about a hold that Shift now does: a pad's loop, a voice's name,
  // a loud pill, a row's loudness, a DJ key's loop, the grid (🎲 in People
  // is a plain tap since 2026-10-12).
  // A pill's loud hit is the hold alone now (Ben, 2026-10-19): its lines are left out.
  const holds = texts.filter((t) => /\b[Hh]old (a pad|it\b|one\b|🎲)/.test(t) && !/drag \(on a touch screen, hold first\)|Hold to hear it|for a loud hit/.test(t));
  assert.ok(holds.length >= 5, holds.join('\n'));
  for (const t of holds) assert.match(t, /Shift-click/, t);
});
