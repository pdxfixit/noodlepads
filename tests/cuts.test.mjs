// Trim and chop, the pure part (web/cuts.js), and chop names (names.js):
// onsets found in generated sounds, trims and marks cleaned, the pieces a
// chop makes, and family names that never repeat.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onsets, cleanTrim, trimKey, cleanFrom, cleanMarks, pieces, newMark, MAX_PIECES } from '../web/cuts.js';
import { chopName, soundName, MAX_LABEL, CHOP_NAMES } from '../web/names.js';
import { fakeBuffer } from './helpers.mjs';

const RATE = 8000;
// A sound made of parts: [{at, length, level, decay?}] tone bursts on a bed of `noise`.
function sound(seconds, parts, noise = 0) {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const d = Array.from({ length: Math.round(seconds * RATE) }, () => rand() * 2 * noise);
  for (const { at, length, level, decay = 0 } of parts) {
    const from = Math.round(at * RATE);
    for (let i = 0; i < length * RATE && from + i < d.length; i++) {
      d[from + i] += Math.sin(i / 2) * level * Math.exp(-decay * i / RATE);
    }
  }
  return fakeBuffer([d], RATE);
}
const near = (got, want, slack = 0.03) => got.length === want.length && got.every((t, i) => Math.abs(t - want[i]) <= slack);

test('onsets: three words with quiet between are three starts', () => {
  const b = sound(2, [{ at: 0.1, length: 0.3, level: 0.6 }, { at: 0.7, length: 0.3, level: 0.4 }, { at: 1.3, length: 0.4, level: 0.8 }]);
  const got = onsets(b);
  assert.ok(near(got, [0.1, 0.7, 1.3]), `got ${got}`);
});

test('onsets: hits over a noisy room still count, and the noise does not', () => {
  const b = sound(2, [{ at: 0.2, length: 0.2, level: 0.5 }, { at: 1.0, length: 0.2, level: 0.5 }], 0.03);
  assert.ok(near(onsets(b), [0.2, 1.0]), `got ${onsets(b)}`);
});

test('onsets: a second hit while the first still rings out is its own start', () => {
  const b = sound(1.5, [{ at: 0.1, length: 1, level: 0.5, decay: 6 }, { at: 0.6, length: 0.5, level: 0.8, decay: 6 }]);
  assert.ok(near(onsets(b), [0.1, 0.6]), `got ${onsets(b)}`);
});

test('onsets: silence has none; starts closer than the gap count once; never more than the cap', () => {
  assert.deepEqual(onsets(sound(1, [])), []);
  assert.deepEqual(onsets({ length: 0 }), []);
  const close = sound(1, [{ at: 0.1, length: 0.03, level: 0.5 }, { at: 0.17, length: 0.1, level: 0.5 }]);
  assert.equal(onsets(close).length, 1);
  const many = sound(8, Array.from({ length: 30 }, (_, i) => ({ at: 0.05 + i * 0.25, length: 0.08, level: 0.5 })));
  assert.equal(onsets(many).length, MAX_PIECES);
});

test('cleanTrim keeps a usable trim, fitted to the audio, and drops junk', () => {
  assert.deepEqual(cleanTrim({ start: 0.25, end: 1.5 }), { start: 0.25, end: 1.5 });
  assert.deepEqual(cleanTrim({ start: -1, end: 9 }, 2), { start: 0, end: 2 }, 'kept inside the audio');
  assert.deepEqual(cleanTrim({ start: 0.12345678, end: 0.9 }), { start: 0.123, end: 0.9 });
  for (const junk of [null, 'x', 5, [], {}, { start: 1 }, { start: '0', end: '1' }, { start: 1, end: 0.5 },
    { start: 0, end: 0.01 }, { start: NaN, end: 1 }, { start: 0, end: Infinity }, { start: 3, end: 4 }]) {
    assert.equal(cleanTrim(junk, 2), null, JSON.stringify(junk));
  }
  assert.equal(trimKey(undefined), '');
  assert.equal(trimKey({ start: 0.5, end: 1 }), '@0.5-1');
});

test('cleanFrom keeps {id, how} for chop and mix only', () => {
  assert.deepEqual(cleanFrom({ id: 'user-abc-1', how: 'chop', extra: 1 }), { id: 'user-abc-1', how: 'chop' });
  assert.deepEqual(cleanFrom({ id: 'pip-kick', how: 'mix' }), { id: 'pip-kick', how: 'mix' });
  for (const junk of [null, 'x', { id: 'a b', how: 'chop' }, { id: 'x'.repeat(65), how: 'chop' }, { id: 'a', how: 'blend' }, { how: 'chop' }]) {
    assert.equal(cleanFrom(junk), null, JSON.stringify(junk));
  }
});

test('marks are sorted, inside the sound, apart, and capped; pieces cover the whole sound', () => {
  assert.deepEqual(cleanMarks([1.5, 0.5, 0.01, 1.98, 0.52, NaN, 'x'], 2), [0.5, 1.5]);
  assert.equal(cleanMarks(Array.from({ length: 40 }, (_, i) => 0.1 + i * 0.1), 5).length, MAX_PIECES - 1);
  assert.deepEqual(pieces([1, 0.4], 2), [{ start: 0, end: 0.4 }, { start: 0.4, end: 1 }, { start: 1, end: 2 }]);
  assert.deepEqual(pieces([], 1.2), [{ start: 0, end: 1.2 }]);
});

test('a new mark goes in the middle of the longest piece, and stops at the cap', () => {
  assert.equal(newMark([], 2), 1);
  assert.equal(newMark([0.5], 2), 1.25);
  assert.equal(newMark([], 0.08), null, 'too short to cut');
  const full = Array.from({ length: MAX_PIECES - 1 }, (_, i) => 0.1 + i * 0.1);
  assert.equal(newMark(full, 5), null);
});

test('chopName: family names of the parent, never repeating, fitting 24', () => {
  const taken = ['Burp'];
  for (let i = 0; i < CHOP_NAMES.length; i++) {
    const name = chopName('Burp', taken, () => 0.4);
    assert.match(name, /Burp/);
    assert.ok(!taken.includes(name), `${name} repeats`);
    taken.push(name);
  }
  assert.equal(chopName('Burp', [], () => 0), 'Baby Burp');
  assert.equal(chopName('Burp', ['baby burp'], () => 0), 'Burp Jr.', 'case does not make a new name');
});

test('chopName: a long parent keeps its last word; nothing fits falls back to a made-up name', () => {
  assert.equal(chopName('Supercalifragilistic Kazoo', [], () => 0), 'Baby Kazoo');
  const huge = 'X'.repeat(30);
  const name = chopName(huge, [], () => 0);
  assert.ok(name.length <= MAX_LABEL && !name.includes('X'), name);
  assert.equal(chopName('', [], () => 0), soundName([], () => 0));
  for (let i = 0; i < 200; i++) assert.ok(chopName('Wobbly Kazoo Thunder Boom').length <= MAX_LABEL);
});
