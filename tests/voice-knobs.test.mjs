// Voices as knob settings (web/voice-knobs.js, Design 1): each voice's
// knobs, stacking (the last tap wins a shared knob), the line under the
// voices, ⤢ Turn into knobs, 🎲, a kid's own voices, and that every sound
// saved before knobs plays exactly the steps it played then. Nothing is
// heard here: whether Chipmunk-from-knobs sounds close to the old Chipmunk
// needs ears on a device.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, presetOf, presetById, stackKnobs, stackAll, matches, presetText, voiceLine, chainToKnobs, hasClassicVoice,
  surpriseVoices, cleanMyVoice, myVoicesFor, MY_VOICE_CHIPS,
} from '../web/voice-knobs.js';
import { NO_TWEAKS, TWEAKS, cleanTweaks, fullTweaks } from '../web/tweaks.js';
import { VOICES, chainOf, renderPlan, cleanChain, voiceStep } from '../web/voices.js';
import { cleanStep, kindById } from '../web/steps.js';

test('every voice but Normal is a chip; the way back is only ↩️ Reset voice', () => {
  assert.deepEqual(PRESETS.map((p) => p.id), VOICES.filter((v) => v.id !== 'normal').map((v) => v.id));
  assert.equal(presetById('normal'), null);
  for (const p of PRESETS) {
    assert.ok(Object.keys(p.knobs).length, `${p.id} sets some knobs`);
    assert.deepEqual(cleanTweaks(p.knobs), p.knobs, `${p.id}: every knob in its range, on its step`);
  }
  assert.deepEqual(PRESETS.filter((p) => p.special).map((p) => p.id), ['monster', 'walkie', 'clones'], 'Ben, Q5: the ✦ special voices');
});

test('each voice is the knobs it uses, and only those (Ben: "close is fine")', () => {
  assert.deepEqual(presetOf('chipmunk'), { pitch: 9, speed: 0.8 }, 'Chipmunk 1.7×: 9 notes up, about 1.7× as fast');
  assert.deepEqual(presetOf('chipmunk', 2), { pitch: 12, speed: 1 }, 'its amount, for a sound saved with one');
  assert.deepEqual(presetOf('slow'), { speed: -2.6 }, 'Slow 6×');
  assert.deepEqual(presetOf('slow', 20), { speed: -4.3 }, 'Slow 20× is the slowest the knob goes');
  assert.deepEqual(presetOf('fast', 8), { speed: 3 });
  assert.deepEqual(presetOf('monster'), { pitch: -8, speed: -0.7, special: 'boom' });
  assert.deepEqual(presetOf('stadium'), { echo: 3 });
  assert.deepEqual(presetOf('underwater'), { tone: -2, warble: 2 });
  assert.deepEqual(presetOf('alien'), { pitch: 3, speed: 0.3, warble: 2, robot: 2 });
  assert.deepEqual(presetOf('walkie'), { tone: 2, crunch: 2, special: 'walkie' });
  assert.deepEqual(presetOf('clones'), { special: 'clones' });
  assert.deepEqual(presetOf('stutter'), { stutter: 2 }, 'three repeats, as the old Stutter');
  assert.deepEqual(presetOf('backwards'), { backwards: true });
  assert.deepEqual(presetOf('normal'), {});
});

test('a second voice adds its knobs on top; the last tap wins a knob both use', () => {
  const chip = stackKnobs(NO_TWEAKS, presetOf('chipmunk'));
  const both = stackKnobs(chip, presetOf('stadium'));
  assert.deepEqual(cleanTweaks(both), { pitch: 9, speed: 0.8, echo: 3 });
  const monster = stackKnobs(chip, presetOf('monster'));
  assert.deepEqual(cleanTweaks(monster), { pitch: -8, speed: -0.7, special: 'boom' }, 'Monster after Chipmunk: Monster\'s pitch and speed');
  assert.ok(matches(both, presetOf('chipmunk')) && matches(both, presetOf('stadium')), 'both stay lit');
  assert.ok(!matches(monster, presetOf('chipmunk')), 'Chipmunk is no longer what the knobs say');
  // Untapping Chipmunk: the knobs from before it, with Stadium on top.
  const base = { ...NO_TWEAKS, warble: 1 };
  assert.deepEqual(cleanTweaks(stackAll(base, [presetById('stadium')])), { echo: 3, warble: 1 });
  assert.deepEqual(cleanTweaks(stackAll(base, [presetById('chipmunk'), presetById('underwater')])), { pitch: 9, speed: 0.8, tone: -2, warble: 2 });
});

test('one slot per knob: two voices can never double up (Backwards twice is still backwards)', () => {
  const twice = stackAll(NO_TWEAKS, [presetById('backwards'), presetById('backwards')]);
  assert.equal(twice.backwards, true);
  const echoes = stackAll(NO_TWEAKS, [presetById('stadium'), presetById('stadium')]);
  assert.equal(echoes.echo, 3);
  for (const t of TWEAKS) assert.ok(t.key in NO_TWEAKS, t.key);
});

