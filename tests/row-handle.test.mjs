// A Beats row's head: the grip first, then the emoji that opens its menu
// (Ben, 2026-10-25). A row is one line, with nothing to fold.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, keysOff } from './new-beat.mjs';

let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('the grip comes first, then the emoji, and no fold', async () => {
  const $ = page.$;
  keysOff(page);
  newBeatWithRow(page);
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');   // a second row, so the grip shows
  const order = () => [...$('#seq-rows').querySelector('.seq-row .seq-head').children].map((c) => c.className.split(' ')[0]).slice(0, 2);
  assert.deepEqual(order(), ['seq-grip', 'row-emoji']);
  assert.equal($('#seq-rows').querySelector('.seq-fold'), null);
});
