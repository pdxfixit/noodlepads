// A delete the browser refuses is told, never only logged: the thing would
// come back after a reload while the kid thought it gone. 🎬 Takes, key and
// touch layouts, saved beats and songs, and closing the open beat (app.js,
// through state.js removeRecord). Deleting a person is all or nothing, and
// says so: tests/delete-leftover.test.mjs.
//
// Each test starts from the board on 🔊 Pads with nothing open and makes or
// finds its own things, so none leans on the one before it.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { keysOff } from './new-beat.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let $;
let state;
const idb = fakeIndexedDB();
const PIP = 'p-pip-1';
const person = (id, name, created) => ({ id, name, avatar: '🦉', color: '#304A00', added: true, created, offline: true });
const stored = (store) => idb.rows(DB_NAME, store);
const on = (i) => Array.from({ length: 16 }, (_, k) => k === i);
const beat = (id, name, extra = {}) => ({ id, personId: PIP, name, bpm: 100, bars: 1, swing: 0, rows: [{ clipId: `${PIP}-kick`, steps: on(0) }], created: 1, saved: 1, ...extra });
const GONE = (what) => new RegExp(`^${what} is gone for now, but this browser wouldn't delete it .*may come back after a reload\\.$`);

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(PIP, 'Admiral Acorn', 1)],
    takes: [{ id: 'take-big-jam', personId: PIP, name: 'Big Jam', created: 1, duration: 2, events: [] }],
    beats: [beat('beat-pip-ska', 'Ska', { saved: 3 }), beat('beat-pip-disco', 'Disco', { saved: 2 })],
    patterns: [{ ...beat('beat-pip-ska', 'Ska', { saved: 3 }) }],   // Ska is the open beat
    songbook: [{ id: 'song-pip-verse', personId: PIP, name: 'Verse', tempo: 100, lanes: [], slots: [], created: 1, saved: 1 }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: `#${PIP}` });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
});

// The board on 🔊 Pads, no sheet open, no banner.
beforeEach(() => {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  keysOff(page);
  $('#pads-tab').dispatch('click');
  $('#banner-text').textContent = '';
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
  assert.match($('#banner-text').textContent, GONE('That take'));
  assert.equal(stored('takes').length, 1, 'still stored');
});

test('a key layout the browser won\'t delete: the banner says it may come back', async () => {
  $('#live-tab').dispatch('click');
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
  assert.match($('#banner-text').textContent, GONE('That key layout'));
  assert.equal(stored('layouts').length, 1, 'still stored');
});

test('a touch layout the browser won\'t delete: the banner says it may come back', async () => {
  $('#live-tab').dispatch('click');
  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  $('#dj-change').dispatch('click');
  assert.equal($('#touch-edit').open, true);
  $('#te-save').dispatch('click');
  $('#te-save-name').value = 'Jam pads';
  $('#te-save-ok').dispatch('click');
  await page.settle();
  assert.equal(stored('touchLayouts').length, 1);
  $('#te-delete').dispatch('click');
  idb.failCommit(1);
  $('#te-delete').dispatch('click');
  await page.settle();
  assert.equal(state.touchLayouts.length, 0, 'gone from the list');
  assert.match($('#banner-text').textContent, GONE('That touch layout'));
  assert.equal(stored('touchLayouts').length, 1, 'still stored');
  $('#touch-edit').close();
  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
});

test('a saved song the browser won\'t delete: the banner says it may come back', async () => {
  $('#song-tab').dispatch('click');
  $('#song-open').dispatch('click');
  const item = () => $('#songs-list').children.find((li) => li.querySelector('.lib-name').textContent === 'Verse');
  item().querySelector('[data-delete]').dispatch('click');
  idb.failCommit(1);
  item().querySelector('[data-delete]').dispatch('click');
  await page.settle();
  assert.equal(item(), undefined, 'gone from the list');
  assert.match($('#banner-text').textContent, GONE('That song'));
  assert.ok(stored('songbook').some((s) => s.id === 'song-pip-verse'), 'still stored');
});

test('a saved beat the browser won\'t delete: the banner says it may come back', async () => {
  $('#beats-toggle').dispatch('click');
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const del = () => $('#lib-list').querySelector('[data-delete="beat-pip-disco"]');
  del().dispatch('click');
  idb.failCommit(1);
  del().dispatch('click');
  await page.settle();
  assert.equal(del(), null, 'gone from the list');
  assert.match($('#banner-text').textContent, GONE('That beat'));
  assert.ok(stored('beats').some((b) => b.id === 'beat-pip-disco'), 'still stored');
});

test('the open beat deleted, and its closing refused: the banner says it may open again', async () => {
  $('#beats-toggle').dispatch('click');
  assert.ok(stored('patterns').some((p) => p.personId === PIP), 'Ska is the open beat');
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const del = () => $('#lib-list').querySelector('[data-delete="beat-pip-ska"]');
  del().dispatch('click');
  idb.failCommit(2);   // the beat, then closing it as the open beat
  del().dispatch('click');
  await page.settle();
  assert.match($('#banner-text').textContent, /^This browser wouldn't save that change .*After a reload it may be back as it was\.$/);
  assert.ok(stored('patterns').some((p) => p.personId === PIP), 'the open beat is still stored');
});
