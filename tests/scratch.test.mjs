// The scratch beat and song (ADR 0020): one of each per person, open
// whenever nothing else is, never listed, kept on purpose with 💾 Keep. The
// pure parts (scratch.js, names.js keptName), that the scratch travels in a
// backup and the cloud as an ordinary record, 🧸 Kids' old beat becoming the
// scratch, then the real app on the stand-in page. The groove and Keep flows
// on Beats are in app.test.mjs and dj-grooves.test.mjs; layout needs a
// browser (`just look keep`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  scratchId, songScratchId, isScratch, isScratchSong, isHiddenBeat, scratchOf, songScratchOf,
  adoptKidsBeats, grooveOf, scratchLabel, hasHits, SCRATCH_NAME,
  kidsBeatId, kidsBeatOf, isKidsOwnBeat, isKidsBeat, KIDS_BEAT_NAME,
} from '../web/scratch.js';
import { keptName, MAX_NAME } from '../web/names.js';
import { BEAT_ID } from '../web/beat.js';
import { SONG_ID } from '../web/playlist.js';
import { makeBackup, readBackup, intoPerson } from '../web/backup.js';
import { recordsOf } from '../web/cloud-sync.js';
import { GROOVES } from '../web/grooves.js';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { dropBeat } from './song-ui.mjs';

const beat = (id, personId, hits, extra = {}) => ({
  id, personId, name: 'Beat', bpm: 100, bars: 1, created: 1, saved: 1,
  rows: [{ clipId: `${personId}-kick`, steps: [hits, false, false, false] }], ...extra,
});

test('a scratch has a reserved id made from the person\'s, which every cleaner accepts', () => {
  assert.equal(scratchId('p-mv4cyiqj-b8bt'), 'beat-scratch-p-mv4cyiqj-b8bt');
  assert.equal(songScratchId('p-mv4cyiqj-b8bt'), 'song-scratch-p-mv4cyiqj-b8bt');
  assert.ok(BEAT_ID.test(scratchId('p-mv4cyiqj-b8bt')));
  assert.ok(SONG_ID.test(songScratchId('p-mv4cyiqj-b8bt')));
  assert.ok(BEAT_ID.test(scratchId(`p-${'x'.repeat(70)}`)), 'a long id is cut to fit');
  assert.ok(BEAT_ID.test(scratchId('Odd Name!')), 'odd letters become dashes');
  assert.ok(isScratch({ id: 'beat-scratch-pip' }) && !isScratch({ id: 'beat-123' }));
  assert.ok(isScratchSong({ id: 'song-scratch-pip' }) && !isScratchSong({ id: 'song-1' }));
  assert.ok(isHiddenBeat({ id: 'beat-kids-abc' }), '🧸 Kids\' old beat is never listed either');
});

test('a person\'s scratch is found by its prefix and person, after their id changed too; the newest wins', () => {
  const list = [beat('beat-scratch-old-id', 'p-new', true, { saved: 5 }), beat('beat-scratch-p-new', 'p-new', false, { saved: 9 }), beat('beat-scratch-p-other', 'p-other', true)];
  assert.equal(scratchOf(list, 'p-new').id, 'beat-scratch-p-new');
  assert.equal(scratchOf(list, 'p-none'), null);
  assert.equal(songScratchOf([{ id: 'song-scratch-x', personId: 'p-a' }], 'p-a').id, 'song-scratch-x');
});

test('a scratch from a groove is stored under the groove\'s name, and shows it', () => {
  assert.equal(grooveOf({ id: 'beat-scratch-a', name: 'Ska' }).id, 'ska');
  assert.equal(grooveOf({ id: 'beat-scratch-a', name: SCRATCH_NAME }), null);
  assert.equal(grooveOf({ id: 'beat-1', name: 'Ska' }), null, 'only a scratch');
  assert.equal(scratchLabel({ id: 'beat-scratch-a', name: 'Ska' }), 'Ska (scratch)');
  assert.equal(scratchLabel({ id: 'beat-scratch-a', name: 'Beat' }), 'Scratch beat', 'a name a backup gave is not a groove');
});

test('a scratch stored under a groove\'s old name finds it, and shows the new name', () => {
  // "Motown" became Detroit soul (no product names, 2026-10-26).
  assert.equal(grooveOf({ id: 'beat-scratch-a', name: 'Motown' })?.id, 'motown');
  assert.equal(scratchLabel({ id: 'beat-scratch-a', name: 'Motown' }), 'Detroit soul (scratch)');
  assert.equal(scratchLabel({ id: 'beat-scratch-a', name: 'Detroit soul' }), 'Detroit soul (scratch)');
});

