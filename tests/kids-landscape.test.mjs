// 🧸 Kids held sideways (council round 1, the Kids UX seat, 2026-10-27). No
// test has a browser or a layout, so this reads the CSS that answers it; the
// real check is `just look kids-pads kids-beats kids-record kids-keys kids-sum
// --landscape` in headless Chrome, which fails a view whose controls the
// window cuts off or that scrolls sideways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

// A phone held sideways is 360 to 430 px tall. Kids stood its tabs under the
// screens, so a 74 px header and a 100 px bar left 150 px for the pads and
// cut the beat's last rows and the grown-up sum's keys off. Under 520 px
// tall and wider than tall, the tabs and ⏹️ are a column at the left.
test('Kids on a short, wide window puts its tabs and ⏹️ in a column down the left edge', () => {
  const css = readFileSync(join(root, 'web/styles.css'), 'utf8');
  const block = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 520px) {\n  .kids {'));
  assert.ok(block.length > 100, 'the block is there');
  const rules = block.slice(0, block.indexOf('\n}\n'));
  assert.match(rules, /\.kids \{[^}]*flex-direction: row/, 'the screens and the bar side by side');
  assert.match(rules, /\.kids-bar \{[^}]*order: -1;[^}]*flex-direction: column/, 'the bar first, a column');
  assert.match(rules, /\.kids-tabs \{[^}]*flex-direction: column/, 'the tabs one above the next');
  assert.match(rules, /\.kids-tab \{[^}]*min-height: 44px/, 'each tab 44 px at least');
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 520px\) \{\n  dialog\.kids-sum \{[^}]*\}[\s\S]*?\.kids-sum-keys \{ grid-template-columns: repeat\(5, 1fr\)/, 'the sum\'s ten keys five across');
});
