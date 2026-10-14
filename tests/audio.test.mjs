import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimBounds, peaks } from '../web/audio.js';
import { fakeBuffer } from './helpers.mjs';

const RATE = 1000;
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

test('trimBounds: a silent buffer is reported silent and left whole', () => {
  const b = fakeBuffer([new Array(500).fill(0)], RATE);
  assert.deepEqual(trimBounds(b), { start: 0, duration: 0.5, silent: true });
  // Below the 0.005 floor counts as silence too.
  assert.equal(trimBounds(fakeBuffer([new Array(500).fill(0.004)], RATE)).silent, true);
});

test('trimBounds: cuts the quiet lead-in and tail, keeping 30 ms either side', () => {
  const data = new Array(1000).fill(0);
  for (let i = 400; i < 600; i++) data[i] = 0.8;   // sound from 0.4 s to 0.6 s
  const r = trimBounds(fakeBuffer([data], RATE));
  assert.equal(r.silent, false);
  approx(r.start, 0.37);
  approx(r.duration, 0.259);  // the last audible sample is the end, plus 30 ms
});

test('trimBounds: never reaches past either end of the buffer', () => {
  const data = new Array(200).fill(0.9);
  const r = trimBounds(fakeBuffer([data], RATE));
  assert.equal(r.start, 0);
  approx(r.duration, 0.2);
});

test('trimBounds: the threshold follows the clip\'s own peak, so quiet clips still trim', () => {
  const data = new Array(1000).fill(0);
  for (let i = 300; i < 400; i++) data[i] = 0.05;   // quiet, but real
  data[100] = 0.004;                                 // a blip well under 10% of the peak
  const r = trimBounds(fakeBuffer([data], RATE));
  approx(r.start, 0.27);
  approx(r.duration, 0.159);
});

test('trimBounds: with two channels, keeps whichever channel is audible', () => {
  const left = new Array(1000).fill(0);
  const right = new Array(1000).fill(0);
  for (let i = 200; i < 300; i++) left[i] = 0.7;
  for (let i = 500; i < 600; i++) right[i] = 0.7;
  const r = trimBounds(fakeBuffer([left, right], RATE));
  approx(r.start, 0.17);
  approx(r.duration, 0.459);
});

test('a looping pad repeats over a whole number of beats that holds it: 1, 2, 4, 8, 16, then whole bars', async () => {
  const { loopBeats } = await import('../web/audio.js');
  const beat = 0.6;  // 100 BPM
  assert.equal(loopBeats(0.2, beat), 1);
  assert.equal(loopBeats(0.6, beat), 1);
  assert.equal(loopBeats(0.61, beat), 1, 'a hair too long still fits');
  assert.equal(loopBeats(0.9, beat), 2);
  assert.equal(loopBeats(1.5, beat), 4);
  assert.equal(loopBeats(3, beat), 8);
  assert.equal(loopBeats(9, beat), 16);
  assert.equal(loopBeats(10, beat), 20, 'past 16 beats, whole bars');
  assert.equal(loopBeats(1000, beat), 128, 'capped');
});

test('a clip\'s cache key is id:voice:amount as before chains, and names the whole chain when there is one', async () => {
  const { audio } = await import('../web/audio.js');
  assert.equal(audio.key({ id: 'user-1' }), 'user-1:normal:null');
  assert.equal(audio.key({ id: 'user-1', voice: 'slow', amount: 8 }), 'user-1:slow:8');
  assert.equal(audio.key({ id: 'user-1', voice: 'chipmunk' }), 'user-1:chipmunk:1.7');
  assert.equal(audio.key({ id: 'user-1', voice: 'chipmunk', fx: [{ type: 'voice', voice: 'chipmunk', amount: 2 }, { type: 'voice', voice: 'robot' }] }),
    'user-1:chipmunk:2>robot:null');
});

test('peaks: one value per column, the loudest sample in that slice, across channels', () => {
  const left = new Array(100).fill(0);
  const right = new Array(100).fill(0);
  for (let i = 0; i < 25; i++) left[i] = 0.5;          // first quarter
  right[60] = -0.9;                                      // a single loud sample in the third quarter, negative
  const p = peaks(fakeBuffer([left, right], RATE), 4);
  assert.equal(p.length, 4);
  assert.deepEqual([...p], [0.5, 0, Math.fround(0.9), 0]);
});

test('peaks: silence is flat, and more columns than samples still gives every column a value', () => {
  assert.deepEqual([...peaks(fakeBuffer([new Array(50).fill(0)], RATE), 10)], new Array(10).fill(0));
  const p = peaks(fakeBuffer([[0.2, 0.4, 0.8]], RATE), 6);
  assert.equal(p.length, 6);
  assert.ok(p.every((v) => v > 0));
  assert.equal(Math.max(...p), Math.fround(0.8));
});

