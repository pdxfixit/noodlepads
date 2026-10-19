// ⇆ Move on Beats (Ben, 2026-10-17): a mode of the beat's rows for sliding
// pills along, so a beat that starts on pill 3 goes back to pill 1 with every
// row in step, or one part of it moves. This file owns the mode: the Move
// bar (what is picked · ◀ ▶ · All None Invert · ↩️ Undo · ✓ Done), the pick
// drawn on the pills, and the gestures; slide.js says what a pick is and what
// a slide does, and the beat maker (sequencer.js) keeps the beat.
//
// While it is on the pills are locked: a tap no longer turns one on or off.
// - It opens with the whole beat picked: one slide moves everything.
// - A tap puts a pill in the pick or takes it out; a row's emoji or name
//   picks just that row (Ben, 2026-10-18).
// - A drag paints a section (rows × pills from where it started): starting
//   on a picked pill takes it out, on any other adds it.
// - A hold on a pill lifts the pick, and the drag after it slides it a pill
//   at a time; a dashed shadow marks where each lit pill started (Ben:
//   "hold, then drag, show the shadow"). With a mouse no hold is needed: a
//   drag from a picked pill slides at once, and Alt-drag paints (Ben: "a
//   proper drag on the desktop should work without the need for a hold").
// - ◀ ▶ (or Shift + ← →) slide one pill; Esc is ✓ Done.
// It slides live: a playing beat plays each step of a drag.

import { pillKey, fromKey, pickAll, section, paint, invertPick, shiftPick, keepPick, slideRows } from './slide.js';
import { edgeScroller } from './edge-scroll.js';

