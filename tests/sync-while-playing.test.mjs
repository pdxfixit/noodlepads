// A sync that changes the open beat while it plays (storage and sync seat,
// council round 1). The beat carries on playing and is read again when it
// stops (sequencer.js setPerson, `readAgain`), so until then the screen held
// the old copy: the next pill tap saved it over the sync's change, and the
// cloud then took that as this device's newest edit. A pill tap now merges
// with what the sync stored (merge3.js), so both changes are kept.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, keysOff } from './new-beat.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { state, persist } from '../web/state.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const pill = (s) => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'))[0].querySelectorAll('.pill')[s];
const on = (b) => b.rows[0].steps.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
const theBeat = () => state.savedBeats.find((b) => b.personId === state.personId && b.rows?.length);

// What a cloud sync does after it pulls: the backup merge redraws the person.
async function syncRedraw() {
  const { storeLoaded, whatIsHere } = await import('../web/backup-ui.js');
  const { pulledDoc } = await import('../web/cloud-sync.js');
  const { cleanBackup } = await import('../web/backup.js');
  await storeLoaded(cleanBackup(pulledDoc(state.personId, null, []), () => null, whatIsHere()));
}

test('a sync\'s change to the beat that is playing survives the next pill tap', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  keysOff(page);
  newBeatWithRow(page);
  await page.settle();
  pill(2).dispatch('click');   // this device: pill 3 on
  ctx.currentTime = 100;
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'playing');
  // Another device turned pill 5 on; the sync stores it and redraws the person.
  const mine = theBeat();
  assert.deepEqual(on(mine), [2]);
  const synced = structuredClone(mine);
  synced.rows[0].steps[4] = true;
  synced.saved = mine.saved + 1;
  await persist('beats', synced);
  state.savedBeats = [...state.savedBeats.filter((b) => b.id !== mine.id), synced];
  await syncRedraw();
  await page.settle();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'the beat carries on');
  pill(7).dispatch('click');   // the next tap, still playing
  await page.settle();
  assert.deepEqual(on(theBeat()), [2, 4, 7], 'the sync\'s pill is still there');
  assert.equal(pill(4).getAttribute('aria-pressed'), 'true', 'and the screen shows it now');
  pill(7).dispatch('click');   // on, then off again
  await page.settle();
  assert.deepEqual(on(theBeat()), [2, 4], 'a pill turned off after a sync stays off');
  pill(7).dispatch('click');
  await page.settle();
  $('#seq-play').dispatch('click');   // stop: the beat is read again
  await page.settle();
  assert.equal(pill(4).getAttribute('aria-pressed'), 'true', 'and shows on the screen');
  assert.equal(pill(7).getAttribute('aria-pressed'), 'true');
  ctx.currentTime = 0;
});

test('where the two changes cannot be told apart, the synced copy is kept as a beat of its own', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  const mine = theBeat();
  assert.ok(mine);
  ctx.currentTime = 200;
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'playing');
  // Another device took the row's sound away: rows with no sound to match by cannot be merged.
  const synced = structuredClone(theBeat());
  synced.rows[0].clipId = null;
  synced.rows[0].steps[9] = true;
  synced.saved += 1;
  await persist('beats', synced);
  state.savedBeats = [...state.savedBeats.filter((b) => b.id !== synced.id), synced];
  await syncRedraw();
  await page.settle();
  const count = state.savedBeats.length;
  pill(11).dispatch('click');
  await page.settle();
  assert.equal(state.savedBeats.length, count + 1, 'the synced copy is saved too');
  const aside = state.savedBeats.find((b) => /\(synced\)$/.test(b.name));
  assert.ok(aside, 'under a name that says so');
  assert.equal(aside.rows[0].clipId, null);
  assert.equal(aside.rows[0].steps[9], true, 'with the other device\'s hit');
  assert.notEqual(aside.id, synced.id);
  assert.equal(state.savedBeats.find((b) => b.id === synced.id).rows[0].steps[11], true, 'this device\'s tap is in the beat');
  assert.match($('#banner-text').textContent, /kept as/);
  pill(11).dispatch('click');   // off again: the copy is already kept, no second one
  await page.settle();
  assert.equal(state.savedBeats.length, count + 1, 'one synced copy, not one a tap');
  assert.equal(state.savedBeats.find((b) => b.id === synced.id).rows[0].steps[11], false);
  $('#seq-play').dispatch('click');
  ctx.currentTime = 0;
});
