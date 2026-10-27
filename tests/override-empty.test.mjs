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
const { loadStorage, readStorage, setOverride, setPersonEdit, deletePerson, state } = await import('../web/state.js');
const { db } = await import('../web/store.js');
const { mergeLoaded } = await import('../web/merge.js');
const { cleanBackup } = await import('../web/backup.js');
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

// Empty edits older copies already stored stay out of memory, so a backup's
// real edit of that preset comes in; a backup's own empty ones are dropped.
test('an empty edit already stored is left out when read, and a backup\'s real edit of that preset then comes in', async () => {
  const id = 'p-y-kick';
  await db.put('overrides', { id, changed: 5 });
  await db.put('overrides', { id: 'p-y-snare' });
  await readStorage();
  assert.equal(state.overrides.has(id), false);
  assert.equal(state.overrides.has('p-y-snare'), false);
  const { put } = await mergeLoaded({ overrides: [...state.overrides.values()] }, { overrides: [{ id, label: 'Boom' }] });
  assert.deepEqual(put.overrides, [{ id, label: 'Boom' }]);
  const out = cleanBackup({ app: 'noodlepads', format: '1.1', overrides: [{ id: 'pip-kick', changed: 5 }, { id: 'pip-snare', label: 'Crack' }] },
    () => null, { peopleIds: new Set(['pip']), clipIds: new Set(['pip-kick', 'pip-snare']), colorOk: () => true });
  assert.deepEqual(out.overrides.map((o) => o.id), ['pip-snare'], 'a backup\'s empty edit is dropped');
  assert.equal(out.skipped, 0, 'and not counted as left out');
});

// `p-t-lets-go` is p-t-lets's Go, and could read as p-t's Let's go: deleting
// p-t once took it too (a prefix and a kit id were enough).
test('deleting a person takes their preset edits, never another person\'s that reads alike', async () => {
  state.manifest = { kit: [{ id: 'go' }, { id: 'lets-go' }], people: [] };
  for (const id of ['p-t', 'p-t-lets']) state.peopleEdits.set(id, { id, name: id, added: true, created: 1 });
  await setOverride({ id: 'p-t-lets-go', label: 'Zoom' });
  await setOverride({ id: 'p-t-go', label: 'Off' });
  await deletePerson('p-t');
  assert.deepEqual([...state.overrides.keys()].filter((k) => k.startsWith('p-t')), ['p-t-lets-go']);
  assert.deepEqual(stored().map((o) => o.id).filter((k) => k.startsWith('p-t')), ['p-t-lets-go']);
});

test('a boards.json person\'s edit put back that the browser won\'t save: the words say it may be back after a reload', async () => {
  const was = state.manifest;
  state.manifest = { kit: [], people: [{ id: 'pip', name: 'Pip', color: '#2D3FD6', clips: [] }] };
  await setPersonEdit('pip', { name: 'Captain Pip' });
  notice.textContent = '';
  idb.failCommit(1);
  await setPersonEdit('pip', { name: 'Pip' });
  assert.match(notice.textContent, /^This browser wouldn't save that change .*After a reload it may be back as it was\.$/);
  state.manifest = was;
});

test('an edit two people here both fit is kept, whichever of them is deleted', async () => {
  state.manifest = { kit: [{ id: 'go' }, { id: 'lets-go' }], people: [] };
  // p-t-lets-go: p-t's Let's go, or p-t-lets's Go. Each has one of their own too.
  const own = { 'p-t': 'p-t-go', 'p-t-lets': 'p-t-lets-lets-go' };
  for (const gone of ['p-t-lets', 'p-t']) {
    for (const id of Object.keys(own)) state.peopleEdits.set(id, { id, name: id, added: true, created: 1 });
    for (const id of ['p-t-lets-go', ...Object.values(own)]) await setOverride({ id, label: 'Zoom' });
    await deletePerson(gone);
    assert.ok(state.overrides.has('p-t-lets-go'), `${gone} deleted: the edit both fit survives`);
    assert.ok(stored().some((o) => o.id === 'p-t-lets-go'), `${gone} deleted: and stays stored`);
    assert.equal(state.overrides.has(own[gone]), false, `${gone}'s own edit goes`);
    const other = gone === 'p-t' ? 'p-t-lets' : 'p-t';
    assert.ok(state.overrides.has(own[other]), `${other}'s own edit stays`);
  }
});
