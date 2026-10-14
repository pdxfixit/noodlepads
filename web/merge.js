// Loading a backup (or older sounds found) merges into what is on the device:
// it never replaces anything and never makes a second copy, so detail from
// several devices can be gathered into one, and loading the same backup twice
// changes nothing. Pure functions of plain data; backup-ui.js stores the result.
//
//   people     matched by id. A person both sides have keeps the newer name
//              and color by `edited`; with no newer edit, the device's. A
//              default "Me" (model.js isDefaultPerson) is dropped: the
//              incoming one always, the device's once someone else arrives.
//   sounds, saved beats, saved songs, takes, DJ key layouts, own voices
//              matched by id. The same record is skipped. A different record
//              under an id the device already uses is kept as well, under a
//              new id, and everything that names it (beats, DJ keys, pad
//              orders, songs, the sound it was cut from) is pointed at the new
//              id. A record the device already has under another id (one this
//              merge renamed before) counts as the same.
//   pad orders, open beats, DJ keys, open songs (one per person), kit edits
//              the device's when it has one, else the incoming one. A pad
//              order's groups (groups.js) join: a group the device lacks comes in.
//   settings   the device's; one the device never set comes in.

import { isDefaultPerson, personIdsIn, KIND_EMOJI } from './model.js';
import { newId as makeId, count } from './util.js';
import { joinGroups, cleanGroups } from './groups.js';
import { STAMP } from './merge3.js';
import { mapSongBeats } from './playlist.js';

