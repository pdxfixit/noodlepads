// The board model bound to the app's state: the lookups every screen makes
// ("who is showing", "their sounds in order"). The logic is in model.js.

import { state } from './state.js';
import { getSetting } from './settings.js';
import {
  mergePeople, colorName as paletteColorName, padColor as paletteColor, clipsForPerson,
} from './model.js';

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
export function clipsFor(personId, { includeHidden = false, allPresets = false } = {}) {
  return clipsForPerson(person(personId), {
    overrides: state.overrides,
    userClips: state.userClips,
    order: state.orders.get(personId)?.ids,
    includeHidden,
    advanced: allPresets || getSetting('advancedBeats') === true,
  });
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
