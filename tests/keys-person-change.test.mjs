// The keys and a change of person (← →, the corner menu, a link): what one
// kid was recording stays theirs. A 🎤 Live take ran on into the next
// person's board and was filed under them, with the first kid's sounds; and
// ↩️ Undo after ● Record into the beat, tapped once the next person showed,
// put the first kid's beat back as the new person's open beat (2026-10-26).
// Not tested here: the sound (audio is spied on, not heard).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOff, newBuilderBeatWithRow } from './new-beat.mjs';
import { hasUndo } from './banner.mjs';

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

test('a 🎤 Live take recording when the person changes is kept, as the first person\'s', async () => {
  $('#live-tab').dispatch('click');
  const first = state.personId;
  $('#dj-record').dispatch('click');
  ctx.currentTime = 30;
  page.key('a', { code: 'KeyA' });
  ctx.currentTime = 30.4;
  page.key('ArrowRight', { code: 'ArrowRight' });
  await page.settle();
  assert.notEqual(state.personId, first, 'the next person shows');
  assert.equal($('#dj-record').textContent, '● Record', 'the take ended');
  const takes = state.takes.filter((t) => t.events.length);
  assert.equal(takes.length, 1);
  assert.equal(takes[0].personId, first, 'it is the first person\'s');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
  assert.equal(state.personId, first);
  ctx.currentTime = 0;
});

test('↩️ Undo after ● Record into the beat, tapped once another person shows, leaves the new person\'s beat alone', async () => {
  await newBuilderBeatWithRow(page);   // a named beat of the first person's, open with ⌨️ Keys
  await page.settle();
  const first = state.personId;
  const name = $('#dj-beatbar').querySelector('[data-beat-name]').value;
  ctx.currentTime = 200;
  $('#dj-record').dispatch('click');
  await page.settle();
  ctx.currentTime = 202.47;   // just after the "1" (one bar of count-in at 100 BPM after 0.05 s)
  page.key('a', { code: 'KeyA' });
  page.key('ArrowRight', { code: 'ArrowRight' });
  const next = state.personId;
  assert.notEqual(next, first);
  const theirs = $('#dj-beatbar').querySelector('[data-beat-name]').value;
  assert.notEqual(theirs, name);
  // The banner offers Undo for the notes that went in (a storage notice
  // from the stand-in page can take its place once the saves settle).
  assert.equal(hasUndo(), true);
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.equal($('#dj-beatbar').querySelector('[data-beat-name]').value, theirs, 'the new person\'s open beat stays on screen');
  assert.equal(state.patterns.get(next)?.personId ?? next, next, 'and stays theirs');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
  keysOff(page);
  ctx.currentTime = 0;
});
