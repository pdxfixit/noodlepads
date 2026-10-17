// 🎹 Tune rows (ADR 0023): a row's notes as stored, played and carried
// everywhere a beat goes: the open beat and the library (cleanPattern),
// beat files, backups, share codes, cloud merges, grooves, Kids' squares.
// Old melody rows (a note per pill) are read as notes. Hearing them needs a
// browser: the sampler's pitch and the fade at a note's end are not heard here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanRow, cleanPattern, planHits, pillHits, samePattern, multiplyRows, mergeGroove, grooveBeat, grooveShape, beatToFile, beatFromFile, GROOVES, BASS_NOTES, bassNote,
} from '../web/sequencer.js';
import { readBackup, makeBackup } from '../web/backup.js';
import { shareBundle, shareDoc } from '../web/cloud-sync.js';
import { merge3 } from '../web/merge3.js';
import { withSquare, squaresOf } from '../web/kids-logic.js';

const n = (p, s, l = 1) => ({ p, s, l });
const on = (...at) => Array.from({ length: 16 }, (_, i) => at.includes(i));
const tuneRow = (tune, extra = {}) => cleanRow({ clipId: 'p-a-note-c', melody: true, tune, ...extra });

test('a tune row stores its notes; its pills light where notes start, and the old per-pill notes ride along for older copies', () => {
  const r = tuneRow([n(4, 2, 3), n(9, 0), n(-3, 6.5, 0.5)]);
  assert.deepEqual(r.tune, [n(9, 0), n(4, 2, 3), n(-3, 6.5, 0.5)]);
  assert.deepEqual(r.steps, on(0, 2, 6));
  assert.deepEqual([r.notes[0], r.notes[2], r.notes[6], r.notes[1]], [9, 4, 0, null]);
  assert.ok(r.accents.every((a) => a === false), 'no loud notes');
  assert.equal(cleanRow({ clipId: 'x', steps: on(1) }).tune, undefined, 'a plain row has no notes');
  assert.deepEqual(tuneRow([n(0, 40)]).steps.length, 41, 'a note past the first bar keeps its pill');
});

test('an older copy that saved a tune row kept only its pills and per-pill notes: it comes back as notes a pill long', () => {
  const r = tuneRow([n(5, 0, 4), n(7, 4)]);
  const { tune: _, ...older } = r;          // what an older copy's cleanRow keeps
  assert.deepEqual(cleanRow(older).tune, [n(4, 0), n(7, 4)], 'F was stored as the nearest old note, E; the length is lost');
});

test('notes play at their pitch, for their length, on a half pill too; a plain row\'s hit rings (len 0)', () => {
  const p = cleanPattern({ bpm: 120, rows: [{ clipId: 'a', steps: on(0) }, { clipId: 'b', melody: true, tune: [n(7, 0, 2), n(12, 4.5, 0.5), n(0, 4.5)] }] }, 'p');
  const hits = planHits(p, 'plain', 1.9);                       // 120 BPM: a pill is 0.125 s
  const tune = hits.filter((h) => h.row === 1).map((h) => [h.note, h.time, h.len]);
  assert.deepEqual(tune, [[7, 0, 0.25], [0, 0.5625, 0.125], [12, 0.5625, 0.0625]]);
  assert.deepEqual(hits.filter((h) => h.row === 0).map((h) => h.len), [0]);
  assert.deepEqual(pillHits(p.rows[1], 4).map((h) => h.at), [0.5, 0.5]);
  const swung = planHits(p, 'plain', 1.9, 16, 40).filter((h) => h.row === 1).map((h) => h.time);
  assert.deepEqual(swung, [0, 0.5625, 0.5625], 'swing moves the off pills; a half-pill note keeps its place');
  assert.deepEqual(planHits(cleanPattern({ bpm: 120, rows: [{ clipId: 'b', melody: true, muted: true, tune: [n(0, 0)] }] }, 'p'), 'plain', 1), [], 'muted: silent');
});

