// No merge-conflict leftovers in any tracked file. Work lands by cherry-pick,
// and a hand-fixed conflict once left a stray ">>>>" line in questions.md
// (2026-10-11) that nothing caught.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter((f) => /\.(m?js|json|md|html|css|py|sql|toml|txt)$|^justfile$|_headers$/.test(f));

test('no tracked file holds a conflict marker', () => {
  const found = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(new URL(f, root), 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, i) => {
      if (/^(<{4,}|>{4,}|\|{7})( |$)/.test(line)) found.push(`${f}:${i + 1}: ${line.slice(0, 40)}`);
    });
  }
  assert.deepEqual(found, []);
});
