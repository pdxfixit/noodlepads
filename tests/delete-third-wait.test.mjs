// Deleting the person on show who is in the cloud, when everyone left has a
// PIN (Ben, 2026-10-24): the second tap left the sheet open for the third,
// but switched to the next person at once, whose PIN pad covered it. Now
// nobody else comes on while the sheet waits; closing it brings the next
// person on, behind their PIN pad.

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
const SHOWN = 'p-shown-1';     // on show, in the cloud with no PIN; deleted
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });
const call = async (body) => (await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();

before(async () => {
  console.error = () => {};
  await call({ id: LOCKED, name: 'Baron Bagel', avatar: '', color: '#B3141C', pin: '2468' });
  const shown = await call({ id: SHOWN, name: 'Admiral Acorn', avatar: '', color: '#304A00' });
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(LOCKED, 'Baron Bagel', 1), person(SHOWN, 'Admiral Acorn', 2)],
    cloud: [
      { id: LOCKED, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
      { id: SHOWN, key: shown.key, rev: 0, sent: {}, sounds: {} },
    ],
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

test('the sheet waiting for the third tap is never covered by the next person\'s PIN pad; closing it brings them on', async () => {
  assert.equal(state.personId, SHOWN);
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === SHOWN).querySelector('[data-profile]').dispatch('click');
  $('#profile-delete').dispatch('click');
  $('#profile-delete').dispatch('click');
  await page.settle();
  assert.equal(state.peopleEdits.has(SHOWN), false, 'deleted here');
  assert.equal($('#profile-dialog').open, true);
  assert.equal($('#profile-delete').textContent, '☁️ Tap again to delete their cloud copy');
  assert.equal($('#pin-dialog').open, false, 'no PIN pad over the third tap');
  assert.equal($('#people-edit').children.some((r) => r.dataset.person === SHOWN), false, 'gone from 👥 People');

  $('#profile-dialog').close();   // ✕: their cloud copy stays
  await page.settle();
  assert.notEqual(state.personId, SHOWN, 'someone else comes on');
  assert.equal($(`.person-list [data-person="${SHOWN}"]`), null, 'gone from the corner menu');
  assert.equal($('#pin-dialog').open, true, 'their PIN is asked now');
  assert.equal(document.body.dataset.locked, '', 'the board waits behind the pad');
});
