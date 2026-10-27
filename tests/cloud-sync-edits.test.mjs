// A change made while a sync runs (its network waits can take seconds, more
// with sounds to upload) still schedules the next sync, as any change does
// (sync-timing.js: 20 s after it, or at once when the page hides). Only the
// sync's own writes, storing what it pulled, are not changes, or every sync
// would start another. The real app with a stand-in IndexedDB, against the
// real Worker and a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let cloud;
let db;
let state;
let persist;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const ID = 'p-edits-1';   // in the cloud, its PIN remembered here
let key;
let hold = null;          // while set, a pull waits for it
let pulls = 0;
const call = async (path, body, auth) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body),
}), env)).json();
const beat = (id) => ({ id, personId: ID, name: `Taco ${id.slice(5)}`, bpm: 100, bars: 1, swing: 0, rows: [{ clipId: `${ID}-kick`, steps: [1, 0, 0, 0] }], created: 2, saved: 2 });

before(async () => {
  console.error = () => {};
  ({ key } = await call('profiles', { id: ID, name: 'Admiral Acorn', avatar: '', color: '#304A00', pin: '2468' }));
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [{ id: ID, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#304A00', added: true, created: 1 }],
    cloud: [{ id: ID, key, rev: 0, sent: {}, sounds: {}, pin: true, remembered: true }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('/api/')) return pageFetch(url, init);
    if (/\/records\?since=/.test(url)) { pulls++; if (hold) await hold; }
    return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env);
  };
  await (await import('../web/app.js')).ready;
  cloud = await import('../web/cloud.js');
  ({ db } = await import('../web/store.js'));
  ({ state, persist } = await import('../web/state.js'));
  await page.settle();
  await cloud.syncAll();
});

test("a sync's own writes (what it pulled) do not schedule another sync", async () => {
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-there', body: beat('beat-there') }], del: [] }, key);
  await cloud.syncAll();
  assert.ok(state.savedBeats.some((b) => b.id === 'beat-there'), 'the pull stored the other device\'s beat');
  assert.equal(cloud.syncWaiting().dirty, false, 'nothing waits: storing the pull was not a change');
});

// A kid's edit here, as the app makes one (state.js persist stamps it).
const editHere = async (id, change) => {
  const b = state.savedBeats.find((x) => x.id === id);
  Object.assign(b, change);
  await persist('beats', b);
};
const sentInCloud = (id) => env.DB.rows("SELECT body FROM records WHERE kind = 'beats' AND id = ? AND deleted = 0", id).map((r) => JSON.parse(r.body));

test('a take, a delete, a pulled setting and a merged beat leave nothing waiting', async () => {
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-gone', body: beat('beat-gone') }, { kind: 'beats', id: 'beat-both', body: beat('beat-both') }], del: [] }, key);
  await cloud.syncAll();
  await editHere('beat-both', { name: 'Turbo Taco' });   // this device's half of a merge
  await call(`profiles/${ID}/records`, {
    put: [
      { kind: 'beats', id: 'beat-there', body: { ...beat('beat-there'), bpm: 140 } },             // a take
      { kind: 'beats', id: 'beat-both', body: { ...beat('beat-both'), bpm: 90 } },                // the other half
      { kind: 'prefs', id: ID, body: { personId: ID, values: { padSize: 0.5 } } },                // a setting
    ],
    del: [{ kind: 'beats', id: 'beat-gone' }],                                                    // a delete
  }, key);
  const report = await cloud.syncNow(ID);
  assert.equal(report.merged, 1);
  assert.equal(state.savedBeats.find((b) => b.id === 'beat-there').bpm, 140);
  assert.ok(!state.savedBeats.some((b) => b.id === 'beat-gone'));
  assert.equal(state.prefs.get(ID)?.values.padSize, 0.5);
  const both = state.savedBeats.find((b) => b.id === 'beat-both');
  assert.deepEqual([both.name, both.bpm], ['Turbo Taco', 90]);
  await cloud.syncAll();   // clears the wait the edit above made
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-there', body: { ...beat('beat-there'), bpm: 150 } }], del: [] }, key);
  await cloud.syncNow(ID);
  assert.equal(cloud.syncWaiting().dirty, false, 'its own writes are not changes');
});

// Runs `sync` with `during()` called once, just as the IndexedDB write of
// record `id` (in `store`) starts; `fail` makes that write throw instead.
async function withWrite(store, id, during, sync, { fail = false } = {}) {
  const put = db.put.bind(db);
  let hit = false;
  db.put = async (s, record) => {
    if (!hit && s === store && record?.id === id) {
      hit = true;
      await during();
      if (fail) throw new Error('QuotaExceededError: a full device');
    }
    return put(s, record);
  };
  try {
    await sync();
  } finally {
    db.put = put;
  }
  assert.ok(hit, `the sync wrote ${store} ${id}`);
}
const setPrefs = async (values) => {
  const record = { personId: ID, values };
  state.prefs.set(ID, record);
  await persist('prefs', record);
};

