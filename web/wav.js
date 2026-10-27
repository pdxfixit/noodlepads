// The WAV encoder and the render normalizer: a rendered beat or song becomes
// a 16-bit PCM file every browser can decode, so it can be stored and played
// like any recording. Pure: it reads an AudioBuffer-shaped object and builds
// a Blob; no audio graph, DOM or storage.

import { peakOf } from './loudness.js';

// Scales a rendered buffer so its loudest moment is just under full scale
// (rows add up, so a render can clip). In place; returns the buffer.
export function normalize(out) {
  const peak = peakOf(out);
  if (peak > 0) for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let k = 0; k < d.length; k++) d[k] *= 0.9 / peak;
  }
  return out;
}

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const text = (at, str) => { for (let i = 0; i < str.length; i++) view.setUint8(at + i, str.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, bytes - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}
