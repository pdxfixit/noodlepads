// A test that starts the app waits for app.js's `ready` before its first tap.
// A fixed wait (page.settle()) was too short on a busy machine: under a full
// `just test` the app was not yet wired when a test pressed ● Record, so the
// recording never started (2026-10-12, tests/beat-rec-stop.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('every test that starts the app awaits its ready promise', () => {
  const dir = new URL('./', import.meta.url);
  const bare = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .filter((f) => /^\s*await import\('\.\.\/web\/app\.js'\);/m.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(bare, [], "write `await (await import('../web/app.js')).ready;`");
});
