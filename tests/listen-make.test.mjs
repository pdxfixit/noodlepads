// 🎧 From a song's results (web/listen-make.js): what the live screen shows
// of a listener's snapshots (the rolling bars held through a tempo change,
// the parts so far, the tempo line), the sounds picked by fingerprint, and
// the beats and 🎼 Song made from finish()'s result, with the words of What
// I heard. The screens themselves are tests/listen-ui.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROW_SOUNDS, rollView, beatGroups, lineLabel, heardParts, partChips, tempoLine, feelLine, pickSounds,
  heardABeat, makeBeats, makeSong, heardSentence, partDetail, barTime, clock, resultCounts,
} from '../web/listen-make.js';
import { partNames } from '../web/names.js';
import { cleanSong, beatSteps } from '../web/song.js';
import { blockSpan } from '../web/playlist.js';

const cells = (p, upto = 99) => [...p].map((c, i) => (i > upto ? -1 : c === 'x' ? 2 : c === 'o' ? 1 : 0));
const K = ['x.......x.......', 'x.....x.x.......', 'x.......x...o...'];
const snap = ({ bar = 10, partId = 'A', step = 5, status = 'listening', n = 3, ...rest } = {}) => ({
  status, seconds: 20, bpm: 92, signature: '4/4', swing: 0, parts: [{ id: 'A', bpm: 92 }], tempoChange: null,
  current: { partId, bar, step, recent: status === 'listening'
    ? { kick: K.slice(3 - n).map((p) => cells(p)), snare: K.slice(3 - n).map(() => cells('....x.......x...')), hat: K.slice(3 - n).map(() => cells('x.x.x.x.x.x.x.x.')) }
    : { kick: [], snare: [], hat: [] } },
  ...rest,
});

test('the rolling bars: the last 3, oldest first, each labelled with its part and bar', () => {
  const v = rollView(null, snap({ bar: 22, partId: 'C', step: 9 }));
  assert.deepEqual(v.lines.map((l) => l.bar), [20, 21, 22]);
  assert.equal(v.step, 9);
  assert.deepEqual(v.lines[2].cells.kick, cells(K[2]));
  assert.equal(lineLabel(v.partId, v.lines[0].bar), 'C · bar 20');
  assert.equal(lineLabel(null, 4), 'bar 4', 'before the first part is known');
  assert.equal(rollView(null, snap({ status: 'finding-tempo' })), null, 'nothing to show while the tempo is found');
  assert.equal(rollView(null, snap({ n: 1 })).lines.length, 1, 'the first bar alone at first');
});

test('the rolling bars hold the last bar shown through a tempo change, until the new part\'s bars come', () => {
  const shown = rollView(null, snap({ bar: 22, partId: 'B' }));
  assert.equal(rollView(shown, snap({ bar: 21, partId: 'B' })), shown, 'the bar count stepped back by one: held');
  assert.equal(rollView(shown, snap({ bar: 21, partId: null })), shown, 'and while the new part has no letter yet');
  assert.equal(rollView(shown, snap({ status: 'finding-tempo' })), shown, 'and while the new tempo is found');
  const next = rollView(shown, snap({ bar: 23, partId: 'C' }));
  assert.notEqual(next, shown);
  assert.equal(next.partId, 'C');
  assert.equal(rollView(shown, snap({ bar: 24, partId: 'B' })).bar, 24, 'a bar further on shows at once');
});

test('cells are grouped by beat as the beat maker groups pills, and by fours when the signature does not fit', () => {
  assert.deepEqual(beatGroups('4/4', 16), [4, 4, 4, 4]);
  assert.deepEqual(beatGroups('6/8', 12), [6, 6]);
  assert.deepEqual(beatGroups('7/8', 14), [4, 4, 6]);
  assert.deepEqual(beatGroups('4/4', 12), [4, 4, 4]);
  assert.deepEqual(beatGroups(null, 10), [4, 4, 2]);
});

test('the parts so far are chips in the order heard: a part again says so, the playing one is listening', () => {
  let heard = [];
  const parts = [{ id: 'A', bpm: 92 }, { id: 'B', bpm: 92 }, { id: 'C', bpm: 120 }];
  for (const [bar, partId] of [[3, 'A'], [4, 'A'], [9, 'B'], [13, 'A'], [22, 'C']]) heard = heardParts(heard, snap({ bar, partId, parts }));
  assert.deepEqual(heard, [{ id: 'A', bar: 3 }, { id: 'B', bar: 9 }, { id: 'A', bar: 13 }, { id: 'C', bar: 22 }]);
  assert.deepEqual(partChips(heard, snap({ bar: 23, partId: 'C', parts })).map((c) => [c.label, c.now]),
    [['A · 92 BPM', false], ['B · 92 BPM', false], ['A again', false], ['C · 120 BPM · listening…', true]]);
  assert.equal(heardParts(heard, snap({ partId: null })), heard, 'no part yet adds nothing');
});

