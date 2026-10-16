// 🎛️ The level-up nudge (ADR 0028; Ben, 2026-10-16: "as a notification in
// the upgrade space, but maybe it fades after awhile"). Regular only, never
// 🧸 Kids (a kid can't read it, and leaving Kids is the grown-up sum).
//
// When a Regular person keeps reaching for what Advanced adds, Advanced is
// offered once. A reach is opening 🎚️ Mixer, opening 🎹 a tune (the piano
// roll) or opening + Add a layer in the sound sheet; each is kept with this
// visit's id in the person setting `reaches` (firsts.js). Three of them over
// at least two visits make the offer (the agent's call on the trigger,
// 2026-10-16): "🎛️ Want more knobs?" with Try Advanced and ✕, in the bar
// where 🆕 update shows, in its look. A thin line along its foot runs down,
// then after about 12 s it fades; a finger, the mouse or focus on it holds it,
// as the banner is held. Try Advanced sets the level and offers ↩️ Undo in
// the banner. ✕, a fade or Try Advanced: never again ('nudge' in `seen`).
// The update bar wins: while it shows, the nudge hides and waits, and so it
// does while a dialog is open.

import { getSetting, setSetting, onSetting } from './settings.js';
import { showBanner, fadeAway, stopFade } from './ui.js';
import { onDialogOpen } from './dialogs.js';
import { firstStepsOn, withReach, nudgeDue } from './firsts.js';
import { markSeen } from './tips.js';

export const NUDGE_MS = 12000;   // shown this long before it fades (styles.css .nudge-time runs as long)
export const TICK_MS = 2000;     // how often a waiting offer looks for a quiet moment
const VISIT = Date.now().toString(36);   // this page load: a visit

const el = {};
let showing = false;
let waiting = null;   // the timer looking for a moment to show it

const due = () => firstStepsOn() && nudgeDue({ level: getSetting('level'), seen: getSetting('seen'), reaches: getSetting('reaches') });
const updateShows = () => el.update && !el.update.hidden;
const quiet = () => !updateShows() && !document.querySelector('dialog[open]');

// One reach for more: kept, then the offer if it is due.
export async function reach() {
  if (!firstStepsOn() || getSetting('level') !== 'regular') return;
  await setSetting('reaches', withReach(getSetting('reaches'), VISIT)).catch((err) => console.error('Keeping a reach failed:', err));
  nudgeTick();
}

// Shows the offer when it is due and the moment is quiet; hides it again,
// unseen, when the update bar comes. Returns whether it shows.
export function nudgeTick() {
  if (!el.bar) return false;
  if (showing) {
    if (!due()) hide();
    else if (updateShows()) hide();   // the update bar wins; the nudge waits
    return showing;
  }
  if (!due()) { stopWaiting(); return false; }
  if (!quiet()) { if (!waiting) waiting = setInterval(nudgeTick, TICK_MS); return false; }
  stopWaiting();
  show();
  if (!waiting) waiting = setInterval(nudgeTick, TICK_MS);   // to give way to the update bar
  return true;
}

function stopWaiting() {
  clearInterval(waiting);
  waiting = null;
}

function show() {
  showing = true;
  el.bar.classList.remove('held');
  el.bar.hidden = false;
  // The thin line starts full each time it shows.
  const line = el.bar.querySelector('.nudge-time');
  if (line) { line.style.animation = 'none'; void line.offsetWidth; line.style.animation = ''; }
  fadeAway(el.bar, NUDGE_MS, { then: () => { showing = false; done(); } });
}

function hide() {
  showing = false;
  stopFade(el.bar);
  el.bar.hidden = true;
}

// Answered (✕, Try Advanced) or faded: never again.
function done() {
  hide();
  stopWaiting();
  markSeen('nudge');
}

async function tryAdvanced() {
  done();
  await setSetting('level', 'advanced');
  showBanner('🎛️ Advanced is on: more knobs, everywhere.', {
    action: { label: '↩️ Undo', fn: () => setSetting('level', 'regular') },
  });
}

export function initNudge() {
  Object.assign(el, {
    bar: document.querySelector('#nudge-bar'),
    update: document.querySelector('#update-bar'),
    tryIt: document.querySelector('#nudge-try'),
    close: document.querySelector('#nudge-close'),
  });
  if (!el.bar) return;
  el.tryIt.addEventListener('click', tryAdvanced);
  el.close.addEventListener('click', done);
  // Held, the line is full again and waits (fadeAway holds the fade).
  for (const type of ['pointerenter', 'focusin']) el.bar.addEventListener(type, () => el.bar.classList.add('held'));
  for (const type of ['pointerleave', 'focusout']) el.bar.addEventListener(type, () => { if (!el.bar.contains(document.activeElement)) el.bar.classList.remove('held'); });
  // The reaches: 🎚️ Mixer and 🎹 the piano roll opening, + Add a layer opening its palette.
  onDialogOpen((d) => { if (d?.id === 'mixer' || d?.id === 'roll') reach(); });
  // + Add a layer counts when the tap opened its palette (read once the
  // sheet's own handler has run), not when it closed it.
  document.body.addEventListener('click', (e) => {
    const add = e.target.closest?.('#layer-add');
    if (add) setTimeout(() => { if (add.getAttribute('aria-expanded') === 'true') reach(); }, 0);
  });
  // A level or person change: an offer that no longer fits goes.
  onSetting('level', () => nudgeTick());
  nudgeTick();
}