test('a changed note, length or pitch is a change to the beat', () => {
  const a = cleanPattern({ rows: [{ clipId: 'x', melody: true, tune: [n(0, 0)] }] }, 'p');
  for (const tune of [[n(0, 0, 2)], [n(2, 0)], [n(0, 0), n(4, 0)]]) {
    assert.ok(!samePattern(a, cleanPattern({ rows: [{ clipId: 'x', melody: true, tune }] }, 'p')), JSON.stringify(tune));
  }
  assert.ok(samePattern(a, cleanPattern({ rows: [{ clipId: 'x', melody: true, tune: [n(0, 0)] }] }, 'p')));
});

test('a growing beat copies a tune row\'s notes into the new bars', () => {
  const [r] = multiplyRows([tuneRow([n(4, 1, 2)])], 16, 32);
  assert.deepEqual(r.tune, [n(4, 1, 2), n(4, 17, 2)]);
  assert.ok(r.steps[17]);
});

test('💃 Grooves: the bass rows become one tune row of Bass C, where the first bass row was; chords stay pills', () => {
  const house = GROOVES.find((g) => g.id === 'house');
  const beat = grooveBeat(house, 'p-a');
  const ids = beat.rows.map((r) => r.clipId.slice(4));
  assert.deepEqual(ids, ['kick', 'clap', 'open-hat', 'hihat', 'chord-am', 'chord-f', 'bass-c']);
  const bass = beat.rows.at(-1);
  assert.equal(bass.melody, true);
  assert.deepEqual([...new Set(bass.tune.map((x) => x.p))].sort((a, b) => a - b), [BASS_NOTES['bass-f'], BASS_NOTES['bass-a']], 'A and F');
  assert.deepEqual(bass.tune.slice(0, 2), [n(9, 2, 4), n(9, 6, 4)], 'each note lasts until the next');
  assert.ok(beat.rows.filter((r) => r.clipId.includes('chord-')).every((r) => !r.melody));
  // Every groove with bass has one tune row; without its C (the kit's Bass C,
  // or an instrument's: `upright-c`, ADR 0030) it is left out, as any missing sound is.
  for (const g of GROOVES) {
    const base = g.rows.map(([kit]) => bassNote(kit)?.base).find(Boolean);
    const b = grooveBeat(g, 'p-a');
    assert.equal(b.rows.filter((r) => r.melody).length, base ? 1 : 0, g.id);
    assert.ok(b.rows.every((r) => r.steps.length >= grooveShape(g).bar * grooveShape(g).bars || !r.melody), g.id);
    assert.equal(grooveBeat(g, 'p-a', (id) => !id.endsWith(`-${base}`)).rows.some((r) => r.melody), false, g.id);
  }
});

test('➕ Add to this beat: a groove\'s bass line joins a tune row of the same sound, where no note starts yet', () => {
  const house = GROOVES.find((g) => g.id === 'house');
  const rows = [tuneRow([n(0, 2)], { clipId: 'p-a-bass-c' })];
  const { rows: out, added } = mergeGroove(rows, grooveBeat(house, 'p-a').rows, 16, 2, grooveShape(house));
  const bass = out.find((r) => r.clipId === 'p-a-bass-c');
  assert.equal(out.filter((r) => r.clipId === 'p-a-bass-c').length, 1, 'no second bass row');
  assert.ok(bass.tune.some((x) => x.p === 0 && x.s === 2), 'the kid\'s note stays');
  assert.ok(!bass.tune.some((x) => x.p === 9 && x.s === 2), 'the groove\'s note there waits');
  assert.ok(added > 0 && bass.tune.length > 1);
});

