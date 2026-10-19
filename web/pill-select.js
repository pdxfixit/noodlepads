// Pills picked and dragged with a mouse, like objects in a drawing app (Ben,
// 2026-10-19: "pills should be selectable and draggable, like standard
// objects (ctrl, shift, etc)"). Only lit pills are picked; a picked group
// drags along its own rows with its spacing kept (slide.js slideRows, as ⇆
// Move slides). With a mouse, on Beats' rows and on the keys' grid:
// - A click on a lit pill picks it alone; Ctrl/Cmd-click adds or drops one;
//   Shift-click adds the lit pills from the last one clicked to it.
// - A click on an unlit pill lights it, and picks it.
// - A drag from a lit pill slides the pick (that pill joins it first); a drag
//   from an unlit pill draws a box that picks the lit pills in it (Ctrl/Cmd
//   or Shift add to the pick).
// - Delete or Backspace turns the pick off, a double-click one pill; Esc
//   lets go. A slide and a delete each offer Undo.
// A finger and the keyboard keep their own ways: a tap lights or unlights,
// a hold makes a hit loud (the one way now), and ⇆ Move slides by touch.
// Tune rows (🎹) are left out: a click there opens the piano roll.

import { pillKey, fromKey, section, shiftPick, slideRows } from './slide.js';

// The keys of `keys` that are lit pills of plain rows: only those are picked.
export function litOnly(rows, keys, total) {
  return new Set([...keys].filter((k) => {
    const [r, s] = fromKey(k);
    const row = rows[r];
    return !!row && !row.melody && s < total && !!row.steps[s];
  }));
}

// The pick after a click on pill `at` ({r, s}) of `rows`, with `mods`
// ({add: Ctrl/Cmd, range: Shift}) and the last pill clicked (`anchor`).
// Returns {pick, anchor, light}: `light` when the click lights the pill.
export function clickPick(rows, pick, at, mods, anchor, total) {
  const k = pillKey(at.r, at.s);
  const lit = !!rows[at.r]?.steps[at.s];
  if (!lit) {
    if (mods.add || mods.range) return { pick, anchor, light: false };
    return { pick: new Set([k]), anchor: k, light: true };
  }
  if (mods.range && anchor) {
    const [r0, s0] = fromKey(anchor);
    return { pick: new Set([...pick, ...litOnly(rows, section(r0, s0, at.r, at.s), total)]), anchor, light: false };
  }
  if (mods.add) {
    const next = new Set(pick);
    if (next.has(k)) next.delete(k); else next.add(k);
    return { pick: next, anchor: k, light: false };
  }
  return { pick: new Set([k]), anchor: k, light: false };
}

// The rows with the picked pills turned off (and not loud). New row objects.
export function turnOff(rows, pick) {
  const byRow = new Map();
  for (const k of pick) { const [r, s] = fromKey(k); (byRow.get(r) ?? byRow.set(r, []).get(r)).push(s); }
  return rows.map((row, r) => {
    const off = byRow.get(r);
    if (!off || row.melody) return row;
    const steps = [...row.steps];
    const accents = [...(row.accents ?? [])];
    for (const s of off) { steps[s] = false; accents[s] = false; }
    return { ...row, steps, accents };
  });
}

const count = (n) => `${n} ${n === 1 ? 'pill' : 'pills'}`;

