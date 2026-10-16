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
        f.timer = setTimeout(() => { down.delete(e.pointerId); onHold(data); }, holdMs);
      }
      down.set(e.pointerId, f);
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
      if (still) onTap(f.data);
    },
    cancel(e) { drop(e.pointerId); },
    // Every finger let go of, as when a second finger turns it into a pinch.
    clear() { for (const id of [...down.keys()]) drop(id); },
    get size() { return down.size; },
  };
}
