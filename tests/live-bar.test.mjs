// 🎤 Live's controls sit on its control bar at the top, laid out as Beats'
// (Ben, 2026-10-26: "moved to the top so that all the various views are
// consistent"): ● Record, the click's tempo and ⏲️, what is happening, then
// 🔔 Let it ring, ✏️ Layout and 🎬 Takes. Under the keys are only their colors.
// Keyboard and screen-reader order follow the page, so the page keeps that order.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const section = (open, close) => { const at = html.indexOf(open); return html.slice(at, html.indexOf(close, at)); };
const bar = section('<div class="beat-deck deck deck-end dj-bar">', '<div class="beat-shape" id="dj-setup"');
const tail = section('<div class="dj-tail">', '</section>');

test("Live's ⏲️, 🔔 Let it ring and ✏️ Layout are on the control bar, in Beats' order", () => {
  const at = (id) => bar.indexOf(`id="${id}"`);
  const order = ['dj-record', 'dj-click-tempo', 'dj-click', 'dj-status', 'dj-overlap', 'dj-change', 'dj-takes-open'];
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
