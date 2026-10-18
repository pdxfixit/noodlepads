// 🎧 From a song's inputs (web/listen-input.js, web/listen-worklet.js).
// Node has no capture, so the browser is stood in
// for: navigators for which sources a device offers, a fake stream and audio
// context for startCapture's wiring, a fake decoder for song files, and a
// fake worklet scope for the processor. Real capture (does Chrome hand over
// Spotify's tab?) was proven by a check page, since deleted (Ben, 2026-10-18).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  sources, isPhoneOrTablet, levelOf, hasSound, captureError, captureRequest, startCapture,
  readFile, fileTooBig, MAX_SONG_FILE_BYTES, MAX_SONG_SECONDS, FRAME,
} from '../web/listen-input.js';
import { mixToMono, FrameBatcher } from '../web/listen-worklet.js';

const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
const all = { getDisplayMedia() {}, getUserMedia() {} };
const nav = (userAgent, extra = {}) => ({ userAgent, maxTouchPoints: 0, mediaDevices: all, ...extra });

test('sources: a tab on Chromium computers, the screen on Windows, the mic where it can be asked for, a file everywhere', () => {
  const cases = [
    [nav(UA.winChrome), ['tab', 'screen', 'mic', 'file']],
    [nav(UA.winEdge), ['tab', 'screen', 'mic', 'file']],
    [nav(UA.macChrome), ['tab', 'mic', 'file']],
    [nav(UA.linuxChrome), ['tab', 'mic', 'file']],
    [nav(UA.cros), ['tab', 'mic', 'file']],
    // Firefox and Safari share a tab's picture with no sound.
    [nav(UA.winFirefox), ['mic', 'file']],
    [nav(UA.macSafari), ['mic', 'file']],
    // Phones and tablets: 🎤 and 📁 only, even where getDisplayMedia exists.
    [nav(UA.android), ['mic', 'file']],
    [nav(UA.androidTablet), ['mic', 'file']],
    [nav(UA.iphone, { mediaDevices: { getUserMedia() {} } }), ['mic', 'file']],
    // iPadOS asking for the desktop site says Macintosh, but has touch.
    [nav(UA.macSafari, { maxTouchPoints: 5 }), ['mic', 'file']],
    // Client hints win over the user agent string.
    [nav(UA.linuxChrome, { userAgentData: { mobile: false, platform: 'Windows', brands: [{ brand: 'Chromium' }] } }), ['tab', 'screen', 'mic', 'file']],
    [nav(UA.winChrome, { userAgentData: { mobile: true, platform: 'Android', brands: [{ brand: 'Chromium' }] } }), ['mic', 'file']],
    // A Chromium browser with no getDisplayMedia (an old one).
    [nav(UA.winChrome, { mediaDevices: { getUserMedia() {} } }), ['mic', 'file']],
    // Plain http on a home network: no mediaDevices at all.
    [nav(UA.android, { mediaDevices: undefined }), ['file']],
    [undefined, ['file']],
  ];
  for (const [n, want] of cases) assert.deepEqual(sources(n), want, n?.userAgent ?? 'no navigator');
  assert.equal(isPhoneOrTablet(nav(UA.winChrome)), false);
  assert.equal(isPhoneOrTablet(nav(UA.iphone)), true);
});

test('mixToMono averages the channels; one channel is copied', () => {
  const l = Float32Array.from([1, 0.5, -1, 0]);
  const r = Float32Array.from([0, 0.5, 1, 0.25]);
  assert.deepEqual([...mixToMono([l, r])], [0.5, 0.5, 0, 0.125]);
  assert.deepEqual([...mixToMono([l])], [...l]);
  const out = new Float32Array(4);
  assert.equal(mixToMono([l, r], out), out, 'fills the array given');
  assert.deepEqual([...mixToMono([])], []);
});

