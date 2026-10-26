// A sound sheet whose Save the browser refuses (a full disk: IndexedDB
// aborts the write) keeps the work open to save again, and changes nothing
// in memory, so what plays until a reload is what is stored. Runs the real
// app on the stand-in page over web/'s fake IndexedDB (tests/fake-idb.mjs,
// failCommit). Nothing is heard: audio.start is a recorder.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { FakeAudioBuffer, FakeOfflineAudioContext, fakeBuffer } from './helpers.mjs';
import { DB_NAME } from '../web/store.js';

let page;
let $;
let audio;
let state;
const idb = fakeIndexedDB();
const plain = fakeBuffer([Array.from({ length: 800 }, (_, i) => Math.sin(i / 3) * 0.5)], 8000);

before(async () => {
  console.error = () => {};
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  globalThis.performance ??= { now: () => Date.now() };
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
  ({ state } = await import('../web/state.js'));
  audio.start = (id) => { audio.playing.set(id, { fake: true }); };
  audio.stop = (id) => { audio.playing.delete(id); };
});

const pads = () => $('#pads').querySelectorAll('.pad').filter((c) => c.dataset.id);
const stored = (id) => idb.rows(DB_NAME, 'clips').find((c) => c.id === id);
const openPad = async (id) => {
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  pads().find((p) => p.dataset.id === id).parent.querySelector('[data-edit]').dispatch('click');
  await page.settle();
};

test('a ✨ sound remade and saved when storage refuses: the sheet stays open, and the old sound stays', async () => {
  const { currentPerson } = await import('../web/board.js');
  const { persist } = await import('../web/state.js');
  const { renderPads } = await import('../web/pads.js');
  const clip = { id: 'user-made-1', personId: currentPerson().id, label: 'Zap', emoji: '🔫', color: 'red', created: 1, blob: new Blob(['old']), mime: 'audio/wav', voice: 'normal', synth: { tone: 'buzzy', from: 1600, to: 120, length: 0.35, shape: 'drop', pulses: 1 } };
  state.userClips.push(clip);
  await persist('clips', clip);
  renderPads();
  audio.originals.set(clip.id, Promise.resolve(plain));
  audio.originalTrims.set(clip.id, '');
  await openPad(clip.id);
  $('#make-starters').children.find((b) => b.dataset.make === 'wind').dispatch('click');   // remade
  await page.settle();
  idb.failCommit(1);
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal($('#sheet').open, true, 'still open, the remade sound in it');
  assert.match($('#sheet-error').textContent, /didn’t save/);
  const now = state.userClips.find((c) => c.id === clip.id);
  assert.equal(now.synth.length, 0.35, 'in memory it is still the old sound');
  assert.equal(await now.blob.text(), 'old');
  assert.equal(stored(clip.id).synth.length, 0.35);
  // Saved again, it goes through.
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal($('#sheet').open, false);
  assert.equal(stored(clip.id).synth.length, 2.4, 'the Wind is stored');
});

test('a ➕ mix saved when storage refuses: no new pad in memory, and the sheet stays open', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('advancedBeats', true);
  const here = pads()[0].dataset.id;
  audio.originals.set(here, Promise.resolve(plain));
  await openPad(here);
  $('#mix-btn').dispatch('click');
  const other = $('#mix-with').children[1].value;
  audio.forget(other);
  audio.originals.set(other, Promise.resolve(plain));
  $('#mix-with').value = other;
  $('#mix-with').dispatch('change');
  const before = state.userClips.length;
  idb.failCommit(1);
  $('#mix-make').dispatch('click');
  await page.settle();
  assert.equal($('#sheet').open, true);
  assert.equal(state.userClips.length, before, 'no pad that would be gone after a reload');
  assert.match($('#sheet-error').textContent, /didn’t save/);
  $('#sheet').close();
  await setSetting('advancedBeats', false);
});