test('💾 Keep names a groove "<fun name> (<groove> version)", shorter when it must, never over 24, never taken', () => {
  const pick = () => 0;
  assert.match(keptName('Ska', [], Math.random), /^\S+ \S+ \(Ska version\)$/);
  assert.match(keptName('House', [], Math.random), /^\S+ \(House version\)$/, 'the noun alone when the whole fun name won\'t fit');
  assert.match(keptName('Bossa nova', [], Math.random), /^\S+ \S+ \(Bossa nova\)$/, 'then without "version"');
  assert.equal(keptName('Reggae one-drop', [], pick), 'Reggae one-drop version');
  assert.equal(keptName('Four on the floor', [], pick), 'Four on the floor', 'then the groove\'s own name');
  assert.equal(keptName('Four on the floor', ['four on the floor'], pick), 'Four on the floor 2');
  for (const g of GROOVES) {
    for (let i = 0; i < 5; i++) assert.ok(keptName(g.name, [], Math.random).length <= MAX_NAME, g.name);
  }
  const first = keptName('Ska', [], pick);
  assert.notEqual(keptName('Ska', [first], pick), first, 'a name already in 🗂️ Beats is skipped');
  assert.ok(keptName('', [], Math.random).length > 0, 'no groove: a plain fun name');
});

test('🧸 Kids\' old beat becomes the scratch when the scratch has no hits; else a beat of its own; an empty one goes', () => {
  let n = 0;
  const makeId = () => `beat-made-${++n}`;
  // No scratch yet: the kids beat becomes it, under the scratch's id and name.
  let out = adoptKidsBeats([beat('beat-kids-a1', 'p-a', true, { name: '🧸 My beat' })], 'p-a', makeId, 7);
  assert.deepEqual(out.remove, ['beat-kids-a1']);
  assert.equal(out.put.length, 1);
  assert.equal(out.put[0].id, 'beat-scratch-p-a');
  assert.equal(out.put[0].name, SCRATCH_NAME);
  assert.ok(hasHits(out.put[0]));
  // An empty scratch is replaced in place.
  out = adoptKidsBeats([beat('beat-scratch-old', 'p-a', false), beat('beat-kids-a1', 'p-a', true)], 'p-a', makeId);
  assert.equal(out.put[0].id, 'beat-scratch-old');
  // A scratch with hits stays; the kids beat joins 🗂️ Beats under a new id.
  out = adoptKidsBeats([beat('beat-scratch-p-a', 'p-a', true), beat('beat-kids-a1', 'p-a', true, { name: '🧸 My beat' })], 'p-a', makeId);
  assert.deepEqual(out.put.map((b) => [b.id, b.name]), [['beat-made-1', '🧸 My beat']]);
  assert.deepEqual(out.remove, ['beat-kids-a1']);
  // An empty one just goes; another person's is left alone.
  out = adoptKidsBeats([beat('beat-kids-a1', 'p-a', false), beat('beat-kids-b1', 'p-b', true)], 'p-a', makeId);
  assert.deepEqual(out, { put: [], remove: ['beat-kids-a1'] });
  assert.deepEqual(adoptKidsBeats([beat('beat-1', 'p-a', true)], 'p-a', makeId), { put: [], remove: [] });
});

test('the scratch backs up and syncs as an ordinary record: no new store, kind or format', async () => {
  const bundled = { peopleIds: new Set(['pip']), clipIds: new Set(['pip-kick']), colorOk: () => true };
  const state = {
    people: [{ id: 'pip', name: 'Pip', color: '#1F3FA8' }], clips: [],
    beats: [beat('beat-scratch-pip', 'pip', true, { name: 'Ska' })],
    songbook: [{ id: 'song-scratch-pip', personId: 'pip', name: 'Scratch', slots: [], created: 1, saved: 1 }],
  };
  const out = await readBackup(await makeBackup(state), bundled);
  assert.equal(out.beats[0].id, 'beat-scratch-pip');
  assert.equal(out.beats[0].name, 'Ska', 'the groove it came from comes back too');
  assert.equal(out.songbook[0].id, 'song-scratch-pip');
  const records = recordsOf({ beats: state.beats, songbook: state.songbook }, 'pip');
  assert.ok(records.has('beats:beat-scratch-pip'));
  assert.ok(records.has('songbook:song-scratch-pip'));
});

