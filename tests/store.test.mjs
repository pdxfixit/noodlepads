import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DB_NAME, DB_VERSION, SCHEMA, STORE_NAMES, upgradeStores, db } from '../web/store.js';

// A stand-in for an IDBDatabase that records the stores created on it.
const fakeDatabase = () => {
  const created = [];
  return { created, createObjectStore: (name, options) => { created.push({ name, ...options }); } };
};

test('the database is noodle-pads (new at noodlepads.com), at the version older data upgrades to', () => {
  assert.equal(DB_NAME, 'noodle-pads');
  assert.equal(DB_VERSION, 14);
  assert.deepEqual(STORE_NAMES, ['clips', 'overrides', 'orders', 'patterns', 'beats', 'people', 'settings', 'decks', 'takes', 'songs', 'songbook', 'cloud', 'prefs', 'layouts', 'voices', 'bases']);
});

test('a new database gets every store, with the keys older versions used', () => {
  const d = fakeDatabase();
  upgradeStores(d, 0);
  assert.deepEqual(d.created, [
    { name: 'clips', keyPath: 'id' },
    { name: 'overrides', keyPath: 'id' },
    { name: 'orders', keyPath: 'personId' },
    { name: 'patterns', keyPath: 'personId' },
    { name: 'beats', keyPath: 'id' },
    { name: 'people', keyPath: 'id' },
    { name: 'settings', keyPath: 'key' },
    { name: 'decks', keyPath: 'personId' },
    { name: 'takes', keyPath: 'id' },
    { name: 'songs', keyPath: 'personId' },
    { name: 'songbook', keyPath: 'id' },
    { name: 'cloud', keyPath: 'id' },
    { name: 'prefs', keyPath: 'personId' },
    { name: 'layouts', keyPath: 'id' },
    { name: 'voices', keyPath: 'id' },
    { name: 'bases', keyPath: 'id' },
  ]);
});

test('each older database gets only the stores that came after it', () => {
  const upgraded = (from) => { const d = fakeDatabase(); upgradeStores(d, from); return d.created.map((s) => s.name); };
  const dj = ['decks', 'takes', 'songs', 'songbook', 'cloud', 'prefs', 'layouts', 'voices', 'bases'];
  assert.deepEqual(upgraded(1), ['orders', 'patterns', 'beats', 'people', 'settings', ...dj]);
  assert.deepEqual(upgraded(2), ['patterns', 'beats', 'people', 'settings', ...dj]);
  assert.deepEqual(upgraded(3), ['beats', 'people', 'settings', ...dj]);
  assert.deepEqual(upgraded(4), ['people', 'settings', ...dj]);
  assert.deepEqual(upgraded(5), ['settings', ...dj]);
  assert.deepEqual(upgraded(6), dj);
  assert.deepEqual(upgraded(7), ['songs', 'songbook', 'cloud', 'prefs', 'layouts', 'voices', 'bases']);
  assert.deepEqual(upgraded(8), ['songbook', 'cloud', 'prefs', 'layouts', 'voices', 'bases'], 'a database with one song per person keeps it; the app lists it on open');
  assert.deepEqual(upgraded(9), ['cloud', 'prefs', 'layouts', 'voices', 'bases']);
  assert.deepEqual(upgraded(10), ['prefs', 'layouts', 'voices', 'bases'], "a person's settings start empty: they read the device's older choices");
  assert.deepEqual(upgraded(11), ['layouts', 'voices', 'bases'], 'saved DJ key layouts start empty');
  assert.deepEqual(upgraded(12), ['voices', 'bases'], "a kid's own voices (⭐ Save voice) start empty; nothing else is touched");
  assert.deepEqual(upgraded(13), ['bases'], 'sync bases start empty: the first sync after keeps them, and until then the hashes in `cloud` decide');
  assert.deepEqual(upgraded(14), []);
});

test('upgrading never creates a store twice, whichever version it starts from', () => {
  for (let from = 0; from <= DB_VERSION; from++) {
    const d = fakeDatabase();
    upgradeStores(d, from);
    assert.equal(new Set(d.created.map((s) => s.name)).size, d.created.length);
  }
});

test('stores were introduced in order, one version at a time', () => {
  const versions = [...new Set(SCHEMA.map((s) => s.since))];
  assert.deepEqual(versions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test('reading or writing before the database is open fails clearly, not silently', async () => {
  await assert.rejects(db.all('clips'), /storage is not available/);
  await assert.rejects(db.put('clips', { id: 'x' }), /storage is not available/);
  await assert.rejects(db.remove('clips', 'x'), /storage is not available/);
});

// A stand-in for indexedDB.open whose request the test drives by hand.
function fakeIndexedDB() {
  const req = {};
  return { req, open: () => req };
}

test('a blocked upgrade is reported and waited out, not treated as a failure', async () => {
  const fake = fakeIndexedDB();
  globalThis.indexedDB = fake;
  let blocked = 0;
  const opening = db.open({ onBlocked: () => blocked++ });
  fake.req.onblocked();            // another tab holds an older version open
  assert.equal(blocked, 1);
  fake.req.result = { close() {} };
  fake.req.onsuccess();            // ...then lets go, and the open finishes
  await opening;
  assert.ok(db.handle);
  db.handle = null;
});

test('when a newer copy asks to upgrade, this tab closes its connection and says so', async () => {
  const fake = fakeIndexedDB();
  globalThis.indexedDB = fake;
  let closed = 0, told = 0;
  const opening = db.open({ onVersionChange: () => told++ });
  fake.req.result = { close: () => closed++ };
  fake.req.onsuccess();
  await opening;
  db.handle.onversionchange();
  assert.equal(closed, 1);
  assert.equal(told, 1);
  assert.equal(db.handle, null);
});

test('every put and delete that succeeds says which store changed (cloud sync listens)', async () => {
  const tx = () => {
    const t = { objectStore: () => ({ put: () => ({ result: 1 }), delete: () => ({ result: undefined }) }) };
    queueMicrotask(() => t.oncomplete());
    return t;
  };
  db.handle = { transaction: tx };
  const told = [];
  db.onChange = (store) => told.push(store);
  await db.put('beats', { id: 'b' });
  await db.remove('clips', 'c');
  assert.deepEqual(told, ['beats', 'clips']);
  db.handle = null;
  await assert.rejects(db.put('beats', { id: 'b' }));
  assert.deepEqual(told, ['beats', 'clips'], 'a failed write is not a change');
  db.onChange = () => {};
});
