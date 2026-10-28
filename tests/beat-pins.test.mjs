// Pattern chips in one stable order, with 📌 pins (Ben, 2026-10-12: "1 and
// 3. 8 spots, minus the number of pinned items"). The order itself
// (chipBeats), and that a pin is stored on the beat record: it survives the
// beat changing, a backup, and stays the person's own when the beat is
// shared or copied. The chips on screen are in beat-chips.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipBeats, isPinned, MAX_CHIPS, MAX_PINS } from '../web/beat.js';
import { makeBackup, readBackup } from '../web/backup.js';
import { shareBundle, shareDoc } from '../web/cloud-sync.js';
import { newId } from '../web/util.js';

// Beats made at times 1, 2, 3…, used (saved) at the times given.
const beats = (saved, pinned = {}) => saved.map((s, i) => ({ id: `beat-${String(i).padStart(2, '0')}`, created: i + 1, saved: s, ...(pinned[i] ? { pinned: pinned[i] } : {}) }));
const ids = (list) => list.map((b) => b.id.slice(5));

test('8 spots: the most recently used beats, shown oldest made first', () => {
  assert.equal(MAX_CHIPS, 8);
  assert.equal(MAX_PINS, 8);
  // Ten beats, used in the order 9, 0, 1 … 8 (beat 9 longest ago).
  const all = beats([11, 12, 13, 14, 15, 16, 17, 18, 19, 10]);
  assert.deepEqual(ids(chipBeats(all)), ['01', '02', '03', '04', '05', '06', '07', '08'], 'beats 0 and 9, used longest ago, have no spot');
  assert.deepEqual(chipBeats([]), []);
});

test('tapping a chip (using its beat) never moves it, nor any other', () => {
  const all = beats([11, 12, 13, 14, 15, 16, 17, 18, 19, 10]);
  const before = ids(chipBeats(all));
  all.find((b) => b.id === 'beat-03').saved = 100;   // opened from its chip
  assert.deepEqual(ids(chipBeats(all)), before);
});

test('a beat new to the set pushes out the one used longest ago; the rest keep their order', () => {
  const all = beats([11, 12, 13, 14, 15, 16, 17, 18, 19, 10]);
  all.push({ id: 'beat-10', created: 50, saved: 50 });   // 🆕 New
  assert.deepEqual(ids(chipBeats(all)), ['02', '03', '04', '05', '06', '07', '08', '10'], 'beat 01 (used longest ago) drops out; the new one is last');
  all.find((b) => b.id === 'beat-09').saved = 60;        // an old beat opened from 🗂️ Beats
  assert.deepEqual(ids(chipBeats(all)), ['03', '04', '05', '06', '07', '08', '09', '10'], 'it comes back in its made order; 02 drops');
});

test('pinned beats come first, in pin order; the spots left are 8 minus the pins', () => {
  const all = beats([11, 12, 13, 14, 15, 16, 17, 18, 19, 10], { 9: 300, 0: 200 });
  const chips = chipBeats(all);
  assert.equal(chips.length, 8);
  assert.deepEqual(ids(chips).slice(0, 2), ['00', '09'], 'pinned first, the first pinned first');
  assert.deepEqual(ids(chips).slice(2), ['03', '04', '05', '06', '07', '08'], 'six spots left: the six used most recently, oldest made first');
  assert.ok(chips.slice(0, 2).every(isPinned));
  // Eight pins fill every spot.
  const full = beats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], Object.fromEntries([...Array(8)].map((_, i) => [i + 2, 100 - i])));
  assert.deepEqual(ids(chipBeats(full)), ['09', '08', '07', '06', '05', '04', '03', '02']);
});

test('isPinned: only a time counts as a pin', () => {
  assert.equal(isPinned({ pinned: 5 }), true);
  for (const v of [undefined, null, 0, -1, '5', NaN, true]) assert.equal(isPinned({ pinned: v }), false, String(v));
});

