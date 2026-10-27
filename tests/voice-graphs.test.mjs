// The voices that are built from a Web Audio graph (Monster, Walkie-talkie,
// and the ✦ boom and walkie layers the knobs add) and the Fade step, pinned
// node for node: each recipe is rendered into a recording stand-in
// OfflineAudioContext, and its graph (nodes, settings, connections, start
// times, and the noise it was handed) must equal tests/voice-graphs.json.
// The noise is seeded, so the log is exact. This holds the recipes still while
// shared parts move between them. Not tested here: how they sound (Ben's ears,
// as he goes). To record the log again after a voice is changed on purpose:
// `GOLDEN=1 node --test --test-force-exit tests/voice-graphs.test.mjs`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { FakeAudioBuffer } from './helpers.mjs';

const GOLDEN = new URL('./voice-graphs.json', import.meta.url);
const log = [];

// How a value reads in the log: numbers to six places, a buffer as its shape
// and the sum of its samples, a curve the same.
const show = (v) => {
  if (typeof v === 'number') return Math.round(v * 1e6) / 1e6;
  if (v instanceof Float32Array) return `curve[${v.length}:${Math.round(v.reduce((a, b) => a + b, 0) * 1e4) / 1e4}]`;
  if (v instanceof FakeAudioBuffer) {
    const sum = v.data.reduce((t, d) => t + d.reduce((a, b) => a + Math.abs(b), 0), 0);
    return `buffer[${v.numberOfChannels}x${v.length}:${Math.round(sum * 1e4) / 1e4}]`;
  }
  return String(v);
};

class RecordingContext {
  constructor(numberOfChannels, length, sampleRate) {
    Object.assign(this, { numberOfChannels, length, sampleRate });
    let count = 0;
    const record = (kind, ids) => {
      const id = `${kind}${count++}`;
      ids.push(id);
      const params = {};
      const own = { id };
      return new Proxy(own, {
        get(t, k) {
          if (k === 'connect') return (next) => { log.push(`${id} -> ${next.id}`); return next; };
          if (k === 'disconnect') return () => {};
          if (k === 'start' || k === 'stop') return (...a) => log.push(`${id}.${k}(${a.map(show).join(',')})`);
          if (k in t) return t[k];
          if (typeof k !== 'string') return undefined;
          return (params[k] ??= new Proxy({}, {
            set(_, p, v) { log.push(`${id}.${k}.${p} = ${show(v)}`); return true; },
            get: (_, p) => (typeof p === 'string' && /^(set|linear|exp|cancel)/.test(p) ? (...a) => log.push(`${id}.${k}.${p}(${a.map(show).join(',')})`) : 0),
          }));
        },
        set(t, k, v) { log.push(`${id}.${k} = ${show(v)}`); t[k] = v; return true; },
      });
    };
    const ids = [];
    this.destination = { id: 'destination', channelCount: numberOfChannels };
    return new Proxy(this, {
      get: (t, k) => (k in t ? t[k] : typeof k === 'string' && k.startsWith('create') ? () => record(k.slice(6), ids) : undefined),
    });
  }
  createBuffer(numberOfChannels, length, sampleRate) { return new FakeAudioBuffer({ numberOfChannels, length, sampleRate }); }
  startRendering() {
    log.push(`render ${this.numberOfChannels}x${this.length}@${this.sampleRate}`);
    return Promise.resolve(new FakeAudioBuffer({ numberOfChannels: this.numberOfChannels, length: this.length, sampleRate: this.sampleRate }));
  }
}

let applyChain;
const source = () => {
  const b = new FakeAudioBuffer({ length: 4800, numberOfChannels: 2, sampleRate: 48000 });
  for (const d of b.data) for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(i / 7) * (1 - i / d.length);
  return b;
};

before(async () => {
  console.error = () => {};
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.OfflineAudioContext = RecordingContext;
  ({ applyChain } = await import('../web/voices.js'));
});

const CASES = {
  'Monster voice': [[{ type: 'voice', voice: 'monster', amount: 2 }]],
  'Walkie-talkie voice': [[{ type: 'voice', voice: 'walkie' }]],
  'the boom layer': [[], { special: 'boom' }],
  'the walkie layer': [[], { special: 'walkie' }],
};

async function graphOf([chain, tweaks]) {
  log.length = 0;
  await applyChain(source(), chain, tweaks);
  return [...log];
}

test('each graph recipe builds the nodes, settings and connections it always has', async () => {
  const now = {};
  for (const [name, chain] of Object.entries(CASES)) now[name] = await graphOf(chain);
  // Fade is plain arithmetic on the samples: its output, as a sum and a few samples.
  const out = await applyChain(source(), [{ type: 'fade', in: 0.3, out: 0.4 }]);
  const d = out.buffer.getChannelData(0);
  now['the Fade step'] = [d.length, Math.round(d.reduce((a, b) => a + Math.abs(b), 0) * 1e4) / 1e4, ...[0, 100, 700, 1440, 2400, 3000, 3500, 4000, 4799].map((i) => Math.round(d[i] * 1e6) / 1e6)];
  if (process.env.GOLDEN) writeFileSync(GOLDEN, `${JSON.stringify(now, null, 1)}\n`);
  assert.deepEqual(now, JSON.parse(readFileSync(GOLDEN, 'utf8')));
});
