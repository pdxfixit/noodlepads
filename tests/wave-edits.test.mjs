// The wave editor, the pure part (web/cuts.js) and what audio.js makes of
// it: edits and fades cleaned and clamped, Louder taps adding up, applied to
// a buffer without clicks, and the sound the voices start from, cached by
// a key that names every edit (and is unchanged for a clip with none).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanEdit, cleanEdits, cleanFade, addEdit, editsKey, fadeKey, cutKey,
  applyEdits, applyFade, MAX_EDITS, GAIN_STEP, hasGain, levelForGain,
} from '../web/cuts.js';
import { fakeBuffer, FakeAudioBuffer } from './helpers.mjs';

const RATE = 8000;
const ramp = (n) => Array.from({ length: n }, (_, i) => i / n);   // 0 up to 1: every sample different
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≠ ${b}`);

before(() => { globalThis.AudioBuffer ??= FakeAudioBuffer; });

test('cleanEdit: known kinds only, the part fitted into the sound, a gain clamped to 8× either way', () => {
  assert.deepEqual(cleanEdit({ kind: 'reverse', start: 0.2, end: 0.5 }), { kind: 'reverse', start: 0.2, end: 0.5 });
  assert.deepEqual(cleanEdit({ kind: 'silence', start: -1, end: 9, extra: 'x' }, 2), { kind: 'silence', start: 0, end: 2 });
  assert.deepEqual(cleanEdit({ kind: 'gain', start: 0, end: 1, amount: 99 }), { kind: 'gain', start: 0, end: 1, amount: 8 });
  assert.deepEqual(cleanEdit({ kind: 'gain', start: 0, end: 1, amount: 0.001 }), { kind: 'gain', start: 0, end: 1, amount: 0.125 });
  for (const junk of [null, 'reverse', { kind: 'explode', start: 0, end: 1 }, { kind: 'reverse', start: 1, end: 0.5 },
    { kind: 'reverse', start: 0, end: 0.01 }, { kind: 'gain', start: 0, end: 1 }, { kind: 'gain', start: 0, end: 1, amount: 1 },
    { kind: 'gain', start: 0, end: 1, amount: -2 }, { kind: 'silence', start: '0', end: '1' }, { kind: 'silence', start: 5, end: 6 }]) {
    assert.equal(cleanEdit(junk, 2), null, JSON.stringify(junk));
  }
});

test('cleanEdits and cleanFade: junk dropped, at most MAX_EDITS kept, nothing left is null', () => {
  assert.equal(cleanEdits('x'), null);
  assert.equal(cleanEdits([]), null);
  assert.equal(cleanEdits([{ kind: 'nope' }]), null);
  const many = Array.from({ length: 40 }, (_, i) => ({ kind: 'silence', start: i * 0.1, end: i * 0.1 + 0.08 }));
  assert.equal(cleanEdits(many).length, MAX_EDITS);
  assert.deepEqual(cleanFade({ in: 0.25, out: -3 }), { in: 0.25, out: 0 });
  assert.deepEqual(cleanFade({ out: 0.1234 }), { in: 0, out: 0.123 });
  assert.equal(cleanFade({ in: 0, out: 0 }), null, 'no fade at all is none');
  assert.equal(cleanFade({ in: 'lots' }), null);
  assert.deepEqual(cleanFade({ in: 1e9 }), { in: 600, out: 0 });
});

test('addEdit: Louder twice on one part is one 4× edit, Louder then Quieter cancels, Backwards twice cancels, a full list refuses', () => {
  const part = { start: 0.2, end: 0.6 };
  const louder = { kind: 'gain', amount: GAIN_STEP, ...part };
  let e = addEdit(null, louder);
  e = addEdit(e, louder);
  assert.deepEqual(e, [{ kind: 'gain', ...part, amount: 4 }]);
  assert.equal(addEdit([{ kind: 'gain', ...part, amount: 2 }], { kind: 'gain', amount: 1 / GAIN_STEP, ...part }), null, 'back to nothing');
  assert.equal(addEdit(addEdit(null, { kind: 'reverse', ...part }), { kind: 'reverse', ...part }), null);
  assert.equal(addEdit(addEdit(null, { kind: 'silence', ...part }), { kind: 'silence', ...part }).length, 1);
  assert.equal(addEdit([{ kind: 'gain', ...part, amount: 2 }], { kind: 'gain', amount: 2, start: 0.2, end: 0.7 }).length, 2, 'another part is another edit');
  const full = Array.from({ length: MAX_EDITS }, (_, i) => ({ kind: 'silence', start: i * 0.1, end: i * 0.1 + 0.08 }));
  assert.equal(addEdit(full, { kind: 'reverse', start: 3, end: 4 }), undefined);
});

test('keys: every edit and fade is named, and a clip with none gives "" (so old cache keys stay the same)', () => {
  assert.equal(cutKey({}), '');
  assert.equal(cutKey({ trim: { start: 0.1, end: 0.9 } }), '@0.1-0.9');
  assert.equal(editsKey([{ kind: 'reverse', start: 0.1, end: 0.3 }, { kind: 'gain', start: 0, end: 1, amount: 2 }]), '~r0.1-0.3~g0-1x2');
  assert.equal(fadeKey({ in: 0.2 }), '/0.2-0');
  assert.notEqual(cutKey({ edits: [{ kind: 'silence', start: 0, end: 1 }] }), cutKey({ edits: [{ kind: 'reverse', start: 0, end: 1 }] }));
});

test('applyEdits: Backwards reverses just the part, Silence empties it, Louder doubles it; the rest is untouched', () => {
  const n = 800;   // 0.1 s
  const check = (edit, expect) => {
    const b = fakeBuffer([ramp(n)], RATE);
    const before = ramp(n);
    applyEdits(b, [edit]);
    const d = b.getChannelData(0);
    for (let i = 0; i < 160; i++) near(d[i], Math.fround(before[i]), `before the part, sample ${i}`);
    for (let i = 640; i < n; i++) near(d[i], Math.fround(before[i]), `after the part, sample ${i}`);
    // Away from the 5 ms (40-sample) blends at the edges, the part is changed.
    for (let i = 240; i < 560; i++) near(d[i], expect(i, before), `inside, sample ${i}`);
  };
  check({ kind: 'reverse', start: 0.02, end: 0.08 }, (i, x) => Math.fround(x[160 + 640 - 1 - i]));
  check({ kind: 'silence', start: 0.02, end: 0.08 }, () => 0);
  check({ kind: 'gain', start: 0.02, end: 0.08, amount: 2 }, (i, x) => Math.fround(x[i]) * 2);
});

test('applyEdits: the edges blend in, so a silenced part never jumps straight to zero (no click)', () => {
  const b = fakeBuffer([new Array(800).fill(0.5)], RATE);
  applyEdits(b, [{ kind: 'silence', start: 0.02, end: 0.08 }]);
  const d = b.getChannelData(0);
  let jump = 0;
  for (let i = 1; i < d.length; i++) jump = Math.max(jump, Math.abs(d[i] - d[i - 1]));
  assert.ok(jump < 0.02, `largest step ${jump}`);
  assert.equal(d[400], 0);
});

test('applyFade: up from silence and down to silence, only between start and end; overlapping fades take the lower', () => {
  const b = fakeBuffer([new Array(800).fill(1)], RATE);
  applyFade(b, { in: 0.01, out: 0.02 }, 0.01, 0.09);   // samples 80 to 720
  const d = b.getChannelData(0);
  assert.equal(d[0], 1, 'before the start: untouched');
  assert.equal(d[80], 0, 'starts silent');
  near(d[120], 0.5, 'halfway up');
  assert.equal(d[400], 1);
  near(d[719], 0, 'ends silent');
  assert.equal(d[799], 1, 'after the end: untouched');
  const c = fakeBuffer([new Array(100).fill(1)], 1000);
  applyFade(c, { in: 0.1, out: 0.1 });
  assert.ok(c.getChannelData(0)[50] <= 0.51, 'the middle of two whole-length fades is the lower of the two');
});

test('the sound the voices start from: edits on the stored recording, then the trim, then the fade; cached until they change', async () => {
  const { audio, keptAudio } = await import('../web/audio.js');
  const data = Array.from({ length: 8000 }, (_, i) => (i >= 800 && i < 7200 ? 0.5 : 0));   // 1 s, sound from 0.1 to 0.9
  const stored = fakeBuffer([data], RATE);
  const decodes = [];
  const saved = audio.decoded;
  audio.decoded = async (clip) => { decodes.push(clip.id); return stored; };
  try {
    const clip = { id: 'user-edit', voice: 'normal', trim: { start: 0.1, end: 0.9 } };
    const plain = await audio.original(clip);
    clip.edits = [{ kind: 'silence', start: 0.4, end: 0.6 }];
    const edited = await audio.original(clip);
    assert.equal(decodes.length, 2, 'a new edit renders anew');
    assert.equal(edited.duration, plain.duration, 'an edit never changes the length');
    assert.equal(edited.getChannelData(0)[Math.round(0.4 * RATE)], 0, 'the part is silent (0.5 s into the recording)');
    assert.equal(edited.getChannelData(0)[Math.round(0.1 * RATE)], 0.5, 'the rest is not');
    assert.equal(stored.getChannelData(0)[4000], 0.5, 'the stored recording is never changed');
    clip.fade = { in: 0.2, out: 0 };
    const faded = await audio.original(clip);
    assert.equal(faded.getChannelData(0)[0], 0, 'fades in from silence at the start of what is kept');
    assert.equal(audio.key(clip), 'user-edit:normal:null@0.1-0.9~s0.4-0.6/0.2-0');
    // With no trim, the quiet ends are found on the recording as stored, not after the edits.
    const auto = keptAudio(stored, { edits: [{ kind: 'silence', start: 0, end: 0.3 }] });
    assert.equal(auto.duration, keptAudio(stored, {}).duration);
  } finally {
    audio.decoded = saved;
    audio.forget('user-edit');
  }
});

test('🔊 Louder skips the evening-out: levelled by the unedited peak, and the voices keep that level', async () => {
  globalThis.AudioBuffer = FakeAudioBuffer;
  const { applyChain, softLimit } = await import('../web/voices.js');
  assert.equal(hasGain([{ kind: 'gain', start: 0, end: 1, amount: 2 }]), true);
  assert.equal(hasGain([{ kind: 'reverse', start: 0, end: 1 }]), false);
  assert.equal(hasGain(null), false);
  // The rest of the sound is at 0.45, the louder part at 0.9 (2×).
  const reference = fakeBuffer([[0.45, 0.45, 0.45, 0.45]]);
  const edited = fakeBuffer([[0.45, 0.9, 0.9, 0.45]]);
  const kept = levelForGain(edited, reference);
  assert.equal(kept.keepLevel, true);
  assert.deepEqual([...kept.getChannelData(0)].map((v) => +v.toFixed(3)), [0.9, 1.8, 1.8, 0.9], 'the rest at the usual level; the part twice as loud');
  const { buffer } = await applyChain(kept, [{ type: 'voice', voice: 'normal' }]);
  const out = [...buffer.getChannelData(0)];
  assert.ok(Math.abs(out[0] - 0.9) < 1e-6, 'not scaled down to fit the louder part');
  assert.ok(out[1] > 0.9 && out[1] <= 1, 'the loud part held at full scale at most, not clipped');
  assert.equal(softLimit(0.5), 0.5);
  assert.ok(softLimit(5) <= 1 && softLimit(-5) >= -1);
});
