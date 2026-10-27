// The touch layout's pure rules (ADR 0029): 🎤 Live and Beats with ⌨️ Keys
// played with 👆 instead of ⌨️, on a screen with no keyboard in sight. Ben,
// 2026-10-16: "not tied to a kbd… preset groups (chords, drums etc)… far
// simpler in how to construct the layout and size of the tiles".
//
// A touch layout is a list of bands, top to bottom. Each band is one group
// (a kit group like Drums or Chords, or 🎤 Sounds) holding a list of
// sounds, with one size for all its tiles: S, M or L, 5, 4 or 2 across on a
// phone. No DOM, no audio, no storage: dj-touch.js draws and listens.
//
//   touch  {bands: [{group, size: 's' | 'm' | 'l', sounds: [clipId…]}], grid?}
//
// With a `grid` (touch-grid.js, ADR 0032) the bands sit in blocks side by
// side instead, each block's pads filling it, and `size` waits unused.
//
// Sounds are the person's own clip ids (`<person>-kick` for their copy of
// the kit), as the keys are. Every function returns a new layout and never
// changes the one it was given.

import { cleanGrid, settle, dropBand } from './touch-grid.js';
import { cutName, MAX_NAME } from './names.js';

export const MINE = 'mine';                       // 🎤 Sounds, the person's own
export const SIZES = { s: 5, m: 4, l: 2 };        // tiles across on a phone (Ben, 2026-10-16)
export const SIZE_NAMES = { s: 'Small', m: 'Medium', l: 'Large' };
export const MAX_BANDS = 8;
export const MAX_BAND_SOUNDS = 40;
export const MAX_TOUCH_LAYOUTS = 500;             // saved per person, as key layouts
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
// id, groups: group -> clip ids in board order, MINE newest first}. An
// instrument's preset (ADR 0030) also stands for the group's own preset it
// plays (`plays`), when that one isn't listed: with Piano picked, a band of
// Notes starts on the piano's C D E.
//
// `same` maps a kit sound to the group's own preset it plays (`note-c` for
// the piano's C too), so the layout offers a note once whoever plays it;
// `pid` is the person's id.
export function soundsOf(clips, pid) {
  const kit = new Map();
  const groups = new Map();
  const own = [];
  const plays = new Map();
  const same = new Map();
  for (const c of clips ?? []) {
    if (!c?.id) continue;
    if (!c.kit) { own.push(c); continue; }
    if (c.plays) plays.set(c.plays, plays.get(c.plays) ?? c.id);
    const kitId = c.id.startsWith(`${pid}-`) ? c.id.slice(pid.length + 1) : c.id;
    same.set(c.id, c.plays ?? kitId);
    kit.set(kitId, c.id);
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group).push(c.id);
  }
  for (const [ownId, id] of plays) if (!kit.has(ownId)) kit.set(ownId, id);
  own.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  groups.set(MINE, own.map((c) => c.id));
  return { kit, groups, same, pid };
}

const groupSounds = (sounds, group) => sounds.groups.get(group) ?? [];
const unique = (ids) => [...new Set(ids.filter((id) => typeof id === 'string' && id))];

// The sounds a new band of `group` starts with.
export function startingSounds(group, sounds) {
  const all = groupSounds(sounds, group);
  const fromKit = (STARTERS[group] ?? []).map((k) => sounds.kit.get(k)).filter(Boolean);
  return fromKit.length ? fromKit : all.slice(0, SIZES[startSize(group)]);
}

