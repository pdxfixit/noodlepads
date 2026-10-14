// DJ ✏️ Edit keys' pure rules: putting sounds on the 40 keys, moving the
// sounds that were in the way to free keys, swapping and clearing keys,
// loading a group onto a row, and the keyboard layouts (whole-keyboard
// arrangements: a kid's own saved ones, and the ready-made ones below).
// No DOM, no audio, no storage, so every rule is unit-tested; dj-keys.js
// draws the editor and calls these.
//
// A keyboard here is `keys`: {code: clipId | null} over rhythm.js KEY_CODES.
// Every function returns a new one and never changes what it was given.

import { KEY_ROWS, KEY_CODES } from './rhythm.js';

// All 40 keys, a missing one as null (No sound): a layout or ⭐ My keys
// saved before the number row (2026-10-12) loads with that row empty.
export function fullKeys(keys = {}) {
  const out = {};
  for (const code of KEY_CODES) out[code] = typeof keys?.[code] === 'string' && keys[code] ? keys[code] : null;
  return out;
}

export const rowOf = (code) => KEY_ROWS.findIndex((codes) => codes.includes(code));

// The free keys (No sound), nearest first: the same row as `near` from left
// to right, then the other rows top to bottom. `except` keys are never free.
function freeKeys(keys, near, except = new Set()) {
  const r = near ? rowOf(near) : -1;
  const order = r >= 0 ? [...KEY_ROWS[r], ...KEY_CODES.filter((c) => rowOf(c) !== r)] : KEY_CODES;
  return order.filter((c) => keys[c] === null && !except.has(c));
}

// Moves the sounds pushed off keys to free keys, nearest first. Returns the
// ids that found no free key.
function rehome(keys, pushed, near, taken) {
  const left = [];
  for (const id of pushed) {
    const free = freeKeys(keys, near, taken)[0];
    if (free) keys[free] = id;
    else left.push(id);
  }
  return left;
}

// Puts sounds `ids` on the keys from `from` on, in reading order (left to
// right, then on to the next row). A sound that was on one of those keys
// moves to a free key; one already on the board stays where it is too, so a
// sound can be on two keys. Returns {keys, left, moved}: `left` is every
// sound that found no key (ran past the last key, or pushed off with no free
// key), `moved` how many pushed-off sounds found a free key.
export function placeSounds(keys, from, ids) {
  const out = fullKeys(keys);
  const start = KEY_CODES.indexOf(from);
  const wanted = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
  if (start < 0) return { keys: out, left: wanted };
  const targets = KEY_CODES.slice(start, start + wanted.length);
  const placing = new Set(wanted.slice(0, targets.length));
  const pushed = targets.map((c) => out[c]).filter((id) => id && !placing.has(id));
  targets.forEach((c, i) => { out[c] = wanted[i]; });
  const lost = rehome(out, pushed, from, new Set(targets));
  return { keys: out, left: [...wanted.slice(targets.length), ...lost], moved: pushed.length - lost.length };
}

// Loads a group's sounds onto row `r`, from its first key. The row's keys
// past the group's last sound keep what they had; the sounds the group
// pushed off move to free keys on other rows. Returns {keys, left, moved}.
export function loadRow(keys, r, ids) {
  const out = fullKeys(keys);
  const codes = KEY_ROWS[r];
  const wanted = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
  if (!codes) return { keys: out, left: wanted };
  const placing = new Set(wanted.slice(0, codes.length));
  const targets = codes.slice(0, Math.min(codes.length, wanted.length));
  const pushed = targets.map((c) => out[c]).filter((id) => id && !placing.has(id));
  targets.forEach((c, i) => { out[c] = wanted[i]; });
  const lost = rehome(out, pushed, null, new Set(codes));
  return { keys: out, left: [...wanted.slice(codes.length), ...lost], moved: pushed.length - lost.length };
}

// The row a group goes on when its chip is tapped: the emptiest row, the
// top one first when two are as empty.
export function nextFreeRow(keys) {
  const full = fullKeys(keys);
  let best = 0;
  let most = -1;
  KEY_ROWS.forEach((codes, r) => {
    const free = codes.filter((c) => full[c] === null).length;
    if (free > most) { most = free; best = r; }
  });
  return best;
}

