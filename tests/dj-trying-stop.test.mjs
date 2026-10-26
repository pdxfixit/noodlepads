// ↩️ My beat (a groove tried with ⌨️ Keys) is wired through its own element,
// `el.tryingStop` (#dj-trying-stop), never "the first button in #dj-trying".
// dj-grooves.test.mjs clicks #dj-trying-stop, which is also that first
// button, so it passes either way: here a decoy button goes first in the
// line before the app starts, and only #dj-trying-stop may hear a click.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let decoy;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  const line = page.$('#dj-trying');
  decoy = document.createElement('button');
  line.replaceChildren(decoy, ...line.children);
  await (await import('../web/app.js')).ready;
  await page.settle();
});

test('↩️ My beat listens on #dj-trying-stop itself, not on whatever button comes first in its line', () => {
  assert.ok(page.$('#dj-trying').querySelector('button') === decoy, 'the decoy is first');
  assert.ok((page.$('#dj-trying-stop').listeners.get('click') ?? []).length > 0, '#dj-trying-stop is wired');
  assert.equal((decoy.listeners.get('click') ?? []).length, 0, 'the decoy is not');
});
