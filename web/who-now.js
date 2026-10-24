// 👋 Who's playing now? (Ben, 2026-10-24): where the board starts over when
// nobody is on show (app.js startOver): after the person on show is deleted
// (Delete in their profile, 🤷 I don't know the PIN), and at start when
// everyone has a PIN. Everyone left is a big pad in their picture and color,
// with 🔒 in its corner when they have a PIN; 👋 Someone new adds a person.
// A tap opens them (app.js asks for a PIN first; closing the PIN pad comes
// back here). Only a pick closes it: someone has to be playing.

import { people } from './board.js';
import { linkOf } from './cloud.js';
import { makePad } from './pads.js';
import { openDialog, setupDialog } from './dialogs.js';

const el = {};
let hooks = { pick: () => {}, someoneNew: () => {} };

function draw() {
  el.cards.replaceChildren(...people().map((p) => {
    const pad = makePad({ id: `who-${p.id}`, emoji: p.avatar || [...p.name][0], label: p.name, color: p.color });
    pad.classList.add('wl-card');
    pad.dataset.person = p.id;
    const pin = !!linkOf(p.id)?.pin;
    if (pin) {
      const lock = document.createElement('span');
      lock.className = 'pad-inst wn-lock';
      lock.textContent = '🔒';
      lock.setAttribute('aria-hidden', 'true');
      pad.append(lock);
    }
    pad.setAttribute('aria-label', pin ? `${p.name}, with a PIN` : p.name);
    return pad;
  }));
}

export const whoNowOpen = () => !!el.dialog?.open;

// Opens it, or redraws it when open (someone went or came meanwhile). With no
// `note`, an open one keeps what it says.
export function openWhoNow(note) {
  if (!el.dialog) return;
  if (note !== undefined || !el.dialog.open) el.note.textContent = note ?? 'Tap your picture.';
  draw();
  if (!el.dialog.open) openDialog(el.dialog, { focus: el.cards.querySelector('button') });
}

export function closeWhoNow() {
  if (el.dialog?.open) el.dialog.close();
}

export function initWhoNow(h) {
  hooks = { ...hooks, ...h };
  Object.assign(el, {
    dialog: document.querySelector('#who-now'),
    note: document.querySelector('#who-now-note'),
    cards: document.querySelector('#who-now-cards'),
    add: document.querySelector('#who-now-new'),
  });
  if (!el.dialog) return;
  // No ✕, and neither Esc nor a tap beside it closes it.
  setupDialog(el.dialog, { beforeClose: () => false });
  el.cards.addEventListener('click', (e) => {
    const pad = e.target.closest('[data-person]');
    if (pad) hooks.pick(pad.dataset.person);
  });
  el.add.addEventListener('click', () => hooks.someoneNew());
}
