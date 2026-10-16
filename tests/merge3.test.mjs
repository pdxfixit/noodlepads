// Three-way merge of synced records (web/merge3.js), and the `changed` stamp
// it reads: kept by backups and the cloud, never content.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampEdit, cleanStamp, STAMP, merge3, resolve, sameContent, stampOf } from '../web/merge3.js';
import { cleanBackup } from '../web/backup.js';
import { mergeLoaded } from '../web/merge.js';
import { hashOf } from '../web/cloud-sync.js';
import { legacySlots } from '../web/playlist.js';

const bundled = () => ({ peopleIds: new Set(), clipIds: new Set(), kitIds: new Set(['kick']), addedPeopleIds: new Set(['p-a']) });

test('a kid\'s edit is stamped with when it changed; people keep their own `edited`', () => {
  const beat = { id: 'beat-1', bpm: 90 };
  assert.equal(stampEdit('beats', beat, 1234), beat, 'in place, so the copy the app holds agrees');
  assert.equal(beat.changed, 1234);
  const person = { id: 'p-a' };
  stampEdit('people', person, 1234);
  assert.equal(person.changed, undefined);
  stampEdit('settings', { key: 'x' }, 1);
});

test('the stamp rides through a backup or the cloud, but never one from far in the future', () => {
  const now = Date.now();
  const doc = {
    beats: [
      { id: 'beat-1', personId: 'p-a', name: 'A', bpm: 90, rows: [], [STAMP]: now - 5 },
      { id: 'beat-2', personId: 'p-a', name: 'B', bpm: 90, rows: [], [STAMP]: now + 10 * 24 * 60 * 60 * 1000 },
    ],
    prefs: [{ personId: 'p-a', values: {}, [STAMP]: now - 7 }],
  };
  const cleaned = cleanBackup(doc, () => null, bundled());
  assert.deepEqual(cleaned.beats.map((b) => b.changed), [now - 5, undefined]);
  assert.equal(cleaned.prefs[0].changed, now - 7);
  assert.equal(cleanStamp('5'), undefined);
  assert.equal(cleanStamp(-1), undefined);
});

test('a record that differs only in its stamp is the same record: no copy from a backup, no push', async () => {
  const beat = { id: 'beat-1', personId: 'p-a', name: 'A', bpm: 90, bars: 1, swing: 0, rows: [], created: 1, saved: 1 };
  const m = await mergeLoaded({ beats: [{ ...beat, changed: 5 }] }, { beats: [{ ...beat, changed: 9 }] });
  assert.deepEqual(m.put.beats, []);
  assert.equal(m.already, 1);
  assert.equal(hashOf({ ...beat, changed: 5 }), hashOf(beat));
});

// ── the cases ──

const T = 1_700_000_000_000;
const row = (clipId, steps, extra = {}) => ({ clipId, steps: [...steps].map((c) => c === 'x'), ...extra });
const beat = (extra = {}) => ({ id: 'beat-1', personId: 'p-a', name: 'Taco', bpm: 100, bars: 1, swing: 0,
  rows: [row('kick', 'x...'), row('snare', '..x.')], created: 1, saved: 1, ...extra });
const pills = (r) => r.steps.map((on) => (on ? 'x' : '.')).join('');
const strip = (r) => { if (!r) return r; const { changed, blob, ...rest } = r; return rest; };

test('the table: what one sync does with one record', () => {
  const B = beat();
  const L = beat({ name: 'Here' });
  const R = beat({ name: 'There' });
  const cases = [
    // [what, base, local, remote, action]
    ['both gone', B, null, null, 'same'],
    ['both the same', B, L, { ...L }, 'same'],
    ['unchanged here: the cloud\'s', B, B, R, 'take'],
    ['unchanged there: this device\'s', B, L, B, 'keep'],
    ['changed on both: merged', B, L, beat({ bpm: 120 }), 'merged'],
    ['new there', null, null, R, 'take'],
    ['new here', null, L, null, 'keep'],
    ['new on both, different, with ids: keep both', null, L, R, 'keepBoth'],
    ['deleted here, unchanged there: the delete stands', B, null, B, 'keep'],
    ['deleted here, edited there: the edit comes back', B, null, R, 'take'],
    ['deleted there, unchanged here: deleted', B, B, null, 'delete'],
    ['deleted there, edited here: the edit stays', B, L, null, 'keep'],
  ];
  for (const [what, b, l, r, action] of cases) assert.equal(resolve('beats', b, l, r).action, action, what);
});

