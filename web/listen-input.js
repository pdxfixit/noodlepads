// 🎧 From a song's inputs: which ways of listening this device offers, and
// getting mono audio frames from each: another tab or the whole computer
// (getDisplayMedia), the microphone (getUserMedia), or a song file (decoded,
// then fed faster than real time). Only frames leave here; what they mean is
// the listener's job. Nothing is kept or sent: the song stays in the page.
// docs/design/beat-from-a-song.md "What it can listen to".
//
// Errors reject with a plain sentence a grown-up can act on (the original
// error is its `cause`). The rules for those, for which source shows where,
// and for a frame's level are plain functions, so tests run them.
//
// Nothing here touches the page when loaded: an AudioWorklet module could
// import it, and Node's tests do.

import { FRAME, FrameBatcher, mixToMono } from './listen-worklet.js';

export { FRAME };

// The ways to listen, in the order they are offered.
export const KINDS = ['tab', 'screen', 'mic', 'file'];

// A song file: at most this big (an MP3 of a 5-minute song is about 5 MB, a
// WAV of it about 50, so a long WAV needs making an MP3 first), and only its
// first MAX_SONG_SECONDS are heard. The browser decodes the whole file into
// memory first, about 21 MB a minute of stereo: a 5-minute song takes about
// 100 MB. 20 MB, not more (the lead's call, 2026-10-18): a 20 MB MP3 is
// about 20 minutes, some 400 MB decoded, while a 50 MB one was near an hour,
// over 1 GB, enough to crash a phone's tab.
export const MAX_SONG_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_SONG_SECONDS = 15 * 60;
// The rate a file is decoded at: hats reach 15 kHz, and 44.1 kHz keeps them.
export const FILE_RATE = 44100;
// A frame quieter than this (about −60 dB) is silence: a paused tab sends
// exact zeros, a quiet room a little more.
export const SOUND_RMS = 0.001;

// A phone or tablet: they cannot share another tab's sound. iPadOS asks for
// the desktop site, so it says Macintosh but has a touch screen.
export function isPhoneOrTablet(nav) {
  if (nav?.userAgentData?.mobile) return true;
  const ua = String(nav?.userAgent ?? '');
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1;
}

// Chrome, Edge and the other Chromium browsers: the only ones that hand a
// page a tab's sound. Firefox and Safari share the picture with no sound.
export function isChromium(nav) {
  const brands = nav?.userAgentData?.brands;
  if (Array.isArray(brands) && brands.length) return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b?.brand ?? ''));
  const ua = String(nav?.userAgent ?? '');
  return /\b(?:Chrome|Chromium|HeadlessChrome|Edg)\//.test(ua) && !/Firefox|FxiOS/.test(ua);
}

export function isWindows(nav) {
  const platform = nav?.userAgentData?.platform;
  if (platform) return platform === 'Windows';
  return /Windows NT/.test(String(nav?.userAgent ?? ''));
}

// The kinds this device offers, in KINDS order. 'tab' wants a Chromium
// browser on a computer; 'screen' also wants Windows, the one place sharing
// the screen brings the computer's sound for sure (macOS only on recent
// versions, so not yet). 'mic' wants getUserMedia, which a page served over
// plain http on a home network does not get. 'file' works everywhere.
export function sources(nav = globalThis.navigator) {
  const md = nav?.mediaDevices;
  const out = [];
  const desk = typeof md?.getDisplayMedia === 'function' && !isPhoneOrTablet(nav) && isChromium(nav);
  if (desk) out.push('tab');
  if (desk && isWindows(nav)) out.push('screen');
  if (typeof md?.getUserMedia === 'function') out.push('mic');
  out.push('file');
  return out;
}

const rmsOf = (frame) => {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return frame.length ? Math.sqrt(sum / frame.length) : 0;
};

// How loud a frame is, 0..1 on a meter: −60 dB and under is 0, full scale 1.
export function levelOf(frame) {
  const rms = rmsOf(frame);
  if (rms <= 0) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(rms) + 60) / 60));
}

// Whether a frame holds any sound at all.
export function hasSound(frame) {
  return rmsOf(frame) > SOUND_RMS;
}

const NO_TAB_SOUND = 'No sound came with that tab: share it again and leave Also share tab audio ticked.';

