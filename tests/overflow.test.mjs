// ⋯ menus (web/overflow.js; Ben, 2026-10-12): where a line runs out of room,
// its less-used buttons move into a ⋯ menu at its end; buttons never shrink
// below 44 px to fit. app.test.mjs drives a Beats row's ⋯; here, the measure
// that decides it and the CSS that carries it out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anyOver, fitMore } from '../web/overflow.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('anyOver: a line overflows when its content is wider than the line', () => {
  assert.equal(anyOver([{ scrollWidth: 264, clientWidth: 264 }]), false);
  assert.equal(anyOver([{ scrollWidth: 265, clientWidth: 264 }]), false, 'a pixel of rounding is not overflow');
  assert.equal(anyOver([{ scrollWidth: 264, clientWidth: 264 }, { scrollWidth: 314, clientWidth: 264 }]), true);
});

// A box of lines that need `need` px with every button and `tight` px with ⋯.
function fakeBox(width, { need = 314, tight = 228 } = {}) {
  const classes = new Set();
  const box = {
    clientWidth: width,
    classList: {
      contains: (c) => classes.has(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    querySelectorAll: () => [0, 1].map(() => ({
      clientWidth: width,
      get scrollWidth() { return Math.max(width, classes.has('more-tight') ? tight : need); },
    })),
  };
  return box;
}

test('fitMore: the box is tight while a line would overflow with every button shown, measured on the lines themselves', () => {
  for (const [width, tight] of [[264, true], [303, true], [319, false], [644, false]]) {
    const box = fakeBox(width);
    box.classList.toggle('more-tight', !tight);   // it starts wrong, and is put right
    fitMore(box, '.seq-head').now();
    assert.equal(box.classList.contains('more-tight'), tight, `${width} px`);
  }
  const hidden = fakeBox(0);
  fitMore(hidden, '.seq-head').now();
  assert.equal(hidden.classList.contains('more-tight'), false, 'off screen: left as it is');
});

test('the CSS: ⋯ shows only on a tight line, where the moved buttons hide; no Beats header button is narrowed to fit', () => {
  const css = read('web/styles.css');
  assert.match(css, /^\.more-btn \{ display: none;/m, '⋯ hides unless tight');
  assert.match(css, /^\.icon-btn \{[^}]*min-width: 44px;[^}]*height: 44px;/m, '⋯ is an .icon-btn, a 44 px target');
  assert.match(css, /^\.more-tight \.more-btn \{ display: inline-grid; \}/m);
  assert.match(css, /^\.more-tight \[data-more-word\] \{ display: none; \}/m);
  assert.match(css, /^\.more-item \{[^}]*min-height: 44px;/m, 'menu items are 44 px tall');
  assert.match(css, /^\.more-item\.armed \{ background: #B3261E; color: #fff; \}/m, 'red while it asks');
  for (const narrowed of [/\.seq-grip \{ min-width: 24px/, /\.seq-fold \{ width: 28px/, /\.row-x \{ min-width: 38px/]) assert.doesNotMatch(css, narrowed);
  assert.doesNotMatch(read('tools/look.mjs'), /narrowHead/, 'just look no longer excuses narrowed header buttons');
});
