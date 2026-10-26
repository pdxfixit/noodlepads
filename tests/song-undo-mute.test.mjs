// 🎼 Song's ↩️ Undo takes back the last change (Help: a block, a lane added
// or renamed, the tempo or a tempo change). A lane's mute and loudness are
// not undo steps, yet Undo put back the lanes as they were before the last
// step, mute and loudness too: a lane muted after a block went in came back
// on when the block was undone. The real app.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { dropBeat, allBlocks } from './song-ui.mjs';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const lanes = () => $('#song-lanes').querySelectorAll('.song-lane');

test('Undo takes back the block, and leaves a lane muted after it muted', () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  $('#song-tab').dispatch('click');
  dropBeat($);
  dropBeat($, { lane: 1 });
  assert.equal(allBlocks($).length, 2);
  lanes()[1].querySelector('[data-speaker]').dispatch('click');   // mute lane 2
  assert.ok(lanes()[1].classList.contains('muted'));
  $('#song-step-undo').dispatch('click');
  assert.equal(allBlocks($).length, 1, 'the last block is taken back');
  assert.ok(lanes()[1].classList.contains('muted'), 'lane 2 is still muted');
});