// deps: root (the rows' box), pillOf(node) → {r, s} or null, pillEl(r, s),
// beat(), total(), putRows(rows) (writes and draws), save(), light(r, s)
// (lights a pill, saves, draws), enabled() (false in ⇆ Move or recording),
// snapshot(), undoable(copy, text).
export function createPillSelect(deps) {
  let pick = new Set();
  let anchor = null;
  let beat = null;           // the beat picked on: another one lets go
  let press = null;          // a mouse button down on a pill, not yet a click or a drag
  let drag = null;           // {type: 'slide', from, d, base, copy} or {type: 'box', r, s, base}
  let after = -1e9;          // when a drag ended: the click it makes is not a click
  let mouse = false;         // the last press was a mouse's

  const rows = () => deps.beat()?.rows ?? [];
  const keep = () => {
    if (deps.beat() !== beat) { beat = deps.beat(); pick = new Set(); anchor = null; }
    pick = litOnly(rows(), pick, deps.total());
  };

  // After each draw: the pick on the pills. While a slide drags, the pick is
  // kept where it started and shown where it is now.
  function decorate() {
    const sliding = drag?.type === 'slide';
    if (!sliding) keep();
    for (const p of deps.root.querySelectorAll('.chosen')) p.classList.remove('chosen');
    if (!deps.enabled()) { pick = new Set(); return; }
    const shown = sliding ? shiftPick(pick, drag.d, deps.total()) : pick;
    for (const k of shown) { const [r, s] = fromKey(k); deps.pillEl(r, s)?.classList.add('chosen'); }
  }
  const set = (next) => { pick = next; decorate(); };

  function down(e) {
    mouse = e.pointerType === 'mouse';
    if (!mouse || e.button !== 0 || !deps.enabled()) return;
    const at = deps.pillOf(e.target);
    if (!at || rows()[at.r]?.melody) return;
    keep();
    press = { ...at, x: e.clientX, y: e.clientY, add: e.ctrlKey || e.metaKey || e.shiftKey, lit: !!rows()[at.r]?.steps[at.s] };
  }
  function move(e) {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) {
      const k = pillKey(press.r, press.s);
      if (press.lit) {
        if (!pick.has(k)) pick = press.add ? new Set([...pick, k]) : new Set([k]);
        drag = { type: 'slide', from: press.s, d: 0, base: structuredClone(rows()), copy: deps.snapshot() };
      } else {
        drag = { type: 'box', r: press.r, s: press.s, base: press.add ? new Set(pick) : new Set() };
      }
      press = null;
      try { deps.root.setPointerCapture?.(e.pointerId); } catch { /* a pointer that already went */ }
    }
    if (!drag) return;
    const at = deps.pillOf(document.elementFromPoint?.(e.clientX, e.clientY));
    if (!at) return;
    if (drag.type === 'slide') {
      const d = at.s - drag.from;
      if (d === drag.d) return;
      drag.d = d;
      deps.putRows(slideRows(drag.base, pick, d, deps.total()));
      decorate();
    } else {
      set(new Set([...drag.base, ...litOnly(rows(), section(drag.r, drag.s, at.r, at.s), deps.total())]));
    }
  }
  function up() {
    press = null;
    if (!drag) return;
    after = Date.now();
    const was = drag;
    drag = null;
    if (was.type !== 'slide') return;
    if (was.d % deps.total() === 0) { deps.putRows(was.base); decorate(); return; }
    pick = shiftPick(pick, was.d, deps.total());
    deps.save();
    decorate();
    deps.undoable(was.copy, `Moved ${count(pick.size)}, ${Math.abs(was.d)} to the ${was.d < 0 ? 'left' : 'right'}.`);
  }

  // A click on a pill (the view hands it here first): true when it is ours.
  // A keyboard's Space or Enter (no pointer, detail 0) and a finger's tap are not.
  function click(e, r, s) {
    if (Date.now() - after < 400) { after = -1e9; return true; }
    if (!mouse || e.detail === 0 || !deps.enabled() || rows()[r]?.melody) return false;
    keep();
    const res = clickPick(rows(), pick, { r, s }, { add: e.ctrlKey || e.metaKey, range: e.shiftKey }, anchor, deps.total());
    anchor = res.anchor;
    if (res.light) { pick = res.pick; deps.light(r, s); decorate(); return true; }
    set(res.pick);
    return true;
  }
  // A double-click turns that one pill off.
  function dblclick(e) {
    if (!mouse || !deps.enabled()) return;
    const at = deps.pillOf(e.target);
    if (!at || !rows()[at.r]?.steps[at.s] || rows()[at.r]?.melody) return;
    const copy = deps.snapshot();
    deps.putRows(turnOff(rows(), new Set([pillKey(at.r, at.s)])));
    deps.save();
    decorate();
    deps.undoable(copy, 'Turned 1 pill off.');
  }
  function key(e) {
    if (!pick.size || !deps.enabled() || e.target?.closest?.('input, textarea, select, dialog') || document.querySelector?.('dialog[open]')) return;
    if (!deps.root.isConnected || deps.root.closest?.('[hidden]')) return;
    if (e.key === 'Escape') { set(new Set()); return; }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    e.preventDefault();
    const copy = deps.snapshot();
    const n = pick.size;
    deps.putRows(turnOff(rows(), pick));
    deps.save();
    pick = new Set();
    decorate();
    deps.undoable(copy, `Turned ${count(n)} off.`);
  }

  deps.root.addEventListener('pointerdown', down);
  deps.root.addEventListener('pointermove', move);
  deps.root.addEventListener('pointerup', up);
  deps.root.addEventListener('pointercancel', () => {
    press = null;
    const was = drag;
    drag = null;
    if (was?.type === 'slide') deps.putRows(was.base);
    decorate();
  });
  deps.root.addEventListener('dblclick', dblclick);
  globalThis.document?.addEventListener?.('keydown', key);

  return { decorate, click, dragging: () => !!drag, picked: () => new Set(pick), clear: () => set(new Set()) };
}