test('a pin goes in a backup and comes back; a bad one is dropped', async () => {
  const bundled = { peopleIds: new Set(['pip']), clipIds: new Set(['pip-kick']), colorOk: () => true };
  const beat = (id, extra) => ({ id, personId: 'pip', name: id, bpm: 90, rows: [{ clipId: 'pip-kick', steps: [true] }], created: 1, saved: 2, ...extra });
  const state = { people: [{ id: 'pip', name: 'Pip', color: '#1F3FA8' }], clips: [], beats: [beat('beat-a', { pinned: 1234 }), beat('beat-b'), beat('beat-c', { pinned: 'soon' })] };
  const out = await readBackup(await makeBackup(state), bundled);
  const by = (id) => out.beats.find((b) => b.id === id);
  assert.equal(by('beat-a').pinned, 1234);
  assert.ok(!('pinned' in by('beat-b')), 'an unpinned beat stores nothing new');
  assert.ok(!('pinned' in by('beat-c')), 'not a time: dropped');
});

test('a share code carries the beat, not its 📌: the pin is the sharer\'s own, and a remix starts unpinned', () => {
  const lists = { clips: [], beats: [{ id: 'beat-1', personId: 'p-a', name: 'Wobbly Taco', bpm: 90, rows: [{ clipId: 'p-a-kick', steps: [true] }], created: 1, saved: 2, pinned: 9 }] };
  const { bundle } = shareBundle('beat', 'beat-1', lists, 'p-a', ['kick']);
  assert.ok(!('pinned' in bundle.beats[0]));
  const { doc } = shareDoc({ ...bundle, beats: [{ ...bundle.beats[0], pinned: 9 }] }, 'p-c', ['kick'], newId, { kind: 'beat', title: 'Wobbly Taco' });
  assert.ok(!('pinned' in doc.beats[0]), 'even from a code made by an older copy');
});

// Ben, 2026-10-28: Kids keeps only its newest 20 tunes. The mark that says a
// beat is one (`kidsTune`, the name Kids gave it) travels in a backup while
// the name still matches, and never in a share code or a remix.
test('a kept Kids tune\'s mark goes in a backup while the beat keeps its name; a renamed one loses it', async () => {
  const bundled = { peopleIds: new Set(['pip']), clipIds: new Set(['pip-kick']), colorOk: () => true };
  const beat = (id, name, extra) => ({ id, personId: 'pip', name, bpm: 90, rows: [{ clipId: 'pip-kick', steps: [true] }], created: 1, saved: 2, ...extra });
  const state = { people: [{ id: 'pip', name: 'Pip', color: '#1F3FA8' }], clips: [], beats: [beat('beat-a', '🧸 Funky Moose', { kidsTune: '🧸 Funky Moose' }), beat('beat-b', 'My song', { kidsTune: '🧸 Funky Moose' }), beat('beat-c', 'Plain')] };
  const out = await readBackup(await makeBackup(state), bundled);
  const by = (id) => out.beats.find((b) => b.id === id);
  assert.equal(by('beat-a').kidsTune, '🧸 Funky Moose');
  assert.ok(!('kidsTune' in by('beat-b')), 'renamed: a beat of its own');
  assert.ok(!('kidsTune' in by('beat-c')));
});

test('a share code and a remix carry no Kids tune mark', () => {
  const lists = { clips: [], beats: [{ id: 'beat-1', personId: 'p-a', name: '🧸 Wobbly Taco', kidsTune: '🧸 Wobbly Taco', bpm: 90, rows: [{ clipId: 'p-a-kick', steps: [true] }], created: 1, saved: 2 }] };
  const { bundle } = shareBundle('beat', 'beat-1', lists, 'p-a', ['kick']);
  assert.ok(!('kidsTune' in bundle.beats[0]));
  const { doc } = shareDoc({ ...bundle, beats: [{ ...bundle.beats[0], kidsTune: '🧸 Wobbly Taco' }] }, 'p-c', ['kick'], newId, { kind: 'beat', title: 'Wobbly Taco' });
  assert.ok(!('kidsTune' in doc.beats[0]), 'even from a code made by another copy');
});
