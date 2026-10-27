// Backup format 1.2 (ADR 0001): 💾 Save a backup and ⬇️ Export a backup of
// one person put each own sound in "as heard", the audio as the pad plays it
// (audio.load: voice, knobs, trim, edits, fade), beside the original, so v2
// plays it without a voice engine. A sound that won't render goes without,
// and the backup still saves. The real app, with the audio engine's load
// stood in (the tests have no sound).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { fakeBuffer } from './helpers.mjs';
import { unzip } from '../web/zip.js';

let page;
let $;
let audio;
const loaded = [];

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  const { state } = await import('../web/state.js');
  ({ audio } = await import('../web/audio.js'));
  audio.wake = () => {};
  // What the pad plays: Juno's first sound is 400 frames of 0.5 with a silent tail, the second can't render.
  audio.load = async (clip) => {
    loaded.push(clip.id);
    if (clip.id === 'user-j2') throw new Error('did not decode');
    return { buffer: fakeBuffer([Array.from({ length: 800 }, (_, i) => (i < 400 ? 0.5 : 0))], 8000), duration: 0.05 };
  };
  for (let i = 1; i <= 2; i++) state.userClips.push({ id: `user-j${i}`, personId: 'juno', label: `Juno sound ${i}`, emoji: '🐸', created: i, voice: 'chipmunk', blob: new Blob([new Uint8Array([i, i])], { type: 'audio/webm' }), mime: 'audio/webm' });
  await page.settle();
});

// Runs `act` (a tap that saves) and returns the zip it downloaded, unpacked.
async function saved(act) {
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
  const files = await unzip(blob);
  return { files, doc: JSON.parse(new TextDecoder().decode(files.get('backup.json'))) };
}

test('💾 Save a backup puts each own sound in as heard; the one that will not render goes without', async () => {
  const { files, doc } = await saved(async () => { $('#backup-save').dispatch('click'); await page.settle(); });
  assert.equal(doc.format, '1.2');
  const byId = Object.fromEntries(doc.clips.map((c) => [c.id, c]));
  assert.equal(byId['user-j1'].heard, 'sounds/user-j1.heard.wav');
  assert.ok(!('heard' in byId['user-j2']), 'it did not render');
  assert.deepEqual(files.get('sounds/user-j2.webm'), new Uint8Array([2, 2]), 'its original is in the backup all the same');
  assert.deepEqual(files.get('sounds/user-j1.webm'), new Uint8Array([1, 1]), 'the original is as it was recorded');
  const wav = files.get('sounds/user-j1.heard.wav');
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(24, true), 8000, 'the sample rate it plays at');
  assert.equal(view.getUint32(40, true), 400 * 2, 'only the 0.05 s that plays, not the silent tail');
  assert.match($('#banner-text').textContent, /^Saved a backup/);
});

test('⬇️ Export a backup of one person carries the same heard copies', async () => {
  loaded.length = 0;
  const { savePersonBackup } = await import('../web/backup-ui.js');
  const { files, doc } = await saved(() => savePersonBackup('juno', 'Juno'));
  assert.ok(doc.clips.some((c) => c.heard === 'sounds/user-j1.heard.wav'));
  assert.ok(files.has('sounds/user-j1.heard.wav'));
  assert.ok(loaded.includes('user-j1'));
});
