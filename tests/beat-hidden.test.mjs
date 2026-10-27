// A hidden tab keeps time (audio seat, 2026-10-27): the browser slows a hidden
// page's timers to about one a second, so the engine's 25 ms tick with 0.1 s
// of lookahead dropped the hits that fell between two ticks, for 🥁 Beats,
// 🎼 Song and the groove sample. While the page is hidden a run books further
// ahead (beat-engine.js HIDDEN_LOOKAHEAD). Sound itself needs a browser; this
// moves the audio clock by hand and ticks as a throttled timer would.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRow } from '../web/beat.js';
import { createBeatEngine, HIDDEN_LOOKAHEAD, LOOKAHEAD, lookahead } from '../web/beat-engine.js';

const round = (t) => Math.round(t * 1e9) / 1e9;

function fakeAudio() {
  const t = { now: 0, started: [] };
  const ctx = {
    get currentTime() { return t.now; },
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const src = { playbackRate: { value: 1 }, buffer: null, connect() {}, start(at) { t.started.push(round(at)); }, stop() {} };
      return src;
    },
  };
  t.audio = { master: {}, context: () => ctx, wake: () => ctx, key: (clip) => clip.id, load: async (clip) => ({ buffer: { clip: clip.id }, duration: 0.05 }) };
  return t;
}
const loaded = (id) => ({ clip: { id }, loaded: { buffer: { clip: id }, duration: 0.05 } });
const on = (n) => Array.from({ length: n }, () => true);

const wasDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const page = (state) => Object.defineProperty(globalThis, 'document', { value: { visibilityState: state }, configurable: true, writable: true });
afterEach(() => { if (wasDocument) Object.defineProperty(globalThis, 'document', wasDocument); else delete globalThis.document; });

// A beat of a hit every 0.1 s, ticked once a second for `seconds`, as a hidden tab's timer does.
function playThrottled(seconds) {
  const t = fakeAudio();
  t.now = 10;
  const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
  const beat = { bpm: 150, rows: [cleanRow({ clipId: 'kick', steps: on(16) })] };
  const plain = globalThis.setInterval;
  globalThis.setInterval = () => 1;
  let run;
  try {
    run = engine.play({ beat: () => beat, from: 10, loaded: (id) => loaded(id) });
  } finally {
    globalThis.setInterval = plain;
  }
  run.tick();
  for (let s = 1; s <= seconds; s++) { t.now = 10 + s; run.tick(); }
  const stats = run.stats;
  run.stop();
  return { stats, started: t.started };
}

test('a hidden page books far enough ahead that a once-a-second timer drops no hit', () => {
  page('hidden');
  const { stats, started } = playThrottled(5);
  assert.equal(stats.late, 0, 'none missed');
  // Booked in order, on the grid, every 0.1 s from the start.
  assert.deepEqual(started.slice(0, 4), [10, 10.1, 10.2, 10.3]);
  assert.ok(started.length >= 50, `the first five seconds are all booked (${started.length})`);
});

test('a visible page keeps the short lookahead: the same slow timer would drop hits, so it books no further', () => {
  page('visible');
  const { stats } = playThrottled(5);
  assert.ok(stats.late > 0, 'a visible page needs its fast timer');
  assert.equal(lookahead(), LOOKAHEAD);
});

test('hidden or not, a run that asks for more lookahead keeps its own', () => {
  page('hidden');
  assert.equal(lookahead(), HIDDEN_LOOKAHEAD);
  assert.equal(lookahead(5), 5);
  page('visible');
  assert.equal(lookahead(0.2), 0.2);
  delete globalThis.document;
  assert.equal(lookahead(), LOOKAHEAD, 'no page at all (a test, a worker): the short one');
});

test('🎼 Song\'s planned list is booked ahead the same way while the page is hidden', () => {
  const song = (state) => {
    page(state);
    const t = fakeAudio();
    t.now = 10;
    const engine = createBeatEngine({ audio: t.audio, clipById: (id) => ({ id }) });
    const pattern = { bpm: 100, rows: [cleanRow({ clipId: 'kick', steps: on(16) })] };
    const events = Array.from({ length: 12 }, (_, i) => ({ at: 10 + i * 0.25, pattern, row: 0, loud: false, dest: {}, key: 'a' }));
    const plain = globalThis.setInterval;
    globalThis.setInterval = () => 1;
    let run;
    try { run = engine.play({ list: { events } }); } finally { globalThis.setInterval = plain; }
    for (let s = 0; s <= 3; s++) { t.now = 10 + s; run.tick(); }
    const { stats } = run;
    run.stop();
    return stats;
  };
  assert.equal(song('hidden').late, 0);
  assert.ok(song('visible').late > 0);
});
