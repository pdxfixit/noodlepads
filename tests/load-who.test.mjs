// Loading a one-person backup (⬇️ Export a backup in 🗂️ See all) asks where
// it goes (Ben, 2026-10-24): ♻️ Restore them as their own person, or load it
// all into someone here, who keeps their own name and settings. ✕ loads
// nothing. The real app with a stand-in IndexedDB.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';
import { makeBackup, personBackupLists } from '../web/backup.js';

let page;
let $;
let state;
const idb = fakeIndexedDB();
const HERE = 'p-here-1';    // someone on this device
const AWAY = 'p-away-1';    // the person in the backup, not on this device

// A one-person backup of AWAY: a sound, a beat and their own settings.
const backup = () => makeBackup(personBackupLists({
  people: [{ id: AWAY, name: 'Baron Bagel', fun: true, avatar: '🥯', color: '#304A00', added: true, created: 2 }],
  clips: [{ id: 'user-away-1', personId: AWAY, label: 'Big burp', emoji: '🐸', color: 'red', voice: 'normal', mime: 'audio/webm', created: 5, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) }],
  beats: [{ id: 'beat-away-1', personId: AWAY, name: 'Away groove', bpm: 90, rows: [], created: 1, saved: 2 }],
  prefs: [{ personId: AWAY, values: { padSize: 0.9 } }],
}, AWAY), 'test');

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [{ id: HERE, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#0E2C78', added: true, created: 1 }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
});

const load = async () => {
  $('#backup-file').files = [await backup()];
  $('#backup-file').dispatch('change');
  await page.settle();
};
const pick = (id) => $('#load-who').querySelector(`[data-into="${id}"]`);

test('a one-person backup asks: restore them, or load it all into someone here', async () => {
  await load();
  assert.ok($('#load-who').open);
  assert.equal($('#load-who-title').textContent, "Load Baron Bagel's backup");
  assert.equal($('#load-who-counts').textContent.replace(/ /g, ' '), '🔊 1 · 🥁 1');
  assert.equal($('#load-who-restore').textContent, '♻️ Restore Baron Bagel');
  assert.ok(pick(HERE), 'everyone on this device is offered');
  assert.equal(pick(HERE).getAttribute('aria-label'), 'Load it all into Admiral Acorn');
  assert.equal($('#load-who-people').children.some((li) => li.querySelector('[data-into]').dataset.into === AWAY), false);
});

test('into someone here: the things become theirs and nobody new is added', async () => {
  pick(HERE).dispatch('click');
  await page.settle();
  assert.ok(!$('#load-who').open);
  assert.ok(!state.peopleEdits.has(AWAY), 'Baron Bagel is not added');
  assert.deepEqual(state.userClips.filter((c) => c.label === 'Big burp').map((c) => c.personId), [HERE]);
  assert.deepEqual(state.savedBeats.filter((b) => b.name === 'Away groove').map((b) => b.personId), [HERE]);
  assert.equal(state.prefs.get(HERE)?.values?.padSize, undefined, 'their own settings stay theirs');
  assert.equal(state.peopleEdits.get(HERE).name, 'Admiral Acorn');
});

test('loading it into them again adds nothing twice', async () => {
  await load();
  pick(HERE).dispatch('click');
  await page.settle();
  assert.equal(state.userClips.filter((c) => c.label === 'Big burp').length, 1);
  assert.equal(state.savedBeats.filter((b) => b.name === 'Away groove').length, 1);
});

test('✕ loads nothing', async () => {
  const sounds = state.userClips.length;
  await load();
  $('#load-who').querySelector('[data-close]').dispatch('click');
  await page.settle();
  assert.ok(!$('#load-who').open);
  assert.equal(state.userClips.length, sounds);
  assert.ok(!state.peopleEdits.has(AWAY));
});

test('♻️ Restore brings them back as their own person', async () => {
  await load();
  $('#load-who-restore').dispatch('click');
  await page.settle();
  assert.equal(state.peopleEdits.get(AWAY)?.name, 'Baron Bagel');
  assert.ok(state.userClips.some((c) => c.personId === AWAY && c.label === 'Big burp'), 'with their sound');
  assert.equal(state.prefs.get(AWAY)?.values?.padSize, 0.9, 'and their own settings');
});