test('a tempo change shows a line naming the part that started there; the tempo line settles first', () => {
  const change = snap({ tempoChange: { atBar: 22, from: 92, to: 120 } });
  assert.deepEqual(tempoLine(change, [{ id: 'A', bar: 1 }, { id: 'C', bar: 22 }]),
    { faster: true, lead: 'Sped up at bar 22.', rest: ' 92 → 120 BPM, so part C started there.' });
  assert.equal(tempoLine(change, [{ id: 'A', bar: 1 }]).rest, ' 92 → 120 BPM.', 'before the new part is known');
  assert.equal(tempoLine(snap({ tempoChange: { atBar: 9, from: 120, to: 90 } })).lead, 'Slowed down at bar 9.');
  assert.equal(tempoLine(snap()), null);
  assert.equal(feelLine(snap({ swing: 50 })), '92 BPM · 4/4 · Shuffle');
  assert.equal(feelLine(snap({ status: 'finding-tempo', bpm: 96 })), 'About 96 BPM…');
  assert.equal(feelLine(snap({ status: 'finding-tempo', bpm: null })), 'Finding the tempo…');
});

test('each row gets the app\'s sound closest to its fingerprint, and its plain sound with no print', () => {
  const print = (i) => Float32Array.from({ length: 4 }, (_, k) => (k === i ? 1 : 0));
  const prints = { 'kick-dusty': print(0), kick: print(1), clap: print(2), snare: print(3), hihat: print(1) };
  const part = { prints: { kick: print(0), snare: print(2), hat: null } };
  assert.deepEqual(pickSounds(part, (id) => prints[id] ?? null), { kick: 'kick-dusty', snare: 'clap', hat: 'hihat' });
  assert.deepEqual(pickSounds({ prints: { kick: print(0) } }, () => null), { kick: 'kick', snare: 'snare', hat: 'hihat' }, 'no sound has a print');
  for (const list of Object.values(ROW_SOUNDS)) assert.equal(new Set(list).size, list.length);
});

// A finish() result: A (1 bar), B (2 bars, 3/4, shuffled) and A again, then C faster.
const B16 = (s) => [...s].map((c) => c === 'x');
const RESULT = {
  seconds: 112,
  parts: [
    { id: 'A', bpm: 92, signature: '4/4', swing: 0, bars: 1, steps: { kick: B16('x.......x.......'), snare: B16('....x.......x...'), hat: B16('................') }, prints: { kick: null, snare: null, hat: null } },
    { id: 'B', bpm: 92, signature: '3/4', swing: 50, bars: 2, steps: { kick: B16('x...........x...........'), snare: B16('....x.......'.repeat(2)), hat: B16('x.x.x.x.x.x.'.repeat(2)) }, prints: { kick: null, snare: null, hat: null } },
    { id: 'C', bpm: 120, signature: '4/4', swing: 0, bars: 1, steps: { kick: B16('x...x...x...x...'), snare: B16('................'), hat: B16('xxxxxxxxxxxxxxxx') }, prints: { kick: null, snare: null, hat: null } },
  ],
  order: [{ partId: 'A', startBar: 1, bars: 8 }, { partId: 'B', startBar: 9, bars: 4 }, { partId: 'A', startBar: 13, bars: 8 }, { partId: 'C', startBar: 22, bars: 16 }],
  tempos: [{ bar: 22, bpm: 120 }],
};
const ids = () => { let n = 0; return (prefix) => `${prefix}-t${++n}`; };

test('each part becomes a beat: one fun name and its letter, its tempo, signature, swing, bars, and only the rows that hit', () => {
  const sounds = { A: { kick: 'kick-dusty', snare: 'clap', hat: 'hihat' } };
  const { base, beats } = makeBeats(RESULT, { personId: 'p-x', sounds, taken: [], newId: ids(), now: 5, random: () => 0 });
  assert.deepEqual(beats.map((b) => b.partId), ['A', 'B', 'C']);
  assert.deepEqual(beats.map((b) => b.beat.name), [`${base} · A`, `${base} · B`, `${base} · C`]);
  const [a, b, c] = beats.map((x) => x.beat);
  assert.match(a.id, /^beat-/);
  assert.deepEqual([a.bpm, a.signature, a.swing, a.bars], [92, '4/4', 0, 1]);
  assert.deepEqual(a.rows.map((r) => r.clipId), ['p-x-kick-dusty', 'p-x-clap'], 'the hats never hit: no row');
  assert.deepEqual(a.rows[0].steps, RESULT.parts[0].steps.kick);
  assert.deepEqual([b.bpm, b.signature, b.swing, b.bars, b.rows[0].steps.length], [92, '3/4', 50, 2, 24]);
  assert.deepEqual(b.rows.map((r) => r.clipId), ['p-x-kick', 'p-x-snare', 'p-x-hihat'], 'the plain sounds when none was picked');
  assert.deepEqual(c.rows.map((r) => r.clipId), ['p-x-kick', 'p-x-hihat']);
  assert.deepEqual([a.created, a.saved, a.personId], [5, 5, 'p-x']);
  assert.ok(beats.every((x) => x.beat.name.length <= 24));
});

