// The cloud's minute limit (worker/cloud.js slowDown, 429 'slow') on the real
// app: a sync it stops says "Busy right now: trying again in a minute." and
// comes back by itself a minute later (sync-timing.js slow), never the daily
// caps' "busy today, try tomorrow". The stand-in page with a stand-in
// IndexedDB, against the real Worker and a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';

let page;
let state;
let cloud;
let setPersonEdit;
let persist;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
// When set, the Worker's push limiter refuses every push.
let limited = false;

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();
  env.PUSH_LIMITER = { limit: async () => ({ success: !limited }) };
  page = installPage();
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('/api/')) {
      return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN }, duplex: 'half' }), env);
    }
    return pageFetch(url, init);
  };
  await (await import('../web/app.js')).ready;
  ({ state, setPersonEdit, persist } = await import('../web/state.js'));
  cloud = await import('../web/cloud.js');
  await page.settle();
});

test('a sync the minute limit stops says busy right now, and is due again in a minute', async () => {
  const id = 'p-slowpoke';
  await setPersonEdit(id, { name: 'Sir Squid', fun: true, avatar: '🐙', color: '#0C5E4B', added: true, created: 1 });
  const beat = (n) => ({ id: `beat-${id}-${n}`, personId: id, name: 'Wobbly Taco', bpm: 100, bars: 1, rows: [{ clipId: `${id}-kick`, steps: [1, 0, 0, 0] }], created: n, saved: n });
  const add = async (n) => { const b = beat(n); state.savedBeats = [...state.savedBeats, b]; await persist('beats', structuredClone(b)); };
  await add(1);
  await cloud.syncAll();
  await page.settle();
  assert.ok(cloud.keyOf(id), 'in the cloud');
  assert.notEqual(cloud.statusOf(id)?.state, 'trouble', JSON.stringify(cloud.statusOf(id)));
  limited = true;
  await add(2);
  await cloud.syncNow(id);
  const { state: shown, text } = cloud.statusOf(id);
  assert.deepEqual({ shown, text }, { shown: 'trouble', text: 'Busy right now: trying again in a minute.' });
  assert.doesNotMatch(cloud.statusOf(id).text, /tomorrow/);
  assert.equal(cloud.syncPending().slow, true, 'the sync comes back by itself');
  limited = false;
  await cloud.syncNow(id);
  assert.notEqual(cloud.statusOf(id)?.state, 'trouble', 'once the minute is up it goes');
});