test('FrameBatcher makes whole frames from any chunk sizes, and flush pads the rest with silence', () => {
  const frames = [];
  const b = new FrameBatcher(8, (f) => frames.push(f));
  let n = 0;
  for (const size of [3, 3, 3, 1, 5, 2]) b.push(Float32Array.from({ length: size }, () => ++n));   // 17 samples
  assert.equal(frames.length, 2);
  assert.deepEqual([...frames[0]], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...frames[1]], [9, 10, 11, 12, 13, 14, 15, 16]);
  assert.notEqual(frames[0].buffer, frames[1].buffer, 'each frame is its own, so it can be transferred');
  b.flush();
  assert.deepEqual([...frames[2]], [17, 0, 0, 0, 0, 0, 0, 0]);
  b.flush();
  assert.equal(frames.length, 3, 'nothing left: nothing more');
  // One big chunk makes several frames at once.
  b.push(new Float32Array(20));
  assert.equal(frames.length, 5);
});

test('levelOf: silence is 0, full scale is 1, −30 dB is half way; hasSound ignores digital silence', () => {
  assert.equal(levelOf(new Float32Array(2048)), 0);
  assert.equal(levelOf(new Float32Array(2048).fill(1)), 1);
  assert.ok(Math.abs(levelOf(new Float32Array(2048).fill(10 ** (-30 / 20))) - 0.5) < 1e-6);
  assert.equal(levelOf(new Float32Array(2048).fill(1e-5)), 0, 'under −60 dB');
  assert.equal(levelOf(new Float32Array(0)), 0);
  assert.equal(hasSound(new Float32Array(2048)), false);
  assert.equal(hasSound(new Float32Array(2048).fill(0.0001)), false, 'a hiss under −60 dB');
  assert.equal(hasSound(new Float32Array(2048).fill(0.01)), true);
});

