// Leaving the cloud never loses work (docs/design/cloud-needs-pin.md, section
// 0): a sound pushed only from another device is brought here before the
// cloud copy is deleted, and when it can't be, nothing is deleted. The real
// app on the stand-in page with a stand-in IndexedDB, against the real Worker
// and a fake D1; "device B" pushes straight through the API.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';
import { uploadAudio } from '../web/cloud-sync.js';

let page;
let state;
let cloud;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const GOOD = 'p-leave-good';
const BAD = 'p-leave-bad';
const keys = {};
let failPull = false;
const deletes = [];   // DELETE /api/profiles/:id calls the page made
const inD1 = (id) => env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n === 1;
const sha = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');

before(async () => {
  console.error = () => {};
  const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });
  const call = async (path, body) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
  }), env)).json();
  for (const [id, name] of [[GOOD, 'Admiral Acorn'], [BAD, 'Baron Bagel']]) keys[id] = (await call('profiles', { id, name, avatar: '', color: '#304A00', pin: '2468' })).key;
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(GOOD, 'Admiral Acorn', 1), person(BAD, 'Baron Bagel', 2)],
    cloud: [
      { id: GOOD, key: keys[GOOD], rev: 0, sent: {}, sounds: {}, pin: true, remembered: true },
      { id: BAD, key: keys[BAD], rev: 0, sent: {}, sounds: {}, pin: true, remembered: true },
    ],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('/api/')) return pageFetch(url, init);
    const method = init.method || 'GET';
    if (method === 'DELETE' && /^\/api\/profiles\/[^/]+$/.test(String(url))) deletes.push(String(url));
    if (failPull && method === 'GET' && /\/records\?/.test(String(url))) throw new TypeError('Failed to fetch');
    return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN }, duplex: 'half' }), env);
  };
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  cloud = await import('../web/cloud.js');
  await page.settle();
});

// Device B pushes one recorded sound to `id`'s cloud profile.
async function pushedFromB(id) {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' });
  const up = await uploadAudio(cloud.api, id, keys[id], blob, 'audio/wav', sha);
  await cloud.api.push(id, keys[id], [{ kind: 'clips', id: `user-${id}`, body: { id: `user-${id}`, personId: id, label: 'Burp', emoji: '😂', voice: 'normal', mime: 'audio/wav', created: 5, sound: up.sound, sha256: up.sha256, bytes: blob.size } }], []);
}
const hasSound = (id) => state.userClips.some((c) => c.id === `user-${id}` && c.blob?.size === 4);

test('leaving brings a sound only device B pushed here first, then deletes the cloud copy and keeps everything', async () => {
  await pushedFromB(GOOD);
  assert.equal(hasSound(GOOD), false, 'only the cloud has it');
  await cloud.leaveCloud(GOOD, '2468');
  assert.equal(hasSound(GOOD), true, 'it is here now');
  assert.equal(inD1(GOOD), false, 'the cloud copy is gone');
  assert.equal(cloud.inCloud(GOOD), false);
});

test("when their latest can't be brought, nothing is deleted: the link, the key and the cloud copy all stay", async () => {
  await pushedFromB(BAD);
  failPull = true;
  const before = deletes.length;
  await assert.rejects(() => cloud.leaveCloud(BAD, '2468'), { message: "Couldn't bring their latest here; try again." });
  failPull = false;
  assert.equal(deletes.length, before, 'no DELETE was sent');
  assert.equal(inD1(BAD), true, 'the cloud copy stays');
  assert.equal(cloud.inCloud(BAD), true, 'the link stays');
  assert.equal(cloud.keyOf(BAD), keys[BAD], 'and its key');
  assert.equal(hasSound(BAD), false);
  await cloud.leaveCloud(BAD, '2468');
  assert.equal(hasSound(BAD), true, 'trying again brings it, then deletes');
  assert.equal(inD1(BAD), false);
});
