// 🎼 Song as a playlist (ADR 0024): the pure part, web/playlist.js. Lanes,
// blocks placed without overlap, repeats, time at the song's tempo, old
// songs' slots, and what older copies read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEAT_REF, MAX_LANES, MAX_SONG_BARS, MAX_TIMES, START_LANES, LANE_DEFAULTS,
  cleanTempo, cleanLane, cleanLanes, newLanes, blockBars, blockSpan, blockAt, placeBlock, setTimes, maxTimes, timesForEnd,
  removeBlock, songBars, viewBars, playParts, songClock, playEvents, playingAt, slotsToLanes, legacySlots, songBeatIds, mapSongBeats, songHasBeats,
} from '../web/playlist.js';
import { BEAT_ID } from '../web/beat.js';

const A = 'beat-a';   // 1 bar of 4/4: 16 pills
const B = 'beat-b';   // 2 bars of 4/4: 32 pills
const C = 'beat-c';   // 1 bar of 3/4: 12 pills
const STEPS = { [A]: 16, [B]: 32, [C]: 12 };
const stepsOf = (id) => STEPS[id] ?? null;
const lane = (...blocks) => ({ ...newLanes(1)[0], blocks });

test("a beat's id is checked the same way here as in the beat maker", () => {
  assert.equal(String(BEAT_REF), String(BEAT_ID));
});

test('a lane is cleaned: a fun default name and picture by its place, mute, volume, blocks in bar order, one per bar', () => {
  assert.deepEqual(cleanLane({}, 0), { name: 'Drums', emoji: '🥁', muted: false, volume: 1, blocks: [] });
  assert.deepEqual(cleanLane(null, 1), { name: 'Bass', emoji: '🎸', muted: false, volume: 1, blocks: [] });
  const l = cleanLane({ name: '  My very very long lane name  ', emoji: '<b>', muted: true, volume: 0.456,
    blocks: [{ beatId: B, bar: 8, times: 2 }, { beatId: '../evil', bar: 0 }, { beatId: A, bar: 0, times: 999 }, { beatId: A, bar: 8, times: 1 }, { beatId: A, bar: -3, times: 0 }, null] }, 2);
  assert.equal(l.name, 'My very very lon', 'at most 16 letters');
  assert.equal(l.emoji, '🎹', 'not a picture: the default');
  assert.equal(l.muted, true);
  assert.equal(l.volume, 0.456, 'ten-thousandths are kept (the taper needs them)');
  assert.deepEqual(l.blocks, [{ beatId: A, bar: 0, times: MAX_TIMES }, { beatId: B, bar: 8, times: 2 }], 'one block a bar, the first kept; a bad bar goes to 0, which is taken');
  assert.equal(cleanLanes(undefined).length, START_LANES, 'a song starts with four lanes');
  assert.equal(cleanLanes(Array.from({ length: 12 }, () => ({}))).length, MAX_LANES, 'at most eight');
  assert.deepEqual(cleanLanes(Array.from({ length: 8 }, () => ({}))).map((x) => x.name), LANE_DEFAULTS.map((d) => d.name));
  assert.equal(cleanTempo(300), 180);
  assert.equal(cleanTempo(12), 60);
  assert.equal(cleanTempo('fast'), 100);
  assert.equal(cleanTempo(97.6), 98);
});

test('a block covers the whole bars its passes reach into', () => {
  assert.equal(blockBars(16, 1), 1);
  assert.equal(blockBars(32, 3), 6);
  assert.equal(blockBars(12, 1), 1, 'a 3/4 bar takes a 4/4 bar of room');
  assert.equal(blockBars(12, 4), 3, 'four 3/4 bars are three 4/4 bars');
  assert.deepEqual(blockSpan({ beatId: B, bar: 4, times: 2 }, stepsOf), { start: 4, end: 8 });
  assert.deepEqual(blockSpan({ beatId: 'beat-gone', bar: 4, times: 2 }, stepsOf), { start: 4, end: 6 }, 'a gone beat keeps a bar a pass');
});

