// A scroll never plays a pad (Ben, 2026-10-13: "dragging a finger should
// not trigger a sound (like when one is scrolling)"): the pure follower in
// web/finger.js, then the real Pads screen on the stand-in page with
// touch, pen and mouse pointers. 🧸 Kids pads are in kids.test.mjs.
// Not tested here: how a real tap feels on a phone, and whether a real
// browser sends pointercancel when it starts a scroll (it does by spec on a
// pad's touch-action: manipulation; check on a phone).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fingerTaps, holdToDrag, isFinger, stayedPut, TAP_SLOP, DRAG_PX, DRAG_HOLD_MS, DRAG_SLOP_PX } from '../web/finger.js';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Pure ──

test('a finger or a pen is a finger; a mouse is not', () => {
  assert.equal(isFinger({ pointerType: 'touch' }), true);
  assert.equal(isFinger({ pointerType: 'pen' }), true);
  assert.equal(isFinger({ pointerType: 'mouse' }), false);
  assert.equal(isFinger({}), false);
});

test('stayed put: within the slop, not past it', () => {
  assert.equal(TAP_SLOP, 10);
  assert.equal(stayedPut(0, 0, 6, 8), true, '10 px away is still a tap');
  assert.equal(stayedPut(0, 0, 8, 8), false);
});

test('the follower: a lift in place taps, a move or a cancel drops, each finger on its own', () => {
  const taps = [];
  const f = fingerTaps({ onTap: (d) => taps.push(d) });
  f.down({ pointerId: 1, clientX: 0, clientY: 0 }, 'a');
  f.down({ pointerId: 2, clientX: 50, clientY: 50 }, 'b');
  f.move({ pointerId: 2, clientX: 50, clientY: 80 });
  f.up({ pointerId: 2, clientX: 50, clientY: 50 });
  f.up({ pointerId: 1, clientX: 3, clientY: 3 });
  assert.deepEqual(taps, ['a'], 'b moved, so only a tapped');
  f.down({ pointerId: 3, clientX: 0, clientY: 0 }, 'c');
  f.cancel({ pointerId: 3 });
  f.up({ pointerId: 3, clientX: 0, clientY: 0 });
  f.up({ pointerId: 9, clientX: 0, clientY: 0 });
  assert.deepEqual(taps, ['a']);
  assert.equal(f.size, 0);
});

test('the follower: holding still fires the hold and the lift does nothing; a move cancels the hold', async () => {
  const seen = [];
  const f = fingerTaps({ onTap: (d) => seen.push(['tap', d]), onHold: (d) => seen.push(['hold', d]), holdMs: 20 });
  f.down({ pointerId: 1, clientX: 0, clientY: 0 }, 'a');
  await wait(40);
  f.up({ pointerId: 1, clientX: 0, clientY: 0 });
  assert.deepEqual(seen, [['hold', 'a']]);
  f.down({ pointerId: 2, clientX: 0, clientY: 0 }, 'b');
  f.move({ pointerId: 2, clientX: 30, clientY: 0 });
  await wait(40);
  assert.deepEqual(seen, [['hold', 'a']], 'a drag never loops');
  f.down({ pointerId: 3, clientX: 0, clientY: 0 }, 'c', { hold: false });
  await wait(40);
  f.up({ pointerId: 3, clientX: 0, clientY: 0 });
  assert.deepEqual(seen.at(-1), ['tap', 'c'], 'no hold asked for: the lift taps');
});

// ── The Pads screen ──

let page;
let $;
const calls = [];
const looping = new Set();

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = (clip) => { calls.push(['play', clip.id]); };
  audio.loop = (clip) => { calls.push(['loop', clip.id]); looping.add(clip.id); };
  audio.isLooping = (id) => looping.has(id);
  audio.stop = (id) => { calls.push(['stop', id]); looping.delete(id); };
});

const pads = () => $('#pads').querySelectorAll('.pad').filter((p) => p.dataset.id);
const touch = (props) => ({ button: 0, pointerType: 'touch', clientX: 100, clientY: 100, ...props });

test('a finger tap plays on the lift, not on touch-down; a pen too', () => {
  const pad = pads()[0];
  const id = pad.dataset.id;
  calls.length = 0;
  pad.dispatch('pointerdown', touch({ pointerId: 31 }));
  assert.deepEqual(calls, [], 'nothing yet');
  page.winEvent('pointerup', touch({ pointerId: 31, clientX: 105, clientY: 96 }));
  assert.deepEqual(calls, [['play', id]]);
  calls.length = 0;
  pad.dispatch('pointerdown', touch({ pointerId: 32, pointerType: 'pen' }));
  page.winEvent('pointerup', touch({ pointerId: 32, pointerType: 'pen' }));
  assert.deepEqual(calls, [['play', id]]);
});

