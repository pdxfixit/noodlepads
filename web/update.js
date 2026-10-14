// The "🆕 An update for Noodle Pads is ready." bar (Ben, 2026-10-11: yes). A copy
// left open for days keeps running the code it loaded, so a parent once
// tested an old copy without knowing. Now and then this asks version.json
// which version is live and, when it differs from the one this page loaded,
// offers a reload.
//
// It never interrupts: while a sound is recorded, a beat, song or take plays,
// a pad loops, or any sheet or dialog is open (the sound sheet holds its
// edits until Save), it neither checks nor shows the bar, and catches up
// once that is over. Everything else is saved the moment it changes
// (IndexedDB), and cloud sync settles on the next start, so a reload then
// loses nothing. Unlike other notices the bar does not fade: it is an action.
// ✕ hides it until a newer version still. A dev copy ('dev') never asks.

import { versionLabel } from './util.js';

export const CHECK_MS = 10 * 60_000;   // while the page shows
export const MIN_GAP_MS = 60_000;      // focus and showing again ask at most this often
export const TICK_MS = 2_000;          // how often a waiting check or bar looks again for a quiet moment

// What the bar should do. Pure.
//   loaded:    the version this page started with ('dev' for a dev copy)
//   live:      the version version.json names now, or null when unknown
//   busy:      something is recording, playing or open
//   dismissed: the version ✕ was tapped on since the last check, or null
// → 'show' | 'wait' (newer, but not now) | 'none'
const real = (v) => typeof v === 'string' && v !== '' && v !== 'dev';
export function updateOffer({ loaded, live, busy, dismissed }) {
  if (!real(loaded) || !real(live) || live === loaded || live === dismissed) return 'none';
  return busy ? 'wait' : 'show';
}

// The version a version.json response names, or null.
export function liveVersionOf(json) {
  if (!json || typeof json !== 'object') return null;
  const { version } = versionLabel(json);
  return version === 'dev' ? null : version;
}

// Wires the bar. `deps` lets the tests drive it:
//   loaded() the version this page loaded; busy() true while not to disturb;
//   fetch, reload, now, every (setInterval), doc and win (event targets).
export function initUpdate(deps) {
  const {
    bar, reloadBtn, closeBtn,
    loaded, busy,
    fetch = (...a) => globalThis.fetch(...a),
    reload = () => globalThis.location.reload(),
    now = () => Date.now(),
    every = (fn, ms) => setInterval(fn, ms),
    doc = globalThis.document,
    win = globalThis.window,
  } = deps;
  let live = null;        // the newest version seen live
  let dismissed = null;
  let owed = false;       // a check is due
  let lastAsked = now();  // the page just loaded what is live
  let asking = false;

  const visible = () => doc?.visibilityState !== 'hidden';
  const show = () => {
    const offer = updateOffer({ loaded: loaded(), live, busy: busy(), dismissed });
    if (bar) bar.hidden = offer !== 'show';
    return offer;
  };

  async function ask() {
    if (asking) return;
    asking = true;
    owed = false;
    lastAsked = now();
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (res?.ok) live = liveVersionOf(await res.json()) ?? live;
      // ✕ lasts one round: each check (every 10 minutes, or on coming back)
      // offers the newer version again (Ben, 2026-10-11).
      dismissed = null;
    } catch { /* offline, or no version file: try again later */ }
    asking = false;
    show();
  }

  // Asks when one is owed, the page shows, nothing is busy and it has been
  // a while; otherwise brings the bar up to date.
  function tick() {
    if (owed && real(loaded()) && visible() && !busy() && now() - lastAsked >= MIN_GAP_MS) {
      return ask();
    }
    show();
    return undefined;
  }

  const due = () => { owed = true; return tick(); };
  doc?.addEventListener?.('visibilitychange', () => { if (visible()) due(); });
  win?.addEventListener?.('focus', due);
  every(() => { if (visible()) due(); }, CHECK_MS);
  every(() => tick(), TICK_MS);

  reloadBtn?.addEventListener('click', () => {
    if (show() === 'show') reload();   // busy since it showed: it waits, hidden
  });
  closeBtn?.addEventListener('click', () => {
    dismissed = live;
    show();
  });

  return { tick, due, ask, live: () => live };
}
