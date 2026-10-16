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

import { getSetting, setSetting } from './settings.js';
import { showBanner, bannerShowing } from './ui.js';
import { onDialogOpen } from './dialogs.js';
import { firstStepsOn, seenSet, withSeen, withoutTips, TIPS, PAD_TAPS_FOR_TIP } from './firsts.js';

let deps = { kids: () => false, keysOn: () => false, beatHasHits: () => true };
let tipThisVisit = false;   // a tip has shown on this screen visit
let padTaps = 0;            // pad taps on 🔊 Pads this visit
let lastTip = null;         // the banner of the last tip, which a new tip may replace

// Regular and Advanced, on their own screens, with first steps on.
export const guided = () => firstStepsOn() && getSetting('level') !== 'kids' && !deps.kids();

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
