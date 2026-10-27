// How loud a sound seems (web/loudness.js), the measure 🔊 Even it out uses:
// the K-weighting filter matches BS.1770's own table at 48 kHz, a tone reads
// what the standard says, a short click seems quieter than a held note at
// the same peak, the target is the presets' median (recomputed from the WAV
// files, so it stays honest), and a quiet recording with one loud clap
// comes out near the target after the limiter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  kWeighting, loudness, peakOf, evenGain, softLimit, softClipCurve, PRESET_LOUDNESS, EVEN_ENOUGH,
} from '../web/loudness.js';
import { fakeBuffer } from './helpers.mjs';

const web = new URL('../web/', import.meta.url);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not within ${tol} of ${b}`);
const tone = (seconds, rate, amp = 1, hz = 1000) => Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / rate));

// A 16-bit PCM WAV file as an AudioBuffer-like (the presets are all mono 16-bit).
function readWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  assert.equal(tag(0), 'RIFF');
  let at = 12, fmt = null;
  while (at + 8 <= bytes.length) {
    const id = tag(at), size = v.getUint32(at + 4, true), body = at + 8;
    if (id === 'fmt ') fmt = { channels: v.getUint16(body + 2, true), rate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    if (id === 'data') {
      assert.equal(fmt?.bits, 16, 'a 16-bit preset');
      const frames = Math.floor(Math.min(size, bytes.length - body) / (2 * fmt.channels));
      const chans = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.channels; c++) chans[c][i] = v.getInt16(body + 2 * (i * fmt.channels + c), true) / 32768;
      return fakeBuffer(chans.map((d) => Array.from(d)), fmt.rate);
    }
    at = body + size + (size & 1);
  }
  throw new Error('no data chunk');
}

// A buffer scaled so its loudest moment is 0.9, as the voices' finish() plays every preset.
function atPeak(buffer) {
  const scale = 0.9 / peakOf(buffer);
  return fakeBuffer(Array.from({ length: buffer.numberOfChannels }, (_, c) => Array.from(buffer.getChannelData(c), (x) => x * scale)), buffer.sampleRate);
}

test('K-weighting at 48 kHz is BS.1770\'s own table', () => {
  const [shelf, hp] = kWeighting(48000);
  const close = (got, want) => got.forEach((g, i) => near(g, want[i], 1e-8));
  close(shelf.b, [1.53512485958697, -2.69169618940638, 1.19839281085285]);
  close(shelf.a, [-1.69065929318241, 0.73248077421585]);
  close(hp.b, [1, -2, 1]);
  close(hp.a, [-1.99004745483398, 0.99007225036621]);
});

test('a full-scale 1 kHz tone reads about -3 LUFS, at any sample rate, mono or stereo the same', () => {
  for (const rate of [22050, 44100, 48000]) near(loudness(fakeBuffer([tone(1, rate)], rate)), -3.01, 0.1, `${rate} Hz`);
  const d = tone(1, 48000);
  near(loudness(fakeBuffer([d, d], 48000)), loudness(fakeBuffer([d], 48000)), 1e-9, 'a phone plays mono on both speakers');
  near(loudness(fakeBuffer([tone(1, 48000, 0.5)], 48000)), -9.03, 0.1, 'half as loud is 6 dB down');
  assert.equal(loudness(fakeBuffer([new Array(4800).fill(0)], 48000)), -Infinity);
  near(loudness(fakeBuffer([tone(1, 48000, 0.5)], 48000), { scale: 2 }), -3.01, 0.1, 'scale turns it up first');
});

test('a short click seems quieter than a held note at the same peak; a low hum quieter than a mid tone', () => {
  const rate = 22050;
  const held = loudness(fakeBuffer([tone(1, rate)], rate));
  const click = loudness(fakeBuffer([tone(0.02, rate)], rate));
  assert.ok(click < held - 10, `${click} vs ${held}`);
  assert.ok(loudness(fakeBuffer([tone(1, rate, 1, 30)], rate)) < held - 3, 'below 40 Hz the ear barely hears');
});

test('PRESET_LOUDNESS is the median of the shown presets as the app plays them, recomputed from web/clips/kit/', () => {
  const kit = JSON.parse(readFileSync(new URL('boards.json', web), 'utf8')).kit;
  // One per file, each turned down by its boards.json `level` as the app plays it.
  const shown = [...new Map(kit.filter((s) => !s.advanced && !s.inst && s.file).map((s) => [s.file, s])).values()];
  assert.ok(shown.length > 50, 'plenty of presets');
  const levels = shown.map((s) => loudness(atPeak(readWav(readFileSync(new URL(s.file, web)))), { scale: 10 ** ((s.level ?? 0) / 20) })).sort((a, b) => a - b);
  const mid = levels.length / 2;
  const median = levels.length % 2 ? levels[Math.floor(mid)] : (levels[mid - 1] + levels[mid]) / 2;
  near(PRESET_LOUDNESS, median, 0.5, 'update PRESET_LOUDNESS in web/loudness.js to');
});

test('evenGain: quiet talking with one loud clap comes out near the target, peaks held under full scale', () => {
  const rate = 22050;
  // Two seconds of quiet "talking" (a soft 300 Hz hum at 0.06) and one clap
  // at 0.9: a 1.5 kHz burst that dies away within about 10 ms.
  const d = tone(2, rate, 0.06, 300);
  for (let i = 0; i < 0.03 * rate; i++) d[rate + i] += 0.87 * Math.sin(2 * Math.PI * 1500 * i / rate) * Math.exp(-i / (0.003 * rate));
  const quiet = fakeBuffer([d], rate);
  const before = loudness(quiet);
  assert.ok(before < PRESET_LOUDNESS - 10, `starts quiet: ${before}`);
  const gain = evenGain(quiet);
  assert.ok(gain > 1 && gain < 8, `turned up: ${gain}`);
  near(loudness(quiet, { scale: gain, limit: true }), PRESET_LOUDNESS, 0.1, 'as loud as the presets');
  // Quieter still, it goes as far up as a gain edit can (8×).
  const quieter = fakeBuffer([d.map((x) => x * 0.2)], rate);
  assert.equal(evenGain(quieter), 8);
  assert.ok(softLimit(0.9 * gain) <= 1 && softLimit(-0.9 * gain) >= -1, 'the clap is held at full scale or under');
});

test('evenGain: a talking voice comes out at the target, a too-loud buzz is turned down, silence is left alone', () => {
  const rate = 22050;
  const talk = fakeBuffer([tone(1, rate, 0.9, 400).map((x, i) => x * (0.2 + 0.8 * Math.abs(Math.sin(i / rate * 9))) * 0.3)], rate);
  near(loudness(talk, { scale: evenGain(talk), limit: true }), PRESET_LOUDNESS, 0.1);
  const buzz = fakeBuffer([tone(2, rate, 0.9, 2000)], rate);
  const g = evenGain(buzz);
  assert.ok(g < 1, `turned down: ${g}`);
  near(loudness(buzz, { scale: g }), PRESET_LOUDNESS, 0.1);
  assert.equal(evenGain(fakeBuffer([new Array(1000).fill(0)], rate)), 1);
  assert.equal(EVEN_ENOUGH, 1, 'within about 1 dB is already even');
});

test('softClipCurve: straight under 0.9, bent smoothly above it, never past 1, silent at the middle, odd and symmetric', () => {
  const curve = softClipCurve();
  assert.ok(curve instanceof Float32Array);
  assert.equal(curve.length % 2, 1, 'an odd number of points puts 0 at the middle');
  const mid = (curve.length - 1) / 2;
  assert.equal(curve[mid], 0);
  const last = curve.length - 1;
  for (let i = 0; i <= mid; i++) {
    const x = (i / last) * 2 - 1;
    assert.ok(Math.abs(curve[i] + curve[last - i]) < 1e-6, `symmetric at ${x}`);
    if (Math.abs(x) <= 0.9) near(curve[i], x, 1e-6, `untouched at ${x}`);
    assert.ok(Math.abs(curve[i]) <= 1);
  }
  // Louder in always means louder out (no fold-back), and it flattens toward the top.
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] > curve[i - 1], `rising at ${i}`);
  const rise = (a, b) => curve[Math.round(((b + 1) / 2) * last)] - curve[Math.round(((a + 1) / 2) * last)];
  assert.ok(rise(0.95, 1) < rise(0.85, 0.9) * 0.7, 'the last 0.05 gains well under what it would on the line');
  near(curve[last], 0.976, 0.001, 'full scale in comes out just under it');
  // A tiny curve still works.
  assert.equal(softClipCurve(2).length, 3);
});
