// Shared test helpers: a zip writer that can build files our own zip() never
// would (deflated, ZIP64-flagged, damaged), and a stand-in for AudioBuffer.

import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../web/zip.js';
import { rowLevel } from '../web/row-volume.js';
import { masterLevel } from '../web/mixer.js';
import { sameNotes } from '../web/notes.js';

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

// A Web Audio graph rendered one sample at a time, for the few nodes the
// live steps need (tests/live-peak.test.mjs). Use a rate over twice 5 kHz:
// Echo's lowpass rings out of control below it. Each node's output at
// sample n is pulled from its inputs; a delay hands out what came in
// `delayTime` ago, which breaks the echo's feedback loop.
export class SimContext {
  constructor(channels, length, sampleRate) {
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

// Do two beats sound the same: same tempo, same sounds, same pills on, same
// row settings? The tests' way to say a change touched a beat (the app asks
// the stored record, not this).
export function samePattern(a, b) {
  if (a.bpm !== b.bpm || (a.bars || 1) !== (b.bars || 1) || (a.swing || 0) !== (b.swing || 0) || a.rows.length !== b.rows.length) return false;
  if (masterLevel(a) !== masterLevel(b) || (a.fx ?? null) !== (b.fx ?? null)) return false;
  return a.rows.every((row, i) => {
    const o = b.rows[i];
    return row.clipId === o.clipId && row.rate === o.rate && row.ring === o.ring && row.muted === o.muted && rowLevel(row) === rowLevel(o)
      && !!row.solo === !!o.solo && (row.fx ?? null) === (o.fx ?? null)
      && row.steps.length === o.steps.length && row.steps.every((on, s) => on === o.steps[s])
      && row.steps.every((_, s) => !!row.accents?.[s] === !!o.accents?.[s])
      && !!row.melody === !!o.melody && row.steps.every((_, s) => (row.notes?.[s] ?? null) === (o.notes?.[s] ?? null))
      && sameNotes(row.tune, o.tune);
  });
}
