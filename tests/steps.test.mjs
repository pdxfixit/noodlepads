// The building blocks of a chain (steps.js): their ranges, cleaning, the
// live/render split, and that every one renders and builds on a stand-in
// audio context.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioBuffer, FakeOfflineAudioContext, fakeBuffer } from './helpers.mjs';
import { KINDS, kindById, cleanStep, newStep, stepKey, splitChain, isLive, buildLive, tailOf } from '../web/steps.js';
import { numsOf } from '../web/shape.js';

before(() => {
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  globalThis.performance ??= { now: () => Date.now() };
});

test('every kind has a unique id, a name, an emoji, and sane numbers', async () => {
  const { VOICES } = await import('../web/voices.js');
  const ids = KINDS.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('voice'), 'voice is its own kind');
  for (const k of KINDS) {
    assert.ok(k.name && k.emoji, k.id);
    for (const n of k.nums) {
      assert.ok(n.min < n.max, `${k.id}.${n.key}: min < max`);
      assert.ok(n.default >= n.min && n.default <= n.max, `${k.id}.${n.key}: default in range`);
      assert.ok(n.step > 0 && n.step <= n.max - n.min, `${k.id}.${n.key}: step`);
      if (n.log) assert.ok(n.min > 0, `${k.id}.${n.key}: a ratio slider stays above 0`);
      assert.equal(typeof n.text(n.default), 'string');
      assert.ok(n.label, `${k.id}.${n.key}: label`);
    }
    if (isLive(newStep(k.id))) {
      assert.equal(typeof k.build, 'function', `${k.id} is live, so it builds nodes`);
      assert.ok(k.tail(newStep(k.id)) >= 0);
    }
  }
  assert.ok(KINDS.length >= 10, 'the Shape it palette');
  assert.ok(VOICES.length > 0);
});

test('cleanStep clamps, rounds to the step, fills defaults and keeps only known fields', () => {
  assert.deepEqual(cleanStep(kindById('echo'), { repeats: 30, gap: 0.0001, x: 1 }), { type: 'echo', repeats: 8, gap: 0.05 });
  assert.deepEqual(cleanStep(kindById('echo'), { repeats: '2', gap: null }), { type: 'echo', repeats: 2, gap: 0.25 });
  assert.deepEqual(cleanStep(kindById('pitch'), { notes: -2.6, keep: 1 }), { type: 'pitch', notes: -3, keep: false });
  assert.deepEqual(cleanStep(kindById('reverse'), { anything: 1 }), { type: 'reverse' });
  assert.deepEqual(newStep('tone'), { type: 'tone', tone: -0.5 });
  for (const junk of [NaN, Infinity, -Infinity, 'x', {}, [], undefined]) {
    assert.equal(cleanStep(kindById('room'), { size: junk }).size, 0.5, String(junk));
  }
});

test('Echo 🥁 On the beat: the gap is a note length at the beat\'s tempo; off, the step is stored as before', () => {
  const on = cleanStep(kindById('echo'), { repeats: 3, gap: 0.9, beat: true, note: 1, bpm: 120 });
  assert.equal(on.gap, 0.25, 'an eighth note at 120 BPM');
  assert.equal(cleanStep(kindById('echo'), { ...on, note: 3 }).gap, 0.5, 'a quarter note');
  assert.equal(cleanStep(kindById('echo'), { ...on, note: 4, bpm: 60 }).gap, 1, 'a half note at 60 is 2 s, held to the 1 s the echo allows');
  assert.equal(stepKey(on), 'echo(3,0.25,beat,1,120)');
  assert.deepEqual(cleanStep(kindById('echo'), { repeats: 3, gap: 0.25, beat: false, note: 2, bpm: 90 }), { type: 'echo', repeats: 3, gap: 0.25 });
  assert.deepEqual(numsOf(on).map((n) => n.key), ['repeats', 'note'], 'on the beat: the slider picks a note length');
  assert.match(numsOf(on)[1].text(1), /1\/8 note at 120 BPM/);
  assert.deepEqual(numsOf(newStep('echo')).map((n) => n.key), ['repeats', 'gap']);
});

test('stepKey names every number, so a change renders anew', () => {
  assert.equal(stepKey({ type: 'echo', repeats: 3, gap: 0.25 }), 'echo(3,0.25)');
  assert.equal(stepKey({ type: 'pitch', notes: 3, keep: true }), 'pitch(3,1)');
  assert.equal(stepKey({ type: 'reverse' }), 'reverse()');
});

