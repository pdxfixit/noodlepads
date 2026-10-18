import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOICES, voiceById, amountFor, amountText, presetGain } from '../web/voices.js';

test('every voice has a unique id, a name and an emoji', () => {
  const ids = VOICES.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(VOICES[0].id, 'normal');
  for (const v of VOICES) assert.ok(v.name && v.emoji, v.id);
});

test('every amount range is sane: min < default < max, positive step', () => {
  for (const v of VOICES.filter((x) => x.amount)) {
    const { min, max, step, default: d } = v.amount;
    assert.ok(min > 0 && min < max, v.id);
    assert.ok(d >= min && d <= max, v.id);
    assert.ok(step > 0, v.id);
  }
});

test('voiceById falls back to Normal for anything unknown', () => {
  assert.equal(voiceById('chipmunk').name, 'Chipmunk');
  assert.equal(voiceById('nope').id, 'normal');
  assert.equal(voiceById(undefined).id, 'normal');
});

test('amountFor: null for a voice with no setting', () => {
  assert.equal(amountFor('normal', 3), null);
  assert.equal(amountFor('robot', 3), null);
  assert.equal(amountFor('nope', 3), null);
});

test('amountFor: unset or junk gives the default', () => {
  assert.equal(amountFor('slow'), 6);
  assert.equal(amountFor('slow', undefined), 6);
  assert.equal(amountFor('slow', null), 6);
  assert.equal(amountFor('slow', 'fast'), 6);
  assert.equal(amountFor('slow', NaN), 6);
  assert.equal(amountFor('slow', 0), 6);
  assert.equal(amountFor('slow', -4), 6);
  assert.equal(amountFor('loud'), 10);
});

test('amountFor: clamped to the voice\'s range, strings from a slider accepted', () => {
  assert.equal(amountFor('slow', 100), 20);
  assert.equal(amountFor('slow', 0.1), 1.5);
  assert.equal(amountFor('chipmunk', '2.5'), 2.5);
  assert.equal(amountFor('loud', 99), 10);
  assert.equal(amountFor('loud', Infinity), 10);
});

test('amountText: how the setting reads on a pad or slider', () => {
  assert.equal(amountText('normal'), '');
  assert.equal(amountText('slow'), '6× slower');
  assert.equal(amountText('slow', 1.5), '1.5× slower');
  assert.equal(amountText('chipmunk'), '1.7× higher');
  assert.equal(amountText('monster', 2), '2× lower');
  assert.equal(amountText('fast', 3.14159), '3.14× faster');
  assert.equal(amountText('loud'), '10 of 10');
  assert.equal(amountText('loud', 3), '3 of 10');
});

test('after a voice, the quiet at both ends goes, but an echo\'s soft tail stays', async () => {
  const { audibleSpan } = await import('../web/voices.js');
  const rate = 1000;                                   // 1 sample = 1 ms, to read easily
  const d = new Float32Array(2000);
  for (let i = 500; i < 900; i++) d[i] = 0.8;          // the sound: 0.5 s to 0.9 s
  for (let i = 900; i < 1900; i++) d[i] = 0.004;       // a long, near-silent tail (about -46 dB)
  assert.deepEqual(audibleSpan([d], rate), { from: 470, to: 1050 }, '30 ms before, 150 ms after');
  assert.deepEqual(audibleSpan([new Float32Array(10)], rate), { from: 0, to: 10 }, 'silence is left alone');
  // The widest span across channels wins.
  const left = new Float32Array(2000); left[300] = 1;
  assert.deepEqual(audibleSpan([d, left], rate), { from: 270, to: 1050 });
});

