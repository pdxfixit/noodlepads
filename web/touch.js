// The touch layout's pure rules (ADR 0028): 🎤 Live and Beats with ⌨️ Keys
// played with 👆 instead of ⌨️, on a screen with no keyboard in sight. Ben,
// 2026-10-16: "not tied to a kbd… preset groups (chords, drums etc)… far
// simpler in how to construct the layout and size of the tiles".
//
// A touch layout is a list of bands, top to bottom. Each band is one group
// (a kit group like Drums or Chords, or 🎤 My sounds) holding a list of
// sounds, with one size for all its tiles: S, M or L, 5, 4 or 2 across on a
// phone. No DOM, no audio, no storage: dj-touch.js draws and listens.
//
//   touch  {bands: [{group, size: 's' | 'm' | 'l', sounds: [clipId…]}]}
//
// Sounds are the person's own clip ids (`<person>-kick` for their copy of
// the kit), as the keys are. Every function returns a new layout and never
// changes the one it was given.

export const MINE = 'mine';                       // 🎤 My sounds, the person's own
export const SIZES = { s: 5, m: 4, l: 2 };        // tiles across on a phone (Ben, 2026-10-16)
export const SIZE_NAMES = { s: 'Small', m: 'Medium', l: 'Large' };
export const MAX_BANDS = 8;
export const MAX_BAND_SOUNDS = 40;
export const MAX_TOUCH_LAYOUTS = 500;             // saved per person, as key layouts
export const MAX_TOUCH_NAME = 24;
export const TOUCH_ID = /^touch-[a-z0-9-]{1,48}$/;
const GROUP_ID = /^[a-z0-9-]{1,32}$/;

// What a new band of a group starts with (kit ids, boards.json `kit`). A
// group not named here starts with its first sounds, as many as fit one line.
export const STARTERS = {
  drums: ['kick', 'snare', 'hihat', 'clap'],
  chords: ['chord-c', 'chord-am', 'chord-f', 'chord-g'],
  notes: ['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high'],
  bass: ['bass-c', 'bass-d', 'bass-e', 'bass-g', 'bass-a'],
};
// The size a new band of a group starts at: big drums to hit, chords and
// notes a line of four, bass a line of five.
const START_SIZE = { drums: 'l', chords: 'm', notes: 'm', bass: 's' };
export const startSize = (group) => START_SIZE[group] ?? 'm';

// The ready-made touch layouts: code, never stored, so they pick up a kit
// change. Each band's `sounds` are kit ids; left out, the group's starters.
export const READY_TOUCH = [
  {
    id: 'band', emoji: '🎸', name: 'Band',
    bands: [{ group: 'chords', size: 'm' }, { group: 'drums', size: 'l' }, { group: 'bass', size: 's' }],
  },
  {
    id: 'drum-kit', emoji: '🥁', name: 'Drum kit',
    bands: [
      { group: 'drums', size: 'l', sounds: ['kick', 'snare'] },
      { group: 'drums', size: 'm', sounds: ['hihat', 'open-hat', 'clap', 'crash'] },
      { group: 'drums', size: 's', sounds: ['tom-high', 'tom-low', 'cowbell', 'shaker', 'tambourine'] },
    ],
  },
  {
    id: 'chords-bass', emoji: '🎹', name: 'Chords and bass',
    bands: [
      { group: 'chords', size: 'm', sounds: ['chord-c', 'chord-dm', 'chord-em', 'chord-f', 'chord-g', 'chord-am', 'chord-g7'] },
      { group: 'bass', size: 's', sounds: ['bass-c', 'bass-d', 'bass-e', 'bass-f', 'bass-g'] },
    ],
  },
  {
    id: 'zoo-band', emoji: '🐾', name: 'Zoo band',
    bands: [
      { group: 'animals', size: 'm', sounds: ['moo', 'quack', 'tweet', 'roar', 'meow', 'woof', 'ribbit', 'buzz'] },
      { group: 'silly', size: 's', sounds: ['honk', 'boing', 'slide-whistle', 'burp', 'toot'] },
      { group: 'drums', size: 'l', sounds: ['kick', 'clap'] },
    ],
  },
];

