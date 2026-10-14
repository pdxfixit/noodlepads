// Older sounds coming in (⚙️ Settings → Older sounds found on this device):
// readOldStores (leftover.js) checks an older copy's stores as a backup is
// checked, and storeLoaded (backup-ui.js) merges them, as it merges a
// backup. Tested against a stand-in page and database; a real IndexedDB
// needs a browser.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { isFunName } from '../web/names.js';
import { readOldStores, MAX_OLD_AUDIO_BYTES } from '../web/leftover.js';

let page;
let state;
let db;
let ui;
let stored;

// An open database that keeps what is written to it, store by store.
function memoryDatabase() {
  const stores = new Map();
  const store = (name) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  return {
    stores,
    close() {},
    transaction: (name) => ({
      set oncomplete(fn) { queueMicrotask(fn); },
      objectStore: () => ({
        put: (v) => { store(name).set(v.id ?? v.personId ?? v.key, v); return {}; },
        delete: (id) => { store(name).delete(id); return {}; },
        getAll: () => ({ result: [...store(name).values()] }),
      }),
    }),
  };
}

before(async () => {
  console.error = () => {};  // clips fail to load without audio; that is expected here
  page = installPage();   // the real boards.json: a new device
  ({ state } = await import('../web/state.js'));
  ({ db } = await import('../web/store.js'));
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ui = await import('../web/backup-ui.js');
});

const audio = (n = 3) => new Blob([new Uint8Array(n)], { type: 'audio/webm' });
const here = () => ({ peopleIds: new Set(), clipIds: new Set(), kitIds: new Set(['kick']), addedPeopleIds: new Set() });

// ── pure parts ──

test('readOldStores checks the stores like a backup, with the audio Blobs as they came', async () => {
  const blob = audio();
  const data = readOldStores({
      people: [{ id: 'p-a-1', name: 'Rocket', color: '#1F3FA8', added: true, created: 1 }],
      clips: [
        { id: 'user-a-1', personId: 'p-a-1', label: 'Burp', mime: 'audio/webm', blob, created: 2 },
        { id: 'user-a-2', personId: 'p-a-1', label: 'No audio', mime: 'audio/webm', created: 3 },
        { id: 'user-a-3', personId: 'p-a-1', label: 'Not audio', mime: 'text/html', blob, created: 4 },
      ],
      beats: [{ id: 'beat-a-1', personId: 'p-a-1', name: 'Groove', bpm: 100, rows: [] }],
      settings: [{ key: 'sendLogs', value: true }],
      mystery: [{ anything: 1 }],
  }, here());
  assert.deepEqual(data.people.map((p) => p.name), ['Rocket']);
  assert.deepEqual(data.clips.map((c) => c.id), ['user-a-1']);
  assert.equal(data.clips[0].blob.size, 3);
  assert.equal(data.clips[0].blob.type, 'audio/webm');
  assert.equal(data.beats.length, 1);
  assert.deepEqual(data.settings, [{ key: 'sendLogs', value: true }], 'the problem-report switch comes, as in backups (Q5)');
  assert.equal(data.skipped, 2, 'the two sounds with no audio');
});

test('readOldStores keeps people an older boards.json named, as added people, and open songs without an id', () => {
  const data = readOldStores({
    people: [{ id: 'old-a', name: 'Rocket' }, { id: 'old-b', hidden: true }],
    clips: [{ id: 'user-a-1', personId: 'old-c', mime: 'audio/webm', blob: audio() }],
    overrides: [{ id: 'old-a-kick', label: 'Thump' }],
    songs: [{ personId: 'old-a', name: 'Old Song', slots: [] }],
  }, here());
  assert.deepEqual(data.people.map((p) => [p.id, p.added]), [['old-a', true], ['old-c', true]]);
  assert.equal(data.people[0].name, 'Rocket');
  assert.ok(isFunName(data.people[1].name), 'a board with no name gets a fun one');
  assert.deepEqual(data.overrides.map((o) => o.id), ['old-a-kick']);
  assert.equal(data.clips[0].personId, 'old-c');
  assert.deepEqual(data.songs.map((s) => s.name), ['Old Song'], 'the app links it on open');
  assert.equal(data.skipped, 0);
});

