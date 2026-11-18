// Hold to repeat (web/hold-repeat.js; Ben, 2026-11-18): a held − or + keeps
// stepping, on a button that a step redraws too, and letting go adds no step.
// The real press and hold is checked with `just look` (a held + on the sound
// sheet's Deeper ↔ higher went 0 → 7 in a second, and the release's click added none).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, FakeElement } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let holdRepeat;
before(async () => {
  installPage({ manifest: testManifest() });
  ({ holdRepeat } = await import('../web/hold-repeat.js'));
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (b) => b.dispatch('pointerdown', { button: 0 });
const win = new EventTarget();   // the page's window, where letting go is heard
const letGo = () => win.dispatchEvent(new Event('pointerup'));

// A box with an id holding one + that `redraw` swaps for a new one, as Layers does.
function stage({ redraw = false } = {}) {
  const box = new FakeElement('div');
  box.id = 'hold-box';
  document.body.append(box);
  let steps = 0;
  const make = () => {
    const b = new FakeElement('button');
    b.className = 'slider-nudge';
    b.textContent = '+';
    b.dataset.nudge = '1';
    b.addEventListener('click', () => {
      steps += 1;
      if (redraw) { const next = make(); box.replaceChildren(next); holdRepeat(next, { hold: 30, every: 10, win }); }
    });
    return b;
  };
  const first = make();
  box.append(first);
  holdRepeat(first, { hold: 30, every: 10, win });
  return { first, box, steps: () => steps, cleanup: () => box.remove() };
}

test('a held + steps again and again once held past the wait; letting go stops it', async () => {
  const s = stage();
  press(s.first);
  await wait(15);
  assert.equal(s.steps(), 0, 'nothing before the hold wait');
  await wait(70);
  assert.ok(s.steps() >= 3, `it repeats: ${s.steps()}`);
  letGo();
  const at = s.steps();
  await wait(40);
  assert.equal(s.steps(), at, 'and stops when let go');
  s.cleanup();
});

test('a step that redraws the button keeps the hold going on its replacement', async () => {
  const s = stage({ redraw: true });
  press(s.first);
  await wait(90);
  assert.ok(s.steps() >= 3, `it follows the redrawn +: ${s.steps()}`);
  letGo();
  s.cleanup();
});

test('a short tap is one click, as before; the button opens no menu on a long press', async () => {
  const s = stage();
  press(s.first);
  letGo();
  s.first.dispatch('click');
  await wait(50);
  assert.equal(s.steps(), 1);
  assert.equal(s.first.dispatch('contextmenu').defaultPrevented, true);
  assert.equal(s.first.dataset.holdRepeat, '', 'marked, so the styles stop a long press picking text');
  s.cleanup();
});
