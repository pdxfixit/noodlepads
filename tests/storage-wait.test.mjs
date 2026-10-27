// The board must not wait on storage: another tab can hold the database at
// an older version for as long as it stays open.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStorage, state, persist, removeRecord, deletePerson, setOverride, setPersonEdit, deleteUserClip, deleteMyVoice } from '../web/state.js';
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
test('a held-up database: a delete, deleting a person, or an edit put back says another tab is holding the sounds', async () => {
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
  // A preset edit or a boards.json person's edit put back as it was deletes
  // its record: refused, it says so in the same words.
  notice.textContent = '';
  state.overrides.set('p-pip-1-kick', { id: 'p-pip-1-kick', label: 'Boom' });
  await setOverride({ id: 'p-pip-1-kick' });
  assert.match(notice.textContent, /^Not saved: another soundboard tab is still holding your saved sounds/, 'a preset put back');
  notice.textContent = '';
  state.manifest = { kit: [], people: [{ id: 'pip', name: 'Pip', color: '#2D3FD6', clips: [] }] };
  state.peopleEdits.set('pip', { id: 'pip', name: 'Captain Pip' });
  await setPersonEdit('pip', { name: 'Pip' });
  assert.match(notice.textContent, /^Not saved: another soundboard tab is still holding your saved sounds/, 'a person put back');
  fake.req.result = fake.database;
  fake.req.onsuccess();
  await new Promise((r) => setTimeout(r, 20));
  db.handle = null;
});

// A refused delete is told while another tab holds the database (storage is
// coming); with no storage at all there is nothing stored to come back, and
// the start said nothing saves, so it stays quiet: a notice there would push
// an ↩️ Undo off the banner (a groove into the scratch closes the open beat).
// Last in this file: a failed open stays failed for the page.
test('a delete with no storage at all is quiet and done; one while another tab holds the database is told', async () => {
  const held = slowIndexedDB();
  globalThis.indexedDB = held;
  await loadStorage({ waitMs: 10 });
  notice.textContent = '';
  assert.equal(await removeRecord('takes', 'take-a', 'That take'), false, 'another tab holds it: refused');
  assert.match(notice.textContent, /^Not saved: another soundboard tab/);
  held.req.result = held.database;
  held.req.onsuccess();
  await new Promise((r) => setTimeout(r, 20));
  db.handle = null;
  const req = {};
  globalThis.indexedDB = { open: () => req };
  const loading = loadStorage({ waitMs: 1000 });
  req.error = new Error('no IndexedDB here');
  req.onerror();
  await loading;
  notice.textContent = '';
  assert.equal(await removeRecord('takes', 'take-a', 'That take'), true, 'no storage: gone, from memory, which is all there is');
  assert.equal(notice.textContent, '', 'and nothing said');

  // Every other write and delete is quiet the same way (one noStorage() in
  // state.js), so a save can't push an Undo off the banner.
  state.manifest = { kit: [], people: [{ id: 'pip', name: 'Pip', color: '#2D3FD6', clips: [] }] };
  const clip = { id: 'c-1', label: 'Honk', personId: 'p-pip-1', source: 'user' };
  const table = [
    ['persist', () => persist('clips', { id: 'c-2', label: 'Beep' }), true],
    ['setOverride (kept)', () => setOverride({ id: 'p-pip-1-kick', label: 'Boom' }), true],
    ['setOverride (put back)', () => setOverride({ id: 'p-pip-1-kick' }), true],
    ['setPersonEdit (put back)', async () => { state.peopleEdits.set('pip', { id: 'pip', name: 'Captain Pip' }); await setPersonEdit('pip', { name: 'Pip' }); }],
    ['setPersonEdit (kept)', () => setPersonEdit('pip', { name: 'Admiral Pip' })],
    ['deleteUserClip', async () => { state.userClips = [clip]; await deleteUserClip(clip); assert.equal(state.userClips.length, 0); }],
    ['deleteMyVoice', async () => { state.myVoices = [{ id: 'v-1' }]; await deleteMyVoice('v-1'); assert.equal(state.myVoices.length, 0); }],
  ];
  for (const [name, run, expected] of table) {
    notice.textContent = '';
    const errors = [];
    const log = console.error;
    console.error = (...a) => errors.push(a);
    try {
      assert.equal(await run(), expected, `${name} resolves`);
    } finally { console.error = log; }
    assert.equal(notice.textContent, '', `${name}: nothing said`);
    assert.deepEqual(errors, [], `${name}: nothing logged as an error`);
  }
});
