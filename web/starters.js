// The old app gave each person eight starter sounds (an airhorn, a laser, a
// boing…) and a spoken name clip, stored as `<person>-<sound>`. The eight
// are presets now, with the same ids and the same audio (boards.json; Ben,
// 2026-10-11), so `<person>-airhorn` already is that person's copy of the
// Airhorn preset. A kid's rename or voice on one (an override), and every
// beat row, DJ key, take and pad order that plays it, carry over as they
// are: there is nothing to convert. A starter a kid hid stays hidden.
//
// The spoken name clips said a name, so they are never brought back. For
// data from before 1.0 only (old backups, older sounds found on
// this device), dropNameSounds takes out their overrides and counts every
// change to or use of one, so the notice says what was left out.
//
// Pure functions of plain data.

import { PERSON_ID } from './model.js';

// The old starter sounds, each now a preset with this id (boards.json).
export const STARTERS = ['airhorn', 'laser', 'boing', 'rimshot', 'drumroll', 'tada', 'slide-whistle', 'sad-trombone'];

// The spoken name clip each old person had (`<person>-name`).
const NAME_SOUND = 'name';

// `<person>-name` -> the person's id, or null. `kitIds` win: a preset copy
// is never a name clip.
export function nameSoundOf(id, kitIds = []) {
  if (typeof id !== 'string' || id.length > 64 || !id.endsWith(`-${NAME_SOUND}`)) return null;
  const personId = id.slice(0, -NAME_SOUND.length - 1);
  if (!PERSON_ID.test(personId) || [...kitIds].some((k) => id.endsWith(`-${k}`))) return null;
  return personId;
}

const list = (doc, name) => (Array.isArray(doc?.[name]) ? doc[name] : []);
// An override that changes something (not only hides the sound).
const EDIT_FIELDS = ['label', 'emoji', 'color', 'voice', 'amount', 'fx', 'trim', 'edits', 'fade', 'root'];
const changes = (o) => o?.hidden !== true && EDIT_FIELDS.some((k) => o?.[k] !== undefined && o[k] !== null);

// Every clip id the stores play: beat and open-beat rows, DJ keys, take events.
function playedIds(doc) {
  const ids = [];
  for (const store of ['beats', 'patterns']) {
    for (const b of list(doc, store)) for (const r of Array.isArray(b?.rows) ? b.rows : []) ids.push(r?.clipId);
  }
  for (const d of list(doc, 'decks')) for (const v of Object.values(d?.keys ?? {})) ids.push(v);
  for (const d of list(doc, 'decks')) for (const v of Object.values(d?.mine ?? {})) ids.push(v);
  for (const l of list(doc, 'layouts')) for (const v of Object.values(l?.keys ?? {})) ids.push(v);
  // 👆 touch layouts (ADR 0028): the live one, ⭐ My layout and the saved ones.
  const bands = (t) => (Array.isArray(t?.bands) ? t.bands : []).flatMap((b) => (Array.isArray(b?.sounds) ? b.sounds : []));
  for (const d of list(doc, 'decks')) ids.push(...bands(d?.touch), ...bands(d?.touchMine));
  for (const l of list(doc, 'touchLayouts')) ids.push(...bands(l));
  for (const t of list(doc, 'takes')) for (const e of Array.isArray(t?.events) ? t.events : []) ids.push(e?.clipId);
  return ids;
}

// Returns {doc, left}: a copy of `doc` without any override of a name clip,
// and `left.nameSound`, how many name clips were changed or used (each
// counted once). References to one are left as they were.
export function dropNameSounds(doc, { kitIds = [] } = {}) {
  const counted = new Set();
  for (const id of [...list(doc, 'overrides').filter(changes).map((o) => o.id), ...playedIds(doc)]) {
    if (nameSoundOf(id, kitIds)) counted.add(id);
  }
  const overrides = list(doc, 'overrides').filter((o) => !nameSoundOf(o?.id, kitIds));
  return { doc: { ...doc, overrides }, left: { nameSound: counted.size } };
}
