// state.js shelf: the one writer for a person's saved lists (beats, songbook,
// takes, layouts, touchLayouts). A put and a remove leave memory and storage
// equal; a refused delete keeps the record out of memory and says so; a
// failed save keeps the record in memory.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fakeIndexedDB } from './fake-idb.mjs';
import { stubBanner } from './banner.mjs';
import { loadStorage, state, shelf } from '../web/state.js';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

const { text: notice } = stubBanner();
const idb = fakeIndexedDB();
const stored = (store) => idb.rows(DB_NAME, store);
const settle = () => new Promise((r) => setTimeout(r, 20));

// field, store, what, a record
const FIVE = [
  ['savedBeats', 'beats', 'That beat', { clone: true, newest: true }],
  ['songbook', 'songbook', 'That song', { clone: true, newest: true }],
  ['takes', 'takes', 'That take', {}],
  ['layouts', 'layouts', 'That key layout', {}],
  ['touchLayouts', 'touchLayouts', 'That touch layout', {}],
];

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {});
  globalThis.indexedDB = idb;
  await loadStorage();
  state.manifest = { kit: [], people: [] };
});

for (const [field, store, what, options] of FIVE) {
  test(`shelf ${store}: put then remove leaves memory and storage equal`, async () => {
    const rack = shelf(field, store, { what, ...options });
    const a = { id: `${store}-a`, personId: 'p-x-1', name: 'A', saved: 1 };
    const b = { id: `${store}-b`, personId: 'p-x-1', name: 'B', saved: 2 };
    const other = { id: `${store}-o`, personId: 'p-y-2', name: 'O', saved: 3 };
    for (const r of [a, b, other]) rack.put(r);
    rack.put({ ...a, name: 'A2' });                       // replaces by id, never doubles
    await settle();
    assert.deepEqual(state[field].map((r) => r.id).sort(), [a.id, b.id, other.id].sort());
    assert.deepEqual(rack.list('p-x-1').map((r) => r.id).sort(), [a.id, b.id].sort());
    if (options.newest) assert.deepEqual(rack.list('p-x-1').map((r) => r.id), [b.id, a.id], 'newest first');
    assert.equal(state[field].find((r) => r.id === a.id).name, 'A2');
    assert.deepEqual(stored(store).map((r) => r.id).sort(), state[field].map((r) => r.id).sort());
    assert.equal(stored(store).find((r) => r.id === a.id).name, 'A2');
    await rack.remove(b.id);
    await rack.remove(a.id);
    await rack.remove(other.id);
    assert.deepEqual(state[field], []);
    assert.deepEqual(stored(store), []);
  });

  test(`shelf ${store}: a refused delete is told, and the record stays gone from memory`, async () => {
    const rack = shelf(field, store, { what, ...options });
    rack.put({ id: `${store}-z`, personId: 'p-x-1', saved: 1 });
    await settle();
    notice.textContent = '';
    idb.failCommit(1);
    await rack.remove(`${store}-z`);
    assert.equal(state[field].length, 0);
    assert.equal(stored(store).length, 1, 'the browser kept it');
    assert.match(notice.textContent, new RegExp(`^${what} is gone for now, but this browser wouldn't delete it`));
    await rack.remove(`${store}-z`);
    await settle();
  });

  test(`shelf ${store}: a failed save keeps the record in memory`, async () => {
    const rack = shelf(field, store, { what, ...options });
    notice.textContent = '';
    idb.failCommit(1);
    rack.put({ id: `${store}-k`, personId: 'p-x-1', saved: 1 });
    await settle();
    assert.equal(state[field].length, 1);
    assert.equal(stored(store).length, 0);
    assert.match(notice.textContent, /wouldn't save that change/);
    state[field] = [];
  });
}

test('shelf: a clone store keeps the stamp out of memory; onRemove runs between memory and storage', async () => {
  const seen = [];
  const rack = shelf('savedBeats', 'beats', { what: 'That beat', clone: true, onRemove: (id) => seen.push([id, state.savedBeats.length]) });
  const beat = { id: 'b-1', personId: 'p-x-1', saved: 1 };
  rack.put(beat);
  await settle();
  assert.equal('changed' in beat, false, 'memory has no stamp');
  assert.equal(typeof stored('beats')[0].changed, 'number', 'storage has one');
  await rack.remove('b-1');
  assert.deepEqual(seen, [['b-1', 0]]);
});
