// What a backup holds, in words (web/old-backup.js holdsWords), and the
// full export of what an older copy left (makeEverything):
// the app's part loads as a backup; every other database, Blob and
// localStorage key comes along under everything/, byte for byte.
// Not tested: a real browser's IndexedDB (the stand-in below plays it).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionFor as oldExt, plural, sizeWords, holdings, holdsWords, otherCount, makeEverything, readEverything, everythingName } from '../web/old-backup.js';
import { readBackup } from '../web/backup.js';
import { unzip } from '../web/zip.js';
import { extensionFor } from '../web/util.js';

const bytes = (n, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) % 256);
const blob = (n, type = 'audio/webm', seed = 1) => new Blob([bytes(n, seed)], { type });

test('the export names audio files the way the app does', () => {
  for (const m of ['audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', '', 'x/y']) assert.equal(oldExt(m), extensionFor(m), m);
});

test('one, many, and people', () => {
  assert.equal(plural(1, 'sound'), '1 sound');
  assert.equal(plural(2, 'sound'), '2 sounds');
  assert.equal(plural(0, 'beat'), '0 beats');
  assert.equal(plural(1, 'person'), '1 person');
  assert.equal(plural(3, 'person'), '3 people');
  assert.equal(plural(2, 'DJ key set'), '2 DJ key sets');
});

test('sizes read as KB below a megabyte, MB with one place below 10, whole MB above', () => {
  assert.equal(sizeWords(0), '0 KB');
  assert.equal(sizeWords(10), '1 KB', 'anything at all is at least 1 KB');
  assert.equal(sizeWords(800 * 1024), '800 KB');
  assert.equal(sizeWords(1048576), '1 MB');
  assert.equal(sizeWords(1.44 * 1048576), '1.4 MB');
  assert.equal(sizeWords(12.4 * 1048576), '12 MB');
});

test('the words name every kind there is, leave out kinds with none, and say "nothing yet" for none', () => {
  const stores = {
    clips: Array.from({ length: 27 }, () => ({ blob: { size: 12 * 1048576 / 27 } })),
    beats: [{}, {}, {}, {}],
    songbook: [{ id: 'song-a' }],
    songs: [{ id: 'song-a', personId: 'me' }],   // the open copy of a saved song: one song
    takes: [{}],
    people: [{}, {}],
    settings: [{ key: 'advancedBeats', value: true }],
    orders: [{}], patterns: [{}],
  };
  assert.equal(holdsWords(stores), '🔊 27 sounds · 🥁 4 beats · 🎼 1 song · 🎬 1 take · 👥 2 people · 12 MB of audio');
  assert.equal(holdsWords({ clips: [{}], overrides: [{}, {}], decks: [{}] }), '🔊 1 sound · ✏️ 2 sound edits · 🎛️ 1 DJ key set');
  assert.equal(holdsWords({ voices: [{}, {}], layouts: [{}], touchLayouts: [{}, {}] }), '⭐ 2 voices · ⌨️ 1 key layout · 👆 2 touch layouts', 'a backup carries them too');
  assert.equal(holdsWords({ songs: [{ personId: 'me' }] }), '🎼 1 song', 'an old open song with no id counts');
  assert.equal(holdsWords({ settings: [{}], orders: [{}] }), 'nothing yet');
  assert.equal(holdsWords({}), 'nothing yet');
  assert.equal(holdsWords(null), 'nothing yet');
  assert.equal(holdsWords({ beats: [{}] }, 5), '🥁 1 beat · 5 other saved things');
  assert.equal(holdsWords({}, 1), '1 other saved thing');
  assert.equal(holdings({ clips: [{ blob: blob(300) }, {}] }).audio, 300, 'a sound with no audio adds nothing');
});

// A browser as an older copy left it: the app's database, another
// database whose records hold Blobs and raw bytes under keys of their own,
// and localStorage.
const everything = () => ({
  databases: [
    { name: 'some-app', version: 3, keys: {}, stores: {
      clips: [{ id: 'user-a1-aaaa', personId: 'pip', label: 'Burp', mime: 'audio/webm', blob: blob(500), created: 1 }],
      people: [], overrides: [{ id: 'pip-airhorn', label: 'Toot' }], beats: [{ id: 'beat-1', personId: 'pip', name: 'Boom', bpm: 90, rows: [] }],
    } },
    { name: 'other thing/v2', version: 1, keys: { notes: ['k1', 'k2'] }, stores: {
      notes: [{ text: 'hi', pic: blob(40, 'image/png', 3) }, { raw: bytes(9, 5), tags: new Set(['a']) }],
      empty: [],
    } },
  ],
  localStorage: { 'noodle.mode': 'dj', theme: 'dark' },
});

