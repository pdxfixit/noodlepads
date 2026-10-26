// The board must not wait on storage: another tab can hold the database at
// an older version for as long as it stays open.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStorage, state, removeRecord, deletePerson } from '../web/state.js';
import { db, STORE_NAMES } from '../web/store.js';
import { stubBanner } from './banner.mjs';

const { box, text: notice } = stubBanner();

// An IndexedDB whose open request the test finishes by hand, and whose
// stores all read as empty.
function slowIndexedDB() {
  const req = {};
  const database = {
    close() {},
    transaction: () => ({
      set oncomplete(fn) { queueMicrotask(fn); },
      objectStore: () => ({ getAll: () => ({ result: [] }) }),
    }),
  };
  return { req, database, open: () => req };
}

test('a held-up database: the board goes ahead with a note, and the data arrives later', async () => {
  const fake = slowIndexedDB();
  globalThis.indexedDB = fake;
  let late = 0;
  await loadStorage({ waitMs: 10, onLateOpen: () => late++ });   // returns although nothing opened
  assert.match(notice.textContent, /another soundboard tab/);
  assert.equal(late, 0);

  state.settings = new Map([['stale', 1]]);
  fake.req.result = fake.database;
  fake.req.onsuccess();                                            // the other tab let go
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(late, 1);
  assert.equal(box.hidden, true);                                 // the note is put away
  assert.equal(state.settings.size, 0);                            // and storage was read
  assert.equal(STORE_NAMES.length, 17);
  db.handle = null;
});

test('a database that opens quickly: no note, no late redraw', async () => {
  const fake = slowIndexedDB();
  globalThis.indexedDB = fake;
  notice.textContent = '';
  let late = 0;
  const loading = loadStorage({ waitMs: 1000, onLateOpen: () => late++ });
  fake.req.result = fake.database;
  fake.req.onsuccess();
  await loading;
  assert.equal(late, 0);
  assert.equal(notice.textContent, '');
  db.handle = null;
});

// While another tab holds the database, a delete says so in the words a
// save uses, never the raw "storage is not available".
test('a held-up database: a delete, or deleting a person, says another tab is holding the sounds', async () => {
  const fake = slowIndexedDB();
  globalThis.indexedDB = fake;
  await loadStorage({ waitMs: 10 });
  state.manifest = { kit: [], people: [] };
  notice.textContent = '';
  assert.equal(await removeRecord('layouts', 'layout-a', 'That key layout'), false);
  assert.match(notice.textContent, /^Not saved: another soundboard tab is still holding your saved sounds/);
  notice.textContent = '';
  state.peopleEdits.set('p-pip-1', { id: 'p-pip-1', name: 'Admiral Acorn', added: true, created: 1 });
  assert.equal(await deletePerson('p-pip-1'), null, 'refused');
  assert.match(notice.textContent, /^Admiral Acorn wasn't deleted: another soundboard tab is still holding your saved sounds/);
  fake.req.result = fake.database;
  fake.req.onsuccess();
  await new Promise((r) => setTimeout(r, 20));
  db.handle = null;
});