test('splitChain: the live steps at the end play live; everything before renders once', () => {
  const v = { type: 'voice', voice: 'chipmunk', amount: 2 };
  const echo = newStep('echo'), tone = newStep('tone'), room = newStep('room');
  const pitch = { type: 'pitch', notes: 12, keep: false };
  assert.deepEqual(splitChain([v, echo, tone]), { head: [v], tail: [echo, tone], tailIndex: 1 });
  assert.deepEqual(splitChain([echo, v]).tail, [], 'a voice last: nothing live');
  assert.deepEqual(splitChain([echo, v, tone]).head, [echo, v]);
  assert.deepEqual(splitChain([echo, pitch, room]), { head: [echo, pitch], tail: [room], tailIndex: 2 }, 'Higher or lower renders');
  assert.deepEqual(splitChain([tone, room]), { head: [], tail: [tone, room], tailIndex: 0 });
  assert.deepEqual(splitChain([]).tail, []);
});

test('every step renders through applyChain, and every live step builds on any context', async () => {
  const { applyChain } = await import('../web/voices.js');
  const d = Array.from({ length: 4000 }, (_, i) => Math.sin(i / 5) * 0.5);
  for (const k of KINDS) {
    const out = await applyChain(fakeBuffer([d], 8000), [newStep(k.id)]);
    assert.ok(out.buffer.length > 0, k.id);
    const s = newStep(k.id);
    if (isLive(s)) {
      const ctx = new FakeOfflineAudioContext(1, 100, 8000);
      const src = ctx.createBufferSource();
      const live = buildLive(ctx, src, [s]);
      assert.ok(live.output, k.id);
      live.set(0, newStep(k.id));   // moving a slider while it plays
    }
  }
  assert.ok(tailOf([newStep('echo'), newStep('room')]) > 1, 'an echo and a room ring on');
});

test('Backwards and Fade change the samples as they say', async () => {
  const { applyChain } = await import('../web/voices.js');
  const d = Array.from({ length: 1000 }, (_, i) => (i < 500 ? 0.8 : 0.2) * (i % 2 ? 1 : -1));
  const back = (await applyChain(fakeBuffer([d], 1000), [{ type: 'reverse' }])).buffer.getChannelData(0);
  assert.ok(Math.abs(back[100]) < Math.abs(back[back.length - 200]), 'the quiet half comes first');
  const flat = Array.from({ length: 1000 }, (_, i) => (i % 2 ? 0.5 : -0.5));
  const faded = (await applyChain(fakeBuffer([flat], 1000), [{ type: 'fade', in: 0.5, out: 0 }])).buffer.getChannelData(0);
  assert.ok(Math.abs(faded[30]) < Math.abs(faded[600]), 'quiet at the start, full later');
});

test('Faster or slower changes the length, and Keep length keeps it', async () => {
  const { applyChain } = await import('../web/voices.js');
  const d = Array.from({ length: 8000 }, (_, i) => Math.sin(i / 5) * 0.5);
  const faster = await applyChain(fakeBuffer([d], 8000), [{ type: 'stretch', speed: 2 }]);
  assert.ok(faster.duration > 0.4 && faster.duration < 0.7, `${faster.duration}`);
  const kept = await applyChain(fakeBuffer([d], 8000), [{ type: 'pitch', notes: 12, keep: true }]);
  assert.ok(kept.duration > 0.8 && kept.duration < 1.3, `an octave up, same length: ${kept.duration}`);
});

test('⤢ every voice but Normal and Clones opens into known steps, its amount carried over', async () => {
  const { VOICES, openVoice, voiceStep, cleanChain } = await import('../web/voices.js');
  for (const v of VOICES) {
    const steps = openVoice(voiceStep(v.id));
    if (v.id === 'normal' || v.id === 'clones') { assert.equal(steps, null, v.id); continue; }
    assert.ok(steps.length >= 1 && steps.length <= 3, v.id);
    assert.deepEqual(cleanChain(steps), steps, `${v.id}: known kinds, numbers in range`);
    assert.ok(steps.every((s) => s.type !== 'voice'), v.id);
  }
  assert.deepEqual(openVoice(voiceStep('chipmunk', 2)), [{ type: 'pitch', notes: 12, keep: false }], 'twice as high is an octave');
  assert.deepEqual(openVoice(voiceStep('monster', 4))[0], { type: 'pitch', notes: -24, keep: false });
  assert.deepEqual(openVoice(voiceStep('slow', 20)), [{ type: 'stretch', speed: 0.05 }]);
  assert.deepEqual(openVoice(voiceStep('fast', 8)), [{ type: 'stretch', speed: 8 }]);
  assert.deepEqual(openVoice(voiceStep('loud', 5)), [{ type: 'squash', amount: 0.5 }]);
  assert.deepEqual(openVoice(voiceStep('stadium')).map((s) => s.type), ['echo', 'room']);
  assert.equal(openVoice({ type: 'echo', repeats: 3, gap: 0.2 }), null, 'only voices open');
});
