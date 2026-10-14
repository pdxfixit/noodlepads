// Every card in docs/questions.md has its own number. Agents number cards
// in parallel; on 2026-10-11 four numbers were claimed twice before landing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('question card numbers are unique', () => {
  const text = readFileSync(new URL('../docs/questions.md', import.meta.url), 'utf8');
  const nums = [...text.matchAll(/^### Q(\d+)\./gm)].map((m) => m[1]);
  const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
  assert.deepEqual(dup, [], `cards numbered twice: ${dup.map((n) => 'Q' + n).join(', ')}`);
});
