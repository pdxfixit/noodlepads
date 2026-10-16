// + Add a row opens the chooser for new rows: tick several sounds, Add puts
// in a row for each, in the order tapped. The sound after the last row's
// comes ticked, so one tap on Add still adds the next one (Ben, 2026-10-16:
// adding eight chords meant closing Drums eight times, and after an F chord
// a new row got the open hat).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOff } from './new-beat.mjs';

let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('+ Add a row: tick several, Add puts in a row for each, in the order tapped', async () => {
  const $ = page.$;
  keysOff(page);
  document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-new]').dispatch('click');
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const pads = () => $('#chooser-grid').querySelectorAll('[data-choose]');
  const pad = (id) => pads().find((b) => b.dataset.choose === id);
  const label = (id) => pad(id).querySelector('.pad-label').textContent;
  const ticked = () => pads().filter((b) => b.getAttribute('aria-pressed') === 'true').sort((a, b) => a.dataset.tick - b.dataset.tick).map((b) => b.dataset.choose);
  const rowLabel = (r) => r.querySelector('.pill').getAttribute('aria-label').replace(/^Row \d+, /, '').replace(/: beat.*$/, '');
  assert.equal(rows().length, 0);

  $('#seq-add').dispatch('click');
  assert.equal($('#chooser').open, true, 'the chooser opens; no row yet');
  assert.equal(rows().length, 0);
  assert.equal($('#chooser-title').textContent, 'New rows');
  assert.equal(ticked().length, 1, 'a sound comes ticked');
  assert.equal($('#chooser-ok').textContent, 'Add 1 row');
  assert.equal($('#chooser-tools').hidden, true, 'no 🎹 Tune or speed for new rows');

  // Tick two more; untick one and tick it again: it goes to the end.
  const first = ticked()[0];
  const [b, c] = pads().map((p) => p.dataset.choose).filter((id) => id !== first).slice(0, 2);
  pad(b).dispatch('click');
  pad(c).dispatch('click');
  assert.deepEqual(ticked(), [first, b, c]);
  assert.equal(pad(c).dataset.tick, '3', 'each wears its place');
  assert.equal($('#chooser-ok').textContent, 'Add 3 rows');
  pad(b).dispatch('click');
  assert.deepEqual(ticked(), [first, c]);
  assert.equal(pad(b).dataset.tick, undefined);
  assert.equal($('#chooser-ok').textContent, 'Add 2 rows');
  pad(b).dispatch('click');
  assert.deepEqual(ticked(), [first, c, b]);

  $('#chooser-ok').dispatch('click');
  assert.equal($('#chooser').open, false);
  assert.deepEqual(rows().map(rowLabel), [first, c, b].map(label), 'one row each, in the order tapped');

  // Next time, the sound after the last row's comes ticked (in the chooser's order).
  const order = pads().map((p) => p.dataset.choose);
  $('#seq-add').dispatch('click');
  const used = new Set([first, c, b]);
  const after = order.slice(order.indexOf(b) + 1).find((id) => !used.has(id));
  assert.deepEqual(ticked(), [after]);

  // Untick everything: Add has nothing to add.
  pad(after).dispatch('click');
  assert.equal($('#chooser-ok').disabled, true);
  assert.equal($('#chooser-ok').textContent, 'Tick a sound');

  // A beat holds 16 rows: ticks stop at the room left.
  const free = order.filter((id) => !used.has(id));
  for (const id of free.slice(0, 14)) pad(id).dispatch('click');
  assert.equal(ticked().length, 13, '3 rows + 13 = 16');
  assert.equal($('#chooser-title').textContent, 'New rows · beat full');
  $('#chooser-ok').dispatch('click');
  assert.equal(rows().length, 16);
  assert.equal($('#seq-add').hidden, true, 'a full beat has no + Add a row');
});

test('Escape or ✕ adds nothing', async () => {
  const $ = page.$;
  document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-new]').dispatch('click');
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  $('#seq-add').dispatch('click');
  $('#chooser').close();
  assert.equal(rows().length, 0);
});
