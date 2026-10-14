// A Worker that runs the Fast/Slow stretch (stretch.js) off the page's main
// thread, so buttons and the wave stay smooth while Slow 20× works. voices.js
// starts it as a module worker and falls back to stretching on the page
// where workers aren't available.
//
// Message in:  {id, channels: Float32Array[], rate, speed, maxSeconds}
// Message out: {id, channels: Float32Array[]} or {id, error}

import { stretchChannels } from './stretch.js';

export function handle({ data }) {
  const { id, channels, rate, speed, maxSeconds } = data;
  try {
    const out = stretchChannels(channels, rate, speed, maxSeconds);
    globalThis.postMessage({ id, channels: out }, out.map((c) => c.buffer));
  } catch (err) {
    globalThis.postMessage({ id, error: String(err?.message || err) });
  }
}

globalThis.onmessage = handle;
