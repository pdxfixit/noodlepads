// A phone locked, or the app switched away, mid-take: the take ends there,
// kept, as Esc keeps it. It ran on out of sight for up to 3 minutes, silent
// (council, 2026-10-26). Not tested here: a real lock screen.

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

test('the page hidden mid-take: the take ends and is kept, with what was played', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  ctx.currentTime = 7;
  page.key('a', { code: 'KeyA' });
  ctx.currentTime = 7.5;
  page.key('s', { code: 'KeyS' });
  const before = state.takes.length;
  ctx.currentTime = 8;
  document.hidden = true;
  page.docEvent('visibilitychange');
  document.hidden = false;
  assert.equal($('#dj-record').textContent, '● Record', 'not recording');
  assert.equal(state.takes.length, before + 1, 'kept');
  assert.equal(state.takes.at(-1).events.length, 2);
  ctx.currentTime = 0;
});
