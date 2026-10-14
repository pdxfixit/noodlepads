// The Layers section's pure logic (tweaks.js layerRows, mute): one list of
// rows in play order, and a muted layer kept but not played.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerRows, addableKnobs, ADDED_AT, cleanTweaks, fullTweaks, playingTweaks, tweakSteps, tweakGain, tweaksKey, MAIN_KNOBS, MORE_KNOBS, LAYER_ORDER } from '../web/tweaks.js';
import { renderPlan, livePlan, recipeKey, storedFx, chainFields, cleanChain, voiceStep, playingChain } from '../web/voices.js';
import { cleanMyVoice } from '../web/voice-knobs.js';

test('the five main knobs are always rows, in play order; other knobs once set or shown; steps after them', () => {
  assert.deepEqual(layerRows(null), ['pitch', 'speed', 'warble', 'volume', 'echo']);
  assert.deepEqual(layerRows({ robot: 1 }), ['pitch', 'speed', 'robot', 'warble', 'volume', 'echo']);
  assert.deepEqual(layerRows(null, { shown: ['stutter'] }), ['pitch', 'speed', 'stutter', 'warble', 'volume', 'echo'], 'a knob moved back to normal keeps its row');
  assert.deepEqual(layerRows({ special: 'boom' }), ['pitch', 'speed', 'special', 'warble', 'volume', 'echo']);
  assert.deepEqual(layerRows(null, { steps: 2 }).slice(-3), ['echo', 'step:0', 'step:1'], 'the kid\'s own steps play after the knobs');
  assert.deepEqual(layerRows(null, { steps: 2, knobsFirst: false }).slice(0, 3), ['step:0', 'step:1', 'pitch'], 'a sound whose knobs play after its steps shows them after');
});

test('+ Add a layer offers the other knobs that aren\'t rows yet, each starting where it changes the sound', () => {
  assert.deepEqual(addableKnobs(null), MORE_KNOBS);
  assert.deepEqual(addableKnobs({ robot: 1 }, ['tone']), ['backwards', 'crunch', 'stutter']);
  for (const k of MORE_KNOBS) assert.ok(cleanTweaks({ [k]: ADDED_AT[k] })?.[k] !== undefined, `${k} starts set`);
  assert.equal(MAIN_KNOBS.length + MORE_KNOBS.length, LAYER_ORDER.length);
});

test('a muted knob keeps its setting but does not play; only set knobs can be muted; the cache key tells them apart', () => {
  const t = cleanTweaks({ pitch: 5, echo: 3, muted: ['echo', 'robot', 'junk'] });
  assert.deepEqual(t, { pitch: 5, echo: 3, muted: ['echo'] });
  assert.deepEqual(playingTweaks(t), { pitch: 5 });
  assert.deepEqual(tweakSteps(t).map((s) => s.type), ['stretch', 'pitch']);
  assert.equal(tweakGain({ volume: -2, muted: ['volume'] }), 1);
  assert.equal(playingTweaks({ echo: 3, muted: ['echo'], first: true }), null, 'all muted: nothing plays');
  assert.notEqual(tweaksKey(t), tweaksKey({ pitch: 5, echo: 3 }));
  assert.equal(tweaksKey({ pitch: 5, echo: 3 }), '~p5,e3', 'unmuted keys as before');
  assert.equal(fullTweaks(t).muted, undefined, 'the sheet keeps mutes apart from the knobs');
  assert.deepEqual(cleanTweaks({ special: 'clones', muted: ['special'] }), { special: 'clones', muted: ['special'] });
  const mine = cleanMyVoice({ id: 'v', personId: 'p', name: 'X', knobs: { pitch: 2, muted: ['pitch'] } });
  assert.deepEqual(mine.knobs, { pitch: 2 }, 'a kid\'s own voice is knobs, never mutes');
});

test('a muted step stays in the chain, stored, and is left out of what plays', () => {
  const chain = cleanChain([{ type: 'echo', repeats: 2, gap: 0.3, off: true }, voiceStep('robot')]);
  assert.equal(chain[0].off, true);
  assert.deepEqual(renderPlan(chain).steps, [voiceStep('robot')]);
  assert.deepEqual(renderPlan([{ ...voiceStep('chipmunk'), off: true }]).steps, [voiceStep('normal')], 'all muted: Normal');
  assert.deepEqual(playingChain([{ type: 'reverse', off: true }]), [voiceStep('normal')]);
  assert.equal(recipeKey({ fx: chain }), recipeKey({ fx: [voiceStep('robot')] }), 'same sound, same cache');
  assert.ok(storedFx([{ ...voiceStep('chipmunk', 2), off: true }]), 'one muted voice needs fx to say so');
  assert.equal(chainFields([voiceStep('chipmunk', 2)]).fx, undefined, 'one voice is stored as before');
  // A muted live step is not played live: the loop's tail starts after it.
  const plan = livePlan([{ type: 'echo', repeats: 2, gap: 0.3 }, { type: 'room', size: 0.5, off: true }]);
  assert.equal(plan.tail.length, 0);
});
