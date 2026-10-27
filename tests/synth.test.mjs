// ✨ Make one: recipes are cleaned, render the same every time, and every
// starter makes a sound of its length.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTERS, TONES, SHAPES, cleanSynth, renderSynth, surpriseSynth } from '../web/synth.js';
import { synthName, SYNTH_NOUNS, MAX_NAME } from '../web/names.js';

const peak = (d) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('every starter is a clean recipe, with a unique id, a name and an emoji', () => {
  assert.equal(new Set(STARTERS.map((s) => s.id)).size, STARTERS.length);
  assert.deepEqual(STARTERS.map((s) => s.name), ['Laser', 'Boom', 'Tss', 'Clap', 'Siren', 'Coin', 'Wind']);
  for (const s of STARTERS) {
    assert.ok(s.emoji, s.id);
    assert.deepEqual(cleanSynth(s.recipe), s.recipe, `${s.id} is already clean`);
    assert.ok(SYNTH_NOUNS[s.id], `${s.id} has name words`);
  }
});

test('every starter renders its length, loud (peak 0.9) and never silent, and the same every time', () => {
  for (const s of STARTERS) {
    const d = renderSynth(s.recipe, 8000);
    assert.equal(d.length, Math.round(s.recipe.length * 8000), s.id);
    assert.ok(Math.abs(peak(d) - 0.9) < 1e-6, `${s.id}: ${peak(d)}`);
    assert.ok(d.every(Number.isFinite), s.id);
    assert.deepEqual(renderSynth(s.recipe, 8000), d, `${s.id}: same samples twice`);
  }
});

test('a Boom is a falling tone: more zero crossings at the start than at the end', () => {
  const d = renderSynth(STARTERS[1].recipe, 8000);
  const crossings = (from, to) => { let n = 0; for (let i = from + 1; i < to; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n; };
  const q = Math.floor(d.length / 4);
  assert.ok(crossings(0, q) > crossings(3 * q, 4 * q) * 1.5);
});

test('cleanSynth clamps numbers, fixes unknown words, and drops what isn\'t a recipe', () => {
  assert.deepEqual(cleanSynth({ tone: 'laser', from: 999999, to: -5, length: 60, shape: 'zigzag', pulses: 9, extra: 1 }),
    { tone: 'smooth', from: 12000, to: 30, length: 3, shape: 'drop', pulses: 4 });
  assert.deepEqual(cleanSynth({ tone: 'hiss', from: '440', length: NaN }), { tone: 'hiss', from: 160, to: 38, length: 0.8, shape: 'drop', pulses: 1 });
  for (const junk of [null, undefined, 3, 'boom', [], [1, 2]]) assert.equal(cleanSynth(junk), null, JSON.stringify(junk));
});

test('🎲 Make one: random recipes are clean and in range', () => {
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 300; i++) {
    const r = surpriseSynth(random);
    assert.deepEqual(cleanSynth(r), r);
    assert.ok(TONES.includes(r.tone) && SHAPES.includes(r.shape));
  }
});

test('synthName: an adjective and a word for what was made, fits 24, never repeats, odd ones are gadgets', () => {
  const taken = [];
  for (let i = 0; i < 300; i++) {
    const name = synthName('laser', taken);
    assert.ok(name.length <= MAX_NAME, name);
    assert.ok(!taken.includes(name), `repeat: ${name}`);
    taken.push(name);
  }
  assert.ok(SYNTH_NOUNS.laser.some((w) => synthName('laser', [], () => 0).endsWith(w)));
  assert.ok(SYNTH_NOUNS.other.some((w) => synthName('surprise', [], () => 0.5).endsWith(w)));
  for (const kind of Object.keys(SYNTH_NOUNS)) assert.ok(synthName(kind).length <= MAX_NAME);
});