test('a finger that moves past the slop, or a touch the browser cancels for a scroll, plays nothing', () => {
  const pad = pads()[1];
  calls.length = 0;
  pad.dispatch('pointerdown', touch({ pointerId: 33 }));
  page.winEvent('pointermove', touch({ pointerId: 33, clientY: 140 }));
  page.winEvent('pointerup', touch({ pointerId: 33, clientY: 140 }));
  pad.dispatch('pointerdown', touch({ pointerId: 34 }));
  page.winEvent('pointercancel', touch({ pointerId: 34 }));
  page.winEvent('pointerup', touch({ pointerId: 34 }));
  assert.deepEqual(calls, []);
});

test('a finger held still loops the pad then; a tap on the looping pad stops it on the lift', async () => {
  const pad = pads()[2];
  const id = pad.dataset.id;
  calls.length = 0;
  pad.dispatch('pointerdown', touch({ pointerId: 35 }));
  await wait(400);   // past HOLD_TO_LOOP_MS (350)
  assert.deepEqual(calls, [['loop', id]], 'it sounds when the loop starts');
  page.winEvent('pointerup', touch({ pointerId: 35 }));
  assert.deepEqual(calls, [['loop', id]], 'the lift adds nothing');
  pad.dispatch('pointerdown', touch({ pointerId: 36 }));
  assert.deepEqual(calls.length, 1, 'touch-down does not stop it');
  await wait(400);
  assert.equal(calls.length, 1, 'holding a looping pad does not loop it again');
  page.winEvent('pointerup', touch({ pointerId: 36 }));
  assert.deepEqual(calls.at(-1), ['stop', id]);
});

test('two fingers, two pads: each on its own', () => {
  const [a, b] = pads();
  calls.length = 0;
  a.dispatch('pointerdown', touch({ pointerId: 37 }));
  b.dispatch('pointerdown', touch({ pointerId: 38, clientX: 300 }));
  page.winEvent('pointermove', touch({ pointerId: 38, clientX: 300, clientY: 160 }));
  page.winEvent('pointerup', touch({ pointerId: 38, clientX: 300, clientY: 160 }));
  page.winEvent('pointerup', touch({ pointerId: 37 }));
  assert.deepEqual(calls, [['play', a.dataset.id]]);
});

test('a mouse still plays on press', () => {
  const pad = pads()[0];
  calls.length = 0;
  pad.dispatch('pointerdown', { button: 0, pointerType: 'mouse', pointerId: 39, clientX: 0, clientY: 0 });
  assert.deepEqual(calls, [['play', pad.dataset.id]]);
  page.winEvent('pointerup', { pointerType: 'mouse', pointerId: 39, clientX: 0, clientY: 0 });
  assert.equal(calls.length, 1);
});

// 🎤 Live's keys wait for the lift too (Ben, 2026-10-16: "to avoid confusion with scrolling").
test('a finger on a Live key plays on the lift; a scroll or a cancel plays nothing; held, it loops', async () => {
  $('#live-tab').dispatch('click');
  const key = $('#dj-keys').querySelector('[data-code="KeyA"]');
  calls.length = 0;
  key.dispatch('pointerdown', touch({ pointerId: 41 }));
  assert.deepEqual(calls, [], 'nothing on touch-down');
  page.winEvent('pointerup', touch({ pointerId: 41, clientX: 104 }));
  assert.equal(calls.length, 1, JSON.stringify(calls));
  const [[what, id]] = calls;
  assert.equal(what, 'play');
  calls.length = 0;
  key.dispatch('pointerdown', touch({ pointerId: 42 }));
  page.winEvent('pointermove', touch({ pointerId: 42, clientY: 150 }));
  page.winEvent('pointerup', touch({ pointerId: 42, clientY: 150 }));
  key.dispatch('pointerdown', touch({ pointerId: 43 }));
  page.winEvent('pointercancel', touch({ pointerId: 43 }));
  page.winEvent('pointerup', touch({ pointerId: 43 }));
  assert.deepEqual(calls, [], 'a scroll starting on a key stays silent');
  key.dispatch('pointerdown', touch({ pointerId: 44 }));
  await wait(400);   // past HOLD_TO_LOOP_MS (350)
  assert.deepEqual(calls.at(-1), ['loop', id]);
  const n = calls.length;
  page.winEvent('pointerup', touch({ pointerId: 44 }));
  assert.equal(calls.length, n, 'the lift adds nothing');
  key.dispatch('pointerdown', touch({ pointerId: 45 }));
  page.winEvent('pointerup', touch({ pointerId: 45 }));
  assert.deepEqual(calls.at(-1), ['stop', id], 'a tap on the looping key stops it');
  $('#pads-toggle')?.dispatch('click');
});

// ── holdToDrag: ✏️ Layout's one press (the keys' editor, the bands, the groups carried) ──

