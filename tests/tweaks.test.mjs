// Tweaks (web/tweaks.js): the sound sheet's deeper/higher, slower/faster,
// Backwards, echo, louder/softer and warble. The pure parts: how they are
// cleaned and stored, which steps play them, and the render cache key; then
// one render through the stand-in AudioBuffer for Quiet. Nothing is heard
// here: whether deeper sounds like the same voice needs ears on a device.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TWEAKS, NO_TWEAKS, MAIN_KNOBS, MORE_KNOBS, cleanTweaks, fullTweaks, tweakSteps, tweakGain, tweaksKey, tweakText } from '../web/tweaks.js';
import { recipeKey } from '../web/voices.js';
import { MAX_KEYS, sliderStops } from '../web/lines.js';

test('cleanTweaks keeps only what moved from normal, clamped and rounded; junk is null', () => {
  assert.equal(cleanTweaks(null), null);
  assert.equal(cleanTweaks('deeper'), null);
  assert.equal(cleanTweaks([1, 2]), null);
  assert.equal(cleanTweaks(NO_TWEAKS), null, 'all normal stores nothing');
  assert.deepEqual(cleanTweaks({ pitch: -5 }), { pitch: -5 });
  assert.deepEqual(cleanTweaks({ pitch: -40, speed: 0.33333, echo: 9, volume: -2.4, warble: '2', backwards: 'yes' }),
    { pitch: -24, speed: 0.3, echo: 3, volume: -2 }, 'clamped, rounded to each step; strings and non-true dropped');
  assert.deepEqual(cleanTweaks({ backwards: true, pitch: NaN, extra: 4 }), { backwards: true });
});

test('the knobs widened: pitch two octaves each way, speed from 1/20× (Slow\'s slowest) to 8× (Fast\'s fastest)', () => {
  assert.deepEqual(cleanTweaks({ pitch: 24, speed: 3 }), { pitch: 24, speed: 3 });
  assert.deepEqual(cleanTweaks({ pitch: -30, speed: -9 }), { pitch: -24, speed: -4.3 });
  assert.equal(tweakText('speed', 3), '8× faster');
  assert.equal(tweakText('speed', -4.3), '19.7× slower');
});

test('the new knobs, the ✦ special layer and `first` are cleaned like the rest; an unknown special is dropped', () => {
  assert.deepEqual(cleanTweaks({ tone: -2.4, robot: 2, crunch: 9, stutter: 1.6 }), { tone: -2, robot: 2, crunch: 2, stutter: 2 });
  assert.deepEqual(cleanTweaks({ special: 'clones' }), { special: 'clones' });
  assert.equal(cleanTweaks({ special: 'laser' }), null);
  assert.equal(cleanTweaks({ special: '__proto__' }), null);
  assert.equal(cleanTweaks({ first: true }), null, '`first` alone says nothing');
  assert.deepEqual(cleanTweaks({ echo: 1, first: true }), { echo: 1, first: true });
  assert.deepEqual(cleanTweaks({ echo: 1, first: 'yes' }), { echo: 1 });
  assert.deepEqual(fullTweaks({ echo: 1, first: true, special: 'boom' }), { ...NO_TWEAKS, echo: 1, special: 'boom' }, 'the sheet decides `first` itself');
});

