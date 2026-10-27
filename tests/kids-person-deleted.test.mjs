// 🧸 Kids and the kid on show deleted (👥 People → their sheet → 🗑️ twice):
// nothing of theirs is saved after the grown-up's delete tap (council,
// privacy-safety and storage-sync, 2026-10-26). A recording listening is
// dropped at the tap, before the delete's own awaits; one already stopped
// and still being checked (decoded) is not kept for a kid who is gone.
// Not tested here: a real microphone (a stand-in records a few bytes).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let $;
let state;
let audio;
const idb = fakeIndexedDB();
const A = 'p-del-a';
const B = 'p-del-b';
const C = 'p-del-c';
const D = 'p-del-d';   // stays, so the last delete is allowed
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });
let decodeGate = null;   // while set, decoding waits for it

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, { people: [person(D, 'Duke Dumpling', 0), person(C, 'Captain Cupcake', 1), person(A, 'Admiral Acorn', 2), person(B, 'Baron Bagel', 3)] });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: `#${A}` });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
  audio.play = async () => {};
  const data = new Float32Array(4800);
  data[2400] = 0.8;
  audio.decode = async () => {
    if (decodeGate) await decodeGate.promise;
    return { length: data.length, numberOfChannels: 1, sampleRate: 48000, duration: 0.1, getChannelData: () => data };
  };
  window.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['sound']) }); this.onstop(); }
  };
  globalThis.MediaRecorder = window.MediaRecorder;
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) };
});

const clipsOf = (id) => [...state.userClips.filter((c) => c.personId === id), ...idb.rows(DB_NAME, 'clips').filter((c) => c.personId === id)];
async function deleteShown(id) {
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === id).querySelector('[data-profile]').dispatch('click');
  $('#profile-delete').dispatch('click', { timeStamp: 1000 });
  $('#profile-delete').dispatch('click', { timeStamp: 5000 });
  await page.settle();
  assert.notEqual(state.personId, id, 'deleted');
  for (const d of ['#profile-dialog', '#people-dialog']) if ($(d).open) $(d).close();
}
// The same, without waiting for the page to settle: the delete in flight.
function deleteShownLater(id) {
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === id).querySelector('[data-profile]').dispatch('click');
  $('#profile-delete').dispatch('click', { timeStamp: 1000 });
  $('#profile-delete').dispatch('click', { timeStamp: 5000 });
  return page.settle().then(() => { for (const d of ['#profile-dialog', '#people-dialog']) if ($(d).open) $(d).close(); });
}
async function intoRecord() {
  $('#kids-open').dispatch('click');
  await page.settle();
  $('[data-kids-tab="pads"]').dispatch('click');
  $('[data-kids-tab="record"]').dispatch('click');
}

test('the mic listening when the kid on show is deleted: dropped, nothing kept for them', async () => {
  assert.equal(state.personId, A);
  await intoRecord();
  $('#kids-mic').dispatch('pointerdown', { pointerId: 1 });   // a hold: it listens at once
  await page.settle();
  assert.ok($('#kids-mic').classList.contains('recording'));
  await new Promise((r) => setTimeout(r, 400));
  await deleteShown(A);
  assert.equal($('#kids-mic').classList.contains('recording'), false, 'not listening');
  assert.deepEqual(clipsOf(A), [], 'no pad for the deleted kid');
});

test('a recording stopped, still being checked when its kid is deleted: not kept for them', async () => {
  // B shows now (the only one left without a PIN, or picked).
  if (state.personId !== B) { location.hash = `#${B}`; page.winEvent('hashchange'); await page.settle(); }
  assert.equal(state.personId, B);
  await intoRecord();
  $('#kids-mic').dispatch('pointerdown', { pointerId: 2 });
  await page.settle();
  await new Promise((r) => setTimeout(r, 400));
  let open;
  decodeGate = { promise: new Promise((r) => { open = r; }) };
  $('#kids-mic').dispatch('pointerup', { pointerId: 2 });   // the lift stops it; it is decoded before it is kept
  await deleteShown(B);
  open();
  decodeGate = null;
  await page.settle();
  assert.deepEqual(clipsOf(B), [], 'no pad for the deleted kid');
});

// The council (storage-sync, 2026-10-26): a decode finishing while the
// delete's one transaction is in flight saved its pad after the delete had
// read what to take, an orphan that would bring a person back on the next
// start (model.js adoptPeople). The kid is "being deleted" from the tap:
// the pad waits for the outcome.
test('a recording kept while its kid\'s delete is in flight: not saved for them', async () => {
  const { db } = await import('../web/store.js');
  location.hash = `#${C}`; page.winEvent('hashchange'); await page.settle();
  assert.equal(state.personId, C);
  // Someone to stay after C goes.
  await intoRecord();
  $('#kids-mic').dispatch('pointerdown', { pointerId: 3 });
  await page.settle();
  await new Promise((r) => setTimeout(r, 400));
  let openDecode;
  decodeGate = { promise: new Promise((r) => { openDecode = r; }) };
  const batch = db.batch;
  let openBatch;
  const held = new Promise((r) => { openBatch = r; });
  db.batch = async (ops) => { openDecode(); await new Promise((r) => setTimeout(r, 20)); await held; return batch.call(db, ops); };
  $('#kids-mic').dispatch('pointerup', { pointerId: 3 });
  const done = deleteShownLater(C);
  await new Promise((r) => setTimeout(r, 60));   // the decode finished while the delete waits
  openBatch();
  await done;
  db.batch = batch;
  decodeGate = null;
  await page.settle();
  assert.notEqual(state.personId, C, 'deleted');
  assert.ok(!state.peopleEdits.has(C), 'gone');
  assert.deepEqual(clipsOf(C), [], 'no pad for the deleted kid, in memory or stored');
});
