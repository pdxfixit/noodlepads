// The microphone recorder (web/mic.js) with a stand-in MediaRecorder: the
// MIME it picks, what it asks the microphone for, the cap's stop, discard and
// quiet, and the meter. The sound sheet's and 🧸 Kids' use of it is in
// recording.test.mjs and kids.test.mjs. Not tested here: a real microphone
// (iOS Safari, Firefox for Android): "not yet tried on a phone" in state.md.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';

let mic;
const made = [];
const asked = [];
let supported = null;   // the MIME types the stand-in knows

class FakeRecorder {
  constructor(stream, opts) {
    this.stream = stream; this.opts = opts; this.state = 'inactive'; this.mimeType = opts?.mimeType ?? '';
    made.push(this);
  }
  static isTypeSupported(m) { return supported.includes(m); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['x']) }); this.ondataavailable({ data: new Blob([]) }); this.onstop(); }
}

before(async () => {
  console.error = () => {};
  installPage();
  globalThis.MediaRecorder = FakeRecorder;
  window.MediaRecorder = FakeRecorder;
  window.isSecureContext = true;
  globalThis.navigator.mediaDevices = { getUserMedia: async (c) => { asked.push(c); return { id: 'stream' }; } };
  mic = await import('../web/mic.js');
});
beforeEach(() => { made.length = 0; supported = ['audio/webm;codecs=opus', 'audio/mp4']; });

test('one count and one cap for both screens', () => {
  assert.deepEqual(mic.COUNT_IN, { from: 3, ms: 700 });
  assert.equal(mic.MAX_RECORD_SECONDS, 10);
});

test('canRecord needs a secure page, a microphone and MediaRecorder', () => {
  assert.ok(mic.canRecord());
  window.isSecureContext = false;
  assert.ok(!mic.canRecord());
  window.isSecureContext = true;
});

test('it asks for the raw microphone: no echo cancelling, noise suppression or auto-gain', async () => {
  await mic.openMicrophone();
  assert.deepEqual(asked.at(-1), { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
});

test('the first MIME type the browser knows, else none', () => {
  mic.openRecorder({}, () => {});
  assert.deepEqual(made.at(-1).opts, { mimeType: 'audio/webm;codecs=opus' });
  supported = ['audio/mp4'];
  mic.openRecorder({}, () => {});
  assert.deepEqual(made.at(-1).opts, { mimeType: 'audio/mp4' });
  supported = [];
  mic.openRecorder({}, () => {});
  assert.equal(made.at(-1).opts, undefined);
});

test('a recorder the browser cannot make throws, for the screen to say so', () => {
  globalThis.MediaRecorder = class { constructor() { throw new Error('NotSupportedError'); } };
  assert.throws(() => mic.openRecorder({}, () => {}), /NotSupportedError/);
  globalThis.MediaRecorder = FakeRecorder;
});

test('stop keeps the sound (with its type), unless it is thrown away; quiet is passed on', () => {
  const got = [];
  const r = mic.openRecorder({}, (blob, how) => got.push([blob.type, blob.size, how]));
  r.start(() => {});
  r.stop();
  assert.deepEqual(got, [['audio/webm;codecs=opus', 1, { quiet: false }]], 'the empty chunk is left out; the recorder\'s own type is kept');
  const q = mic.openRecorder({}, (blob, how) => got.push(how));
  q.start(() => {});
  q.stop({ quiet: true });
  assert.deepEqual(got.at(-1), { quiet: true });
  const d = mic.openRecorder({}, () => got.push('kept'));
  d.start(() => {});
  d.stop({ discard: true });
  assert.ok(!got.includes('kept'), 'discarded: nothing kept');
});

test('a recorder that never started keeps nothing when stopped (the count-in called off)', () => {
  const got = [];
  const r = mic.openRecorder({}, () => got.push('kept'));
  r.stop({ discard: true });
  r.stop();
  assert.deepEqual(got, []);
});

test('the cap stops it after MAX_RECORD_SECONDS, and stopping first cancels the cap', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let limits = 0;
  const r = mic.openRecorder({}, () => {});
  r.start(() => { limits += 1; });
  t.mock.timers.tick(9999);
  assert.equal(limits, 0);
  t.mock.timers.tick(1);
  assert.equal(limits, 1, 'the screen is told at 10 s');
  const s = mic.openRecorder({}, () => {});
  s.start(() => { limits += 1; });
  s.stop();
  t.mock.timers.tick(20000);
  assert.equal(limits, 1, 'a stopped recording does not hear the cap');
});

test('the meter reads the level falling by the decay, keeps the frame\'s samples, and lets go', () => {
  let level = 0.5;
  const log = [];
  const ctx = {
    createMediaStreamSource: () => ({ connect: (a) => log.push(['connect', a.fftSize]), disconnect: () => log.push(['disconnect']) }),
    createAnalyser: () => ({ fftSize: 0, getFloatTimeDomainData: (buf) => { buf.fill(level); } }),
  };
  const m = mic.openMeter(ctx, {});
  assert.equal(m.scratch.length, 512);
  assert.deepEqual(log, [['connect', 512]]);
  const first = m.level(0.8);
  assert.ok(first > 0);
  level = 0;
  assert.ok(Math.abs(m.level(0.8) - first * 0.8) < 1e-9, 'a quiet frame lets it fall by the decay');
  m.close();
  assert.deepEqual(log.at(-1), ['disconnect']);
});