// 🧸 Kids' own beat (Ben, 2026-10-27): a hidden record in `beats` of its own,
// apart from the scratch. Its id is neither of the two prefixes an older copy
// of the app acts on (`beat-scratch-`, and `beat-kids-`, which it adopts into
// the scratch), so an older app leaves it alone and just lists it.
test('🧸 Kids\' own beat has a reserved id the cleaners accept, is hidden, and is found by person', () => {
  assert.equal(kidsBeatId('p-mv4cyiqj-b8bt'), 'beat-kidsown-p-mv4cyiqj-b8bt');
  assert.ok(BEAT_ID.test(kidsBeatId('p-mv4cyiqj-b8bt')) && BEAT_ID.test(kidsBeatId(`p-${'x'.repeat(70)}`)));
  const own = beat(kidsBeatId('p-a'), 'p-a', true, { name: KIDS_BEAT_NAME });
  assert.ok(isKidsOwnBeat(own) && isHiddenBeat(own));
  assert.ok(!isScratch(own), 'never the scratch');
  assert.equal(scratchOf([own], 'p-a'), null, 'the scratch is not found among it');
  assert.equal(kidsBeatOf([own, beat(scratchId('p-a'), 'p-a', true)], 'p-a').id, 'beat-kidsown-p-a');
  assert.equal(kidsBeatOf([own], 'p-b'), null, 'by person');
  assert.equal(kidsBeatOf([beat('beat-kidsown-old-id', 'p-a', true, { saved: 9 }), own], 'p-a').id, 'beat-kidsown-old-id', 'found by prefix after a re-id; the newest wins');
});

test('an older app leaves 🧸 Kids\' own beat alone: its id is neither the scratch\'s prefix nor the old Kids beat\'s', () => {
  const own = beat(kidsBeatId('p-a'), 'p-a', true, { name: KIDS_BEAT_NAME });
  // What the older code tested (scratch.js before this change): both by `startsWith`.
  assert.ok(!own.id.startsWith('beat-scratch-') && !own.id.startsWith('beat-kids-'));
  assert.ok(!isKidsBeat(own));
  assert.deepEqual(adoptKidsBeats([own], 'p-a', () => 'beat-made'), { put: [], remove: [] }, 'not adopted into the scratch');
  assert.match(KIDS_BEAT_NAME, /^🧸 /, 'where it is listed (an older app), it wears 🧸 like a kept tune');
});

test('🧸 Kids\' own beat backs up, syncs and is renamed for another person like the scratch; an old backup without it loads', async () => {
  const bundled = { peopleIds: new Set(['pip']), clipIds: new Set(['pip-kick']), colorOk: () => true };
  const own = beat(kidsBeatId('pip'), 'pip', true, { name: KIDS_BEAT_NAME });
  const state = {
    people: [{ id: 'pip', name: 'Pip', color: '#1F3FA8' }], clips: [],
    beats: [beat('beat-scratch-pip', 'pip', true, { name: 'Ska' }), own],
  };
  const out = await readBackup(await makeBackup(state), bundled);
  assert.deepEqual(out.beats.map((b) => b.id).sort(), ['beat-kidsown-pip', 'beat-scratch-pip']);
  assert.equal(out.beats.find((b) => b.id === 'beat-kidsown-pip').name, KIDS_BEAT_NAME);
  assert.ok(recordsOf({ beats: state.beats }, 'pip').has('beats:beat-kidsown-pip'), 'syncs as an ordinary beats record');
  const moved = intoPerson({ beats: state.beats, patterns: [], songs: [], songbook: [] }, 'pip', 'toby');
  assert.deepEqual(moved.beats.map((b) => b.id).sort(), ['beat-kidsown-toby', 'beat-scratch-toby']);
  // A backup from before has none of it, and loads as it always did.
  const old = await readBackup(await makeBackup({ ...state, beats: [state.beats[0]] }), bundled);
  assert.deepEqual(old.beats.map((b) => b.id), ['beat-scratch-pip']);
});

// ── the real app ──