test('a beat file, a backup and a share code carry the notes', async () => {
  const beat = cleanPattern({ name: 'Tune', bpm: 100, rows: [
    { clipId: 'p-note-c', melody: true, tune: [n(4, 0, 2.5), n(7, 3.5, 0.5)] }, { clipId: 'p-kick', steps: on(0) }] }, 'p');
  const { file } = beatToFile(beat, ['note-c', 'kick']);
  const back = beatFromFile(JSON.stringify(file), 'q', ['note-c', 'kick']);
  assert.deepEqual(back.rows[0].tune, beat.rows[0].tune);
  assert.equal(back.rows[0].melody, true);

  const saved = { ...beat, id: 'beat-t-1', personId: 'pip', created: 1, saved: 2, rows: beat.rows.map((r) => ({ ...r, clipId: 'pip-airhorn' })) };
  const people = [{ id: 'pip', name: 'Pipsqueak', color: '#1F3FA8' }];
  const keep = { peopleIds: new Set(['pip']), clipIds: new Set(['pip-airhorn']), colorOk: () => true };
  const out = await readBackup(await makeBackup({ people, clips: [], beats: [saved], patterns: [saved] }, 'dev'), keep);
  assert.deepEqual(out.beats[0].rows[0].tune, beat.rows[0].tune);
  assert.deepEqual(out.patterns[0].rows[0].tune, beat.rows[0].tune, 'the open beat too');

  const lists = { clips: [], people: [], beats: [{ ...beat, id: 'beat-1', personId: 'p-a', rows: [{ ...beat.rows[0], clipId: 'p-a-note-c' }] }] };
  const made = shareBundle('beat', 'beat-1', lists, 'p-a', ['note-c']);
  const { doc } = shareDoc(made.bundle, 'p-c', ['note-c'], (k) => `${k}-new`, { kind: 'beat', title: 'Tune' });
  assert.deepEqual(cleanPattern(doc.beats[0], 'p-c').rows[0].tune, beat.rows[0].tune);
});

test('a 1.x backup with an old melody row loads it as notes', async () => {
  const old = { id: 'beat-o-1', personId: 'pip', name: 'Old', bpm: 100, bars: 1, swing: 0, created: 1, saved: 2,
    rows: [{ clipId: 'pip-airhorn', steps: on(0, 4), notes: [7, null, null, null, 12], melody: true }] };
  const out = await readBackup(await makeBackup({ people: [{ id: 'pip', name: 'Pipsqueak', color: '#1F3FA8' }], clips: [], beats: [old], patterns: [] }, 'dev'),
    { peopleIds: new Set(['pip']), clipIds: new Set(['pip-airhorn']), colorOk: () => true });
  assert.deepEqual(out.beats[0].rows[0].tune, [n(7, 0), n(12, 4)]);
});

test('two devices changing one tune row: notes added on each both stay; a note both changed takes the newer edit', () => {
  const beat = (tune, extra = {}) => ({ id: 'beat-1', personId: 'p-a', name: 'T', bpm: 100, bars: 1, swing: 0, rows: [tuneRow(tune)], ...extra });
  const B = beat([n(0, 0)]);
  const m = merge3('beats', B, beat([n(0, 0), n(4, 2)]), beat([n(0, 0, 3), n(7, 8)]));
  assert.deepEqual(cleanRow(m.record.rows[0]).tune, [n(0, 0, 3), n(4, 2), n(7, 8)], 'lengthened there, an E added here, a G there');
  const gone = merge3('beats', B, beat([]), beat([n(0, 0), n(9, 4)]));
  assert.deepEqual(cleanRow(gone.record.rows[0]).tune, [n(9, 4)], 'taken out here, untouched there: gone');
});

test('🧸 Kids: a square on a tune row is a note there, so the notes stay its notes', () => {
  const beat = { rows: [tuneRow([n(7, 4)], { clipId: 'kick' })] };
  const after = withSquare(beat, ['kick'], 0, 0, true, 1);
  assert.deepEqual(after.rows[0].tune, [n(0, 0), n(7, 4)]);
  assert.deepEqual(squaresOf(after, ['kick'])[0].slice(0, 3), [true, false, true]);
  assert.deepEqual(withSquare(after, ['kick'], 0, 2, false, 1).rows[0].tune, [n(0, 0)]);
});
