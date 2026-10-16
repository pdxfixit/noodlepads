// Wide screens (Ben, 2026-10-11: "fill, then split. still reasonable to have
// upper/lower limits"). Layout needs a browser (`just look --wide`); these
// check the parts of it that are plain text: the content limit, and the
// sound sheet's order and parts, which its wide columns depend on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('styles.css');

test('content fills the screen up to 2400 px, centered beyond it', () => {
  assert.match(css, /--max:\s*2400px;/);
  for (const sel of ['.top {', 'main {']) {
    const rule = css.slice(css.indexOf(`\n${sel}`), css.indexOf('}', css.indexOf(`\n${sel}`)));
    assert.match(rule, /max-width: var\(--max\)/, sel);
    assert.match(rule, /margin: 0 auto/, sel);
  }
});

// Ben: "perhaps moving the tweaks above the shape it section"; "name can be
// at the top in the title bar". The knobs sit
// under the voices, in one box with the sticky ⭐ Save voice · ↩️ Reset voice row.
test('the sound sheet: its name in the title bar; then Voice and its Layers, then Picture and Color', () => {
  const form = html.slice(html.indexOf('id="sheet-form"'), html.indexOf('</form>', html.indexOf('id="sheet-form"')));
  const at = (s) => { const i = form.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = ['class="sheet-head"', 'id="clip-label"', 'class="sheet-col sheet-hear"', 'id="capture"', 'id="wave-box"',
    'class="sheet-col sheet-controls"', 'class="voice-box"', '>Voice<', 'id="voice-actions"', 'id="layers"', 'id="layer-rows"', 'id="sheet-advanced"',
    'class="sheet-col sheet-look"', '>Picture<', '>Color<', 'id="sheet-error"'];
  const where = order.map(at);
  assert.deepEqual([...where].sort((a, b) => a - b), where, 'in this order');
});

test('on a phone the sheet\'s parts are one column, as before (their wrappers draw nothing)', () => {
  const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');   // rules outside any @media
  assert.match(top, /\.sheet-col\s*\{\s*display:\s*contents;\s*\}/);
});

test('pads share the room left over evenly between and around them, not only at the edges', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const rule = css.match(/\n\.pads \{[^}]*grid-template-columns: repeat\(auto-fill[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /justify-content: space-evenly;/);
});
