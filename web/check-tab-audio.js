// The tab-audio check page (check-tab-audio.html, not linked from the app):
// does this browser hand a page another tab's sound? It shares a tab through
// listen-input.js, the path 🎧 From a song uses, and shows a level meter and
// a line that turns green ("Hearing sound ✓") once real sound arrives, or
// says what went wrong. Copy-protected players (Spotify) are the question.
//
// The page is wired only where its button is, so Node's tests can load this
// file for its pure part (`hear`) and `show` can draw a state for `just look`.

import { sources, startCapture, hasSound } from './listen-input.js';

// Frames with sound before it counts as heard: about a third of a second.
export const HEARD_FRAMES = 8;
// Frames of silence before it says to press play: about two seconds.
export const QUIET_FRAMES = 45;

// What the frames so far add up to: { frames, loud, heard }. `loud` counts
// frames with sound; `heard` stays true once reached.
export function hear(state, frame) {
  const loud = state.loud + (hasSound(frame) ? 1 : 0);
  return { frames: state.frames + 1, loud, heard: state.heard || loud >= HEARD_FRAMES };
}

// The browser's own words for an error from startCapture, for the small
// line under the status: '' when the browser said nothing (no sound came
// with the tab, or this browser has no way: those are listen-input's own).
export function browserSaid(err) {
  const cause = err?.cause;
  if (!cause?.name || cause.name === 'NoAudio' || cause.name === 'Unsupported') return '';
  return `What the browser said (${cause.name}${cause.message ? `: ${cause.message}` : ''})`;
}

const NAMES = { tab: '🗂️ another tab', screen: '🖥️ the whole computer', mic: '🎤 the microphone', file: '📁 a song file' };

const byId = (id) => document.getElementById(id);

// Draws the status line: 'idle', 'asking', 'quiet', 'listening', 'heard',
// 'error' or 'ended', with its words.
export function show(state, text) {
  const status = byId('status');
  status.dataset.state = state;
  status.textContent = text;
}

// The meter, 0..1.
export function showLevel(level) {
  const meter = byId('meter');
  meter.querySelector('.meter-fill').style.setProperty('--level', String(level));
  meter.setAttribute('aria-valuenow', String(Math.round(level * 100)));
}

function wire() {
  const button = byId('share');
  const detail = byId('detail');
  const offered = sources();
  byId('offers').textContent = `This browser offers: ${offered.map((k) => NAMES[k]).join(' · ')}.`
    + (offered.includes('tab') ? '' : " Sharing a tab's sound needs Chrome or Edge on a computer.");

  let capture = null;
  let ears = { frames: 0, loud: 0, heard: false };
  let shown = 0;          // the meter falls back slowly, so a beat is easy to see
  let loudest = 0;
  const setButton = (on) => {
    button.textContent = on ? '■ Stop' : "🗂️ Share a tab's sound";
    button.classList.toggle('stop', on);
  };
  const onFrames = (frame, rate) => {
    ears = hear(ears, frame);
    let peak = 0;
    for (let i = 0; i < frame.length; i++) peak = Math.max(peak, Math.abs(frame[i]));
    loudest = Math.max(loudest, peak);
    const db = loudest > 0 ? `${Math.round(20 * Math.log10(loudest))} dB`.replace('-', '−') : 'silence';
    detail.textContent = `${capture?.label ? `Sharing “${capture.label}” · ` : ''}${rate} Hz · loudest so far ${db}`;
    if (ears.heard) show('heard', 'Hearing sound ✓');
    else if (ears.frames >= QUIET_FRAMES) show('quiet', 'Listening, but no sound yet. Press play in the song’s tab.');
  };
  const onLevel = (level) => {
    shown = Math.max(level, shown - 0.05);
    showLevel(shown);
  };
  const onEnd = (reason) => {
    capture = null;
    setButton(false);
    showLevel(0);
    if (ears.heard) show('heard', 'Heard sound ✓ · stopped');
    else if (reason === 'ended') show('ended', 'Sharing stopped before any sound came.');
    else show('idle', 'Stopped. Share again to check once more.');
  };

  button.addEventListener('click', async () => {
    if (capture) { capture.stop(); return; }
    ears = { frames: 0, loud: 0, heard: false };
    loudest = 0;
    detail.textContent = '';
    show('asking', 'Pick the tab in the browser’s window, with Also share tab audio ticked.');
    button.disabled = true;
    try {
      capture = await startCapture('tab', { onFrames, onLevel, onEnd });
      setButton(true);
      show('listening', 'Listening…');
    } catch (err) {
      show('error', err.message);
      detail.textContent = browserSaid(err);
    } finally {
      button.disabled = false;
    }
  });
}

if (globalThis.document?.getElementById('share')) wire();