test('the full export: the app\'s part loads as a backup, and everything else comes along byte for byte', async () => {
  const all = everything();
  assert.equal(otherCount(all, 'some-app'), 4, '2 records in the other database, 2 localStorage keys');
  assert.equal(holdsWords(all.databases[0].stores, otherCount(all, 'some-app')), '🔊 1 sound · 🥁 1 beat · ✏️ 1 sound edit · 1 KB of audio · 4 other saved things');
  const zipBlob = await makeEverything(all, 'some-app', new Date('2026-10-11T12:00:00Z'));
  const entries = await unzip(zipBlob);
  const doc = JSON.parse(new TextDecoder().decode(entries.get('backup.json')));
  assert.deepEqual([doc.app, doc.format], ['noodlepads', 1]);
  assert.deepEqual([...entries.get('sounds/user-a1-aaaa.webm')], [...bytes(500)]);

  const read = (name) => JSON.parse(new TextDecoder().decode(entries.get(name)));
  const index = read('everything/index.json');
  assert.equal(index.databases.length, 1, 'the app\'s database is in backup.json, not twice');
  const notes = read(index.databases[0].stores.find((s) => s.name === 'notes').file);
  assert.equal(notes.database, 'other thing/v2');
  assert.deepEqual(notes.keys, ['k1', 'k2'], 'keys kept for records that don\'t hold their own');
  assert.equal(notes.records[0].text, 'hi');
  assert.deepEqual([...entries.get(notes.records[0].pic.$blob)], [...bytes(40, 3)], 'a Blob, byte for byte');
  assert.equal(notes.records[0].pic.type, 'image/png');
  assert.deepEqual([...entries.get(notes.records[1].raw.$bytes)], [...bytes(9, 5)], 'raw bytes, byte for byte');
  assert.deepEqual(notes.records[1].tags, { $set: ['a'] });
  assert.ok(index.databases[0].stores.some((s) => s.name === 'empty'), 'an empty store is listed too');
  assert.deepEqual(read('everything/localStorage.json'), { 'noodle.mode': 'dj', theme: 'dark' });

  const here = { peopleIds: new Set(), clipIds: new Set(), kitIds: new Set(['airhorn']), addedPeopleIds: new Set() };
  const out = await readBackup(zipBlob, here);
  assert.deepEqual(out.clips.map((c) => c.id), ['user-a1-aaaa'], 'today\'s app loads it, and ignores everything/');
  assert.deepEqual(out.beats.map((b) => b.id), ['beat-1']);
  assert.equal(everythingName(new Date(2026, 9, 1)), 'noodlepads-everything-2026-10-01.zip');
});

test('with no app database at all, the export still has a backup.json and keeps the rest', async () => {
  const all = { databases: [everything().databases[1]], localStorage: {} };
  const entries = await unzip(await makeEverything(all, null));
  assert.ok(entries.has('backup.json'));
  assert.ok([...entries.keys()].some((k) => k.endsWith('/notes.json')));
});

test('readEverything reads every database and every store, only ever read, and localStorage', async () => {
  const opened = [];
  const request = (fire) => { const req = {}; queueMicrotask(() => fire(req)); return req; };
  const answer = (value) => request((req) => { req.result = value; req.onsuccess?.(); });
  const dbs = {
    'app-db': { version: 9, stores: { clips: { keyPath: 'id', rows: [{ id: 'user-1' }] } } },
    'skip-me': { version: 1, stores: { a: { keyPath: 'id', rows: [{ id: 1 }] } } },
    other: { version: 2, stores: { kv: { keyPath: null, rows: ['x', 'y'], keys: ['a', 'b'] } } },
  };
  const saved = globalThis.indexedDB;
  const savedLS = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.indexedDB = {
    databases: async () => Object.keys(dbs).map((name) => ({ name })),
    open: (name) => request((req) => {
      const d = dbs[name];
      req.result = {
        version: d.version, objectStoreNames: Object.keys(d.stores), close() {},
        transaction: (names, mode) => {
          opened.push(mode);
          return { objectStore: (n) => ({ keyPath: d.stores[n].keyPath, getAll: () => answer(d.stores[n].rows), getAllKeys: () => answer(d.stores[n].keys) }) };
        },
      };
      req.onsuccess?.();
    }),
  };
  const ls = { a: '1', b: '2' };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
    value: { get length() { return Object.keys(ls).length; }, key: (i) => Object.keys(ls)[i] ?? null, getItem: (k) => ls[k] ?? null } });
  try {
    const all = await readEverything({ skip: ['skip-me'] });
    assert.deepEqual(all.databases.map((d) => d.name), ['app-db', 'other']);
    assert.deepEqual(all.databases[1].stores.kv, ['x', 'y']);
    assert.deepEqual(all.databases[1].keys.kv, ['a', 'b']);
    assert.equal(all.databases[0].keys.clips, undefined, 'records holding their own key need no key list');
    assert.deepEqual(all.localStorage, { a: '1', b: '2' });
    assert.ok(opened.every((m) => m === 'readonly'));
  } finally {
    globalThis.indexedDB = saved;
    if (savedLS) Object.defineProperty(globalThis, 'localStorage', savedLS); else delete globalThis.localStorage;
  }
});