test('pick, then tap: a beat goes on an empty spot, never over a block or into one too short a gap', () => {
  let l = lane();
  const first = placeBlock(l, 2, B, stepsOf);
  assert.equal(first.index, 0);
  l = first.lane;
  assert.deepEqual(l.blocks, [{ beatId: B, bar: 2, times: 1 }]);
  assert.equal(blockAt(l, 2, stepsOf), 0);
  assert.equal(blockAt(l, 3, stepsOf), 0, 'its second bar');
  assert.equal(blockAt(l, 4, stepsOf), -1);
  assert.deepEqual(placeBlock(l, 3, A, stepsOf), { why: 'taken' });
  assert.deepEqual(placeBlock(l, 1, B, stepsOf), { why: 'room' }, 'two bars would run into the block at bar 2');
  const before = placeBlock(l, 1, A, stepsOf);
  assert.equal(before.index, 0, 'kept in bar order');
  assert.deepEqual(before.lane.blocks.map((b) => b.bar), [1, 2]);
  assert.deepEqual(placeBlock(l, MAX_SONG_BARS - 1, B, stepsOf), { why: 'room' }, 'past the end');
  assert.deepEqual(placeBlock(l, 0, '../x', stepsOf), { why: 'room' });
  assert.equal(l.blocks.length, 1, 'placing makes a new lane, the old one unchanged');
});

test('repeats: ➖ ➕ and dragging the end stay between once and what fits before the next block', () => {
  const l = lane({ beatId: A, bar: 0, times: 1 }, { beatId: B, bar: 5, times: 1 });
  assert.equal(maxTimes(l, 0, stepsOf), 5);
  assert.equal(maxTimes(l, 1, stepsOf), (MAX_SONG_BARS - 5) / 2 > MAX_TIMES ? MAX_TIMES : Math.floor((MAX_SONG_BARS - 5) / 2));
  assert.equal(setTimes(l, 0, 3, stepsOf).blocks[0].times, 3);
  assert.equal(setTimes(l, 0, 9, stepsOf).blocks[0].times, 5, 'stops at the next block');
  assert.equal(setTimes(l, 0, 0, stepsOf).blocks[0].times, 1);
  assert.equal(setTimes(l, 0, 1, stepsOf), l, 'no change: the same lane');
  // Dragging the end: the nearest whole repeat to where the finger is.
  const b = { beatId: B, bar: 2, times: 1 };
  assert.equal(timesForEnd(b, 4, stepsOf), 1);
  assert.equal(timesForEnd(b, 6.9, stepsOf), 2);
  assert.equal(timesForEnd(b, 7.1, stepsOf), 3);
  assert.equal(timesForEnd(b, 0, stepsOf), 1, 'never less than once');
  assert.deepEqual(removeBlock(l, 0).blocks, [{ beatId: B, bar: 5, times: 1 }]);
});

test('the song is as long as its furthest block; the lanes show room after it in lines of four', () => {
  const lanes = [lane({ beatId: A, bar: 0, times: 4 }), lane({ beatId: B, bar: 6, times: 2 })];
  assert.equal(songBars(lanes, stepsOf), 10);
  assert.equal(viewBars(lanes, stepsOf), 20);
  assert.equal(viewBars(newLanes(), stepsOf), 16, 'an empty song still shows 16 bars');
  assert.equal(viewBars([lane({ beatId: A, bar: MAX_SONG_BARS - 1, times: 1 })], stepsOf), MAX_SONG_BARS);
});

