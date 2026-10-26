// 🧸 Kids writes the kid's beat (the person's scratch) straight into the
// library, behind the beat maker's back. Leaving Kids must show the beat
// maker the kid's squares, so a pill tapped on 🥁 Beats right after builds
// on them and never saves its older copy over them (2026-10-26).
// Not tested here: the sound (audio is spied on, not heard).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOff } from './new-beat.mjs';

let page;
let $;
let state;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
});

const scratch = () => state.savedBeats.find((b) => b.personId === state.personId && b.id.startsWith('beat-scratch-'));
const seqRows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
const answerSum = () => {
  const answer = String(Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent));
  for (const d of answer) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
};

test('back from 🧸 Kids on Beats: the kid\'s squares show, and a pill tapped then keeps them', async () => {
  keysOff(page);
  await page.settle();
  // The scratch with one row, a pill on, saved by the beat maker.
  const bar = document.querySelectorAll('.beat-bar')[0];
  bar.querySelector('[data-beat-new]').dispatch('click');
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  seqRows()[0].querySelectorAll('.pill')[0].dispatch('click');
  await page.settle();
  assert.equal(scratch().rows.length, 1);
  // 🧸 Kids: the snare's third square.
  $('#kids-open').dispatch('click');
  await page.settle();
  assert.equal(document.body.classList.contains('kids'), true);
  $('[data-kids-tab="beats"]').dispatch('click');
  $('#kids-beat').querySelectorAll('.kids-square')[8 + 2].dispatch('click');
  const kids = scratch();
  const snare = kids.rows.find((r) => r.steps[4] && r.clipId !== kids.rows[0].clipId);
  assert.ok(snare, 'the kid\'s square is in the scratch');
  // Out again, through the sum: the regular app is on Beats.
  $('#settings-open').dispatch('click');
  answerSum();
  await page.settle();
  $('#settings-dialog').close();
  assert.equal(document.body.classList.contains('kids'), false);
  assert.equal(state.screen, 'beats');
  assert.equal(seqRows().length, kids.rows.length, 'the beat maker shows the kid\'s rows');
  // A pill on the first row: the kid's square stays.
  seqRows()[0].querySelectorAll('.pill')[2].dispatch('click');
  await page.settle();
  const after = scratch();
  assert.equal(after.rows[0].steps[2], true, 'the pill is on');
  assert.ok(after.rows.some((r) => r.clipId === snare.clipId && r.steps[4]), 'and the kid\'s square is still there');
  $('#pads-tab').dispatch('click');
});
