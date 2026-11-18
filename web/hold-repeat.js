// Hold to repeat (Ben, 2026-11-18: "yes, and add it in a couple of other
// spots too"): a − or + held down keeps stepping, as a phone's volume keys
// do. A tap is one step, as before. Held past HOLD_MS it steps, slowly at
// first (SLOW_STEPS steps SLOW_MS apart, so a small hand can stop on the one
// it wants), then every EVERY_MS until let go. Each step is the button's own
// click(), so whatever listens for its click (often a listener on a parent)
// handles a hold too.
//
// One hold is one change (the council, 2026-11-18): while a hold's step runs,
// holdStage() says 'first' or 'more', so a screen keeps one ↩️ Undo step and
// saves once; when the finger lifts the button sends `holdend` (it bubbles),
// for the screen to save then. A screen that does nothing special still works:
// each step is then its own change.
//
// A step may redraw the button (the sound sheet's Layers redraw on every
// change), so the hold remembers where the button sits (its place under the
// nearest element with an id) and keeps pressing whatever button sits there
// now, while it is the same kind of button. A hold stops when the finger lifts
// or slides off (SLIDE_PX), the pointer is cancelled, the window loses focus
// or the page is hidden, the button goes faint (its end), or it is gone. The
// click a browser sends on letting go is swallowed after a hold (until it
// comes, or SWALLOW_MS), so a hold never adds one more step. Each step waits
// for the last one to be drawn, so a slow phone never stacks them up.
//
// Call holdRepeat once for each button: a redrawn button is a new one. A held
// Enter already repeats clicks in every browser, so the keyboard needs nothing.

export const HOLD_MS = 450;
export const SLOW_MS = 250;
export const SLOW_STEPS = 3;
export const EVERY_MS = 90;
export const SLIDE_PX = 30;
export const SWALLOW_MS = 300;

let stage = null;
// While a hold's step runs: 'first' for its first step, 'more' for the rest;
// null for a plain tap, or outside a step.
export const holdStage = () => stage;

// The button's place: the nearest element with an id, and the child indexes
// down from it.
function placeOf(el) {
  const steps = [];
  let n = el;
  while (!n.id && n.parentElement) {
    steps.unshift(Array.prototype.indexOf.call(n.parentElement.children, n));
    n = n.parentElement;
  }
  return { id: n.id, root: n, steps };
}

function at({ id, root, steps }) {
  let el = root.isConnected || !id ? root : (document.getElementById?.(id) ?? null);
  for (const i of steps) el = el?.children[i];
  return el ?? null;
}

const sameKind = (a, b) => !!a && !!b && a.className === b.className && a.textContent === b.textContent
  && a.dataset?.nudge === b.dataset?.nudge;

// Makes `button` repeat while held. Safe to call twice on one button.
export function holdRepeat(button, {
  hold = HOLD_MS, slow = SLOW_MS, slowSteps = SLOW_STEPS, every = EVERY_MS,
  win = globalThis.window, doc = globalThis.document,
  frame = (fn) => (typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame(fn) : fn()),
} = {}) {
  if (!button || button.dataset.holdRepeat !== undefined) return;
  button.dataset.holdRepeat = '';
  let timer = 0;
  let steps = 0;
  let place = null;
  let from = null;
  const swallow = (e) => { if (e.detail !== 0) { e.stopImmediatePropagation(); e.preventDefault(); } };
  const slid = (e) => { if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > SLIDE_PX) stop(); };
  const hidden = () => { if (doc?.visibilityState === 'hidden') stop(); };
  function stop() {
    clearTimeout(timer);
    timer = 0;
    win?.removeEventListener('pointerup', stop);
    win?.removeEventListener('pointercancel', stop);
    win?.removeEventListener('pointermove', slid);
    win?.removeEventListener('blur', stop);
    doc?.removeEventListener?.('visibilitychange', hidden);
    from = null;
    if (!steps) return;
    steps = 0;
    // The click the browser sends for this release is not one more step.
    win?.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => win?.removeEventListener('click', swallow, { capture: true }), SWALLOW_MS);
    (at(place) ?? button).dispatchEvent(new Event('holdend', { bubbles: true }));
  }
  function step() {
    timer = 0;
    const now = at(place);
    if (!sameKind(now, button) || now.disabled) { stop(); return; }
    stage = steps ? 'more' : 'first';
    steps += 1;
    try { now.click(); } finally { stage = null; }
    if (!from) return;   // let go during the step
    const wait = steps < slowSteps ? slow : every;
    frame(() => { if (from) timer = setTimeout(step, wait); });
  }
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || button.disabled) return;
    stop();
    place = placeOf(button);
    from = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
    win?.addEventListener('pointerup', stop);
    win?.addEventListener('pointercancel', stop);
    win?.addEventListener('pointermove', slid);
    win?.addEventListener('blur', stop);
    doc?.addEventListener?.('visibilitychange', hidden);
    timer = setTimeout(step, hold);
  });
  // A long press on a phone must not open a menu or pick the text.
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}
