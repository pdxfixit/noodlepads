// 🎤 Live's controls sit on its control bar at the top, laid out as Beats'
// (Ben, 2026-10-26: "moved to the top so that all the various views are
// consistent"): ● Record, the click's tempo and ⏲️, what is happening, then
// 🔔 Let it ring, ✏️ Layout and 🎬 Takes where they fit, folded into a ⋯
// where they don't (Ben, 2026-10-27). Under the keys are only their colors.
// Keyboard and screen-reader order follow the page, so the page keeps that order.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage, FakeElement } from './fake-dom.mjs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const section = (open, close) => { const at = html.indexOf(open); return html.slice(at, html.indexOf(close, at)); };
const bar = section('<div class="beat-deck deck deck-end dj-bar">', '<div class="beat-shape" id="dj-setup"');
const tail = section('<div class="dj-tail">', '</section>');

test("Live's ⏲️, 🔔 Let it ring and ✏️ Layout are on the control bar, in Beats' order", () => {
  const at = (id) => bar.indexOf(`id="${id}"`);
  const order = ['dj-record', 'dj-click-tempo', 'dj-click', 'dj-status', 'dj-overlap', 'dj-change', 'dj-takes-open', 'dj-more'];
  for (const id of order) assert.ok(at(id) >= 0, `#${id} on the bar`);
  assert.deepEqual([...order].sort((a, b) => at(a) - at(b)), order);
});

test('under the keys, only their colors', () => {
  assert.match(tail, /id="dj-legend"/);
  assert.equal(tail.match(/<button/g), null, 'no buttons at the foot of the keys');
});

