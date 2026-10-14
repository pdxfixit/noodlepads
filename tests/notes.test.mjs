// 🎹 The piano roll's notes (web/notes.js, ADR 0023): what a tap, a drag
// and a stored list mean. Pure: no page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOW, HIGH, VIEW, MAX_NOTES, MAX_NOTE_PILLS, MELODY_NOTES, cleanNotes, fromLegacy, legacy, noteAt, addNote, removeNote, resizeNote,
  startsIn, viewRows, homeView, moveView, lineOf, multiplyNotes, sameNotes, inScale, noteLabel, isC,
} from '../web/notes.js';

const n = (p, s, l = 1) => ({ p, s, l });

test('a stored list is made safe: whole pitches in range, half pills, time order, no same-pitch overlap', () => {
  assert.deepEqual(cleanNotes(null), []);
  assert.deepEqual(cleanNotes([n(4, 2), n(0, 0, 2)]), [n(0, 0, 2), n(4, 2)], 'in time order');
  assert.deepEqual(cleanNotes([n(0, 0.3, 1.2)]), [n(0, 0.5, 1)], 'starts and lengths go to the nearest half pill');
  assert.deepEqual(cleanNotes([n(1.5, 0), n(LOW - 1, 0), n(HIGH + 1, 0), n(0, -1), n(0, 0, 0), n(0, 99, 1), { p: '2', s: '1', l: '1' }], 64),
    [n(2, 1)], 'off pitches, junk, starts past the end and empty notes are dropped; numbers in text are read');
  assert.deepEqual(cleanNotes([n(0, 0, 4), n(0, 2, 1)]), [n(0, 0, 2), n(0, 2, 1)], 'a note running into the next of its pitch is cut short');
  assert.deepEqual(cleanNotes([n(0, 0, 1), n(0, 0, 3)]), [n(0, 0, 1)], 'the same note twice is one');
  assert.deepEqual(cleanNotes([n(0, 0, 1), n(7, 0, 1)]), [n(0, 0, 1), n(7, 0, 1)], 'two pitches at once: a chord');
  assert.equal(cleanNotes([n(0, 0, 500)])[0].l, MAX_NOTE_PILLS);
  assert.equal(cleanNotes(Array.from({ length: 400 }, (_, i) => n(i % 12, i)), 1000).length, MAX_NOTES);
});

test('tap an empty square: a note one pill long (half a pill at Advanced); a square a note covers has no room', () => {
  const one = addNote([], 4, 3);
  assert.deepEqual(one, { tune: [n(4, 3)], note: n(4, 3) });
  assert.deepEqual(addNote([], 4, 3.5, 0.5).note, n(4, 3.5, 0.5));
  assert.equal(addNote([n(4, 2, 3)], 4, 3), null, 'inside a note of that pitch');
  assert.deepEqual(addNote([n(4, 2, 3)], 7, 3).tune, [n(4, 2, 3), n(7, 3)], 'another pitch at the same time is fine');
  assert.deepEqual(addNote([n(4, 3.5, 1)], 4, 3, 1).note, n(4, 3, 0.5), 'a note starting half a pill later cuts the new one short');
  assert.equal(addNote([], HIGH + 1, 0), null);
  assert.equal(addNote(Array.from({ length: MAX_NOTES }, (_, i) => n(0, i)), 5, 0), null, 'a full row takes no more');
});

test('tap a note: it goes; noteAt finds a note by any square it covers', () => {
  const tune = [n(0, 0, 4), n(7, 2)];
  assert.equal(noteAt(tune, 0, 3), 0);
  assert.equal(noteAt(tune, 0, 4), -1, 'its end is not part of it');
  assert.equal(noteAt(tune, 7, 2), 1);
  assert.deepEqual(removeNote(tune, 0), [n(7, 2)]);
});

test('drag a note\'s end: the length snaps to whole pills (halves at Advanced), at least one step, short of the next note of its pitch', () => {
  const tune = [n(0, 0), n(0, 6), n(4, 1)];
  assert.deepEqual(resizeNote(tune, 0, 3.4)[0], n(0, 0, 3), 'to the nearest whole pill');
  assert.deepEqual(resizeNote(tune, 0, 3.4, 0.5)[0], n(0, 0, 3.5), 'Advanced: the nearest half');
  assert.deepEqual(resizeNote(tune, 0, -2)[0], n(0, 0, 1), 'never shorter than one step');
  assert.deepEqual(resizeNote(tune, 0, -2, 0.5)[0], n(0, 0, 0.5));
  assert.deepEqual(resizeNote(tune, 0, 12)[0], n(0, 0, 6), 'stops at the next C');
  assert.deepEqual(resizeNote(tune, 2, 12)[2], n(4, 1, 11), 'another pitch is no wall');
  assert.equal(resizeNote(tune, 0, 1.2), tune, 'no change: the same list');
  assert.deepEqual(resizeNote([n(0, 0)], 0, 999)[0].l, MAX_NOTE_PILLS);
});

