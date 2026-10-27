// The sound sheet's parts (sheet-voices.js, sheet-make.js) call back into
// sheet.js through `hooks` (sheet-state.js `later`). A name asked for with
// later('x') that sheet.js never sets would fail on a kid's tap, so every one
// must be a hook once the app has started.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

before(async () => {
  console.error = () => {};
  installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;
});

test('every later(\'x\') in the sheet\'s parts is a hook sheet.js has set', async () => {
  const { hooks } = await import('../web/sheet-state.js');
  const asked = new Set();
  for (const f of ['sheet-voices.js', 'sheet-make.js']) {
    for (const m of readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8').matchAll(/later\('(\w+)'\)/g)) asked.add(m[1]);
  }
  assert.ok(asked.size >= 8, `found the names asked for (${[...asked]})`);
  for (const name of asked) assert.equal(typeof hooks[name], 'function', `hooks.${name}`);
});