test('readOldStores refuses anything that is not the stores, and caps the sounds in all', () => {
  for (const bad of [null, 'stores', 7, []]) {
    assert.throws(() => readOldStores(bad, here()), /wasn't Noodle Pads data/, JSON.stringify(bad));
  }
  const big = new Blob([new Uint8Array(20 * 1024 * 1024)], { type: 'audio/webm' });
  const clips = Array.from({ length: 16 }, (_, i) => ({ id: `user-big-${i}`, personId: 'p-a-1', mime: 'audio/webm', blob: big }));
  const data = readOldStores({ people: [{ id: 'p-a-1', name: 'A', added: true }], clips }, here(), { maxBytes: 300 * 1024 * 1024 });
  assert.equal(data.clips.length, 15, 'up to the cap');
  assert.equal(data.skipped, 1);
  assert.equal(data.left['clips:noAudio'], 1, 'and the notice says so');
  assert.ok(MAX_OLD_AUDIO_BYTES >= 1024 * 1024 * 1024, 'the real cap is far above what a kid could make');
});

// ── merged in, on a stand-in page ──

test('brought in: stored with random ids, the empty Me a new device made is gone', async () => {
  stored = memoryDatabase();
  db.handle = stored;
  const meBefore = [...state.peopleEdits.values()].find((p) => p.solo === true);
  assert.ok(meBefore, 'a new device started with its own first person');
  const data = readOldStores({
    people: [{ id: 'old-a', name: 'Rocket' }],
    clips: [{ id: 'user-a-1', personId: 'old-a', label: 'Burp', mime: 'audio/webm', blob: audio(), created: 1 }],
  }, ui.whatIsHere());
  const merged = await ui.storeLoaded(data);
  assert.deepEqual(merged.failed, []);
  assert.equal(merged.added.sounds, 1);
  assert.ok(stored.stores.get('clips').has('user-a-1'), 'the sound is stored');
  // The old plain id arrives as a random one (state.js reIdIncoming), and the sound follows.
  const rocket = [...stored.stores.get('people').values()].find((p) => p.name === 'Rocket');
  assert.match(rocket.id, /^p-/);
  assert.equal(stored.stores.get('clips').get('user-a-1').personId, rocket.id);
  assert.equal(stored.stores.get('people').has('old-a'), false, 'no record keeps the old id');
  assert.equal(state.peopleEdits.has(meBefore.id), false, 'the empty Me made on arrival is gone');
  assert.equal(page.$('#people').querySelector('.person-menu-btn').getAttribute('aria-label').startsWith('Whose sounds: Rocket'), true);
  db.handle = null;
});

test('one sound the browser won\'t save never stops the rest, and the notice names it', async () => {
  stored = memoryDatabase();
  const plain = stored.transaction;
  // This browser refuses to store one sound.
  stored.transaction = (name) => {
    const tx = plain(name);
    const store = tx.objectStore();
    return { ...tx, set oncomplete(fn) { queueMicrotask(fn); }, objectStore: () => ({ ...store, put: (v) => { if (v.id === 'user-f-2') throw new Error('UnknownError'); return store.put(v); } }) };
  };
  db.handle = stored;
  const data = readOldStores({
    people: [{ id: 'p-f-1', name: 'Fizz', added: true, created: 1 }],
    clips: ['One', 'Two', 'Three'].map((label, i) => ({ id: `user-f-${i + 1}`, personId: 'p-f-1', label, mime: 'audio/webm', blob: audio(5 + i), created: i })),
  }, ui.whatIsHere());
  const merged = await ui.storeLoaded(data);
  assert.ok(stored.stores.get('clips').has('user-f-1'));
  assert.ok(stored.stores.get('clips').has('user-f-3'), 'the sound after the refused one is stored');
  assert.equal(stored.stores.get('clips').has('user-f-2'), false);
  assert.equal(merged.added.sounds, 2);
  assert.match(ui.leftOut(data, merged), /This browser wouldn't save “Two”: try again\./);
  db.handle = null;
});
