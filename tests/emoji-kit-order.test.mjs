// A preset's picture changed from ⌨️ Keys (app.js setClipEmoji) is compared
// with that preset's own kit entry, whatever the kit's order. With `go`
// listed before `lets-go`, Let's go was compared with Go's entry: picking
// Go's picture for Let's go read as "back to its own picture" and was dropped,
// so the pad stayed 🗣️. (Go wears 🦄 here, a picture in the short list.)

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { keysOn, keysOff } from './new-beat.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

const PIP = 'p-pip-1';
const idb = fakeIndexedDB();
let page;
let state;

before(async () => {
  console.error = () => {};
  const manifest = { ...testManifest(), people: [] };
  const go = manifest.kit.find((k) => k.id === 'go');
  manifest.kit = [{ ...go, emoji: '🦄' }, ...manifest.kit.filter((k) => k !== go)];   // Go first, before Let's go, wearing a picture the short list has
  assert.ok(manifest.kit.findIndex((k) => k.id === 'go') < manifest.kit.findIndex((k) => k.id === 'lets-go'));
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [{ id: PIP, name: 'Admiral Acorn', avatar: '🦉', color: '#304A00', added: true, created: 1, offline: true }],
    patterns: [{ personId: PIP, name: 'Go go', bpm: 100, bars: 1, swing: 0, rows: [{ clipId: `${PIP}-lets-go`, steps: Array.from({ length: 16 }, (_, i) => i === 0) }] }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest, hash: `#${PIP}` });
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
});

test('Go\'s picture picked for Let\'s go is kept, with Go listed first in the kit', async () => {
  const $ = page.$;
  keysOn(page);
  const row = $('#dj-grid').children[0];
  assert.match(row.querySelector('.row-emoji').textContent, /🗣️/, "Let's go's row");
  row.querySelector('[data-picture]').dispatch('click');
  assert.equal($('#pictures').open, true);
  const pick = () => $('#pictures-grid').querySelector('[data-pick="🦄"]');
  pick().dispatch('click');                    // Go has it: asks first
  if ($('#pictures').open) pick().dispatch('click');
  await page.settle();
  assert.equal(state.overrides.get(`${PIP}-lets-go`)?.emoji, '🦄');
  assert.match($('#dj-grid').children[0].querySelector('.row-emoji').textContent, /🦄/);
  keysOff(page);
});
