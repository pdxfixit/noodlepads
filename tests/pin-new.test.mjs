// A PIN new to this device (Ben, 2026-10-19): set or changed on another
// device, it closes the person here until it is typed; 🤷 I don't know the
// PIN deletes them from this device and the cloud keeps its copy; someone taken
// out of the cloud on another device is dropped here with everything kept; a
// key "Remember on this device" kept (before 2026-10-19) serves one visit only. The real app with a stand-in IndexedDB
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
import { pinKeys } from './helpers.mjs';

let page;
let $;
let state;
let cloud;
let setPersonEdit;
let persist;
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
  ({ state, setPersonEdit, persist } = await import('../web/state.js'));
  ({ renderPeople } = await import('../web/pads.js'));
  cloud = await import('../web/cloud.js');
  await page.settle();
});

const settle = () => page.settle();
const typePin = (digits) => pinKeys($, digits);
const choose = (id) => $(`.person-list [data-person="${id}"]`).dispatch('click');
const names = () => [...state.peopleEdits.values()].map((p) => p.name).filter(Boolean);
// Something made, stored as the app stores it, so the sync has it to send.
const makeBeat = async (personId) => {
  const beat = { id: `beat-${personId}`, personId, name: 'Wobbly Taco', bpm: 100, bars: 1, rows: [{ clipId: `${personId}-kick`, steps: [1, 0, 0, 0] }], created: 1, saved: 1 };
  state.savedBeats = [...state.savedBeats, beat];
  await persist('beats', structuredClone(beat));
};

// Someone on this device, put in the cloud by a grown-up with a PIN and
// showing; then another device (its own key) changes their PIN to `pin`.
const FIRST_PIN = '3961';
async function personUp(id) {
  await setPersonEdit(id, { id, name: funName(names()), fun: true, avatar: '🦊', color: '#1F3FA8', added: true, created: 4 });
  await makeBeat(id);
  await cloud.goUp(id, FIRST_PIN);
  assert.ok(cloud.inCloud(id) && cloud.keyOf(id), 'in the cloud, the key held for this visit');
  renderPeople();
  choose(id);
  await settle();
  assert.equal(state.personId, id);
}
async function pinSetElsewhere(id, pin) {
  await personUp(id);
  const other = await cloud.api.open(id, FIRST_PIN);
  await cloud.api.change(id, other.key, { pin: FIRST_PIN, newPin: pin });
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
  typePin('7391');
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
  assert.equal($('#who-now').open, false, 'someone else was already on show: nothing starts over');
  assert.equal(state.peopleEdits.has(id), false, 'gone from this device');
  assert.equal(state.savedBeats.some((b) => b.personId === id), false, 'with everything of theirs');
  assert.equal(cloud.inCloud(id), false);
  assert.notEqual(state.personId, id);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n, 1, 'the cloud keeps its copy');
});

test('taken out of the cloud on another device: this device drops the link, says so, and keeps every record', async () => {
  const id = 'p-left';
  await personUp(id);
  const other = await cloud.api.open(id, FIRST_PIN);
  await cloud.api.remove(id, other.key, FIRST_PIN);
  await cloud.syncNow(id);
  await settle();
  assert.equal(cloud.inCloud(id), false, 'the link is gone');
  assert.equal(cloud.statusOf(id).text, 'Taken out of the cloud on another device; everything here stays here.');
  assert.ok(state.peopleEdits.has(id), 'still here');
  assert.equal(state.peopleEdits.get(id).offline, undefined, 'no 📴 Offline is written any more');
  assert.ok(state.savedBeats.some((b) => b.personId === id), 'with everything of theirs');
  assert.equal(state.personId, id, 'and still showing');
  await cloud.syncAll();
  assert.equal(cloud.inCloud(id), false, 'not put back by itself');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n, 0);
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
