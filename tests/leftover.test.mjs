// ⚙️ Settings → "Older sounds found on this device" (web/leftover.js): a
// database an older copy of the app saved on this same address, under the
// old name. Tested: finding it by its stores, the backup of it (byte for
// byte, loaded back through readBackup), and the whole section on a
// stand-in page with a stand-in IndexedDB. Not tested: a real browser's
// indexedDB.databases() and IndexedDB.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { pickOldDatabase, hasData } from '../web/leftover.js';
import { makeOldBackup } from '../web/old-backup.js';
import { readBackup } from '../web/backup.js';
import { unzip } from '../web/zip.js';

const audio = (n, type = 'audio/webm') => new Blob([Uint8Array.from({ length: n }, (_, i) => (i * 13 + n) % 256)], { type });
const OLD = 'older-copy';   // the old name is not written in the repo; any name works

// The stores as an older copy left them: a person from the old boards.json
// with no record, a person added in the app, sounds with and without a type.
const oldStores = () => ({
  people: [{ id: 'p-x1-ab12', name: 'Rocket', color: '#0C5E4B', added: true, created: 3 }],
  clips: [
    { id: 'user-x1-aaaa', personId: 'zed', label: 'Burp', mime: 'audio/webm;codecs=opus', blob: audio(300, 'audio/webm;codecs=opus'), created: 1 },
    { id: 'user-x2-bbbb', personId: 'p-x1-ab12', label: 'Laugh', mime: 'audio/mp4', blob: audio(400, 'audio/mp4'), created: 2, voice: 'chipmunk', amount: 2 },
    { id: 'user-x3-cccc', personId: 'zed', label: 'Picked file', mime: '', blob: audio(500, ''), created: 3 },
  ],
  overrides: [{ id: 'zed-airhorn', label: 'Toot' }],
  orders: [], patterns: [],
  beats: [{ id: 'beat-x1', personId: 'zed', name: 'Boom', bpm: 100, rows: [{ clipId: 'user-x1-aaaa', steps: [true] }] }],
  settings: [{ key: 'sendLogs', value: true }],
});

test('the older database is found by its stores, whatever its version; never the app\'s own', () => {
  assert.equal(pickOldDatabase([{ name: 'noodle-pads', stores: ['clips', 'people', 'overrides'] }]), null);
  assert.equal(pickOldDatabase([{ name: 'other-app', stores: ['things'] }, { name: OLD, stores: ['clips', 'overrides'] }]), OLD, 'version 1 had only clips and overrides');
  assert.equal(pickOldDatabase([{ name: OLD, stores: ['clips', 'overrides', 'orders', 'patterns', 'beats', 'people'] }]), OLD, 'version 5');
  assert.equal(pickOldDatabase([{ name: 'x', stores: ['clips'] }]), null);
  assert.equal(pickOldDatabase([]), null);
  assert.equal(hasData({ settings: [{ key: 'a', value: 1 }], clips: [] }), false);
  assert.equal(hasData({ clips: [{}] }), true);
  assert.equal(hasData(null), false);
});

test('the backup of them holds every store and every sound byte for byte, and loads back', async () => {
  const stores = oldStores();
  const zip = await makeOldBackup(stores);
  const entries = await unzip(zip);
  const doc = JSON.parse(new TextDecoder().decode(entries.get('backup.json')));
  assert.deepEqual([doc.app, doc.format], ['noodlepads', 1]);
  for (const name of Object.keys(stores)) assert.equal(doc[name].length, stores[name].length, name);
  for (const c of stores.clips) {
    const meta = doc.clips.find((x) => x.id === c.id);
    assert.deepEqual(entries.get(meta.file), new Uint8Array(await c.blob.arrayBuffer()), `${c.label}'s audio`);
  }
  const here = { peopleIds: new Set(), clipIds: new Set(), kitIds: new Set(['kick']), addedPeopleIds: new Set() };
  const out = await readBackup(zip, here);
  assert.deepEqual(out.clips.map((c) => c.id), stores.clips.map((c) => c.id), 'every sound loads');
  assert.equal(out.clips[2].mime, 'audio/x-unknown', 'a sound saved with no type keeps its audio');
  assert.deepEqual(out.people.map((p) => p.id).sort(), ['p-x1-ab12', 'zed']);
});

