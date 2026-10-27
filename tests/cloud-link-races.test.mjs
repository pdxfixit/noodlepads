// A person's cloud link (cloud.js) is written by more than one thing: a sync
// that is running, the PIN opening them, 🔑 Remember and Forget. Each writes
// its own fields on top of the link as it is when the write happens, never on
// top of a copy it read before it waited, so a choice made meanwhile is not
// undone. The real app with a stand-in IndexedDB, against the real Worker and
// a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';

let page;
let cloud;
let setPersonEdit;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
// When set, the answer to a request whose path has this text waits for the
// gate to open (after the Worker has answered it).
let hold = null;
const gate = () => { let open; const wait = new Promise((r) => { open = r; }); return { wait, open }; };

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();
  page = installPage();
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('/api/')) return pageFetch(url, init);
    const res = await worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN }, duplex: 'half' }), env);
    if (hold && String(url).includes(hold.path)) { const mine = hold; hold = null; mine.reached(); await mine.gate.wait; }
    return res;
  };
  await (await import('../web/app.js')).ready;
  ({ setPersonEdit } = await import('../web/state.js'));
  cloud = await import('../web/cloud.js');
  await page.settle();
});

const PIN = '2468';
async function personInCloud(id) {
  await setPersonEdit(id, { id, name: 'Sir Squid', fun: true, avatar: '🐙', color: '#0C5E4B', added: true, created: 1 });
  await cloud.goUp(id, PIN);
  await page.settle();
  assert.ok(cloud.keyOf(id), 'in the cloud');
}
// Holds the next answer to a request on `path` until the returned `open` is called.
function holdNext(path) {
  const g = gate();
  const reached = new Promise((r) => { hold = { path, gate: g, reached: r }; });
  return { reached, open: g.open };
}

test('a sync that finishes after a choice made while it ran keeps the choice (Not now, then Forget this device)', async () => {
  const id = 'p-mid-sync';
  await personInCloud(id);
  const g = holdNext('/records?');
  const run = cloud.syncNow(id);
  await g.reached;
  await cloud.declineRemember(id);
  g.open();
  await run;
  assert.equal(cloud.linkOf(id).noOffer, true, 'Not now stays said');

  await cloud.rememberHere(id, PIN);
  assert.equal(cloud.linkOf(id).remembered, true);
  const h = holdNext('/records?');
  const second = cloud.syncNow(id);
  await h.reached;
  await cloud.forgetHere(id);
  assert.equal(cloud.linkOf(id).remembered, undefined, 'forgotten while it ran');
  h.open();
  await second;
  const link = cloud.linkOf(id);
  assert.equal(link.remembered, undefined, 'a sync does not make them remembered again');
  assert.equal(link.key, null, 'and a key this device forgot does not come back');
  assert.equal(link.pin, true);
});

test('PIN open and 🔑 Remember write their own fields on the link as it is after they wait, not as it was before', async () => {
  const id = 'p-mid-open';
  await personInCloud(id);
  const g = holdNext('/open');
  const opening = cloud.unlock(id, PIN);
  await g.reached;
  await cloud.restoreLink({ ...cloud.linkOf(id), rev: 7, noOffer: true });
  g.open();
  await opening;
  assert.equal(cloud.linkOf(id).rev, 7, 'a change made while the cloud answered stays (open)');
  assert.equal(cloud.linkOf(id).noOffer, true);
  await page.settle();   // the sync an open starts

  const h = holdNext('/open');
  const remembering = cloud.rememberHere(id, PIN);
  await h.reached;
  await cloud.restoreLink({ ...cloud.linkOf(id), rev: 9 });
  h.open();
  await remembering;
  assert.equal(cloud.linkOf(id).rev, 9, 'a change made while the cloud answered stays (remember)');
  assert.equal(cloud.linkOf(id).remembered, true);
});
