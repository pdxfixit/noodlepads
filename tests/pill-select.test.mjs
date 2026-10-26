// Pills picked and dragged with a mouse (Ben, 2026-10-19; web/pill-select.js):
// a click picks a lit pill, Ctrl/Cmd adds or drops one, Shift adds the lit
// pills from the last click to it, a click on an unlit pill lights it,
// Delete turns the pick off (with Undo), a double-click one pill. A finger's
// tap still lights and unlights. Not tested here: the drag itself, which
// needs a real page to find the pill under the pointer (slide.js's
// slideRows, which it uses, is tested with ⇆ Move; checked in headless
// Chrome with just look).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, keysOff } from './new-beat.mjs';
import { litOnly, clickPick, turnOff } from '../web/pill-select.js';
import { pillKey } from '../web/slide.js';

const row = (on, melody = false) => ({ steps: on.split('').map((c) => c === 'x'), accents: on.split('').map((c) => c === 'L'), melody });

test('only lit pills of plain rows are picked', () => {
  const rows = [row('x..x'), row('xxxx', true)];
  assert.deepEqual([...litOnly(rows, new Set(['0:0', '0:1', '0:3', '1:0', '2:0']), 4)], ['0:0', '0:3']);
});

test('a click picks a lit pill alone; Ctrl/Cmd adds or drops it; Shift adds the lit pills from the last click', () => {
  const rows = [row('x.x.'), row('.x.x')];
  const none = new Set();
  let r = clickPick(rows, none, { r: 0, s: 0 }, {}, null, 4);
  assert.deepEqual([...r.pick], ['0:0']);
  assert.equal(r.light, false);
  r = clickPick(rows, r.pick, { r: 1, s: 1 }, { add: true }, r.anchor, 4);
  assert.deepEqual([...r.pick].sort(), ['0:0', '1:1']);
  r = clickPick(rows, r.pick, { r: 1, s: 1 }, { add: true }, r.anchor, 4);
  assert.deepEqual([...r.pick], ['0:0'], 'Ctrl again drops it');
  r = clickPick(rows, r.pick, { r: 1, s: 3 }, { range: true }, '0:0', 4);
  assert.deepEqual([...r.pick].sort(), ['0:0', '0:2', '1:1', '1:3'], 'the box from 0:0 to 1:3, lit pills only');
  r = clickPick(rows, r.pick, { r: 0, s: 2 }, {}, r.anchor, 4);
  assert.deepEqual([...r.pick], ['0:2'], 'a plain click picks it alone');
});

test('a click on an unlit pill lights it and picks it; with Ctrl or Shift it does nothing', () => {
  const rows = [row('x...')];
  const pick = new Set(['0:0']);
  const r = clickPick(rows, pick, { r: 0, s: 2 }, {}, '0:0', 4);
  assert.equal(r.light, true);
  assert.deepEqual([...r.pick], ['0:2']);
  for (const mods of [{ add: true }, { range: true }]) {
    const same = clickPick(rows, pick, { r: 0, s: 2 }, mods, '0:0', 4);
    assert.equal(same.light, false);
    assert.ok(same.pick === pick);
  }
});

test('turning the pick off clears its pills and their loud hits, and leaves the rows it had', () => {
  const rows = [row('xL.x'), row('x...')];
  const out = turnOff(rows, new Set([pillKey(0, 0), pillKey(0, 1)]));
  assert.deepEqual(out[0].steps, [false, false, false, true]);
  assert.deepEqual(out[0].accents, [false, false, false, false]);
  assert.ok(out[1] === rows[1], 'a row with nothing picked is the same row');
  assert.deepEqual(rows[0].steps, [true, false, false, true], 'the old rows stay as they were, for Undo');
});

// On the page: Beats' rows, with a stand-in mouse.
let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;
  await page.settle();
});
const rows = () => page.$('#seq-rows');
const pill = (r, s) => rows().querySelectorAll('.pill').find((p) => p.closest('.seq-row').dataset.row === String(r) && p.dataset.step === String(s));
const lit = (r) => rows().querySelectorAll('.pill').filter((p) => p.closest('.seq-row').dataset.row === String(r) && p.getAttribute('aria-pressed') === 'true').map((p) => Number(p.dataset.step));
const chosen = () => rows().querySelectorAll('.pill.chosen').map((p) => Number(p.dataset.step));
// A mouse's click: its press first, so the page knows it was a mouse.
const click = (p, mods = {}) => {
  p.dispatch('pointerdown', { pointerType: 'mouse', button: 0, clientX: 5, clientY: 5, ...mods });
  p.dispatch('pointerup', { pointerType: 'mouse' });
  p.dispatch('click', mods);
};