test('the scale lock shows the white keys of two octaves; all notes shows twelve a octave; a row with a note always shows', () => {
  const locked = viewRows(0);
  assert.equal(locked.length, 15, 'C to C two octaves up, white keys only');
  assert.deepEqual(locked.slice(0, 3), [24, 23, 21], 'highest on top');
  assert.equal(locked.at(-1), 0);
  assert.ok(locked.every(inScale));
  assert.equal(viewRows(0, { all: true }).length, VIEW + 1);
  assert.ok(viewRows(0, { tune: [n(6, 0)] }).includes(6), 'an F♯ placed with all notes on stays in sight');
  assert.deepEqual([noteLabel(0), noteLabel(6), noteLabel(-1), noteLabel(26)], ['C', 'F♯', 'B', 'D']);
  assert.ok(isC(-12) && isC(24) && !isC(2));
});

test('the view opens on the C below the lowest note, moves an octave at a time, and stops at the ends', () => {
  assert.equal(homeView([]), 0);
  assert.equal(homeView([n(-5, 0), n(9, 2)]), -12);
  assert.equal(homeView([n(30, 0)]), HIGH - VIEW, 'the top view at most');
  assert.equal(moveView(0, 1), 12);
  assert.equal(moveView(0, -1), -12);
  assert.equal(moveView(LOW, -1), LOW);
  assert.equal(moveView(HIGH - VIEW, 1), HIGH - VIEW);
});

test('an old melody row: each pill on becomes a note a pill long at its note; off the old scale it was the sound itself', () => {
  const steps = [true, false, true, true, false];
  assert.deepEqual(fromLegacy(steps, [7, 2, 16, 3]), [n(7, 0), n(16, 2), n(0, 3)]);
  assert.deepEqual(fromLegacy(steps, undefined), [n(0, 0), n(0, 2), n(0, 3)]);
  assert.deepEqual(fromLegacy(null, null), []);
});

test('what an older copy reads beside the notes: a pill on where one starts, at the nearest old-scale note', () => {
  const { steps, notes } = legacy([n(5, 0, 3), n(11, 0), n(-3, 2.5, 0.5), n(40, 9)], 8);
  assert.deepEqual(steps, [true, false, true, false, false, false, false, false]);
  assert.equal(notes[0], 12, 'the highest of a chord, F and B, near E and high C');
  assert.equal(notes[2], 0, 'below the old lowest: C');
  assert.ok(notes.every((x) => x === null || MELODY_NOTES.includes(x)));
  assert.equal(steps.length, 8, 'a note past the end stays out');
});

test('notes starting in a pill: on it or half a pill after', () => {
  const tune = [n(0, 2), n(4, 2.5, 0.5), n(7, 3)];
  assert.deepEqual(startsIn(tune, 2), [n(0, 2), n(4, 2.5, 0.5)]);
  assert.deepEqual(startsIn(tune, 1), []);
});

test('a groove\'s bass rows as one tune: each note lasts until the next starts, at most 8 pills', () => {
  const on = (...at) => Array.from({ length: 16 }, (_, i) => at.includes(i));
  const tune = lineOf([{ p: 9, steps: on(0, 6) }, { p: 5, steps: on(2) }], 16);
  assert.deepEqual(tune, [n(9, 0, 2), n(5, 2, 4), n(9, 6, 8)]);
  assert.deepEqual(lineOf([{ p: 0, steps: on(14) }], 16), [n(0, 14, 2)], 'the last note runs to the end');
});

test('a growing beat copies its notes into the new bars; notes past the old end go', () => {
  assert.deepEqual(multiplyNotes([n(0, 0), n(4, 15.5, 0.5), n(7, 20)], 16, 32), [n(0, 0), n(4, 15.5, 0.5), n(0, 16), n(4, 31.5, 0.5)]);
  assert.ok(sameNotes([n(0, 0)], [n(0, 0)]));
  assert.ok(!sameNotes([n(0, 0)], [n(0, 0, 2)]));
  assert.ok(sameNotes(undefined, []));
});
