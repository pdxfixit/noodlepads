// The app asks the browser to keep its storage (navigator.storage.persist)
// once something a kid made is saved, so a full disk does not clear a
// family's sounds and beats (storage and sync seat, council round 1).

import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fakeIndexedDB } from './fake-idb.mjs';
import { persist, keepStorage, forgetKeepAsk } from '../web/state.js';
import { db } from '../web/store.js';

const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
const settle = () => new Promise((r) => setTimeout(r, 5));

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();
  await db.open();
});
afterEach(() => {
  forgetKeepAsk();
  if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator;
});

test('the first save of something a kid made asks the browser to keep the storage, once', async () => {
  const calls = [];
  setNavigator({ storage: { persisted: async () => false, persist: async () => { calls.push('persist'); return true; } } });
  await persist('settings', { key: 'x', value: 1 });
  await settle();
  assert.deepEqual(calls, [], 'a setting is nothing to keep');
  await persist('beats', { id: 'beat-1', personId: 'p-a', name: 'A', rows: [] });
  await settle();
  assert.deepEqual(calls, ['persist']);
  await persist('clips', { id: 'user-1', personId: 'p-a', blob: new Blob([new Uint8Array([1])]) });
  await settle();
  assert.deepEqual(calls, ['persist'], 'not asked again this visit');
});

test('storage already kept is not asked for again', async () => {
  let asked = 0;
  setNavigator({ storage: { persisted: async () => true, persist: async () => { asked++; return true; } } });
  assert.equal(await keepStorage(), true);
  assert.equal(asked, 0);
});

test('a browser with no such call, or one that fails it, changes nothing about saving', async () => {
  setNavigator({});
  assert.equal(await persist('beats', { id: 'beat-2', personId: 'p-a', name: 'B', rows: [] }), true);
  forgetKeepAsk();
  setNavigator({ storage: { persist: async () => { throw new Error('denied'); } } });
  assert.equal(await persist('beats', { id: 'beat-3', personId: 'p-a', name: 'C', rows: [] }), true);
  await settle();
  forgetKeepAsk();
  setNavigator({ storage: { persist: async () => false } });
  assert.equal(await keepStorage(), false, 'a refusal is only an answer');
});
