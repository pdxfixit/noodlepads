// 👋 Who's playing now? at start (Ben, 2026-10-24): when everyone on the
// device has a PIN, the app opens on the chooser, so a kid picks themselves,
// instead of the PIN pad of whoever came first. 👋 Someone new adds a person.

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
const ONE = 'p-one-1';
const TWO = 'p-two-1';
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });
const call = async (body) => (await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();

before(async () => {
  console.error = () => {};
  await call({ id: ONE, name: 'Admiral Acorn', avatar: '', color: '#304A00', pin: '1357' });
  await call({ id: TWO, name: 'Baron Bagel', avatar: '', color: '#B3141C', pin: '2468' });
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(ONE, 'Admiral Acorn', 1), person(TWO, 'Baron Bagel', 2)],
    cloud: [
      { id: ONE, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
      { id: TWO, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
    ],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: `#${TWO}` });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => (String(url).startsWith('/api/')
    ? worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env)
    : pageFetch(url, init));
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
});

test('everyone has a PIN: the app opens on 👋 Who\'s playing now?, with 🔒 on each, and no PIN pad', () => {
  assert.equal($('#who-now').open, true);
  assert.equal($('#pin-dialog').open, false, 'nobody\'s PIN is asked before a pick');
  assert.equal($('#who-now-note').textContent, 'Tap your picture.');
  assert.equal(document.body.dataset.locked, '', 'the board is hidden behind it');
  const pads = $('#who-now-cards').children;
  assert.deepEqual(pads.map((b) => b.dataset.person), [ONE, TWO]);
  assert.ok(pads.every((b) => b.querySelector('.wn-lock')), '🔒 on each');
  assert.equal(pads[0].querySelector('.pad-label').textContent, 'Admiral Acorn');
});

test('a sync, or anything that redraws people, while the chooser is up shows nobody and asks no PIN', async () => {
  const cloud = await import('../web/cloud.js');
  const { refreshPeople } = await import('../web/people.js');
  await cloud.syncAll();
  refreshPeople();
  await page.settle();
  assert.equal($('#who-now').open, true, 'still choosing');
  assert.equal($('#pin-dialog').open, false);
  assert.equal(document.body.dataset.locked, '', 'the board stays hidden');
  assert.equal($('#who-now-note').textContent, 'Tap your picture.', 'it keeps what it said');
});

test('👋 Someone new adds a person, who shows; the chooser closes', async () => {
  const before = state.peopleEdits.size;
  $('#who-now-new').dispatch('click');
  await page.settle();
  assert.equal(state.peopleEdits.size, before + 1);
  assert.ok(![ONE, TWO].includes(state.personId), 'the new person shows');
  assert.equal($('#who-now').open, false);
  assert.equal(document.body.dataset.locked, undefined);
});
