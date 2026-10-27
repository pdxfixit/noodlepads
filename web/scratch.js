// The scratch beat and the scratch song (ADR 0020): one of each per person,
// open whenever nothing else is, to play with without filling 🗂️ My beats. A
// groove loads into the scratch beat; 💾 Keep turns either into a named one
// in 🗂️ My beats, and the scratch starts empty again.
//
// The scratch is an ordinary record in `beats` (or `songbook`) with a
// reserved id, so it syncs and backs up like every other beat or song with
// no new store, backup format or cloud kind. The id is made from the person's
// id (`beat-scratch-<person>`), so two devices that start one offline make
// the same record and the cloud merges them. After a person's id changes
// (reid.js) the record keeps its old id and is still found by its prefix and
// `personId`. Pure: no DOM, no storage.

import { GROOVES } from './grooves.js';

export const SCRATCH_BEAT = 'beat-scratch-';
export const SCRATCH_SONG = 'song-scratch-';
// 🧸 Kids' beat before ADR 0020 (`beat-kids-<random>`): it becomes the scratch.
export const KIDS_BEAT = 'beat-kids-';
// The name a plain scratch is stored under. A backup or the cloud gives an
// empty name a default, so the scratch has one of its own; a scratch loaded
// from a groove is stored under the groove's name instead.
export const SCRATCH_NAME = 'Scratch';

const idFor = (prefix, personId) => `${prefix}${String(personId ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`.slice(0, 53);
export const scratchId = (personId) => idFor(SCRATCH_BEAT, personId);
export const songScratchId = (personId) => idFor(SCRATCH_SONG, personId);

const starts = (r, prefix) => typeof r?.id === 'string' && r.id.startsWith(prefix);
export const isScratch = (beat) => starts(beat, SCRATCH_BEAT);
export const isScratchSong = (song) => starts(song, SCRATCH_SONG);
export const isKidsBeat = (beat) => starts(beat, KIDS_BEAT);
// Beats never listed in 🗂️ My beats, the pattern chips, a song's beats or Share.
export const isHiddenBeat = (beat) => isScratch(beat) || isKidsBeat(beat);

// The person's scratch record among `list` (beats or songs), or null. Should
// there be two (a person whose id changed, then started one again), the one
// changed last.
function newest(list, personId, test) {
  return (list ?? []).filter((r) => r?.personId === personId && test(r))
    .sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0))[0] ?? null;
}
export const scratchOf = (beats, personId) => newest(beats, personId, isScratch);
export const songScratchOf = (songs, personId) => newest(songs, personId, isScratchSong);

export const hasHits = (beat) => (beat?.rows ?? []).some((r) => (r?.steps ?? []).some(Boolean));

// The groove a scratch came from, by the name it is stored under, or null.
// A groove renamed since keeps its old names in `was` ("Motown" is Detroit
// soul now), so a scratch saved before still shows and keeps under the new.
export const grooveOf = (beat) => (isScratch(beat)
  && GROOVES.find((g) => g.name === beat.name || g.was?.includes(beat.name))) || null;

// What the beat bar shows for a scratch: "Scratch beat", or the groove's
// name and "(scratch)".
export function scratchLabel(beat) {
  const g = grooveOf(beat);
  return g ? `${g.name} (scratch)` : 'Scratch beat';
}

// 🧸 Kids' old beat, adopted (ADR 0020: "Kids mode's one beat is that
// person's scratch"). For each `beat-kids-…` of the person's: with no hits
// it goes; with hits it becomes the scratch if the scratch is missing or has
// none, else it becomes a beat of its own (a new id, so it shows in 🗂️ My beats)
// and nothing is lost. Returns {put: [records], remove: [ids]}.
export function adoptKidsBeats(beats, personId, makeId, now = Date.now()) {
  const put = [];
  const remove = [];
  let scratch = scratchOf(beats, personId);
  for (const kids of (beats ?? []).filter((b) => b?.personId === personId && isKidsBeat(b))) {
    remove.push(kids.id);
    if (!hasHits(kids)) continue;
    if (!scratch || !hasHits(scratch)) {
      scratch = { ...structuredClone(kids), id: scratch?.id ?? scratchId(personId), name: SCRATCH_NAME, saved: now };
      put.push(scratch);
    } else {
      put.push({ ...structuredClone(kids), id: makeId(), saved: now });
    }
  }
  return { put, remove };
}