test('🔔 and ✏️ say their word from 761 px; just the emoji up to 760 px, as Beats\' ✏️ on a phone', () => {
  assert.match(bar, /id="dj-overlap" data-word="Let it ring"[^>]*>🔔<\/button>/);
  assert.match(bar, /id="dj-change" data-word="Layout"[^>]*>✏️<\/button>/);
  assert.match(css, /\.seq-click\.dj-word::after \{ content: " " attr\(data-word\); \}/);
  assert.match(css, /@media \(max-width: 760px\) \{\n {2}body\.screen-live \.dj-bar \.dj-word \{ width: 48px; padding: 0; font-size: 1\.2rem; \}\n {2}body\.screen-live \.dj-bar \.dj-word::after \{ content: none; \}/);
});

test('while tap tempo talks, ⏲️ takes over the tempo\'s room, so nothing after it moves', () => {
  assert.match(css, /body\.screen-live \.dj-bar \.beat-more:has\(#dj-click\.tapping\) > #dj-click-tempo \{ display: none; \}/);
  assert.match(css, /body\.keys-on \.dj-bar \.beat-more:has\(#dj-beat-click\.tapping\) > #dj-tempo \{ display: none; \}/);
});

test('Beats with ⌨️ Keys: its bars take a line of their own up to 879 px (at 761–850 ⏲️ ran under them and ⇆ stuck out)', () => {
  assert.match(css, /@media \(min-width: 601px\) and \(max-width: 879px\) \{\n {2}\.dj-bar\.beat-deck \{ flex-wrap: wrap; \}/);
});

// Ben, 2026-10-27: "when there is the width available, it should be showing
// the buttons and not keeping them into the menu". A stand-in bar lays its
// keys out as flex-wrap does (44 px keys, 6 px apart); foldLine must fold
// just enough of them, 🎬 first and 🔔 last, for the rest to stand on one row.
function standInBar(inside) {
  const line = new FakeElement('div');
  const css = { 'dj-takes-open': 'fold-takes', 'dj-change': 'fold-layout', 'dj-overlap': 'fold-ring' };
  const ids = ['dj-record', 'dj-click-key', 'dj-click', 'dj-overlap', 'dj-change', 'dj-takes-open', 'dj-more'];
  const keys = ids.map((id) => { const k = new FakeElement('button'); k.id = id; return k; });
  // As styles.css: a fold class hides its button; the ⋯ shows once anything is folded.
  const shown = (k) => (k.id === 'dj-more' ? line.classList.contains('fold-takes') : !line.classList.contains(css[k.id]));
  const place = () => {
    let x = 0;
    let top = 0;
    const at = new Map();
    for (const k of keys.filter(shown)) {
      if (x > 0 && x + 44 > inside) { x = 0; top += 58; }
      at.set(k, { top, right: x + 44 });
      x += 50;
    }
    return at;
  };
  for (const k of keys) {
    k.getClientRects = () => (shown(k) ? [{}] : []);
    k.getBoundingClientRect = () => place().get(k);
  }
  Object.defineProperty(line, 'clientWidth', { get: () => inside });
  line.getBoundingClientRect = () => ({ top: 0, right: inside });
  return { line, keys, folded: () => BAR_FOLDS.filter((c) => line.classList.contains(c)) };
}

let foldLine;
let BAR_FOLDS;
test('🎤 Live\'s bar shows every button where they fit, and folds the fewest into ⋯ where not', async () => {
  installPage();
  ({ foldLine } = await import('../web/lines.js'));
  ({ BAR_FOLDS } = await import('../web/dj.js'));
  assert.deepEqual(BAR_FOLDS, ['fold-takes', 'fold-layout', 'fold-ring'], '🎬 folds first, ✏️ next, 🔔 last');
  const wide = standInBar(400);   // seven keys need 344 px
  foldLine(wide.line, BAR_FOLDS, () => wide.keys);
  assert.deepEqual(wide.folded(), [], 'room for all: no ⋯');
  const phone = standInBar(320);   // six keys (no ⋯) need 294 px: they fit
  foldLine(phone.line, BAR_FOLDS, () => phone.keys);
  assert.deepEqual(phone.folded(), []);
  const narrow = standInBar(264);   // a 320 px phone: 🎬 alone for a ⋯ gains nothing, so ✏️ goes too
  foldLine(narrow.line, BAR_FOLDS, () => narrow.keys);
  assert.deepEqual(narrow.folded(), ['fold-takes', 'fold-layout']);
  const tiny = standInBar(200);
  foldLine(tiny.line, BAR_FOLDS, () => tiny.keys);
  assert.deepEqual(tiny.folded(), BAR_FOLDS, 'ever narrower: 🔔 folds last');
});

test('the ⋯ lists only what is folded; the CSS folds by the classes and shows ⋯ only then', async () => {
  assert.match(bar, /id="dj-more" data-more="live" data-more-fold /);
  assert.match(css, /\.dj-bar \.dj-more \{ display: none; \}\nbody\.screen-live \.dj-bar\.fold-takes \.dj-more \{ display: block;/);
  assert.match(css, /body\.screen-live \.dj-bar\.fold-takes #dj-takes-open,\nbody\.screen-live \.dj-bar\.fold-layout #dj-change,\nbody\.screen-live \.dj-bar\.fold-ring #dj-overlap \{ display: none; \}/);
  const { moreItems } = await import('../web/overflow.js');
  const box = new FakeElement('div');
  const ring = new FakeElement('button');
  ring.setAttribute('data-more-word', 'Let it ring');
  ring.setAttribute('data-more-state', 'Off');
  ring.textContent = '🔔';
  const takes = new FakeElement('button');
  takes.setAttribute('data-more-word', 'Takes');
  takes.setAttribute('data-more-icon', '🎬');
  takes.textContent = '🎬 Takes';
  const more = new FakeElement('button');
  more.setAttribute('data-more', 'live');
  more.setAttribute('data-more-fold', '');
  box.append(ring, takes, more);
  ring.getClientRects = () => [{}];   // still on the bar
  takes.getClientRects = () => [];    // folded
  assert.deepEqual(moreItems(more).map((it) => [it.icon, it.word, it.state]), [['🎬', 'Takes', '']]);
  ring.getClientRects = () => [];
  assert.deepEqual(moreItems(more).map((it) => [it.icon, it.word, it.state]), [['🔔', 'Let it ring', 'Off'], ['🎬', 'Takes', '']]);
});
