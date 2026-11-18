// Hold to repeat (web/hold-repeat.js; Ben, 2026-11-18): a held − or + keeps
// stepping, slowly at first, on a button that a step redraws too; it stops
// when let go, slid off, or the page loses focus; letting go adds no step; and
// a hold is one change (holdStage, holdend). The real press and hold is
// checked with `just look` (a held + on the sound sheet's Deeper ↔ higher
// climbed across redraws, and the release's click added none). Blind spots of
// the stand-in page: no real `detail` on a browser's synthesized click, and
// no touch; a phone has not tried it (docs/state.md).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, FakeElement } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let holdRepeat;
let holdStage;
before(async () => {
  installPage({ manifest: testManifest() });
  ({ holdRepeat, holdStage } = await import('../web/hold-repeat.js'));
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (b, at = { clientX: 0, clientY: 0 }) => b.dispatch('pointerdown', { button: 0, ...at });
const TIMES = { hold: 30, slow: 10, slowSteps: 2, every: 10, frame: (fn) => fn() };   // no paint to wait for here

// A box with an id holding one + that `redraw` swaps for a new one, as Layers
// does; `win` and `doc` stand in for the page's window and document.
function stage({ redraw = false } = {}) {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  const box = new FakeElement('div');
  box.id = 'hold-box';
  document.body.append(box);
  let steps = 0;
  const stages = [];
  const make = () => {
    const b = new FakeElement('button');
    b.className = 'slider-nudge';
    b.textContent = '+';
    b.dataset.nudge = '1';
    b.addEventListener('click', () => {
      steps += 1;
      stages.push(holdStage());
      if (redraw) { const next = make(); box.replaceChildren(next); holdRepeat(next, { ...TIMES, win, doc }); }
    });
    return b;
  };
  const first = make();
  box.append(first);
  holdRepeat(first, { ...TIMES, win, doc });
  const ended = [];
  box.addEventListener('holdend', () => ended.push(steps));
  const letGo = () => win.dispatchEvent(new Event('pointerup'));
  return { first, box, win, doc, letGo, ended, stages, steps: () => steps, cleanup: () => box.remove() };
}

test('a held + steps again and again once held past the wait; letting go stops it', async () => {
  const s = stage();
  press(s.first);
  await wait(15);
  assert.equal(s.steps(), 0, 'nothing before the hold wait');
  await wait(90);
  assert.ok(s.steps() >= 3, `it repeats: ${s.steps()}`);
  s.letGo();
  const at = s.steps();
  await wait(40);
  assert.equal(s.steps(), at, 'and stops when let go');
  s.cleanup();
});

test('a hold is one change: its first step says "first", the rest "more", and letting go sends holdend once', async () => {
  const s = stage();
  press(s.first);
  await wait(90);
  s.letGo();
  assert.equal(s.stages[0], 'first');
  assert.ok(s.stages.slice(1).every((x) => x === 'more'), s.stages.join(' '));
  assert.deepEqual(s.ended, [s.steps()], 'one holdend, after the last step');
  assert.equal(holdStage(), null, 'outside a step, no hold stage');
  s.cleanup();
});

test('the click a browser sends on letting go after a hold is swallowed; a later real click counts', async () => {
  const s = stage();
  let heard = 0;
  press(s.first);
  await wait(60);
  s.letGo();
  // The page's own listeners: in a browser they sit below the window, so its
  // capture listener runs first; here one target, so this one is added after.
  s.win.addEventListener('click', () => { heard += 1; });
  const release = new Event('click');
  release.detail = 1;
  s.win.dispatchEvent(release);
  assert.equal(heard, 0, 'the release click goes nowhere');
  await wait(350);
  const later = new Event('click');
  later.detail = 1;
  s.win.dispatchEvent(later);
  assert.equal(heard, 1, 'a click after that is a click');
  s.cleanup();
});

test('a hold stops if the window loses focus, the page hides, or the finger slides off', async () => {
  for (const end of ['blur', 'hidden', 'slide']) {
    const s = stage();
    press(s.first, { clientX: 100, clientY: 100 });
    await wait(50);
    if (end === 'blur') s.win.dispatchEvent(new Event('blur'));
    if (end === 'hidden') { s.doc.visibilityState = 'hidden'; s.doc.dispatchEvent(new Event('visibilitychange')); }
    if (end === 'slide') { const m = new Event('pointermove'); m.clientX = 100; m.clientY = 160; s.win.dispatchEvent(m); }
    const at = s.steps();
    await wait(50);
    assert.equal(s.steps(), at, `${end}: stopped`);
    s.cleanup();
  }
});

test('a step that redraws the button keeps the hold going on its replacement', async () => {
  const s = stage({ redraw: true });
  press(s.first);
  await wait(100);
  assert.ok(s.steps() >= 3, `it follows the redrawn +: ${s.steps()}`);
  s.letGo();
  s.cleanup();
});

test('a short tap is one click, as before; the button opens no menu on a long press', async () => {
  const s = stage();
  press(s.first);
  s.letGo();
  s.first.dispatch('click');
  await wait(50);
  assert.equal(s.steps(), 1);
  assert.equal(s.stages[0], null, 'a tap is no hold');
  assert.equal(s.first.dispatch('contextmenu').defaultPrevented, true);
  assert.equal(s.first.dataset.holdRepeat, '', 'marked, so the styles stop a long press picking text');
  s.cleanup();
});