test('lanes play together at the song tempo; a pass is cut where the next block starts; a gone beat is skipped', () => {
  // 120 BPM: a bar is 2 s, a pill 0.125 s.
  const lanes = [
    lane({ beatId: A, bar: 0, times: 2 }, { beatId: 'beat-gone', bar: 2, times: 1 }, { beatId: C, bar: 3, times: 2 }),
    lane({ beatId: B, bar: 1, times: 2 }, { beatId: A, bar: 4, times: 1 }),
  ];
  const { parts, seconds, barSeconds } = playParts(lanes, stepsOf, 120);
  assert.equal(barSeconds, 2);
  assert.deepEqual(parts.map((p) => [p.lane, p.beatId, p.pass, p.start, p.end]), [
    [0, A, 1, 0, 2],
    [0, A, 2, 2, 4],
    [1, B, 1, 2, 6],
    [0, C, 1, 6, 7.5],
    [0, C, 2, 7.5, 9],
    [1, B, 2, 6, 8], // cut where its lane's next block starts (bar 4 = 8 s)
    [1, A, 1, 8, 10],
  ].sort((a, b) => a[3] - b[3] || a[0] - b[0]));
  assert.equal(seconds, 10);
  assert.deepEqual([...playingAt(parts, 6.5)].sort(), ['0:2', '1:0']);
  assert.deepEqual([...playingAt(parts, 11)], []);
});

// Producer, council round 1 (2026-10-27): a 3/4 or 6/8 beat (12 pills), 5/4
// (20) or 7/8 (14) does not fill whole song bars. The song ends on a bar line
// all the same, so the playhead ends where the block's bars do and a saved
// song is whole bars. Nothing before the end moves.
test('a song is whole bars long: a beat that is not a whole bar rests out the bar its last pass reaches into', () => {
  const D = 'beat-d';   // 5/4: 20 pills
  const E = 'beat-e';   // 7/8: 14 pills
  const steps = (id) => ({ ...STEPS, [D]: 20, [E]: 14 })[id] ?? null;
  const len = (...blocks) => playParts([lane(...blocks)], steps, 120);   // a bar is 2 s
  assert.equal(len({ beatId: C, bar: 0, times: 1 }).seconds, 2, 'a 3/4 beat once: the whole bar, not 1.5 s');
  assert.equal(len({ beatId: C, bar: 0, times: 2 }).seconds, 4, 'twice: 24 pills reach into the second bar');
  assert.equal(len({ beatId: C, bar: 0, times: 4 }).seconds, 6, 'four passes are exactly three bars: nothing added');
  assert.equal(len({ beatId: D, bar: 0, times: 1 }).seconds, 4, '5/4 once: 20 pills, two bars');
  assert.equal(len({ beatId: E, bar: 2, times: 1 }).seconds, 6, '7/8 at bar 3: ends at the bar line after it');
  assert.equal(len({ beatId: A, bar: 0, times: 3 }).seconds, 6, 'a 4/4 beat is as it was');
  assert.equal(len({ beatId: B, bar: 1, times: 1 }).seconds, 6);
  assert.equal(playParts([lane()], steps, 120).seconds, 0, 'an empty song has no length');
  assert.equal(len({ beatId: 'beat-gone', bar: 0, times: 3 }).seconds, 0, 'a gone beat adds none');
  // The parts themselves are not moved or lengthened: the pass still ends at pill 12.
  const once = len({ beatId: C, bar: 0, times: 1 });
  assert.deepEqual(once.parts.map((p) => [p.start, p.end]), [[0, 1.5]]);
});

test('a song with tempo marks ends on the bar line of its own clock', () => {
  const song = { tempo: 120, tempos: [{ bar: 2, bpm: 60 }], lanes: [] };
  const clock = songClock(song);   // bar 1 is 2 s, bar 2 on is 4 s
  const { parts, seconds } = playParts([lane({ beatId: C, bar: 1, times: 1 })], stepsOf, clock);
  assert.ok(Math.abs(parts[0].end - 2 - 3) < 1e-9, 'the pass ends at 3/4 of the second bar');
  assert.ok(Math.abs(seconds - 6) < 1e-9, `ends at the end of bar 2, was ${seconds}`);
});

