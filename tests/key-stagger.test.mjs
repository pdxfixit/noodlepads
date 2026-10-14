// The key rows alternate like bricks (Ben, 2026-10-12): the number row and A
// row at the left, the Q and Z rows half a key in; no row further in than that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('the Q and Z rows sit half a key in; the number and A rows at the left', () => {
  const indents = [...css.matchAll(/\.dj-row\[data-row="(\d)"\][^{]*\{\s*padding-left:\s*calc\(var\(--key\) \* ([\d.]+)\)/g)];
  const rule = css.match(/\.dj-row\[data-row="1"\], \.dj-row\[data-row="3"\] \{ padding-left: calc\(var\(--key\) \* 0\.5\); \}/);
  assert.ok(rule, 'one rule puts rows 1 and 3 half a key in');
  assert.deepEqual(indents.map((m) => m[1]), ['1'], 'no other row is indented');
  assert.doesNotMatch(css, /\.dj-row\[data-row="[02]"\]\s*\{\s*padding-left/);
});
