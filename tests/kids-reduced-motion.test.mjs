// 🧸 Kids under prefers-reduced-motion (council, 2026-10-26): its bounces,
// wiggles, the mic's nudge and swell stop. The 🌀 Spinner skin's pad spun a
// whole turn on every tap even then, since its own rule outranked Kids'
// reduced-motion one. Read from the CSS's text: what a device asking for less
// motion sees needs a browser (`just look kids-pads --skin spinner
// --reduced-motion`). The mic's glow still follows the voice, on purpose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n')
  + [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([^\n]*)\}\n/g)].map((m) => m[1]).join('\n');

test('reduced motion stills Kids: bounces and wiggles, the mic\'s nudge and swell, and the Spinner pad\'s turn', () => {
  assert.match(reduced, /\.kids \.boing, \.kids \.wiggle, \.kids-sum \.wiggle \{ animation: none; \}/);
  assert.match(reduced, /\.kids-mic\.recording \{ scale: 1; \}/);
  assert.match(reduced, /\.kids-mic\.kids-nudge:not\(\.recording, \.counting\) \{ animation: none; \}/);
  assert.match(reduced, /\.kids \.kids-pad\.kids-pad\.boing \{ animation: none; \}/, 'outranks the Spinner skin\'s .kids-pad.kids-pad.boing');
});