// The person's sounds, as these rules need them. `clips` is what the person
// plays (board.js clipsFor): their own sounds and their copies of the kit
// (`<pid>-<kit id>`, with `kit` and `group`). Returns {kit: kit id -> clip
// id, groups: group -> clip ids in board order, MINE newest first}.
export function soundsOf(clips, pid) {
  const kit = new Map();
  const groups = new Map();
  const own = [];
  for (const c of clips ?? []) {
    if (!c?.id) continue;
    if (!c.kit) { own.push(c); continue; }
    kit.set(c.id.startsWith(`${pid}-`) ? c.id.slice(pid.length + 1) : c.id, c.id);
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group).push(c.id);
  }
  own.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  groups.set(MINE, own.map((c) => c.id));
  return { kit, groups };
}

const groupSounds = (sounds, group) => sounds.groups.get(group) ?? [];
const unique = (ids) => [...new Set(ids.filter((id) => typeof id === 'string' && id))];

// The sounds a new band of `group` starts with.
export function startingSounds(group, sounds) {
  const all = groupSounds(sounds, group);
  const fromKit = (STARTERS[group] ?? []).map((k) => sounds.kit.get(k)).filter(Boolean);
  return fromKit.length ? fromKit : all.slice(0, SIZES[startSize(group)]);
}

export function newBand(group, sounds) {
  return { group, size: startSize(group), sounds: startingSounds(group, sounds) };
}

// A ready-made layout as one person's: kit ids become their copies; a kit
// sound they lack or have hidden is left out.
export function readyTouch(ready, sounds) {
  return {
    bands: ready.bands.map((b) => ({
      group: b.group,
      size: b.size,
      sounds: b.sounds ? unique(b.sounds.map((k) => sounds.kit.get(k))) : startingSounds(b.group, sounds),
    })),
  };
}

// The layout before the person changes anything: 🎸 Band, under the newest
// of their own sounds when they have some.
export function defaultTouch(sounds) {
  const band = readyTouch(READY_TOUCH[0], sounds);
  const mine = groupSounds(sounds, MINE);
  return mine.length ? { bands: [newBand(MINE, sounds), ...band.bands] } : band;
}

const copy = (t) => ({ bands: (t?.bands ?? []).map((b) => ({ ...b, sounds: [...b.sounds] })) });
const at = (t, i) => (Number.isInteger(i) && i >= 0 && i < (t?.bands?.length ?? 0) ? i : -1);

// ── Changing a layout (✏️ Edit layout) ──

// A new band at the bottom; a full layout (MAX_BANDS) stays as it is.
export function addBand(t, band) {
  const out = copy(t);
  if (out.bands.length >= MAX_BANDS) return out;
  out.bands.push({ group: band.group, size: SIZES[band.size] ? band.size : 'm', sounds: unique(band.sounds ?? []).slice(0, MAX_BAND_SOUNDS) });
  return out;
}

export function removeBand(t, i) {
  const out = copy(t);
  if (at(out, i) >= 0) out.bands.splice(i, 1);
  return out;
}

// Band `from` moved to place `to` (both counted before the move).
export function moveBand(t, from, to) {
  const out = copy(t);
  if (at(out, from) < 0) return out;
  const dest = Math.max(0, Math.min(out.bands.length - 1, to));
  const [band] = out.bands.splice(from, 1);
  out.bands.splice(dest, 0, band);
  return out;
}

export function setSize(t, i, size) {
  const out = copy(t);
  if (at(out, i) >= 0 && SIZES[size]) out.bands[i].size = size;
  return out;
}

// The group's sounds not in band `i` yet, in the group's order.
export function remainingSounds(t, i, sounds) {
  if (at(t, i) < 0) return [];
  const band = t.bands[i];
  const have = new Set(band.sounds);
  return groupSounds(sounds, band.group).filter((id) => !have.has(id));
}