test('cleanChain keeps known voices, clamps amounts and drops everything else', async () => {
  const { cleanChain, MAX_CHAIN } = await import('../web/voices.js');
  assert.deepEqual(cleanChain([
    { type: 'voice', voice: 'chipmunk', amount: 99 },
    { type: 'voice', voice: 'robot', amount: 4 },          // Robot has no amount
    { type: 'voice', voice: 'nope' },
    { type: 'warp', repeats: 3 },                          // a kind this copy doesn't know
    null, 'slow', 7, [],
    { type: 'voice', voice: 'slow' },                      // no amount: the default
  ]), [
    { type: 'voice', voice: 'chipmunk', amount: 4 },
    { type: 'voice', voice: 'robot' },
    { type: 'voice', voice: 'slow', amount: 6 },
  ]);
  for (const junk of [undefined, null, 'chipmunk', {}, [], [{ type: 'laser' }]]) assert.equal(cleanChain(junk), null, JSON.stringify(junk));
  assert.equal(cleanChain(Array(20).fill({ type: 'voice', voice: 'robot' })).length, MAX_CHAIN);
  assert.equal(cleanChain(Array(5).fill({ type: 'voice', voice: 'robot' }), 3).length, 3);
});

test('cleanChain: Normal does nothing between other voices, so it goes; alone it stays', async () => {
  const { cleanChain } = await import('../web/voices.js');
  assert.deepEqual(cleanChain([{ type: 'voice', voice: 'normal' }, { type: 'voice', voice: 'robot' }, { type: 'voice', voice: 'normal' }]),
    [{ type: 'voice', voice: 'robot' }]);
  assert.deepEqual(cleanChain([{ type: 'voice', voice: 'normal' }]), [{ type: 'voice', voice: 'normal' }]);
});

test('STEPS: every kind has an id, a name, an emoji and a cleaner', async () => {
  const { STEPS } = await import('../web/voices.js');
  const ids = STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of STEPS) assert.ok(s.name && s.emoji && typeof s.clean === 'function', s.id);
});

test('an old clip (one voice, no fx) keeps the render key it had before chains: voice:amount', async () => {
  const { recipeKey, chainOf } = await import('../web/voices.js');
  const before = (clip) => `${clip.voice || 'normal'}:${amountFor(clip.voice, clip.amount)}`;   // the key from before chains
  const clips = [{}, { voice: 'normal' }, ...VOICES.flatMap((v) => [{ voice: v.id }, { voice: v.id, amount: 3 }, { voice: v.id, amount: 1000 }])];
  for (const clip of clips) assert.equal(recipeKey(clip), before(clip), JSON.stringify(clip));
  assert.deepEqual(chainOf({ voice: 'slow', amount: 8 }), [{ type: 'voice', voice: 'slow', amount: 8 }]);
  assert.deepEqual(chainOf({ voice: 'nope' }), [{ type: 'voice', voice: 'normal' }]);
});

test('a chain gets its own key, and its order matters', async () => {
  const { recipeKey } = await import('../web/voices.js');
  const fx = [{ type: 'voice', voice: 'chipmunk', amount: 2 }, { type: 'voice', voice: 'stadium' }];
  assert.equal(recipeKey({ voice: 'chipmunk', amount: 2, fx }), 'chipmunk:2>stadium:null');
  assert.equal(recipeKey({ fx: [...fx].reverse() }), 'stadium:null>chipmunk:2');
  assert.equal(recipeKey({ voice: 'robot', fx: 'junk' }), 'robot:null', 'junk fx falls back to the voice');
});

test('chainFields: one voice is stored the old way; more adds fx', async () => {
  const { chainFields, chainText } = await import('../web/voices.js');
  assert.deepEqual(chainFields([{ type: 'voice', voice: 'slow', amount: 8 }]), { voice: 'slow', amount: 8, fx: undefined });
  assert.deepEqual(chainFields([{ type: 'voice', voice: 'robot', amount: null }, { type: 'voice', voice: 'normal' }]), { voice: 'robot', amount: undefined, fx: undefined });
  assert.deepEqual(chainFields([]), { voice: 'normal', amount: undefined, fx: undefined });
  const two = chainFields([{ type: 'voice', voice: 'chipmunk', amount: 2 }, { type: 'voice', voice: 'stadium' }]);
  assert.equal(two.voice, 'chipmunk');
  assert.equal(two.amount, 2);
  assert.equal(two.fx.length, 2);
  assert.equal(chainText(two.fx), 'Chipmunk 2× higher, then Stadium');
});

