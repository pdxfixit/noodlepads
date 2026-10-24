// Beat Builder keeps recording through a cloud sync, and anything else that
// stops the beat ends the recording too (Ben, 2026-10-12, on a phone: "the
// beat builder recording stopped after a few loops, but the button still
// thinks it's recording"). A sync 20 s after a change stores what it pulled
// through the backup merge (backup-ui.js storeLoaded), which redraws the
// person showing; that used to call the sequencer's setPerson, which stops
// the beat, without telling Beat Builder. Sound itself needs a browser.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { keysOn, keysOff } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { state } from '../web/state.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();   // the merge reads storage back
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const wait = () => new Promise((r) => setTimeout(r, 60));

// What a cloud sync does after it pulls: the backup merge, with whatever came
// (here nothing new), as cloud.js deps().merge runs it on every sync.
async function syncMerge() {
  const { storeLoaded, whatIsHere } = await import('../web/backup-ui.js');
  const { pulledDoc } = await import('../web/cloud-sync.js');
  const { cleanBackup } = await import('../web/backup.js');
  await storeLoaded(cleanBackup(pulledDoc(state.personId, null, []), () => null, whatIsHere()));
}

async function startRecording(ctx, at) {
  keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  $('#dj-bars').querySelector('[data-bars="1"]').dispatch('click');
  ctx.currentTime = at;
  $('#dj-record').dispatch('click');
  await page.settle();
}

test('a cloud sync mid-recording leaves the beat playing and ⌨️ Keys recording, passes in', async () => {
  const { audio } = await import('../web/audio.js');
  const { getLog } = await import('../web/log.js');
  const ctx = audio.context();
  const P = 0.15;                                   // a pill at 100 BPM
  await startRecording(ctx, 2000);
  const go = 2000.05 + 16 * P;
  // Hits on every pass, the beat growing 1 → 2 → 4 bars on the way. Time
  // moves half a pill at a time, inside the sequencer's look-ahead, as it
  // does on a device that keeps up.
  const hits = new Set([0, 8, 20, 36, 70]);
  for (let half = 0; half <= 140; half++) {
    ctx.currentTime = go + (half / 2) * P;
    await new Promise((r) => setTimeout(r, 30));
    if (hits.has(half / 2)) page.key('a', { code: 'KeyA' });
  }
  assert.equal($('#dj-record').textContent, '■ Stop');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'playing before the sync');
  await syncMerge();
  await page.settle();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'still playing after the sync');
  assert.equal($('#dj-record').textContent, '■ Stop', 'still recording');
  ctx.currentTime = go + 71 * P;
  await new Promise((r) => setTimeout(r, 30));
  page.key('a', { code: 'KeyA' });
  const pills = $('#dj-grid').querySelector('.dj-grid-pills').children.filter((p) => p.tagName.toLowerCase() === 'i');
  assert.equal(pills.length, 64, 'grown to 4 bars on the way');
  $('#dj-record').dispatch('click');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'false', 'Stop stops the beat');
  assert.equal($('#dj-record').textContent, '● Record');
  assert.match($('#banner-text').textContent, /^Added 6 notes/);
  // Problem reports carry Beat Builder's own story.
  const dj = getLog().filter((e) => e.kind === 'dj').map((e) => e.data);
  assert.deepEqual(dj.map((d) => d.rec), ['start', 'grow', 'grow', 'stop']);
  assert.equal(dj[0].started, true);
  assert.equal(dj.at(-1).why, 'button');
  assert.equal(dj.at(-1).added, 6);
  assert.equal(dj.at(-1).bars, 4);
  ctx.currentTime = 0;
});

test('the beat stopped from outside (⏹ Stop all) ends the recording too: the button never says recording with nothing playing', async () => {
  const { audio } = await import('../web/audio.js');
  const { getLog } = await import('../web/log.js');
  const ctx = audio.context();
  await startRecording(ctx, 3000);
  ctx.currentTime = 3000.05 + 16 * 0.15;
  await wait();
  page.key('a', { code: 'KeyA' });
  assert.equal($('#dj-record').textContent, '■ Stop');
  $('#stop-all').dispatch('click');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'false');
  assert.equal($('#dj-record').textContent, '● Record', 'the recording ended with the beat');
  assert.match($('#banner-text').textContent, /^Added 1 note/);
  assert.equal(getLog().filter((e) => e.kind === 'dj').at(-1).data.why, 'stopped');
  ctx.currentTime = 0;
});

// 🆕 New stops first, so the recording ends and its note is saved in the
// beat it went into (here the scratch); then New keeps that scratch in
// 🗂️ My beats, note and all, and opens a blank one.
test('🆕 New mid-recording ends the recording cleanly; the note is kept in 🗂️ My beats and the scratch is blank', async () => {
  const { audio } = await import('../web/audio.js');
  const { getLog } = await import('../web/log.js');
  const ctx = audio.context();
  await startRecording(ctx, 4000);
  assert.equal($('#dj-beatbar').querySelector('[data-beat-name]').value, 'Scratch beat');
  ctx.currentTime = 4000.05 + 16 * 0.15;
  await wait();
  page.key('a', { code: 'KeyA' });
  const hitsOf = (b) => b?.rows.reduce((n, r) => n + r.steps.filter(Boolean).length, 0) ?? 0;
  const scratch = () => state.savedBeats.find((b) => b.id.startsWith('beat-scratch-') && b.personId === state.personId);
  const mine = () => state.savedBeats.filter((b) => !b.id.startsWith('beat-scratch-') && b.personId === state.personId);
  const before = new Set(mine().map((b) => b.id));
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  assert.equal($('#dj-record').textContent, '● Record', 'not recording into the new beat');
  assert.equal(getLog().filter((e) => e.kind === 'dj').at(-1).data.why, 'stopped');
  assert.equal($('#dj-beatbar').querySelector('[data-beat-name]').value, 'Scratch beat');
  assert.equal(hitsOf(scratch()), 0, 'a blank scratch');
  const kept = mine().filter((b) => !before.has(b.id));
  assert.equal(kept.length, 1, 'the scratch joined 🗂️ My beats');
  assert.equal(hitsOf(kept[0]), 1, 'with the note recorded');
  assert.equal(hasUndo(), false, 'nothing was lost: no Undo');
  $('#stop-all').dispatch('click');
  ctx.currentTime = 0;
});
