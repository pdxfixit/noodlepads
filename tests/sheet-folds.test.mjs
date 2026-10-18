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
  const rule = css.match(/dialog#sheet \.fold-panel, \.set-fold, \.emoji-all-sec \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /border: 2px solid/, 'the sheet, ⚙️ Settings, 💃 Grooves and the "…" emoji list share one bordered panel');
  assert.match(rule, /border-radius/);
  const settings = [...html.matchAll(/<section class="set-section set-fold[^"]*"/g)];
  assert.ok(settings.length >= 5, 'Settings\' folds are .set-fold sections');
});

// A line of buttons between two panels sits in the middle (Ben, 2026-10-18,
// of ⭐ Save voice · ↩️ Reset voice: 28 px above, 8 below). Measured in a
// browser with `just look sheet-own`: 14 and 14; this keeps the parts.
test('⭐ Save voice and 👂 Plain sit in the middle of the space around them', () => {
  for (const [sel, value] of [['#cut', 'margin-top: 14px'], ['#wave-box', 'margin-bottom: 14px'],
    ['#voice-box > .fold-panel', 'margin-bottom: 0'], ['#voice-actions', 'margin-top: 6px'], ['#voice-box > #layers', 'margin-top: 6px']]) {
    assert.ok(css.includes(`dialog#sheet ${sel} { ${value}; }`), `${sel} { ${value} }`);
  }
});