test('changed on both: a field changed on one side takes that side; on both, the newer edit wins', () => {
  const B = beat();
  const m = merge3('beats', B, beat({ name: 'Here', bpm: 90, [STAMP]: T + 2 }), beat({ bpm: 140, swing: 2, [STAMP]: T + 1 }));
  assert.deepEqual([m.record.name, m.record.bpm, m.record.swing], ['Here', 90, 2]);
  assert.equal(m.clashes, 1, 'only the tempo clashed');
  assert.equal(m.record[STAMP], T + 2, 'the newer stamp');
  const older = merge3('beats', B, beat({ bpm: 90, [STAMP]: T }), beat({ bpm: 140, [STAMP]: T + 1 }));
  assert.equal(older.record.bpm, 140);
  const tie = merge3('beats', B, beat({ bpm: 90 }), beat({ bpm: 140 }));
  assert.equal(tie.record.bpm, 140, 'a tie goes to the cloud\'s');
  assert.equal(stampOf({ saved: 7 }), 7, 'a record from before the stamp uses `saved`');
});

test('a beat\'s pills merge pill by pill: taps on both devices all stay', () => {
  const B = beat();
  const L = beat({ rows: [row('kick', 'x.x.'), row('snare', '..x.')] });
  const R = beat({ rows: [row('kick', 'x...'), row('snare', '..xx')] });
  const m = merge3('beats', B, L, R);
  assert.deepEqual(m.record.rows.map(pills), ['x.x.', '..xx']);
  const off = merge3('beats', B, beat({ rows: [row('kick', '....'), row('snare', '..x.')] }), beat({ rows: [row('kick', 'x...'), row('snare', 'x.x.')] }));
  assert.deepEqual(off.record.rows.map(pills), ['....', 'x.x.'], 'a pill turned off on one side stays off');
});

test('rows added, removed or moved on one side, pills tapped on the other, all merge', () => {
  const B = beat();
  const L = beat({ rows: [row('kick', 'x...'), row('snare', '..x.'), row('clap', '.x..')] });   // a row added here
  const R = beat({ rows: [row('snare', '..xx'), row('kick', 'x...')] });                         // moved and tapped there
  const m = merge3('beats', B, L, R);
  assert.deepEqual(m.record.rows.map((r) => [r.clipId, pills(r)]), [['snare', '..xx'], ['kick', 'x...'], ['clap', '.x..']]);
  const gone = merge3('beats', B, beat({ rows: [row('snare', '..x.')] }), beat({ rows: [row('kick', 'x...'), row('snare', 'x.x.')] }));
  assert.deepEqual(gone.record.rows.map((r) => [r.clipId, pills(r)]), [['snare', 'x.x.']], 'removed here, untouched there: gone');
  const kept = merge3('beats', B, beat({ rows: [row('snare', '..x.')] }), beat({ rows: [row('kick', 'xx..'), row('snare', '..x.')] }));
  assert.deepEqual(kept.record.rows.map((r) => r.clipId), ['kick', 'snare'], 'removed here, tapped there: the taps keep it');
});

test('two rows of one sound, both changed in different ways: no safe merge, so a beat keeps both copies', () => {
  const B = beat({ rows: [row('kick', 'x...'), row('kick', '..x.', { melody: true })] });
  const L = beat({ rows: [row('kick', 'x...'), row('kick', '..x.', { melody: true }), row('snare', 'x...')] });
  const R = beat({ rows: [row('kick', '..x.', { melody: true }), row('kick', 'x...')] });
  assert.deepEqual(merge3('beats', B, L, R), { keepBoth: true });
  assert.equal(resolve('beats', B, L, R).action, 'keepBoth');
  // The open beat is one per person: it can't hold two, so the newer wins.
  const open = merge3('patterns', B, { ...L, [STAMP]: T + 1 }, { ...R, [STAMP]: T });
  assert.equal(open.record.rows.length, 3);
});

test('a pad order: sounds added on each side all come in; the side that reordered sets the order', () => {
  const B = { personId: 'p-a', ids: ['a', 'b', 'c'] };
  const m = merge3('orders', B, { personId: 'p-a', ids: ['a', 'b', 'c', 'd'] }, { personId: 'p-a', ids: ['c', 'a', 'b', 'e'] });
  assert.deepEqual(m.record.ids, ['c', 'a', 'b', 'e', 'd']);
  const del = merge3('orders', B, { personId: 'p-a', ids: ['a', 'c'] }, { personId: 'p-a', ids: ['a', 'b', 'c', 'x'] });
  assert.deepEqual(del.record.ids, ['a', 'c', 'x']);
  const groups = merge3('orders', { ...B, groups: [{ id: 'g1', name: 'Farts' }] },
    { ...B, groups: [{ id: 'g1', name: 'Toots' }], [STAMP]: T + 1 }, { ...B, groups: [{ id: 'g1', name: 'Farts' }, { id: 'g2', name: 'Pets' }], [STAMP]: T });
  assert.deepEqual(groups.record.groups, [{ id: 'g1', name: 'Toots' }, { id: 'g2', name: 'Pets' }]);
});

