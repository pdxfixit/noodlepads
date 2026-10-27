// Following the playhead in a box that scrolls sideways: Beats' rows, the
// 🎹 piano roll and 🎼 Song's lanes (Ben, 2026-10-25). While something plays
// the box turns a page once the playhead leaves what shows beside the box's
// stuck heads, the playhead to the left edge. A scroll by the kid stops that
// until the next play: the box stays where they put it.

// Where to scroll for a playhead running from `left` to `right` (px from the
// box's left edge, as it shows now) in a box `view` px wide whose first
// `head` px are covered by stuck heads: null while it is in sight, else the
// new scrollLeft (at least 0) that puts `start` (the start of its beat, at or
// before `left`) `margin` px after the heads.
export function pageTurn({ left, right, view, head, scroll, start = left, margin = 6 }) {
  if (left >= head && right <= view) return null;
  const to = Math.max(0, Math.round(scroll + start - head - margin));
  return Math.abs(to - scroll) < 1 ? null : to;
}

// One box's following. start() as the play starts, stop() as it stops;
// to(x) scrolls there while following. The box's own scroll events tell its
// scrolls from the kid's.
export function follower(box) {
  let on = false;
  let mine = null;   // where to() last scrolled the box, so that scroll isn't taken for the kid's
  box?.addEventListener('scroll', () => {
    if (mine !== null && Math.abs(box.scrollLeft - mine) < 2) { mine = null; return; }
    mine = null;
    on = false;
  }, { passive: true });
  return {
    start() { on = true; },
    stop() { on = false; },
    get on() { return on; },
    to(x) {
      if (!on || x == null) return;
      box.scrollLeft = x;
      mine = box.scrollLeft;   // as far as it could go
    },
  };
}

// Where the box should scroll to keep `target` (the pill being heard) in
// sight, beside `head` px of stuck heads, or null: it reads the page and
// writes nothing, so a caller can read first and scroll after its own writes.
// A page turn puts `from` (its beat's first pill) at the left.
export function viewTurn(follow, box, target, head, from = target) {
  if (!follow.on || !box?.clientWidth || !target) return null;
  const b = box.getBoundingClientRect(), t = target.getBoundingClientRect();
  const start = (from ?? target).getBoundingClientRect().left - b.left;
  return pageTurn({ left: t.left - b.left, right: t.right - b.left, view: b.width || box.clientWidth, head, scroll: box.scrollLeft, start });
}

// Keeps `target` in sight in `box` (viewTurn, then the scroll).
export function keepInView(follow, box, target, head, from = target) {
  follow.to(viewTurn(follow, box, target, head, from));
}