test('an older app\'s cleaning (the five knobs and Backwards) keeps what it knows of new knob settings', () => {
  // ADR 0012's cleanTweaks, as the app shipped it before More knobs.
  const OLD = [['pitch', -12, 12, 1], ['speed', -1, 1, 0.1], ['echo', 0, 3, 1], ['volume', -2, 2, 1], ['warble', 0, 2, 1]];
  const old = (raw) => {
    const out = {};
    for (const [k, min, max, step] of OLD) {
      const v = raw[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const n = +(Math.round(Math.min(max, Math.max(min, v)) / step) * step).toFixed(4);
      if (n !== 0) out[k] = n;
    }
    if (raw.backwards === true) out.backwards = true;
    return Object.keys(out).length ? out : null;
  };
  const stored = cleanTweaks({ pitch: 9, speed: 0.8, tone: 2, crunch: 2, special: 'walkie', first: true });
  assert.deepEqual(old(stored), { pitch: 9, speed: 0.8 });
  assert.deepEqual(old(cleanTweaks({ pitch: -20, speed: -2.6 })), { pitch: -12, speed: -1 }, 'wider values clamp to its range');
});

test('fullTweaks fills in normal for every tweak, for the sheet to show', () => {
  assert.deepEqual(fullTweaks(undefined), NO_TWEAKS);
  assert.deepEqual(fullTweaks({ pitch: 3, backwards: true }), { ...NO_TWEAKS, pitch: 3, backwards: true });
});

test('Ben\'s rule: a tweak with five stops or fewer is keys, each named; the rest are sliders', () => {
  for (const t of TWEAKS.filter((x) => !x.flag)) {
    const stops = sliderStops(t.min, t.max, t.step);
    assert.equal(!!t.keys, !!stops, `${t.key}: keys exactly when it has ${MAX_KEYS} stops or fewer`);
    if (t.keys) assert.equal(t.keys.length, stops.length, t.key);
    assert.ok(t.default >= t.min && t.default <= t.max, t.key);
  }
  assert.deepEqual(TWEAKS.filter((t) => t.keys).map((t) => t.key), ['echo', 'volume', 'warble', 'tone', 'robot', 'crunch', 'stutter']);
  assert.deepEqual(TWEAKS.map((t) => t.key), ['pitch', 'speed', 'echo', 'volume', 'warble', 'backwards', 'tone', 'robot', 'crunch', 'stutter'], 'one fixed slot each');
  assert.deepEqual(MAIN_KNOBS, ['pitch', 'speed', 'echo', 'volume', 'warble'], 'simple mode shows five; the rest are under More knobs');
  assert.deepEqual(MORE_KNOBS, ['backwards', 'tone', 'robot', 'crunch', 'stutter']);
  assert.deepEqual(['tone', 'robot', 'crunch', 'stutter'].map((k) => TWEAKS.find((t) => t.key === k).keys),
    [['Muffled', 'Dull', 'Normal', 'Clear', 'Bright'], ['Off', 'Robot', 'Metal'], ['Off', 'A little', 'Lots'], ['Off', '2', '3', '4']]);
  assert.equal(tweakText('echo', 2), 'Hall');
  assert.equal(tweakText('volume', -2), 'Quietest');
  assert.equal(tweakText('pitch', -5), '5 notes deeper');
  assert.equal(tweakText('pitch', 1), '1 note higher');
  assert.equal(tweakText('speed', -1), '2× slower');
  assert.equal(tweakText('speed', 0), 'normal');
});

test('deeper is a pitch-keeping stretch then a tape speed: the same length, lower, with no Monster bass or crunch', () => {
  const steps = tweakSteps({ pitch: -12 });
  assert.deepEqual(steps, [{ type: 'stretch', speed: 2 }, { type: 'pitch', notes: -12, keep: false }]);
  assert.ok(!steps.some((s) => s.type === 'crunch'));
});

test('deeper and slower share one stretch, so the sound is stretched once', () => {
  // Half speed, an octave down: stretch by ½ ÷ ½ = 1, so only the tape.
  assert.deepEqual(tweakSteps({ pitch: -12, speed: -1 }), [{ type: 'pitch', notes: -12, keep: false }]);
  assert.deepEqual(tweakSteps({ speed: 1 }), [{ type: 'stretch', speed: 2 }], 'faster alone keeps the pitch');
});

test('the tweaks play in a set order: speed and pitch, Backwards, warble, louder, then the echo rings out last', () => {
  const steps = tweakSteps({ pitch: 2, backwards: true, warble: 1, volume: 2, echo: 3 });
  assert.deepEqual(steps.map((s) => s.type), ['stretch', 'pitch', 'reverse', 'wobble', 'squash', 'echo', 'room']);
  assert.deepEqual(tweakSteps({ echo: 1 }), [{ type: 'room', size: 0.2 }]);
  assert.deepEqual(tweakSteps({}), []);
  assert.deepEqual(tweakSteps({ volume: -1 }), [], 'softer is not a step: every step is levelled');
});

test('More knobs are made of steps that exist: Stutter, Muffled ↔ Bright, Robot, Crunch; a special layer is its own step', () => {
  assert.deepEqual(tweakSteps({ stutter: 1 }), [{ type: 'repeat', times: 2 }]);
  assert.deepEqual(tweakSteps({ tone: -2 }), [{ type: 'tone', tone: -0.75 }]);
  assert.deepEqual(tweakSteps({ tone: 2 }), [{ type: 'tone', tone: 0.7 }]);
  assert.deepEqual(tweakSteps({ robot: 1 }), [{ type: 'ring', metal: 48 }]);
  assert.deepEqual(tweakSteps({ robot: 2 }), [{ type: 'ring', metal: 190 }]);
  assert.deepEqual(tweakSteps({ crunch: 2 }), [{ type: 'crunch', amount: 0.5 }]);
  assert.deepEqual(tweakSteps({ special: 'clones' }), [{ type: 'special', special: 'clones' }]);
  // The whole order: the clones and boom early, the walkie's static after the crunch.
  const all = { pitch: 2, stutter: 2, backwards: true, special: 'boom', tone: 1, robot: 1, crunch: 1, warble: 1, volume: 2, echo: 1 };
  assert.deepEqual(tweakSteps(all).map((s) => s.special ?? s.type),
    ['stretch', 'pitch', 'repeat', 'reverse', 'boom', 'tone', 'ring', 'crunch', 'wobble', 'squash', 'room']);
  assert.deepEqual(tweakSteps({ ...all, special: 'walkie' }).map((s) => s.special ?? s.type),
    ['stretch', 'pitch', 'repeat', 'reverse', 'tone', 'ring', 'crunch', 'walkie', 'wobble', 'squash', 'room']);
});

test('softer turns the finished sound down; louder squashes instead', () => {
  assert.equal(tweakGain({ volume: -1 }), 0.5);
  assert.equal(tweakGain({ volume: -2 }), 0.25);
  assert.equal(tweakGain({ volume: 2 }), 1);
  assert.equal(tweakGain(null), 1);
});

test('the render cache key: unchanged with no tweaks, and different for each tweak', () => {
  assert.equal(tweaksKey(null), '');
  assert.equal(recipeKey({ voice: 'chipmunk', amount: 2 }), 'chipmunk:2', 'a sound with no tweaks keys as before');
  assert.equal(recipeKey({ voice: 'chipmunk', amount: 2, tweaks: NO_TWEAKS }), 'chipmunk:2');
  const keys = new Set([{ pitch: -1 }, { pitch: 1 }, { speed: 0.1 }, { echo: 1 }, { volume: -1 }, { volume: 1 }, { warble: 1 }, { backwards: true },
    { tone: 1 }, { robot: 1 }, { crunch: 1 }, { stutter: 1 }, { special: 'boom' }, { echo: 1, first: true }]
    .map((t) => recipeKey({ voice: 'normal', tweaks: t })));
  assert.equal(keys.size, 14, 'a new knob never shares a letter with speed or another');
  assert.equal(tweaksKey({ pitch: -5, speed: 0.3, backwards: true }), '~p-5,s0.3,b', 'the five knobs and Backwards key as they did');
});

test('Quiet renders the sound at half its level; Slower renders it about twice as long', async () => {
  const { FakeAudioBuffer, FakeOfflineAudioContext, fakeBuffer } = await import('./helpers.mjs');
  const { applyChain } = await import('../web/voices.js');
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  const d = Array.from({ length: 8000 }, (_, i) => Math.sin(i / 5) * 0.5);
  const peak = (b) => Math.max(...b.getChannelData(0).map(Math.abs));
  const plain = await applyChain(fakeBuffer([d], 8000), null);
  const quiet = await applyChain(fakeBuffer([d], 8000), null, { volume: -1 });
  assert.ok(Math.abs(peak(quiet.buffer) - peak(plain.buffer) / 2) < 1e-6, `${peak(quiet.buffer)} vs ${peak(plain.buffer)}`);
  const slow = await applyChain(fakeBuffer([d], 8000), null, { speed: -1 });
  assert.ok(slow.duration > 1.8 && slow.duration < 2.3, `half speed is about twice as long: ${slow.duration}`);
});

test('knobLayers: the knobs on, in the order they play; ones kept shown; all ten; a special early or late', async () => {
  const { knobLayers, LAYER_ORDER } = await import('../web/tweaks.js');
  assert.deepEqual(knobLayers(null), []);
  assert.deepEqual(knobLayers({ echo: 1, pitch: 3, volume: -1 }), ['pitch', 'volume', 'echo']);
  assert.deepEqual(knobLayers({ echo: 1 }, { shown: ['pitch'] }), ['pitch', 'echo']);
  assert.deepEqual(knobLayers({}, { all: true }), LAYER_ORDER);
  assert.deepEqual([...LAYER_ORDER].sort(), TWEAKS.map((t) => t.key).sort(), 'every knob has its place');
  assert.deepEqual(knobLayers({ pitch: 3, tone: 1, special: 'clones' }), ['pitch', 'special', 'tone']);
  assert.deepEqual(knobLayers({ pitch: 3, tone: 1, special: 'walkie' }), ['pitch', 'tone', 'special']);
  assert.deepEqual(knobLayers({ special: 'boom' }), ['special']);
  // The order matches what plays (tweakSteps).
  const kinds = tweakSteps({ pitch: 3, stutter: 2, backwards: true, tone: 1, robot: 1, crunch: 1, warble: 1, volume: 1, echo: 3 }).map((s) => s.type);
  assert.deepEqual(kinds, ['stretch', 'pitch', 'repeat', 'reverse', 'tone', 'ring', 'crunch', 'wobble', 'squash', 'echo', 'room']);
});
