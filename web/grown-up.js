// The grown-up sum (#kids-sum): two numbers from 6 to 9 (kids-logic.js
// makeSum), answered on big number keys, so a young kid can't get past it by
// tapping. Two places ask it:
//   🧸 Kids' ⚙️ (kids.js): a wrong answer goes quietly back to the kid's
//     screens (ADR 0019).
//   ⚙️ Settings → About → Feedback (feedback.js), at every level (Ben,
//     2026-10-19): a wrong answer says so and asks another sum.
// The dialog closes as every dialog does (✕, the backdrop, Esc).

import { setupDialog, openDialog } from './dialogs.js';
import { makeSum, typeDigit } from './kids-logic.js';

const el = {};
// What is being asked: { sum, typed, right(), wrong(), stay, owner }, or null.
let ask = null;

export const WRONG_NOTE = "That's not it. Here's another one.";

// A little head shake: a wrong sum.
function wiggle(node) {
  node.classList.add('wiggle');
  setTimeout(() => node.classList.remove('wiggle'), 420);
}

function newSum() {
  ask.sum = makeSum();
  ask.typed = '';
  el.a.textContent = String(ask.sum.a);
  el.b.textContent = String(ask.sum.b);
  el.typed.textContent = '?';
}

function tapDigit(d) {
  if (!ask) return;
  const next = typeDigit(ask.typed, d, ask.sum.answer);
  ask.typed = next.typed;
  el.typed.textContent = next.typed;
  if (!next.done) return;
  const { right, wrong, stay } = ask;
  if (next.right) {
    ask = null;
    el.dialog.close();
    right?.();
    return;
  }
  wiggle(el.box);
  wrong?.();
  if (stay) {
    el.note.textContent = WRONG_NOTE;
    el.note.hidden = false;
    newSum();
  } else {
    ask = null;
    setTimeout(() => el.dialog.close(), 400);
  }
}

// Wired the first time a sum is asked, whoever asks first.
function wire() {
  const q = (s) => document.querySelector(s);
  Object.assign(el, {
    dialog: q('#kids-sum'), box: q('#kids-sum-box'), a: q('#kids-sum-a'), b: q('#kids-sum-b'),
    typed: q('#kids-sum-typed'), keys: q('#kids-sum-keys'), note: q('#kids-sum-note'),
  });
  setupDialog(el.dialog);
  el.dialog.addEventListener('close', () => { ask = null; });
  el.keys.addEventListener('click', (e) => {
    const k = e.target.closest?.('[data-digit]');
    if (k) tapDigit(k.dataset.digit);
  });
}

// Asks a new sum. `right()` runs after the right answer closes it; `wrong()`
// after each wrong one. `stay`: a wrong answer says so and asks another
// (else the dialog closes). `owner` names who asked, for closeSum.
export function askSum({ right, wrong, stay = false, owner = '' } = {}) {
  if (!el.dialog) wire();
  ask = { right, wrong, stay, owner };
  newSum();
  el.note.textContent = '';
  el.note.hidden = true;
  openDialog(el.dialog);
}

// Closes the sum if `owner` asked the one showing.
export function closeSum(owner) {
  if (el.dialog?.open && ask?.owner === owner) el.dialog.close();
}
