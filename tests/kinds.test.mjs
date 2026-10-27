// One emoji per kind (model.js KIND_EMOJI, Ben 2026-10-11), and what each
// person has, as the rows of 👥 People show it (personCounts, countsText,
// countsWords) and 🗂️ See all lists it (personThings, Ben 2026-10-24).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIND_EMOJI, PERSON_KINDS, personCounts, personThings, countsText, countsWords } from '../web/model.js';
import { mergeSummary } from '../web/merge.js';

// The row's text with its no-break spaces read as spaces.
const shown = (counts) => countsText(counts).replace(/\u00a0/g, ' ');

test('every kind has its own emoji', () => {
  const emoji = Object.values(KIND_EMOJI);
  assert.equal(new Set(emoji).size, emoji.length, 'no two kinds share an emoji');
  for (const k of ['sounds', 'beats', 'songs', 'takes', 'people', 'edits', 'djKeys', 'shares', 'voices']) assert.ok(KIND_EMOJI[k], k);
  assert.ok(Object.isFrozen(KIND_EMOJI));
});

test('the emoji are the ones the app already shows for each kind', () => {
  // The toolbar and the screens' own buttons, so a kind's emoji never drifts
  // from the button a kid knows it by.
  assert.equal(KIND_EMOJI.sounds, '🔊');   // 🔊 Pads
  assert.equal(KIND_EMOJI.beats, '🥁');    // 🥁 Beats
  assert.equal(KIND_EMOJI.songs, '🎼');    // 🎼 Song
  assert.equal(KIND_EMOJI.takes, '🎬');   // 🎬 Takes
  assert.equal(KIND_EMOJI.people, '👥');   // 👥 People
});

// Ben, 2026-10-11 (Q28): "Takes are 🎬", on DJ's Takes button too.
test('the DJ Takes button wears the takes emoji', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const button = html.match(/id="dj-takes-open"[^>]*>([^<]*)</)?.[1];
  assert.equal(button, `${KIND_EMOJI.takes} Takes`);
});

const lists = {
  clips: [{ id: 'a', personId: 'p1' }, { id: 'b', personId: 'p1' }, { id: 'c', personId: 'p2' }],
  beats: [{ id: 'b1', personId: 'p1' }],
  songbook: [{ id: 's1', personId: 'p1' }],
  songs: [
    { id: 's1', personId: 'p1', slots: [{ beatId: 'b1', times: 1 }] },   // the open copy of a saved song
    { id: 's9', personId: 'p2', slots: [] },                             // open, but empty
  ],
  takes: [{ id: 't1', personId: 'p1' }, { id: 't2', personId: 'p1' }],
};

// Every kind at 0: the five a row counted first, then preset edits, key sets
// and the two kinds of layout.
const none = { sounds: 0, beats: 0, songs: 0, takes: 0, voices: 0, edits: 0, djKeys: 0, layouts: 0, touchLayouts: 0 };

test('a person\'s counts are theirs only; an open saved song counts once, an empty one not at all', () => {
  assert.deepEqual(personCounts(lists, 'p1'), { ...none, sounds: 2, beats: 1, songs: 1, takes: 2 });
  assert.deepEqual(personCounts(lists, 'p2'), { ...none, sounds: 1 });
  assert.deepEqual(personCounts({}, 'p1'), none);
  const unsaved = { songs: [{ id: 'new', personId: 'p3', slots: [{ beatId: 'x', times: 2 }] }] };
  assert.equal(personCounts(unsaved, 'p3').songs, 1, 'an open song with something in it, not saved yet, counts');
  // A playlist song (ADR 0024) counts by the blocks on its lanes.
  assert.equal(personCounts({ songs: [{ id: 'new', personId: 'p3', lanes: [{ blocks: [] }, { blocks: [{ beatId: 'x', bar: 2, times: 1 }] }] }] }, 'p3').songs, 1);
  assert.equal(personCounts({ songs: [{ id: 'new', personId: 'p3', lanes: [{ blocks: [] }], slots: [] }] }, 'p3').songs, 0, 'empty lanes are an empty song');
  assert.equal(personCounts({ voices: [{ id: 'v', personId: 'p1' }] }, 'p1').voices, 1, '⭐ Voices count once that store exists');
});

test('a row reads "🔊 2 · 🥁 1 · 🎼 1 · 🎬 2", leaves out kinds with none, and says "nothing yet" for none', () => {
  assert.equal(shown(personCounts(lists, 'p1')), '🔊 2 · 🥁 1 · 🎼 1 · 🎬 2');
  assert.equal(shown(personCounts(lists, 'p2')), '🔊 1');
  assert.equal(shown({ sounds: 0, beats: 0 }), 'nothing yet');
  assert.equal(shown(null), 'nothing yet');
  assert.equal(shown({ voices: 3 }), '⭐ 3');
  assert.ok(!/ \d| ·/.test(countsText(personCounts(lists, 'p1'))), 'a row wraps only between kinds');
  assert.equal(countsWords(personCounts(lists, 'p1')), '2 sounds, 1 beat, 1 song, 2 takes');
  assert.equal(countsWords({ sounds: 1 }), '1 sound');
  assert.equal(countsWords({}), 'nothing yet');
});

