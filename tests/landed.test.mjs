// ✨ Landed (web/landed.js): where something was just kept, the button of its
// collection glows once (Ben, 2026-10-30): 🗂️ Beats and 🗂️ Songs when a beat or
// song is kept, by 💾 Keep or by 🆕 New keeping the scratch for you, and 🔊 Pads
// when a new sound is added. The look needs a browser (`just look`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { dropBeat } from './song-ui.mjs';
import { landed } from '../web/landed.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const glowing = (selector) => document.querySelectorAll(selector).filter((b) => b.classList.contains('landed'));
const beatBar = () => document.querySelectorAll('.beat-bar')[0];
const tap = (selector) => $(selector).dispatch('click');

test('the helper glows every match once, and lets go after a moment', async () => {
  landed('[data-beat-open]');
  const all = document.querySelectorAll('[data-beat-open]');
  assert.ok(all.length > 1 && glowing('[data-beat-open]').length === all.length, 'the bar, the keys view');
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(glowing('[data-beat-open]').length, 0);
  landed('#nothing-here');   // no match: nothing happens
});

test('💾 Keep and 🆕 New keeping the scratch glow 🗂️ Beats', () => {
  tap('#beats-toggle');
  tap('#seq-add'); tap('#chooser-ok');
  $('#seq-rows').children.find((c) => c.classList.contains('seq-row')).querySelectorAll('.pill')[0].dispatch('click');
  assert.equal(glowing('[data-beat-open]').length, 0, 'nothing kept yet');
  beatBar().querySelector('[data-beat-new]').dispatch('click');
  assert.ok(glowing('[data-beat-open]').length > 0, 'New kept the scratch: 🗂️ Beats glows');
  beatBar().querySelector('[data-beat-new]').dispatch('click');   // a blank scratch: keeps nothing
});

test('🎼 Song: keeping a song glows 🗂️ Songs', () => {
  tap('#song-tab');
  dropBeat($);
  tap('#song-keep');
  assert.ok(glowing('#song-open').length === 1);
});

test('a new sound glows 🔊 Pads', async () => {
  const { addClip } = await import('../web/board.js');
  const { newClip } = await import('../web/model.js');
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(glowing('#pads-tab').length, 0);
  await addClip(newClip({ personId: 'p-x', label: 'Test', emoji: '🔊', blob: new Blob(['x']) }));
  assert.equal(glowing('#pads-tab').length, 1);
});