test('hits are each pass of a beat moved to its place, cut at the part end; playing from a bar starts the clock there', () => {
  const lanes = [lane({ beatId: A, bar: 0, times: 2 }), lane({ beatId: B, bar: 1, times: 1 }, { beatId: A, bar: 2, times: 1 })];
  const { parts } = playParts(lanes, stepsOf, 120);
  // A: a hit on beat 1 and beat 3 of its bar. B: a hit on every bar's 1, and one at 3.5 s (its second bar).
  const plans = new Map([
    [A, { hits: [{ row: 0, time: 0, loud: false, note: 0, len: 0 }, { row: 0, time: 1, loud: true, note: 0, len: 0 }] }],
    [B, { hits: [{ row: 1, time: 0, loud: false, note: 3, len: 0 }, { row: 1, time: 2, loud: false, note: 0, len: 0 }, { row: 1, time: 3.5, loud: false, note: 0, len: 0 }] }],
  ]);
  const all = playEvents(parts, plans);
  assert.deepEqual(all.map((e) => [e.lane, e.beatId, e.time]), [
    [0, A, 0], [0, A, 1], [0, A, 2], [1, B, 2], [0, A, 3], [1, A, 4], [1, A, 5],
  ], "B's second bar is cut where A starts on its lane");
  assert.equal(all[3].note, 3);
  assert.equal(all[1].loud, true);
  const later = playEvents(parts, plans, { from: 2 });
  assert.deepEqual(later.map((e) => [e.lane, e.time]), [[0, 0], [1, 0], [0, 1], [1, 2], [1, 3]], 'from bar 2: times count from there');
  const muted = playEvents(parts, plans, { skipLanes: new Set([1]) });
  assert.ok(muted.every((e) => e.lane === 0), 'a muted lane left out of a render');
});

test('an old song converts: its slots become blocks on lane 1, back to back', () => {
  const lanes = slotsToLanes([{ beatId: A, times: 2 }, { beatId: '../x', times: 1 }, { beatId: B, times: 1 }, { beatId: C, times: 3 }, { beatId: 'beat-gone', times: 1 }], stepsOf);
  assert.equal(lanes.length, START_LANES);
  assert.deepEqual(lanes[0].blocks, [
    { beatId: A, bar: 0, times: 2 }, { beatId: B, bar: 2, times: 1 }, { beatId: C, bar: 4, times: 3 }, { beatId: 'beat-gone', bar: 7, times: 1 }]);
  assert.ok(lanes.slice(1).every((l) => !l.blocks.length));
  assert.deepEqual(slotsToLanes(undefined, stepsOf)[0].blocks, []);
});

test('older copies read slots: every block in time order, at most 16, each at most ×4', () => {
  const lanes = [lane({ beatId: A, bar: 4, times: 9 }), lane({ beatId: B, bar: 0, times: 1 }, { beatId: C, bar: 4, times: 2 })];
  assert.deepEqual(legacySlots(lanes), [{ beatId: B, times: 1 }, { beatId: A, times: 4 }, { beatId: C, times: 2 }]);
  const many = [lane(...Array.from({ length: 30 }, (_, i) => ({ beatId: A, bar: i, times: 1 })))];
  assert.equal(legacySlots(many).length, 16);
});

test("a song's beats, new shape or old; renamed for a backup merge or a share", () => {
  const song = { lanes: [lane({ beatId: A, bar: 0, times: 1 }, { beatId: B, bar: 2, times: 1 }), lane({ beatId: A, bar: 0, times: 1 })], slots: [{ beatId: A, times: 1 }] };
  assert.deepEqual(songBeatIds(song), [A, B]);
  assert.deepEqual(songBeatIds({ slots: [{ beatId: C }, { beatId: C }] }), [C]);
  assert.deepEqual(songBeatIds(null), []);
  assert.equal(songHasBeats({ lanes: newLanes() }), false);
  assert.equal(songHasBeats({ slots: [{ beatId: A, times: 1 }] }), true);
  const mapped = mapSongBeats(song, (id) => (id === A ? 'beat-a2' : null));
  assert.deepEqual(mapped.lanes.map((l) => l.blocks.map((b) => b.beatId)), [['beat-a2'], ['beat-a2']]);
  assert.deepEqual(mapped.slots, [{ beatId: 'beat-a2', times: 1 }]);
  assert.equal(mapSongBeats({ slots: [] }, () => null).lanes, undefined, 'an old song stays old');
});
