// Edge scrolling for drags on Beats (a row's grip ⠿, ⇆ Move): near the top
// or bottom of the room the page shows between its stuck bars, a drag
// scrolls the page, faster the nearer the edge, so a row can travel the
// whole beat in one drag (Ben, 2026-10-19: a long move took several leaps).
// The room runs from under the beat's stuck control bar (and the slim header
// above it) to the toolbar at the foot, so the zone is never hidden under them.

export const EDGE = 64;          // px from the room's edge where scrolling starts
export const EDGE_MAX = 1200;    // px a second at the edge itself and past it

// How fast the page scrolls, in px a second, for a finger at y in a room
// running from top to bottom; negative scrolls up, 0 holds still. A short
// room keeps its middle third still, so a drag can always rest somewhere.
export function edgeSpeed(y, top, bottom, zone = EDGE, max = EDGE_MAX) {
  const z = Math.max(1, Math.min(zone, (bottom - top) / 3));
  if (y < top + z) return -max * Math.min(1, (top + z - y) / z);
  if (y > bottom - z) return max * Math.min(1, (y - (bottom - z)) / z);
  return 0;
}

// The room on screen now: under the lowest stuck bar of the beat's control
// bar (a bar in the top half of the screen), above the toolbar.
const BARS = '.beat-deck, .beat-go, .beat-run';
export function room(doc = globalThis.document, win = globalThis) {
  const height = win.innerHeight ?? 0;
  let top = 0;
  for (const bar of doc?.querySelectorAll(BARS) ?? []) {
    const b = bar.getBoundingClientRect();
    if (b.height > 0 && b.top < height / 2) top = Math.max(top, b.bottom);
  }
  const foot = doc?.querySelector('.toolbar')?.getBoundingClientRect();
  const bottom = foot?.height > 0 && foot.top > top ? foot.top : height;
  return { top, bottom };
}

// One drag's scrolling. at(y) on each pointer move; while y sits in an edge
// zone each frame scrolls the page and calls moved(), so the dragged thing
// follows the page under a finger that holds still. stop() when it ends.
export function edgeScroller(moved, { win = globalThis, doc = globalThis.document } = {}) {
  let y = null, frame = 0, last = 0, carry = 0;
  const speed = () => {
    if (y === null) return 0;
    const { top, bottom } = room(doc, win);
    return edgeSpeed(y, top, bottom);
  };
  function tick(t) {
    const v = speed();
    if (!v) { frame = 0; return; }
    // Whole pixels only: a slow start would round to nothing each frame.
    carry += v * (last ? Math.min(0.05, (t - last) / 1000) : 1 / 60);
    last = t;
    const px = Math.trunc(carry);
    carry -= px;
    if (px) { win.scrollBy?.(0, px); moved(); }
    frame = win.requestAnimationFrame?.(tick) ?? 0;
  }
  return {
    at(clientY) {
      y = clientY;
      if (!frame && speed()) { last = 0; carry = 0; frame = win.requestAnimationFrame?.(tick) ?? 0; }
    },
    stop() {
      y = null;
      if (frame) win.cancelAnimationFrame?.(frame);
      frame = 0;
    },
  };
}
