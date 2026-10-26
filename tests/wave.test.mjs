// The sound sheet's wave (web/wave.js): the line that sweeps across it while
// the sound plays. Drawn on a stand-in canvas that records each bar and the
// line; the look itself is checked with `just look sheet-own`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWave } from '../web/wave.js';
import { audio } from '../web/audio.js';

// A canvas 100 px wide whose 2D context records where the line (2 px wide)
// is drawn, and how lit each bar (3 px wide) is: 1 played, 0.32 not yet.
function fakeCanvas() {
  const lines = [];
  const bars = [];
  let alpha = 1;
  const g = {
    clearRect() { bars.length = 0; },
    fillRect(x, _y, w) { if (w === 2) lines.push(x); if (w === 3) bars.push(alpha); },
    set fillStyle(_v) {},
    set globalAlpha(v) { alpha = v; },
  };
  return { lines, bars, canvas: { clientWidth: 100, clientHeight: 20, width: 0, height: 0, getContext: () => g, setAttribute() {} } };
}

// Follows a sound `seconds` long, playing as `entry` says; returns the
// canvas's record and at(seconds), which runs the next frame at that time.
function following(entry, seconds = 2) {
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  const drawn = fakeCanvas();
  const wave = createWave(drawn.canvas);
  wave.show({ duration: seconds, length: 200, numberOfChannels: 1, sampleRate: 200 / seconds, getChannelData: () => new Float32Array(200).fill(0.5) });
  audio.ctx = { currentTime: 0 };
  audio.playing.set('preview', { t0: 0, duration: seconds, loop: true, ...entry });
  wave.follow('preview');
  const at = (t) => { audio.ctx.currentTime = t; drawn.lines.length = 0; frames.shift()(); return drawn.lines[0]; };
  return { ...drawn, at };
}

// Puts back what the wave tests change.
function restoring(fn) {
  const real = { raf: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame, style: globalThis.getComputedStyle, media: globalThis.matchMedia, ctx: audio.ctx };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.getComputedStyle = () => ({ color: '#fff', getPropertyValue: () => '' });
  try { fn(); } finally {
    audio.playing.delete('preview');
    audio.ctx = real.ctx;
    Object.assign(globalThis, { requestAnimationFrame: real.raf, cancelAnimationFrame: real.cancel, getComputedStyle: real.style, matchMedia: real.media });
  }
}

test('a looping sound\'s line sweeps across the wave on every pass, not just the first', () => restoring(() => {
  const { at } = following({});
  const first = at(0.5);
  assert.ok(first > 0, 'a quarter of the way on the first pass');
  assert.equal(at(2.5), first, 'and again a quarter of the way on the second');
}));

// Letting go of a live slider (audio.unloop) lets the loop finish its pass:
// the line goes on to the end of that pass, never jumping to the end.
test('a loop let go finishes its pass with the line sweeping, not jumping to the end', () => restoring(() => {
  const { at } = following({});
  const quarter = at(0.5);
  audio.playing.get('preview').loop = false;   // let go in the second pass
  assert.equal(at(2.5), quarter, 'a quarter of the way through the last pass');
}));
