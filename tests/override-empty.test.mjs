// A preset edit that changes nothing is deleted, never stored (data.md,
// gotcha 7), even after a save stamped it with `changed` (merge3.js STAMP).
// Hiding a preset and showing it again left `{id, changed}` behind: a record
// that changes nothing, but that a backup's or another device's edit of the
// same preset could no longer replace (merge.js keeps the device's).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeIndexedDB } from './fake-idb.mjs';
import { stubBanner } from './banner.mjs';
import { DB_NAME } from '../web/store.js';
import { withHidden, overrideWithEmoji } from '../web/model.js';

const { text: notice } = stubBanner();
const idb = fakeIndexedDB();
globalThis.indexedDB = idb;
const { loadStorage, setOverride, state } = await import('../web/state.js');
await loadStorage({ waitMs: 1000 });
const stored = () => idb.rows(DB_NAME, 'overrides');

test('hidden, then shown again: no preset edit is left, in memory or stored', async () => {
  const id = 'p-x-kick';
  await setOverride(withHidden(state.overrides.get(id), id, true));
  assert.equal(stored().length, 1);
  assert.equal(typeof state.overrides.get(id).changed, 'number', 'the save stamped it');
  await setOverride(withHidden(state.overrides.get(id), id, false));
  assert.equal(state.overrides.has(id), false);
  assert.deepEqual(stored(), []);
});

test('a picture put back to the preset\'s own: no preset edit is left', async () => {
  const id = 'p-x-snare';
  await setOverride(overrideWithEmoji({ id, emoji: '🥁' }, state.overrides.get(id), '🦄'));
  await setOverride(overrideWithEmoji({ id, emoji: '🥁' }, state.overrides.get(id), '🥁'));
  assert.equal(state.overrides.has(id), false);
  assert.deepEqual(stored(), []);
});

test('putting a preset back that the browser won\'t save: the words say the edit may be back after a reload', async () => {
  const id = 'p-x-hihat';
  await setOverride(withHidden(state.overrides.get(id), id, true));
  idb.failCommit(1);
  await setOverride(withHidden(state.overrides.get(id), id, false));
  assert.match(notice.textContent, /^This browser wouldn't save that change .*After a reload it may be back as it was\.$/);
  assert.doesNotMatch(notice.textContent, /then it's gone/);
});
