// The upgrade on a device already in use: boards.json once named the
// family's people, and the device stored only what it changed about them.
// Now boards.json names no one, so on start (state.js adoptStoredPeople)
// each of them with stored data becomes a person added in the app, and is
// written back to the "people" store.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, adoptStoredPeople } from '../web/state.js';
import { db } from '../web/store.js';
import { mergePeople } from '../web/model.js';
import { isFunName } from '../web/names.js';

globalThis.document ??= { querySelector: () => ({ textContent: '', hidden: true }) };

// An open database that keeps what is written to it, store by store.
function memoryDatabase() {
  const stores = new Map();
  const store = (name) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  return {
    stores,
    transaction: (name) => ({
      set oncomplete(fn) { queueMicrotask(fn); },
      objectStore: () => ({
        put: (v) => { store(name).set(v.id ?? v.personId ?? v.key, v); return {}; },
        delete: (id) => { store(name).delete(id); return {}; },
      }),
    }),
  };
}

test('people an older boards.json named keep their sounds: they become added people, stored', async () => {
  const handle = memoryDatabase();
  db.handle = handle;
  state.manifest = { people: [], kit: [{ id: 'kick' }] };
  state.peopleEdits = new Map([
    ['old-a', { id: 'old-a', name: 'Rocket' }],
    ['old-b', { id: 'old-b', hidden: true }],
    ['p-me-1', { id: 'p-me-1', name: 'Me', color: '#1F3FA8', added: true, created: 9 }],
  ]);
  state.userClips = [{ id: 'user-1', personId: 'old-a' }, { id: 'user-2', personId: 'old-c' }];
  state.overrides = new Map([['old-d-kick', { id: 'old-d-kick', label: 'Thump' }]]);
  state.orders = new Map();
  state.patterns = new Map();
  state.savedBeats = [{ id: 'beat-1', personId: 'old-c' }];
  state.decks = new Map();
  state.takes = [];
  state.songs = new Map();
  state.songbook = [];

  assert.equal(await adoptStoredPeople(), 3);
  const shown = mergePeople([], state.peopleEdits, { kit: state.manifest.kit });
  assert.equal(shown[0].name, 'Rocket');
  assert.ok(shown.slice(1, 3).every((p) => isFunName(p.name) && p.avatar), 'fun names and pictures, never "Player 1"');
  assert.equal(shown[3].name, 'Me');
  assert.deepEqual(shown.map((p) => p.id), ['old-a', 'old-c', 'old-d', 'p-me-1'], 'the same ids, so their sounds and beats still point at them');
  assert.deepEqual([...handle.stores.get('people').keys()], ['old-a', 'old-c', 'old-d'], 'written to storage');
  assert.ok([...handle.stores.get('people').values()].every((p) => p.added === true && p.name && p.color));
  assert.equal(state.peopleEdits.has('old-b'), false, 'a bare deleted record is cleared away');

  // The next start finds nothing more to do.
  assert.equal(await adoptStoredPeople(), 0);
  db.handle = null;
});
