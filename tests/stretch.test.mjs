// The Fast/Slow stretch: the same numbers in a Worker as on the page, and
// the same as before it moved into its own module.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioBuffer } from './helpers.mjs';
import { stretchChannels } from '../web/stretch.js';

const RATE = 8000;
function sample() {
  const b = new FakeAudioBuffer({ length: RATE, numberOfChannels: 1, sampleRate: RATE });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 7) * 0.5 * Math.sin(i / 900);
  return b;
}
// A weighted sum, so a sample out of place changes it.
const fingerprint = (d) => { let s = 0; for (let i = 0; i < d.length; i++) s += Math.abs(d[i]) * ((i % 97) + 1); return s; };

before(() => {
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.performance ??= { now: () => Date.now() };
});

test('Slow and Fast render exactly as they did before the stretch moved out', async () => {
  const { applyVoice } = await import('../web/voices.js');
  for (const [voice, amount, length, sum] of [['slow', 3, 24320, 466803.991256], ['fast', 2, 4352, 69955.755915]]) {
    const { buffer } = await applyVoice(sample(), voice, amount);
    assert.equal(buffer.length, length, voice);
    assert.ok(Math.abs(fingerprint(buffer.getChannelData(0)) - sum) < 1e-3, voice);
  }
});

test('the worker answers with exactly what the stretch makes on the page', async () => {
  const { handle } = await import('../web/stretch-worker.js');
  const input = sample().getChannelData(0);
  const sent = [];
  globalThis.postMessage = (msg, transfer) => sent.push({ msg, transfer });
  handle({ data: { id: 7, channels: [input.slice()], rate: RATE, speed: 0.25, maxSeconds: 180 } });
  const direct = stretchChannels([input], RATE, 0.25, 180);
  assert.equal(sent[0].msg.id, 7);
  assert.deepEqual(sent[0].msg.channels[0], direct[0]);
  assert.equal(sent[0].transfer[0], sent[0].msg.channels[0].buffer, 'handed back without a copy');

  handle({ data: { id: 8, channels: null, rate: RATE, speed: 2, maxSeconds: 180 } });
  assert.equal(sent[1].msg.id, 8);
  assert.ok(sent[1].msg.error, 'a bad job answers with an error, not silence');
});

test('the stretch is capped at the longest render', () => {
  const out = stretchChannels([new Float32Array(RATE)], RATE, 0.01, 2);
  assert.ok(out[0].length <= 2.1 * RATE, `${out[0].length} samples`);
});

test('with a Worker, voices stretch through it; when it fails, on the page, with the same result', async () => {
  const { handle } = await import('../web/stretch-worker.js');
  const posted = [];
  let fail = false;
  globalThis.Worker = class {
    constructor(url, opts) { posted.push(['new', String(url).endsWith('stretch-worker.js'), opts?.type]); }
    postMessage(data) {
      posted.push(['job', data.speed]);
      if (fail) { setTimeout(() => this.onerror({ message: 'boom' })); return; }
      globalThis.postMessage = (msg) => setTimeout(() => this.onmessage({ data: msg }));
      handle({ data });
    }
  };
  try {
    const { applyVoice } = await import('../web/voices.js');
    const viaWorker = await applyVoice(sample(), 'slow', 3);
    assert.deepEqual(posted.slice(0, 2), [['new', true, 'module'], ['job', 1 / 3]]);
    fail = true;
    const slowRender = await applyVoice(sample(), 'slow', 3);
    assert.deepEqual([...slowRender.buffer.getChannelData(0)], [...viaWorker.buffer.getChannelData(0)]);
  } finally {
    delete globalThis.Worker;
  }
});
