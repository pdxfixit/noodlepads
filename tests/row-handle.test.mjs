// A Beats row's handle: the grip comes before the ▾ fold, at the left of the
// row's header line, open or collapsed (Ben, 2026-10-12).

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

test('the grip comes first, then the fold, open or collapsed', async () => {
  const $ = page.$;
  keysOff(page);
  newBeatWithRow(page);
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');   // a second row, so the grip shows
  const order = () => [...$('#seq-rows').querySelector('.seq-head').children].map((c) => c.className.split(' ')[0]).slice(0, 2);
  assert.deepEqual(order(), ['seq-grip', 'seq-fold']);
  $('#seq-rows').querySelector('.seq-fold').dispatch('click');
  assert.deepEqual(order(), ['seq-grip', 'seq-fold']);
});