let page;
let $;
let state;
const people = () => $('#people').querySelectorAll('[data-person]');
const bar = () => document.querySelectorAll('.beat-bar')[0];
const nameShown = () => bar().querySelector('[data-beat-name]').value;
const reshow = () => { people()[1].dispatch('click'); people()[0].dispatch('click'); };

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  ({ state } = await import('../web/state.js'));
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('a 🧸 Kids beat from before is adopted as the scratch: Beats opens it, and it is not in 🗂️ Beats or the chips', async () => {
  const pid = state.personId;
  state.savedBeats = [...state.savedBeats, beat('beat-kids-zz9', pid, true, { name: '🧸 My beat' }), beat('beat-one', pid, true, { name: 'One' }), beat('beat-two', pid, true, { name: 'Two' })];
  reshow();
  assert.ok(!state.savedBeats.some((b) => b.id === 'beat-kids-zz9'), 'the old id is gone');
  const scratch = state.savedBeats.find((b) => b.id.startsWith('beat-scratch-') && b.personId === pid);
  assert.ok(scratch && hasHits(scratch), 'its hits are the scratch now');
  $('#beats-toggle').dispatch('click');
  assert.equal(nameShown(), 'Scratch beat');
  assert.equal(bar().querySelector('[data-beat-keep]').disabled, false, 'a scratch with rows can be kept');
  const chips = document.querySelectorAll('[data-beat-chips]')[0];
  assert.deepEqual(chips.querySelectorAll('[data-chip]').map((c) => c.dataset.chip), ['beat-one', 'beat-two'], 'the chips leave it out');
  bar().querySelector('[data-beat-open]').dispatch('click');
  assert.deepEqual($('#lib-list').children.map((li) => li.dataset.id).sort(), ['beat-one', 'beat-two'], 'so does 🗂️ Beats');
  $('#library').close();
  // The strip of beats on 🎼 Song shows the scratch, first (it has hits), and no other hidden beat.
  $('#song-tab').dispatch('click');
  const strip = $('#song-beats').children.map((c) => c.dataset.beat);
  assert.ok(strip[0].startsWith('beat-scratch-'), 'the scratch is first in the strip');
  assert.deepEqual(strip.slice(1).sort(), ['beat-one', 'beat-two']);
  $('#pads-tab').dispatch('click');
});

test('a kids beat that arrives when the scratch already has hits joins 🗂️ Beats instead', () => {
  const pid = state.personId;
  state.savedBeats = [...state.savedBeats, beat('beat-kids-late', pid, true, { name: '🧸 My beat' })];
  reshow();
  const mine = state.savedBeats.filter((b) => b.personId === pid);
  assert.ok(!mine.some((b) => b.id === 'beat-kids-late'));
  assert.ok(mine.some((b) => b.name === '🧸 My beat' && !isHiddenBeat(b)), 'kept, with its hits, where it can be found');
});

test('the scratch survives showing the person again, and 💾 Keep with a playing beat carries on playing', async () => {
  $('#beats-toggle').dispatch('click');
  const scratchRows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row')).length;
  const rows = scratchRows();
  reshow();
  $('#beats-toggle').dispatch('click');
  assert.equal(nameShown(), 'Scratch beat');
  assert.equal(scratchRows(), rows, 'read back from the library, not made again');
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true');
  bar().querySelector('[data-beat-keep]').dispatch('click');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'still playing');
  assert.notEqual(nameShown(), 'Scratch beat');
  assert.equal(bar().querySelector('[data-beat-keep]').hidden, true);
  assert.ok(!state.savedBeats.some((b) => b.id.startsWith('beat-scratch-') && b.personId === state.personId), 'the scratch starts empty again');
  $('#seq-play').dispatch('click');
});

test('🎼 Song: the scratch song is open by default; 💾 Keep makes it a song in 🗂️ Songs with a fun name', () => {
  $('#song-tab').dispatch('click');
  const pid = state.personId;
  const scratchSong = () => state.songbook.find((s) => s.personId === pid && s.id.startsWith('song-scratch-'));
  assert.equal($('#song-name').value, 'Scratch song');
  assert.equal($('#song-keep').disabled, true);
  dropBeat($);
  assert.ok(scratchSong(), 'saved once it changes');
  assert.equal(state.songs.has(pid), false, 'the scratch open is no record');
  $('#song-open').dispatch('click');
  assert.equal($('#songs-list').children.length, 0, 'not in 🗂️ Songs');
  $('#songs').close();
  assert.equal($('#song-keep').disabled, false);
  $('#song-keep').dispatch('click');
  const name = $('#song-name').value;
  assert.notEqual(name, 'Scratch song');
  assert.ok(!$('#song-name').readOnly);
  assert.equal($('#song-keep').hidden, true);
  assert.equal($('#song-rename').hidden, false);
  assert.equal(state.songs.get(pid).name, name, 'the open song now');
  assert.equal(scratchSong(), undefined, 'the scratch starts empty again');
  $('#song-open').dispatch('click');
  assert.deepEqual($('#songs-list').children.map((li) => li.querySelector('.lib-name').textContent), [name]);
  $('#songs').close();
  $('#pads-tab').dispatch('click');
});

test('Share lists no scratch: Keep it first', async () => {
  const { shareable } = await import('../web/cloud.js');
  const pid = state.personId;
  state.savedBeats = [...state.savedBeats, beat(scratchId(pid), pid, true)];
  const list = shareable(pid);
  assert.ok(!list.beat.some((b) => b.id.startsWith('beat-scratch-')));
  assert.ok(list.beat.length > 0);
});

