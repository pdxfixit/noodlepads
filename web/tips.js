// A new person's first steps after the welcome (ADR 0028; Ben, 2026-10-16):
// one-time tips, for Regular and Advanced. Each is one short line in the
// banner over the top (ui.js showBanner), the first time a thing matters:
//
//   🔊 Pads   after a few pad taps: hold a pad to make it loop
//   🥁 Beats  the first visit with ⌨️ Keys off and no hits: tap squares, ▶ Play, or 💃 a groove
//   🎼 Song   the first visit; 🎤 Live the first visit
//   the sound sheet, the first time it opens: the voices
//
// Once per person (the person setting `seen`, firsts.js, so it never repeats
// on another device), at most one per screen visit, never over a notice or an
// Undo in the banner, never while a dialog is open (but the sound sheet's
// own), never on 🧸 Kids. ❓ Help's 💡 Show tips again clears this person's
// tips (and hint dots), so they come back one at a time.
//
// Hint dots: a small dot on ⌨️ Keys, 💃 Grooves and 🎚️ Mixer until this
// person first taps each (every copy of that button: Beats with ⌨️ Keys off
// and on). The dots are the page's `data-hints` ("keys grooves mixer"), drawn
// by styles.css as a ::before on the buttons themselves: decorative (no text,
// so nothing to read aloud), out of the flow (they never change a button's
// size), and still there when a screen redraws its buttons. They follow the
// same `seen` store as the tips (dot-keys, dot-grooves, dot-mixer).

import { getSetting, setSetting, onSetting } from './settings.js';
import { showBanner, bannerShowing } from './ui.js';
import { onDialogOpen } from './dialogs.js';
import { firstStepsOn, seenSet, withSeen, withoutTips, TIPS, PAD_TAPS_FOR_TIP } from './firsts.js';

let deps = { keysOn: () => false, beatHasHits: () => true };
let tipThisVisit = false;   // a tip has shown on this screen visit
let padTaps = 0;            // pad taps on 🔊 Pads this visit
let lastTip = null;         // the banner of the last tip, which a new tip may replace

// Regular and Advanced, with first steps on (🧸 Kids' screens show only on
// the Kids level).
export const guided = () => firstStepsOn() && getSetting('level') !== 'kids';

export const hasSeen = (id) => seenSet(getSetting('seen')).has(id);
export function markSeen(id) {
  if (hasSeen(id)) return Promise.resolve();
  return setSetting('seen', withSeen(getSetting('seen'), id)).catch((err) => console.error('Keeping what was seen failed:', err));
}

// Shows tip `id` if this person hasn't had it and now is a good moment.
// True when it showed.
export function showTip(id, { inDialog = false } = {}) {
  if (!guided() || tipThisVisit || hasSeen(id) || !TIPS[id]) return false;
  if (!inDialog && document.querySelector('dialog[open]')) return false;
  if (bannerShowing() && !lastTip?.open) return false;   // a notice or an Undo is showing
  tipThisVisit = true;
  markSeen(id);
  lastTip = showBanner(TIPS[id]);
  return true;
}

// A screen shows (app.js setScreen): a new visit, and its tip if it has one.
export function tipsScreen(name) {
  tipThisVisit = false;
  padTaps = 0;
  if (name === 'beats' && !deps.keysOn() && !deps.beatHasHits()) showTip('tip-beats');
  else if (name === 'song') showTip('tip-song');
  else if (name === 'live') showTip('tip-live');
}

// The hint dots: which button, and what a tap on it means.
export const DOTS = [
  { id: 'dot-keys', hint: 'keys', on: '[data-beat-keys]' },
  { id: 'dot-grooves', hint: 'grooves', on: '[data-beat-grooves]' },
  { id: 'dot-mixer', hint: 'mixer', on: '[data-mixer]' },
];

// The dots this person still has, on the page.
export function showDots() {
  const seen = seenSet(getSetting('seen'));
  const hints = guided() ? DOTS.filter((d) => !seen.has(d.id)).map((d) => d.hint) : [];
  if (hints.length) document.body.dataset.hints = hints.join(' ');
  else delete document.body.dataset.hints;
}

// 🧸 Kids gets no words (ADR 0028): a 👆 hand pulses over the first pad until
// the first pad tap, and the mic wiggles until the first recording (kids.js
// draws both). Once per person: kids-pad and kids-mic in `seen`, which 💡
// Show tips again leaves alone. `what`: 'pad' or 'mic'.
export const kidsHint = (what) => firstStepsOn() && getSetting('level') === 'kids' && !hasSeen(`kids-${what}`);

// 💡 Show tips again (❓ Help): this person's tips and dots come back.
export async function showTipsAgain() {
  tipThisVisit = false;
  padTaps = 0;
  await setSetting('seen', withoutTips(getSetting('seen')));
}

export function initTips(hooks = {}) {
  deps = { ...deps, ...hooks };
  const body = document.body;
  // Pad taps on 🔊 Pads (not while editing), caught on the way down so a
  // pad's own handler can't hide them.
  body.addEventListener('click', (e) => {
    const pad = e.target.closest?.('#pads .pad[data-id]');
    if (!pad || body.classList.contains('editing')) return;
    if (++padTaps >= PAD_TAPS_FOR_TIP) showTip('tip-pads');
  }, true);
  // A dotted button's first tap: its dot goes, for good.
  body.addEventListener('click', (e) => {
    for (const d of DOTS) if (e.target.closest?.(d.on) && guided()) markSeen(d.id);
  }, true);
  // Another person, a sync, a backup, a new level: their own dots.
  onSetting('seen', showDots);
  onSetting('level', showDots);
  showDots();
  // The sound sheet: its tip once it is open (watchers hear of a dialog just
  // before it opens), in the banner, which moves into it.
  onDialogOpen((d) => {
    if (d?.id === 'sheet') Promise.resolve().then(() => showTip('tip-sheet', { inDialog: true }));
  });
  const again = document.querySelector('#help-tips');
  again?.addEventListener('click', async () => {
    await showTipsAgain();
    showBanner('💡 The tips will show again as you play.');
  });
}
