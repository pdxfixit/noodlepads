// The board model: who is on the soundboard, which sounds each person has and
// in what order, and how edits are stored. Pure functions of plain data (no
// DOM, no storage), so they can be tested; state.js and board.js feed them.

import { VOICES, amountFor, storedFx, cleanChain } from './voices.js';
import { cleanTweaks } from './tweaks.js';
import { isHex, whiteReadsOn } from './contrast.js';
import { cleanTrim, cleanEdits, cleanFade } from './cuts.js';
import { funName, cutName } from './names.js';
import { songHasBeats } from './playlist.js';
import { showsFor, instrumentProblem } from './instruments.js';

// Deep colors white text reads on: a board's casing. Eight that stay apart
// for someone with deuteranopia too (Ben, 2026-10-19): the closest pair is
// about 14 apart (CIEDE2000) in normal vision and 10.5 as deuteranopia sees
// them; ten such dark colors can't be. Two lines of four on a phone.
export const PERSON_COLORS = ['#2D3FD6', '#0E2C78', '#304A00', '#B3141C',
  '#A3156E', '#86424E', '#5A2050', '#3A3A3A'];

// What to call each of those colors, for screen readers and tooltips.
export const PERSON_COLOR_NAMES = {
  '#2D3FD6': 'Blue', '#0E2C78': 'Navy', '#304A00': 'Olive', '#B3141C': 'Red',
  '#A3156E': 'Pink', '#86424E': 'Rose', '#5A2050': 'Plum', '#3A3A3A': 'Graphite',
};

// The ten person colors before 2026-10-19, each to the nearest of today's.
// People stored with one move to the new one when the app reads storage
// (state.js); the cloud still takes them from an older copy of the app.
export const OLD_PERSON_COLORS = {
  '#1F3FA8': '#2D3FD6', '#0B5C7A': '#2D3FD6', '#0C5E4B': '#304A00', '#2E5A12': '#304A00',
  '#9E1640': '#A3156E', '#4C2A8C': '#0E2C78', '#6B2F6B': '#5A2050', '#8A3B00': '#B3141C',
  '#7A1E1E': '#B3141C', '#333040': '#3A3A3A',
};
// A person's color as today's palette has it (any other color stays as it is).
export const personColor = (c) => (typeof c === 'string' && OLD_PERSON_COLORS[c.toUpperCase()]) || c;

// Palette names before 2026-09-27. Edits saved in a browser's IndexedDB may
// still use them, so they map to the nearest current color.
export const OLD_COLOR_NAMES = {
  tomato: 'red', sunflower: 'yellow', mint: 'teal', sky: 'blue',
  grape: 'blue', bubblegum: 'pink', lime: 'lime', tangerine: 'orange',
};

// The first person color nobody uses yet, else the first one.
export function nextPersonColor(used) {
  const taken = new Set([...used].map((c) => c.toLowerCase()));
  return PERSON_COLORS.find((c) => !taken.has(c.toLowerCase())) || PERSON_COLORS[0];
}

// The shared kit (boards.json `kit`) as one person's copy: every board has
// its own, with ids like `<person>-kick`, so each board can hide, rename or
// reorder kit sounds without touching anyone else's. `kitId` keeps the kit's
// own id (`kick`): a problem report names a kit sound by it (log-clean.js).
export function kitFor(personId, kit = []) {
  return kit.map((k) => ({ ...k, id: `${personId}-${k.id}`, kitId: k.id, kit: true }));
}

// People: boards.json's, with any rename, recolor or hide applied, then the
// people added in the app. Hidden people are left out unless asked for.
// `edits` is the "people" store as a Map of id -> record. Each person's
// `clips` are their own sounds followed by their copy of the kit.
export function mergePeople(manifestPeople, edits, { includeHidden = false, kit = [] } = {}) {
  const bundled = manifestPeople.map((p) => {
    const e = edits.get(p.id);
    return { ...p, clips: [...p.clips, ...kitFor(p.id, kit)], name: e?.name ?? p.name, color: e?.color ?? p.color, avatar: e?.avatar ?? p.avatar, hidden: !!e?.hidden, added: false };
  });
  const added = [...edits.values()]
    .filter((e) => e.added)
    .sort((a, b) => a.created - b.created)
    .map((e) => ({ id: e.id, name: e.name, color: e.color, avatar: e.avatar, clips: kitFor(e.id, kit), hidden: !!e.hidden, added: true }));
  return [...bundled, ...added].filter((p) => includeHidden || !p.hidden);
}

