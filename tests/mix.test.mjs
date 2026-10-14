// ➕ Mix with another sound: the mixing math and the blended names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIX, cleanMix, mixLevels, mixSounds, MAX_MIX_SECONDS } from '../web/mix.js';
import { mixName, MAX_LABEL } from '../web/names.js';

const ones = (n, v = 0.5) => new Float32Array(n).fill(v);
const peak = (d) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('cleanMix clamps the offset and balance, and junk gets the defaults', () => {
  assert.deepEqual(cleanMix({ offset: 9, balance: -1 }), { offset: 2, balance: 0 });
  assert.deepEqual(cleanMix({ offset: 'x', balance: NaN }), { offset: MIX.offset.default, balance: MIX.balance.default });
  assert.deepEqual(cleanMix(null), { offset: 0, balance: 0.5 });
});

test('the balance: both full in the middle, one fading out toward each end', () => {
  assert.deepEqual(mixLevels(0.5), [1, 1]);
  assert.deepEqual(mixLevels(0), [1, 0]);
  assert.deepEqual(mixLevels(1), [0, 1]);
  assert.deepEqual(mixLevels(0.75), [0.5, 1]);
});

test('the second sound starts after the offset; the mix is as long as both need, peak 0.9', () => {
  const a = { channels: [ones(100)], rate: 100 };
  const b = { channels: [ones(100, -0.5)], rate: 100 };
  const [out] = mixSounds(a, b, { offset: 0.5, balance: 0.5 });
  assert.equal(out.length, 150);
  assert.ok(Math.abs(out[10] - 0.9) < 1e-6, 'only the first: scaled to the top');
  assert.ok(Math.abs(out[70]) < 1e-6, 'both: they cancel');
  assert.ok(Math.abs(out[120] + 0.9) < 1e-6, 'only the second');
  assert.ok(Math.abs(peak(out) - 0.9) < 1e-6);
});

test('a mono sound plays in both channels of a stereo one; a different rate is resampled', () => {
  const a = { channels: [ones(100, 0.2), ones(100, 0.2)], rate: 100 };
  const b = { channels: [ones(50, 0.4)], rate: 50 };   // one second, at half the rate
  const out = mixSounds(a, b, { offset: 0, balance: 0.5 });
  assert.equal(out.length, 2);
  assert.equal(out[0].length, 100, 'one second at 100 Hz');
  assert.deepEqual([...out[0]], [...out[1]]);
});

test('a mix is capped in length', () => {
  const rate = 100;
  const a = { channels: [ones(rate * (MAX_MIX_SECONDS + 10))], rate };
  const [out] = mixSounds(a, { channels: [ones(10)], rate }, {});
  assert.equal(out.length, MAX_MIX_SECONDS * rate);
});

test('mixName blends the start of one with the end of the other, and falls back when it can\'t', () => {
  assert.equal(mixName('Burp', 'Honk', [], () => 0.1), 'Burponk');
  assert.equal(mixName('Burp', 'Honk', [], () => 0.9), 'Honkurp');
  assert.equal(mixName('Burp', 'Honk', ['Burponk'], () => 0.1), 'Honkurp', 'taken: the other way round');
  assert.equal(mixName('Wobbly Kazoo', 'Kick', [], () => 0.9), 'Kickazoo', 'last words');
  const long = 'Supercalifragilisticexpialidocious';
  const fallback = mixName(long, long, []);
  assert.ok(fallback.length <= MAX_LABEL && fallback.includes(' '), `too long: a made-up name (${fallback})`);
  assert.ok(mixName('A', 'B', []).length >= 3, 'too short: a made-up name');
});
