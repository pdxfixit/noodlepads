// Pad badges scale with the pad (Ben, 2026-10-11: "hovering edit button
// (all badges) should scale with the tile"). The tests have no layout, so
// this checks the rules as text; `just look edit-chosen` checks the look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('the badge disc follows the pad width (cq units) between a small and a large size', () => {
  const m = css.match(/--disc: clamp\((\d+)px, ([\d.]+)cqw, (\d+)px\)/);
  assert.ok(m, '--disc is a clamp on the pad width');
  const [lo, k, hi] = m.slice(1).map(Number);
  assert.ok(lo >= 24 && hi <= 56 && lo < hi);
  // Below 132 px wide the badges stack; there the button stays 44 px.
  assert.ok((132 * k) / 100 + 12 <= 44, 'stacked badges keep their 44 px spacing');
  assert.match(css, /\.pad-tools \.pad-check\.on \{ background: radial-gradient\(circle closest-side, var\(--ink\) 0 calc\(var\(--disc\)/, 'the select circle is a disc badge too');
});

test('every badge button is at least 44 px and sized from the disc, for ✏️ on hover too', () => {
  const rule = css.slice(css.lastIndexOf('.pad-tools .pad-tool {'));
  const body = rule.slice(0, rule.indexOf('}'));
  for (const prop of ['width', 'min-width', 'height']) assert.match(body, new RegExp(`\\n  ${prop}: max\\(44px, calc\\(var\\(--disc\\)`), prop);
  assert.match(body, /radial-gradient\(circle closest-side, #fff 0 calc\(var\(--disc\)/, 'the drawn disc follows it');
});

// Ben, 2026-10-11: "they should float above with a bolder stroke".
test('the badges float above the pad (a drop shadow on the disc) with a bold 4 px ink ring', () => {
  const first = css.slice(css.indexOf('.pad-tools .pad-tool {'));
  assert.match(first.slice(0, first.indexOf('}')), /filter: drop-shadow\(0 3px 0 /);
  const rule = css.slice(css.lastIndexOf('.pad-tools .pad-tool {'));
  assert.match(rule.slice(0, rule.indexOf('}')), /#fff 0 calc\(var\(--disc\) \/ 2 - 4\.5px\), var\(--ink\) calc\(var\(--disc\) \/ 2 - 4px\)/);
  assert.match(css, /\.pad-picks \{ right: auto; left: -6px; \}/, 'the circle sits at the upper left');
});

test('a beat row grip is a 44 px target both ways, at every width (a line short of room uses ⋯ instead)', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const rule = css.match(/^\.seq-head \.seq-grip \{[^}]*\}/m)?.[0] ?? '';
  assert.match(rule, /min-height: 4[4-9]px/);
  assert.match(rule, /min-width: 44px/);
  // Never narrowed to fit (Ben, 2026-10-12): 🔔 🧹 ✕ move into ⋯ instead (overflow.test.mjs).
  assert.equal(css.indexOf('@media (max-width: 359px) {\n  .seq-row .seq-head'), -1);
});

test('on a narrow screen the tab you are on shows only its emoji', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 559px\) \{\s*\.screens \.tool\[aria-pressed="true"\] \.tool-name \{[^}]*clip-path: inset\(50%\)/);
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  for (const word of ['Pads', 'Beats', 'Song', 'Live']) assert.match(html, new RegExp(`<span class="tool-name"> ${word}</span>`));
});
