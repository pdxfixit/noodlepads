// 🎤 Live's take card: its ↩️ Undo takes the take just made out at once,
// and the banner's ↩️ Undo brings it back (AGENTS.md: where a slip costs
// work, offer Undo), card and all. The real app on the stand-in page.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';
import { state } from '../web/state.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const takes = () => state.takes.filter((t) => t.personId === state.personId);

function recordTake() {
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  page.key('s', { code: 'KeyS' });
  $('#dj-record').dispatch('click');
}

test('the take card\'s ↩️ Undo takes the take out; ↩️ Undo in the banner brings it back with its card', async () => {
  $('#live-tab').dispatch('click');
  const before = takes().length;
  recordTake();
  assert.equal($('#dj-done').hidden, false);
  assert.equal(takes().length, before + 1);
  $('#dj-take-name').value = 'Big Jam';
  $('#dj-take-name').dispatch('change');
  const made = takes().at(-1);

  $('#dj-done-undo').dispatch('click');
  assert.equal($('#dj-done').hidden, true, 'the card goes');
  assert.equal(takes().length, before, 'the take is out');
  assert.ok(hasUndo(), 'the banner offers ↩️ Undo');
  assert.match($('#banner-text').textContent, /Big Jam/, 'it names the take');

  $('#banner-action').dispatch('click');
  await page.settle();
  assert.equal(takes().length, before + 1, 'back again');
  const back = takes().at(-1);
  assert.equal(back.id, made.id);
  assert.equal(back.name, 'Big Jam', 'as it was, renamed');
  assert.deepEqual(back.events, made.events);
  assert.equal($('#dj-done').hidden, false, 'with its card');
  assert.equal($('#dj-take-name').value, 'Big Jam');
  assert.equal($('#dj-done-play').hidden, false);

  // Undo on a take brought back works again; a newer take keeps the card.
  $('#dj-done-undo').dispatch('click');
  recordTake();
  const newer = takes().at(-1);
  assert.notEqual(newer.id, made.id);
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.ok(takes().some((t) => t.id === made.id), 'the old take is back in 🎬 Takes');
  assert.equal($('#dj-take-name').value, newer.name, 'the card stays on the newer take');
  for (const t of takes()) if (t.id === made.id || t.id === newer.id) state.takes = state.takes.filter((x) => x !== t);
  $('#dj-done-close').dispatch('click');
  $('#pads-tab').dispatch('click');
});
