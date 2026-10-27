// state.js STORE_TABLE: the one table of the stores. It follows store.js
// SCHEMA; every "stores as lists" builder follows it; and deleting a person
// leaves nothing of theirs in memory or in storage, whichever store holds it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeIndexedDB } from './fake-idb.mjs';
import { stubBanner } from './banner.mjs';
import { loadStorage, state, deletePerson, storedLists, STORE_TABLE } from '../web/state.js';
import { SCHEMA, STORE_NAMES, DB_NAME, DB_VERSION } from '../web/store.js';
import { PERSON_STORES } from '../web/reid.js';

stubBanner();
const GONE = 'p-gone-1';
const STAYS = 'p-stays-2';

// One record naming `person` for each store, by its key path (a kit edit is
// stored as `<person>-<kit sound>`).
function recordFor(store, keyPath, person) {
  if (store === 'people') return { id: person, name: `Name ${person}`, color: '#304A00', avatar: '🦉', added: true, created: 1 };
  if (store === 'overrides') return { id: `${person}-kick`, label: 'Boom' };
  if (keyPath === 'personId') return { personId: person, values: {}, ids: [] };
  return { id: `${store}-${person}`, personId: person, name: 'x', created: 1 };
}

test('STORE_TABLE is SCHEMA\'s stores in SCHEMA\'s order, less the sync\'s own bases', () => {
  assert.deepEqual(STORE_TABLE.map((t) => t.store), STORE_NAMES.filter((s) => s !== 'bases'));
  for (const { field } of STORE_TABLE) assert.ok(field in state, `${field} is a field of state`);
});

test('every "stores as lists" builder carries the stores of SCHEMA, less cloud and bases', () => {
  const want = STORE_NAMES.filter((s) => s !== 'cloud' && s !== 'bases').sort();
  assert.deepEqual(Object.keys(storedLists({ settings: true })).sort(), want);
  assert.deepEqual(Object.keys(storedLists()).sort(), want.filter((s) => s !== 'settings'));
  assert.deepEqual(Object.keys(storedLists()).sort(), PERSON_STORES.slice().sort());
});

test('storedLists maps prefs through the function it is given', () => {
  state.prefs = new Map([['p-a-1', { personId: 'p-a-1', values: { x: 1 } }]]);
  assert.deepEqual(storedLists().prefs, [{ personId: 'p-a-1', values: { x: 1 } }]);
  assert.deepEqual(storedLists({ prefs: (p) => ({ ...p, seen: true }) }).prefs, [{ personId: 'p-a-1', values: { x: 1 }, seen: true }]);
  state.prefs = new Map();
});

test('a deleted person leaves no record behind, in any store, and the other person keeps theirs', async () => {
  console.error = () => {};
  const idb = fakeIndexedDB();
  const data = Object.fromEntries(SCHEMA.map(({ name, keyPath }) => [name,
    PERSON_STORES.includes(name) ? [recordFor(name, keyPath, GONE), recordFor(name, keyPath, STAYS)] : []]));
  data.settings = [{ key: 'level', value: 'regular' }];
  data.cloud = [{ id: GONE, key: 'k' }];
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, data);
  globalThis.indexedDB = idb;
  await loadStorage();
  state.manifest = { kit: [{ id: 'kick' }], people: [] };
  const lists = storedLists();
  for (const name of PERSON_STORES) {
    assert.ok(JSON.stringify(lists[name]).includes(GONE), `${name} held a record of the person before`);
  }
  await deletePerson(GONE);
  const after = storedLists();
  for (const name of PERSON_STORES) {
    assert.equal(JSON.stringify(after[name]).includes(GONE), false, `${name}: nothing of the person in memory`);
    assert.equal(JSON.stringify(idb.rows(DB_NAME, name)).includes(GONE), false, `${name}: nothing of the person in storage`);
    assert.equal(JSON.stringify(after[name]).includes(STAYS), true, `${name}: the other person's record stays in memory`);
    assert.equal(JSON.stringify(idb.rows(DB_NAME, name)).includes(STAYS), true, `${name}: and in storage`);
  }
  // Not theirs to take: the device's settings, and the link to their cloud profile (people.js puts it back on a refusal).
  assert.deepEqual(idb.rows(DB_NAME, 'settings'), [{ key: 'level', value: 'regular' }]);
  assert.equal(idb.rows(DB_NAME, 'cloud').length, 1);
});
