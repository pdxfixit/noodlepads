// The microphone recorder, written once: what the sound sheet's Record and
// 🧸 Kids' big mic both use. It owns asking for the microphone (raw: no echo
// cancelling, noise suppression or auto-gain, Ben 2026-10-26), whether this
// browser can record, the MediaRecorder with the first MIME type it knows,
// the 10 s cap, the count-in's numbers, and the meter that follows the voice.
// The screens keep their own buttons, words and counting. Not the 🎧 listener
// (listen-input.js), which reads the microphone's samples, not a recording.

import { RAW_MIC } from './audio.js';
import { levelOf } from './meter.js';

export const MAX_RECORD_SECONDS = 10;
// A tapped Record counts 3, 2, 1 (a number each `ms`) before it listens, so
// the start of a word isn't lost to the tap. Tests shorten the beat.
export const COUNT_IN = { from: 3, ms: 700 };

// Can this page record at all? It needs a secure page, a microphone API
// and MediaRecorder.
export const canRecord = () => globalThis.window?.isSecureContext && !!navigator.mediaDevices?.getUserMedia && 'MediaRecorder' in (globalThis.window ?? {});

// Asks for the microphone: the stream, or the browser's refusal (its `name`
// says why: NotAllowedError when blocked).
export const openMicrophone = () => navigator.mediaDevices.getUserMedia(RAW_MIC);

// Lets the microphone go (the browser's red dot goes out).
export const dropStream = (stream) => stream?.getTracks().forEach((t) => t.stop());

const MIMES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];

// A recorder on `stream`; throws when this browser can't make one. It sits
// still until start(onLimit), which listens and calls `onLimit` once
// MAX_RECORD_SECONDS have gone. stop({ discard, quiet }) ends it: the sound
// reaches `onBlob(blob, { quiet })` unless it was thrown away. Whether to
// discard is the recorder's own, so a late stop of a thrown-away one can
// never keep anything. Stopping one that never started keeps nothing.
export function openRecorder(stream, onBlob) {
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  let timer = 0, thrown = false, quiet = false;
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    if (!thrown) onBlob(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }), { quiet });
  };
  return {
    start(onLimit) {
      recorder.start();
      timer = setTimeout(onLimit, MAX_RECORD_SECONDS * 1000);
    },
    stop({ discard = false, quiet: silently = false } = {}) {
      clearTimeout(timer);
      thrown = discard;
      quiet = silently;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}

// A meter on the microphone: level(decay) is how loud the voice is now, 0 to
// 1, falling by `decay` a frame; scratch holds that frame's samples (to see
// whether any hit the top); close() lets go. Throws where there is no audio
// context to feed it.
export function openMeter(ctx, stream) {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const scratch = new Float32Array(512);
  let now = 0;
  return {
    scratch,
    level(decay) {
      now = Math.max(levelOf(analyser, scratch), now * decay);
      return now;
    },
    close() { source.disconnect(); },
  };
}
