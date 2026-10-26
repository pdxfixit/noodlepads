// Delete in a profile sheet, for someone in the cloud (Ben, 2026-10-24): two
// taps delete them from this device, and the sheet stays with only the Delete
// box: ☁️ Delete their cloud copy too, moved to its top, deletes the cloud
// copy (asking for the PIN if they have one); ☁️ Keep their cloud copy, in the
// spot the first two taps hit (Ben, 2026-10-26: "so an accidental third click
// can't"), and ✕ keep it. Someone not in the cloud goes in two taps, as before.
// The real app with a stand-in IndexedDB, against the real Worker and a fake D1.

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
let $;
let state;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const OPEN = 'p-open-1';     // in the cloud, no PIN
const LOCKED = 'p-locked-1'; // in the cloud with a PIN
const KEPT = 'p-kept-1';     // in the cloud, no PIN: ✕ after the second tap
const HERE = 'p-here-1';     // on this device only
const call = async (path, body) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();
const inD1 = (id) => env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n === 1;

before(async () => {
  console.error = () => {};
  const open = await call('profiles', { id: OPEN, name: 'Admiral Acorn', avatar: '', color: '#304A00' });
  await call('profiles', { id: LOCKED, name: 'Baron Bagel', avatar: '', color: '#B3141C', pin: '2468' });
  const kept = await call('profiles', { id: KEPT, name: 'Count Cupcake', avatar: '', color: '#5A2050' });
  const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(OPEN, 'Admiral Acorn', 1), person(LOCKED, 'Baron Bagel', 2), person(KEPT, 'Count Cupcake', 3), person(HERE, 'Duke Dumpling', 4)],
    cloud: [
      { id: OPEN, key: open.key, rev: 0, sent: {}, sounds: {} },
      { id: LOCKED, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
      { id: KEPT, key: kept.key, rev: 0, sent: {}, sounds: {} },
    ],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => (String(url).startsWith('/api/')
    ? worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env)
    : pageFetch(url, init));
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
});

const settle = () => page.settle();
const typePin = (d) => { for (const k of d) $('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click'); };
const sheetOf = (id) => {
  if (!$('#people-dialog').open) $('#people-open').dispatch('click');
  const line = $('#people-edit').children.find((r) => r.dataset.person === id);
  line.querySelector('[data-profile]').dispatch('click');
};
const closeSheets = () => { $('#profile-dialog').close(); $('#people-dialog').close(); };
const del = () => $('#profile-delete');
const tap = async () => { del().dispatch('click'); await settle(); };

test('in the cloud with no PIN: the second tap deletes them here and keeps the sheet; the third deletes the cloud copy', async () => {
  sheetOf(OPEN);
  assert.match($('#profile-delete-hint').textContent, /Then they can delete their cloud copy too/);
  assert.equal($('#profile-keep').hidden, true, 'no Keep before the second tap');
  await tap();
  assert.equal(del().textContent, 'Tap again to delete');
  await tap();
  assert.equal(state.peopleEdits.has(OPEN), false, 'gone from this device');
  assert.ok(inD1(OPEN), 'the cloud copy stays after two taps');
  assert.equal($('#profile-dialog').open, true, 'the sheet stays for the third tap');
  assert.equal($('#profile-parts').hidden, true, 'only Delete shows');
  assert.equal($('#profile-name').textContent, 'Admiral Acorn');
  assert.equal(del().textContent, '☁️ Delete their cloud copy too');
  assert.match($('#profile-delete-hint').textContent, /is deleted from this device\. Their cloud copy is still there/);
  assert.ok($('.pf-zone').classList.contains('left'), 'the red button moves to the top of the box');
  assert.equal($('#profile-keep').hidden, false, '☁️ Keep takes the spot the taps hit');
  assert.equal($('#profile-keep').getAttribute('aria-describedby'), 'profile-delete-hint', 'and reads why when it gets the focus');
  assert.ok(document.activeElement === $('#profile-keep'), 'and has the focus, so a third Enter keeps it');
  await tap();
  assert.equal(inD1(OPEN), false, 'the cloud copy is gone');
  assert.equal($('#profile-dialog').open, false);
  closeSheets();
});

test('in the cloud with a PIN: the third tap asks for it; a wrong one asks again', async () => {
  sheetOf(LOCKED);
  await settle();
  assert.equal($('#pin-dialog').open, true, 'their profile opens past their PIN (Ben, 2026-10-24)');
  typePin('2468');
  await settle();
  assert.equal($('#profile-dialog').open, true);
  await tap();
  await tap();
  assert.equal(state.peopleEdits.has(LOCKED), false);
  assert.match($('#profile-delete-hint').textContent, /it asks for their PIN/);
  await tap();
  assert.equal($('#pin-dialog').open, true);
  typePin('1111');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'asked again');
  assert.ok(inD1(LOCKED));
  typePin('2468');
  await settle();
  assert.equal(inD1(LOCKED), false, 'the cloud copy is gone');
  assert.equal($('#profile-dialog').open, false);
  closeSheets();
});

test('☁️ Keep after the second tap keeps the cloud copy, and the next sheet starts plain', async () => {
  sheetOf(KEPT);
  await tap();
  await tap();
  assert.equal(state.peopleEdits.has(KEPT), false);
  $('#profile-keep').dispatch('click');
  await settle();
  assert.equal($('#profile-dialog').open, false, 'it closes the sheet, as ✕ does');
  assert.ok(inD1(KEPT), 'still in the cloud, for another device');
  assert.equal($('#people-edit').children.some((r) => r.dataset.person === KEPT), false);
  closeSheets();
});

test('on this device only: two taps delete them and close the sheet', async () => {
  sheetOf(HERE);
  assert.ok(!$('.pf-zone').classList.contains('left'), 'Delete is back in its place');
  assert.equal($('#profile-keep').hidden, true);
  assert.doesNotMatch($('#profile-delete-hint').textContent, /cloud/);
  await tap();
  await tap();
  assert.equal(state.peopleEdits.has(HERE), false);
  assert.equal($('#profile-dialog').open, false);
  closeSheets();
});
