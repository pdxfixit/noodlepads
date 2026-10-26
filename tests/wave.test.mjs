// The sound sheet's wave (web/wave.js): the line that sweeps across it while
// the sound plays. Drawn on a stand-in canvas that records each bar and the
// line; the look itself is checked with `just look sheet-own`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWave } from '../web/wave.js';
import { audio } from '../web/audio.js';

// A canvas 100 px wide whose 2D context records where the line (2 px wide) is drawn.
function fakeCanvas() {
  const lines = [];
  const g = {
    clearRect() {},
    fillRect(x, _y, w) { if (w === 2) lines.push(x); },
    set fillStyle(_v) {},
    set globalAlpha(_v) {},
  };
  return { lines, canvas: { clientWidth: 100, clientHeight: 20, width: 0, height: 0, getContext: () => g, setAttribute() {} } };
}

test('a looping sound\'s line sweeps across the wave on every pass, not just the first', () => {
  const frames = [];
  const real = { raf: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame, style: globalThis.getComputedStyle, ctx: audio.ctx };
  Object.assign(globalThis, {
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ color: '#fff', getPropertyValue: () => '' }),
  });
  try {
    const { lines, canvas } = fakeCanvas();
    const wave = createWave(canvas);
    wave.show({ duration: 2, length: 200, numberOfChannels: 1, sampleRate: 100, getChannelData: () => new Float32Array(200).fill(0.5) });
    audio.ctx = { currentTime: 0 };
    audio.playing.set('preview', { t0: 0, duration: 2, loop: true });
    wave.follow('preview');
    const at = (seconds) => { audio.ctx.currentTime = seconds; lines.length = 0; frames.shift()(); return lines[0]; };
    const first = at(0.5);
    assert.ok(first > 0, 'a quarter of the way on the first pass');
    assert.equal(at(2.5), first, 'and again a quarter of the way on the second');
  } finally {
    audio.playing.delete('preview');
    audio.ctx = real.ctx;
    Object.assign(globalThis, { requestAnimationFrame: real.raf, cancelAnimationFrame: real.cancel, getComputedStyle: real.style });
  }
});