// The kid's edit here is to the same store as the sync's own write, so the
// test can't tell which of the two onChange calls was skipped: either way one
// counts. The next test edits another store.
test('an edit made while the sync stores what it pulled still schedules the next sync', async () => {
  await cloud.syncAll();
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-there', body: { ...beat('beat-there'), bpm: 160 } }], del: [] }, key);
  await withWrite('beats', 'beat-there', () => editHere('beat-both', { name: 'Mid Taco' }), () => cloud.syncNow(ID));
  assert.equal(cloud.syncWaiting().dirty, true, 'the edit waits for its sync');
  await cloud.syncAll();
  assert.equal(sentInCloud('beat-both')[0]?.name, 'Mid Taco');
});

test("a setting changed while the sync takes a beat schedules the next sync: only the beat's own write is skipped", async () => {
  await cloud.syncAll();
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-there', body: { ...beat('beat-there'), bpm: 170 } }], del: [] }, key);
  await withWrite('beats', 'beat-there', () => setPrefs({ padSize: 0.25 }), () => cloud.syncNow(ID));
  assert.equal(cloud.syncWaiting().dirty, true, 'the setting waits for its sync');
  await cloud.syncAll();
  assert.equal(JSON.parse(env.DB.rows("SELECT body FROM records WHERE kind = 'prefs'")[0].body).values.padSize, 0.25);
});

test("a sync write that fails leaves nothing expected, so the kid's next edit still schedules a sync", async () => {
  await cloud.syncAll();
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-there', body: { ...beat('beat-there'), bpm: 180 } }], del: [] }, key);
  await withWrite('beats', 'beat-there', async () => {}, () => cloud.syncNow(ID), { fail: true });
  assert.equal(cloud.statusOf(ID)?.state, 'trouble', 'the sync stopped on the write');
  await cloud.syncAll();   // nothing waiting (it syncs again, and takes the beat)
  assert.equal(cloud.syncWaiting().dirty, false);
  await editHere('beat-both', { name: 'After Taco' });
  assert.equal(cloud.syncWaiting().dirty, true, 'the edit after the failed write counts');
  await cloud.syncAll();
});

test("a kid's edit heard while a failing sync write is under way never leaves later edits skipped", async () => {
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-two', body: beat('beat-two') }], del: [] }, key);
  await cloud.syncAll();
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-two', body: { ...beat('beat-two'), bpm: 190 } }], del: [] }, key);
  // The kid's edit to the same store lands between the write's start and its throw.
  await withWrite('beats', 'beat-two', () => editHere('beat-both', { name: 'Between Taco' }), () => cloud.syncNow(ID), { fail: true });
  await cloud.syncAll();
  assert.equal(cloud.syncWaiting().dirty, false);
  await editHere('beat-both', { name: 'Later Taco' });
  assert.equal(cloud.syncWaiting().dirty, true, 'a later edit still counts');
  await editHere('beat-both', { name: 'Later Still Taco' });
  await cloud.syncAll();
  assert.equal(sentInCloud('beat-both')[0]?.name, 'Later Still Taco');
});

// By design: the merge (storeLoaded, for a record new here or a clash kept as
// two) is skipped whole, so an edit landing while it writes waits for the
// next trigger (focus, blur, the 5-minute tick, or the next change).
test('an edit made while the sync merges a new record waits for the next trigger (the merge is skipped whole)', async () => {
  await cloud.syncAll();
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-new', body: beat('beat-new') }], del: [] }, key);
  await withWrite('beats', 'beat-new', () => editHere('beat-both', { name: 'Merge Taco' }), () => cloud.syncNow(ID));
  assert.equal(cloud.syncWaiting().dirty, false, 'skipped with the merge');
  await cloud.syncAll();
  assert.equal(sentInCloud('beat-both')[0]?.name, 'Merge Taco', 'the next sync still sends it');
});

test('a change made while a sync runs schedules the next sync', async () => {
  await cloud.syncAll();   // nothing waiting
  assert.equal(cloud.syncWaiting().dirty, false);
  let release;
  hold = new Promise((r) => { release = r; });
  const before = pulls;
  const run = cloud.syncNow(ID);
  for (let i = 0; i < 200 && pulls === before; i++) await new Promise((r) => setImmediate(r));
  assert.equal(pulls, before + 1, 'the sync is waiting on its pull');
  // A kid saves a beat meanwhile, as the app does.
  state.savedBeats.push(beat('beat-here'));
  await persist('beats', state.savedBeats.at(-1));
  hold = null;
  release();
  await run;
  assert.equal(sentInCloud('beat-here').length, 1, 'the same sync pushed it');
  const waiting = cloud.syncWaiting();
  assert.equal(waiting.dirty, true, 'the change waits for its sync');
  assert.equal(waiting.change, true, 'in SYNC_DELAY_MS, or at once on hide');
  await cloud.syncAll();   // the one extra sync
  const again = await cloud.syncNow(ID);
  assert.deepEqual([again.pulled, again.pushed], [0, 0], 'settled after one extra sync');
  assert.equal(cloud.syncWaiting().dirty, false);
});