test('the notice after a backup loads names each kind with its emoji', () => {
  const none = { sounds: 0, beats: 0, songs: 0, takes: 0, people: 0 };
  assert.equal(mergeSummary({ added: { ...none, takes: 1, songs: 2 }, already: 0 }), `Added ${KIND_EMOJI.songs} 2 songs, ${KIND_EMOJI.takes} 1 take.`);
});

// 🗂️ See all (things.js) lists what the counts count, so a chip's number is
// always its list's length.
const everything = {
  clips: [
    { id: 'u-1', personId: 'p1', label: 'Big burp', emoji: '🐸', created: 100 },
    { id: 'u-2', personId: 'p1', label: 'Dino roar', emoji: '🦖', created: 300 },
    { id: 'u-3', personId: 'p2', label: 'Not mine', emoji: '🐶', created: 200 },
  ],
  beats: [
    { id: 'beat-scratch-p1', personId: 'p1', name: 'Scratch', bars: 1, bpm: 100, saved: 50 },
    { id: 'beat-ska', personId: 'p1', name: 'Funky Pickle', bars: 2, bpm: 140, saved: 400 },
  ],
  songbook: [{ id: 'song-1', personId: 'p1', name: 'Space Party', tempo: 120, lanes: [{ blocks: [{ beatId: 'beat-ska', bar: 1, times: 1 }] }, { blocks: [] }] }],
  takes: [{ id: 'take-1', personId: 'p1', name: 'Take 1', duration: 71, created: 10 }],
  voices: [{ id: 'v-1', personId: 'p1', name: 'Squeaky robot', emoji: '🤖', knobs: { pitch: 5 }, created: 20 }],
  overrides: [{ id: 'p1-kick', emoji: '🦶' }, { id: 'p1-snare', hidden: true }, { id: 'p2-kick', label: 'Theirs' }],
  decks: [{ personId: 'p1', keys: { KeyA: 'u-1', KeyB: null } }, { personId: 'p2', keys: {} }],
  layouts: [{ id: 'l-1', personId: 'p1', name: 'Zoo keys', keys: { KeyA: 'u-1' }, created: 5 }],
  touchLayouts: [{ id: 't-1', personId: 'p1', name: 'Band', bands: [{}, {}, {}], created: 6 }],
};
const preset = (kitId) => ({ kick: { label: 'Kick', emoji: '🥁' }, snare: { label: 'Snare', emoji: '🪘' } })[kitId] ?? null;

test('See all lists every kind of theirs, newest first, each with one fact', () => {
  const t = personThings(everything, 'p1', { preset, dateText: (at) => `Made ${at}` });
  assert.deepEqual(Object.keys(t), PERSON_KINDS.map(([k]) => k), 'every kind, in the chips\' order');
  assert.deepEqual(t.sounds.map((x) => [x.name, x.emoji, x.detail]), [['Dino roar', '🦖', 'Made 300'], ['Big burp', '🐸', 'Made 100']]);
  assert.deepEqual(t.beats.map((x) => [x.name, x.detail]), [['Funky Pickle', '2 bars · 140 BPM'], ['Scratch beat', '1 bar · 100 BPM']]);
  assert.deepEqual(t.songs.map((x) => [x.name, x.detail]), [['Space Party', '1 lane · 120 BPM']], 'lanes with blocks on them');
  assert.deepEqual(t.takes.map((x) => [x.name, x.detail]), [['Take 1', '1:11']]);
  assert.deepEqual(t.voices.map((x) => [x.name, x.emoji]), [['Squeaky robot', '🤖']]);
  assert.deepEqual(t.edits.map((x) => [x.id, x.name, x.emoji, x.detail]), [
    ['p1-kick', 'Kick', '🦶', 'Preset, changed'], ['p1-snare', 'Snare', '🪘', 'Preset, hidden'],
  ], 'their own presets only, by the preset\'s name, in its new picture');
  assert.deepEqual(t.djKeys.map((x) => [x.name, x.detail]), [['Keys', '2 keys changed']]);
  assert.deepEqual(t.layouts.map((x) => [x.name, x.detail]), [['Zoo keys', '1 key']]);
  assert.deepEqual(t.touchLayouts.map((x) => [x.name, x.detail]), [['Band', '3 groups']]);
  const counts = personCounts(everything, 'p1');
  for (const [k] of PERSON_KINDS) assert.equal(counts[k], t[k].length, `${k}: the count is the list`);
  assert.equal(personThings(everything, 'p2').djKeys.length, 0, 'a key set with no keys changed is none');
  assert.equal(personThings(everything, 'p2').edits[0].name, 'Theirs');
  assert.equal(shown(counts), '🔊 2 · 🥁 2 · 🎼 1 · 🎬 1 · ⭐ 1 · ✏️ 2 · 🎛️ 1 · ⌨️ 1 · 👆 1');
});

test('See all names a scratch beat or song by what it holds, and a nameless thing as such', () => {
  const t = personThings({
    beats: [{ id: 'beat-scratch-p1', personId: 'p1', name: 'Ska' }],
    songbook: [{ id: 'song-scratch-p1', personId: 'p1' }],
    clips: [{ id: 'u', personId: 'p1' }],
  }, 'p1');
  assert.equal(t.beats[0].name, 'Ska (scratch)');
  assert.equal(t.songs[0].name, 'Scratch song');
  assert.equal(t.sounds[0].name, 'No name');
  assert.equal(t.sounds[0].emoji, KIND_EMOJI.sounds, 'no picture: the kind\'s emoji');
});