test('settings and DJ keys merge key by key', () => {
  const B = { personId: 'p-a', values: { padSize: 0.5, advancedBeats: false } };
  const m = merge3('prefs', B, { personId: 'p-a', values: { padSize: 0.8, advancedBeats: false } }, { personId: 'p-a', values: { padSize: 0.5, advancedBeats: true } });
  assert.deepEqual(m.record.values, { padSize: 0.8, advancedBeats: true });
  const d = merge3('decks', { personId: 'p-a', keys: { KeyQ: 'a', KeyW: 'b' } }, { personId: 'p-a', keys: { KeyQ: 'x', KeyW: 'b' } }, { personId: 'p-a', keys: { KeyQ: 'a', KeyW: null } });
  assert.deepEqual(d.record.keys, { KeyQ: 'x', KeyW: null });
});

// ADR 0028: what a person has seen of their first steps keeps what either
// device saw, so no tip shows twice; a side that alone cleared them (💡 Show
// tips again) still wins, as any one-sided change does.
test("a person's seen tips merge as everything either side saw", () => {
  const B = { personId: 'p-a', values: { seen: 'tip-pads', padSize: 0.5 } };
  const both = merge3('prefs', B, { personId: 'p-a', values: { seen: 'tip-beats,tip-pads', padSize: 0.5 } }, { personId: 'p-a', values: { seen: 'dot-keys,tip-pads', padSize: 0.7 } });
  assert.deepEqual(both.record.values, { seen: 'dot-keys,tip-beats,tip-pads', padSize: 0.7 });
  const cleared = merge3('prefs', B, { personId: 'p-a', values: { seen: '', padSize: 0.5 } }, { personId: 'p-a', values: { seen: 'tip-pads', padSize: 0.7 } });
  assert.equal(cleared.record.values.seen, '');
  const fresh = merge3('prefs', null, { personId: 'p-a', values: { seen: 'tip-song' } }, { personId: 'p-a', values: { seen: 'tip-live' } });
  assert.equal(fresh.record.values.seen, 'tip-live,tip-song', 'no base: both too');
});

test('a song: how many times a slot plays merges; slots rearranged on both sides keep both songs', () => {
  const s = (slots, extra = {}) => ({ id: 'song-1', personId: 'p-a', name: 'Tune', slots, created: 1, saved: 1, ...extra });
  const B = s([{ beatId: 'beat-1', times: 1 }, { beatId: 'beat-2', times: 1 }]);
  const m = merge3('songbook', B, s([{ beatId: 'beat-1', times: 2 }, { beatId: 'beat-2', times: 1 }]), s([{ beatId: 'beat-1', times: 1 }, { beatId: 'beat-2', times: 4 }], { name: 'Ditty' }));
  assert.deepEqual([m.record.name, m.record.slots.map((x) => x.times)], ['Ditty', [2, 4]]);
  assert.deepEqual(merge3('songbook', B, s([{ beatId: 'beat-2', times: 1 }]), s([{ beatId: 'beat-1', times: 1 }, { beatId: 'beat-2', times: 1 }, { beatId: 'beat-1', times: 1 }])), { keepBoth: true });
});

