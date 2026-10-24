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
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
let hold = null;   // set: the next pull of SYNCING waits for it
let held = null;   // resolves once that pull is waiting
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });
const edit = (id) => ({ id: `${id}-${KIT}`, color: 'pink', label: 'Mine' });

before(async () => {
  console.error = () => {};
  const made = await (await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ id: SYNCING, name: 'Count Cupcake', avatar: '', color: '#B3141C' }),
  }), env)).json();
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(SHOWN, 'Admiral Acorn', 1), person(OTHER, 'Baron Bagel', 2), person(SYNCING, 'Count Cupcake', 3)],
    overrides: [edit(SHOWN), edit(OTHER)],
    cloud: [{ id: SYNCING, key: made.key, rev: 0, sent: {}, sounds: {} }],
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
