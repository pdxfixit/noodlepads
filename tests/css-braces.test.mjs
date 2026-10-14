// styles.css has no build step to catch a stray brace. One left over from an
// edit (2026-10-11) closed a rule early, so the next rule (the sound sheet's
// picture grid) was silently dropped and its buttons shrank. This checks
// every { has its }, outside comments and strings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('styles.css: every { has its }, and none closes early', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''))   // keeps the line count
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  let depth = 0;
  let line = 1;
  for (const ch of css) {
    if (ch === '\n') line++;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      assert.ok(depth >= 0, `a } with no { near line ${line}`);
    }
  }
  assert.equal(depth, 0, 'a { is never closed');
});
