// 👋 The welcome for a new person (ADR 0028; Ben, 2026-10-16): a dialog
// over the screen asking Who's playing? Three big picture cards, each drawn
// as a pad in the person's pad skin, set their level: 🧸 Little noodler
// (Kids), 🎵 Tap and make beats (Regular), 🎛️ Show me everything
// (Advanced). No ages on them (Ben: "drop"). A tap is a real gesture, so it
// plays a ready-made sound (the audio may start there), sets the level and
// moves on. A quiet Skip keeps Regular. A grown-up picks; the kid sees
// pictures, and leaving 🧸 Kids still needs the grown-up sum.
//
// Who is new. Only the two places that make a person from nothing mark
// one, in memory: app.js settlePeople, for a device's automatic first
// person (model.js soloPerson), and people.js addPerson (➕ in 👥 People,
// 👋 Someone new on the PIN pad). A person read from storage, pulled from
// the cloud or loaded from a backup never passes through either, so nobody
// who exists before this ships, or arrives from elsewhere, is ever
// welcomed. Nothing is stored: a reload before the welcome shows skips it,
// as Skip would.

import { state } from './state.js';
import { person } from './board.js';
import { setSetting, LEVELS } from './settings.js';
import { makePad } from './pads.js';
import { openDialog, setupDialog } from './dialogs.js';
import { logEvent } from './log.js';
import { firstStepsOn } from './firsts.js';

// The three cards: the level, the picture and words on the pad, its pad
// color (boards.json palette) and the ready-made sound a tap plays (a kit id).
export const LEVEL_CARDS = [
  { level: 'kids', emoji: '🧸', label: 'Little noodler', color: 'yellow', sound: 'pop', words: '🧸 Kids: big pictures, no reading' },
  { level: 'regular', emoji: '🎵', label: 'Tap and make beats', color: 'teal', sound: 'clap', words: 'Regular' },
  { level: 'advanced', emoji: '🎛️', label: 'Show me everything', color: 'pink', sound: 'chord-c', words: 'Advanced: every tool' },
];

const el = {};
let deps = { play: () => {} };
const fresh = new Set();   // people made this visit and not yet welcomed
let forId = null;          // the person the open welcome is for

// A person just made from nothing (see above).
export function markNew(id) {
  if (id) fresh.add(id);
}

// Opens the welcome for `id` when they are new and not yet welcomed, once.
// True when it opened.
export function offerWelcome(id) {
  if (!fresh.has(id) || !el.dialog || !firstStepsOn()) return false;
  fresh.delete(id);
  if (!person(id)) return false;
  forId = id;
  logEvent('welcome', { shown: true });
  openDialog(el.dialog, { focus: el.cards.querySelector('[data-level]') });
  return true;
}

export const welcomeOpen = () => !!el.dialog?.open;

// A card: the level it sets (only for the person still showing), its sound,
// and on.
async function pick(level) {
  if (!LEVELS.includes(level) || !forId) return;
  const card = LEVEL_CARDS.find((c) => c.level === level);
  deps.play(card.sound);
  logEvent('welcome', { level });
  const id = forId;
  close();
  if (state.personId === id) await setSetting('level', level);
}

function close() {
  forId = null;
  if (el.dialog.open) el.dialog.close();
}

export function initWelcome(hooks = {}) {
  deps = { ...deps, ...hooks };
  Object.assign(el, {
    dialog: document.querySelector('#welcome'),
    cards: document.querySelector('#wl-cards'),
    skip: document.querySelector('#wl-skip'),
  });
  if (!el.dialog) return;
  setupDialog(el.dialog);
  el.cards.replaceChildren(...LEVEL_CARDS.map((c) => {
    const pad = makePad({ id: `welcome-${c.level}`, emoji: c.emoji, label: c.label, color: c.color });
    pad.classList.add('wl-card');
    pad.dataset.level = c.level;
    pad.setAttribute('aria-label', `${c.emoji} ${c.label}: ${c.words}`);
    return pad;
  }));
  el.cards.addEventListener('click', (e) => {
    const card = e.target.closest('[data-level]');
    if (card) pick(card.dataset.level);
  });
  // Skip keeps Regular: nothing to set, the app's own first level.
  el.skip.addEventListener('click', () => { logEvent('welcome', { skipped: true }); close(); });
  el.dialog.addEventListener('close', () => { forId = null; });
}