test('🎲 surpriseChain: 1 to 3 voices, never Normal, never two from one family, amounts in range', async () => {
  const { surpriseChain, cleanChain } = await import('../web/voices.js');
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;   // repeatable
  const family = { chipmunk: 'pitch', monster: 'pitch', alien: 'pitch', fast: 'speed', slow: 'speed',
    robot: 'tone', walkie: 'tone', underwater: 'tone', clones: 'copies', stutter: 'copies', backwards: 'copies', loud: 'loud', stadium: 'room' };
  const lengths = new Set();
  for (let i = 0; i < 500; i++) {
    const chain = surpriseChain(random);
    lengths.add(chain.length);
    assert.ok(chain.length >= 1 && chain.length <= 3);
    assert.deepEqual(cleanChain(chain), chain, 'already clean: known voices, amounts in range');
    const fams = chain.map((s) => family[s.voice]);
    assert.ok(fams.every(Boolean), `only voices from the list: ${JSON.stringify(chain)}`);
    assert.equal(new Set(fams).size, fams.length, `one per family: ${JSON.stringify(chain)}`);
    if (fams.includes('room')) assert.equal(fams.at(-1), 'room', 'Stadium comes last');
    for (const s of chain.filter((x) => x.voice === 'slow')) assert.ok(s.amount <= 3, 'Slow stays quick to render');
  }
  assert.deepEqual([...lengths].sort(), [1, 2, 3]);
  assert.equal(surpriseChain(() => 0).length, 1);
  assert.equal(surpriseChain(() => 0.999).length, 3);
  assert.equal(surpriseChain(() => 0.999, 2).length, 2);
});

test('a chain renders each voice in turn, from what the one before made', async () => {
  const { FakeAudioBuffer, fakeBuffer } = await import('./helpers.mjs');
  const { applyChain } = await import('../web/voices.js');
  const { getLog, clearLog } = await import('../web/log.js');
  globalThis.AudioBuffer = FakeAudioBuffer;
  clearLog();
  const d = Array.from({ length: 8000 }, (_, i) => (i < 4000 ? Math.sin(i / 5) * 0.5 : Math.sin(i / 5) * 0.1));   // loud, then quiet
  const out = await applyChain(fakeBuffer([d], 8000), [{ type: 'voice', voice: 'backwards' }, { type: 'voice', voice: 'fast', amount: 2 }]);
  assert.ok(out.duration > 0.4 && out.duration < 0.6, `twice as fast: ${out.duration}`);
  const ch = out.buffer.getChannelData(0);
  const level = (from, to) => Math.max(...ch.slice(from, to).map(Math.abs));
  assert.ok(level(0, ch.length / 4) < level(ch.length * 3 / 4, ch.length), 'backwards: the quiet part comes first');
  assert.deepEqual(getLog().map((e) => e.data.voice), ['backwards>fast'], 'one log line for the whole chain');
});

