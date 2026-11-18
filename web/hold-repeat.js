// Hold to repeat (Ben, 2026-11-18: "yes, and add it in a couple of other
// spots too"): a − or + held down keeps stepping, as a phone's volume keys
// do. A tap is one step, as before; held past HOLD_MS, it steps again every
// EVERY_MS until let go. Each step is the button's own click(), so whatever
// listens for its click (often a listener on a parent) handles a hold too.
//
// A step may redraw the button (the sound sheet's Layers redraw on every
// change), so the hold remembers where the button sits (its place under the
// nearest element with an id) and keeps pressing whatever button sits there
// now, while it is the same kind of button. Letting go is heard on the
// window for the same reason, and the click a browser sends on letting go is
// swallowed after a hold, so a hold never adds one more step.
//
// A held Enter already repeats clicks in every browser, so the keyboard needs
// nothing here.

export const HOLD_MS = 450;
export const EVERY_MS = 90;

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
  let el = root.isConnected || !id ? root : document.querySelector(`#${id}`);
  for (const i of steps) el = el?.children[i];
  return el ?? null;
}

const sameKind = (a, b) => !!a && !!b && a.className === b.className && a.textContent === b.textContent
  && a.dataset?.nudge === b.dataset?.nudge;

// Makes `button` repeat while held. Safe to call twice on one button.
export function holdRepeat(button, { hold = HOLD_MS, every = EVERY_MS, win = globalThis.window } = {}) {
  if (!button || button.dataset.holdRepeat !== undefined) return;
  button.dataset.holdRepeat = '';
  let timer = 0;
  let repeated = false;
  const swallow = (e) => { if (e.detail !== 0) { e.stopPropagation(); e.preventDefault(); } };
  const stop = () => {
    clearTimeout(timer);
    clearInterval(timer);
    timer = 0;
    win?.removeEventListener('pointerup', stop);
    win?.removeEventListener('pointercancel', stop);
    if (repeated) {
      // The click the browser sends for this release is not one more step.
      win?.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => win?.removeEventListener('click', swallow, { capture: true }), 0);
    }
  };
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || button.disabled) return;
    stop();
    repeated = false;
    const place = placeOf(button);
    const step = () => {
      const now = at(place);
      if (!sameKind(now, button) || now.disabled) { stop(); return; }
      repeated = true;
      now.click();
    };
    win?.addEventListener('pointerup', stop);
    win?.addEventListener('pointercancel', stop);
    timer = setTimeout(() => { step(); if (timer) timer = setInterval(step, every); }, hold);
  });
  // A long press on a phone must not open a menu or pick the text.
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}
