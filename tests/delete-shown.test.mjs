// Deleting the person on show when everyone left has a PIN (Ben, 2026-10-24:
// the deleted person "were still there as the active user" until another
// was picked). The next person needs their PIN, and the PIN pad asked for
// it while the deleted one stayed on show, in the corner menu too; closing
// the pad left them there. Now the board waits behind the pad for someone
// else, as at start (app.js setPerson), and the deleted person is gone from
// the corner menu at once.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';

let page;
let $;
let state;
const idb = fakeIndexedDB();
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const LOCKED = 'p-locked-1';   // in the cloud with a PIN, not opened on this visit
const SHOWN = 'p-shown-1';     // on show, deleted
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });

before(async () => {
  console.error = () => {};
  await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ id: LOCKED, name: 'Baron Bagel', avatar: '', color: '#B3141C', pin: '2468' }),
  }), env);
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(LOCKED, 'Baron Bagel', 1), person(SHOWN, 'Admiral Acorn', 2)],
    cloud: [{ id: LOCKED, key: null, rev: 0, sent: {}, sounds: {}, pin: true }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: `#${SHOWN}` });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => (String(url).startsWith('/api/')
    ? worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env)
    : pageFetch(url, init));
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
});

test('deleting the person on show, with only someone behind a PIN left: they leave the board at once, and the board waits behind the PIN pad', async () => {
  assert.equal(state.personId, SHOWN);
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === SHOWN).querySelector('[data-profile]').dispatch('click');
  $('#profile-delete').dispatch('click');
  $('#profile-delete').dispatch('click');
  await page.settle();
  assert.equal(state.peopleEdits.has(SHOWN), false, 'deleted');
  assert.notEqual(state.personId, SHOWN, 'no longer on show');
  assert.equal($(`.person-list [data-person="${SHOWN}"]`), null, 'gone from the corner menu');
  assert.equal($('#pin-dialog').open, true, 'their PIN is asked');
  assert.equal(document.body.dataset.locked, '', 'the board waits behind the pad');
  $('#pin-dialog').close();
  await page.settle();
  assert.notEqual(state.personId, SHOWN, 'closing the pad brings nobody deleted back');
});