// A key dragged onto another: the two swap sounds.
export function swapKeys(keys, a, b) {
  const out = fullKeys(keys);
  if (!KEY_CODES.includes(a) || !KEY_CODES.includes(b)) return out;
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

// A key dragged off the board: No sound.
export function clearKey(keys, code) {
  const out = fullKeys(keys);
  if (KEY_CODES.includes(code)) out[code] = null;
  return out;
}

export function sameKeys(a, b) {
  const x = fullKeys(a);
  const y = fullKeys(b);
  return KEY_CODES.every((c) => x[c] === y[c]);
}

// What is stored for the live keyboard (`decks`): only the keys that differ
// from the person's default keys (rhythm.js defaultDeck), so a new sound
// still reaches the keys nobody changed.
export function changedKeys(full, base) {
  const out = {};
  for (const code of KEY_CODES) {
    const v = full[code] ?? null;
    if (v !== (base[code] ?? null)) out[code] = v;
  }
  return out;
}

// ── Layouts ──

// The ready-made layouts: kit ids (boards.json `kit`), row by row from the
// top (the number row first), ten keys each; null is No sound. Each lays out
// the presets for one kind of playing. A kit sound a person has hidden or
// lacks is No sound.
export const READY_LAYOUTS = [
  {
    id: 'beat-lab', emoji: '🥁', name: 'Beat lab',
    rows: [
      ['cowbell', 'snap', 'tambourine', 'ride', 'boom', 'snare-808', 'clave', 'conga', 'tom-fill', 'rimshot'],
      ['airhorn', 'scratch', 'explosion', 'whoosh', 'siren', 'pop', 'ding', 'tada', 'drop-the-beat', 'oh-yeah'],
      ['bass-c', 'bass-d', 'bass-e', 'bass-f', 'bass-g', 'bass-a', 'chord-c', 'chord-am', 'chord-f', 'chord-g'],
      ['kick', 'snare', 'hihat', 'open-hat', 'clap', 'tom-low', 'tom-high', 'crash', 'rim', 'shaker'],
    ],
  },
  {
    id: 'space-band', emoji: '🚀', name: 'Space band',
    rows: [
      ['coin', 'jump', 'pew', 'one-up', 'game-over', 'alarm', 'siren', 'whoosh', 'heartbeat', 'countdown'],
      ['laser', 'warp', 'phaser', 'robot', 'ufo', 'beam', 'red-alert', 'computer', 'teleport', 'zap'],
      ['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high', 'chord-am', 'chord-em'],
      ['kick', 'snare-808', 'hihat', 'clap', 'boom', 'bass-c', 'bass-e', 'bass-g', 'power-up', 'blip'],
    ],
  },
  {
    id: 'zoo-party', emoji: '🐾', name: 'Zoo party',
    rows: [
      ['lets-go', 'oh-yeah', 'wow', 'nice', 'yes', 'no-way', 'bruh', 'oof', 'gg', 'boom-word'],
      ['moo', 'quack', 'tweet', 'roar', 'meow', 'woof', 'ribbit', 'buzz', 'squeak', 'cackle'],
      ['honk', 'boing', 'slide-whistle', 'sad-trombone', 'burp', 'toot', 'splat', 'kazoo', 'bonk', 'raspberry'],
      ['kick', 'snare', 'hihat', 'clap', 'cowbell', 'conga', 'tambourine', 'shaker', 'clave', 'drumroll'],
    ],
  },
  {
    id: 'piano-ish', emoji: '🎹', name: 'Piano-ish',
    rows: [
      ['open-hat', 'rim', 'shaker', 'tom-low', 'tom-high', 'cowbell', 'tambourine', 'snap', 'conga', 'clave'],
      ['chord-c', 'chord-dm', 'chord-em', 'chord-f', 'chord-g', 'chord-am', 'chord-g7', 'ding', 'tada', 'drumroll'],
      ['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high', 'crash', 'ride'],
      ['bass-c', 'bass-d', 'bass-e', 'bass-f', 'bass-g', 'bass-a', 'kick', 'snare', 'hihat', 'clap'],
    ],
  },
];

// A ready-made layout as one person's keys: `kitClip(kitId)` is the id of
// their copy of that kit sound, or null when they have none on show.
export function readyKeys(layout, kitClip) {
  const out = {};
  KEY_ROWS.forEach((codes, r) => codes.forEach((code, i) => {
    const kitId = layout.rows[r]?.[i];
    out[code] = kitId ? kitClip(kitId) ?? null : null;
  }));
  return out;
}

// Before a layout replaces the keys, the keys as they are, when they are the
// kid's own arrangement: anything that is not just one of the layouts. That
// is kept as ⭐ My keys, so loading a layout never loses a hand-made board.
// `layouts` is every layout's keys (the kid's and the ready-made ones).
export function keepAsMine(current, layouts) {
  return layouts.some((l) => sameKeys(l, current)) ? null : fullKeys(current);
}

export const LAYOUT_ID = /^layout-[a-z0-9-]{1,48}$/;
export const MAX_LAYOUT_NAME = 24;

// A name typed for a layout: trimmed and cut to 24, or null when blank.
export function layoutName(v) {
  const name = typeof v === 'string' ? [...v.trim()].slice(0, MAX_LAYOUT_NAME).join('').trim() : '';
  return name || null;
}

// A stored layout (`layouts`), cleaned: the app's own and anything from a
// backup or the cloud. {id, personId, name, created, keys} with all 40 keys.
export function cleanLayout(l) {
  if (!LAYOUT_ID.test(l?.id) || typeof l.personId !== 'string' || !l.keys || typeof l.keys !== 'object') return null;
  const keys = {};
  for (const code of KEY_CODES) {
    const v = l.keys[code];
    keys[code] = typeof v === 'string' && v ? v.slice(0, 64) : null;
  }
  return {
    id: l.id,
    personId: l.personId.slice(0, 64),
    name: layoutName(l.name) ?? 'Layout',
    created: Number.isFinite(l.created) ? l.created : Date.now(),
    keys,
  };
}
