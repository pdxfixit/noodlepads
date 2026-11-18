// The app's one give-way order (web/give-way.js, docs/design/give-way.md;
// Ben, 2026-11-18): every line gives way tight → compact → words → doubles →
// fold, and doubles step out ❓, ⬆️, ⚙️. The bars are checked here against it;
// the look itself at every width is `just look --wide`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GIVE_WAY, DOUBLES } from '../web/give-way.js';
import { STEPS } from '../web/mini-deck.js';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('the order is the five stages, and doubles go ❓, ⬆️, ⚙️', () => {
  assert.deepEqual(GIVE_WAY, ['tight', 'compact', 'words', 'doubles', 'fold']);
  assert.deepEqual(DOUBLES, ['help', 'top', 'settings']);
});

test('🥁 Beats\' slim bar takes its steps from the one order', () => {
  assert.deepEqual(STEPS, ['tuck-nohelp', 'tuck-notop', 'tuck-nosettings']);
});

// The widest breakpoint (max-width) at which the Pads slim band takes a step,
// found by the rule that does it.
function padsStep(rule) {
  const blocks = [...css.matchAll(/@media \(max-width: (\d+)px\) \{\n([\s\S]*?)\n\}/g)];   // a block over several lines
  const hit = blocks.filter(([, , body]) => rule.test(body)).map(([, px]) => Number(px));
  assert.ok(hit.length, `a step matching ${rule}`);
  return Math.max(...hit);
}

test('🔊 Pads\' slim band gives way in the one order, widest first', () => {
  const ladder = [
    ['tight', padsStep(/body\.head-slim\.screen-pads \.pads-bar \{ gap: 4px;/)],
    ['compact: Pad size', padsStep(/body\.head-slim\.screen-pads \.pads-size \{ display: none; \}/)],
    ['words: 🔁', padsStep(/body\.head-slim\.screen-pads \.loop-word \{ position: absolute;/)],
    ['words: "sounds"', padsStep(/body\.head-slim\.screen-pads \.edit-more \{ position: absolute;/)],
    ['words: "Edit"', padsStep(/body\.head-slim\.screen-pads \.edit-word \{ position: absolute;/)],
    ['doubles: ❓', padsStep(/body\.head-slim\.screen-pads #help-open \{ display: none; \}/)],
    ['doubles: ⬆️', padsStep(/body\.head-slim\.screen-pads \.to-top \{ display: none; \}/)],
  ];
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i - 1][1] > ladder[i][1], `${ladder[i - 1][0]} (under ${ladder[i - 1][1] + 1} px) before ${ladder[i][0]} (under ${ladder[i][1] + 1} px)`);
  }
  assert.doesNotMatch(css, /body\.head-slim\.screen-pads #settings-open \{ display: none/, '⚙️ stays: the band never needs it gone');
});

test('🎤 Live: 🎬 Takes, first to fold, loses its word no later than 🔔 and ✏️', () => {
  const live = css.match(/@media \(max-width: (\d+)px\) \{\n  body\.screen-live \.dj-bar \.dj-word \{[\s\S]*?\n\}/);
  assert.ok(live, 'the Live words step');
  assert.match(live[0], /#dj-takes-open \{ padding: 0; font-size: 0; \}/, '🎬 goes with them');
});