test('every render is timed in the event log: voice, amount, seconds in and out, milliseconds', async () => {
  const { FakeAudioBuffer, fakeBuffer } = await import('./helpers.mjs');
  const { applyVoice } = await import('../web/voices.js');
  const { getLog, clearLog } = await import('../web/log.js');
  globalThis.AudioBuffer = FakeAudioBuffer;
  clearLog();
  const d = new Array(8000).fill(0).map((_, i) => Math.sin(i / 5) * 0.5);   // 1 s at 8 kHz
  await applyVoice(fakeBuffer([d], 8000), 'backwards');
  await applyVoice(fakeBuffer([d], 8000), 'normal');   // a plain copy, made for every pad at start-up: not logged
  await applyVoice(fakeBuffer([d], 8000), 'fast', 2);
  assert.equal(getLog().length, 2);
  const [a, b] = getLog();
  assert.equal(a.kind, 'render');
  assert.deepEqual(Object.keys(a.data), ['voice', 'seconds', 'out', 'ms']);
  assert.equal(a.data.voice, 'backwards');
  assert.equal(a.data.seconds, 1);
  assert.ok(Number.isInteger(a.data.ms) && a.data.ms >= 0);
  assert.deepEqual({ voice: b.data.voice, amount: b.data.amount }, { voice: 'fast', amount: 2 });
  assert.ok(b.data.out < 0.6, 'twice as fast is about half as long');
});

test('Normal keeps a sound\'s exact length, silent tail included; a voice trims its quiet ends', async () => {
  const { FakeAudioBuffer, fakeBuffer } = await import('./helpers.mjs');
  const { applyChain } = await import('../web/voices.js');
  globalThis.AudioBuffer = FakeAudioBuffer;
  // A beat made into a sound: a hit, then a long silent tail that keeps its loop in time.
  const d = Array.from({ length: 8000 }, (_, i) => (i < 800 ? Math.sin(i / 5) * 0.5 : 0));
  const plain = await applyChain(fakeBuffer([d], 8000), null);
  assert.equal(plain.buffer.length, 8000, 'Normal: every sample kept');
  const voiced = await applyChain(fakeBuffer([d], 8000), [{ type: 'voice', voice: 'backwards' }]);
  assert.ok(voiced.buffer.length < 2000, `a voice trims the silence: ${voiced.buffer.length}`);
});

test('a soft tail (an echo, about -38 dB) is kept, not cut', async () => {
  const { audibleSpan } = await import('../web/voices.js');
  const d = new Float32Array(2000);
  for (let i = 500; i < 900; i++) d[i] = 0.8;
  for (let i = 900; i < 1400; i++) d[i] = 0.01;          // the echo
  assert.ok(audibleSpan([d], 1000).to >= 1400, 'the echo is still there');
});

test('livePlan: knobs that play first go in the head; knobs after join the live tail only when each plays live', async () => {
  const { livePlan } = await import('../web/voices.js');
  const echo = { type: 'echo', repeats: 3, gap: 0.25 };
  const chain = [{ type: 'stretch', speed: 2 }, echo];
  assert.deepEqual(livePlan(chain, null), { head: [chain[0]], tail: [echo], tailIndex: 1, headTweaks: null, gain: 1 });
  assert.deepEqual(livePlan(chain, { pitch: 9, first: true }), { head: [chain[0]], tail: [echo], tailIndex: 1, headTweaks: { pitch: 9, first: true }, gain: 1 });
  assert.equal(livePlan(chain, { pitch: 9 }), null, 'pitch after the steps can only render');
  const after = livePlan(chain, { echo: 1, volume: -1 });
  assert.deepEqual(after.tail.map((s) => s.type), ['echo', 'room'], 'a room after the steps plays live');
  assert.equal(after.gain, 0.5, 'Quiet turns the loop down');
  assert.equal(livePlan(chain, { volume: -2 }).gain, 0.25);
});

// A preset's boards.json `level` turns it down after the evening-out (Ben,
// 2026-10-17: the few that blasted on a phone); it never turns one up.
test('a preset\'s level is a turn-down in dB, and nothing else changes a sound', () => {
  assert.equal(presetGain(undefined), 1);
  assert.equal(presetGain(0), 1);
  assert.ok(Math.abs(presetGain(-6) - 0.501) < 0.001, '-6 dB is about half');
  assert.equal(presetGain(4), 1, 'never louder');
  assert.equal(presetGain(-40), 1, 'out of range: left alone');
  assert.equal(presetGain('quiet'), 1);
});
