// Nothing of a person with a PIN is read or changed past it (Ben,
// 2026-10-24): their profile (and so 🗂️ See all, ⬇️ Export, Delete) opens
// only after their PIN; 👥 People hides their counts until then; the sound
// chooser leaves out their sounds; 💾 Save a backup and loading one ask for
// it, and leave them out without it. Once typed, it holds for the visit.
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
import { makeBackup, personBackupLists } from '../web/backup.js';
import { unzip } from '../web/zip.js';
import { pinKeys } from './helpers.mjs';

let page;
let $;
let state;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const HERE = 'p-here-1';   // no PIN
const LOCK = 'p-lock-1';   // in the cloud with PIN 1357, not typed on this visit
const call = async (path, body) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();
const wav = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

before(async () => {
  console.error = () => {};
  await call('profiles', { id: LOCK, name: 'Baron Bagel', avatar: '', color: '#304A00', pin: '1357' });
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [
      { id: HERE, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#0E2C78', added: true, created: 1 },
      { id: LOCK, name: 'Baron Bagel', fun: true, avatar: '🥯', color: '#304A00', added: true, created: 2 },
    ],
    clips: [
      { id: 'user-here-1', personId: HERE, label: 'Here burp', emoji: '🐸', color: 'red', voice: 'normal', mime: 'audio/webm', created: 1, blob: wav() },
      { id: 'user-lock-1', personId: LOCK, label: 'Locked burp', emoji: '🔒', color: 'red', voice: 'normal', mime: 'audio/webm', created: 2, blob: wav() },
    ],
    cloud: [{ id: LOCK, key: null, rev: 0, sent: {}, sounds: {}, pin: true }],
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
  // Show the person with no PIN, so nothing has asked for Baron Bagel's yet.
  if (state.personId !== HERE) { $(`.person-list [data-person="${HERE}"]`)?.dispatch('click'); await page.settle(); }
});

const settle = () => page.settle();
const typePin = (digits) => pinKeys($, digits);
const line = (id) => {
  if (!$('#people-dialog').open) $('#people-open').dispatch('click');
  return $('#people-edit').children.find((r) => r.dataset.person === id);
};
// Catches the file 💾 Save a backup hands over: run `act` (the save, and the
// PIN pad it asks), then read backup.json from the file.
async function savedBackup(act) {
  let blob;
  const realUrl = URL.createObjectURL;
  const realMake = document.createElement;
  URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
  document.createElement = (tag) => {
    const made = realMake.call(document, tag);
    if (tag === 'a') made.click = () => {};
    return made;
  };
  try {
    await act();
  } finally {
    URL.createObjectURL = realUrl;
    document.createElement = realMake;
  }
  return JSON.parse(new TextDecoder().decode((await unzip(blob)).get('backup.json')));
}

test('👥 People hides what a PIN person has until their PIN is typed', () => {
  assert.equal(state.personId, HERE);
  assert.equal(line(LOCK).querySelector('.pe-counts').textContent, '🔒 PIN to see');
  assert.match(line(LOCK).querySelector('[data-profile]').getAttribute('aria-label'), /PIN set.*after their PIN/);
  assert.equal(line(HERE).querySelector('.pe-counts').textContent.replace(/ /g, ' '), '🔊 1');
});

test('the sound chooser leaves out a PIN person\'s sounds', async () => {
  const { groupsForChooser } = await import('../web/app.js');
  const names = groupsForChooser().map((g) => g.id);
  assert.ok(names.includes(HERE));
  assert.ok(!names.includes(LOCK), 'not until their PIN is typed');
});

test('💾 Save a backup asks a PIN person\'s PIN, and leaves them out without it', async () => {
  const doc = await savedBackup(async () => {
    $('#backup-save').dispatch('click');
    await settle();
    assert.ok($('#pin-dialog').open, 'their PIN is asked');
    assert.match($('#pin-hint').textContent, /put them in the backup/);
    $('#pin-dialog').close();
    await settle();
  });
  assert.deepEqual(doc.clips.map((c) => c.id), ['user-here-1'], 'their sound stays out');
  assert.ok(!doc.people.some((p) => p.id === LOCK));
  assert.match($('#banner-text').textContent, /Left out Baron Bagel: their PIN wasn't typed/);
});

test('loading a backup into a PIN person asks their PIN; without it nothing loads', async () => {
  const file = await makeBackup(personBackupLists({
    people: [{ id: 'p-away-1', name: 'Count Cupcake', fun: true, avatar: '🧁', color: '#A3156E', added: true, created: 3 }],
    clips: [{ id: 'user-away-1', personId: 'p-away-1', label: 'Away burp', emoji: '🐸', color: 'red', voice: 'normal', mime: 'audio/webm', created: 5, blob: wav() }],
  }, 'p-away-1'));
  $('#backup-file').files = [file];
  $('#backup-file').dispatch('change');
  await settle();
  $('#load-who').querySelector(`[data-into="${LOCK}"]`).dispatch('click');
  await settle();
  assert.ok($('#pin-dialog').open);
  assert.match($('#pin-hint').textContent, /load a backup into them/);
  $('#pin-dialog').close();
  await settle();
  assert.ok(!state.userClips.some((c) => c.label === 'Away burp'), 'nothing loaded');
});

test('a PIN person\'s profile opens only past their PIN; then it holds for the visit', async () => {
  line(LOCK).querySelector('[data-profile]').dispatch('click');
  await settle();
  assert.ok($('#pin-dialog').open);
  assert.match($('#pin-hint').textContent, /open their profile/);
  $('#pin-dialog').close();
  await settle();
  assert.ok(!$('#profile-dialog').open, 'no PIN, no profile (so no See all, Export or Delete)');

  line(LOCK).querySelector('[data-profile]').dispatch('click');
  await settle();
  typePin('1357');
  await settle();
  assert.ok($('#profile-dialog').open);
  assert.equal($('#profile-name').textContent, 'Baron Bagel');
  $('#profile-dialog').close();
  assert.equal(line(LOCK).querySelector('.pe-counts').textContent.replace(/ /g, ' '), '🔊 1', 'their counts show now');
  line(LOCK).querySelector('[data-profile]').dispatch('click');
  await settle();
  assert.ok(!$('#pin-dialog').open, 'not asked twice in one visit');
  assert.ok($('#profile-dialog').open);
  $('#profile-dialog').close();
  const { groupsForChooser } = await import('../web/app.js');
  assert.ok(groupsForChooser().some((g) => g.id === LOCK), 'and the chooser shows their sounds');
});
