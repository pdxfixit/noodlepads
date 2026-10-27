// The sound sheet's live loop against its saved render, for Make it echo
// (sound.md, "A live tail changes the peak"). The render is evened out to
// peak 0.9 after every step (voices.js finish); the live loop plays the head
// at peak 0.9 and the echo's nodes after it, turned down by steps.js
// liveTrim for what the echoes can add. Here both run through a small
// sample-by-sample stand-in for an OfflineAudioContext (helpers.mjs
// SimContext: buffer source, gain, delay with feedback, lowpass), so the
// numbers are the real graph's; only an ear can say how it sounds.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioBuffer, SimContext } from './helpers.mjs';

const RATE = 16000;   // above twice the echo's 5 kHz lowpass, which would ring out of control at 8 kHz

let applyChain, buildLive, tailOf, liveTrim;
before(async () => {
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.OfflineAudioContext = SimContext;
  globalThis.performance ??= { now: () => Date.now() };
  ({ applyChain } = await import('../web/voices.js'));
  ({ buildLive, tailOf, liveTrim } = await import('../web/steps.js'));
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
// `trimmed`: turned down by steps.js liveTrim, as sheet.js startLive plays
// it; without, the echo's nodes alone.
async function livePeak(sound, echo = ECHO, { trimmed = true } = {}) {
  const head = (await applyChain(sound, [], null)).buffer;
  const ctx = new SimContext(1, head.length + Math.round(tailOf([echo]) * RATE), RATE);
  const src = ctx.createBufferSource();
  src.buffer = head;
  const level = ctx.createGain();
  level.gain.value = trimmed ? liveTrim([echo], head.duration) : 1;
  buildLive(ctx, src, [echo]).output.connect(level).connect(ctx.destination);
  return peakOf(await ctx.startRendering());
}
const dbOver = (live, render) => 20 * Math.log10(live / render);

test('a short sound with Echo: the live loop peaks where the saved render does', async () => {
  const sound = tone(0.1);   // shorter than the gap: the echoes never pile on it
  const render = peakOf((await applyChain(sound, [ECHO])).buffer);
  const live = await livePeak(sound);
  assert.ok(Math.abs(render - 0.9) < 1e-6);
  assert.ok(Math.abs(live - render) < 0.01, `live ${live} vs render ${render}`);
});

test('a long sound with Echo: the echoes pile on it, so the live loop is turned down to peak near the render', async () => {
  const sound = tone(1);    // the first echo plays over the sound itself
  const render = peakOf((await applyChain(sound, [ECHO])).buffer);
  assert.ok(Math.abs(render - 0.9) < 1e-6, 'the render is evened out after the echo');
  // Untrimmed, a held 220 Hz note with 3 echoes in step peaks at about 1.81: +6 dB.
  const raw = dbOver(await livePeak(sound, ECHO, { trimmed: false }), render);
  assert.ok(raw > 5 && raw < 7, `${raw.toFixed(1)} dB over, untrimmed`);
  const db = dbOver(await livePeak(sound), render);
  assert.ok(Math.abs(db) < 1.5, `${db.toFixed(1)} dB from the render, trimmed`);
});

// Echo goes up to 8 repeats (steps.js): on a held note the most pile up.
test('a held note with 8 echoes: 10 dB over the render untrimmed, near it as the live loop plays it', async () => {
  const echo = { type: 'echo', repeats: 8, gap: 0.25 };
  const sound = tone(3);
  const render = peakOf((await applyChain(sound, [echo])).buffer);
  // About 2.96 against 0.9, +10.4 dB. Untrimmed, the output limiter (audio.js:
  // threshold -2 dB, 20:1, not a brickwall) would hold it near full scale and
  // turn down everything else on the master (a playing beat) by about as much.
  const raw = dbOver(await livePeak(sound, echo, { trimmed: false }), render);
  assert.ok(raw > 9.5 && raw < 11, `${raw.toFixed(1)} dB over, untrimmed`);
  const db = dbOver(await livePeak(sound, echo), render);
  assert.ok(Math.abs(db) < 1.5, `${db.toFixed(1)} dB from the render, trimmed`);
});
