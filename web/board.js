// The board model bound to the app's state: the lookups every screen makes
// ("who is showing", "their sounds in order"). The logic is in model.js.

import { state, persist } from './state.js';
import { getSetting } from './settings.js';
import { landed } from './landed.js';
import {
  mergePeople, colorName as paletteColorName, padColor as paletteColor, clipsForPerson,
} from './model.js';
import { PLAYED } from './instruments.js';

// People: boards.json's, with any rename, recolor or hide applied, then the
// people added in the app. Hidden people are left out unless asked for.
export function people({ includeHidden = false } = {}) {
  return mergePeople(state.manifest.people, state.peopleEdits, { includeHidden, kit: state.manifest.kit });
}

export function person(id) {
  return people().find((p) => p.id === id);
}

export function currentPerson() {
  return person(state.personId);
}

export function colorName(name) {
  return paletteColorName(state.manifest.palette, name);
}

export function padColor(name) {
  return paletteColor(state.manifest.palette, name, (c) => CSS.supports('color', c));
}

export function paletteNames() {
  return Object.keys(state.manifest.palette);
}

// Advanced-only presets (the sharps and flats) show only with ⚙️ Advanced
// on. `allPresets` keeps them whatever the switch says: for looking up a
// sound something already uses (a beat's row, a DJ key), which must keep
// playing when Advanced is turned off.
// The Notes, Chords and Bass presets are those of the instrument the person
// showing picked (ADR 0030); `allPresets` keeps every instrument's too.
// `ownSounds` shows the groups' own sounds (Pluck, Synth) whatever the
// pick: for the person's default keys and touch layout, which never change
// under them when they pick another instrument.
export function clipsFor(personId, { includeHidden = false, allPresets = false, ownSounds = false } = {}) {
  // Someone just deleted is still on show while their sheet waits on their
  // cloud copy (people.js): a redraw then (a phone turned) finds no sounds.
  const p = person(personId);
  if (!p) return [];
  return clipsForPerson(p, {
    overrides: state.overrides,
    userClips: state.userClips,
    order: state.orders.get(personId)?.ids,
    includeHidden,
    advanced: allPresets || getSetting('advancedBeats') === true,
    picks: allPresets ? null : ownSounds ? {} : instrumentPicks(),
  });
}

// Who plays each group for the person showing: {notes: 'piano', …}.
export function instrumentPicks() {
  return Object.fromEntries(Object.entries(PLAYED).map(([group, p]) => [group, getSetting(p.setting)]));
}

// Any sound on any board by id, Advanced-only presets included: what a beat,
// a DJ key or a song follows.
export function anyClip(id) {
  return people().flatMap((p) => clipsFor(p.id, { allPresets: true })).find((c) => c.id === id);
}

export function findClip(id) {
  return clipsFor(state.personId, { includeHidden: true, allPresets: true }).find((c) => c.id === id);
}

// The palette color a new sound gets on this board: they cycle, so a board's
// sounds are not all the same color.
export function nextClipColor(personId) {
  const names = paletteNames();
  return names[clipsFor(personId, { includeHidden: true }).length % names.length];
}

// A new sound of a kid's own (model.js newClip) added to the board and
// stored. Resolves to whether storage took it (`persist`: false when the
// browser refused, and the clip stays in memory for this visit).
export function addClip(clip) {
  state.userClips.push(clip);
  landed('#pads-tab');
  return persist('clips', clip);
}