// The sentence for an error starting `kind`. `err.name` is the browser's
// (NotAllowedError…), or our own: 'NoAudio' (shared, but no sound came with
// it), 'Unsupported' (this browser has no way), 'WorkletFailed'.
export function captureError(kind, err) {
  const name = err?.name ?? '';
  const why = String(err?.message ?? '');
  const shared = kind === 'tab' || kind === 'screen';
  if (name === 'NoAudio') {
    if (kind === 'screen') return 'No sound came with the screen: share Entire screen again and tick Also share system audio.';
    if (kind === 'mic') return 'The microphone sent no sound. Check it is plugged in, then try again.';
    return NO_TAB_SOUND;
  }
  if (name === 'Unsupported') {
    return shared ? "This browser can't share another tab's sound. Use Chrome or Edge on a computer."
      : "This browser can't use the microphone on this page. Try a song file instead.";
  }
  if (name === 'WorkletFailed') return "Listening couldn't start in this browser. Update it, or use Chrome or Edge.";
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    // The computer's own settings say no (a Mac's screen recording permission).
    if (shared && /system/i.test(why)) {
      return "This computer's settings stop the browser sharing the screen. On a Mac: System Settings, Privacy & Security, Screen & System Audio Recording, turn on the browser, then try again.";
    }
    if (kind === 'mic' && /system/i.test(why)) {
      return "This computer's settings stop the browser using the microphone. On a Mac: System Settings, Privacy & Security, Microphone, turn on the browser, then try again.";
    }
    if (kind === 'tab') return 'Nothing was shared. Try again: pick the tab playing the song, and leave Also share tab audio ticked.';
    if (kind === 'screen') return 'Nothing was shared. Try again: pick Entire screen, and tick Also share system audio.';
    return "The microphone is blocked. Allow it for this site in the browser's settings (the icon left of the address), then try again.";
  }
  if (name === 'NotFoundError') {
    return kind === 'mic' ? 'No microphone was found. Plug one in, or pick another way to listen.' : 'There was nothing to share. Try again.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return kind === 'mic' ? 'The microphone is busy in another app. Close it there, then try again.'
      : "The browser couldn't capture that. Try again, or pick another tab.";
  }
  return "Listening couldn't start. Try again.";
}

const fail = (kind, err) => new Error(captureError(kind, err), { cause: err });
const named = (name, message = name) => Object.assign(new Error(message), { name });

// What to ask the browser for. The browser's own clean-up is off: echo
// cancelling and noise suppression would eat the hats. A tab hides the
// screens and this tab from the picker; the screen asks for system audio.
export function captureRequest(kind) {
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (kind === 'mic') return { audio };
  const tab = kind === 'tab';
  return {
    video: { displaySurface: tab ? 'browser' : 'monitor' },
    audio: { ...audio, suppressLocalAudioPlayback: false },
    preferCurrentTab: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: tab ? 'exclude' : 'include',
    monitorTypeSurfaces: tab ? 'exclude' : 'include',
  };
}

// The worklet is added once per audio context.
const workletIn = new WeakSet();

