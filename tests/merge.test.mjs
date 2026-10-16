// Loading a backup merges into the device (web/merge.js): nothing is
// replaced or doubled, a clash keeps both, and loading twice changes nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLoaded, mergeSummary, sameBytes } from '../web/merge.js';
import { soloPerson } from '../web/model.js';

const audio = (...b) => new Blob([new Uint8Array(b)], { type: 'audio/webm' });
const STORES = ['people', 'clips', 'overrides', 'orders', 'patterns', 'beats', 'settings', 'decks', 'takes', 'songs', 'songbook', 'layouts', 'voices', 'touchLayouts'];
const empty = () => Object.fromEntries(STORES.map((s) => [s, []]));
const doc = (over) => ({ ...empty(), ...over });
const KEY = { orders: 'personId', patterns: 'personId', decks: 'personId', songs: 'personId', settings: 'key' };

// The device after storing a merge, as backup-ui.js storeLoaded does it.
function stored(local, merged) {
  const out = {};
  for (const s of STORES) {
    const key = KEY[s] ?? 'id';
    const byKey = new Map(local[s].map((r) => [r[key], r]));
    for (const r of merged.put[s]) byKey.set(r[key], r);
    out[s] = [...byKey.values()];
  }
  out.people = out.people.filter((p) => !merged.dropPeople.includes(p.id));
  return out;
}

let n = 0;
const newId = (prefix) => `${prefix}-new-${++n}`;
const merge = (local, incoming) => mergeLoaded(local, incoming, { kitIds: ['kick'], newId });

const ada = { id: 'p-ada-1', name: 'Ada', color: '#1F3FA8', added: true, created: 1 };
const sound = (over = {}) => ({ id: 'user-a-1', personId: 'p-ada-1', label: 'Burp', mime: 'audio/webm', voice: 'normal', created: 2, blob: audio(1, 2, 3), ...over });

test('sameBytes compares the audio itself', async () => {
  assert.equal(await sameBytes(audio(1, 2), audio(1, 2)), true);
  assert.equal(await sameBytes(audio(1, 2), audio(1, 3)), false);
  assert.equal(await sameBytes(audio(1, 2), audio(1, 2, 3)), false);
});

test('people: matched by id; the newer rename wins by `edited`, else the device keeps its own', async () => {
  const local = doc({ people: [ada, { ...ada, id: 'p-bo-1', name: 'Bo', edited: 50 }, { ...ada, id: 'p-cy-1', name: 'Cy', edited: 10 }] });
  const incoming = doc({ people: [
    { ...ada, name: 'Ada B' },                                   // no edit stamp: the device's stays
    { ...ada, id: 'p-bo-1', name: 'Bobo', edited: 40 },           // older: the device's stays
    { ...ada, id: 'p-cy-1', name: 'Cyrus', color: '#0C5E4B', edited: 20 },   // newer: taken
    { ...ada, id: 'p-di-1', name: 'Di' },                          // new here
  ] });
  const merged = await merge(local, incoming);
  assert.deepEqual(merged.put.people.map((p) => [p.id, p.name, p.color, p.edited]), [
    ['p-cy-1', 'Cyrus', '#0C5E4B', 20],
    ['p-di-1', 'Di', '#1F3FA8', undefined],
  ]);
  assert.deepEqual(merged.added.people, 1);
  assert.equal(merged.already, 3);
});