// Ben, 2026-10-12: 📂 Open names the collection now, where opening, copies,
// pins and deletes live, like 🎬 Takes.
// In the beat bar it follows 💃 and ⌨️: just 🗂️ under 560 px, the word
// from data-word on wider screens (the words overflowed at 320 px): "Beats",
// to save room (Ben, 2026-10-19); its name and its dialog say Beats.
test('the beat bar\'s 📂 Open is 🗂️ Beats (worded Beats), and Song\'s is 🗂️ Songs, dialogs too', () => {
  for (const b of document.querySelectorAll('[data-beat-open]')) {
    assert.equal(b.textContent, '🗂️');
    assert.equal(b.dataset.word, 'Beats');
    assert.match(b.getAttribute('aria-label'), /^🗂️ Beats/);
  }
  assert.equal($('#song-open').textContent, '🗂️ Songs');
  assert.equal($('#library-title').textContent, '🗂️ Beats');
  assert.equal($('#songs-title').textContent, '🗂️ Songs');
});

// Ben, 2026-10-16: "while working on a scratch beat, the user should be able
// to click the title, and rename/save it". A name typed into the scratch's
// title keeps it under that name; an empty scratch holds the name until its
// first row (or block), then keeps itself.
test('a name typed into the scratch beat\'s title keeps it under that name, at once or with its first row', async () => {
  $('#beats-toggle').dispatch('click');
  const name = () => bar().querySelector('[data-beat-name]');
  const mine = (n) => state.savedBeats.filter((b) => b.personId === state.personId && b.name === n && !isHiddenBeat(b));
  const scratchNow = () => state.savedBeats.find((b) => b.personId === state.personId && isScratch(b));
  const rename = (n) => { name().value = n; name().dispatch('change'); };
  const newScratch = () => bar().querySelector('[data-beat-new]').dispatch('click');
  const addRow = () => { $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click'); };

  newScratch();
  assert.equal(nameShown(), 'Scratch beat');
  assert.ok(!name().readOnly, 'the title takes a name');
  rename('Moon Jam');
  assert.equal(mine('Moon Jam').length, 0, 'an empty beat is not kept');
  assert.equal(nameShown(), 'Moon Jam', 'the title shows the name it will have');
  addRow();
  await page.settle();
  assert.equal(mine('Moon Jam').length, 1, 'kept the moment it has a row');
  assert.equal(nameShown(), 'Moon Jam');
  assert.equal(bar().querySelector('[data-beat-keep]').hidden, true, 'a beat of its own now');
  assert.equal(scratchNow(), undefined, 'the scratch starts empty again');

  newScratch();
  addRow();
  rename('Moon Jam');
  assert.equal(mine('Moon Jam 2').length, 1, 'a scratch with rows is kept at once, under a name no other beat has');
  assert.equal(nameShown(), 'Moon Jam 2');

  newScratch();
  rename('Lost Jam');
  newScratch();
  addRow();
  await page.settle();
  assert.equal(mine('Lost Jam').length, 0, '🆕 New forgets the name');
  assert.ok(scratchNow(), 'and the scratch stays the scratch');
  assert.equal(nameShown(), 'Scratch beat');
  newScratch();
  $('#pads-tab').dispatch('click');
});

test('🎼 Song: a name typed into the scratch song\'s title keeps it under that name with its first block', async () => {
  $('#song-tab').dispatch('click');
  const pid = state.personId;
  $('#song-new').dispatch('click');
  assert.equal($('#song-name').value, 'Scratch song');
  assert.ok(!$('#song-name').readOnly);
  $('#song-name').value = 'Big Song';
  $('#song-name').dispatch('change');
  assert.ok(!state.songbook.some((s) => s.name === 'Big Song'), 'an empty song is not kept');
  assert.equal($('#song-name').value, 'Big Song');
  dropBeat($);
  await page.settle();
  assert.equal(state.songs.get(pid)?.name, 'Big Song', 'kept with its first block, and open');
  assert.equal($('#song-keep').hidden, true);
  assert.ok(!state.songbook.some((s) => s.personId === pid && s.id.startsWith('song-scratch-')), 'the scratch starts empty again');
  $('#song-new').dispatch('click');
  dropBeat($);
  $('#song-name').value = 'Big Song';
  $('#song-name').dispatch('change');
  assert.equal(state.songs.get(pid)?.name, 'Big Song 2', 'a scratch with blocks is kept at once, under a name of its own');
  $('#pads-tab').dispatch('click');
});
