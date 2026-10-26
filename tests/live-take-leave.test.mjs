// A 🎤 Live take ends with the screen, as ● Record into the beat does
// (app.js setScreen: "a recording ends with the screen"). It used to run on
// out of sight: ⌨️ Keys on Beats refused to change with no ■ Stop in view,
// 🧸 Kids kept it going, and a take came back up to 3 minutes long, silent
// after the screen changed (2026-10-26). Esc keeps a take; so does leaving.
// Not tested here: the sound (audio is spied on, not heard).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
let state;
let ctx;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
  ctx = audio.context();
});

const mine = () => state.takes.filter((t) => t.personId === state.personId);

test('a take recording on 🎤 Live ends, kept, when the screen changes; ⌨️ Keys on Beats then works', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  ctx.currentTime = 10;
  page.key('a', { code: 'KeyA' });
  ctx.currentTime = 10.5;
  page.key('s', { code: 'KeyS' });
  const before = mine().length;
  ctx.currentTime = 11;
  $('#beats-toggle').dispatch('click');
  await page.settle();
  assert.equal(mine().length, before + 1, 'the take is kept');
  assert.equal(mine().at(-1).events.length, 2);
  // ⌨️ Keys turns on and off, which it refuses while a recording runs.
  const keysWere = document.body.classList.contains('keys-on');
  $(keysWere ? '#dj-keys-toggle' : '#seq-keys').dispatch('click');
  assert.equal(document.body.classList.contains('keys-on'), !keysWere, '⌨️ Keys changes');
  $(keysWere ? '#seq-keys' : '#dj-keys-toggle').dispatch('click');
  assert.equal(document.body.classList.contains('keys-on'), keysWere);
  $('#live-tab').dispatch('click');
  assert.equal($('#dj-record').textContent, '● Record', 'not still recording');
  ctx.currentTime = 0;
});

test('a take recording on 🎤 Live ends, kept, when 🧸 Kids shows', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  const before = mine().length;
  $('#kids-open').dispatch('click');
  await page.settle();
  assert.equal(document.body.classList.contains('kids'), true);
  assert.equal(mine().length, before + 1, 'the take is kept');
  assert.equal($('#dj-record').textContent, '● Record');
});
