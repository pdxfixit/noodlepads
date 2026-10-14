// The pitch-keeping stretch behind Fast and Slow, as plain arrays in and out
// so it can run in a Worker (stretch-worker.js) and keep the page smooth
// while a long sound is slowed right down. Pure: no Web Audio, no DOM.

// Plays `channels` (Float32Arrays at `rate` Hz) `speed` times faster without
// changing their pitch (WSOLA). Overlapping windowed slices are copied from
// the input at a faster hop than they are laid down in the output. Each slice
// is nudged (within ±10 ms) to where it best lines up with the last one, so
// the waveform joins smoothly instead of warbling. At most `maxSeconds` come out.
export function stretchChannels(channels, rate, speed, maxSeconds) {
  const size = 2 ** Math.round(Math.log2(rate * 0.04));  // ~40 ms frames
  const hop = size / 2;                                  // output hop, 50% overlap
  const tolerance = Math.round(rate * 0.01);
  const n = channels[0]?.length ?? 0;
  const mono = new Float32Array(n);
  for (const d of channels) for (let i = 0; i < n; i++) mono[i] += d[i];

  const frames = Math.max(1, Math.min(Math.ceil((n / speed) / hop), Math.floor(maxSeconds * rate / hop)));
  const outData = channels.map(() => new Float32Array(frames * hop + size));
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);  // periodic Hann: sums to 1 at 50% overlap

  let prev = 0;  // where the previous slice was read from
  for (let k = 0; k < frames; k++) {
    let from = Math.round(k * hop * speed);
    if (k > 0) {
      // The audio that naturally followed the last slice is what this one should match.
      const natural = prev + hop;
      let best = from, bestScore = -Infinity;
      const lo = Math.max(0, from - tolerance), hi = Math.min(n - hop, from + tolerance);
      for (let cand = lo; cand <= hi; cand++) {
        let score = 0;
        for (let i = 0; i < hop; i += 4) {
          const a = natural + i < n ? mono[natural + i] : 0;
          score += a * mono[cand + i];
        }
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      from = best;
    }
    prev = from;
    const to = k * hop;
    for (let c = 0; c < channels.length; c++) {
      const src = channels[c], dst = outData[c];
      for (let i = 0; i < size && from + i < n; i++) dst[to + i] += src[from + i] * window[i];
    }
  }
  return outData;
}
