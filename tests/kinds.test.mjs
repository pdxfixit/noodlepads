// One emoji per kind (model.js KIND_EMOJI, Ben 2026-10-11), and what each
// person has, as the rows of 👥 People show it (personCounts, countsText,
// countsWords).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIND_EMOJI, personCounts, countsText, countsWords } from '../web/model.js';
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
  const button = html.match(/id="dj-takes-open">([^<]*)</)?.[1];
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

test('a person\'s counts are theirs only; an open saved song counts once, an empty one not at all', () => {
  assert.deepEqual(personCounts(lists, 'p1'), { sounds: 2, beats: 1, songs: 1, takes: 2, voices: 0 });
  assert.deepEqual(personCounts(lists, 'p2'), { sounds: 1, beats: 0, songs: 0, takes: 0, voices: 0 });
  assert.deepEqual(personCounts({}, 'p1'), { sounds: 0, beats: 0, songs: 0, takes: 0, voices: 0 });
  const unsaved = { songs: [{ id: 'new', personId: 'p3', slots: [{ beatId: 'x', times: 2 }] }] };
  assert.equal(personCounts(unsaved, 'p3').songs, 1, 'an open song with something in it, not saved yet, counts');
  // A playlist song (ADR 0024) counts by the blocks on its lanes.
  assert.equal(personCounts({ songs: [{ id: 'new', personId: 'p3', lanes: [{ blocks: [] }, { blocks: [{ beatId: 'x', bar: 2, times: 1 }] }] }] }, 'p3').songs, 1);
  assert.equal(personCounts({ songs: [{ id: 'new', personId: 'p3', lanes: [{ blocks: [] }], slots: [] }] }, 'p3').songs, 0, 'empty lanes are an empty song');
  assert.equal(personCounts({ voices: [{ id: 'v', personId: 'p1' }] }, 'p1').voices, 1, '⭐ My voices count once that store exists');
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
