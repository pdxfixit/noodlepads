// ❓ Help scrolled sideways at 320 px: a Help picture's words were nowrap, so one long
// sentence ("An update for Noodle Pads is ready.") was wider than the sheet. Layout needs a
// browser (`just look help-settings`); this checks the phone rule that lets the words wrap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('on a phone the words in a Help picture may wrap', () => {
  const start = css.indexOf('@media (max-width: 480px) {\n  .help-item');
  assert.ok(start >= 0, 'the phone rules for .help-item exist');
  const block = css.slice(start, css.indexOf('\n}', start));
  assert.match(block, /\.help-item \.help-word \{ white-space: normal; \}/);
});