test('a default Me is never imported, and the device\'s own goes once someone arrives', async () => {
  const myMe = soloPerson('p-me-here', 1);
  const theirMe = soloPerson('p-me-there', 1);
  // Their Me is empty: dropped. Ada arrives, so this device's empty Me goes too.
  let merged = await merge(doc({ people: [myMe] }), doc({ people: [theirMe, ada] }));
  assert.deepEqual(merged.put.people.map((p) => p.id), ['p-ada-1']);
  assert.deepEqual(merged.dropPeople, ['p-me-here']);
  // Nobody real arrives: this device keeps its Me, and theirs is still not added.
  merged = await merge(doc({ people: [myMe] }), doc({ people: [theirMe] }));
  assert.deepEqual(merged.put.people, []);
  assert.deepEqual(merged.dropPeople, []);
  // A Me with something of theirs, or renamed, is a real person on either side.
  merged = await merge(doc({ people: [myMe], orders: [{ personId: 'p-me-here', ids: [] }] }),
    doc({ people: [{ ...theirMe, edited: 5 }, ada], clips: [] }));
  assert.deepEqual(merged.put.people.map((p) => p.id), ['p-me-there', 'p-ada-1']);
  assert.deepEqual(merged.dropPeople, [], 'this Me has a pad order: stays');
  merged = await merge(doc({ people: [myMe] }), doc({ people: [theirMe], clips: [sound({ personId: 'p-me-there' })] }));
  assert.deepEqual(merged.put.people.map((p) => p.id), ['p-me-there'], 'their Me has a sound: comes with it');
  assert.deepEqual(merged.dropPeople, ['p-me-here']);
});

test('the same sound, beat, song and take are skipped; settings and per-person records stay the device\'s', async () => {
  const beat = { id: 'beat-a-1', personId: 'p-ada-1', name: 'Groove', bpm: 90, rows: [{ clipId: 'user-a-1', steps: [true] }], created: 1, saved: 2 };
  const song = { id: 'song-a-1', personId: 'p-ada-1', name: 'Tune', slots: [{ beatId: 'beat-a-1', times: 1 }], created: 1, saved: 2 };
  const take = { id: 'take-a-1', personId: 'p-ada-1', name: 'Jam', created: 1, duration: 1, events: [{ t: 0, clipId: 'user-a-1', kind: 'tap' }] };
  const local = doc({
    people: [ada], clips: [sound()], beats: [beat], songbook: [song], takes: [take],
    orders: [{ personId: 'p-ada-1', ids: ['user-a-1'] }], settings: [{ key: 'advancedBeats', value: true }],
    overrides: [{ id: 'p-ada-1-kick', label: 'Thud' }],
  });
  const incoming = doc({
    people: [ada], clips: [sound({ blob: audio(1, 2, 3) })], beats: [beat], songbook: [song], takes: [take],
    orders: [{ personId: 'p-ada-1', ids: [] }],
    settings: [{ key: 'advancedBeats', value: false }, { key: 'timeSignature', value: '3/4' }],
    overrides: [{ id: 'p-ada-1-kick', label: 'Boom' }, { id: 'p-ada-1-snare', label: 'Snap' }],
  });
  const merged = await merge(local, incoming);
  for (const s of ['people', 'clips', 'beats', 'songbook', 'takes', 'orders']) assert.deepEqual(merged.put[s], [], s);
  assert.deepEqual(merged.put.settings, [{ key: 'timeSignature', value: '3/4' }], 'only a setting this device never set');
  assert.deepEqual(merged.put.overrides.map((o) => o.id), ['p-ada-1-snare'], 'a kit edit here stays');
  assert.equal(merged.already, 5);
  assert.equal(mergeSummary(merged), 'Nothing new: 5 already here.');
});