// A box that hears pointer events, with a `closest` that matches every
// selector (the test's handle is the box itself).
function box() {
  const t = new EventTarget();
  t.closest = () => t;
  return t;
}
const fire = (t, type, over = {}) => {
  const e = Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 }, over);
  t.dispatchEvent(e);
  return e;
};
function rig(opts = {}) {
  const el = box();
  const log = [];
  const drag = holdToDrag(el, el, {
    match: () => ({ what: 'pill' }),
    start: (p, x, y, moved) => { log.push(['start', x, y, moved]); return opts.refuse ? false : undefined; },
    move: (p, x, y) => log.push(['move', x, y]),
    end: (p, drop) => log.push(['end', drop, p.what]),
    menu: '.x',
  });
  return { el, log, drag };
}

test('holdToDrag: a mouse drags once it moves past DRAG_PX, and a drop ends it', () => {
  assert.deepEqual([DRAG_PX, DRAG_HOLD_MS, DRAG_SLOP_PX], [6, 280, 10]);
  const { el, log, drag } = rig();
  fire(el, 'pointerdown', { clientX: 10, clientY: 10 });
  fire(el, 'pointermove', { clientX: 14, clientY: 10 });
  assert.deepEqual(log, [], '4 px is still a press');
  fire(el, 'pointermove', { clientX: 20, clientY: 10 });
  assert.deepEqual(log, [['start', 20, 10, true]]);
  fire(el, 'pointermove', { clientX: 30, clientY: 12 });
  fire(el, 'pointerup', { clientX: 30, clientY: 12 });
  assert.deepEqual(log.slice(1), [['move', 30, 12], ['end', true, 'pill']]);
  assert.equal(drag.press, null);
});

test('holdToDrag: a press that never moved ends without a drag', () => {
  const { el, log } = rig();
  fire(el, 'pointerdown');
  fire(el, 'pointerup');
  assert.deepEqual(log, [], 'no start, no end: it was a tap');
});

test('holdToDrag: a finger held DRAG_HOLD_MS starts the drag where it landed', async () => {
  const { el, log } = rig();
  fire(el, 'pointerdown', { pointerType: 'touch', clientX: 5, clientY: 7 });
  await wait(DRAG_HOLD_MS - 80);
  assert.deepEqual(log, []);
  await wait(160);
  assert.deepEqual(log, [['start', 5, 7, false]]);
  fire(el, 'pointermove', { pointerType: 'touch', clientX: 9, clientY: 9 });
  fire(el, 'pointerup', { pointerType: 'touch' });
  assert.deepEqual(log.slice(1), [['move', 9, 9], ['end', true, 'pill']]);
});

test('holdToDrag: a finger that moves past DRAG_SLOP_PX first is a scroll, and the hold never fires', async () => {
  const { el, log, drag } = rig();
  fire(el, 'pointerdown', { pointerType: 'touch' });
  fire(el, 'pointermove', { pointerType: 'touch', clientX: 4 });
  assert.ok(drag.press, 'a small wobble keeps the press');
  fire(el, 'pointermove', { pointerType: 'touch', clientX: 14 });
  assert.equal(drag.press, null);
  await wait(DRAG_HOLD_MS + 60);
  assert.deepEqual(log, []);
});

test('holdToDrag: a cancel or cancel() ends a drag without dropping; a refused start leaves no press', () => {
  const a = rig();
  fire(a.el, 'pointerdown');
  fire(a.el, 'pointermove', { clientX: 20 });
  fire(a.el, 'pointercancel');
  assert.deepEqual(a.log, [['start', 20, 0, true], ['end', false, 'pill']]);
  const b = rig();
  fire(b.el, 'pointerdown');
  fire(b.el, 'pointermove', { clientX: 20 });
  b.drag.cancel();
  assert.deepEqual(b.log.at(-1), ['end', false, 'pill']);
  const c = rig({ refuse: true });
  fire(c.el, 'pointerdown');
  fire(c.el, 'pointermove', { clientX: 20 });
  assert.equal(c.drag.press, null);
  fire(c.el, 'pointerup');
  assert.deepEqual(c.log, [['start', 20, 0, true]]);
});

test('holdToDrag: only the pointer that started it moves it; a drag keeps the page from scrolling; a held finger gets no menu', () => {
  const { el, log } = rig();
  fire(el, 'pointerdown', { pointerId: 1 });
  fire(el, 'pointermove', { pointerId: 2, clientX: 50 });
  fire(el, 'pointerdown', { pointerId: 2, clientX: 99 });
  assert.deepEqual(log, [], 'another pointer does nothing');
  assert.equal(fire(el, 'touchmove').defaultPrevented, false, 'not dragging yet: the page may scroll');
  fire(el, 'pointermove', { pointerId: 1, clientX: 20 });
  assert.equal(fire(el, 'touchmove').defaultPrevented, true);
  assert.equal(fire(el, 'contextmenu').defaultPrevented, true);
  fire(el, 'pointerup', { pointerId: 1 });
  assert.deepEqual(log.map((l) => l[0]), ['start', 'end']);
});