// A clip's color as a current palette name, or unchanged if it is not one
// (a raw CSS color from boards.json, say).
export function colorName(palette, name) {
  if (Object.hasOwn(palette, name)) return name;
  const renamed = OLD_COLOR_NAMES[name];
  return renamed && Object.hasOwn(palette, renamed) ? renamed : name;
}

// The CSS color for a clip's color name. Anything that is neither a palette
// name nor a valid CSS color (`supports` says which) gets the first palette
// color, so a pad is never left transparent.
export function padColor(palette, name, supports = () => false) {
  const hex = palette[colorName(palette, name)];
  if (hex) return hex;
  return name && supports(name) ? name : Object.values(palette)[0];
}

// A saved order places the clips it names; any clip it doesn't name (new
// since the last drag) keeps its default place after them.
export function orderClips(clips, ids = []) {
  const rank = (c) => { const i = ids.indexOf(c.id); return i < 0 ? ids.length : i; };
  return clips
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

// One person's clips in board order: boards.json's with edits applied, then
// the ones made in the app (oldest first), arranged by the saved order.
// `person` is a merged person (see mergePeople).
// Advanced-only presets (boards.json `"advanced": true`: the sharps and
// flats) are left out unless `advanced` is true. Lookups that follow a
// reference (a beat's row, a DJ key, a take) pass true, so a sound already
// used keeps playing with Advanced off.
// `picks` ({notes: 'piano', …}, the person's instruments, ADR 0030) leaves
// out the Notes, Chords and Bass presets of every other instrument; without
// it, every instrument's presets are there, as a lookup needs them.
export function clipsForPerson(person, { overrides, userClips, order, includeHidden = false, advanced = true, picks = null }) {
  const bundled = person.clips.map((c) => ({ ...c, ...overrides.get(c.id), personId: person.id, source: 'bundled' }));
  const mine = userClips
    .filter((c) => c.personId === person.id)
    .sort((a, b) => a.created - b.created)
    .map((c) => ({ ...c, source: 'user' }));
  return orderClips([...bundled, ...mine], order && withNewPresets(order, bundled))
    .filter((c) => includeHidden || !c.hidden)
    .filter((c) => advanced || !(c.kit && c.advanced))
    .filter((c) => !picks || !c.kit || showsFor(c, picks));
}

// A saved pad order names only the pads that were on screen when it was
// saved. A preset it does not name, added to boards.json later (C♯ between C
// and D), goes straight after the preset before it in boards.json when that
// one is in the order and in the same group; otherwise it goes last, as before.
export function withNewPresets(order, bundled) {
  const ids = [...order];
  bundled.forEach((c, i) => {
    const before = bundled[i - 1];
    if (!c.kit || ids.includes(c.id) || !before?.kit || before.group !== c.group) return;
    const at = ids.indexOf(before.id);
    if (at >= 0) ids.splice(at + 1, 0, c.id);
  });
  return ids;
}

// A preset edit that changes nothing: only its id, and maybe the edit stamp
// of its last save (`changed`, merge3.js STAMP). Never stored or kept: one
// would keep a backup's real edit of that preset out (merge.js keepMine).
export const isEmptyOverride = (o) => !Object.keys(o ?? {}).some((k) => k !== 'id' && k !== 'changed');

// What to store for an edited boards.json clip: only what differs from the
// file, so a later change to it (a real clip replacing a placeholder, say) is
// not masked by old values. `wanted` is {label, emoji, color, voice, amount}
// as chosen in the sheet; `existing` is the stored override, if any, whose
// hidden flag is kept. The result has just an `id` when nothing differs.
export function overrideFor(base, existing, wanted, palette) {
  const next = { id: base.id };
  if (existing?.hidden) next.hidden = true;
  for (const key of ['label', 'emoji', 'color', 'voice']) {
    const value = key === 'label' ? wanted.label || base.label : wanted[key];
    const baseValue = key === 'voice' ? base.voice || 'normal' : key === 'color' ? colorName(palette, base.color) : base[key];
    if (value !== baseValue) next[key] = value;
  }
  // Amount is compared as the amount actually played, so a default isn't stored.
  const amount = amountFor(wanted.voice, wanted.amount);
  if (amount !== null && amount !== amountFor(wanted.voice, base.amount)) next.amount = amount;
  // A chain ("Chipmunk, then Stadium") is stored whole; its first
  // voice is also `voice` above, for older copies of the app.
  const fx = storedFx(wanted.fx);
  if (fx) next.fx = fx;
  // The sound sheet's Tweaks (tweaks.js), only what moved from normal.
  const tweaks = cleanTweaks(wanted.tweaks);
  if (tweaks) next.tweaks = tweaks;
  // A trim (chop.js) is stored as it is; none means the automatic trim.
  const trim = cleanTrim(wanted.trim);
  if (trim) next.trim = trim;
  // The wave editor's changes to parts of it, and its fades.
  const edits = cleanEdits(wanted.edits);
  if (edits) next.edits = edits;
  const fade = cleanFade(wanted.fade);
  if (fade) next.fade = fade;
  // The note 🎵 Find its note heard (a MIDI number), for melody rows.
  if (Number.isInteger(wanted.root) && wanted.root >= 0 && wanted.root <= 127) next.root = wanted.root;
  return next;
}

// A sound with ✏️ Edit sounds' bulk changes (bulk.js) put on a copy:
// {emoji?, color?, voice?, tweaks?, knobs?}, only the keys given. A voice
// replaces its whole chain, at the voice's own amount; tweaks replace its
// tweaks (null: none); knobs replace its tweaks and its old voices. Any of
// them makes a note found before (`root`) no longer true.
export function withBulkChanges(clip, changes) {
  const next = { ...clip };
  if (changes.emoji !== undefined) next.emoji = changes.emoji;
  if (changes.color !== undefined) next.color = changes.color;
  if (changes.voice !== undefined) {
    delete next.fx;
    delete next.amount;
    next.voice = VOICES.some((v) => v.id === changes.voice) ? changes.voice : 'normal';
    const amount = amountFor(next.voice);
    if (amount !== null) next.amount = amount;
  }
  if (changes.tweaks !== undefined) {
    const tweaks = cleanTweaks(changes.tweaks);
    if (tweaks) next.tweaks = tweaks; else delete next.tweaks;
  }
  // 🪄 Voice with knobs (voice-knobs.js): the knobs replace the sound's
  // knobs and its old voices; Shape it steps stay, after the knobs (`first`).
  if (changes.knobs !== undefined) {
    const steps = (cleanChain(next.fx) ?? []).filter((s) => s.type !== 'voice');
    delete next.fx;
    delete next.amount;
    next.voice = 'normal';
    if (steps.length) next.fx = steps;
    const knobs = cleanTweaks({ ...changes.knobs, first: steps.length > 0 });
    if (knobs) next.tweaks = knobs; else delete next.tweaks;
  }
  if (changes.voice !== undefined || changes.tweaks !== undefined || changes.knobs !== undefined) delete next.root;
  return next;
}

// Flips a bundled clip's hidden flag in its stored override.
export function withHidden(existing, id, hidden) {
  const next = { ...existing, id, hidden };
  if (!next.hidden) delete next.hidden;
  return next;
}

// What to store for a person after `changes`. People from boards.json (`base`)
// keep only what differs from the file, and `null` means nothing differs, so
// the record should be deleted. People added in the app store everything,
// and a new name or color stamps `edited` with `now`: merging a backup keeps
// the newer edit of a person both sides have (merge.js).
export function personEditRecord(base, current, changes, now = Date.now()) {
  const next = { ...current, ...changes };
  if (!base) {
    if ('name' in changes || 'color' in changes || 'avatar' in changes) next.edited = now;
    return next;
  }
  if (next.name === base.name || !next.name) delete next.name;
  if (next.color === base.color) delete next.color;
  if (!next.hidden) delete next.hidden;
  return Object.keys(next).length === 1 ? null : next;
}

const LOCAL_FILE = /^(?![a-z][a-z0-9+.-]*:|\/|\\)(?!.*(^|[\\/])\.\.([\\/]|$))/i;

// Checks boards.json. Returns a sentence saying what is wrong, or null. The
// file is ours, but v2 shares it and an edit slips in easily; a bad entry
// should read as a message, not a blank board.
export function validateManifest(m) {
  if (!m || !Array.isArray(m.people)) return 'it has no "people" list';
  if (!m.palette || typeof m.palette !== 'object') return 'it has no "palette"';
  for (const [name, hex] of Object.entries(m.palette)) {
    if (!isHex(hex)) return `the palette color "${name}" isn't a #RRGGBB color`;
  }
  const seen = new Set();
  const kit = m.kit ?? [];
  if (!Array.isArray(kit)) return 'its "kit" isn\'t a list';
  const kitGroups = m.kitGroups ?? [];
  if (!Array.isArray(kitGroups)) return 'its "kitGroups" isn\'t a list';
  const groupIds = new Set();
  for (const g of kitGroups) {
    if (!g?.id || !g.name) return 'a kit group is missing "id" or "name"';
    if (groupIds.has(g.id)) return `the kit group "${g.id}" is listed twice`;
    groupIds.add(g.id);
  }
  const kitIds = new Set();
  for (const c of kit) {
    if (!c?.id || !c.file) return 'a kit sound is missing "id" or "file"';
    if (groupIds.size && !groupIds.has(c.group)) return `the kit sound "${c.id}" is in no listed group ("${c.group}")`;
    if (!LOCAL_FILE.test(c.file)) return `the kit sound "${c.id}" has a "file" outside this site`;
    if (kitIds.has(c.id)) return `the kit sound id "${c.id}" is used twice`;
    if (c.voice && !VOICES.some((v) => v.id === c.voice)) return `the kit sound "${c.id}" has an unknown voice "${c.voice}"`;
    if (c.advanced !== undefined && typeof c.advanced !== 'boolean') return `the kit sound "${c.id}" has an "advanced" that isn't true or false`;
    if (c.level !== undefined && !(typeof c.level === 'number' && c.level <= 0 && c.level >= -24)) return `the kit sound "${c.id}" has a "level" that isn't a number of dB from -24 to 0`;
    const inst = instrumentProblem(c);
    if (inst) return inst;
    kitIds.add(c.id);
  }
  // An instrument's preset plays what one of its group's own presets plays.
  for (const c of kit) {
    if (c.plays !== undefined && !kit.some((k) => k.id === c.plays && k.group === c.group && k.inst === undefined)) return `the kit sound "${c.id}" plays "${c.plays}", which isn't one of ${c.group}'s own`;
  }
  for (const p of m.people) {
    if (!p.id || !p.name || !p.color) return `a person is missing "id", "name" or "color"`;
    if (!whiteReadsOn(p.color)) return `${p.name}'s color must be a #RRGGBB dark enough for white text`;
    if (!Array.isArray(p.clips)) return `${p.name} has no "clips" list`;
    for (const c of p.clips) {
      if (!c.id || !c.file) return `a clip on ${p.name}'s board is missing "id" or "file"`;
      if (!LOCAL_FILE.test(c.file)) return `the clip "${c.id}" has a "file" outside this site`;
      if (seen.has(c.id)) return `the clip id "${c.id}" is used twice`;
      if (c.voice && !VOICES.some((v) => v.id === c.voice)) return `the clip "${c.id}" has an unknown voice "${c.voice}"`;
      if (c.amount !== undefined && !(Number(c.amount) > 0)) return `the clip "${c.id}" has a "amount" that isn't a positive number`;
      seen.add(c.id);
    }
    // Each board's kit copies are named `<person>-<kit id>`; none may clash.
    for (const id of kitIds) {
      if (seen.has(`${p.id}-${id}`)) return `the clip id "${p.id}-${id}" is used twice (it is also ${p.name}'s copy of the kit's "${id}")`;
      seen.add(`${p.id}-${id}`);
    }
  }
  return null;
}

// The shared kit: the boards.json `kit` sounds every board gets (see kitFor).
// Each board has its own copy, so the beat maker shows them once.
export function isKitClip(clip) {
  return clip?.source === 'bundled' && clip.kit === true;
}

// ── One board to start (new devices) ──

// The first person on a new device. Older copies called it "Me"; that name
// is still how they are recognized (isDefaultPerson, app.js settlePeople,
// which gives an old "Me" a fun name).
export const SOLO_NAME = 'Me';
// Today's blue (PERSON_COLORS): made in an old color, the first person showed
// in it with no color chosen in their profile until storage was read again.
export const SOLO_COLOR = '#2D3FD6';

// The app is Noodle Pads (Ben, 2026-10-11), and that is the headline for
// everyone.
export const APP_NAME = 'Noodle Pads';
export function boardTitle() {
  return APP_NAME;   // the person shows in the corner (pads.js renderPeople)
}

// The heading over a board's own sounds.
export function ownSoundsTitle(visiblePeople, current) {
  return visiblePeople.length <= 1 || !current || current.name === SOLO_NAME ? 'My sounds' : `${current.name}\u2019s sounds`;
}

// The person a board with no one on it gets: a new device (boards.json lists
// no people), or one where no one is left on show. Added in the app, so it
// gets the kit, and never called "Me" (Ben, 2026-10-11): a fun name and a
// picture from the start. `solo` marks it as the app's own, until edited.
export function soloPerson(meId, now = Date.now(), random = Math.random) {
  return {
    id: meId, name: funName([], random), fun: true, avatar: PICTURES[Math.floor(random() * PICTURES.length) % PICTURES.length],
    color: SOLO_COLOR, added: true, created: now, solo: true,
  };
}

// A person who is only a default: the first person a device makes for
// itself (soloPerson, with its own random id; "Me" in older copies), never renamed or recolored
// (no `edited`), not deleted, and with nothing of theirs stored. `owners`
// holds every person id stored data names (personIdsIn). When data arrives,
// such a person is dropped on either side, so two empty "Me" boards never
// pile up (merge.js).
export function isDefaultPerson(p, owners) {
  return p?.added === true && (p.solo === true || p.name === SOLO_NAME) && !p.edited && !p.hidden && !owners.has(p.id);
}

// ── People from an older boards.json ──

// A person's id: what added people get from newId('p'), and also the plain
// ids boards.json used to give its people.
export const PERSON_ID = /^[a-z0-9][a-z0-9-]{0,48}$/;

// Every person id that stored data names, in a fixed order: people records
// first, then whoever owns a sound, beat, song, take, deck, layout, own voice or pad order, and
// whoever's copy of the kit an override edits (`<person>-<kit id>`). `doc`
// holds the stores as lists, the way a backup does. `known`: person ids
// that exist (default: `doc.people`'s), which settle whose an edit is.
export function personIdsIn(doc, kitIds = [], known = null) {
  const ids = [];
  const list = (name) => (Array.isArray(doc?.[name]) ? doc[name] : []);
  for (const p of list('people')) ids.push(p?.id);
  const here = known ?? new Set(list('people').map((p) => p?.id));
  for (const name of ['clips', 'orders', 'patterns', 'beats', 'decks', 'takes', 'songs', 'songbook', 'layouts', 'voices', 'touchLayouts']) {
    for (const r of list(name)) ids.push(r?.personId);
  }
  for (const o of list('overrides')) {
    const k = kitIdOf(o?.id, kitIds, here);
    if (k) ids.push(o.id.slice(0, -k.length - 1));
  }
  return [...new Set(ids.filter((id) => typeof id === 'string' && PERSON_ID.test(id)))];
}

// The kit id a person's preset copy (`<person>-<kit id>`) ends with, or null,
// whatever the kit's order. With kit ids `go` and `lets-go`,
// `p-mv3-x9-lets-go` could be p-mv3-x9's 🗣️ Let's go or a person
// `p-mv3-x9-lets` editing Go (a phantom adoptStoredPeople would make). The
// split wins whose person is `known` (people that exist), then whose person
// has the shape util.js newId gives (`p-<time>-<random>`, no more dashes:
// an app-made person id), then the longest kit id. Two people that exist
// and both fit stay ambiguous: the id itself can't tell them apart.
const NEW_PERSON_ID = /^p-[a-z0-9]+-[a-z0-9]+$/;
// Every one of `known` an edit id could be: `<person>-<kit id>` for some
// kit id. More than one is the case kitIdOf can't settle.
export function presetOwners(id, kitIds = [], known = new Set()) {
  if (typeof id !== 'string') return [];
  return [...kitIds].filter((k) => id.endsWith(`-${k}`)).map((k) => id.slice(0, -k.length - 1)).filter((who) => known.has(who));
}
export function kitIdOf(id, kitIds = [], known = new Set()) {
  if (typeof id !== 'string') return null;
  let best = null;
  let bestRank = null;
  for (const k of kitIds) {
    if (!id.endsWith(`-${k}`)) continue;
    const who = id.slice(0, -k.length - 1);
    if (!PERSON_ID.test(who)) continue;
    const rank = [known.has(who) ? 1 : 0, NEW_PERSON_ID.test(who) ? 1 : 0, k.length];
    if (!bestRank || rank[0] > bestRank[0] || (rank[0] === bestRank[0] && (rank[1] > bestRank[1] || (rank[1] === bestRank[1] && rank[2] > bestRank[2])))) {
      best = k;
      bestRank = rank;
    }
  }
  return best;
}

// boards.json once listed people of its own, and a device stored only what
// it changed about them: their names lived in the file. The file now lists
// no one, so a person whose data is still stored would have no name and
// would vanish. Each one becomes a person added in the app instead, keeping
// their id, so everything of theirs still points at them:
//   - named by the device's rename, else a fun name (names.js funName) and a
//     picture like every new person, skipping names in `takenNames` and
//     pictures in `takenPictures`; 🎲 in 👥 People rerolls it (Ben, Q21);
//   - colored by the device's recolor, else the next free person color.
// A person the device deleted (hidden) comes back hidden, under Settings →
// People → Bring back, but only when something of theirs is still stored; a
// bare "deleted" record is dropped. `known` are ids that are fine as they
// are (boards.json's, and people already added). Returns {add, drop}: the
// records to store, and the ids of old records to delete.
export function adoptPeople(doc, { known = new Set(), kitIds = [], takenNames = [], takenColors = [], takenPictures = [], random = Math.random } = {}) {
  const records = new Map((Array.isArray(doc?.people) ? doc.people : [])
    .filter((p) => typeof p?.id === 'string').map((p) => [p.id, p]));
  const owning = new Set(personIdsIn({ ...doc, people: [] }, kitIds, new Set(records.keys())));
  const names = new Set(takenNames.map((n) => String(n).toLowerCase()));
  const colors = takenColors.filter((c) => typeof c === 'string');
  const pictures = [...takenPictures];
  const add = [];
  const drop = [];
  for (const id of personIdsIn(doc, kitIds)) {
    const r = records.get(id);
    if (known.has(id) || r?.added === true) continue;
    if (r?.hidden === true && !owning.has(id)) { drop.push(id); continue; }
    let name = typeof r?.name === 'string' ? cutName(r.name.trim(), 16) : '';
    const fun = !name || names.has(name.toLowerCase());
    if (fun) name = funName([...names], random);
    names.add(name.toLowerCase());
    const color = whiteReadsOn(r?.color) ? r.color : nextPersonColor(colors);
    colors.push(color);
    const avatar = PICTURES.includes(r?.avatar) ? r.avatar : freePicture(pictures, random);
    pictures.push(avatar);
    const record = { id, name, color, avatar, added: true, created: add.length + 1 };
    if (fun) record.fun = true;
    if (r?.hidden === true) record.hidden = true;
    add.push(record);
  }
  return { add, drop };
}

// The kit's sounds in their groups (boards.json `kitGroups`, in that order),
// leaving out groups with nothing in them. A sound in no listed group goes in
// a last group, "More", so nothing is ever lost from view.
export function groupKit(clips, groups = []) {
  const known = new Set(groups.map((g) => g.id));
  const out = groups.map((g) => ({ ...g, clips: clips.filter((c) => c.group === g.id) }));
  const rest = clips.filter((c) => !known.has(c.group));
  if (rest.length) out.push({ id: 'more', name: 'More', emoji: '➕', clips: rest });
  return out.filter((g) => g.clips.length);
}

// Which kit groups are open. Stored per device as a list of ids; with
// nothing stored, only the first group (Drums) is open, so the screen
// starts short.
export function openKitGroups(stored, groups = []) {
  try {
    const ids = JSON.parse(stored);
    if (Array.isArray(ids)) return new Set(ids.filter((x) => typeof x === 'string'));
  } catch { /* nothing stored, or not ours */ }
  return new Set(groups.slice(0, 1).map((g) => g.id));
}

// The pictures a sound can have in the emoji chooser (DJ grid → tap a row's
// emoji): the sound sheet's, the kit's, and more, each once.
// A random picture nobody in `taken` has (any, if all are).
export function freePicture(taken = [], random = Math.random) {
  const free = PICTURES.filter((p) => !taken.includes(p));
  const from = free.length ? free : PICTURES;
  return from[Math.floor(random() * from.length) % from.length];
}

export const PICTURES = [...new Set([
  '📣', '🎺', '🥁', '🎸', '💥', '🚀', '⚡', '🔔', '🎉', '👋', '😂', '😱', '🤖', '👻', '🦖', '🐶', '🐱', '🐸', '🐔', '🦆', '🐮', '🍕', '💨', '💩',
  '🦶', '🎩', '👒', '🪣', '🛢️', '🪇', '🪘', '🍎', '🍊', '🍋', '🍏', '🫐', '🍇', '🌞', '🌙', '🌈', '🌊', '🐘', '🐋', '🐻', '🦏',
  '🎹', '🎷', '🪕', '🎻', '🪗', '📯', '🎤', '🐝', '🦁', '🐯', '🐵', '🦄', '🐙', '🌵', '🌶️', '🍩', '⭐', '❄️', '🔥', '💧', '🎈', '🧨', '🪩', '🛸', '👾', '🎃', '🤠', '😎', '🥳', '🤯',
])];

// Another sound on `clips` (a board) that already has `emoji`, other than
// `selfId`; the chooser warns before giving a second sound the same picture.
export const pictureTakenBy = (clips, emoji, selfId) => clips.find((c) => c.id !== selfId && !c.hidden && c.emoji === emoji);

// What to store for a boards.json (or kit) sound whose picture changes: its
// override as it is, with `emoji` set, or dropped when it is the file's own.
export function overrideWithEmoji(base, existing, emoji) {
  const next = { ...(existing ?? {}), id: base.id };
  if (emoji === base.emoji) delete next.emoji; else next.emoji = emoji;
  return next;
}

// ── One emoji per kind ──

// The emoji for each kind of thing a person makes or keeps, the same wherever
// the app counts or names that kind (Ben, 2026-10-11: "emoji … should become
// standard for songs, sounds etc"), and each button for a kind wears it:
// 🔊 Pads, 🥁 Beats, 🎼 Song, 🎬 Takes (Ben: "Takes are 🎬"), 👥 People,
// ✏️ Edit sounds, 🎛️ DJ, 🔗 Share, ⭐ My voices.
export const KIND_EMOJI = Object.freeze({
  sounds: '🔊', beats: '🥁', songs: '🎼', takes: '🎬', voices: '⭐',
  people: '👥', edits: '✏️', djKeys: '🎛️', shares: '🔗', layouts: '⌨️', touchLayouts: '👆',
});

// The kinds a person has, in order, with their words: what a row in
// 👥 People counts and what 🗂️ See all lists (Ben, 2026-10-24: every kind).
// ⭐ My voices are IndexedDB `voices` (state.myVoices); ✏️ preset edits are
// `overrides`; 🎛️ key sets are a person's `decks` record, with keys changed.
export const PERSON_KINDS = Object.freeze([
  ['sounds', 'sound', 'sounds', 'Sounds'], ['beats', 'beat', 'beats', 'Beats'], ['songs', 'song', 'songs', 'Songs'],
  ['takes', 'take', 'takes', 'Takes'], ['voices', 'voice', 'voices', 'My voices'],
  ['edits', 'preset edit', 'preset edits', 'Preset edits'], ['djKeys', 'key set', 'key sets', 'Key sets'],
  ['layouts', 'key layout', 'key layouts', 'Key layouts'], ['touchLayouts', 'touch layout', 'touch layouts', 'Touch layouts'],
].map(Object.freeze));

const listOf = (lists, name) => (Array.isArray(lists?.[name]) ? lists[name] : []);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const madeOn = (t) => (Number.isFinite(t) && t > 0
  ? `Made ${new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '');
const newestFirst = (a, b) => (b.at - a.at) || a.name.localeCompare(b.name);

// Everything `personId` has on this device, by kind, newest first: each
// {kind, id, name, emoji, detail, at}. `lists` holds the stores as lists, the
// way a backup does. Songs are the saved songs, plus an open song with
// something in it that isn't one of them. `preset(kitId)` names a preset a
// ✏️ edit changes ({label, emoji}); without it the edit shows its id.
export function personThings(lists, personId, { preset = () => null, dateText = madeOn } = {}) {
  const mine = (name) => listOf(lists, name).filter((r) => r?.personId === personId);
  const item = (kind, r, name, emoji, detail, at = r?.created) => ({
    kind, id: String(r?.id ?? ''), name: name || 'No name', emoji: emoji || KIND_EMOJI[kind], detail: detail || '', at: Number(at) || 0,
  });
  const saved = mine('songbook');
  const savedIds = new Set(saved.map((s) => s?.id).filter(Boolean));
  const open = mine('songs').filter((s) => songHasBeats(s) && !(s.id && savedIds.has(s.id)));
  const scratch = (r, prefix, word) => typeof r?.id === 'string' && r.id.startsWith(prefix)
    && (r.name && r.name !== 'Scratch' ? `${r.name} (scratch)` : `Scratch ${word}`);
  const prefix = `${personId}-`;
  const keys = (k) => Object.values(k && typeof k === 'object' ? k : {}).length;
  const deck = listOf(lists, 'decks').find((d) => d?.personId === personId);
  const out = {
    sounds: mine('clips').map((c) => item('sounds', c, c.label, c.emoji, dateText(c.created))),
    beats: mine('beats').map((b) => {
      const bars = Number(b.bars) || 1;
      return item('beats', b, scratch(b, 'beat-scratch-', 'beat') || b.name, '', `${plural(bars, 'bar', 'bars')} · ${Number(b.bpm) || 100} BPM`, b.saved ?? b.created);
    }),
    songs: [...saved, ...open].map((s) => {
      const lanes = (Array.isArray(s.lanes) ? s.lanes : []).filter((l) => l?.blocks?.length).length;
      const tempo = Number(s.tempo) ? ` · ${Number(s.tempo)} BPM` : '';
      return item('songs', s, scratch(s, 'song-scratch-', 'song') || s.name, '', `${plural(lanes, 'lane', 'lanes')}${tempo}`, s.saved ?? s.created);
    }),
    takes: mine('takes').map((t) => {
      const sec = Math.max(0, Number(t.duration) || 0);
      return item('takes', t, t.name, '', `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`);
    }),
    voices: mine('voices').map((v) => item('voices', v, v.name, v.emoji, dateText(v.created), v.used || v.created)),
    edits: listOf(lists, 'overrides').filter((o) => typeof o?.id === 'string' && o.id.startsWith(prefix)).map((o) => {
      const p = preset(o.id.slice(prefix.length));
      return item('edits', o, o.label || p?.label || o.id.slice(prefix.length), o.emoji || p?.emoji, o.hidden ? 'Preset, hidden' : 'Preset, changed', 0);
    }),
    djKeys: deck && keys(deck.keys) ? [item('djKeys', { id: deck.personId }, 'My keys', '', plural(keys(deck.keys), 'key changed', 'keys changed'), 0)] : [],
    layouts: mine('layouts').map((l) => item('layouts', l, l.name, '', plural(keys(l.keys), 'key', 'keys'))),
    touchLayouts: mine('touchLayouts').map((l) => item('touchLayouts', l, l.name, '', plural(Array.isArray(l.bands) ? l.bands.length : 0, 'group', 'groups'))),
  };
  for (const list of Object.values(out)) list.sort(newestFirst);
  return out;
}

// How many of each kind `personId` has on this device (personThings).
export function personCounts(lists, personId, opts) {
  return Object.fromEntries(Object.entries(personThings(lists, personId, opts)).map(([k, list]) => [k, list.length]));
}

// The counts as a row shows them: "🔊 27 · 🥁 4 · 🎼 1", kinds with none
// left out, "nothing yet" for none. No-break spaces keep each emoji with its
// number, and each · with what it follows, so a narrow row wraps between kinds.
export function countsText(counts) {
  const parts = PERSON_KINDS.filter(([k]) => counts?.[k] > 0).map(([k]) => `${KIND_EMOJI[k]}\u00a0${counts[k]}`);
  return parts.length ? parts.join('\u00a0· ') : 'nothing yet';
}

// The same in words, for a screen reader: "27 sounds, 4 beats, 1 song".
export function countsWords(counts) {
  const parts = PERSON_KINDS.filter(([k]) => counts?.[k] > 0).map(([k, one, many]) => `${counts[k]} ${counts[k] === 1 ? one : many}`);
  return parts.length ? parts.join(', ') : 'nothing yet';
}
