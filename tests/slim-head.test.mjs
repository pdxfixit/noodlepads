// The header slims once scrolled (Q26): at the top of a screen, the full
// title row; scrolled past it, the person's button, ❓, ⚙️ and ⬆️ ride in a
// slim bar at the top left. The scroll logic runs on a stand-in window; the
// page and the styles are checked as text (the tests have no browser, so the
// look itself is checked with `just look --scroll`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSlim, SLIM_AFTER, trackSlimHead } from '../web/ui.js';

const web = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');

function stage({ reduced = false } = {}) {
  const on = {};
  const classes = new Set();
  const win = {
    scrollY: 0,
    scrolledTo: null,
    addEventListener: (type, fn) => { on[type] = fn; },
    scrollTo(opts) { this.scrolledTo = opts; this.scrollY = opts.top; on.scroll?.(); },
    matchMedia: (q) => ({ matches: reduced && q.includes('reduce') }),
  };
  const body = { classList: { toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) } };
  let click;
  const toTop = { addEventListener: (type, fn) => { if (type === 'click') click = fn; } };
  let focused = null;
  const doc = { querySelector: (sel) => (sel === '#board-title' ? { focus: () => { focused = sel; } } : null) };
  trackSlimHead({ win, doc, body, toTop });
  const scroll = (y) => { win.scrollY = y; on.scroll(); };
  return { win, body, scroll, click: () => click(), focused: () => focused };
}

test('the header slims once the title row starts to leave the top, and comes back at the top', () => {
  assert.equal(isSlim(0), false);
  assert.equal(isSlim(SLIM_AFTER), false);
  assert.equal(isSlim(SLIM_AFTER + 1), true);
  const s = stage();
  assert.equal(s.body.classList.contains('head-slim'), false, 'starts full');
  s.scroll(600);
  assert.equal(s.body.classList.contains('head-slim'), true, 'scrolled: slim');
  s.scroll(0);
  assert.equal(s.body.classList.contains('head-slim'), false, 'back at the top: full');
});

test('⬆️ goes back to the top, smoothly unless motion is reduced, and leaves focus on the board name', () => {
  const s = stage();
  s.scroll(900);
  s.click();
  assert.deepEqual(s.win.scrolledTo, { top: 0, behavior: 'smooth' });
  assert.equal(s.body.classList.contains('head-slim'), false);
  assert.equal(s.focused(), '#board-title');
  const still = stage({ reduced: true });
  still.scroll(900);
  still.click();
  assert.deepEqual(still.win.scrolledTo, { top: 0, behavior: 'auto' });
});

test('the page: ⬆️ sits with ❓, ⚙️ and the person button; the board name can take focus; Edit sounds can shorten', () => {
  const html = web('index.html');
  const tools = html.slice(html.indexOf('<div class="title-tools">'), html.indexOf('</header>'));
  for (const id of ['help-open', 'settings-open', 'people', 'to-top']) assert.ok(tools.includes(`id="${id}"`), id);
  assert.match(tools, /id="to-top" aria-label="Back to the top">⬆️</);
  assert.match(html, /<h1 id="board-title" tabindex="-1">/);
  assert.match(html, /id="edit-toggle"[^>]*>✏️<span class="edit-word"> Edit<\/span><span class="edit-more"> sounds<\/span>/);
});

// Ben, 2026-10-19: where ✏️ Edit would collide with ⬆️ on the slim band, it
// drops its word (✏️ alone, ✅ for Done), still heard by screen readers.
test('the styles: on a phone\'s slim band ✏️ Edit drops its word, hidden only to the eye', () => {
  const css = web('styles.css');
  const narrow = css.match(/@media \(max-width: 429px\) \{([\s\S]*?)\n\}/g).join('\n');
  assert.match(narrow, /body\.head-slim\.screen-pads \.edit-word \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\);/);
  assert.doesNotMatch(narrow, /\.edit-word \{[^}]*display: none/, 'never display: none: the button keeps its name');
});

test('the styles: the header no longer sticks whole; the slim bar is fixed at the top left and sets --head-h', () => {
  const css = web('styles.css');
  assert.doesNotMatch(css, /\.top\s*\{[^}]*position:\s*sticky/, 'the full header scrolls away');
  assert.match(css, /body\.head-slim \.title-tools \{[^}]*position: fixed/);
  assert.match(css, /body\.head-slim \{ --head-h:/);
  assert.match(css, /body\.head-slim\.screen-pads \{ --head-h:/, 'on Pads the Edit sounds band is the bar');
  assert.match(css, /prefers-reduced-motion[\s\S]*animation: none !important/, 'the slide-in stops with reduced motion');
});
