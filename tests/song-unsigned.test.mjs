// A beat saved before beats had their own time signature: its pass in a
// 🎼 Song (song.js beatSteps, which sizes its block) is as long as the beat
// maker planned it for its person: the old Settings signature with Advanced
// on, else 4/4. That answer is now written into the beat as it comes in
// (old-beats.js, backup.js cleanBackup), so nothing reads Settings to guess.
// Checked through the real app, by rendering the song as 🗂️ See all does and
// reading when each pass's first hit is booked.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { FakeOfflineAudioContext } from './helpers.mjs';

let page;
let $;
let state;
let setSetting;
const starts = [];   // when each rendered hit starts

class Recording extends FakeOfflineAudioContext {
  createBufferSource() {
    return { buffer: null, playbackRate: { value: 1 }, connect: (n) => n, stop() {}, start: (at) => starts.push(at) };
  }
}

before(async () => {
  console.error = () => {};
  globalThis.OfflineAudioContext = Recording;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ setSetting } = await import('../web/settings.js'));
  const { audio } = await import('../web/audio.js');
  audio.load = async () => ({ buffer: { duration: 0.1 }, duration: 0.1 });
  audio.start = () => {};   // See all then plays what it rendered; that needs a browser
  audio.wake();
  audio.ctx.sampleRate = 48000;
  const who = state.personId;
  const clip = state.manifest.people.find((p) => p.id === who).clips[0].id;
  // One bar, a hit on its first pill, no signature, as beats were stored before
  // each had its own. They come in through a 1.0 backup, as they do for a kid
  // (backup.js cleanBackup), which stamps them with the signature they were
  // read in. Old song: its person had Advanced on with an old 3/4. Other song:
  // Advanced off.
  const { cleanBackup } = await import('../web/backup.js');
  const here = { peopleIds: new Set([who]), clipIds: new Set(), colorOk: () => true, addedPeopleIds: new Set() };
  const bring = (beatId, name, values, signature) => {
    const beat = { id: beatId, personId: who, name: 'Old one', bpm: 100, bars: 1, swing: 0, saved: 1, created: 1,
      rows: [{ clipId: clip, steps: Array.from({ length: 16 }, (_, i) => i === 0), accents: Array(16).fill(false), rate: 1, ring: false, muted: false }] };
    const cleaned = cleanBackup({ people: [], beats: [beat], prefs: [{ personId: who, values }] }, () => null, here);
    assert.equal(cleaned.beats[0].signature, signature, 'stamped on the way in');
    state.savedBeats.push(...cleaned.beats);
    state.songbook.push({ id: `song-${beatId}`, personId: who, name, tempo: 100, saved: 1, created: 1,
      lanes: [{ name: 'Drums', emoji: '🥁', muted: false, volume: 1, blocks: [{ beatId, bar: 0, times: 2 }] }] });
  };
  bring('beat-unsigned-34', 'Old song', { advancedBeats: true, level: 'advanced', timeSignature: '3/4' }, '3/4');
  bring('beat-unsigned-44', 'Other song', { advancedBeats: false, level: 'regular', timeSignature: '3/4' }, '4/4');
  await page.settle();
});

// The song rendered as See all plays it: when each hit starts, in seconds.
async function rendered(song = 'Old song') {
  if ($('#things-dialog').open) $('#things-dialog').querySelector('[data-close]').dispatch('click');
  if (!$('#profile-dialog').open) {
    if (!$('#people-dialog').open) $('#people-open').dispatch('click');
    $('#people-edit').children.find((r) => r.dataset.person === state.personId).querySelector('[data-profile]').dispatch('click');
  }
  $('#profile-counts').dispatch('click');
  await page.settle();
  $('#things-chips').children.find((c) => c.dataset.show === 'songs').dispatch('click');
  starts.length = 0;
  $('#things-list').querySelectorAll('.sa-row').find((r) => r.querySelector('.sa-name')?.textContent === song).dispatch('click');
  await page.settle();
  return starts.map((t) => Math.round(t * 100) / 100);
}

// A pill at 100 BPM is 0.15 s: 12 pills are 1.8 s, 16 are 2.4 s.
test('a beat saved with Advanced on and an old 3/4 still plays 12 pills a pass in a song, as the beat maker planned it', async () => {
  assert.deepEqual(await rendered('Old song'), [0, 1.8], 'the second pass starts on pill 12, with no gap');
});

test('a beat saved with Advanced off is 4/4, 16 pills a pass', async () => {
  assert.deepEqual(await rendered('Other song'), [0, 2.4]);
});

test('the stamp is the beat\'s own now: changing Settings afterwards changes neither pass', async () => {
  await setSetting('advancedBeats', false);
  await page.settle();
  assert.deepEqual(await rendered('Old song'), [0, 1.8]);
  await setSetting('advancedBeats', true);
  await setSetting('timeSignature', '3/4');
  await page.settle();
  assert.deepEqual(await rendered('Other song'), [0, 2.4]);
});
