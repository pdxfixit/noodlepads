// Shared test helpers: a zip writer that can build files our own zip() never
// would (deflated, ZIP64-flagged, damaged), and a stand-in for AudioBuffer.

import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../web/zip.js';

const enc = new TextEncoder();

// entries: [{name, data, method = 0|8, crc, size, compSize}] -> Uint8Array.
// Anything left out is computed honestly; pass a value to lie about it.
// `raw: true` with method 8 stores `data` as the compressed bytes untouched.
export function buildZip(entries, { eocdCount, comment = '' } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data ?? new Uint8Array(0);
    const method = e.method ?? 0;
    const body = method === 8 && !e.raw ? new Uint8Array(deflateRawSync(data)) : data;
    const crc = e.crc ?? crc32(data);
    const size = e.size ?? data.length;
    const compSize = e.compSize ?? body.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, compSize, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, body);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, method, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, compSize, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const note = enc.encode(comment);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, eocdCount ?? entries.length, true);
  end.setUint16(10, eocdCount ?? entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, note.length, true);
  return concat([...parts, ...central, new Uint8Array(end.buffer), note]);
}

export function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

export const blobOf = (bytes) => new Blob([bytes]);
export const bytes = (...n) => new Uint8Array(n);
export const utf8 = (s) => enc.encode(s);

// Just enough of AudioBuffer for the pure audio helpers.
export function fakeBuffer(channels, sampleRate = 8000) {
  const data = channels.map((c) => Float32Array.from(c));
  return {
    numberOfChannels: data.length,
    length: data[0].length,
    sampleRate,
    duration: data[0].length / sampleRate,
    getChannelData: (c) => data[c],
  };
}

// Enough of the real AudioBuffer constructor for voices that render in plain
// JavaScript (Normal, Backwards, Fast, Slow) to run in Node. Install it with
// `globalThis.AudioBuffer = FakeAudioBuffer`.
export class FakeAudioBuffer {
  constructor({ length, numberOfChannels = 1, sampleRate }) {
    this.length = length;
    this.numberOfChannels = numberOfChannels;
    this.sampleRate = sampleRate;
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(c) { return this.data[c]; }
  copyToChannel(source, c) { this.data[c].set(source.subarray(0, this.length)); }
}

// Enough of OfflineAudioContext for every voice to render in Node: nodes
// connect and take settings, and the render is silence of the right length.
// It checks wiring, not sound. Install it with
// `globalThis.OfflineAudioContext = FakeOfflineAudioContext`.
export class FakeOfflineAudioContext {
  constructor(numberOfChannels, length, sampleRate) {
    Object.assign(this, { numberOfChannels, length, sampleRate, destination: { channelCount: numberOfChannels } });
    const node = () => new Proxy({}, {
      get: (t, k) => (k in t ? t[k]
        : k === 'connect' ? (next) => next
          : k === 'start' || k === 'stop' || k === 'disconnect' ? () => {}
            : { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }),
    });
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && k.startsWith('create') ? node : undefined) });
  }
  createBuffer(numberOfChannels, length, sampleRate) { return new FakeAudioBuffer({ numberOfChannels, length, sampleRate }); }
  startRendering() {
    return Promise.resolve(new FakeAudioBuffer({ numberOfChannels: this.numberOfChannels, length: this.length, sampleRate: this.sampleRate }));
  }
}

// A rejected promise's message, or null if it resolved.
export async function failure(promise) {
  try { await promise; } catch (err) { return err.message; }
  return null;
}