// Starts listening to 'tab', 'screen' or 'mic'. Calls onFrames(Float32Array
// mono, sampleRate) about 20 times a second, onLevel(0..1) with each frame,
// and onEnd(reason) once: 'stopped' (stop() was called) or 'ended' (sharing
// was stopped in the browser, the tab closed, the microphone unplugged).
// `context` is an AudioContext to use (the app's, already unlocked by a tap);
// without one it makes its own and closes it at the end. `env` stands in
// for the browser in tests. Resolves to { stop(), label, sampleRate }.
export async function startCapture(kind, { onFrames, onLevel, onEnd, context } = {}, env = {}) {
  const g = globalThis;
  const nav = env.navigator ?? g.navigator;
  const md = nav?.mediaDevices;
  const shared = kind === 'tab' || kind === 'screen';
  if (!shared && kind !== 'mic') throw new Error(`startCapture: no kind ${kind}`);
  const ask = shared ? md?.getDisplayMedia : md?.getUserMedia;
  if (typeof ask !== 'function') throw fail(kind, named('Unsupported'));

  // Made and woken now, while the tap that asked is still fresh, so it may
  // start: after the browser's question the tap is used up, and a resume
  // then can wait for another tap that never comes (iOS Safari). Not waited
  // for: a context still asleep only means the frames start a little later.
  const Ctx = env.AudioContext ?? g.AudioContext ?? g.webkitAudioContext;
  if (!context && typeof Ctx !== 'function') throw fail(kind, named('WorkletFailed', 'no AudioContext'));
  const own = !context;
  const ctx = context ?? new Ctx({ latencyHint: 'playback' });
  if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
  const closeOwn = () => { if (own) ctx.close?.().catch?.(() => {}); };

  let stream;
  try {
    stream = await ask.call(md, captureRequest(kind));
  } catch (err) {
    closeOwn();
    throw fail(kind, err);
  }
  // Only the sound is wanted: the picture stops at once.
  for (const t of stream.getVideoTracks?.() ?? []) t.stop();
  const track = stream.getAudioTracks?.()[0];
  if (!track || track.readyState === 'ended') {
    for (const t of stream.getTracks?.() ?? []) t.stop();
    closeOwn();
    throw fail(kind, named('NoAudio'));
  }

  let source;
  let node;
  try {
    if (!workletIn.has(ctx)) {
      await ctx.audioWorklet.addModule(new URL('./listen-worklet.js', import.meta.url).href);
      workletIn.add(ctx);
    }
    const Node = env.AudioWorkletNode ?? g.AudioWorkletNode;
    source = ctx.createMediaStreamSource(stream);
    node = new Node(ctx, 'listen-frames', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  } catch (err) {
    track.stop();
    closeOwn();
    throw fail(kind, named('WorkletFailed', err?.message));
  }

  let done = false;
  const finish = (reason) => {
    if (done) return;
    done = true;
    node.port.onmessage = null;
    node.port.postMessage?.('stop');
    try { source.disconnect(); node.disconnect(); } catch { /* already apart */ }
    for (const t of stream.getTracks?.() ?? [track]) t.stop();
    closeOwn();
    onEnd?.(reason);
  };
  node.port.onmessage = (e) => {
    if (done || !(e.data instanceof Float32Array)) return;
    onFrames?.(e.data, ctx.sampleRate);
    onLevel?.(levelOf(e.data));
  };
  track.addEventListener?.('ended', () => finish('ended'), { once: true });
  source.connect(node);
  node.connect(ctx.destination);   // silent: the node writes nothing, but is kept running
  return { stop: () => finish('stopped'), label: track.label ?? '', sampleRate: ctx.sampleRate };
}

// The sentence for a song file over the cap.
export function fileTooBig(bytes) {
  return `That file is ${(bytes / 1048576).toFixed(1)} MB. Choose one under ${MAX_SONG_FILE_BYTES / 1048576} MB.`;
}

const NOT_SOUND = "That file has no sound this browser can read. Try an MP3, M4A or WAV, or a video file.";

function decodeFile(bytes) {
  const Off = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
  return new Off(1, 1, FILE_RATE).decodeAudioData(bytes);
}

const breath = () => new Promise((r) => setTimeout(r, 0));

// Decodes an audio or video file and feeds it to onFrames(Float32Array
// mono, sampleRate) in frames of FRAME, as fast as the page allows: it lets
// the page draw after each 32 frames (1.5 s of song) and calls
// onProgress(0..1) then. `signal` (an AbortSignal) stops it early. Resolves
// to { seconds, sampleRate, cut } (cut: longer than MAX_SONG_SECONDS, so
// only its start was heard); rejects with a plain sentence for a file too
// big or with no sound. `decode` stands in for the browser in tests.
export async function readFile(file, { onFrames, onProgress, signal, decode = decodeFile } = {}) {
  if (!file || typeof file.size !== 'number') throw new Error('Choose a song file first.');
  if (file.size > MAX_SONG_FILE_BYTES) throw new Error(fileTooBig(file.size));
  let buffer;
  try {
    buffer = await decode(await file.arrayBuffer());
  } catch (err) {
    throw new Error(NOT_SOUND, { cause: err });
  }
  if (!buffer?.length || !buffer.numberOfChannels) throw new Error('That file has no sound in it.');
  const rate = buffer.sampleRate;
  const total = Math.min(buffer.length, Math.floor(MAX_SONG_SECONDS * rate));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const batcher = new FrameBatcher(FRAME, (f) => onFrames?.(f, rate));
  const step = FRAME * 32;
  for (let at = 0; at < total; at += step) {
    if (signal?.aborted) return { seconds: at / rate, sampleRate: rate, cut: false, stopped: true };
    const end = Math.min(total, at + step);
    batcher.push(mixToMono(channels.map((ch) => ch.subarray(at, end))));
    onProgress?.(end / total);
    await breath();
  }
  batcher.flush();
  return { seconds: total / rate, sampleRate: rate, cut: buffer.length > total };
}
