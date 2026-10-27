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

// ── ⬇️ Save as audio file: how long the file is, and what it is called ──

export const AUDIO_MIN_SECONDS = 15;   // a beat's file loops to at least this long, in whole passes
export const AUDIO_RING_SECONDS = 2;   // the last hits ring out for up to this long past the end

// How many whole passes of a beat fill a file of at least `min` seconds
// (a beat of 4 slow bars is already longer than that: one pass).
export function audioPasses(passSeconds, min = AUDIO_MIN_SECONDS) {
  if (!(passSeconds > 0)) return 1;
  return Math.max(1, Math.ceil(min / passSeconds - 1e-9));
}

// How many frames of a rendered buffer to keep: everything up to the end of
// the music (`musicFrames`), then the ring-out for as long as anything is
// still heard in it, at most `ringFrames` (the buffer is rendered that much
// longer), and a short breath after the last sound so it does not click off.
export function audioFileFrames(buffer, musicFrames, ringFrames) {
  const end = Math.min(buffer.length, musicFrames + ringFrames);
  const data = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  let last = -1;
  for (let i = end - 1; i >= musicFrames && last < 0; i--) {
    for (const d of data) if (Math.abs(d[i]) > 0.001) { last = i; break; }
  }
  if (last < 0) return Math.min(end, musicFrames);
  return Math.min(end, last + 1 + Math.round(buffer.sampleRate * 0.05));
}

// The first `frames` of a rendered buffer, shaped for encodeWav.
export function audioView(buffer, frames) {
  return {
    numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, length: frames,
    getChannelData: (c) => buffer.getChannelData(c).subarray(0, frames),
  };
}

// The file's name is the name on screen: letters, numbers, spaces and ( ) ' _ -
// (no emoji, no / \ : * ? " < > |), up to 24 characters, then .wav.
export function audioFileName(name, fallback = 'Noodle Pads') {
  const clean = String(name ?? '').replace(/[^\p{L}\p{N} ()'_-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24).trim();
  return `${clean || fallback}.wav`;
}
