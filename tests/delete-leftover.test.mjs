// Deleting someone leaves nothing of theirs in IndexedDB (a tester,
// 2026-10-24: a person deleted came back after a reload). On start,
// state.js adoptStoredPeople makes a person of any id a stored record still
// names, so a leftover kit edit (`<person>-<kit sound>` in `overrides`)
// brought them back with a new fun name. Deletes the person on show and one
// who isn't, each with a kit edit, then reads every store as a start would.
// And a sync of theirs still running when they are deleted: what it pulled
// (their own record among it) was stored again after the delete.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';
import { personIdsIn, adoptPeople } from '../web/model.js';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';

let page;
let $;
let state;
const idb = fakeIndexedDB();
const manifest = testManifest();
const KIT = manifest.kit[0].id;
const SHOWN = 'p-shown-1';
const OTHER = 'p-other-1';
const SYNCING = 'p-syncing-1';   // in the cloud, mid-sync when deleted
const KEPT = 'p-kept-1';         // in the cloud: a delete refused, then one with storage closed
const REFUSED = 'p-refused-1';   // the browser refuses the first try at deleting them (📴, so no cloud link to drop first)
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
let hold = null;   // set: the next pull of SYNCING waits for it
let held = null;   // resolves once that pull is waiting
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });
const edit = (id) => ({ id: `${id}-${KIT}`, color: 'pink', label: 'Mine' });

before(async () => {
  console.error = () => {};
  // Nobody goes to the cloud by themselves: both were put there with a PIN (this device remembers it).
  const put = async (id, name, color) => (await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ id, name, avatar: '', color, pin: '2468' }),
  }), env)).json();
  const made = await put(SYNCING, 'Count Cupcake', '#B3141C');
  const kept = await put(KEPT, 'Sir Squid', '#304A00');
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(SHOWN, 'Admiral Acorn', 1), person(OTHER, 'Baron Bagel', 2), person(SYNCING, 'Count Cupcake', 3), { ...person(REFUSED, 'Duke Dumpling', 4), offline: true }, person(KEPT, 'Sir Squid', 5)],
    overrides: [edit(SHOWN), edit(OTHER), edit(REFUSED), edit(KEPT)],
    beats: [{ id: 'beat-refused', personId: REFUSED, name: 'Wobbly Taco', bpm: 100, bars: 1, swing: 0, rows: [], created: 4, saved: 4 }],
    orders: [{ personId: REFUSED, ids: [] }],
    cloud: [
      { id: SYNCING, key: made.key, rev: 0, sent: {}, sounds: {}, pin: true, remembered: true },
      { id: KEPT, key: kept.key, rev: 0, sent: {}, sounds: {}, pin: true, remembered: true },
    ],
    settings: [{ key: 'person', value: SHOWN }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest, hash: `#${SHOWN}` });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('/api/')) return pageFetch(url, init);
    if (hold && String(url).startsWith(`/api/profiles/${SYNCING}/records?`)) {
      const wait = hold;
      hold = null;
      held();
      await wait;
    }
    return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env);
  };
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
});

// Everything stored now, the way the next start reads it.
const stored = () => Object.fromEntries(SCHEMA.map(({ name }) => [name, idb.rows(DB_NAME, name)]));

async function deleteFromSheet(id) {
  if (!$('#people-dialog').open) $('#people-open').dispatch('click');
  const line = $('#people-edit').children.find((r) => r.dataset.person === id);
  line.querySelector('[data-profile]').dispatch('click');
  $('#profile-delete').dispatch('click');
  $('#profile-delete').dispatch('click');
  await page.settle();
  await page.settle();
}

for (const [what, id] of [['someone not on show', OTHER], ['the person on show', SHOWN]]) {
  test(`deleting ${what} leaves nothing that names them, so a reload doesn't bring them back`, async () => {
    assert.ok(state.overrides.has(`${id}-${KIT}`), 'they have a kit edit');
    if (id === SHOWN) assert.equal(state.personId, SHOWN, 'on show');
    await deleteFromSheet(id);
    assert.equal(state.peopleEdits.has(id), false);
    assert.equal(state.overrides.has(`${id}-${KIT}`), false, 'their kit edit is gone here');
    const doc = stored();
    const kitIds = manifest.kit.map((k) => k.id);
    assert.deepEqual(personIdsIn(doc, kitIds).filter((x) => x === id), [], 'no store names them');
    const { add } = adoptPeople(doc, { known: new Set(manifest.people.map((p) => p.id)), kitIds });
    assert.deepEqual(add.map((p) => p.id), [], 'the next start adopts nobody');
    $('#people-dialog').close();
  });
}

