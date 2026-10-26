// No regular expression in web/ may use a lookbehind, `(?<!…)` or `(?<=…)`:
// Safari before 16.4 can't parse one, and a module that fails to parse
// stops the whole app on an older iPhone or iPad (names.js had one,
// 2026-10-26). Write the check another way (walk the string).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../web/', import.meta.url);
const files = readdirSync(dir, { recursive: true }).filter((f) => /\.m?js$/.test(f));

test('no lookbehind in any web/ script', () => {
  const found = files.filter((f) => /\(\?<[!=]/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(found, []);
});