// ── the section, on a stand-in page ──

// A stand-in indexedDB: the older database holds `stores`; the app's own
// database never opens (the page runs without storage, as in other tests).
function fakeIndexedDB(stores) {
  const opened = [];
  const request = (fire) => {
    const req = {};
    queueMicrotask(() => fire(req));
    return req;
  };
  const database = {
    objectStoreNames: Object.keys(stores),
    close() {},
    transaction: (names, mode) => {
      opened.push(mode);
      return {
        objectStore: (n) => ({
          getAll: () => request((req) => { req.result = stores[n]; req.onsuccess?.(); }),
        }),
      };
    },
  };
  return {
    opened,
    databases: async () => [{ name: 'noodle-pads', version: 10 }, { name: OLD, version: 9 }],
    open: (name) => request((req) => {
      if (name === OLD) { req.result = database; req.onsuccess?.(); } else { req.error = new Error('no storage here'); req.onerror?.(); }
    }),
    deleteDatabase: () => { throw new Error('the older database is never deleted'); },
  };
}

let page;
let fake;
let db;
let state;

before(async () => {
  console.error = () => {};
  fake = fakeIndexedDB(oldStores());
  globalThis.indexedDB = fake;
  page = installPage();
  ({ db } = await import('../web/store.js'));
  ({ state } = await import('../web/state.js'));
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('Settings shows the older sounds, brings them in with a backup\'s checks, and never changes the older database', async () => {
  const section = page.$('#set-older');
  assert.equal(section.hidden, false);
  assert.match(page.$('#older-what').textContent, /left these in this browser: 🔊 3 sounds · 🥁 1 beat · 👥 1 person · ✏️ 1 sound edit · 1 KB of audio( · \d+ other saved things?)?\./);

  // Bring them in, into a database that keeps what is written.
  const written = new Map();
  db.handle = {
    close() {},
    transaction: (name) => ({
      set oncomplete(fn) { queueMicrotask(fn); },
      objectStore: () => ({
        put: (v) => { if (!written.has(name)) written.set(name, new Map()); written.get(name).set(v.id ?? v.personId ?? v.key, v); return {}; },
        delete: () => ({}),
        getAll: () => ({ result: [...(written.get(name)?.values() ?? [])] }),
      }),
    }),
  };
  page.$('#older-bring').click();
  await page.settle();
  assert.deepEqual([...written.get('clips').keys()].sort(), ['user-x1-aaaa', 'user-x2-bbbb', 'user-x3-cccc']);
  // The old boards.json person comes as an added person, with a random id
  // instead of the plain one (state.js reIdIncoming); their kit edit follows.
  const zed = [...written.get('people').values()].find((p) => p.added && !p.solo && p.id !== 'p-x1-ab12');
  assert.match(zed.id, /^p-/);
  assert.equal(written.get('people').has('zed'), false);
  assert.equal(written.get('overrides').get(`${zed.id}-airhorn`).label, 'Toot', 'the renamed starter is an edit of the Airhorn preset');
  assert.match(page.$('#notice').textContent, /^Older sounds brought in 🎉 Added 🔊 3 sounds, 🥁 1 beat, 👥 2 people\./);
  assert.ok(state.userClips.some((c) => c.id === 'user-x3-cccc'));
  assert.ok(fake.opened.every((mode) => mode === 'readonly'), 'only ever read');
  db.handle = null;
});

test('⚙️ Settings → Backups says what a backup would hold, worked out each time Settings opens', async () => {
  page.$('#settings-open').click();
  await page.settle();
  const said = page.$('#backup-holds').textContent;
  assert.match(said, /^A backup now holds 🔊 3 sounds · 🥁 1 beat · /, 'the sounds just brought in are counted');
  assert.match(said, / people · .*KB of audio\.$/);
  const [clips, beats] = [state.userClips, state.savedBeats];
  state.userClips = [];
  state.savedBeats = [];
  page.$('#settings-open').click();
  await page.settle();
  assert.doesNotMatch(page.$('#backup-holds').textContent, /sound ·|beat|audio/, 'kinds with none are left out');
  [state.userClips, state.savedBeats] = [clips, beats];
});
