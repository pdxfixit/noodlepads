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
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const ID = 'p-edits-1';   // in the cloud, no PIN
let key;
let hold = null;          // while set, a pull waits for it
let pulls = 0;
const call = async (path, body, auth) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body),
}), env)).json();
const beat = (id) => ({ id, personId: ID, name: 'Wobbly Taco', bpm: 100, bars: 1, swing: 0, rows: [{ clipId: `${ID}-kick`, steps: [1, 0, 0, 0] }], created: 2, saved: 2 });

before(async () => {
  console.error = () => {};
  ({ key } = await call('profiles', { id: ID, name: 'Admiral Acorn', avatar: '', color: '#304A00' }));
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [{ id: ID, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#304A00', added: true, created: 1 }],
    cloud: [{ id: ID, key, rev: 0, sent: {}, sounds: {} }],
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
  await page.settle();
  await cloud.syncAll();
});

test("a sync's own writes (what it pulled) do not schedule another sync", async () => {
  await call(`profiles/${ID}/records`, { put: [{ kind: 'beats', id: 'beat-there', body: beat('beat-there') }], del: [] }, key);
  await cloud.syncAll();
  const { state } = await import('../web/state.js');
  assert.ok(state.savedBeats.some((b) => b.id === 'beat-there'), 'the pull stored the other device\'s beat');
  assert.equal(cloud.syncWaiting().dirty, false, 'nothing waits: storing the pull was not a change');
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
  await db.put('beats', beat('beat-here'));   // a kid saves a beat meanwhile
  hold = null;
  release();
  await run;
  const waiting = cloud.syncWaiting();
  assert.equal(waiting.dirty, true, 'the change waits for its sync');
  assert.equal(waiting.change, true, 'in SYNC_DELAY_MS, or at once on hide');
  await cloud.syncAll();   // let it go now, so no timer outlives the test
});