test('peaks: nothing to draw gives an empty or flat result, never an error', () => {
  assert.equal(peaks(fakeBuffer([[0.5, 0.5]], RATE), 0).length, 0);
  assert.equal(peaks(fakeBuffer([[]], RATE), 5).length, 5);
  assert.equal(peaks(fakeBuffer([[2, -3]], RATE), 1)[0], 1, 'clipped audio is capped at 1');
});

test('a trim plays exactly that part of the stored audio, before every voice, and a new trim is a new sound', async () => {
  const { audio } = await import('../web/audio.js');
  const { FakeAudioBuffer } = await import('./helpers.mjs');
  globalThis.AudioBuffer ??= FakeAudioBuffer;
  const data = Array.from({ length: 1000 }, (_, i) => (i >= 100 && i < 900 ? 0.5 : 0));
  const stored = fakeBuffer([data], RATE);
  const decodes = [];
  const saved = audio.decoded;
  audio.decoded = async (clip) => { decodes.push(clip.id); return stored; };
  try {
    const clip = { id: 'user-trim', voice: 'normal' };
    approx((await audio.original(clip)).duration, 0.859);   // automatic: the quiet ends off, 30 ms kept
    clip.trim = { start: 0.2, end: 0.5 };
    approx((await audio.original(clip)).duration, 0.3);
    await audio.original(clip);
    assert.equal(decodes.length, 2, 'cached until the trim changes');
    clip.trim = { start: 0.6, end: 99 };
    approx((await audio.original(clip)).duration, 0.4);   // an end past the audio stops at its end
    assert.equal(audio.key(clip), 'user-trim:normal:null@0.6-99');
    assert.equal(audio.key({ id: 'user-trim', trim: 'junk' }), 'user-trim:normal:null', 'junk is no trim');
  } finally {
    audio.decoded = saved;
    audio.forget('user-trim');
  }
});

test('levelVerdict: silent, too quiet, too loud (clipped) or fine', async () => {
  const { levelVerdict } = await import('../web/audio.js');
  assert.equal(levelVerdict(0, 0), 'silent');
  assert.equal(levelVerdict(0.004, 0.001), 'silent');
  assert.equal(levelVerdict(NaN, NaN), 'silent');
  assert.equal(levelVerdict(0.05, 0.02), 'quiet', 'a low peak');
  assert.equal(levelVerdict(0.3, 0.005), 'quiet', 'one click in a whisper');
  assert.equal(levelVerdict(0.6, 0.1), 'ok');
  assert.equal(levelVerdict(0.97, 0.3), 'ok');
  assert.equal(levelVerdict(1, 0.4), 'loud');
  assert.equal(levelVerdict(0.99, 0.002), 'loud', 'a clipped sample wins over quiet');
});

test('levelsOf: the peak of the whole buffer, the average of its audible part', async () => {
  const { levelsOf } = await import('../web/audio.js');
  const data = new Array(1000).fill(0);
  for (let i = 400; i < 600; i++) data[i] = i % 2 ? 0.5 : -0.5;   // a square wave at 0.5
  const { peak, rms } = levelsOf(fakeBuffer([data], RATE));
  approx(peak, 0.5);
  assert.ok(rms > 0.4 && rms <= 0.5, `${rms}: the silence around it does not water it down`);
});

test('a live preview: start() puts nodes between the sound and its fader; unloop() lets the pass finish', async () => {
  const { audio } = await import('../web/audio.js');
  const wires = [];
  const stops = [];
  const node = (name) => ({ name, connect(n) { wires.push([name, n.name]); return n; }, disconnect() { wires.push([name, 'off']); } });
  const ctx = {
    state: 'running', currentTime: 10,
    createBufferSource: () => Object.assign(node('src'), { start() {}, stop(t) { stops.push(t); }, playbackRate: { value: 1 } }),
    createGain: () => Object.assign(node('fader'), { gain: { value: 1 } }),
  };
  Object.assign(audio, { ctx, master: node('master') });
  audio.start('preview', { buffer: {}, duration: 2 }, { loop: true, via: (c, src) => src.connect(node('echo')) });
  assert.deepEqual(wires, [['src', 'fader'], ['fader', 'master'], ['src', 'off'], ['src', 'echo'], ['echo', 'fader']]);
  assert.equal(audio.isLooping('preview'), true);
  ctx.currentTime = 13;   // one and a half passes in
  audio.unloop('preview');
  assert.equal(stops.at(-1), 14, 'stops at the end of the second pass');
  assert.equal(audio.isLooping('preview'), false);
  audio.playing.clear();
  audio.ctx = null;
});