// ADR 0024: a song is lanes of blocks, plus the slots older copies read.
test('a playlist song merges lane by lane and block by block; its slots are made again from the result', () => {
  const lane = (name, blocks, extra = {}) => ({ name, emoji: '🥁', muted: false, volume: 1, blocks, ...extra });
  const s = (lanes, extra = {}) => ({ id: 'song-1', personId: 'p-a', name: 'Tune', tempo: 100, lanes, slots: legacySlots(lanes), created: 1, saved: 1, ...extra });
  const B = s([lane('Drums', [{ beatId: 'beat-1', bar: 0, times: 1 }]), lane('Bass', [])]);
  // Here: a block added on lane 1 and lane 2 muted. There: a block added on lane 2, the first repeated, the tempo and a name changed.
  const here = s([lane('Drums', [{ beatId: 'beat-1', bar: 0, times: 1 }, { beatId: 'beat-2', bar: 4, times: 1 }]), lane('Bass', [], { muted: true })]);
  const there = s([lane('Drums', [{ beatId: 'beat-1', bar: 0, times: 3 }]), lane('Wobble', [{ beatId: 'beat-3', bar: 2, times: 2 }])], { tempo: 120 });
  const m = merge3('songbook', B, here, there);
  assert.equal(m.record.tempo, 120);
  assert.deepEqual(m.record.lanes, [
    lane('Drums', [{ beatId: 'beat-1', bar: 0, times: 3 }, { beatId: 'beat-2', bar: 4, times: 1 }]),
    lane('Wobble', [{ beatId: 'beat-3', bar: 2, times: 2 }], { muted: true }),
  ]);
  assert.deepEqual(m.record.slots, legacySlots(m.record.lanes), 'the slots follow the merged lanes, never a clash of their own');
  assert.equal(m.clashes, 0);
  // A block taken off one side and left alone on the other goes; a lane added on one side comes.
  const gone = merge3('songs', B, s([lane('Drums', []), lane('Bass', [])]), s([...B.lanes, lane('Keys', [{ beatId: 'beat-9', bar: 1, times: 1 }])]));
  assert.deepEqual(gone.record.lanes.map((l) => l.blocks.map((b) => b.beatId)), [[], [], ['beat-9']]);
  // The same block changed on both sides: the newer edit wins it.
  const both = merge3('songbook', B,
    s([lane('Drums', [{ beatId: 'beat-1', bar: 0, times: 2 }]), lane('Bass', [])], { [STAMP]: 5 }),
    s([lane('Drums', [{ beatId: 'beat-1', bar: 0, times: 4 }]), lane('Bass', [])], { [STAMP]: 9 }));
  assert.equal(both.record.lanes[0].blocks[0].times, 4);
  assert.equal(both.clashes, 1);
  // An older copy's edit (slots only, its lanes dropped) against an untouched playlist: the old copy's song stands.
  const old = { id: 'song-1', personId: 'p-a', name: 'Tune', slots: [{ beatId: 'beat-7', times: 2 }], created: 1, saved: 1 };
  assert.deepEqual(resolve('songbook', B, B, old), { action: 'take' });
});

test('a sound: settings merge, the audio is this device\'s; an effect chain changed on both keeps both sounds', () => {
  const audio = { size: 3 };
  const B = { id: 'user-1', personId: 'p-a', label: 'Burp', emoji: '😂', voice: 'normal', created: 5 };
  const m = merge3('clips', B, { ...B, label: 'Big burp', blob: audio }, { ...B, emoji: '🐸' });
  assert.deepEqual(strip(m.record), { ...B, label: 'Big burp', emoji: '🐸' });
  assert.equal(m.record.blob, audio);
  assert.deepEqual(merge3('clips', { ...B, fx: [] }, { ...B, fx: [{ id: 'echo' }] }, { ...B, fx: [{ id: 'robot' }] }), { keepBoth: true });
});

test('an own voice keeps its latest use and the newer rename; a kit edit, the newer setting', () => {
  const B = { id: 'voice-1', personId: 'p-a', name: 'Squeaky', emoji: '🦄', knobs: { pitch: 7 }, created: 1, used: 5 };
  const v = merge3('voices', B, { ...B, used: 50, name: 'Squeakier', [STAMP]: T + 1 }, { ...B, used: 70, name: 'Squeakiest', knobs: { pitch: 7, echo: 2 }, [STAMP]: T });
  assert.deepEqual([v.record.name, v.record.used, v.record.knobs], ['Squeakier', 70, { pitch: 7, echo: 2 }]);
  const o = merge3('overrides', { id: 'p-a-kick', fx: [] }, { id: 'p-a-kick', fx: [{ id: 'echo' }], [STAMP]: T + 1 }, { id: 'p-a-kick', fx: [{ id: 'robot' }], [STAMP]: T });
  assert.deepEqual(o.record.fx, [{ id: 'echo' }], 'a kit edit can\'t be two: the newer wins');
});

test('idempotent: merging again with the result as the base changes nothing; merging equal sides is the side', () => {
  const B = beat();
  const L = beat({ name: 'Here', rows: [row('kick', 'x.x.'), row('snare', '..x.')] });
  const R = beat({ bpm: 120, rows: [row('kick', 'x...'), row('snare', '..xx')] });
  const { record: M } = merge3('beats', B, L, R);
  // After the sync, the base is the cloud's (R) and this device holds M:
  // the same pull again finds the cloud unchanged and keeps M.
  assert.equal(resolve('beats', R, M, R).action, 'keep');
  // Once M is pushed, the base is M; a pull of M is nothing new.
  assert.equal(resolve('beats', M, M, M).action, 'same');
  assert.ok(sameContent(merge3('beats', B, M, M).record, M));
});

test('both orders give the same content when the edits don\'t clash', () => {
  const B = beat();
  const L = beat({ name: 'Here', rows: [row('kick', 'x.x.'), row('snare', '..x.')] });
  const R = beat({ bpm: 120, rows: [row('kick', 'x...'), row('snare', '..xx')] });
  assert.ok(sameContent(merge3('beats', B, L, R).record, merge3('beats', B, R, L).record));
});