// A record as text with its keys in order, leaving out `skip` keys, so two
// records compare by content. When it was last edited (merge3.js STAMP) is
// not content: a record that differs only there is the same record.
function canonical(value, skip = []) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !(v instanceof Blob)) {
      return Object.fromEntries(Object.keys(v).filter((k) => k !== STAMP && !skip.includes(k)).sort().map((k) => [k, walk(v[k])]));
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

// Do two Blobs hold the same bytes?
export async function sameBytes(a, b) {
  if (!(a instanceof Blob) || !(b instanceof Blob)) return a === b;
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  return true;
}

const STORES = ['people', 'clips', 'overrides', 'orders', 'patterns', 'beats', 'settings', 'decks', 'takes', 'songs', 'songbook', 'prefs', 'layouts', 'voices'];
const list = (doc, name) => (Array.isArray(doc?.[name]) ? doc[name] : []);

// local: the stores on this device as lists ({key, value} for settings).
// incoming: cleaned data (backup.js cleanBackup). `kitIds` are the kit's ids
// (a kit edit names its person). `newId(prefix)` makes a fresh id.
// Returns {put: {<store>: [records]}, dropPeople: [ids], added: {people,
// sounds, beats, songs, takes, layouts, voices}, already}: what to store, the device's default
// people to delete, and what to tell the kid.
export async function mergeLoaded(local, incoming, { kitIds = [], newId = makeId } = {}) {
  const put = Object.fromEntries(STORES.map((s) => [s, []]));
  const added = { people: 0, sounds: 0, beats: 0, songs: 0, takes: 0, layouts: 0, voices: 0 };
  let already = 0;
  const usedIds = new Set(['clips', 'beats', 'takes', 'songbook', 'layouts', 'voices'].flatMap((s) => [...list(local, s), ...list(incoming, s)].map((r) => r?.id)));
  const freshId = (prefix) => {
    let id;
    do id = newId(prefix); while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };

  // ── people ──
  const ownersLocal = new Set(personIdsIn({ ...local, people: [] }, kitIds));
  const ownersIn = new Set(personIdsIn({ ...incoming, people: [] }, kitIds));
  const localPeople = new Map(list(local, 'people').map((p) => [p.id, p]));
  let someoneArrives = false;
  for (const p of list(incoming, 'people')) {
    const here = localPeople.get(p.id);
    if (!here) {
      if (isDefaultPerson(p, ownersIn)) continue;   // an empty "Me" from elsewhere
      put.people.push(p);
      added.people++;
      if (p.added && !p.hidden) someoneArrives = true;
      continue;
    }
    if ((p.edited ?? 0) > (here.edited ?? 0)) {
      const next = { ...here, edited: p.edited };
      for (const k of ['name', 'color', 'avatar', 'fun']) if (p[k] !== undefined) next[k] = p[k];
      put.people.push(next);
    }
    already++;
  }
  const owners = new Set([...ownersLocal, ...ownersIn]);
  const dropPeople = someoneArrives
    ? list(local, 'people').filter((p) => isDefaultPerson(p, owners)).map((p) => p.id)
    : [];

  // ── records with their own ids ──
  // Adds `incoming` records to `put[store]`, after `fix` points each at any
  // renamed sound, beat or song. Returns old id -> new id for those renamed.
  const byId = async (store, prefix, fix, { skip = [], same = async () => true } = {}) => {
    const renamed = new Map();
    const mine = list(local, store);
    const mineById = new Map(mine.map((r) => [r.id, r]));
    const content = (r) => canonical(r, ['id', ...skip]);
    const mineByContent = new Map();
    for (const r of mine) {
      const key = content(r);
      if (!mineByContent.has(key)) mineByContent.set(key, []);
      mineByContent.get(key).push(r);
    }
    // The device's record with this content, if any (`id` first).
    const match = async (r) => {
      const found = mineByContent.get(content(r)) ?? [];
      for (const m of [...found.filter((x) => x.id === r.id), ...found.filter((x) => x.id !== r.id)]) {
        if (await same(m, r)) return m;
      }
      return null;
    };
    for (const raw of list(incoming, store)) {
      const r = fix(raw);
      const twin = await match(r);
      if (twin) {
        if (twin.id !== r.id) renamed.set(r.id, twin.id);
        already++;
        continue;
      }
      if (mineById.has(r.id)) {
        const id = freshId(prefix);
        renamed.set(r.id, id);
        put[store].push({ ...r, id });
      } else {
        put[store].push(r);
      }
    }
    return renamed;
  };
  const via = (map) => (id) => (typeof id === 'string' && map.has(id) ? map.get(id) : id);

  // Sounds: the same when everything but the id matches, audio included.
  // `from` (the sound one was cut from) is left out: it is pointed at a
  // renamed sound afterwards, and must not make a sound look new.
  // `group` is left out too: a sound moved into a group (groups.js) is still
  // the same sound, not a second one.
  const clipIds = await byId('clips', 'user', (c) => c, {
    skip: ['blob', 'from', 'group'],
    same: (a, b) => sameBytes(a.blob, b.blob),
  });
  const clip = via(clipIds);
  for (const c of put.clips) if (c.from) c.from = { ...c.from, id: clip(c.from.id) };
  added.sounds = put.clips.length;

  const rowsVia = (rows) => (Array.isArray(rows) ? rows.map((r) => ({ ...r, clipId: clip(r.clipId) })) : rows);
  const beatIds = await byId('beats', 'beat', (b) => ({ ...b, rows: rowsVia(b.rows) }));
  const beat = via(beatIds);
  added.beats = put.beats.length;

  // A song's beats, in its lanes and in the slots older copies read.
  const songVia = (s) => mapSongBeats(s, beat);
  const songIds = await byId('songbook', 'song', songVia);
  const song = via(songIds);
  added.songs = put.songbook.length;

  await byId('takes', 'take', (t) => ({ ...t, events: Array.isArray(t.events) ? t.events.map((e) => ({ ...e, clipId: clip(e.clipId) })) : t.events }));
  added.takes = put.takes.length;

  const keysVia = (keys) => Object.fromEntries(Object.entries(keys ?? {}).map(([k, v]) => [k, v === null ? null : clip(v)]));
  await byId('layouts', 'layout', (l) => ({ ...l, keys: keysVia(l.keys) }));
  added.layouts = put.layouts.length;

  // A kid's own voice is one voice under its id: when two copies differ, the
  // newer rename wins (`edited`), and it keeps the latest use. A voice is a
  // name and a few knobs, so a second copy would only be a puzzle.
  const myVoices = new Map(list(local, 'voices').map((v) => [v.id, v]));
  const voiceContent = (v) => canonical(v, ['created', 'used', 'edited']);
  for (const v of list(incoming, 'voices')) {
    const here = myVoices.get(v.id);
    if (!here) { put.voices.push(v); added.voices++; continue; }
    already++;
    const used = Math.max(here.used ?? 0, v.used ?? 0);
    const winner = voiceContent(v) !== voiceContent(here) && (v.edited ?? v.created ?? 0) > (here.edited ?? here.created ?? 0) ? v : here;
    if (winner !== here || used !== (here.used ?? 0)) put.voices.push({ ...winner, used });
  }

  // ── one per person, or per kit sound: the device's wins ──
  const keepMine = (store, key, fix = (r) => r) => {
    const mine = new Set(list(local, store).map((r) => r[key]));
    for (const r of list(incoming, store)) if (!mine.has(r[key])) put[store].push(fix(r));
  };
  keepMine('orders', 'personId', (o) => ({ ...o, ids: o.ids.map(clip) }));
  // A person's groups of their own sounds join the device's: a group it
  // does not have comes in, after its own, so incoming sounds keep theirs.
  const ordersHere = new Map(list(local, 'orders').map((o) => [o.personId, o]));
  for (const o of list(incoming, 'orders')) {
    const here = ordersHere.get(o.personId);
    if (!here || !o.groups) continue;
    const groups = joinGroups(here.groups, o.groups);
    if ((groups?.length ?? 0) > (cleanGroups(here.groups)?.length ?? 0)) put.orders.push({ ...here, groups });
  }
  keepMine('patterns', 'personId', (p) => {
    const out = { ...p, rows: rowsVia(p.rows) };
    if (p.id) out.id = beat(p.id);
    return out;
  });
  keepMine('decks', 'personId', (d) => {
    const out = { ...d, keys: keysVia(d.keys) };
    if (d.mine) out.mine = keysVia(d.mine);
    if (d.beatId) out.beatId = beat(d.beatId);
    return out;
  });
  keepMine('songs', 'personId', (s) => {
    const out = songVia(s);
    if (s.id) out.id = song(s.id);
    return out;
  });
  keepMine('overrides', 'id');
  keepMine('settings', 'key');
  keepMine('prefs', 'personId');

  return { put, dropPeople, added, already };
}

// What the kid is told, each kind with its emoji (KIND_EMOJI): "Added 🔊 3
// sounds, 🥁 2 beats; 4 already here."
export function mergeSummary({ added, already }) {
  const parts = [
    ['sounds', 'sound'], ['beats', 'beat'], ['songs', 'song'], ['takes', 'take'], ['layouts', 'key layout'], ['voices', 'own voice'], ['people', 'person'],
  ].filter(([k]) => added[k] > 0).map(([k, word]) => {
    const n = added[k];
    return `${KIND_EMOJI[k]} ${word === 'person' ? (n === 1 ? '1 person' : `${n} people`) : count(n, word)}`;
  });
  const here = already ? `${already} already here` : '';
  if (!parts.length) return here ? `Nothing new: ${here}.` : 'Nothing new.';
  return `Added ${parts.join(', ')}${here ? `; ${here}` : ''}.`;
}
