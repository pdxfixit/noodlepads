// Instruments (ADR 0030): who plays the Notes, Chords and Bass. An
// instrument is a view over the kit, never a group of pads of its own: each
// one's notes are presets of their own (`piano-e`, boards.json `inst`), in
// the same group as today's, and the person's pick says which of them that
// group shows. A beat row, key or band keeps the exact preset it was given,
// so picking another instrument never changes anything already made.
//
// Pure: the list, the person's pick as settings, which presets a pick
// shows, and the sum that turns one recording into any note or chord of it
// (boards.json `shift` and `chord`). No DOM, no storage, no imports, so the
// settings, the problem reports' allowlist and the Worker can all read it.

// The families, in the picker's order, each with its color (the picker's
// headings and the instrument badges). Each color is dark enough for white text.
export const FAMILIES = [
  { id: 'keys', name: 'Keys', emoji: '🎹', color: '#3F3AA8' },
  { id: 'mallets', name: 'Mallets', emoji: '🪵', color: '#8A3B00' },
  { id: 'strings', name: 'Strings', emoji: '🎻', color: '#0C5E4B' },
  { id: 'wind', name: 'Wind', emoji: '🌬️', color: '#9E1640' },
];

// Every instrument, by family, and which groups it can play. Pluck (Notes)
// and Synth (Chords, Bass) are the sounds those groups always had: their
// presets carry no `inst` in boards.json.
export const INSTRUMENTS = [
  { id: 'pluck', name: 'Pluck', emoji: '💧', family: 'keys', groups: ['notes'] },
  { id: 'synth', name: 'Synth', emoji: '🎛️', family: 'keys', groups: ['chords', 'bass'] },
  { id: 'piano', name: 'Piano', emoji: '🎹', family: 'keys', groups: ['notes', 'chords'] },
  { id: 'organ', name: 'Organ', emoji: '⛪', family: 'keys', groups: ['notes', 'chords'] },
  { id: 'chip', name: 'Chip', emoji: '🎮', family: 'keys', groups: ['notes'] },
  // Boom keeps the id `808`: saved picks (`instBass`), backups and the
  // presets `808-c`… point at it. Only its name changed (no product names).
  { id: '808', name: 'Boom', emoji: '🌋', family: 'keys', groups: ['bass'] },
  { id: 'marimba', name: 'Marimba', emoji: '🪵', family: 'mallets', groups: ['notes'] },
  { id: 'steel', name: 'Steel drum', emoji: '🛢️', family: 'mallets', groups: ['notes'] },
  { id: 'kalimba', name: 'Kalimba', emoji: '✨', family: 'mallets', groups: ['notes'] },
  { id: 'guitar', name: 'Guitar', emoji: '🎸', family: 'strings', groups: ['notes', 'chords'] },
  { id: 'strings', name: 'Strings', emoji: '🎻', family: 'strings', groups: ['notes', 'chords'] },
  { id: 'upright', name: 'Upright', emoji: '🎻', family: 'strings', groups: ['bass'] },
  { id: 'brass', name: 'Brass', emoji: '🎺', family: 'wind', groups: ['notes'] },
  { id: 'flute', name: 'Flute', emoji: '🪈', family: 'wind', groups: ['notes'] },
];

// The groups an instrument can play, each with who plays it until the person
// picks, and the person setting that keeps their pick (settings.js).
export const PLAYED = {
  notes: { default: 'pluck', setting: 'instNotes' },
  chords: { default: 'synth', setting: 'instChords' },
  bass: { default: 'synth', setting: 'instBass' },
};

export const instrumentById = (id) => INSTRUMENTS.find((i) => i.id === id) ?? null;

// The instruments that can play `group`, in the picker's order.
export const instrumentsFor = (group) => INSTRUMENTS.filter((i) => i.groups.includes(group));

// Each setting's allowed values, for settings.js and log-clean.js.
export const instrumentIds = (group) => instrumentsFor(group).map((i) => i.id);

// Who plays a kit preset: its `inst`, else its group's own sound. Null for a
// preset in a group no instrument plays (drums, animals…).
export function presetInstrument(clip) {
  if (!Object.hasOwn(PLAYED, clip?.group)) return null;
  return clip.inst ?? PLAYED[clip.group].default;
}

// Whether a kit preset shows under `picks` ({notes: 'piano', …}, the
// person's settings; a group missing from it shows its own sound). Presets
// in groups no instrument plays always show.
export function showsFor(clip, picks = {}) {
  const inst = presetInstrument(clip);
  if (!inst) return true;
  const picked = picks[clip.group];
  return inst === (instrumentsFor(clip.group).some((i) => i.id === picked) ? picked : PLAYED[clip.group].default);
}

