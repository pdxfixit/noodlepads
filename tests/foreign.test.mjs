// What a newer copy of the app wrote into a record, kept for the cloud
// (web/foreign.js): the checks drop it here, the push puts it back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreForeign, foreignOf } from '../web/foreign.js';

const beat = (extra = {}, rowExtra = {}) => ({
  id: 'beat-1', personId: 'p', name: 'Taco', bpm: 100,
  rows: [{ clipId: 'a', steps: [true, false], ...rowExtra }, { clipId: 'b', steps: [false, true] }], ...extra,
});

test('a record the checks leave whole has nothing foreign', () => {
  assert.equal(foreignOf(beat(), beat()), null);
  assert.equal(foreignOf(beat(), { ...beat(), changed: 5 }), null, 'the edit stamp is not content');
});

test('a field a newer app added comes back on the next push, with this device\'s edit', () => {
  const raw = beat({ mood: 'spooky' }, { wobble: 0.5 });
  const cleaned = beat();
  const kept = foreignOf(cleaned, raw);
  assert.ok(kept, 'remembered');
  const edited = beat();
  edited.rows[1].steps[0] = true;   // this device tapped a pill
  const sent = restoreForeign(edited, kept.cleaned, kept.raw);
  assert.equal(sent.mood, 'spooky');
  assert.equal(sent.rows[0].wobble, 0.5, 'inside a row too');
  assert.deepEqual(sent.rows[1].steps, [true, true], 'the edit stays');
  assert.equal(edited.mood, undefined, 'the record it was given is not changed');
});

test('a row matched by its sound keeps its newer fields when rows move or go', () => {
  const kept = foreignOf(beat(), beat({}, { wobble: 0.5 }));
  const moved = beat();
  moved.rows.reverse();
  assert.equal(restoreForeign(moved, kept.cleaned, kept.raw).rows[1].wobble, 0.5);
  const gone = beat();
  gone.rows.shift();
  assert.deepEqual(restoreForeign(gone, kept.cleaned, kept.raw).rows.map((r) => r.clipId), ['b'], 'a row removed here stays removed');
});

test('a value this device changed is not put back; one it did not touch is', () => {
  const kept = foreignOf(beat({ bpm: 100 }), beat({ bpm: 100, swing: 'shuffle9', name: 'Taco!' }));
  const edited = beat({ name: 'Mine' });
  const sent = restoreForeign(edited, kept.cleaned, kept.raw);
  assert.equal(sent.name, 'Mine', 'this device renamed it');
  assert.equal(sent.swing, 'shuffle9');
});

test('a field this device put there itself is not overwritten, and a removed one stays removed', () => {
  const cleaned = { personId: 'p', values: { a: 1, b: 2 } };
  const kept = foreignOf(cleaned, { personId: 'p', values: { a: 1, b: 2, future: 3 }, extra: true });
  assert.deepEqual(restoreForeign({ personId: 'p', values: { a: 1, b: 2 } }, kept.cleaned, kept.raw), { personId: 'p', values: { a: 1, b: 2, future: 3 }, extra: true });
  assert.deepEqual(restoreForeign({ personId: 'p', values: { a: 1, b: 2, future: 9 } }, kept.cleaned, kept.raw).values.future, 9);
  assert.equal('b' in restoreForeign({ personId: 'p', values: { a: 1 } }, kept.cleaned, kept.raw).values, false);
});

test('rows the checks cut come back when the list was not touched here', () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ clipId: `c${i}`, steps: [true] }));
  const kept = foreignOf({ personId: 'p', rows: rows.slice(0, 2) }, { personId: 'p', rows });
  assert.equal(restoreForeign({ personId: 'p', rows: rows.slice(0, 2) }, kept.cleaned, kept.raw).rows.length, 4);
});

test('audio and the stamp are never taken from the cloud\'s copy', () => {
  const kept = foreignOf({ id: 'c', personId: 'p', label: 'x' }, { id: 'c', personId: 'p', label: 'x', sound: 'old', sha256: 'old', bytes: 1, changed: 1, future: true });
  const sent = restoreForeign({ id: 'c', personId: 'p', label: 'x', sound: 'new', sha256: 'new', bytes: 2, changed: 9 }, kept.cleaned, kept.raw);
  assert.deepEqual([sent.sound, sent.sha256, sent.bytes, sent.changed, sent.future], ['new', 'new', 2, 9, true]);
});
