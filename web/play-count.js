// How much was played this visit, for the one `noodlepads.play` event
// (track-page.js sends it when the page hides). Pads, keys, roll notes and
// song blocks are play, not controls, so `control.use` leaves them out; this
// counts them in memory, one number each, and forgets them once taken.
// Never which sound, beat or song, and nothing is kept while the usage switch
// is off (usage.js) or after a reload.

import { usageOn } from './usage.js';

export const PLAY_KINDS = ['pads', 'keys', 'notes', 'blocks', 'kids'];
let counts = {};

// One more of `kind` (pads, keys, notes, blocks, kids). Anything else, or the
// switch off: nothing counted.
export function countPlay(kind) {
  if (!usageOn() || !PLAY_KINDS.includes(kind)) return;
  counts[kind] = (counts[kind] ?? 0) + 1;
}

// The usage switch went off: what was counted goes.
export const clearPlay = () => { counts = {}; };

// What was played since the last take, as {kind: n}, or null when nothing was.
export function takePlay() {
  const out = counts;
  counts = {};
  return Object.keys(out).length ? out : null;
}