test('with a mouse: a click lights an unlit pill and picks it, a click on a lit one picks it, Ctrl and Shift pick more', () => {
  keysOff(page);
  newBeatWithRow(page);
  click(pill(0, 2));
  assert.deepEqual(lit(0), [2], 'lit');
  assert.deepEqual(chosen(), [2], 'and picked');
  click(pill(0, 2));
  assert.deepEqual(lit(0), [2], 'a second click picks it, it does not turn it off');
  click(pill(0, 6));
  click(pill(0, 10));
  assert.deepEqual(chosen(), [10]);
  click(pill(0, 2), { ctrlKey: true });
  assert.deepEqual(chosen().sort((a, b) => a - b), [2, 10]);
  click(pill(0, 6), { shiftKey: true });
  assert.deepEqual(chosen().sort((a, b) => a - b), [2, 6, 10], 'Shift adds the lit pills from the last click (2) to 6');
});

test('with a mouse: Delete turns the pick off and offers Undo; a double-click turns one off; Esc lets go', () => {
  page.key('Delete');
  assert.deepEqual(lit(0), [], 'the picked 2, 6 and 10 are off');
  assert.deepEqual(chosen(), []);
  assert.match(page.$('#banner-text').textContent, /Turned 3 pills off/);
  page.$('#banner-action').dispatch('click');
  assert.deepEqual(lit(0), [2, 6, 10], 'Undo brings them back');
  click(pill(0, 6));
  pill(0, 6).dispatch('dblclick', { pointerType: 'mouse' });
  assert.deepEqual(lit(0), [2, 10], 'a double-click turns it off');
  click(pill(0, 2));
  page.key('Escape');
  assert.deepEqual(chosen(), [], 'Esc lets go');
  assert.deepEqual(lit(0), [2, 10]);
});

// Esc on the page is ⏹️ Stop all (app.js), but its first job is closer to
// hand: letting go of a pick, or closing a row's ⋯ menu. Those leave a
// playing beat playing.
test('Esc while the beat plays: it lets go of the pick, or closes a row\'s menu, and the beat keeps going', async () => {
  const playing = () => page.$('#seq-play').getAttribute('aria-pressed') === 'true';
  page.$('#seq-play').dispatch('click');
  await page.settle();
  assert.equal(playing(), true);
  click(pill(0, 2));
  assert.deepEqual(chosen(), [2]);
  page.key('Escape');
  assert.deepEqual(chosen(), [], 'let go');
  assert.equal(playing(), true, 'still playing');
  const pop = () => document.body.children.find((c) => c.classList.contains('more-pop'));
  rows().querySelector('.seq-head [data-more]').dispatch('click');
  assert.equal(pop()?.hidden, false, 'the menu is open');
  page.key('Escape');
  assert.equal(pop().hidden, true, 'closed');
  assert.equal(playing(), true, 'still playing');
  page.key('Escape');
  assert.equal(playing(), false, 'a third Esc stops it');
});

test('a finger\'s tap still lights and unlights, and picks nothing', () => {
  const tap = (p) => { p.dispatch('pointerdown', { pointerType: 'touch', button: 0, clientX: 5, clientY: 5 }); p.dispatch('pointerup', { pointerType: 'touch' }); p.dispatch('click'); };
  tap(pill(0, 2));
  assert.deepEqual(lit(0), [10], 'off');
  tap(pill(0, 2));
  assert.deepEqual(lit(0), [2, 10], 'on');
  assert.deepEqual(chosen(), []);
});

// Ben, 2026-10-19: "the pill drag lags behind mouse activity". A drag's every
// step repaints only the pills it moved (sequencer.js paintRows), never the
// whole page; the drop draws everything once. The pointer is played here by
// a stand-in elementFromPoint (x is the pill's number) and a frame that runs at once.
test('a mouse drag slides the pick, repainting pills in place, and the drop draws once', () => {
  click(pill(0, 2));
  assert.deepEqual(lit(0), [2, 10], 'two lit pills; 2 picked');
  const near = pill(0, 5);
  const was = { efp: document.elementFromPoint, raf: globalThis.requestAnimationFrame };
  document.elementFromPoint = (x) => pill(0, Math.round(x));
  globalThis.requestAnimationFrame = (f) => { f(); return 0; };
  try {
    pill(0, 2).dispatch('pointerdown', { pointerType: 'mouse', button: 0, clientX: 2, clientY: 5 });
    rows().dispatch('pointermove', { pointerType: 'mouse', clientX: 8, clientY: 5 });
    assert.deepEqual(lit(0), [8, 10], 'the picked one slid 6 along; 10 stays');
    assert.ok(pill(0, 5) === near, 'the same pills, repainted, not drawn again');
    assert.deepEqual(chosen(), [8], 'the pick shows where it is now');
    rows().dispatch('pointerup', { pointerType: 'mouse', clientX: 8, clientY: 5 });
  } finally {
    document.elementFromPoint = was.efp;
    globalThis.requestAnimationFrame = was.raf;
  }
  assert.deepEqual(lit(0), [8, 10]);
  assert.match(page.$('#banner-text').textContent, /Moved 1 pill, 6 to the right/);
  page.$('#banner-action').dispatch('click');
  assert.deepEqual(lit(0), [2, 10], 'Undo puts it back');
});

