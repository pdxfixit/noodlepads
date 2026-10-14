// 🎵 Find its note: generated tones come back as their notes; noise and
// silence come back as no note.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNote, rootShift, noteName, midiOf } from '../web/pitch.js';
import { fakeBuffer } from './helpers.mjs';

const tone = (hz, rate = 44100, seconds = 0.6, harmonics = false) => fakeBuffer([Array.from({ length: Math.round(rate * seconds) }, (_, i) => {
  const t = i / rate;
  const v = Math.sin(2 * Math.PI * hz * t) + (harmonics ? 0.5 * Math.sin(4 * Math.PI * hz * t) + 0.3 * Math.sin(6 * Math.PI * hz * t) : 0);
  return v * 0.5 * Math.min(1, t * 50) * Math.exp(-t * 2);
})], rate);

test('A440 is note 69, an A', () => {
  const n = findNote(tone(440));
  assert.equal(n.midi, 69);
  assert.equal(n.name, 'A');
});

test('tones across the range, pure or rich, at 44.1 and 48 kHz', () => {
  for (const [hz, midi] of [[65.41, 36], [110, 45], [196, 55], [261.63, 60], [392, 67], [659.25, 76], [1046.5, 84]]) {
    for (const rate of [44100, 48000]) {
      assert.equal(findNote(tone(hz, rate))?.midi, midi, `${hz} Hz at ${rate}`);
      assert.equal(findNote(tone(hz, rate, 0.6, true))?.midi, midi, `${hz} Hz with harmonics at ${rate}`);
    }
  }
});

test('noise, silence and a too-short sound have no note', () => {
  let seed = 5;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  assert.equal(findNote(fakeBuffer([Array.from({ length: 22050 }, () => random() * 2 - 1)], 44100)), null, 'a hiss');
  assert.equal(findNote(fakeBuffer([new Array(22050).fill(0)], 44100)), null, 'silence');
  assert.equal(findNote(tone(440, 44100, 0.05)), null, 'too short to tell');
});

test('rootShift: the nearest way to C, at most 6 notes either way', () => {
  assert.equal(rootShift(60), 0);
  assert.equal(rootShift(72), 0, 'any C');
  assert.equal(rootShift(67), 5, 'G up to C');
  assert.equal(rootShift(62), -2, 'D down to C');
  assert.equal(rootShift(66), -6);
  assert.equal(rootShift(61), -1);
  assert.equal(rootShift(71), 1);
  for (let m = 0; m < 128; m++) assert.equal(((m + rootShift(m)) % 12 + 12) % 12, 0, `${m}`);
  assert.equal(rootShift(undefined), 0);
  assert.equal(rootShift(60.5), 0);
});

test('note names', () => {
  assert.equal(noteName(60), 'C');
  assert.equal(noteName(67), 'G');
  assert.equal(noteName(70), 'B♭');
  assert.ok(Math.abs(midiOf(440) - 69) < 1e-9);
});
