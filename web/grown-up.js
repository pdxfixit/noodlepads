// The grown-up sum (#kids-sum): a number from 12 to 39 plus one from 6 to 9
// (kids-logic.js makeSum), answered on big number keys, so a young kid can't
// get past it by tapping. After three wrong answers in a row each next try
// waits 30 s (kids-logic.js sumWait): the keys dim and ⏳ counts down, no
// words; a right answer ends it. Four places ask it:
//   🧸 Kids' ⚙️ (kids.js): a wrong answer goes quietly back to the kid's
//     screens (ADR 0019).
//   ⚙️ Settings → About → Feedback (feedback.js), at every level (Ben,
//     2026-10-19): a wrong answer says so and asks another sum.
//   A profile's Forget this device (cloud-ui.js), at every level (Ben,
//     2026-10-27): the same as Feedback; ✕ forgets nothing.
//   A profile's ☁️ In the cloud switched on (cloud-ui.js), at every level
//     (Ben, 2026-10-27: the usual sum, no stronger gate): the same, with a
//     line under the title saying who it is for; ✕ leaves the switch off.
// The dialog closes as every dialog does (✕, the backdrop, Esc).

import { setupDialog, openDialog } from './dialogs.js';
import { makeSum, typeDigit, sumWait } from './kids-logic.js';
import { onePressOneClick } from './util.js';

const el = {};
// What is being asked: { sum, typed, right(), wrong(), cancel(), stay, owner }, or null.
let ask = null;
// Wrong answers in a row (whoever asked), and the time the next try may
// come (Date.now() ms; 0: no wait). Kept until the page reloads.
let wrongs = 0;
let waitUntil = 0;
let ticker = 0;
const waiting = () => Date.now() < waitUntil;

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

// While a wait runs the number keys dim and do nothing, and ⏳ counts the
// seconds down; then they wake for the next try.
function showWait() {
  clearInterval(ticker);
  const tick = () => {
    const left = Math.ceil((waitUntil - Date.now()) / 1000);
    const on = left > 0;
    el.box.classList.toggle('waiting', on);
    el.wait.hidden = !on;
    el.left.textContent = String(Math.max(0, left));
    for (const k of el.keys.querySelectorAll('[data-digit]')) k.disabled = on;
    if (!on) clearInterval(ticker);
  };
  tick();
  if (waiting()) ticker = setInterval(tick, 250);
}

function tapDigit(d) {
  if (!ask || waiting()) return;
  const next = typeDigit(ask.typed, d, ask.sum.answer);
  ask.typed = next.typed;
  el.typed.textContent = next.typed;
  if (!next.done) return;
  const { right, wrong, stay } = ask;
  if (next.right) {
    wrongs = 0;
    waitUntil = 0;
    ask = null;
    el.dialog.close();
    right?.();
    return;
  }
  wiggle(el.box);
  wrongs += 1;
  const wait = sumWait(wrongs);
  if (wait) waitUntil = Date.now() + wait;
  wrong?.();
  if (stay) {
    el.note.textContent = WRONG_NOTE;
    el.note.hidden = false;
    newSum();
    showWait();
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
    typed: q('#kids-sum-typed'), keys: q('#kids-sum-keys'), note: q('#kids-sum-note'), why: q('#kids-sum-why'),
    wait: q('#kids-sum-wait'), left: q('#kids-sum-left'),
  });
  setupDialog(el.dialog);
  el.dialog.addEventListener('close', () => {
    // Closed with no answer (✕, the backdrop, Esc): whoever asked hears it.
    // A right answer or a wrong one that closes the dialog cleared `ask` first.
    const given = ask;
    ask = null;
    clearInterval(ticker);
    given?.cancel?.();
  });
  onePressOneClick(el.keys);   // a held Enter would type its digit again
  el.keys.addEventListener('click', (e) => {
    const k = e.target.closest?.('[data-digit]');
    if (k) tapDigit(k.dataset.digit);
  });
}

// Asks a new sum. `right()` runs after the right answer closes it; `wrong()`
// after each wrong one; `cancel()` when it is closed with no answer. `stay`: a
// wrong answer says so and asks another (else the dialog closes). `owner`
// names who asked, for closeSum. `why`: a line under the title saying what it
// is for (set as text, since it can hold a name from a record); none when empty.
export function askSum({ right, wrong, cancel, stay = false, owner = '', why = '' } = {}) {
  if (!el.dialog) wire();
  ask = { right, wrong, cancel, stay, owner };
  el.why.textContent = why;
  el.why.hidden = !why;
  newSum();
  el.note.textContent = '';
  el.note.hidden = true;
  showWait();
  openDialog(el.dialog);
}

// Closes the sum if `owner` asked the one showing.
export function closeSum(owner) {
  if (el.dialog?.open && ask?.owner === owner) el.dialog.close();
}