// A new band of `group`. Added to layout `t`, it starts with the starters
// not on the board yet, topped up with the group's next free sounds, so a
// second band of Drums starts where the first one ends.
export function newBand(group, sounds, t = null) {
  const start = startingSounds(group, sounds);
  if (!t) return { group, size: startSize(group), sounds: start };
  const free = offeredSounds(t, group, sounds);
  const kept = start.filter((id) => free.includes(id));
  const more = free.filter((id) => !kept.includes(id)).slice(0, start.length - kept.length);
  return { group, size: startSize(group), sounds: [...kept, ...more] };
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

const copy = (t) => {
  const out = { bands: (t?.bands ?? []).map((b) => ({ ...b, sounds: [...b.sounds] })) };
  if (t?.grid) out.grid = JSON.parse(JSON.stringify(t.grid));
  return out;
};
const at = (t, i) => (Number.isInteger(i) && i >= 0 && i < (t?.bands?.length ?? 0) ? i : -1);

// ── Changing a layout (✏️ Layout (👆 Pads)) ──

// A new band at the bottom; a full layout (MAX_BANDS) stays as it is.
export function addBand(t, band) {
  const out = copy(t);
  if (out.bands.length >= MAX_BANDS) return out;
  out.bands.push({ group: band.group, size: SIZES[band.size] ? band.size : 'm', sounds: unique(band.sounds ?? []).slice(0, MAX_BAND_SOUNDS) });
  return out;
}

export function removeBand(t, i) {
  const out = copy(t);
  if (at(out, i) < 0) return out;
  out.bands.splice(i, 1);
  if (out.grid) out.grid = dropBand(out.grid, i);   // its block stays, empty
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

// What a sound is, for "already on the board": the group's own preset it
// plays (an instrument's C is the C), else its id.
function sameAs(sounds) {
  const pre = sounds?.pid ? `${sounds.pid}-` : null;
  return (id) => sounds?.same?.get(id) ?? (pre && id.startsWith(pre) ? id.slice(pre.length) : id);
}

// The sounds of `group` that + more or a tile's swap offers: those not
// anywhere in the layout yet (Ben, 2026-10-18: "anything already on the
// board wouldn't be available"), in the group's order. `keep`, the tile
// being swapped, still shows, as the one picked.
export function offeredSounds(t, group, sounds, keep = null) {
  const key = sameAs(sounds);
  const taken = new Set(touchSounds(t).filter((id) => id !== keep).map(key));
  return groupSounds(sounds, group).filter((id) => id === keep || !taken.has(key(id)));
}

// The group's sounds band `i` could still add: none already in the layout.
export function remainingSounds(t, i, sounds) {
  return at(t, i) < 0 ? [] : offeredSounds(t, t.bands[i].group, sounds);
}

// Band `i` at a new size. Smaller tiles fit more on a line (L 2, M 4, S 5
// across on a phone), so its last line is filled with the group's next
// sounds not in the layout yet, and no hole is left; bigger tiles keep
// every sound, wrapping onto more lines. A sound that is gone takes no
// place, as it shows none.
export function resizeBand(t, i, size, sounds) {
  const out = setSize(t, i, size);
  if (at(out, i) < 0 || !SIZES[size] || SIZES[size] <= SIZES[t.bands[i].size]) return out;
  const band = out.bands[i];
  const live = new Set([...(sounds?.groups?.values() ?? [])].flat());
  const shown = band.sounds.filter((id) => live.has(id)).length;
  const across = SIZES[size];
  const want = Math.min(MAX_BAND_SOUNDS - band.sounds.length, (Math.ceil(shown / across) || 1) * across - shown);
  if (want > 0) band.sounds.push(...remainingSounds(out, i, sounds).slice(0, want));
  return out;
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

// Band `i` with each sound put through `swap(id) -> id`: who plays it
// changed (ADR 0030), each tile the same note on the new instrument. A
// sound the swap leaves alone stays; two that become one keep one tile.
export function swapBand(t, i, swap) {
  const out = copy(t);
  if (at(out, i) >= 0) out.bands[i].sounds = unique(out.bands[i].sounds.map((id) => swap(id) ?? id));
  return out;
}

export function removeTile(t, i, k) {
  const out = copy(t);
  if (at(out, i) >= 0 && k >= 0 && k < out.bands[i].sounds.length) out.bands[i].sounds.splice(k, 1);
  return out;
}

// ── Comparing and ordering ──

export function sameTouch(a, b) {
  const key = (t) => { const c = cleanTouch(t); return JSON.stringify([c?.bands ?? [], c?.grid ?? null]); };
  return key(a) === key(b);
}

// Before a layout replaces this one, the one on screen when it is the kid's
// own: anything that is not just one of `layouts`. Kept as ⭐ Layout, so
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
// most MAX_BANDS, and a grid placing them when it has one, or null. A band
// a block lost (a broken index) is dropped, as touch-grid.js `settle` says.
export function cleanTouch(t) {
  if (!t || typeof t !== 'object' || !Array.isArray(t.bands)) return null;
  const raw = t.bands.slice(0, MAX_BANDS * 2);
  const cleaned = raw.map(cleanBand);
  // Indexes past a band that failed cleaning count it no longer.
  const index = []; let n = 0;
  for (const b of cleaned) { index.push(b ? n : null); if (b) n += 1; }
  const bands = cleaned.filter(Boolean).slice(0, MAX_BANDS);
  if (!t.grid) return { bands };
  const grid = cleanGrid(reindex(t.grid, index), bands.length);
  return grid ? settle({ bands, grid }) : { bands };
}
// A stored grid's band indexes, as `index` maps them (null: none).
function reindex(g, index) {
  if (!g || typeof g !== 'object' || !Array.isArray(g.parts)) return g;
  return { ...g, parts: g.parts.map((p) => {
    if (Array.isArray(p?.parts)) return reindex(p, index);
    if (!p || typeof p !== 'object' || !Number.isInteger(p.band)) return p;
    const { band, ...rest } = p;
    return index[band] == null ? rest : { ...rest, band: index[band] };
  }) };
}

// A name typed for a touch layout: trimmed and cut to MAX_NAME, or null when blank.
export function touchName(v) {
  const name = typeof v === 'string' ? cutName(v.trim().replace(/\s+/g, ' '), MAX_NAME).trim() : '';
  return name || null;
}

// A saved touch layout (IndexedDB `touchLayouts`): {id, personId, name, created, bands, grid?}.
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
    ...(t.grid ? { grid: t.grid } : {}),
  };
}