test('captureError: a sentence a grown-up can act on, for every way it fails', () => {
  const err = (name, message = '') => Object.assign(new Error(message), { name });
  assert.equal(captureError('tab', err('NoAudio')), 'No sound came with that tab: share it again and leave Also share tab audio ticked.');
  assert.match(captureError('screen', err('NoAudio')), /Also share system audio/);
  assert.match(captureError('tab', err('NotAllowedError', 'Permission denied')), /Nothing was shared.*Also share tab audio/);
  assert.match(captureError('tab', err('NotAllowedError', 'Permission denied by system')), /Privacy & Security/);
  assert.match(captureError('mic', err('NotAllowedError')), /microphone is blocked/);
  assert.match(captureError('mic', err('NotAllowedError', 'Permission denied by system')), /Privacy & Security, Microphone/);
  assert.match(captureError('mic', err('NotFoundError')), /No microphone/);
  assert.match(captureError('mic', err('NotReadableError')), /busy in another app/);
  assert.match(captureError('tab', err('NotReadableError')), /couldn't capture/);
  assert.match(captureError('tab', err('Unsupported')), /Chrome or Edge on a computer/);
  assert.match(captureError('mic', err('Unsupported')), /song file/);
  assert.match(captureError('tab', err('WorkletFailed')), /Update it/);
  assert.equal(captureError('tab', err('TypeError', 'x')), "Listening couldn't start. Try again.");
  assert.equal(captureError('tab', undefined), "Listening couldn't start. Try again.");
});

test('captureRequest: no echo cancelling; a tab hides the screens, the screen asks for system audio', () => {
  const tab = captureRequest('tab');
  assert.deepEqual(tab.video, { displaySurface: 'browser' });
  assert.equal(tab.audio.echoCancellation, false);
  assert.equal(tab.audio.noiseSuppression, false);
  assert.equal(tab.audio.suppressLocalAudioPlayback, false, 'the song keeps playing out loud');
  assert.equal(tab.selfBrowserSurface, 'exclude');
  assert.equal(tab.systemAudio, 'exclude');
  assert.equal(tab.monitorTypeSurfaces, 'exclude');
  const screen = captureRequest('screen');
  assert.equal(screen.systemAudio, 'include');
  assert.equal(screen.video.displaySurface, 'monitor');
  assert.deepEqual(captureRequest('mic'), { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
});

// A stand-in browser for startCapture: a stream of fake tracks, an audio
// context that records what is made, and an AudioWorkletNode with a port.
function fakeBrowser({ audio = true, video = true, refuse = null, kind = 'display' } = {}) {
  const track = (k) => {
    const t = { kind: k, label: k === 'audio' ? 'Tab audio' : 'Tab', readyState: 'live', stopped: false, listeners: {} };
    t.stop = () => { t.stopped = true; t.readyState = 'ended'; };
    t.addEventListener = (type, fn) => { t.listeners[type] = fn; };
    return t;
  };
  const tracks = [...(video ? [track('video')] : []), ...(audio ? [track('audio')] : [])];
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  };
  const b = { tracks, asked: [], modules: [], nodes: [], contexts: [] };
  const ask = async (constraints) => {
    b.asked.push(constraints);
    if (refuse) throw Object.assign(new Error(refuse.message ?? ''), { name: refuse.name });
    return stream;
  };
  b.navigator = { mediaDevices: kind === 'display' ? { getDisplayMedia: ask, getUserMedia: ask } : { getUserMedia: ask } };
  b.AudioContext = class {
    constructor(opts) {
      this.opts = opts; this.state = 'running'; this.sampleRate = 48000; this.closed = false; this.destination = { name: 'speakers' };
      this.audioWorklet = { addModule: async (url) => { b.modules.push(url); } };
      b.contexts.push(this);
    }
    createMediaStreamSource(s) { return { stream: s, to: null, connect(n) { this.to = n; }, disconnect() { this.to = null; } }; }
    async close() { this.closed = true; }
  };
  b.AudioWorkletNode = class {
    constructor(ctx, name, opts) {
      Object.assign(this, { ctx, name, opts, to: null, posted: [] });
      this.port = { onmessage: null, postMessage: (m) => this.posted.push(m) };
      b.nodes.push(this);
    }
    connect(n) { this.to = n; }
    disconnect() { this.to = null; }
  };
  return b;
}

test('startCapture tab: drops the picture at once, feeds frames and levels, and stop() ends it once', async () => {
  const b = fakeBrowser();
  const got = { frames: [], levels: [], ends: [] };
  const cap = await startCapture('tab', {
    onFrames: (f, rate) => got.frames.push([f, rate]),
    onLevel: (l) => got.levels.push(l),
    onEnd: (r) => got.ends.push(r),
  }, b);
  assert.deepEqual(b.asked, [captureRequest('tab')]);
  assert.equal(b.tracks[0].stopped, true, 'the video track stops at once');
  assert.equal(b.tracks[1].stopped, false, 'the sound keeps coming');
  assert.match(b.modules[0], /\/listen-worklet\.js$/);
  const node = b.nodes[0];
  assert.equal(node.name, 'listen-frames');
  assert.equal(node.to, b.contexts[0].destination, 'wired on, so the browser runs it');
  assert.equal(cap.sampleRate, 48000);
  assert.equal(cap.label, 'Tab audio');

  const frame = new Float32Array(FRAME).fill(0.5);
  node.port.onmessage({ data: frame });
  node.port.onmessage({ data: 'not a frame' });
  assert.equal(got.frames.length, 1);
  assert.equal(got.frames[0][0], frame);
  assert.equal(got.frames[0][1], 48000);
  assert.deepEqual(got.levels, [levelOf(frame)]);

  cap.stop();
  cap.stop();
  assert.deepEqual(got.ends, ['stopped'], 'onEnd once');
  assert.equal(b.tracks[1].stopped, true);
  assert.equal(b.contexts[0].closed, true, 'its own context is closed');
  assert.deepEqual(node.posted, ['stop']);
  node.port.onmessage?.({ data: frame });
  assert.equal(got.frames.length, 1, 'no frames after the end');
});

test('startCapture: sharing stopped in the browser ends it as "ended"; a context passed in stays open', async () => {
  const b = fakeBrowser();
  const ends = [];
  const ctx = new b.AudioContext();
  await startCapture('tab', { onEnd: (r) => ends.push(r), context: ctx }, b);
  b.tracks[1].listeners.ended();
  assert.deepEqual(ends, ['ended']);
  assert.equal(ctx.closed, false, "the app's context is the app's");
  // The worklet goes into a context once.
  const b2 = fakeBrowser();
  b2.modules = b.modules;
  await startCapture('tab', { context: ctx }, b2);
  assert.equal(b.modules.length, 1);
});

test('startCapture: a tab shared with no sound, a refusal, or no way at all reject with a plain sentence', async () => {
  const noSound = fakeBrowser({ audio: false });
  await assert.rejects(startCapture('tab', {}, noSound), { message: 'No sound came with that tab: share it again and leave Also share tab audio ticked.' });
  assert.ok(noSound.tracks.every((t) => t.stopped), 'the picture stops too');
  assert.equal(noSound.contexts[0].closed, true);
  assert.equal(noSound.nodes.length, 0);

  const refused = fakeBrowser({ refuse: { name: 'NotAllowedError', message: 'Permission denied' } });
  const err = await startCapture('tab', {}, refused).catch((e) => e);
  assert.match(err.message, /Nothing was shared/);
  assert.equal(err.cause.name, 'NotAllowedError', 'the browser’s own error is kept');
  assert.equal(refused.contexts[0].closed, true);

  const phone = fakeBrowser({ kind: 'mic-only' });
  await assert.rejects(startCapture('tab', {}, phone), /Chrome or Edge on a computer/);
  await assert.rejects(startCapture('song', {}, phone), /no kind song/);
});

test('startCapture: a sleeping context is woken before the browser asks, while the tap is fresh, and never waited on', async () => {
  const b = fakeBrowser();
  const order = [];
  const ctx = new b.AudioContext();
  ctx.state = 'suspended';
  // A resume that never settles: iOS Safari's, once the tap is used up.
  ctx.resume = () => { order.push('resume'); return new Promise(() => {}); };
  const ask = b.navigator.mediaDevices.getDisplayMedia;
  b.navigator.mediaDevices.getDisplayMedia = (c) => { order.push('ask'); return ask(c); };
  const cap = await startCapture('tab', { context: ctx }, b);
  assert.deepEqual(order, ['resume', 'ask']);
  cap.stop();

  const none = fakeBrowser();
  none.AudioContext = undefined;
  const saved = globalThis.AudioContext;
  delete globalThis.AudioContext;
  try {
    await assert.rejects(startCapture('tab', {}, none), /Listening couldn't start in this browser/);
  } finally {
    if (saved) globalThis.AudioContext = saved;
  }
  assert.equal(none.asked.length, 0, 'nothing is shared when it could not be heard');
});

test('startCapture mic: asks getUserMedia for the plain sound', async () => {
  const b = fakeBrowser({ video: false, kind: 'mic-only' });
  const cap = await startCapture('mic', {}, b);
  assert.deepEqual(b.asked, [captureRequest('mic')]);
  cap.stop();
  assert.equal(b.tracks[0].stopped, true);
});

// A stand-in decoded file: `channels` arrays at `rate`.
const decoded = (channels, rate) => ({
  length: channels[0].length, numberOfChannels: channels.length, sampleRate: rate,
  getChannelData: (c) => channels[c],
});
const fakeFile = (size) => ({ size, arrayBuffer: async () => new ArrayBuffer(8) });

test('readFile: decodes, mixes to mono and feeds whole frames, with progress to the end', async () => {
  const n = FRAME * 40 + 100;   // more than one step of 32 frames, and a bit
  const l = Float32Array.from({ length: n }, (_, i) => (i % 2 ? 1 : 0));
  const r = new Float32Array(n);
  const frames = [];
  const progress = [];
  const got = await readFile(fakeFile(1000), {
    decode: async () => decoded([l, r], 44100),
    onFrames: (f, rate) => frames.push([f, rate]),
    onProgress: (p) => progress.push(p),
  });
  assert.equal(frames.length, 41, '40 whole frames and the padded rest');
  assert.ok(frames.every(([f, rate]) => f.length === FRAME && rate === 44100));
  assert.deepEqual([...frames[0][0].subarray(0, 4)], [0, 0.5, 0, 0.5], 'the two channels mixed');
  assert.equal(frames[40][0][100], 0, 'the rest is silence');
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.length >= 2);
  assert.deepEqual(got, { seconds: n / 44100, sampleRate: 44100, cut: false });
});

test('readFile: only the first MAX_SONG_SECONDS are heard; a signal stops it early', async () => {
  const rate = 100;   // a tiny rate keeps a long song small in a test
  const long = new Float32Array(MAX_SONG_SECONDS * rate + 5000);
  let fed = 0;
  const got = await readFile(fakeFile(10), { decode: async () => decoded([long], rate), onFrames: (f) => { fed += f.length; } });
  assert.equal(got.cut, true);
  assert.equal(got.seconds, MAX_SONG_SECONDS);
  assert.equal(fed, Math.ceil((MAX_SONG_SECONDS * rate) / FRAME) * FRAME);

  const stop = new AbortController();
  let frames = 0;
  const early = await readFile(fakeFile(10), {
    decode: async () => decoded([new Float32Array(FRAME * 100)], 44100),
    onFrames: () => { frames++; },
    onProgress: () => stop.abort(),
    signal: stop.signal,
  });
  assert.equal(early.stopped, true);
  assert.equal(frames, 32, 'one step, then it stops');
});

test('readFile: a file over the cap is refused before it is read; one with no sound says so', async () => {
  let read = false;
  const big = { size: MAX_SONG_FILE_BYTES + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(1); } };
  await assert.rejects(readFile(big, { decode: async () => decoded([new Float32Array(1)], 44100) }), { message: fileTooBig(big.size) });
  assert.equal(read, false);
  assert.equal(fileTooBig(72.4 * 1048576), 'That file is 72.4 MB. Choose one under 20 MB.');
  // 20 MB (the lead's call, 2026-10-18): a 50 MB MP3 decoded is over 1 GB, enough to crash a phone's tab.
  assert.equal(MAX_SONG_FILE_BYTES, 20 * 1024 * 1024);
  await assert.rejects(readFile({ size: 21 * 1048576, arrayBuffer: async () => new ArrayBuffer(1) }, { decode: async () => decoded([new Float32Array(1)], 44100) }), /21\.0 MB/);
  await assert.rejects(readFile(fakeFile(10), { decode: async () => { throw new Error('EncodingError'); } }), /no sound this browser can read/);
  await assert.rejects(readFile(fakeFile(10), { decode: async () => decoded([new Float32Array(0)], 44100) }), /no sound in it/);
  await assert.rejects(readFile(null), /Choose a song file/);
});

test('the worklet: posts one mono frame per FRAME samples, transferred, and stops when told', async () => {
  const posted = [];
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = { onmessage: null, postMessage: (m, t) => posted.push([m, t]) }; } };
  let made;
  globalThis.registerProcessor = (name, cls) => { made = [name, cls]; };
  try {
    await import('../web/listen-worklet.js?in-a-worklet');
  } finally {
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.registerProcessor;
  }
  assert.equal(made[0], 'listen-frames');
  const p = new made[1]();
  const quantum = [new Float32Array(128).fill(1), new Float32Array(128)];
  for (let i = 0; i < FRAME / 128; i++) assert.equal(p.process([quantum]), true);
  assert.equal(posted.length, 1);
  const [frame, transfer] = posted[0];
  assert.equal(frame.length, FRAME);
  assert.equal(frame[0], 0.5);
  assert.deepEqual(transfer, [frame.buffer]);
  assert.equal(p.process([[]]), true, 'no input yet: waits');
  p.port.onmessage({ data: 'stop' });
  assert.equal(p.process([quantum]), false);
});
