// ⇆ Move on Beats (Ben, 2026-10-17/18; web/beat-move.js): the pills lock,
// the whole beat starts picked, ◀ ▶ slide the pick round the beat, a tap
// changes the pick, a row's emoji or name picks that row, All · None ·
// Invert pick, ↩️ Undo takes a slide back and ✓ Done unlocks. With ⌨️ Keys
// on, the big rows show until ✓ Done, and the device's Keys choice stays.
// Not tested here: a finger's drag and hold, which need a real page to find
// the pill under the finger (checked in headless Chrome with just look).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, keysOn, keysOff } from './new-beat.mjs';

let page;
before(async () => {
  console.error = () => {};
  const kept = new Map();
  const storage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) };
  page = installPage({ manifest: testManifest(), storage });
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const rows = () => page.$('#seq-rows');
const pill = (r, s) => rows().querySelectorAll('.pill').find((p) => p.closest('.seq-row').dataset.row === String(r) && p.dataset.step === String(s));
const lit = (r) => rows().querySelectorAll('.pill').filter((p) => p.closest('.seq-row').dataset.row === String(r) && p.getAttribute('aria-pressed') === 'true').map((p) => Number(p.dataset.step));
const picked = () => rows().querySelectorAll('.pill').filter((p) => p.classList.contains('picked')).length;
const bar = () => page.$('#seq-move');
const key = (name) => bar().querySelectorAll('button').find((b) => b.dataset.movePick === name || b.dataset.moveStep === name || (name === 'undo' && 'moveUndo' in b.dataset) || (name === 'done' && 'moveDone' in b.dataset));
const open = () => page.$('#seq-deck').querySelectorAll('[data-move-open]')[0];

test('⇆ Move: the whole beat starts picked, ▶ ◀ slide it round the end, Undo takes it back', async () => {
  keysOff(page);
  newBeatWithRow(page);
  for (const s of [2, 6, 10]) pill(0, s).dispatch('click');
  assert.deepEqual(lit(0), [2, 6, 10]);

  open().dispatch('click');
  assert.equal(bar().hidden, false, 'the Move bar shows');
  assert.equal(open().getAttribute('aria-pressed'), 'true');
  assert.equal(picked(), 16, 'the whole beat is picked');
  assert.equal(bar().querySelector('[data-move-what]').textContent, 'Whole beat picked');
  assert.equal(key('all').disabled, true, 'All waits: everything is already picked');

  key('-1').dispatch('click');
  key('-1').dispatch('click');
  assert.deepEqual(lit(0), [0, 4, 8], 'two pills left: the beat starts on pill 1');
  key('-1').dispatch('click');
  assert.deepEqual(lit(0), [3, 7, 15], 'pill 1 slid left comes round the end');
  key('undo').dispatch('click');
  assert.deepEqual(lit(0), [0, 4, 8]);
  key('1').dispatch('click');
  assert.deepEqual(lit(0), [1, 5, 9]);
  key('undo').dispatch('click');

  // Locked: a tap on a pill changes the pick, never the beat.
  pill(0, 0).dispatch('click');
  assert.deepEqual(lit(0), [0, 4, 8]);
  assert.equal(pill(0, 0).classList.contains('picked'), false);
  assert.equal(picked(), 15);
  assert.equal(key('all').disabled, false);

  // Only picked pills move, and a picked pill lands on the one not picked:
  // 5 and 9 go one right, and pill 16 (off) comes round onto pill 1.
  key('1').dispatch('click');
  assert.deepEqual(lit(0), [5, 9]);

  key('done').dispatch('click');
  assert.equal(bar().hidden, true);
  assert.equal(open().getAttribute('aria-pressed'), 'false');
  pill(0, 1).dispatch('click');
  assert.deepEqual(lit(0), [1, 5, 9], 'after ✓ Done a tap turns a pill on again');
  pill(0, 1).dispatch('click');
});

test('⇆ Move: a row\'s emoji or name picks that row; All, None and Invert pick', async () => {
  open().dispatch('click');
  key('none').dispatch('click');
  assert.equal(picked(), 0);
  assert.equal(key('none').disabled, true);
  assert.equal(key('-1').disabled, true, 'nothing to slide');
  assert.equal(bar().querySelector('[data-move-what]').textContent, 'Nothing picked');

  rows().querySelector('.seq-row [data-pick]').dispatch('click');
  assert.equal(picked(), 16, 'the emoji picks its row');
  assert.equal(page.$('#chooser').open, false, 'and opens no chooser');
  key('none').dispatch('click');
  rows().querySelector('.seq-row .seq-name').dispatch('click');
  assert.equal(picked(), 16, 'so does its name');

  pill(0, 3).dispatch('click');
  key('invert').dispatch('click');
  assert.equal(picked(), 1, 'Invert: only the pill that was not picked');
  assert.equal(pill(0, 3).classList.contains('picked'), true);
  key('all').dispatch('click');
  assert.equal(picked(), 16);

  // A finger's tap: down, up, then the click; it takes the pill out.
  const tap = (p) => { p.dispatch('pointerdown', { pointerType: 'touch', clientX: 5, clientY: 5 }); rows().dispatch('pointerup'); p.dispatch('click'); };
  tap(pill(0, 2));
  assert.equal(pill(0, 2).classList.contains('picked'), false);
  // A hold lifts the pick (that pill joins it); letting go without moving
  // slides nothing, and its click is no tap.
  const before = lit(0);
  pill(0, 2).dispatch('pointerdown', { pointerType: 'touch', clientX: 5, clientY: 5 });
  await new Promise((r) => setTimeout(r, 520));
  assert.ok(pill(0, 2).classList.contains('lifted'), 'the pick lifts');
  rows().dispatch('pointerup');
  pill(0, 2).dispatch('click');
  assert.equal(picked(), 16, 'the held pill joined the pick, and the click took nothing out');
  assert.deepEqual(lit(0), before);
  assert.equal(key('undo').disabled, true, 'nothing slid, nothing to undo');
  key('done').dispatch('click');
});

test('⇆ Move with ⌨️ Keys on shows the big rows until ✓ Done, and keeps the Keys choice', async () => {
  keysOn(page);
  assert.equal(document.body.classList.contains('keys-on'), true);
  document.querySelector('.dj-bar [data-move-open]').dispatch('click');
  assert.equal(document.body.classList.contains('keys-on'), false, 'the big rows show');
  assert.equal(page.$('#seq').hidden, false);
  assert.equal(bar().hidden, false);
  assert.equal(localStorage.getItem('beat-keys'), '1', 'the device still has Keys on');
  key('done').dispatch('click');
  assert.equal(document.body.classList.contains('keys-on'), true, 'the keys come back');
  assert.equal(bar().hidden, true);

  // ⌨️ during Move ends it, with the keys showing.
  document.querySelector('.dj-bar [data-move-open]').dispatch('click');
  page.$('#seq-keys').dispatch('click');
  assert.equal(document.body.classList.contains('keys-on'), true);
  assert.equal(rows().classList.contains('moving'), false);
  keysOff(page);
});

test('⇆ Move ends when the screen changes', async () => {
  open().dispatch('click');
  assert.equal(rows().classList.contains('moving'), true);
  page.$('#pads-tab').dispatch('click');
  page.$('#beats-toggle').dispatch('click');
  assert.equal(rows().classList.contains('moving'), false);
  assert.equal(bar().hidden, true);
});
