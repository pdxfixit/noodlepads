// A delete the browser refuses is told, never only logged: the thing would
// come back after a reload while the kid thought it gone. 🎬 Takes, key
// layouts and touch layouts (app.js) only wrote to the console. (Deleting
// a person is all or nothing, and says so: tests/delete-leftover.test.mjs.)

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let $;
let state;
let stateJs;
const idb = fakeIndexedDB();
const PIP = 'p-pip-1';
const person = (id, name, created) => ({ id, name, avatar: '🦉', color: '#304A00', added: true, created, offline: true });
const stored = (store) => idb.rows(DB_NAME, store);

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(PIP, 'Admiral Acorn', 1)],
    takes: [{ id: 'take-big-jam', personId: PIP, name: 'Big Jam', created: 1, duration: 2, events: [] }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: `#${PIP}` });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  stateJs = await import('../web/state.js');
  ({ state } = stateJs);
  await page.settle();
});

test('a take the browser won\'t delete: the banner says it may come back', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-takes-open').dispatch('click');
  const rows = () => $('#takes-list').children;
  assert.equal(rows().length, 1);
  rows()[0].querySelector('[data-delete]').dispatch('click');
  idb.failCommit(1);
  rows()[0].querySelector('[data-delete]').dispatch('click');
  await page.settle();
  assert.equal(rows().length, 0, 'gone from the list');
  assert.match($('#banner-text').textContent, /^That take is gone for now, but this browser wouldn't delete it .*may come back after a reload\.$/);
  assert.equal(stored('takes').length, 1, 'still stored');
  $('#takes').close();
});

test('a key layout the browser won\'t delete: the banner says it may come back', async () => {
  $('#dj-change').dispatch('click');
  $('#ke-save').dispatch('click');
  $('#ke-save-name').value = 'Party keys';
  $('#ke-save-ok').dispatch('click');
  await page.settle();
  assert.equal(stored('layouts').length, 1);
  $('#ke-delete').dispatch('click');
  idb.failCommit(1);
  $('#ke-delete').dispatch('click');
  await page.settle();
  assert.equal(state.layouts.length, 0, 'gone from the list');
  assert.match($('#banner-text').textContent, /^That key layout is gone for now, but this browser wouldn't delete it .*may come back after a reload\.$/);
  assert.equal(stored('layouts').length, 1, 'still stored');
  $('#keys-edit').close();
  $('#pads-tab').dispatch('click');
});
