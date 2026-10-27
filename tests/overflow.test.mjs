// ⋯ menus (web/overflow.js; Ben, 2026-10-12): a row's less-used buttons are
// listed in a menu; buttons never shrink below 44 px to fit. app.test.mjs
// drives a Beats row's menu; here, the CSS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the CSS: ⋯ is a 44 px target and the menu\'s items are 44 px; no Beats header button is narrowed to fit', () => {
  const css = read('web/styles.css');
  assert.match(css, /^\.more-btn \{ display: none;/m, '⋯ stays hidden: no screen runs a line out of room');
  assert.match(css, /^\.icon-btn \{[^}]*min-width: 44px;[^}]*height: 44px;/m, '⋯ is an .icon-btn, a 44 px target');
  assert.doesNotMatch(css, /more-tight/, 'no screen gives a box that class, so no rule keeps it');
  assert.match(css, /^\.more-item \{[^}]*min-height: 44px;/m, 'menu items are 44 px tall');
  assert.match(css, /^\.more-item\.armed \{ background: #B3261E; color: #fff; \}/m, 'red while it asks');
  for (const narrowed of [/\.seq-grip \{ min-width: 24px/, /\.seq-fold \{ width: 28px/, /\.row-x \{ min-width: 38px/]) assert.doesNotMatch(css, narrowed);
  assert.doesNotMatch(read('tools/look.mjs'), /narrowHead/, 'just look no longer excuses narrowed header buttons');
});
