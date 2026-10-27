// Deleting the kid on show lets go of what they were making at the tap, but
// KEEPS it (council, storage-sync, 2026-10-26): the delete can still be
// refused (state.js deletePerson: "nothing of theirs is gone"; storage
// closed for another tab's upgrade). The take in progress ends as theirs, a
// take taken out goes back under them, a Kids recording becomes their pad;
// their puts are queued before the delete's one transaction. A refused
// delete keeps all of it; one that goes through takes all of it, so no row
// is left to bring them back as someone on the next start.
// Not tested here: a real microphone, a real IndexedDB.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let $;
let state;
let db;
const idb = fakeIndexedDB();
const A = 'p-ref-a';
const B = 'p-ref-b';
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, { people: [person(B, 'Baron Bagel', 1), person(A, 'Admiral Acorn', 2)] });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: `#${A}` });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ db } = await import('../web/store.js'));
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
  const data = new Float32Array(4800);
  data[2400] = 0.8;
  audio.decode = async () => ({ length: data.length, numberOfChannels: 1, sampleRate: 48000, duration: 0.1, getChannelData: () => data });
  window.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['sound']) }); this.onstop(); }
  };
  globalThis.MediaRecorder = window.MediaRecorder;
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) };
});

async function deleteTap(id) {
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === id).querySelector('[data-profile]').dispatch('click');
  $('#profile-delete').dispatch('click', { timeStamp: 1000 });
  $('#profile-delete').dispatch('click', { timeStamp: 5000 });
  await page.settle();
  for (const d of ['#profile-dialog', '#people-dialog']) if ($(d).open) $(d).close();
}
// Every stored row that names `id` (a person record, or anything with its personId).
const rowsOf = (id) => SCHEMA.flatMap(({ name }) => idb.rows(DB_NAME, name).filter((r) => r.personId === id || (name === 'people' && r.id === id)).map((r) => `${name}:${r.id ?? r.personId}`));

test('a delete the browser refuses: the take in progress, the take taken out and the Kids recording are all still the kid\'s', async () => {
  assert.equal(state.personId, A);
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  await page.settle();
  const out = state.takes.at(-1).id;
  $('#dj-done-undo').dispatch('click');   // taken out: its banner's ↩️ Undo is up
  $('#dj-record').dispatch('click');
  page.key('s', { code: 'KeyS' });        // another take, in progress
  const batch = db.batch;
  db.batch = () => Promise.reject(new Error('storage is not available'));
  try {
    await deleteTap(A);
  } finally {
    db.batch = batch;
  }
  assert.equal(state.personId, A, 'still here');
  const takes = state.takes.filter((t) => t.personId === A);
  assert.ok(takes.some((t) => t.id === out), 'the take taken out is back');
  assert.equal(takes.length, 2, 'and the one in progress was kept');
  assert.ok(idb.rows(DB_NAME, 'takes').filter((t) => t.personId === A).length === 2, 'both stored');
  // A Kids recording listening at the tap.
  $('#kids-open').dispatch('click');
  await page.settle();
  $('[data-kids-tab="pads"]').dispatch('click');
  $('[data-kids-tab="record"]').dispatch('click');
  $('#kids-mic').dispatch('pointerdown', { pointerId: 1 });
  await page.settle();
  await new Promise((r) => setTimeout(r, 400));
  const clips = state.userClips.filter((c) => c.personId === A).length;
  db.batch = () => Promise.reject(new Error('storage is not available'));
  try {
    await deleteTap(A);
  } finally {
    db.batch = batch;
  }
  assert.equal(state.personId, A);
  assert.equal(state.userClips.filter((c) => c.personId === A).length, clips + 1, 'the recording is their pad');
  $('#kids-mic').dispatch('pointerup', { pointerId: 1 });
});

test('a delete that goes through: no row of theirs is left, so nobody comes back on the next start', async () => {
  $('#kids-mic').dispatch('pointerdown', { pointerId: 2 });   // listening again at the tap
  await page.settle();
  await new Promise((r) => setTimeout(r, 400));
  await deleteTap(A);
  assert.notEqual(state.personId, A, 'deleted');
  assert.deepEqual(rowsOf(A), [], 'nothing stored names them');
  assert.equal(state.takes.some((t) => t.personId === A) || state.userClips.some((c) => c.personId === A), false);
});

// Gone some other way (deleted in another tab, then this one redrawn): the
// board starts over, and the take in progress is not saved under a dead id.
test('the kid on show gone from elsewhere: their take in progress is not saved under a dead id', async () => {
  const { refreshPeople } = await import('../web/people.js');
  if ($('#kids').hidden === false) {
    $('#settings-open').dispatch('click');
    const answer = String(Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent));
    for (const d of answer) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
    await page.settle();
    $('#settings-dialog').close();
  }
  assert.equal(state.personId, B);
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  state.peopleEdits.delete(B);   // as another tab's delete leaves this one
  refreshPeople();
  await page.settle();
  assert.equal(state.takes.some((t) => t.personId === B), false, 'nothing saved for them');
});
