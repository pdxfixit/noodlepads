// tools/land.sh runs on Ben's Mac (BSD sed) and in cloud sessions (GNU sed).
// `sed -i ''` works only on the first and stopped every landing on Linux
// (2026-10-16), so the script edits its todo file without `sed -i`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const script = readFileSync(new URL('../tools/land.sh', import.meta.url), 'utf8');

test('land.sh never uses sed -i, which GNU and BSD sed read differently', () => {
  assert.doesNotMatch(script, /sed\s+-i/);
});

test('drop_done removes the picked commits from the todo list, on this machine\'s sed', () => {
  const fn = script.match(/^drop_done\(\) \{[\s\S]*?^\}/m)?.[0];
  assert.ok(fn, 'land.sh has drop_done');
  const dir = mkdtempSync(join(tmpdir(), 'land-'));
  const todo = join(dir, 'todo');
  writeFileSync(todo, 'aaa111\nbbb222\nccc333\n');
  execFileSync('bash', ['-c', `${fn}\ndrop_done "$1" bbb222`, 'x', todo]);
  assert.equal(readFileSync(todo, 'utf8'), 'ccc333\n');
  execFileSync('bash', ['-c', `${fn}\ndrop_done "$1" ccc333`, 'x', todo]);
  assert.equal(readFileSync(todo, 'utf8').trim(), '');
});
