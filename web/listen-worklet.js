// 🎧 From a song's ears: the AudioWorklet processor that hands the main
// thread what a shared tab, the computer or the microphone is playing, as
// mono frames of FRAME samples (about 43 ms at 48 kHz). The audio thread
// gets 128 samples at a time; posting each would be 375 messages a second,
// so they are batched first. Loaded by listen-input.js with
// audioWorklet.addModule (same origin, so the CSP's script-src 'self' allows it).
//
// The mixing and batching are plain exports, so tests run them and
// listen-input.js feeds a song file through the same batcher. The processor
// itself is registered only inside an AudioWorkletGlobalScope: imported
// anywhere else (the page, Node), this file does nothing.

// Samples in one frame posted to the main thread.
export const FRAME = 2048;

// The average of the channels, into `out` (made if not given). A channel
// shorter than the first counts as silence past its end.
export function mixToMono(channels, out) {
  const n = channels[0]?.length ?? 0;
  const mono = out ?? new Float32Array(n);
  if (!channels.length) return mono;
  if (channels.length === 1) {
    mono.set(channels[0].subarray(0, n));
    return mono;
  }
  mono.fill(0, 0, n);
  for (const ch of channels) {
    const m = Math.min(n, ch.length);
    for (let i = 0; i < m; i++) mono[i] += ch[i];
  }
  const k = 1 / channels.length;
  for (let i = 0; i < n; i++) mono[i] *= k;
  return mono;
}

// Collects samples, however many come at a time, and calls `emit` with
// each full frame of `size`: a new Float32Array each time, so it can be
// transferred to another thread. `flush` emits what is left, padded with
// silence (the end of a file).
export class FrameBatcher {
  constructor(size, emit) {
    this.size = size;
    this.emit = emit;
    this.buf = new Float32Array(size);
    this.fill = 0;
  }

  push(samples) {
    let i = 0;
    while (i < samples.length) {
      const take = Math.min(this.size - this.fill, samples.length - i);
      this.buf.set(samples.subarray(i, i + take), this.fill);
      this.fill += take;
      i += take;
      if (this.fill === this.size) {
        const full = this.buf;
        this.buf = new Float32Array(this.size);
        this.fill = 0;
        this.emit(full);
      }
    }
  }

  flush() {
    if (!this.fill) return;
    const last = this.buf;          // the rest is already zeros
    this.buf = new Float32Array(this.size);
    this.fill = 0;
    this.emit(last);
  }
}

if (typeof registerProcessor === 'function' && typeof AudioWorkletProcessor === 'function') {
  // One input (whatever channels the stream has), mixed to mono and posted
  // a frame at a time with its buffer transferred. It writes no output: the
  // node is wired to the destination only so the browser keeps running it.
  class ListenFrames extends AudioWorkletProcessor {
    constructor() {
      super();
      this.mono = new Float32Array(128);
      this.batcher = new FrameBatcher(FRAME, (frame) => this.port.postMessage(frame, [frame.buffer]));
      this.on = true;
      this.port.onmessage = (e) => { if (e.data === 'stop') this.on = false; };
    }

    process(inputs) {
      const channels = inputs[0];
      if (channels?.length) {
        if (this.mono.length !== channels[0].length) this.mono = new Float32Array(channels[0].length);
        this.batcher.push(mixToMono(channels, this.mono));
      }
      return this.on;
    }
  }
  registerProcessor('listen-frames', ListenFrames);
}