// The id of `inst`'s copy of one of a group's own presets, as
// tools/kit_instruments.py names it: `piano-e` for note-e, `piano-am-chord`
// for chord-am (`piano-chord-am` would end in `-chord-am`, which lookups
// read as chord-am's), `808-c` for bass-c.
export function instrumentKitId(inst, ownId) {
  const [kind, ...rest] = ownId.split('-');
  return kind === 'chord' ? `${inst}-${rest.join('-')}-chord` : `${inst}-${rest.join('-')}`;
}

// The group's own preset an instrument's preset plays (`note-e` for
// piano-e), or the preset itself when it is one of the group's own. `clip`
// is a kit clip (boards.json's entry, or a person's copy with `kitId`).
export const ownIdOf = (clip) => clip?.plays ?? clip?.kitId ?? clip?.id ?? null;

// The kit id of `inst`'s copy of the group's own preset `ownId`: the same
// note, chord or bass note on another instrument. The group's own sound
// (Pluck, Synth) is `ownId` itself. Null when `inst` doesn't play `group`.
// A tune row, key or band swapped this way keeps every note: each
// instrument's preset plays exactly the note its `plays` preset plays.
export function versionFor(ownId, group, inst) {
  if (!Object.hasOwn(PLAYED, group) || !instrumentsFor(group).some((i) => i.id === inst)) return null;
  return inst === PLAYED[group].default ? ownId : instrumentKitId(inst, ownId);
}

// Every instrument's preset ids, from the groups' own preset ids (`note-…`,
// `chord-…`, `bass-…`; others are left out): the ids boards.json should hold
// for the instruments (tests/instruments.test.mjs checks it does).
export function kitIdsOf(ownIds) {
  const groupOf = { note: 'notes', chord: 'chords', bass: 'bass' };
  return INSTRUMENTS.filter((i) => !Object.values(PLAYED).some((p) => p.default === i.id)).flatMap((i) => ownIds
    .filter((id) => i.groups.includes(groupOf[id.split('-')[0]]))
    .map((id) => instrumentKitId(i.id, id)));
}

// ── One recording, any note ──

// How much faster a sound plays to sound `semitones` higher: the tune row's
// rate (beat.js noteRate is this), the way a sampler moves a sound.
export const rateOf = (semitones) => 2 ** ((semitones || 0) / 12);

// The most a preset may move its recording: past this a sound turns into a
// chipmunk or a growl (more-kinds-of-music.md, pushback 2).
export const MAX_SHIFT = 12;

// The semitones a boards.json preset moves its file by: [shift] for one
// note, `chord` for several at once, or null when it plays the file as it is.
export function voicingOf(clip) {
  if (Array.isArray(clip?.chord) && clip.chord.length) return clip.chord;
  if (Number.isInteger(clip?.shift) && clip.shift !== 0) return [clip.shift];
  return null;
}

// One channel played at each of `semitones` at once, summed and brought back
// to the recording's own peak: a note moved up or down (shorter when higher,
// as a sampler does), or a chord from one note. Four-point (Catmull-Rom)
// interpolation between samples. Returns a new Float32Array.
export function voice(samples, semitones) {
  const rates = semitones.map(rateOf);
  const length = Math.max(1, ...rates.map((r) => Math.floor((samples.length - 1) / r)));
  const out = new Float32Array(length);
  const at = (i) => (i < 0 || i >= samples.length ? 0 : samples[i]);
  for (const r of rates) {
    const n = Math.floor((samples.length - 1) / r);
    for (let j = 0; j < n; j++) {
      const p = j * r;
      const i = Math.floor(p);
      const f = p - i;
      const a = at(i - 1), b = samples[i], c = at(i + 1), d = at(i + 2);
      out[j] += b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
    }
  }
  let peak = 0, outPeak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  for (const s of out) outPeak = Math.max(outPeak, Math.abs(s));
  if (outPeak > 0 && peak > 0) {
    const g = peak / outPeak;
    for (let j = 0; j < out.length; j++) out[j] *= g;
  }
  return out;
}

// Checks one boards.json preset's instrument fields. Returns a sentence
// saying what is wrong, or null (model.js validateManifest).
export function instrumentProblem(c) {
  if (c.inst !== undefined) {
    const inst = instrumentById(c.inst);
    if (!inst) return `the kit sound "${c.id}" has an unknown instrument "${c.inst}"`;
    if (!inst.groups.includes(c.group)) return `the kit sound "${c.id}" is ${inst.name}, which doesn't play ${c.group}`;
  }
  if (c.shift !== undefined && !(Number.isInteger(c.shift) && Math.abs(c.shift) <= MAX_SHIFT)) return `the kit sound "${c.id}" has a "shift" that isn't a whole number from -${MAX_SHIFT} to ${MAX_SHIFT}`;
  if (c.chord !== undefined && !(Array.isArray(c.chord) && c.chord.length >= 1 && c.chord.length <= 6
    && c.chord.every((s) => Number.isInteger(s) && Math.abs(s) <= MAX_SHIFT))) return `the kit sound "${c.id}" has a "chord" that isn't 1 to 6 whole numbers from -${MAX_SHIFT} to ${MAX_SHIFT}`;
  return null;
}
