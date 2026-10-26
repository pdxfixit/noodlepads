// The sound sheet's live loop against its saved render, for Make it echo
// (sound.md, "A live tail changes the peak"). The render is evened out to
// peak 0.9 after every step (voices.js finish); the live loop plays the head
// at peak 0.9 and the echo's nodes after it, with nothing evening out what
// they add. Here both run through a small sample-by-sample stand-in for an
// OfflineAudioContext (buffer source, gain, delay with feedback, lowpass),
// so the numbers are the real graph's; only an ear can say how it sounds.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioBuffer } from './helpers.mjs';

const RATE = 16000;   // above twice the echo's 5 kHz lowpass, which would ring out of control at 8 kHz

// A Web Audio graph rendered one sample at a time. Each node's output at
// sample n is pulled from its inputs; a delay hands out what came in
// `delayTime` ago, which breaks the echo's feedback loop.
class SimContext {
  constructor(channels, length, sampleRate = RATE) {
    Object.assign(this, { length, sampleRate, currentTime: 0, nodes: [] });
    this.destination = this.node({ out: (n) => this.sum(this.destination, n) });
  }
  node(props) {
    const nd = { inputs: [], memo: new Map(), connect: (next) => { (next.into ?? next).inputs.push(nd); return next; }, disconnect() {}, ...props };
    this.nodes.push(nd);
    return nd;
  }
  at(nd, n) {
    if (n < 0) return 0;
    if (!nd.memo.has(n)) nd.memo.set(n, nd.out(n));
    return nd.memo.get(n);
  }
  sum(nd, n) { return nd.inputs.reduce((t, i) => t + this.at(i, n), 0); }
  param(value) { return { value, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {} }; }
  createBuffer(c, length, sampleRate) { return new FakeAudioBuffer({ numberOfChannels: c, length, sampleRate }); }
  createBufferSource() {
    const nd = this.node({ buffer: null, playbackRate: this.param(1), start() {}, stop() {}, out: (n) => nd.buffer.getChannelData(0)[n] ?? 0 });
    return nd;
  }
  createGain() {
    const nd = this.node({ gain: this.param(1), out: (n) => nd.gain.value * this.sum(nd, n) });
    return nd;
  }
  createDelay() {
    const nd = this.node({ delayTime: this.param(0), out: (n) => this.sum(nd, n - Math.round(nd.delayTime.value * this.sampleRate)) });
    return nd;
  }
  createBiquadFilter() {
    // A lowpass as Web Audio makes it (Q in dB); the echo's only filter.
    const nd = this.node({
      type: 'lowpass', frequency: this.param(350), Q: this.param(1),
      out: (n) => {
        const w = (2 * Math.PI * nd.frequency.value) / this.sampleRate;
        const alpha = Math.sin(w) / (2 * 10 ** (nd.Q.value / 20));
        const a0 = 1 + alpha;
        const b0 = (1 - Math.cos(w)) / 2 / a0, b1 = (1 - Math.cos(w)) / a0;
        const a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
        const x = (k) => this.sum(nd, k);
        return b0 * x(n) + b1 * x(n - 1) + b0 * x(n - 2) - a1 * this.at(nd, n - 1) - a2 * this.at(nd, n - 2);
      },
    });
    return nd;
  }
  startRendering() {
    const out = new FakeAudioBuffer({ numberOfChannels: 1, length: this.length, sampleRate: this.sampleRate });
    const d = out.getChannelData(0);
    for (let n = 0; n < this.length; n++) {
      d[n] = this.at(this.destination, n);
      for (const nd of this.nodes) if (nd.delayTime) this.sum(nd, n);   // what each delay heard now, for later
    }
    return Promise.resolve(out);
  }
}

let applyChain, buildLive, tailOf;
before(async () => {
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.OfflineAudioContext = SimContext;
  globalThis.performance ??= { now: () => Date.now() };
  ({ applyChain } = await import('../web/voices.js'));
  ({ buildLive, tailOf } = await import('../web/steps.js'));
});

const tone = (seconds) => {
  const b = new FakeAudioBuffer({ length: Math.round(seconds * RATE), sampleRate: RATE });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE) * Math.min(1, (d.length - i) / 80);
  return b;
};
const peakOf = (b) => b.getChannelData(0).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const ECHO = { type: 'echo', repeats: 3, gap: 0.25 };

// The live loop for one Echo: the head (the sound in Normal, peak 0.9),
// then the echo's nodes, as sheet.js startLive builds them.
async function livePeak(sound) {
  const head = (await applyChain(sound, [], null)).buffer;
  const ctx = new SimContext(1, head.length + Math.round(tailOf([ECHO]) * RATE));
  const src = ctx.createBufferSource();
  src.buffer = head;
  buildLive(ctx, src, [ECHO]).output.connect(ctx.destination);
  return peakOf(await ctx.startRendering());
}

test('a short sound with Echo: the live loop peaks where the saved render does', async () => {
  const sound = tone(0.1);   // shorter than the gap: the echoes never pile on it
  const render = peakOf((await applyChain(sound, [ECHO])).buffer);
  const live = await livePeak(sound);
  assert.ok(Math.abs(render - 0.9) < 1e-6);
  assert.ok(Math.abs(live - render) < 0.01, `live ${live} vs render ${render}`);
});

test('a long sound with Echo: the echoes pile on it live, so the live loop peaks higher than the render', async () => {
  const sound = tone(1);    // the first echo plays over the sound itself
  const render = peakOf((await applyChain(sound, [ECHO])).buffer);
  const live = await livePeak(sound);
  const db = 20 * Math.log10(live / render);
  assert.ok(Math.abs(render - 0.9) < 1e-6, 'the render is evened out after the echo');
  assert.ok(live > render, `live ${live.toFixed(3)} is above the render's peak`);
  // A held 220 Hz note with its echoes landing in phase is the worst case:
  // about 1.81 live against the render's 0.9, +6 dB. The output limiter
  // (audio.js: threshold -2 dB, ratio 20) holds it under full scale, so it
  // is heard louder while dragging, never clipped (sound.md, Seams).
  assert.ok(db > 5 && db < 7, `${db.toFixed(1)} dB over`);
});
