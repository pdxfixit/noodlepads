// Feature counts in the real app: 💃 Grooves counts in both beat bars (⌨️
// Keys off and on); 🎤 Live and turning ⌨️ Keys on count too (ADR 0017); and
// 2026-10-12's features: 🎹 the roll and its notes, 🎚️ the Mixer, a chip,
// 💾 Keep (beats and songs), 🔔 Overlap (a row's, Live's), ⋯ and a song's blocks.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { pendingUses } from '../web/uses.js';
import { state } from '../web/state.js';
import { newBeatWithRow } from './new-beat.mjs';
import { dropBeat } from './song-ui.mjs';

let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  // The stand-in page has no localStorage, where counts wait to be sent.
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('💃 Grooves counts from both beat bars, ⌨️ Keys on and off', () => {
  const count = () => pendingUses(state.personId)?.grooves ?? 0;
  const before = count();
  page.$('#dj-grooves').dispatch('click');
  assert.equal(count(), before + 1, '💃 with ⌨️ Keys on');
  page.$('#seq-grooves').dispatch('click');
  assert.equal(count(), before + 2, 'Beats 💃');
});

test('🎤 Live counts as a screen shown, and turning ⌨️ Keys on counts once per turn-on', () => {
  const $ = page.$;
  const mine = () => pendingUses(state.personId) ?? {};
  const live = mine().live ?? 0;
  $('#live-tab').dispatch('click');
  assert.equal(mine().live, live + 1);
  assert.equal(mine().dj, undefined, 'the old name is never sent now');
  $('#beats-toggle').dispatch('click');
  if (document.body.classList.contains('keys-on')) $('#dj-keys-toggle').dispatch('click');
  const keys = mine()['beat-keys'] ?? 0;
  $('#seq-keys').dispatch('click');
  assert.equal(mine()['beat-keys'], keys + 1);
  $('#dj-keys-toggle').dispatch('click');
  assert.equal(mine()['beat-keys'], keys + 1, 'turning it off counts nothing');
  $('#pads-tab').dispatch('click');
});

test("today's features each count once per use: roll, note, mixer, chip, Keep, Overlap, ⋯, a song's block and its Keep", async () => {
  const $ = page.$;
  const mine = () => pendingUses(state.personId) ?? {};
  const was = { ...mine() };
  const more = (f) => (mine()[f] ?? 0) - (was[f] ?? 0);
  $('#beats-toggle').dispatch('click');
  if (document.body.classList.contains('keys-on')) $('#dj-keys-toggle').dispatch('click');
  newBeatWithRow(page);                             // 💾 Keep once
  newBeatWithRow(page);                             // and again: two beats, so a chip
  assert.equal(more('beat-keep'), 2, '💾 Keep on Beats');
  const chip = document.querySelectorAll('[data-beat-chips]')[0].children.find((c) => c.getAttribute('aria-pressed') !== 'true');
  chip.dispatch('click');
  assert.equal(more('beat-chip'), 1, 'a chip tapped');
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  rows()[0].querySelector('[data-ring]').dispatch('click');
  assert.equal(more('row-overlap'), 1, '🔔 turned on');
  rows()[0].querySelector('[data-ring]').dispatch('click');
  assert.equal(more('row-overlap'), 1, 'turning it off counts nothing');
  rows()[0].querySelector('[data-more]').dispatch('click');
  assert.equal(more('more'), 1, '⋯ opened');
  rows()[0].querySelector('[data-more]').dispatch('click');   // its ⋯ again closes it
  assert.equal(more('more'), 1, 'closing counts nothing');
  document.querySelectorAll('[data-mixer]')[0].dispatch('click');
  assert.equal(more('mixer'), 1, '🎚️ opened');
  $('#mixer').close();
  $('#seq-add-tune').dispatch('click');
  assert.equal(more('roll'), 1, '🎹 Add a tune opens the roll');
  $('#roll').querySelector('.note-cell[data-p="4"][data-s="2"]').dispatch('click');
  assert.equal(more('roll-note'), 1, 'a note placed');
  $('#roll').querySelector('.roll-note').dispatch('click');
  assert.equal(more('roll-note'), 1, 'taking it out counts nothing');
  $('#roll').querySelector('[data-roll="done"]').dispatch('click');
  $('#live-tab').dispatch('click');
  $('#dj-overlap').dispatch('click');
  assert.equal(more('live-overlap'), 1, '🔔 on Live');
  $('#dj-overlap').dispatch('click');
  assert.equal(more('live-overlap'), 1, 'and off again counts nothing');
  $('#song-tab').dispatch('click');
  await page.settle();
  dropBeat($);
  assert.equal(more('song-block'), 1, 'a beat placed on a lane');
  $('#song-keep').dispatch('click');
  assert.equal(more('song-keep'), 1, '💾 Keep on Song');
  $('#pads-tab').dispatch('click');
});