test('the line under the voices: what the lit voice is, else your own, else a tip; never "every knob in the middle"', () => {
  const chip = presetById('chipmunk');
  assert.equal(voiceLine([chip], stackAll(NO_TWEAKS, [chip])), 'Chipmunk is: higher +9, faster 1.74×');
  assert.equal(voiceLine([presetById('slow')], NO_TWEAKS), 'Slow is: slower 6.06×');
  assert.equal(voiceLine([chip, presetById('stadium')], NO_TWEAKS), 'Chipmunk is: higher +9, faster 1.74× · Stadium is: echoes');
  assert.equal(voiceLine([presetById('walkie')], NO_TWEAKS), 'Walkie-talkie is: bright, lots of crunch, ✦ static and a beep');
  assert.equal(voiceLine([presetById('monster')], NO_TWEAKS), 'Monster is: deeper −8, slower 1.62×, ✦ boom');
  assert.equal(voiceLine([], { ...NO_TWEAKS, echo: 1 }), '✏️ Your own voice. ⭐ Save voice saves it.');
  assert.equal(voiceLine([], NO_TWEAKS), 'Tap a voice to see which knobs make it.');
  for (const text of [voiceLine([], NO_TWEAKS), voiceLine([chip], NO_TWEAKS)]) assert.doesNotMatch(text, /middle/);
  assert.equal(presetText({ stutter: 3, backwards: true, robot: 2 }), 'backwards, metal, stutter ×4', 'in the knobs\' order');
});

test('⤢ Turn into knobs: old voices become their knobs; pitch and speed add up; Shape it steps stay', () => {
  const chain = [voiceStep('chipmunk', 1.7), voiceStep('stadium'), cleanStep(kindById('crunch'), { amount: 0.3 })];
  const { knobs, rest } = chainToKnobs(chain, { pitch: -3, warble: 1 });
  assert.deepEqual(cleanTweaks(knobs), { pitch: 6, speed: 0.8, echo: 3, warble: 1 });
  assert.deepEqual(rest, [{ type: 'crunch', amount: 0.3 }]);
  assert.deepEqual(chainToKnobs([voiceStep('normal')], null), { knobs: fullTweaks(null), rest: [] });
  assert.ok(hasClassicVoice(chain));
  assert.ok(!hasClassicVoice([voiceStep('normal'), cleanStep(kindById('echo'), {})]));
});

test('🎲 stacks one to three voices from different families, so two never cancel out', () => {
  const families = [['chipmunk', 'monster', 'alien'], ['fast', 'slow'], ['robot', 'walkie', 'underwater'], ['clones', 'stutter', 'backwards'], ['loud'], ['stadium']];
  const family = (id) => families.findIndex((f) => f.includes(id));
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 200; i++) {
    const ids = surpriseVoices(random);
    assert.ok(ids.length >= 1 && ids.length <= 3, ids.join());
    assert.equal(new Set(ids.map(family)).size, ids.length, ids.join());
    for (const id of ids) assert.ok(presetById(id), id);
  }
});

test('a kid\'s own voice: a name and/or emoji (24 characters at most), knobs, never `first`; junk is null', () => {
  const ok = { id: 'voice-1', personId: 'p-a', name: '  Squeaky  ', emoji: '🦄', knobs: { pitch: 7, first: true, nope: 1 }, created: 5, used: 9 };
  assert.deepEqual(cleanMyVoice(ok), { id: 'voice-1', personId: 'p-a', name: 'Squeaky', emoji: '🦄', knobs: { pitch: 7 }, created: 5, used: 9 });
  assert.equal(cleanMyVoice({ ...ok, name: 'x'.repeat(40) }).name.length, 24);
  assert.equal(cleanMyVoice({ ...ok, name: '' }).name, '', 'an emoji alone is enough');
  assert.equal(cleanMyVoice({ ...ok, emoji: '' }).emoji, '', 'a name alone is enough');
  assert.equal(cleanMyVoice({ ...ok, name: ' ', emoji: '' }), null, 'one of them is needed');
  assert.equal(cleanMyVoice({ ...ok, knobs: NO_TWEAKS }), null, 'a voice that changes nothing');
  assert.equal(cleanMyVoice({ ...ok, personId: 4 }), null);
  assert.equal(cleanMyVoice(null), null);
  assert.equal(cleanMyVoice({ ...ok, edited: 12 }).edited, 12, 'when it was renamed, for merging two devices');
  assert.equal('edited' in cleanMyVoice({ ...ok, edited: 'soon' }), false);
  assert.deepEqual(cleanMyVoice({ ...ok, created: -1, used: 'soon' }).used, 0);
});

