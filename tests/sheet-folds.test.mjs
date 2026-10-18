// The sound sheet's folding sections are bordered panels (Ben, 2026-10-18:
// "a visual border… so that it's a little more clear, the sections for such
// a long phone page"). The border itself needs a browser (`just look
// sheet-own`); this checks every fold sits in a .fold-panel that has one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('every folding section of the sound sheet is a bordered panel', () => {
  const folds = [...html.matchAll(/data-fold="([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(folds.length >= 2, `${folds.length} folds`);
  for (const fold of folds) {
    const at = html.indexOf(`data-fold="${fold}"`);
    const opener = html.lastIndexOf('<fieldset', at) > html.lastIndexOf('<section', at) ? html.lastIndexOf('<fieldset', at) : html.lastIndexOf('<section', at);
    const tag = html.slice(opener, html.indexOf('>', opener));
    assert.match(tag, /\bfold-panel\b/, `${fold}'s section is a .fold-panel`);
  }
  const rule = css.match(/dialog#sheet \.fold-panel \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /border: 2px solid/);
  assert.match(rule, /border-radius/);
});