// deps: el {rows, bar, what, hint, left, right, all, none, invert, undo, done},
// beat() (the open beat), total() (its pills per row), render(), save(),
// putRows(rows) (writes rows into the open beat and draws it), holdMs,
// onChange(on) (the ⇆ buttons follow).
export function createBeatMove(deps) {
  const { el } = deps;
  let on = false;
  let beat = null;          // the beat the mode is on: another one opening ends it
  let pick = new Set();
  let undo = [];            // [{rows, pick}], one per slide
  let press = null;         // a finger down that is not yet a tap, a paint or a hold
  let drag = null;          // {type: 'paint', ...} or {type: 'slide', from, d, base}
  let after = -1e9;         // when a drag or hold ended: the click right after it is not a tap
  let finger = null;        // where the pointer last was in a drag, {clientX, clientY}
  // Near the top or bottom of the screen a drag scrolls the page, so a
  // section can reach rows off screen on a phone; the drag follows the page.
  const scroller = edgeScroller(() => { if (drag && finger) move(finger); });
  let onDone = null;

  const rowCount = () => deps.beat()?.rows.length ?? 0;
  const whole = () => pick.size === rowCount() * deps.total();
  const mouseFirst = () => globalThis.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
  let mouse = mouseFirst();

  function start({ done = null } = {}) {
    beat = deps.beat();
    if (!beat) return;
    on = true;
    onDone = done;
    pick = pickAll(rowCount(), deps.total());
    undo = [];
    deps.onChange?.(true);
    deps.render();
    el.bar.querySelector('button:not(:disabled)')?.focus?.({ preventScroll: true });
  }
  function end() {
    if (!on) return;
    cancel();
    on = false;
    beat = null;
    pick = new Set();
    undo = [];
    deps.onChange?.(false);
    deps.render();
    const then = onDone;
    onDone = null;
    then?.();
  }

  // After each draw of the rows: the pick on the pills and the bar's words.
  // Another beat opened (or the person changed) ends the mode.
  function decorate(pills) {
    el.bar.hidden = !on;
    el.rows.classList.toggle('moving', on);
    if (!on) return;
    if (deps.beat() !== beat) { queueMicrotask(end); return; }
    pick = keepPick(pick, rowCount(), deps.total());
    const sliding = drag?.type === 'slide';
    const shown = sliding ? shiftPick(pick, drag.d, deps.total()) : pick;
    // The shadow: where each lit pill being slid started, so the distance shows.
    const was = new Set(sliding && drag.d ? [...pick].filter((k) => { const [r, s] = fromKey(k); return drag.base[r]?.steps[s]; }) : []);
    pills.forEach((row, r) => row?.forEach((p, s) => {
      const k = pillKey(r, s);
      p.classList.toggle('picked', shown.has(k));
      p.classList.toggle('lifted', sliding && shown.has(k));
      p.classList.toggle('shadow', was.has(k));
    }));
    el.rows.classList.toggle('sliding', sliding);
    const none = pick.size === 0;
    el.all.disabled = whole();
    el.none.disabled = none;
    el.left.disabled = el.right.disabled = none;
    el.undo.disabled = undo.length === 0;
    const rows = new Set([...pick].map((k) => fromKey(k)[0])).size;
    el.what.textContent = whole() ? 'Whole beat picked' : none ? 'Nothing picked'
      : `${pick.size} ${pick.size === 1 ? 'pill' : 'pills'} picked${rows > 1 ? ` on ${rows} rows` : ''}`;
    el.hint.textContent = sliding && drag.d ? `${Math.abs(drag.d)} ${Math.abs(drag.d) === 1 ? 'pill' : 'pills'} ${drag.d < 0 ? 'left' : 'right'}`
      : none ? (mouse ? 'Click or drag across pills to pick' : 'Tap or drag across pills to pick')
      : mouse ? 'Click or drag to pick · drag them to slide' : 'Tap or drag to pick · hold to slide';
  }

  // Slides the pick d pills along: from `base` (the rows when the drag began)
  // while dragging, from the beat as it is for ◀ ▶. `final` saves it.
  function slideBy(d, { base = structuredClone(deps.beat().rows), final = true } = {}) {
    if (!pick.size) return;
    const next = slideRows(base, pick, d, deps.total());
    if (final) {
      if (d % deps.total() !== 0) undo.push({ rows: base, pick: new Set(pick) });
      pick = shiftPick(pick, d, deps.total());
    }
    deps.putRows(next);
    if (final) deps.save();
  }
  function step(d) {
    if (!on || !pick.size) return;
    slideBy(d);
  }
  function takeBack() {
    const last = undo.pop();
    if (!last) return;
    pick = last.pick;
    deps.putRows(last.rows);
    deps.save();
  }

  const pillOf = (node) => {
    const p = node?.closest?.('.pill');
    const row = p?.closest('.seq-row');
    return p && row && !p.hidden ? { r: Number(row.dataset.row), s: Number(p.dataset.step) } : null;
  };
  const pillAt = (x, y) => pillOf(document.elementFromPoint?.(x, y));

  function cancel() {
    if (press) clearTimeout(press.timer);
    press = null;
    if (drag?.type === 'slide') deps.putRows(drag.base);
    drag = null;
    scroller.stop();
  }

  function down(e) {
    if (!on || e.button > 0) return;
    const at = pillOf(e.target);
    if (!at) return;
    e.preventDefault();
    mouse = e.pointerType === 'mouse';
    const picked = pick.has(pillKey(at.r, at.s));
    press = {
      ...at, x: e.clientX, y: e.clientY, picked,
      grab: mouse && !e.altKey && picked,
      timer: setTimeout(() => {
        // A hold: an unpicked pill joins the pick, and the pick lifts.
        if (!press) return;
        pick.add(pillKey(at.r, at.s));
        drag = { type: 'slide', from: at.s, d: 0, base: structuredClone(deps.beat().rows) };
        press = null;
        globalThis.navigator?.vibrate?.(15);
        deps.render();
      }, deps.holdMs),
    };
    try { el.rows.setPointerCapture?.(e.pointerId); } catch { /* a pointer that already went */ }
  }
  function move(e) {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
      // Moved before the hold: a mouse on a picked pill grabs it; anything else paints.
      clearTimeout(press.timer);
      drag = press.grab ? { type: 'slide', from: press.s, d: 0, base: structuredClone(deps.beat().rows) }
        : { type: 'paint', r: press.r, s: press.s, base: new Set(pick), add: !press.picked };
      press = null;
    }
    if (!drag) return;
    finger = { clientX: e.clientX, clientY: e.clientY };
    scroller.at(e.clientY);
    const at = pillAt(e.clientX, e.clientY);
    if (!at) return;
    if (drag.type === 'slide') {
      const d = at.s - drag.from;
      if (d === drag.d) return;
      drag.d = d;
      slideBy(d, { base: drag.base, final: false });
    } else {
      pick = paint(drag.base, section(drag.r, drag.s, at.r, at.s), drag.add);
      deps.render();
    }
  }
  function up() {
    scroller.stop();
    if (press) { clearTimeout(press.timer); press = null; return; }   // a tap: the click that follows does it
    if (!drag) return;
    after = Date.now();
    const was = drag;
    drag = null;
    if (was.type === 'slide') slideBy(was.d, { base: was.base });
    else deps.render();
  }
  // A click on the rows while moving (sequencer.js hands it here): a tap
  // or Space on a pill puts it in or out; the emoji or name picks its row.
  function click(e) {
    if (Date.now() - after < 500) { after = -1e9; return; }
    const row = e.target.closest?.('.seq-row');
    if (!row) return;
    const r = Number(row.dataset.row);
    if (e.target.closest('[data-pick], .seq-name')) {
      pick = section(r, 0, r, deps.total() - 1);
      deps.render();
      return;
    }
    const at = pillOf(e.target);
    if (!at) return;
    const k = pillKey(at.r, at.s);
    if (pick.has(k)) pick.delete(k); else pick.add(k);
    deps.render();
  }

  el.rows.addEventListener('pointerdown', down);
  el.rows.addEventListener('pointermove', move);
  el.rows.addEventListener('pointerup', up);
  el.rows.addEventListener('pointercancel', () => { if (press) { clearTimeout(press.timer); press = null; } up(); });
  el.rows.addEventListener('contextmenu', (e) => { if (on && pillOf(e.target)) e.preventDefault(); });
  el.left.addEventListener('click', () => step(-1));
  el.right.addEventListener('click', () => step(1));
  el.all.addEventListener('click', () => { pick = pickAll(rowCount(), deps.total()); deps.render(); });
  el.none.addEventListener('click', () => { pick = new Set(); deps.render(); });
  el.invert.addEventListener('click', () => { pick = invertPick(pick, rowCount(), deps.total()); deps.render(); });
  el.undo.addEventListener('click', takeBack);
  el.done.addEventListener('click', end);
  globalThis.addEventListener?.('keydown', (e) => {
    if (!on || e.target?.closest?.('input, textarea, select') || document.querySelector?.('dialog[open]')) return;
    if (e.key === 'Escape') { end(); return; }
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); }
  });

  return { start, end, on: () => on, decorate, click, toggle: (opts) => (on ? end() : start(opts)) };
}