// ⇆ locks the pills (Ben, 2026-10-19): the view stays as it is, nothing
// lights or unlights, and a finger picks as a mouse does; the bar at the
// foot says what is picked, with All · None · Invert.
const lockKey = () => document.querySelector('#seq-deck [data-move-open]');
const bar = () => page.$('#seq-move');
const pickKey = (name) => bar().querySelectorAll('[data-move-pick]').find((b) => b.dataset.movePick === name);
const tap = (p) => { p.dispatch('pointerdown', { pointerType: 'touch', button: 0, clientX: 5, clientY: 5 }); p.dispatch('pointerup', { pointerType: 'touch' }); p.dispatch('click'); };

test('⇆ locks the pills: a tap on an unlit pill does nothing, on a lit one picks it; All, Invert and None pick', async () => {
  await new Promise((r) => setTimeout(r, 450));   // past the last drag's own click
  for (const s of lit(0)) tap(pill(0, s));
  for (const s of [1, 5, 9]) tap(pill(0, s));
  assert.deepEqual(lit(0), [1, 5, 9]);
  lockKey().dispatch('click');
  assert.equal(lockKey().getAttribute('aria-pressed'), 'true');
  assert.ok(document.body.classList.contains('pills-locked'));
  assert.equal(bar().hidden, false, 'the bar shows');
  assert.equal(page.$('#seq-rows').closest('[hidden]'), null, 'the same view');
  tap(pill(0, 3));
  assert.deepEqual(lit(0), [1, 5, 9], 'an unlit pill stays unlit');
  tap(pill(0, 5));
  assert.deepEqual(lit(0), [1, 5, 9], 'a lit pill stays lit');
  assert.deepEqual(chosen(), [5], 'and is picked');
  assert.match(bar().querySelector('[data-move-what]').textContent, /^1 pill picked/);
  tap(pill(0, 5));
  assert.deepEqual(chosen(), [], 'a second tap takes it out');
  pill(0, 9).dispatch('click', { detail: 0 });
  assert.deepEqual(chosen(), [9], 'Space on a lit pill picks it too');
  pickKey('invert').dispatch('click');
  assert.deepEqual(chosen(), [1, 5], 'Invert: the lit ones not picked');
  pickKey('all').dispatch('click');
  assert.deepEqual(chosen(), [1, 5, 9]);
  assert.match(bar().querySelector('[data-move-what]').textContent, /^3 pills picked/);
  pickKey('none').dispatch('click');
  assert.deepEqual(chosen(), []);
  assert.equal(pickKey('none').disabled, true);
  lockKey().dispatch('click');
  assert.equal(bar().hidden, true, 'unlocked: the bar goes');
  assert.equal(document.body.classList.contains('pills-locked'), false);
  tap(pill(0, 3));
  assert.deepEqual(lit(0), [1, 3, 5, 9], 'and a tap lights again');
});

test('⇆ with ⌨️ Keys on keeps the keys, and the grid picks instead of lighting', async () => {
  const { keysOn, keysOff } = await import('./new-beat.mjs');
  keysOn(page);
  const gridPill = (s) => page.$('#dj-grid').querySelectorAll('.dj-grid-row')[0].querySelector('.dj-grid-pills').children[s];
  document.querySelector('.dj-bar [data-move-open]').dispatch('click');
  assert.ok(document.body.classList.contains('keys-on'), 'still the keys');
  assert.equal(page.$('#dj').hidden, false);
  assert.equal(bar().hidden, false);
  tap(gridPill(3));
  assert.equal(gridPill(3).classList.contains('on'), true, 'lit as it was');
  assert.equal(gridPill(3).classList.contains('chosen'), true, 'and picked');
  tap(gridPill(2));
  assert.equal(gridPill(2).classList.contains('on'), false, 'an unlit one stays unlit');
  page.$('#pads-tab').dispatch('click');
  assert.equal(document.body.classList.contains('pills-locked'), false, 'leaving Beats unlocks');
  page.$('#beats-toggle').dispatch('click');
  keysOff(page);
});
