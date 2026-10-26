// Groups of a kid's own sounds (Ben, 2026-10-11; ADR 0013). In My sounds
// only: the presets keep their fixed groups from boards.json. Pure functions
// of plain data, so they can be tested; pads.js and bulk.js call them.
//
// Stored in two places, both already synced and in backups:
//   a sound made in the app   `group: 'g-…'` on its clips record (none: not in a group)
//   the person's pad order    `groups: [{id, name}]` on their orders record, in the kid's order
// A sound naming a group the person no longer has is simply not in a group.

import { cutName } from './names.js';

export const MAX_GROUP_NAME = 24;   // like a sound's name
export const MAX_GROUPS = 50;       // per person
export const GROUP_ID = /^g-[a-z0-9-]{1,40}$/;
export const UNGROUPED = '';        // the "Not in a group" heading's id
export const UNGROUPED_NAME = 'Not in a group';

// A group's name as typed: trimmed and cut to MAX_GROUP_NAME; '' when nothing is left.
export const groupName = (v) => (typeof v === 'string' ? cutName(v.trim(), MAX_GROUP_NAME).trim() : '');

// A clip's group id, if it is one; undefined otherwise (as backups store it).
export const groupIdOf = (v) => (typeof v === 'string' && GROUP_ID.test(v) ? v : undefined);

// A stored list of groups made safe: each {id, name} once, with a real id and
// a name, at most MAX_GROUPS. null when none are left (nothing to store).
export function cleanGroups(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const g of list) {
    const id = groupIdOf(g?.id);
    const name = groupName(g?.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
    if (out.length >= MAX_GROUPS) break;
  }
  return out.length ? out : null;
}

// The person's own sounds under their groups, in the kid's order, then the
// ones in no group (or in a group they no longer have). A group with no
// sounds is left out. Each: {id, name, clips}; the last has id UNGROUPED.
// `clips` keep the order they come in (the board's).
export function groupOwn(clips, groups) {
  const list = cleanGroups(groups) ?? [];
  const known = new Set(list.map((g) => g.id));
  const out = list.map((g) => ({ ...g, clips: clips.filter((c) => c.group === g.id) }));
  out.push({ id: UNGROUPED, name: UNGROUPED_NAME, clips: clips.filter((c) => !known.has(c.group)) });
  return out.filter((g) => g.clips.length);
}

// The groups that still have a sound in them (`clips`: the person's own).
export function pruneGroups(groups, clips) {
  const used = new Set(clips.map((c) => c.group).filter(Boolean));
  return (cleanGroups(groups) ?? []).filter((g) => used.has(g.id));
}

// A group moved one place earlier (-1) or later (+1) in the kid's order.
export function moveGroup(groups, id, by) {
  const list = [...(cleanGroups(groups) ?? [])];
  const i = list.findIndex((g) => g.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

// Two groups' lists joined: `mine` as it is, then each of `theirs` whose id
// `mine` lacks (a backup or the cloud bringing a group this device never had).
export function joinGroups(mine, theirs) {
  const a = cleanGroups(mine) ?? [];
  const have = new Set(a.map((g) => g.id));
  return cleanGroups([...a, ...(cleanGroups(theirs) ?? []).filter((g) => !have.has(g.id))]);
}

// A fresh group id. `taken` are ids already in use.
export function newGroupId(taken = [], random = Math.random) {
  const used = new Set(taken);
  let id;
  do id = `g-${Date.now().toString(36)}-${random().toString(36).slice(2, 6) || '0'}`; while (used.has(id));
  return id;
}
