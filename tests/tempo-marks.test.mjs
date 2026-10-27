// Tempo marks in 🎼 Song (ADR 0031): the pure part (web/playlist.js), how
// a song keeps them (song.js cleanSong, planSong), backups, the cloud's
// three-way merge, and a share's preview. The screen is tests/song-tempo-ui.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SONG_BARS, MAX_TEMPO_MARKS, newLanes, legacySlots,
  cleanTempos, tempoAt, putTempo, removeTempo, songClock, playParts, playEvents,
} from '../web/playlist.js';
import { cleanSong, planSong } from '../web/song.js';
import { cleanPattern, planHits } from '../web/beat.js';
import { merge3, resolve } from '../web/merge3.js';
import { makeBackup, readBackup, BACKUP_APP } from '../web/backup.js';
import { buildZip, blobOf, utf8 } from './helpers.mjs';

const bundled = () => ({ peopleIds: new Set(['pip']), clipIds: new Set(), colorOk: () => true });
// A backup as an older copy saved it: format 1.0, songs with no marks.
const oldBackup = (doc) => blobOf(buildZip([{ name: 'backup.json', data: utf8(JSON.stringify({ app: BACKUP_APP, format: '1.0', ...doc })) }]));

const A = 'beat-a';   // 1 bar of 4/4: 16 pills
const C = 'beat-c';   // 1 bar of 3/4: 12 pills
const STEPS = { [A]: 16, [C]: 12 };
const stepsOf = (id) => STEPS[id] ?? null;
const lane = (...blocks) => ({ ...newLanes(1)[0], blocks });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≠ ${b}`);

test('marks are cleaned: a whole bar from 2, a BPM in range, bar order, one per bar; anything else dropped', () => {
  assert.deepEqual(cleanTempos(undefined), []);
  assert.deepEqual(cleanTempos('120'), []);
  assert.deepEqual(cleanTempos([
    { bar: 17, bpm: 120 }, { bar: 9, bpm: 90.4 }, { bar: 1, bpm: 120 }, { bar: 0, bpm: 120 }, { bar: 3.5, bpm: 120 },
    { bar: 9, bpm: 150 }, { bar: 20, bpm: 300 }, { bar: 21, bpm: 40 }, { bar: 22, bpm: '120' }, { bar: MAX_SONG_BARS + 1, bpm: 120 },
    { bar: MAX_SONG_BARS, bpm: 60 }, null, 'x',
  ]), [{ bar: 9, bpm: 90 }, { bar: 17, bpm: 120 }, { bar: MAX_SONG_BARS, bpm: 60 }], 'the first at a bar stays; out of range is dropped, never moved');
  const many = Array.from({ length: 50 }, (_, i) => ({ bar: i + 2, bpm: 100 }));
  assert.equal(cleanTempos(many).length, MAX_TEMPO_MARKS);
  assert.deepEqual(cleanTempos([{ bar: 5, bpm: 120 }], { slots: [] }), [], 'a song from before the playlist has no bars, so no marks');
  assert.deepEqual(cleanTempos([{ bar: 5, bpm: 120 }], { lanes: [] }), [{ bar: 5, bpm: 120 }]);
});

test("tempoAt: the song's own tempo until the first mark, then each mark's from its bar on", () => {
  const song = { tempo: 100, tempos: [{ bar: 9, bpm: 120 }, { bar: 5, bpm: 80 }] };
  assert.deepEqual([1, 4, 5, 8, 9, 64].map((b) => tempoAt(song, b)), [100, 100, 80, 80, 120, 120]);
  assert.equal(tempoAt({ tempo: 132 }, 40), 132, 'no marks: one tempo');
});

test('putTempo and removeTempo: a mark put at a taken bar replaces it; a changed mark leaves its old bar', () => {
  const t = [{ bar: 5, bpm: 80 }, { bar: 9, bpm: 120 }];
  assert.deepEqual(putTempo(t, { bar: 3, bpm: 90 }), [{ bar: 3, bpm: 90 }, ...t]);
  assert.deepEqual(putTempo(t, { bar: 9, bpm: 140 }), [{ bar: 5, bpm: 80 }, { bar: 9, bpm: 140 }]);
  assert.deepEqual(putTempo(t, { bar: 13, bpm: 120 }, 9), [{ bar: 5, bpm: 80 }, { bar: 13, bpm: 120 }], 'moved to bar 13');
  assert.deepEqual(putTempo(t, { bar: 1, bpm: 120 }), t, 'bar 1 is the song’s own tempo');
  assert.deepEqual(removeTempo(t, 5), [{ bar: 9, bpm: 120 }]);
  assert.deepEqual(removeTempo(undefined, 5), []);
});

test("the song's clock: each bar at its own tempo; positions in pills, back and forth", () => {
  // 120 BPM a bar is 2 s, 60 BPM 4 s, 240 would be 1 s (not allowed; 180 is 4/3 s).
  const clock = songClock({ tempo: 120, tempos: [{ bar: 3, bpm: 60 }, { bar: 5, bpm: 180 }] });
  assert.equal(clock.steady, false);
  assert.equal(clock.pill, 0.125, 'beats are planned at bar 1’s tempo');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => clock.barStart(i)), [0, 2, 4, 8, 12, 12 + 4 / 3]);
  assert.deepEqual([0, 2, 3, 4, 99].map((i) => clock.tempoOf(i)), [120, 60, 60, 180, 180]);
  near(clock.at(16 * 2 + 8), 6, 'half way through bar 3, at 60');
  near(clock.at(16 * 4 + 4), 12 + 1 / 3, 'a quarter into bar 5, at 180');
  near(clock.barAt(6), 2.5);
  near(clock.barAt(12 + 1 / 3), 4.25);
  near(clock.barAt(1), 0.5);
  near(clock.barAt(clock.barStart(MAX_SONG_BARS) + 4 / 3), MAX_SONG_BARS + 1, 'past the last bar, at the last tempo');
  const steady = songClock({ tempo: 100 });
  assert.equal(steady.steady, true);
  assert.equal(steady.barStart(3), 3 * 2.4);
  assert.equal(steady.barAt(4.8), 2);
  assert.equal(songClock({ tempo: 100, tempos: [] }).steady, true, 'empty marks: one tempo');
});

test('every lane follows the marks: passes start on the same bar lines, a pass across a mark speeds up where the bar does', () => {
  // 120 then 60 from bar 3. A (one 4/4 bar) on lane 0 four times; C (a 3/4 bar) on lane 1 four times, from bar 1.
  const clock = songClock({ tempo: 120, tempos: [{ bar: 3, bpm: 60 }] });
  const { parts, seconds, clock: c } = playParts([lane({ beatId: A, bar: 0, times: 4 }), lane({ beatId: C, bar: 0, times: 4 })], stepsOf, clock);
  assert.equal(c, clock);
  const of = (li) => parts.filter((p) => p.lane === li).map((p) => [p.start, p.end]);
  assert.deepEqual(of(0), [[0, 2], [2, 4], [4, 8], [8, 12]], 'bar 3 and 4 last 4 s each');
  // C's passes: pills 0–12, 12–24, 24–36, 36–48. Pill 32 is where bar 3 starts (4 s).
  assert.deepEqual(of(1), [[0, 1.5], [1.5, 3], [3, 4 + 4 * 0.25], [5, 8]], 'the third pass crosses into bar 3 and slows there');
  assert.equal(seconds, 12);
  // A plain tempo still works as before.
  assert.deepEqual(playParts([lane({ beatId: A, bar: 1, times: 1 })], stepsOf, 120).parts.map((p) => [p.start, p.end]), [[2, 4]]);
});

test("hits land where their pill falls on the song's clock; held notes stretch; from a bar counts from there", () => {
  const clock = songClock({ tempo: 120, tempos: [{ bar: 2, bpm: 60 }] });
  const { parts } = playParts([lane({ beatId: A, bar: 0, times: 2 })], stepsOf, clock);
  // A at 120: a hit on beat 1 (held a beat, 0.5 s) and one on beat 3 (pill 8, 1 s).
  const plans = new Map([[A, { hits: [{ row: 0, time: 0, loud: false, note: 2, len: 0.5 }, { row: 0, time: 1, loud: true, note: 0, len: 0 }] }]]);
  const all = playEvents(parts, plans, { clock });
  assert.deepEqual(all.map((e) => [e.time, e.len]), [[0, 0.5], [1, 0], [2, 1], [4, 0]], 'bar 2 at half the speed: twice as far apart, the held note twice as long');
  const later = playEvents(parts, plans, { clock, from: clock.barStart(1) });
  assert.deepEqual(later.map((e) => e.time), [0, 2], '▶ from bar 2');
  // A held note running over a mark stretches only for the part after it.
  const across = playEvents(parts, new Map([[A, { hits: [{ row: 0, time: 1.5, loud: false, note: 0, len: 1 }] }]]), { clock });
  near(across[0].len, 0.5 + 1, 'half at 120 (0.5 s), half at 60 (1 s)');
});

test('a song keeps its marks: cleaned on load, left out when there are none; an older song or copy is unchanged', () => {
  const song = cleanSong({ personId: 'pip', tempo: 100, tempos: [{ bar: 9, bpm: 120 }, { bar: 1, bpm: 90 }], lanes: [{ blocks: [{ beatId: A, bar: 0, times: 1 }] }] });
  assert.deepEqual(song.tempos, [{ bar: 9, bpm: 120 }]);
  assert.equal(song.tempo, 100, 'the tempo from bar 1');
  assert.equal('tempos' in cleanSong({ personId: 'pip', tempo: 100, lanes: [] }), false, 'none: no field, as before marks');
  assert.equal('tempos' in cleanSong({ personId: 'pip', tempo: 100, tempos: [{ bar: 1, bpm: 90 }], lanes: [] }), false);
  assert.equal('tempos' in cleanSong({ personId: 'pip', tempos: [{ bar: 5, bpm: 90 }], slots: [{ beatId: A, times: 1 }] }), false, 'slots only: no bars to mark');
  assert.deepEqual(cleanSong(song), song, 'read again, the same song');
  assert.deepEqual(song.slots, legacySlots(song.lanes), 'older copies still read the slots');
});

test('planned with marks: every lane follows them, for playing, 🔊 Save as a sound and a share preview alike', () => {
  const beats = {
    [A]: { id: A, personId: 'pip', bpm: 90, bars: 1, rows: [{ clipId: 'kick', steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] }] },
  };
  const seq = {
    beatPlan: (raw) => {
      const p = cleanPattern(raw, raw.personId);
      const seconds = 16 * (60 / p.bpm / 4);
      return { pattern: p, seconds, hits: planHits(p, 'plain', seconds, 16) };
    },
  };
  const song = cleanSong({ personId: 'pip', tempo: 120, tempos: [{ bar: 2, bpm: 60 }], lanes: [{ blocks: [{ beatId: A, bar: 0, times: 2 }] }, { blocks: [{ beatId: A, bar: 1, times: 1 }] }] });
  const planned = planSong(song, (id) => beats[id], seq);
  assert.equal(planned.seconds, 2 + 4);
  assert.deepEqual(planned.events.filter((e) => e.lane === 0).map((e) => e.time), [0, 0.5, 1, 1.5, 2, 3, 4, 5]);
  assert.deepEqual(planned.events.filter((e) => e.lane === 1).map((e) => e.time), [2, 3, 4, 5], 'bar lines line up across lanes');
  const later = planSong(song, (id) => beats[id], seq, { from: planned.clock.barStart(1) });
  assert.deepEqual(later.events.map((e) => e.time).slice(0, 2), [0, 0]);
  const plain = planSong({ ...song, tempos: undefined }, (id) => beats[id], seq);
  assert.equal(plain.seconds, 4, 'an older copy (no marks read) plays it all at its first tempo');
});

test("the cloud's merge: marks merge by bar; one side's new mark and the other's survive; none is no field", () => {
  const lanes = [lane({ beatId: A, bar: 0, times: 1 })];
  const s = (extra = {}) => ({ id: 'song-1', personId: 'p-a', name: 'Tune', tempo: 100, lanes, slots: legacySlots(lanes), created: 1, saved: 1, ...extra });
  const B = s({ tempos: [{ bar: 5, bpm: 120 }] });
  const m = merge3('songbook', B, s({ tempos: [{ bar: 5, bpm: 120 }, { bar: 9, bpm: 80 }] }), s({ tempos: [{ bar: 3, bpm: 90 }, { bar: 5, bpm: 140 }] }));
  assert.deepEqual(m.record.tempos, [{ bar: 3, bpm: 90 }, { bar: 5, bpm: 140 }, { bar: 9, bpm: 80 }]);
  assert.equal(m.clashes, 0);
  const gone = merge3('songs', B, s(), s({ tempos: [{ bar: 5, bpm: 120 }], name: 'Other' }));
  assert.equal('tempos' in gone.record, false, 'removed on one side, untouched on the other: gone, and no empty field');
  const fresh = merge3('songbook', s(), s({ tempos: [{ bar: 9, bpm: 80 }] }), s({ name: 'Other' }));
  assert.deepEqual(fresh.record.tempos, [{ bar: 9, bpm: 80 }], 'the first mark, against a song from before marks');
  const both = merge3('songbook', B, s({ tempos: [{ bar: 5, bpm: 130 }], changed: 5 }), s({ tempos: [{ bar: 5, bpm: 150 }], changed: 9 }));
  assert.deepEqual([both.record.tempos, both.clashes], [[{ bar: 5, bpm: 150 }], 1], 'one mark changed on both: the newer edit');
  assert.equal(resolve('songbook', s(), s(), s()).action, 'same');
});

test('backups carry marks; a 1.x song without them still loads; bad marks are dropped', async () => {
  const lanes = [lane({ beatId: 'beat-q-1', bar: 0, times: 2 }), ...newLanes(4).slice(1)];
  const open = { id: 'song-q-1', personId: 'pip', name: 'Funky Anthem', tempo: 100, tempos: [{ bar: 3, bpm: 140 }], lanes, slots: [{ beatId: 'beat-q-1', times: 2 }] };
  const plain = { id: 'song-q-2', personId: 'pip', name: 'Sleepy Ditty', tempo: 90, lanes, slots: [{ beatId: 'beat-q-1', times: 2 }], created: 3, saved: 4 };
  const dirty = { ...plain, id: 'song-q-3', name: 'Bumpy', tempos: [{ bar: 1, bpm: 140 }, { bar: 4, bpm: 999 }, { bar: 6, bpm: 70 }], created: 5, saved: 6 };
  const state = { people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [], songs: [open], songbook: [{ ...open, created: 1, saved: 2 }, plain, dirty] };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.songs, [open]);
  const byId = (id) => out.songbook.find((x) => x.id === id);
  assert.deepEqual(byId('song-q-1').tempos, [{ bar: 3, bpm: 140 }]);
  assert.deepEqual(byId('song-q-2'), plain, 'a song from before marks loads as it was');
  assert.deepEqual(byId('song-q-3').tempos, [{ bar: 6, bpm: 70 }]);
  const old = await readBackup(oldBackup({ songbook: [plain] }), bundled());
  assert.deepEqual(old.songbook, [plain], 'a 1.0 backup (ADR 0011) loads, with no marks');
});