// Deleting is one transaction: a browser that refuses it (a full disk, a
// closing tab) keeps all of them. One removal at a time, a refused one left
// a kit edit behind, and the next start made a new person of it.
test('a browser that refuses the delete keeps all of them, and says so; the next try deletes everything', async () => {
  const tapDelete = async (refuse) => {
    if (!$('#people-dialog').open) $('#people-open').dispatch('click');
    $('#people-edit').children.find((r) => r.dataset.person === REFUSED).querySelector('[data-profile]').dispatch('click');
    $('#profile-delete').dispatch('click');
    if (refuse) idb.failCommit(1);
    $('#profile-delete').dispatch('click');
    await page.settle();
    await page.settle();
  };
  await tapDelete(true);
  assert.equal(state.peopleEdits.has(REFUSED), true, 'still here');
  const doc = stored();
  assert.ok(doc.people.some((p) => p.id === REFUSED), 'stored whole: themselves');
  assert.ok(doc.overrides.some((o) => o.id === `${REFUSED}-${KIT}`), 'their kit edit');
  assert.ok(doc.beats.some((b) => b.personId === REFUSED), 'their beat');
  assert.ok(doc.orders.some((o) => o.personId === REFUSED), 'their pad order');
  assert.match($('#banner-text').textContent, /^This browser wouldn't delete Duke Dumpling .*nothing of theirs is gone\. Try again\.$/);
  if ($('#profile-dialog').open) $('#profile-dialog').close();

  await tapDelete(false);
  assert.equal(state.peopleEdits.has(REFUSED), false);
  assert.deepEqual(personIdsIn(stored(), manifest.kit.map((k) => k.id)).filter((x) => x === REFUSED), [], 'no store names them');
  $('#people-dialog').close();
});

// Someone in the cloud whose delete fails stays whole: the link is back with
// its last-synced copies (bases), so the next clash still merges three ways.
// Storage closed under the page (another tab upgrading after a deploy) is a
// refusal too: what is stored would bring them back after a reload.
test('a refused delete of someone in the cloud keeps their link and its bases; storage closed under the page is refused too', async () => {
  const { db } = await import('../web/store.js');
  const cloud = await import('../web/cloud.js');
  await cloud.syncNow(KEPT);
  const basesOf = () => idb.rows(DB_NAME, 'bases').filter((b) => b.personId === KEPT);
  const before = basesOf().length;
  assert.ok(cloud.inCloud(KEPT) && before > 0, 'in the cloud, with bases');
  const tapDelete = async () => {
    if (!$('#people-dialog').open) $('#people-open').dispatch('click');
    $('#people-edit').children.find((r) => r.dataset.person === KEPT).querySelector('[data-profile]').dispatch('click');
    $('#profile-delete').dispatch('click');
    $('#profile-delete').dispatch('click');
    await page.settle();
    await page.settle();
    if ($('#profile-dialog').open) $('#profile-dialog').close();
  };
  const kept = (how) => {
    assert.equal(state.peopleEdits.has(KEPT), true, `${how}: still here`);
    assert.ok(idb.rows(DB_NAME, 'people').some((p) => p.id === KEPT), `${how}: still stored`);
    assert.ok(idb.rows(DB_NAME, 'overrides').some((o) => o.id === `${KEPT}-${KIT}`), `${how}: their kit edit too`);
    assert.ok(cloud.inCloud(KEPT), `${how}: the link is back`);
    assert.equal(basesOf().length, before, `${how}: with every base`);
    assert.match($('#banner-text').textContent, /nothing of theirs is gone\. Try again\.$/, how);
  };

  // The browser refuses the person's own transaction.
  const batch = db.batch;
  db.batch = function (ops) {
    if (ops.some((o) => o.store === 'people')) { db.batch = batch; return Promise.reject(new Error('QuotaExceededError')); }
    return batch.call(this, ops);
  };
  await tapDelete();
  db.batch = batch;
  kept('refused');

  // Storage closed (no handle) while the page runs.
  const handle = db.handle;
  db.handle = null;
  await tapDelete();
  db.handle = handle;
  kept('storage closed');

  await tapDelete();
  assert.equal(state.peopleEdits.has(KEPT), false, 'the next try deletes them');
  assert.deepEqual(basesOf(), [], 'and their bases');
  $('#people-dialog').close();
});

test('deleting someone while a sync of theirs is running: the sync finishes first, and nothing of it is stored after', async () => {
  const cloud = await import('../web/cloud.js');
  let release;
  hold = new Promise((r) => { release = r; });
  const waiting = new Promise((r) => { held = r; });
  const sync = cloud.syncNow(SYNCING);
  await waiting;   // its pull has gone out, and waits
  // Two taps on Delete; no settle(), which would wait for the held pull.
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === SYNCING).querySelector('[data-profile]').dispatch('click');
  $('#profile-delete').dispatch('click');
  $('#profile-delete').dispatch('click');
  await new Promise((r) => setTimeout(r, 50));
  release();
  await sync;
  await page.settle();
  await page.settle();
  assert.equal(state.peopleEdits.has(SYNCING), false, 'not back on this device');
  assert.equal(idb.rows(DB_NAME, 'people').some((p) => p.id === SYNCING), false, 'not stored again');
  assert.deepEqual(personIdsIn(stored()).filter((x) => x === SYNCING), []);
  assert.deepEqual(idb.rows(DB_NAME, 'bases').filter((b) => b.personId === SYNCING), [], 'no sync bookkeeping left either');
  assert.deepEqual(idb.rows(DB_NAME, 'cloud').filter((l) => l.id === SYNCING), [], 'nor its link');
  $('#profile-dialog').close();
  $('#people-dialog').close();
});
