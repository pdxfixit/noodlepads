// Lines of controls that must stay on one line: what gives way, in order, as
// the line runs out of room (docs/decisions.md, Screens). Each line names its
// steps as classes; step n adds the first n of them (tighter padding, shorter
// labels, a picker in place of keys, then a group dropping out). The line
// takes the first step at which it fits, measured on its real width, so it
// degrades the same way on any screen, font or language.
//
// pickerFor() gives a group of latching keys a compact <select> twin for the
// picker step: it shows the pressed key ("4/4 ▾") and a choice presses that key.

const lines = [];

// The first step (0 to steps) at which fitsAt(step) is true; the last step
// when none fits. Pure, so the order is testable without a browser.
export function fitStep(steps, fitsAt) {
  for (let i = 0; i < steps; i++) if (fitsAt(i)) return i;
  return steps;
}

// Applies step n of a line's classes: the first n on, the rest off.
function apply(line, classes, n) {
  classes.forEach((c, i) => line.classList.toggle(c, i < n));
}

// Keeps `line` on one line by stepping through `classes`. `watch` is the box
// whose width decides it (the line itself, unless the line sits beside other
// controls that give way first). The line's content must start at its left
// edge: an overflow to the left is not measured. Returns the function that
// refits it.
export function fitLine(line, classes, watch = line) {
  // The line, and each thing on it: a key can overflow inside its own box.
  const over = (e) => e.scrollWidth > e.clientWidth + 1;
  const fits = () => !over(line) && ![...line.children].some(over);
  // A line taken off the page for good (a redrawn card) stops being watched.
  let ro = null;
  let wasOn = false;
  const drop = () => {
    ro?.disconnect();
    const i = lines.indexOf(soon);
    if (i >= 0) lines.splice(i, 1);
  };
  const run = () => {
    if (line.isConnected) wasOn = true;
    else if (wasOn) { drop(); return; }
    if (!line.clientWidth) return;   // not on screen: fitted when it shows
    apply(line, classes, fitStep(classes.length, (n) => { apply(line, classes, n); return fits(); }));
  };
  // A frame later, so changing the line never resizes what is being observed
  // inside the observer's own callback (that logs a ResizeObserver loop error).
  let queued = 0;
  const soon = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; run(); });
  };
  if (typeof ResizeObserver === 'function') {
    // The line too: it has no width while hidden, and gets one when it shows.
    ro = new ResizeObserver(soon);
    ro.observe(watch);
    if (watch !== line) ro.observe(line);
  }
  globalThis.document?.fonts?.ready?.then(soon);
  lines.push(soon);
  run();
  return soon;
}

// Refits every line, for when what is on a line changes (Advanced turned on,
// a screen tab shown) without its width changing.
export function refitLines() {
  for (const soon of lines) soon();
}

// A <select> twin for a group of latching keys (each with one data-* value).
// Returns the function that copies the pressed key into the select.
export function pickerFor(group, select) {
  const keys = [...group.querySelectorAll('button')];
  const value = (b) => Object.values(b.dataset)[0];
  select.replaceChildren(...keys.map((b) => {
    const o = document.createElement('option');
    o.value = value(b);
    o.textContent = b.getAttribute('aria-label') || b.textContent;
    return o;
  }));
  const sync = () => {
    const on = keys.find((b) => b.getAttribute('aria-pressed') === 'true');
    if (on) select.value = value(on);
  };
  select.addEventListener('change', () => {
    keys.find((b) => value(b) === select.value)?.click();
    sync();
  });
  if (typeof MutationObserver === 'function') {
    new MutationObserver(sync).observe(group, { subtree: true, attributeFilter: ['aria-pressed'] });
  }
  sync();
  return sync;
}

// ── Keys for a slider with a few stops ───────────────────────────────
// A setting with a few set choices (Tone, note lengths…) shows them
// as a row of latching keys, like bars and time signature; the slider is the
// fallback when the keys don't fit (Ben, 2026-10-11: "slider should be a
// fallback"). A row with keys gets the class `keyed`; fitLine's `fit-slider`
// step puts the slider back.

// The most keys a setting gets: more than this stays a slider (Ben, 2026-10-11: 5).
export const MAX_KEYS = 5;

// The values of a slider's stops, min to max, or null when there are more
// than MAX_KEYS of them (or the step doesn't land on max). Pure.
export function sliderStops(min, max, step) {
  const n = Math.round((max - min) / step);
  if (!(n >= 1) || n + 1 > MAX_KEYS || Math.abs(min + n * step - max) > 1e-9) return null;
  return Array.from({ length: n + 1 }, (_, i) => Number((min + i * step).toFixed(6)));
}

// Puts keys beside `input` (inside its row, the input's parent) when its
// range has a few stops, `name(value)` labelling each. Run it again whenever
// the range changes: it replaces the keys, or takes them away. A key sets the
// slider and sends it `input` then `change`, so whatever listens to the
// slider handles a key too. Returns the function that copies the slider's
// value and disabled state onto the keys (for when code sets them), or null.
export function keysForSlider(input, name = String) {
  const row = input.parentElement;
  row.querySelector('.slider-keys')?.remove();
  const { min, max, step } = input;
  const stops = sliderStops(Number(min), Number(max), Number(step) || 1);
  row.classList.toggle('keyed', !!stops);
  if (!stops) return null;
  const group = document.createElement('div');
  group.className = 'seq-barsel slider-keys';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', input.getAttribute('aria-label') || row.querySelector('span')?.textContent || '');
  const keys = stops.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.stop = String(v);
    b.textContent = name(v);
    return b;
  });
  group.append(...keys);
  const sync = () => {
    const at = Number(input.value);
    for (const b of keys) {
      b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.stop) - at) < 1e-6));
      b.disabled = input.disabled;
    }
  };
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || b.getAttribute('aria-pressed') === 'true') return;
    input.value = b.dataset.stop;
    for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true }));
    sync();
  });
  input.addEventListener('input', sync);
  input.insertAdjacentElement('afterend', group);
  sync();
  return sync;
}

// Whether a keyed row is showing its keys (not fallen back to the slider):
// then the slider is out of sight, and its events come from a key.
export const showingKeys = (row) => !!row?.classList.contains('keyed') && !row.classList.contains('fit-slider');

// The steps a keyed row takes as room runs out: tighter keys, then the slider.
export const KEYED_STEPS = ['fit-tight', 'fit-slider'];