test('a sound the board lacks falls back to the row\'s plain sound', () => {
  const { beats } = makeBeats(RESULT, { personId: 'p-x', sounds: { A: { kick: 'kick-dusty', snare: 'snare', hat: 'hihat' } }, newId: ids(), hasClip: (id) => id !== 'p-x-kick-dusty' });
  assert.equal(beats[0].beat.rows[0].clipId, 'p-x-kick');
});

test('the beats\' names are free: a fun name none of whose lettered names is taken', () => {
  const first = partNames(['A', 'B'], [], () => 0);
  const again = partNames(['A', 'B'], [first.names[1]], () => 0);
  assert.notEqual(again.base, first.base);
  assert.deepEqual(again.names, [`${again.base} · A`, `${again.base} · B`]);
  assert.ok(again.names.every((n) => n.length <= 24));
});

test('with two or more parts, a song: the parts in order on lane 1 at their bars, the first part\'s tempo, a mark where it changed', () => {
  const { base, beats } = makeBeats(RESULT, { personId: 'p-x', newId: ids(), random: () => 0 });
  const song = makeSong(RESULT, beats, { personId: 'p-x', name: base, newId: ids(), now: 7 });
  const id = (p) => beats.find((b) => b.partId === p).beat.id;
  assert.equal(song.name, base);
  assert.equal(song.tempo, 92);
  assert.deepEqual(song.tempos, [{ bar: 22, bpm: 120 }]);
  assert.deepEqual(song.lanes[0].blocks, [
    { beatId: id('A'), bar: 0, times: 8 },
    { beatId: id('B'), bar: 8, times: 2 },
    { beatId: id('A'), bar: 12, times: 8 },
    { beatId: id('C'), bar: 21, times: 16 },
  ]);
  assert.equal(song.lanes.length, 4);
  // As 🎼 Song reads it: nothing changed by cleaning, and no block runs into the next.
  const beatOf = (bid) => beats.find((b) => b.beat.id === bid)?.beat;
  const clean = cleanSong(song, () => 'x', beatOf);
  assert.deepEqual(clean.lanes[0].blocks, song.lanes[0].blocks);
  assert.deepEqual(clean.tempos, song.tempos);
  const spans = song.lanes[0].blocks.map((b) => blockSpan(b, (bid) => beatSteps(beatOf(bid))));
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i - 1].end <= spans[i].start, `block ${i} starts after the one before ends`);
  assert.equal(makeSong(RESULT, beats.slice(0, 1), { personId: 'p-x', name: base, newId: ids() }), null, 'one part: no song');
  assert.equal(makeSong(RESULT, beats, { personId: 'p-x', name: base, songNames: [base], newId: ids() }).name, `${base} 2`, 'a name songs have already');
});

test('a stretch that is not a whole number of its part\'s bars stops short of the next one', () => {
  const two = { ...RESULT.parts[1], signature: '4/4', steps: { kick: B16('x'.repeat(32)), snare: [], hat: [] } };
  const r = { ...RESULT, parts: [RESULT.parts[0], two], order: [{ partId: 'B', startBar: 1, bars: 3 }, { partId: 'A', startBar: 4, bars: 2 }] };
  const { beats } = makeBeats(r, { personId: 'p-x', newId: ids() });
  const song = makeSong(r, beats, { personId: 'p-x', name: 'Zippy Noodle', newId: ids() });
  assert.deepEqual(song.lanes[0].blocks.map((b) => [b.bar, b.times]), [[0, 1], [3, 2]]);
});

test('What I heard: the sentence, each part\'s line, and nothing heard at all', () => {
  assert.equal(heardSentence(RESULT), '1:52 of music, in 3 parts. 4/4 at 92 BPM, then 120 from 0:52. The hats swing a lot (Shuffle).');
  assert.equal(clock(barTime(RESULT, 22)), '0:52', 'A for 8 bars, B (3/4) for 4, A for 9: the bar between is at A\'s tempo');
  assert.equal(barTime(RESULT, 1), 0);
  assert.equal(partDetail(RESULT, RESULT.parts[0]), '92 BPM · 1 bar · heard twice');
  assert.equal(partDetail(RESULT, RESULT.parts[1]), '92 BPM · 2 bars · 3/4 · heard once');
  const one = { seconds: 65, parts: [{ ...RESULT.parts[2], swing: 33 }], order: [{ partId: 'C', startBar: 1, bars: 30 }], tempos: [] };
  assert.equal(heardSentence(one), '1:05 of music, in 1 part. 4/4 at 120 BPM. The hats swing a little (Swing).');
  assert.ok(heardABeat(RESULT));
  const silent = { seconds: 12, parts: [{ ...RESULT.parts[0], steps: { kick: B16('................'), snare: [], hat: [] } }], order: [], tempos: [] };
  assert.equal(heardABeat(silent), false, 'every step off');
  assert.equal(heardABeat({ seconds: 3, parts: [], order: [], tempos: [] }), false);
  assert.deepEqual(makeBeats(silent, { personId: 'p-x', newId: ids() }).beats, []);
  assert.deepEqual(resultCounts(RESULT), { seconds: 112, parts: 3, tempo_changes: 1 });
});
