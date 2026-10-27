// The beat maker's pure rule for moving between pills, and the helper that compares two beats.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPattern, pillTarget } from '../web/beat.js';
import { samePattern } from './helpers.mjs';

const beat = (name, rows, bpm = 100) => cleanPattern({ name, bpm, rows }, 'pip');
const on = (...steps) => Array.from({ length: 16 }, (_, i) => steps.includes(i));

// ── comparing two beats (tests/helpers.mjs) ──

test('samePattern compares tempo, sounds and pills', () => {
  const a = beat('A', [{ clipId: 'x', steps: on(0, 4) }]);
  assert.ok(samePattern(a, beat('Other name', [{ clipId: 'x', steps: on(0, 4) }])));
  assert.ok(!samePattern(a, beat('A', [{ clipId: 'x', steps: on(0, 4) }], 120)));
  assert.ok(!samePattern(a, beat('A', [{ clipId: 'y', steps: on(0, 4) }])));
  assert.ok(!samePattern(a, beat('A', [{ clipId: 'x', steps: on(0, 5) }])));
  assert.ok(!samePattern(a, beat('A', [])));
});

// ── arrow keys between pills ──

test('pillTarget moves one pill and stops at the edges', () => {
  assert.deepEqual(pillTarget('ArrowRight', 1, 3, 4), [1, 4]);
  assert.deepEqual(pillTarget('ArrowLeft', 1, 3, 4), [1, 2]);
  assert.deepEqual(pillTarget('ArrowDown', 1, 3, 4), [2, 3]);
  assert.deepEqual(pillTarget('ArrowUp', 1, 3, 4), [0, 3]);
  assert.deepEqual(pillTarget('ArrowRight', 0, 15, 4), [0, 15]);
  assert.deepEqual(pillTarget('ArrowLeft', 0, 0, 4), [0, 0]);
  assert.deepEqual(pillTarget('ArrowDown', 3, 5, 4), [3, 5]);
  assert.deepEqual(pillTarget('ArrowUp', 0, 5, 4), [0, 5]);
});

test('pillTarget: Home and End go to the ends of the row, other keys are ignored', () => {
  assert.deepEqual(pillTarget('Home', 2, 9, 4), [2, 0]);
  assert.deepEqual(pillTarget('End', 2, 9, 4), [2, 15]);
  for (const k of ['a', 'Enter', ' ', 'Tab', 'PageDown']) assert.equal(pillTarget(k, 0, 0, 4), null);
});

test('moveItem moves one item and reports where every old index went', async () => {
  const { moveItem } = await import('../web/beat.js');
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(list, 0, 2), [2, 0, 1, 3]);
  assert.deepEqual(list, ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(list, 3, 0), [1, 2, 3, 0]);
  assert.deepEqual(list, ['d', 'b', 'c', 'a']);
  assert.deepEqual(moveItem(list, 1, 9), [0, 1, 2, 3], 'out of range: nothing moves');
  assert.deepEqual(list, ['d', 'b', 'c', 'a']);
});

test('the tempo slider pulls toward common tempos, yet every tempo has a stop', async () => {
  const { tempoStops, stopFor, COMMON_BPMS } = await import('../web/beat.js');
  const stops = tempoStops();
  for (let bpm = 60; bpm <= 180; bpm++) assert.ok(stops.includes(bpm), `${bpm} is reachable`);
  const width = (bpm) => stops.filter((b) => b === bpm).length;
  assert.ok(COMMON_BPMS.every((bpm) => width(bpm) > 3 * width(159)), 'common tempos take more travel');
  assert.equal(width(159), 1);
  assert.deepEqual([...stops].sort((a, b) => a - b), stops, 'in order');
  assert.equal(stops[stopFor(120, stops)], 120);
  assert.equal(stops[stopFor(159, stops)], 159);
  assert.equal(stopFor(10, stops), 0);
  assert.equal(stopFor(999, stops), stops.length - 1);
});

test('a typed tempo is a whole number in range, and junk is ignored', async () => {
  const { typedBpm } = await import('../web/beat.js');
  assert.equal(typedBpm('159'), 159);
  assert.equal(typedBpm(' 120.6 '), 121);
  assert.equal(typedBpm('20'), 60);
  assert.equal(typedBpm('400'), 180);
  assert.equal(typedBpm(''), null);
  assert.equal(typedBpm('fast'), null);
});

test('a groove becomes a beat on the person\'s own kit copies, leaving out sounds the board lacks', async () => {
  const { GROOVES } = await import('../web/grooves.js');
const { grooveBeat } = await import('../web/beat.js');
  assert.ok(GROOVES.length >= 5);
  const four = GROOVES.find((g) => g.id === 'four');
  const beat = grooveBeat(four, 'juno');
  assert.equal(beat.bpm, 120);
  assert.deepEqual(beat.rows.map((r) => r.clipId), ['juno-kick', 'juno-clap', 'juno-hihat']);
  assert.deepEqual(beat.rows[0].steps.slice(0, 16).map((on, i) => (on ? i : -1)).filter((i) => i >= 0), [0, 4, 8, 12]);
  assert.deepEqual(grooveBeat(four, 'juno', (id) => id !== 'juno-clap').rows.map((r) => r.clipId), ['juno-kick', 'juno-hihat']);
});