// Sounds added at the end of band `i` (each once, up to MAX_BAND_SOUNDS).
export function addSounds(t, i, ids) {
  const out = copy(t);
  if (at(out, i) < 0) return out;
  out.bands[i].sounds = unique([...out.bands[i].sounds, ...ids]).slice(0, MAX_BAND_SOUNDS);
  return out;
}

// Tile `k` of band `i` plays `id` instead. A sound already elsewhere in the
// band trades places with it, so a band never holds a sound twice.
export function swapTile(t, i, k, id) {
  const out = copy(t);
  if (at(out, i) < 0 || typeof id !== 'string' || !id) return out;
  const tiles = out.bands[i].sounds;
  if (!(k >= 0 && k < tiles.length)) return out;
  const there = tiles.indexOf(id);
  if (there >= 0) tiles[there] = tiles[k];
  tiles[k] = id;
  return out;
}

export function removeTile(t, i, k) {
  const out = copy(t);
  if (at(out, i) >= 0 && k >= 0 && k < out.bands[i].sounds.length) out.bands[i].sounds.splice(k, 1);
  return out;
}

// ── Comparing and ordering ──

export function sameTouch(a, b) {
  return JSON.stringify(cleanTouch(a)?.bands ?? []) === JSON.stringify(cleanTouch(b)?.bands ?? []);
}

// Before a layout replaces this one, the one on screen when it is the kid's
// own: anything that is not just one of `layouts`. Kept as ⭐ My layout, so
// loading a layout never loses a hand-made one.
export function keepAsMine(current, layouts) {
  return layouts.some((l) => sameTouch(l, current)) ? null : copy(cleanTouch(current));
}

// Every sound in the layout, top band first, each once.
export const touchSounds = (t) => unique((t?.bands ?? []).flatMap((b) => b.sounds));

// The beat's rows (Beats with ⌨️ Keys, 👆) in the layout's order: band by
// band, tile by tile; a row whose sound is not in it goes last, as before.
// Returns the rows' indexes (rhythm.js keyboardOrder, for the keys).
export function touchOrder(rows, t) {
  const place = new Map(touchSounds(t).map((id, n) => [id, n]));
  const of = (i) => place.get(rows[i]?.clipId) ?? Infinity;
  return rows.map((_, i) => i).sort((a, b) => (of(a) === of(b) ? a - b : of(a) - of(b)));
}

// ── Cleaning: the app's own, and anything from a backup or the cloud ──

export function cleanBand(b) {
  if (!b || typeof b !== 'object' || !GROUP_ID.test(b.group)) return null;
  const sounds = Array.isArray(b.sounds) ? unique(b.sounds.map((id) => (typeof id === 'string' ? id.slice(0, 64) : null))).slice(0, MAX_BAND_SOUNDS) : [];
  return { group: b.group, size: SIZES[b.size] ? b.size : 'm', sounds };
}

// A live touch layout (`decks.touch`, `decks.touchMine`): {bands} with at
// most MAX_BANDS, or null.
export function cleanTouch(t) {
  if (!t || typeof t !== 'object' || !Array.isArray(t.bands)) return null;
  return { bands: t.bands.map(cleanBand).filter(Boolean).slice(0, MAX_BANDS) };
}

// A name typed for a touch layout: trimmed and cut to 24, or null when blank.
export function touchName(v) {
  const name = typeof v === 'string' ? [...v.trim().replace(/\s+/g, ' ')].slice(0, MAX_TOUCH_NAME).join('').trim() : '';
  return name || null;
}

// A saved touch layout (IndexedDB `touchLayouts`): {id, personId, name, created, bands}.
export function cleanTouchLayout(l) {
  if (!TOUCH_ID.test(l?.id) || typeof l.personId !== 'string') return null;
  const t = cleanTouch(l);
  if (!t) return null;
  return {
    id: l.id,
    personId: l.personId.slice(0, 64),
    name: touchName(l.name) ?? 'Layout',
    created: Number.isFinite(l.created) ? l.created : Date.now(),
    bands: t.bands,
  };
}