test('a clash keeps both: the incoming record gets a new id, and everything naming it follows', async () => {
  const local = doc({
    people: [ada],
    clips: [sound()],
    beats: [{ id: 'beat-a-1', personId: 'p-ada-1', name: 'Groove', bpm: 90, rows: [], created: 1, saved: 2 }],
    songbook: [{ id: 'song-a-1', personId: 'p-ada-1', name: 'Tune', slots: [], created: 1, saved: 2 }],
  });
  const bo = { ...ada, id: 'p-bo-1', name: 'Bo' };
  const incoming = doc({
    people: [ada, bo],
    clips: [
      sound({ blob: audio(9, 9) }),                                           // same id, other audio
      sound({ id: 'user-b-2', personId: 'p-bo-1', from: { id: 'user-a-1', how: 'chop' } }),
    ],
    beats: [{ id: 'beat-a-1', personId: 'p-bo-1', name: 'Groove', bpm: 120, rows: [{ clipId: 'user-a-1', steps: [true] }], created: 1, saved: 3 }],
    songbook: [{ id: 'song-a-1', personId: 'p-bo-1', name: 'Tune', slots: [{ beatId: 'beat-a-1', times: 2 }], tempo: 100, lanes: [{ name: 'Drums', blocks: [{ beatId: 'beat-a-1', bar: 0, times: 2 }] }], created: 1, saved: 3 }],
    takes: [{ id: 'take-b-1', personId: 'p-bo-1', name: 'Jam', created: 1, duration: 1, events: [{ t: 0, clipId: 'user-a-1', kind: 'tap' }] }],
    orders: [{ personId: 'p-bo-1', ids: ['user-a-1', 'user-b-2'] }],
    patterns: [{ id: 'beat-a-1', personId: 'p-bo-1', name: 'Groove', bpm: 120, rows: [{ clipId: 'user-a-1', steps: [] }] }],
    decks: [{ personId: 'p-bo-1', keys: { KeyA: 'user-a-1', KeyB: null }, beatId: 'beat-a-1', mine: { KeyS: 'user-a-1', KeyD: null }, touch: { bands: [{ group: 'mine', size: 'm', sounds: ['user-a-1', 'user-b-2'] }] } }],
    songs: [{ id: 'song-a-1', personId: 'p-bo-1', name: 'Tune', slots: [{ beatId: 'beat-a-1', times: 2 }], tempo: 100, lanes: [{ name: 'Drums', blocks: [{ beatId: 'beat-a-1', bar: 0, times: 2 }] }] }],
    layouts: [{ id: 'layout-b-1', personId: 'p-bo-1', name: 'Party', created: 1, keys: { KeyQ: 'user-a-1', KeyW: null } }],
    touchLayouts: [{ id: 'touch-b-1', personId: 'p-bo-1', name: 'Jam pads', created: 1, bands: [{ group: 'mine', size: 'l', sounds: ['user-a-1'] }] }],
  });
  const merged = await merge(local, incoming);
  const [clip, chopped] = merged.put.clips;
  assert.notEqual(clip.id, 'user-a-1');
  assert.match(clip.id, /^user-/);
  assert.equal(chopped.id, 'user-b-2');
  assert.deepEqual(chopped.from, { id: clip.id, how: 'chop' }, 'the sound it was cut from');
  const [beat] = merged.put.beats;
  assert.match(beat.id, /^beat-new-/);
  assert.equal(beat.rows[0].clipId, clip.id);
  const [song] = merged.put.songbook;
  assert.match(song.id, /^song-new-/);
  assert.equal(song.slots[0].beatId, beat.id);
  assert.equal(song.lanes[0].blocks[0].beatId, beat.id, 'a block on a lane follows the renamed beat (ADR 0024)');
  assert.equal(merged.put.takes[0].events[0].clipId, clip.id);
  assert.deepEqual(merged.put.orders[0].ids, [clip.id, 'user-b-2']);
  assert.equal(merged.put.patterns[0].id, beat.id);
  assert.equal(merged.put.patterns[0].rows[0].clipId, clip.id);
  assert.deepEqual(merged.put.decks[0], { personId: 'p-bo-1', keys: { KeyA: clip.id, KeyB: null }, beatId: beat.id, mine: { KeyS: clip.id, KeyD: null }, touch: { bands: [{ group: 'mine', size: 'm', sounds: [clip.id, 'user-b-2'] }] } });
  assert.deepEqual(merged.put.touchLayouts[0].bands[0].sounds, [clip.id], 'a saved touch layout follows the renamed sound (ADR 0028)');
  assert.deepEqual(merged.put.layouts[0].keys, { KeyQ: clip.id, KeyW: null }, 'a saved key layout follows the renamed sound');
  assert.equal(merged.put.songs[0].id, song.id);
  assert.equal(merged.put.songs[0].slots[0].beatId, beat.id);
  assert.equal(merged.put.songs[0].lanes[0].blocks[0].beatId, beat.id);
  assert.deepEqual(merged.added, { people: 1, sounds: 2, beats: 1, songs: 1, takes: 1, layouts: 1, voices: 0, touchLayouts: 1 });
  assert.equal(mergeSummary(merged), 'Added 🔊 2 sounds, 🥁 1 beat, 🎼 1 song, 🎬 1 take, ⌨️ 1 key layout, 👆 1 touch layout, 👥 1 person; 1 already here.');

  // Loading the same backup again changes nothing: each renamed record is found under its new id.
  const after = stored(local, merged);
  const again = await merge(after, incoming);
  for (const s of STORES) assert.deepEqual(again.put[s], [], s);
  assert.deepEqual(again.added, { people: 0, sounds: 0, beats: 0, songs: 0, takes: 0, layouts: 0, voices: 0, touchLayouts: 0 });
});