test('a person\'s own voices, most recently used first: three are chips, the rest are in the list', () => {
  const v = (id, used, personId = 'p-a') => ({ id, personId, name: id, knobs: { echo: 1 }, created: 1, used });
  const mine = myVoicesFor([v('a', 10), v('b', 30), v('c', 0), v('d', 20), v('x', 99, 'p-b')], 'p-a');
  assert.deepEqual(mine.map((x) => x.id), ['b', 'd', 'a', 'c']);
  assert.equal(MY_VOICE_CHIPS, 3);
  assert.deepEqual(mine.slice(0, MY_VOICE_CHIPS).map((x) => x.id), ['b', 'd', 'a']);
});

// ── Saved sounds sound the same ─────────────────────────────────────────
// The render plan as the app made it before knobs (applyChain and ADR
// 0012's tweakSteps, copied here as they shipped), for every stored voice
// at a few amounts, with and without the old tweaks.

function oldTweakSteps(raw) {
  const OLD = [['pitch', -12, 12, 1], ['speed', -1, 1, 0.1], ['echo', 0, 3, 1], ['volume', -2, 2, 1], ['warble', 0, 2, 1]];
  const t = {};
  for (const [k, min, max, step] of OLD) {
    const v = raw?.[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const n = +(Math.round(Math.min(max, Math.max(min, v)) / step) * step).toFixed(4);
    if (n !== 0) t[k] = n;
  }
  if (raw?.backwards === true) t.backwards = true;
  if (!Object.keys(t).length) return [];
  const ECHO = [[], [{ type: 'room', size: 0.2 }], [{ type: 'room', size: 0.55 }], [{ type: 'echo', repeats: 3, gap: 0.25 }, { type: 'room', size: 0.25 }]];
  const steps = [];
  const rate = 2 ** ((t.pitch ?? 0) / 12);
  const stretch = cleanStep(kindById('stretch'), { speed: 2 ** (t.speed ?? 0) / rate });
  if (stretch.speed !== 1) steps.push(stretch);
  if (t.pitch) steps.push(cleanStep(kindById('pitch'), { notes: t.pitch, keep: false }));
  if (t.backwards) steps.push(cleanStep(kindById('reverse'), {}));
  if (t.warble) steps.push(cleanStep(kindById('wobble'), { speed: 5.5, depth: [null, 0.25, 0.6][t.warble] }));
  if (t.volume > 0) steps.push(cleanStep(kindById('squash'), { amount: [null, 0.35, 0.75][t.volume] }));
  for (const s of ECHO[t.echo ?? 0]) steps.push(cleanStep(kindById(s.type), s));
  return steps;
}
function oldPlan(chain, tweaks) {
  const extra = oldTweakSteps(tweaks);
  const voiced = cleanChain(chain) ?? [voiceStep('normal')];
  return extra.length ? [...voiced.filter((s) => !(s.type === 'voice' && s.voice === 'normal')), ...extra] : voiced;
}

test('every sound saved before knobs plays exactly the steps it played then (render plan equality)', () => {
  const tweakSets = [undefined, { pitch: -5 }, { pitch: 12, speed: -1 }, { speed: 0.3, backwards: true }, { echo: 3, volume: 2, warble: 1 }, { volume: -2 }];
  const amounts = [undefined, 1.2, 2, 6];
  let checked = 0;
  for (const v of VOICES) {
    for (const amount of amounts) {
      for (const tweaks of tweakSets) {
        const clips = [
          { voice: v.id, amount, tweaks },
          { voice: v.id, amount, fx: [voiceStep(v.id, amount), voiceStep('stadium')], tweaks },
          { voice: 'normal', fx: [{ type: 'echo', repeats: 2, gap: 0.3 }, voiceStep(v.id, amount)], tweaks },
        ];
        for (const clip of clips) {
          const plan = renderPlan(chainOf(clip), cleanTweaks(clip.tweaks));
          assert.deepEqual(plan.steps, oldPlan(chainOf(clip), clip.tweaks), JSON.stringify(clip));
          assert.equal(plan.gain, [1, 0.5, 0.25][-(clip.tweaks?.volume ?? 0)] ?? 1);
          checked += 1;
        }
      }
    }
  }
  assert.equal(checked, VOICES.length * 4 * 6 * 3);
});

test('new sounds: knobs saved with `first` play before Shape it\'s steps; without it, after', () => {
  const chain = [{ type: 'echo', repeats: 2, gap: 0.3 }];
  assert.deepEqual(renderPlan(chain, { robot: 1, first: true }).steps.map((s) => s.type), ['ring', 'echo']);
  assert.deepEqual(renderPlan(chain, { robot: 1 }).steps.map((s) => s.type), ['echo', 'ring']);
  assert.deepEqual(renderPlan([voiceStep('normal')], { special: 'clones' }).steps, [{ type: 'special', special: 'clones' }], 'Normal goes beside a knob');
  assert.deepEqual(renderPlan(null, null).steps, [voiceStep('normal')]);
});
