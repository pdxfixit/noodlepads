// A PIN new to this device (Ben, 2026-10-19): set or changed on another
// device, it closes the person here until it is typed; 🤷 I don't know the
// PIN deletes them from this device and the cloud keeps its copy; a PIN Ben
// cleared opens again by itself; a key "Remember on this device" kept (before
// 2026-10-19) serves one visit only. The real app with a stand-in IndexedDB
// (so syncs run), against the real Worker and a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { funName } from '../web/names.js';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let $;
let state;
let cloud;
let setPersonEdit;
let renderPeople;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const KEPT = 'p-kept-1';   // remembered on this device by an older copy: its key is stored
const call = async (path, body) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();

before(async () => {
  console.error = () => {};
  await call('profiles', { id: KEPT, name: 'Admiral Acorn', avatar: '', color: '#1F3FA8', pin: '2468' });
  const { key } = await call(`profiles/${KEPT}/open`, { pin: '2468', remember: true });
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [{ id: KEPT, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#1F3FA8', added: true, created: 1 }],
    cloud: [{ id: KEPT, key, rev: 0, sent: {}, sounds: {}, pin: true, remember: true }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('/api/')) {
      return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env);
    }
    return pageFetch(url, init);
  };
  await (await import('../web/app.js')).ready;
  ({ state, setPersonEdit } = await import('../web/state.js'));
  ({ renderPeople } = await import('../web/pads.js'));
  cloud = await import('../web/cloud.js');
  await page.settle();
});

const settle = () => page.settle();
const typePin = (digits) => { for (const k of digits) $('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click'); };
const choose = (id) => $(`.person-list [data-person="${id}"]`).dispatch('click');
const names = () => [...state.peopleEdits.values()].map((p) => p.name).filter(Boolean);
const makeBeat = (personId) => state.savedBeats.push({ id: `beat-${personId}`, personId, name: 'Wobbly Taco', bpm: 100, bars: 1, rows: [{ clipId: `${personId}-kick`, steps: [1, 0, 0, 0] }], created: 1, saved: 1 });

// Someone on this device, in the cloud with no PIN, showing; then another
// device (its own key) sets `pin` on them.
async function pinSetElsewhere(id, pin) {
  await setPersonEdit(id, { id, name: funName(names()), fun: true, avatar: '🦊', color: '#1F3FA8', added: true, created: 4 });
  makeBeat(id);
  await cloud.syncAll();
  assert.ok(cloud.inCloud(id) && cloud.linkOf(id).key, 'in the cloud, no PIN: the key is kept');
  renderPeople();
  choose(id);
  await settle();
  assert.equal(state.personId, id);
  const other = await cloud.api.open(id);
  await cloud.api.change(id, other.key, { newPin: pin });
}

// Ben, 2026-10-19: "if a user has obtained a PIN since the last time they
// were opened, the first time that they're opened with and synced from the
// cloud, they should be required to."
test('a PIN set on another device: the next sync closes the person showing until it is typed here', async () => {
  const id = 'p-newpin';
  await pinSetElsewhere(id, '9753');
  await cloud.syncNow(id);
  await settle();
  assert.equal(cloud.pinIsNew(id), true);
  assert.equal(cloud.keyOf(id), null);
  assert.equal($('#pin-dialog').open, true, 'the PIN pad comes up at once');
  assert.notEqual(state.personId, id, 'their board is no longer showing');
  assert.match($('#pin-hint').textContent, /They have a new PIN/);
  assert.equal($('#pin-unknown').hidden, false, '🤷 I don\'t know the PIN is offered');
  typePin('1111');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'a wrong one asks again');
  $('#pin-dialog').close();
  await settle();
  assert.notEqual(state.personId, id, 'closing the pad opens nothing');
  assert.ok(state.peopleEdits.has(id), 'and deletes nothing');
  choose(id);
  await settle();
  assert.equal($('#pin-dialog').open, true, 'opening them asks for it');
  typePin('9753');
  await settle();
  assert.equal(state.personId, id);
  assert.equal(cloud.pinIsNew(id), false);
  assert.ok(cloud.keyOf(id), 'synced again');
  assert.equal(cloud.linkOf(id).key, null, 'and the key is kept for this visit only');
});

test('🤷 I don\'t know the PIN asks first, then deletes them from this device; the cloud copy stays', async () => {
  const id = 'p-unknown';
  await pinSetElsewhere(id, '8642');
  await cloud.syncNow(id);
  await settle();
  assert.equal($('#pin-dialog').open, true);
  $('#pin-unknown').dispatch('click');
  assert.match($('#pin-unknown').textContent, /Tap again: delete them from this device/);
  assert.equal($('#pin-dialog').open, true, 'one tap deletes nothing');
  assert.ok(state.peopleEdits.has(id));
  $('#pin-unknown').dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.equal(state.peopleEdits.has(id), false, 'gone from this device');
  assert.equal(state.savedBeats.some((b) => b.personId === id), false, 'with everything of theirs');
  assert.equal(cloud.inCloud(id), false);
  assert.notEqual(state.personId, id);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n, 1, 'the cloud keeps its copy');
});

test('a PIN Ben cleared (`just cloud-reset-pin`): the device opens them again by itself, no PIN asked', async () => {
  const id = 'p-reset';
  await pinSetElsewhere(id, '1470');
  await env.DB.exec(`UPDATE profiles SET pin_hash = NULL, pin_salt = NULL WHERE id = '${id}'; DELETE FROM keys WHERE profile_id = '${id}';`);
  await cloud.syncNow(id);
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.equal(cloud.pinIsNew(id), false);
  assert.equal(cloud.needsPin(id), false);
  assert.ok(cloud.linkOf(id).key, 'a new key, kept: no PIN');
  assert.equal(state.personId, id);
});

test('a key "Remember on this device" kept is held for this visit only: the PIN is asked to open them', async () => {
  assert.equal(cloud.linkOf(KEPT).key, null, 'no longer stored');
  assert.ok(cloud.keyOf(KEPT), 'held for this visit');
  assert.equal(cloud.needsPin(KEPT), true);
  choose(KEPT);
  await settle();
  assert.equal($('#pin-dialog').open, true, 'its PIN is asked');
  assert.equal($('#pin-unknown').hidden, true, 'a PIN this device knew: nothing offers to delete them');
  assert.notEqual(state.personId, KEPT);
  typePin('2468');
  await settle();
  assert.equal(state.personId, KEPT);
});
