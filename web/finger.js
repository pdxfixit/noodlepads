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
// `data` is whatever the caller passed to down(), such as the pad. `holdMs`
// is a number, or a function asked at each press (a hold time the person can
// change, settings.js holdToLoop).
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
        f.timer = setTimeout(() => { down.delete(e.pointerId); note(e.pointerId, 'hold'); onHold(data); }, typeof holdMs === 'function' ? holdMs() : holdMs);
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

// Dragging a thing in ✏️ Layout (the keys' sounds, keys and groups; the
// bands' ⠿ handles and the groups carried onto a block). A mouse or a pen
// drags once it has moved `dragPx`; a finger holds still `holdMs` first, so
// a swipe still scrolls the dialog, and a finger that moves past `slopPx`
// before the hold is a scroll and drops the press.
export const DRAG_PX = 6;
export const DRAG_HOLD_MS = 280;
export const DRAG_SLOP_PX = 10;

// `downOn` hears the press begin; `root` hears it move, lift and cancel.
// `match(e)` says whether a pointerdown starts one: it returns an object
// (what the press carries, such as what is held) or nothing. `start(press,
// x, y, moved)` runs when the drag starts (`moved` is true for a mouse that
// just moved there); returning false refuses it. `move(press, x, y)` runs
// while it drags, and `end(press, drop)` when it lets go (`drop` is false
// for a cancel). `menu`: the selector whose long-press menu is kept off;
// `menuOnlyWhilePressed` keeps it off only during a press. Returns
// {press, cancel()}: the press now, and a way to end it as a cancel.
export function holdToDrag(downOn, root, { match, down, start, move, end, menu = null, menuOnlyWhilePressed = false, holdMs = DRAG_HOLD_MS, dragPx = DRAG_PX, slopPx = DRAG_SLOP_PX }) {
  let press = null;   // {...match's, id, x, y, touch, timer, dragging}
  const begin = (x, y, moved) => {
    press.dragging = true;
    if (start(press, x, y, moved) === false) press = null;
  };
  const finish = (drop) => {
    const p = press;
    press = null;
    clearTimeout(p.timer);
    if (p.dragging) end(p, drop);
  };
  downOn.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || press) return;
    const data = match(e);
    if (!data) return;
    const touch = e.pointerType === 'touch';
    press = { ...data, id: e.pointerId, x: e.clientX, y: e.clientY, touch, dragging: false };
    down?.(press, e);
    if (touch) press.timer = setTimeout(() => { if (press && !press.dragging) begin(press.x, press.y, false); }, holdMs);
  });
  root.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.dragging) { move(press, e.clientX, e.clientY); return; }
    const far = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.touch) { if (far > slopPx) { clearTimeout(press.timer); press = null; } return; }
    if (far > dragPx) begin(e.clientX, e.clientY, true);
  });
  root.addEventListener('pointerup', (e) => { if (press && e.pointerId === press.id) finish(true); });
  root.addEventListener('pointercancel', () => { if (press) finish(false); });
  // While a finger drags, the page must not scroll under it.
  root.addEventListener('touchmove', (e) => { if (press?.dragging) e.preventDefault(); }, { passive: false });
  // A held finger brings up no menu of its own.
  if (menu) root.addEventListener('contextmenu', (e) => { if ((press || !menuOnlyWhilePressed) && e.target.closest?.(menu)) e.preventDefault(); });
  return { get press() { return press; }, cancel() { if (press) finish(false); } };
}
