// A finger on a pad (Pads and 🧸 Kids) or a key (🎤 Live, Beats with ⌨️
// Keys): it sounds when it lifts where it landed, so a scroll or a swipe
// that starts on one never plays it (Ben, 2026-10-13: "dragging a finger
// should not trigger a sound"; 2026-10-16 for the keys). A mouse and
// the keyboard still play on press; the callers keep that path.
// Each finger is followed on its own, by pointer id, so two thumbs work.

// How far a finger may wander and still be a tap, in CSS pixels.
export const TAP_SLOP = 10;

// A finger or a stylus: the pointers a page scroll starts from.
export const isFinger = (e) => e?.pointerType === 'touch' || e?.pointerType === 'pen';

export const stayedPut = (x0, y0, x, y, slop = TAP_SLOP) => Math.hypot(x - x0, y - y0) <= slop;

// What became of each finger lately, by pointer id, for the silent-tap
// report (tap-watch.js): 'down' once a pad or key took it, then 'tap' once
// its lift played or 'hold' once it held. The newest 32 are kept.
export const lately = new Map();
const note = (id, what) => {
  lately.delete(id);
  lately.set(id, what);
  if (lately.size > 32) lately.delete(lately.keys().next().value);
};

// Follows fingers from down to up. `onTap(data)` runs when a finger lifts
// in place; `onHold(data)` (with `holdMs`) when it stays still that long, and
// then the lift does nothing. A move past the slop, or a pointercancel (the
// browser took the touch for a scroll), drops the finger silently.
// `data` is whatever the caller passed to down(), such as the pad.
export function fingerTaps({ onTap, onHold = null, holdMs = 0 }) {
  const down = new Map();   // pointer id -> {x, y, data, timer}
  const drop = (id) => {
    const f = down.get(id);
    if (!f) return null;
    clearTimeout(f.timer);
    down.delete(id);
    return f;
  };
  return {
    // `hold`: false when this finger must not start a hold (a looping pad,
    // whose lift stops it).
    down(e, data, { hold = true } = {}) {
      drop(e.pointerId);
      const f = { x: e.clientX ?? 0, y: e.clientY ?? 0, data, timer: 0 };
      if (onHold && hold) {
        f.timer = setTimeout(() => { down.delete(e.pointerId); note(e.pointerId, 'hold'); onHold(data); }, holdMs);
      }
      down.set(e.pointerId, f);
      note(e.pointerId, 'down');
    },
    move(e) {
      const f = down.get(e.pointerId);
      if (f && !stayedPut(f.x, f.y, e.clientX ?? f.x, e.clientY ?? f.y)) drop(e.pointerId);
    },
    up(e) {
      const f = down.get(e.pointerId);
      if (!f) return;
      const still = stayedPut(f.x, f.y, e.clientX ?? f.x, e.clientY ?? f.y);
      drop(e.pointerId);
      if (!still) return;
      note(e.pointerId, 'tap');
      onTap(f.data);
    },
    cancel(e) { drop(e.pointerId); },
    // Every finger let go of, as when a second finger turns it into a pinch.
    clear() { for (const id of [...down.keys()]) drop(id); },
    get size() { return down.size; },
  };
}

// Holding a pill (Beats' rows, the keys' grid): how long a press must stay
// put to be a hold, and the watcher that tells a hold from a tap.
export const HOLD_MS = 450;

// Holding a pill: calls `onHold(pill)` after HOLD_MS unless the finger lifts
// or moves first. `match` finds the pill under an event. Returns
// afterHold(), which the click handler asks first: true once for the click
// that ends a hold, so that click isn't also a tap. Used by the Beats rows
// and the keys' grid.
export function pillHolds(root, match, onHold) {
  let timer = 0, start = null, held = false;
  const cancel = () => { clearTimeout(timer); timer = 0; start = null; };
  root.addEventListener('pointerdown', (e) => {
    const pill = match(e.target);
    if (!pill || e.button !== 0) return;
    held = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { timer = 0; held = true; onHold(pill); }, HOLD_MS);
  });
  root.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(type, cancel);
  // A phone's long-press menu would cover the grid.
  root.addEventListener('contextmenu', (e) => { if (match(e.target)) e.preventDefault(); });
  return () => { const was = held; held = false; return was; };
}