test('mergeSummary says what came and what was already here', () => {
  const none = { people: 0, sounds: 0, beats: 0, songs: 0, takes: 0 };
  assert.equal(mergeSummary({ added: none, already: 0 }), 'Nothing new.');
  assert.equal(mergeSummary({ added: { ...none, sounds: 3, beats: 2 }, already: 4 }), 'Added 🔊 3 sounds, 🥁 2 beats; 4 already here.');
  assert.equal(mergeSummary({ added: { ...none, people: 2 }, already: 0 }), 'Added 👥 2 people.');
});

test('a newer look brings its avatar and fun name too', async () => {
  const local = doc({ people: [{ ...ada, edited: 5 }] });
  const merged = await merge(local, doc({ people: [{ ...ada, name: 'Agent Alpaca', avatar: '🐙', fun: true, edited: 9 }] }));
  assert.deepEqual(merged.put.people.map((p) => [p.name, p.avatar, p.fun, p.edited]), [['Agent Alpaca', '🐙', true, 9]]);
});

test("a kid's own voices merge by id: one voice per id, the newer rename wins and keeps the latest use", async () => {
  const squeaky = { id: 'voice-a-1', personId: 'p-ada-1', name: 'Squeaky', emoji: '🦄', knobs: { pitch: 7 }, created: 1, used: 5 };
  const local = doc({ people: [ada], voices: [squeaky] });
  const used = await merge(local, doc({ people: [ada], voices: [{ ...squeaky, used: 99 }] }));
  assert.deepEqual(used.put.voices, [{ ...squeaky, used: 99 }], 'used elsewhere later: the same voice, its latest use');
  assert.equal(used.added.voices, 0);
  assert.deepEqual((await merge(local, doc({ people: [ada], voices: [{ ...squeaky, used: 2 }] }))).put.voices, [], 'nothing newer: nothing to store');

  const renamed = { ...squeaky, name: 'Squeakier', edited: 3, used: 4 };
  const boom = { ...squeaky, id: 'voice-b-2', name: 'Boom box', knobs: { echo: 2 } };
  const merged = await merge(local, doc({ people: [ada], voices: [renamed, boom] }));
  assert.deepEqual(merged.put.voices, [{ ...renamed, used: 5 }, boom], 'the rename is newer than how it was made');
  assert.equal(merged.added.voices, 1);
  assert.equal(mergeSummary(merged), 'Added ⭐ 1 own voice; 2 already here.');
  const older = await merge(doc({ people: [ada], voices: [{ ...squeaky, name: 'Mine now', edited: 9 }] }), doc({ people: [ada], voices: [renamed] }));
  assert.deepEqual(older.put.voices, [], "the device's newer rename stays");
  const again = await merge(stored(local, merged), doc({ people: [ada], voices: [renamed, boom] }));
  assert.deepEqual(again.put.voices, [], 'loading the same twice changes nothing');
});
