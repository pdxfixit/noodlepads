// What the app holds in memory, and the code that keeps it in step with
// IndexedDB. Every change to stored data goes through here so a failed write
// is reported the same way everywhere: kept for this visit, and the user is
// told it will not survive a reload.

import { db, STORE_NAMES, SCHEMA } from './store.js';
import { personEditRecord, adoptPeople, personIdsIn, personColor, isEmptyOverride, presetOwners } from './model.js';
import { isCloudId, reIdDoc } from './reid.js';
import { newId } from './util.js';
import { showNotice } from './ui.js';
import { logEvent } from './log.js';
import { stampEdit } from './merge3.js';

export const state = {
  manifest: null,
  personId: null,
  userClips: [],          // IndexedDB "clips": {id, personId, label, emoji, color, voice, amount?, blob, mime, created, exact?}
  overrides: new Map(),   // IndexedDB "overrides": bundled clip id -> {id, label?, emoji?, color?, voice?, amount?, hidden?}
  orders: new Map(),      // IndexedDB "orders": person id -> {personId, ids}, set by dragging pads
  patterns: new Map(),    // IndexedDB "patterns": person id -> {personId, name, bpm, rows: [{clipId, steps}]}, the person's one open beat (ADR 0017)
  savedBeats: [],         // IndexedDB "beats": {id, personId, name, bpm, rows, created, saved}, the library
  peopleEdits: new Map(), // IndexedDB "people": person id -> {id, name?, color?, hidden?} for boards.json people,
                          //   or {id, name, color, added: true, created, hidden?} for people added in the app
  settings: new Map(),    // IndexedDB "settings": key -> value; read through settings.js, which knows the defaults
  decks: new Map(),       // IndexedDB "decks": person id -> {personId, keys: {KeyA: clipId | null}}, only changed keys; beatId?: an older copy's Beat Builder open beat (ADR 0008), read by nothing since ADR 0017 and dropped when the deck saves
  takes: [],              // IndexedDB "takes": {id, personId, name, created, duration, events: [{t, clipId, kind}]}
  songs: new Map(),       // IndexedDB "songs": person id -> {id, personId, name, slots: [{beatId, times}]}, the open song
  songbook: [],           // IndexedDB "songbook": {id, personId, name, slots, created, saved}, every saved song
  cloud: new Map(),       // IndexedDB "cloud": person id -> {id, key, rev, sent, sounds, pin, check, newPin, remembered, keyDropped, noOffer}, this device's link to their profile (cloud.js)
  prefs: new Map(),       // IndexedDB "prefs": person id -> {personId, values: {advancedBeats, padSize, …}}, read through settings.js
  layouts: [],            // IndexedDB "layouts": {id, personId, name, created, keys: {KeyA: clipId | null}}, saved DJ key layouts (keyset.js)
  touchLayouts: [],       // IndexedDB "touchLayouts": {id, personId, name, created, bands: [{group, size, sounds}]}, saved 👆 touch layouts (touch.js, ADR 0029)
  myVoices: [],           // IndexedDB "voices": {id, personId, name, emoji, knobs, created, used}, a kid's own voices (voice-knobs.js)
  version: 'dev',         // from version.json, stamped by the deploy (every push to main)
  screen: 'pads',         // which screen shows: 'pads', 'beats' (the beat maker, ⌨️ Keys on or off), 'song' or 'live' (app.js showView)
  editing: false,         // ✏️ Edit sounds is on (app.js setEditing)
};

// True while another tab holds the database (see loadStorage): changes can't
// be saved yet, and when the saved data arrives it replaces what is on screen.
let storageWaiting = false;

const OTHER_TAB = 'Not saved: another soundboard tab is still holding your saved sounds. Close or reload that tab, then make the change again.';
const wouldNotSave = (err) => (storageWaiting
  ? OTHER_TAB
  : `This browser wouldn't save that change (${err.message || err.name}). It works until you reload the page, then it's gone.`);
// A delete the browser refused, or a change that deletes a record (an edit
// put back to the preset's own): after a reload the old record is back.
// `what` names a thing deleted ("That take"); none: a change undone.
const wouldNotRemove = (err, what) => {
  if (storageWaiting) return OTHER_TAB;
  const why = err.message || err.name;
  return what
    ? `${what} is gone for now, but this browser wouldn't delete it (${why}), so it may come back after a reload.`
    : `This browser wouldn't save that change (${why}). After a reload it may be back as it was.`;
};

// Reads every store into state; also used after loading a backup.
// A person stored with one of the person colors before 2026-10-19 takes the
// nearest of today's (model.js OLD_PERSON_COLORS) as it is read, so the color
// picker shows it chosen and the next sync sends it. Storage keeps the old
// one until the record next saves; every read moves it again.
function movePersonColors() {
  for (const [id, record] of state.peopleEdits) {
    const color = personColor(record.color);
    if (color !== record.color) state.peopleEdits.set(id, { ...record, color });
  }
}

// Every store and the `state` field that holds it, in the order of store.js
// SCHEMA (`bases` is cloud sync's own, cloud.js, and is not in memory). The one
// table `readStorage`, `storedLists` and `deletePerson` loop over, so a new
// store is added here and nowhere else in this file. `shape`:
//   list      an array of records, each naming its person (`personId`)
//   byId      a Map by the record's `id` (people, kit edits, cloud links)
//   byPerson  a Map by `personId`: one record a person
//   settings  a Map of key -> value
// tests/state.test.mjs checks the table against SCHEMA.
export const STORE_TABLE = [
  { store: 'clips', field: 'userClips', shape: 'list' },
  { store: 'overrides', field: 'overrides', shape: 'byId' },
  { store: 'orders', field: 'orders', shape: 'byPerson' },
  { store: 'patterns', field: 'patterns', shape: 'byPerson' },
  { store: 'beats', field: 'savedBeats', shape: 'list' },
  { store: 'people', field: 'peopleEdits', shape: 'byId' },
  { store: 'settings', field: 'settings', shape: 'settings' },
  { store: 'decks', field: 'decks', shape: 'byPerson' },
  { store: 'takes', field: 'takes', shape: 'list' },
  { store: 'songs', field: 'songs', shape: 'byPerson' },
  { store: 'songbook', field: 'songbook', shape: 'list' },
  { store: 'cloud', field: 'cloud', shape: 'byId' },
  { store: 'prefs', field: 'prefs', shape: 'byPerson' },
  { store: 'layouts', field: 'layouts', shape: 'list' },
  { store: 'voices', field: 'myVoices', shape: 'list' },
  { store: 'touchLayouts', field: 'touchLayouts', shape: 'list' },
];

export async function readStorage() {
  const rows = await Promise.all(STORE_TABLE.map(({ store }) => db.all(store)));
  STORE_TABLE.forEach(({ store, field, shape }, i) => {
    const got = rows[i];
    if (shape === 'list') state[field] = got;
    else if (shape === 'settings') state[field] = new Map(got.map((s) => [s.key, s.value]));
    // One that changes nothing (an older copy stored `{id, changed}`) is left out.
    else if (store === 'overrides') state[field] = new Map(got.filter((o) => !isEmptyOverride(o)).map((o) => [o.id, o]));
    else state[field] = new Map(got.map((r) => [shape === 'byId' ? r.id : r.personId, r]));
  });
  movePersonColors();
}

// The stores as lists, the way a backup holds them (cloud-ui.js counts what
// came down from them; people.js, backup-ui.js and cloud.js read them too).
// The device's own links (`cloud`) are never in it. `settings`: the device's
// settings as {key, value} too (a backup holds them). `prefs`: how each
// person's settings are mapped (cloud.js sends only those that travel).
export function storedLists({ settings = false, prefs = (p) => p } = {}) {
  const lists = {};
  for (const { store, field, shape } of STORE_TABLE) {
    if (store === 'cloud') continue;
    if (shape === 'settings') {
      if (settings) lists[store] = [...state[field]].map(([key, value]) => ({ key, value }));
    } else {
      const got = shape === 'list' ? state[field] : [...state[field].values()];
      lists[store] = store === 'prefs' ? got.map((r) => prefs(r)) : got;
    }
  }
  return lists;
}

// People whose names came from an older boards.json, which lists no one now,
// become people added in the app, so their sounds and beats stay on show
// (model.js adoptPeople). Needs open storage. Returns how many were kept.
export async function adoptStoredPeople() {
  const added = [...state.peopleEdits.values()].filter((e) => e.added);
  const { add, drop } = adoptPeople(storedLists(), {
    known: new Set(state.manifest.people.map((p) => p.id)),
    kitIds: (state.manifest.kit ?? []).map((k) => k.id),
    takenNames: added.map((e) => e.name),
    takenColors: added.map((e) => e.color),
    takenPictures: added.map((e) => e.avatar),
  });
  for (const id of drop) {
    state.peopleEdits.delete(id);
    await db.remove('people', id).catch((err) => console.error('Removing an old person record failed:', err));
  }
  for (const record of add) {
    state.peopleEdits.set(record.id, record);
    await persist('people', record);
  }
  return add.length;
}

// ── Random ids for everyone (reid.js, ADR 0002) ──
//
// A person whose id is not a random `p-` id (a plain id from an older
// boards.json: a kid's first name) gets a new one from newId('p'), and every
// record that names the old id follows: their sounds, kit edits, pad order,
// beats, DJ keys, takes, songs and settings. The cloud renames nothing (Ben,
// Q27: "Drop the rename code"), so this device's cloud link to a profile
// under the old id is dropped, and the person goes up as new under their
// random id (it is not put in the cloud until a grown-up does it, cloud.js goUp). None are left live;
// both such profiles were moved by hand. It is one IndexedDB transaction: a start that stops halfway
// leaves the old ids whole, and the next start does it again. The old id is
// remembered on this device only (settings `renamedPeople`, never in a
// backup or the cloud), so an old backup, older sounds found, or a remembered #id
// lands on the same person instead of a second one.

export const RENAMED_KEY = 'renamedPeople';

// The id a person has now, for an id this device renamed; else `id`.
export function renamedId(id) {
  const map = state.settings.get(RENAMED_KEY);
  return map && typeof map === 'object' && typeof id === 'string' && Object.hasOwn(map, id) ? map[id] : id;
}

// Every person id in `doc` (stores as lists, and `cloud`, this device's
// links) that is not a random one, except boards.json's own people (`keep`),
// who never leave the device. Longest first, so renaming "ab" never touches
// "ab-2" (remapText renames ids that start with the old id and a dash).
export function plainPersonIds(doc, { kitIds = [], keep = new Set() } = {}) {
  const ids = new Set(personIdsIn(doc, kitIds));
  for (const link of Array.isArray(doc?.cloud) ? doc.cloud : []) if (typeof link?.id === 'string') ids.add(link.id);
  return [...ids].filter((id) => !isCloudId(id) && !keep.has(id)).sort((a, b) => b.length - a.length);
}

// Gives every person with a plain id a random one. Needs open storage.
// Returns the [from, to] pairs done.
export async function reIdStoredPeople({ makeId = () => newId('p') } = {}) {
  if (!db.handle) return [];
  // Links to a profile under a plain id: one named by it, or one an older
  // copy kept while it waited for the cloud to rename it (`was`).
  const stale = [...state.cloud.values()].filter((l) => !isCloudId(l?.id) || l.was !== undefined);
  if (stale.length) {
    await db.batch(stale.map((l) => ({ store: 'cloud', del: l.id })));
    await readStorage();
    logEvent('cloud', { unlinked: stale.length });
  }
  const kitIds = (state.manifest?.kit ?? []).map((k) => k.id);
  const before = { ...storedLists(), cloud: [...state.cloud.values()] };
  const keep = new Set((state.manifest?.people ?? []).map((p) => p.id));
  const todo = plainPersonIds(before, { kitIds, keep })
    .map((from) => [from, renamedId(from) !== from && isCloudId(renamedId(from)) ? renamedId(from) : makeId()]);
  if (!todo.length) return [];
  let doc = before;
  for (const [from, to] of todo) doc = { ...reIdDoc(doc, from, to), cloud: doc.cloud };
  // What to write: records that changed, and keys that are gone. When a
  // renamed record lands on a key the device already has (the person was
  // here under the new id too), the one already there stays.
  const ops = [];
  for (const { name, keyPath } of SCHEMA) {
    if (name === 'settings') continue;
    const was = new Map((before[name] ?? []).map((r) => [r[keyPath], r]));
    const now = new Map();
    for (const r of doc[name] ?? []) {
      const k = r[keyPath];
      if (!now.has(k) || was.get(k) === r) now.set(k, r);
    }
    for (const [k, r] of now) if (was.get(k) !== r) ops.push({ store: name, put: r });
    for (const k of was.keys()) if (!now.has(k)) ops.push({ store: name, del: k });
  }
  const map = { ...(state.settings.get(RENAMED_KEY) ?? {}) };
  for (const [from, to] of todo) {
    for (const k of Object.keys(map)) if (map[k] === from) map[k] = to;
    map[from] = to;
  }
  ops.push({ store: 'settings', put: { key: RENAMED_KEY, value: map } });
  await db.batch(ops);
  await readStorage();
  logEvent('person', { newIds: todo.length });
  return todo;
}

// Data arriving from outside (a backup, older sounds found) with plain
// person ids: renamed before it is merged, onto the person this device
// already renamed, else a new random id. Returns the renamed data and the
// pairs, which the caller remembers (rememberRenames) once it is stored.
export function reIdIncoming(data, makeId = () => newId('p')) {
  const kitIds = (state.manifest?.kit ?? []).map((k) => k.id);
  const keep = new Set((state.manifest?.people ?? []).map((p) => p.id));
  const pairs = plainPersonIds({ ...data, cloud: [] }, { kitIds, keep })
    .map((from) => [from, isCloudId(renamedId(from)) ? renamedId(from) : makeId()]);
  let out = data;
  for (const [from, to] of pairs) out = reIdDoc(out, from, to);
  return { data: out, pairs };
}

export async function rememberRenames(pairs) {
  if (!pairs.length) return;
  const map = { ...(state.settings.get(RENAMED_KEY) ?? {}) };
  for (const [from, to] of pairs) map[from] = to;
  state.settings.set(RENAMED_KEY, map);
  await persist('settings', { key: RENAMED_KEY, value: map });
}

// This browser gave no storage at all: the board runs from memory only.
let storageFailed = false;

// How long the board waits for saved data before showing without it.
export const STORAGE_WAIT_MS = 1500;
const WAITING = 'Your saved sounds are waiting for another soundboard tab to let go. Close or reload the other tab and they will appear.';

// Opens storage and reads it. The board must never wait on this: opening can
// be held up for as long as another tab keeps an older version open. So after
// STORAGE_WAIT_MS this returns anyway (the board shows with only boards.json
// sounds and a note), and `onLateOpen` is called once the data does arrive.
export async function loadStorage({ onLateOpen = () => {}, waitMs = STORAGE_WAIT_MS } = {}) {
  let late = false;
  const opening = db.open({
    onBlocked: () => showNotice(WAITING),
    onVersionChange: () => showNotice('A newer version of the soundboard opened in another tab. Reload this page to keep saving changes.'),
  }).then(readStorage).then(() => {
    logEvent('storage', { opened: true, late });
    storageWaiting = false;
    if (late) { showNotice(''); onLateOpen(); }
    return 'open';
  }, (err) => {
    storageFailed = true;
    console.error('IndexedDB unavailable:', err);
    logEvent('error', { storage: String(err.message || err.name) });
    showNotice(`Sounds you add can't be saved in this browser (${err.message || err.name}). They'll play until you reload the page.`);
    return 'failed';
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve('late'), waitMs));
  if (await Promise.race([opening, timeout]) === 'late') {
    late = true;
    storageWaiting = true;
    logEvent('storage', { waiting: true });
    showNotice(WAITING);
  }
}

// Saves a kid's edit. A record that syncs is stamped with when it changed
// (merge3.js), so a clash with another device's edit keeps the newer one.
// Resolves false when storage refused it (a full disk, or storage not open:
// waiting for another tab, or closed for a newer copy's upgrade), so a screen
// can keep the work open to save again. Only with no storage at all does this
// visit keep everything in memory, as the notice says, and it resolves true.
export async function persist(store, value) {
  try {
    await db.put(store, stampEdit(store, value));
  } catch (err) {
    console.error(`Saving to ${store} failed:`, err);
    showNotice(wouldNotSave(err));
    return storageFailed;
  }
  if (MADE.has(store)) keepStorage();
  return true;
}

// Browsers may clear a site's storage when the disk runs short, unless the
// site asks to keep it (navigator.storage.persist). A family's sounds, beats
// and songs live in IndexedDB, so the app asks, once per visit, the first
// time something a kid made is saved: not at launch, when there is nothing to
// keep and a browser that asks (Firefox) would be asking for nothing. The
// browser decides; a refusal changes nothing.
const MADE = new Set(['clips', 'beats', 'takes', 'songs', 'songbook', 'voices', 'decks']);
let askedToKeep = false;
export function keepStorage(nav = globalThis.navigator) {
  if (askedToKeep || typeof nav?.storage?.persist !== 'function') return Promise.resolve(false);
  askedToKeep = true;
  return (async () => {
    try {
      if (await nav.storage.persisted?.()) return true;
      return !!(await nav.storage.persist());
    } catch {
      return false;   // a browser that refuses to answer is no reason to stop saving
    }
  })();
}
// For tests: the next save asks again.
export const forgetKeepAsk = () => { askedToKeep = false; };

// An override that changes nothing is deleted rather than stored, so the
// clip goes back to following boards.json. Its edit stamp (`changed`, from
// the last save) is no change: hidden then shown again is nothing.
// Resolves as persist() does.
export async function setOverride(next) {
  if (!isEmptyOverride(next)) {
    state.overrides.set(next.id, next);
    return persist('overrides', next);
  }
  state.overrides.delete(next.id);
  try {
    await db.remove('overrides', next.id);
  } catch (err) {
    console.error('Removing an override failed:', err);
    showNotice(wouldNotRemove(err));
    return storageFailed;
  }
  return true;
}

// Deletes one record a kid deleted (a sound, a beat, a take, a layout…).
// A browser that refuses is told so, since it may come back after a reload.
// `what` names it in the notice ("That take"). Resolves to whether it went.
export async function removeRecord(store, key, what) {
  // A browser that gives no storage at all has nothing stored to bring
  // back, and was told at the start that nothing saves: no notice, which
  // would replace an ↩️ Undo showing (a groove into the scratch closes the
  // open beat).
  if (!db.handle && storageFailed) return true;
  try {
    await db.remove(store, key);
    return true;
  } catch (err) {
    console.error(`Deleting from ${store} failed:`, err);
    showNotice(wouldNotRemove(err, what));
    return false;
  }
}

// A person's saved list kept in `state[field]` and the `store` behind it
// (beats, songbook, takes, layouts, touchLayouts): one writer, so a put and a
// remove are told the same way everywhere. `put` replaces the record by id in
// memory and persists it (`clone`: a copy goes to storage, so the stamp
// `persist` adds stays out of memory); `remove` takes it out of memory, calls
// `onRemove(id)`, then deletes it from storage, telling a refusal as `what`
// ("That take"). `list(personId)` is the person's, `newest` first when asked.
export function shelf(field, store, { what, clone = false, newest = false, onRemove } = {}) {
  return {
    list: (personId) => {
      const mine = state[field].filter((r) => r.personId === personId);
      return newest ? mine.sort((a, b) => b.saved - a.saved) : mine;
    },
    put: (record) => {
      state[field] = [...state[field].filter((r) => r.id !== record.id), record];
      persist(store, clone ? structuredClone(record) : record);
    },
    remove: async (id) => {
      state[field] = state[field].filter((r) => r.id !== id);
      onRemove?.(id);
      await removeRecord(store, id, what);
    },
  };
}

// Bundled people store only what differs from boards.json; a record that
// changes nothing is deleted. People added in the app store everything.
export async function setPersonEdit(id, changes) {
  const base = state.manifest.people.find((p) => p.id === id);
  const next = personEditRecord(base, state.peopleEdits.get(id) || { id }, changes);
  if (!next) {
    state.peopleEdits.delete(id);
    try { await db.remove('people', id); } catch (err) {
      console.error('Removing a person edit failed:', err);
      showNotice(wouldNotRemove(err));
    }
    return;
  }
  state.peopleEdits.set(id, next);
  await persist('people', next);
}

// Deleting a person removes everything that was theirs: recorded sounds, saved
// beats, the beat on screen, the pad order and their edits to the kit's
// sounds. A kit edit left behind once brought them back on the next start
// (adoptStoredPeople makes a person of any id a record names). A person added in the app is
// gone entirely. One from boards.json can't be removed from that file, so they
// stay as a hidden record (name and color back to the file's) and can be
// brought back; their bundled sounds return with them, recorded ones don't.
// It all goes in one transaction: a browser that refuses part of it keeps
// all of it, so nothing is left to bring back a person with a new name.
// Returns the ids of the sounds that went, so the caller can drop their
// cached audio, or null when this browser wouldn't delete them (said in a
// notice; nothing changed).
export async function deletePerson(id) {
  const theirs = (list) => list.filter((x) => x.personId === id);
  const goneClips = theirs(state.userClips).map((c) => c.id);
  // Kit edits are stored as `<person>-<kit sound>` and name no personId:
  // theirs is one only they, of the people here, could have written. One
  // another person here also fits (`p-t-lets-go`: p-t's Let's go, or
  // p-t-lets's Go) stays: a kept edit is safer than someone else's lost.
  const kit = (state.manifest.kit ?? []).map((k) => k.id);
  const known = new Set([id, ...state.peopleEdits.keys(), ...(state.manifest.people ?? []).map((p) => p.id)]);
  const goneEdits = [...state.overrides.keys()].filter((o) => {
    const owners = presetOwners(o, kit, known);
    return owners.length === 1 && owners[0] === id;
  });
  const bundled = state.manifest.people.find((p) => p.id === id);
  // One from boards.json stays, hidden, with nothing else of theirs.
  const hidden = bundled ? personEditRecord(bundled, { id }, { hidden: true }) : null;
  // Everything the table holds that is theirs: a list's records that name
  // them, a one-a-person Map's record under their id, and the kit edits found
  // above. The device's settings and cloud link stay; `people` is below.
  const ops = [];
  for (const { store, field, shape } of STORE_TABLE) {
    if (shape === 'list') ops.push(...theirs(state[field]).map((r) => ({ store, del: r.id })));
    else if (shape === 'byPerson') ops.push({ store, del: id });
    else if (store === 'overrides') ops.push(...goneEdits.map((o) => ({ store, del: o })));
  }
  ops.push(hidden ? { store: 'people', put: hidden } : { store: 'people', del: id });
  // With no storage at all (a browser that gives none), there is nothing
  // stored to leave behind. Storage not open (still opening, or closed for
  // another tab's upgrade) is a refusal: what is stored would come back.
  try {
    if (db.handle || !storageFailed) await db.batch(ops);
  } catch (err) {
    console.error('Deleting a person failed:', err);
    const name = state.peopleEdits.get(id)?.name ?? bundled?.name ?? 'They';
    showNotice(storageWaiting
      ? `${name} wasn't deleted: another soundboard tab is still holding your saved sounds. Close or reload that tab, then try again.`
      : `This browser wouldn't delete ${name} (${err.message || err.name}), so nothing of theirs is gone. Try again.`);
    return null;
  }
  for (const { store, field, shape } of STORE_TABLE) {
    if (shape === 'list') state[field] = state[field].filter((r) => r.personId !== id);
    else if (shape === 'byPerson') state[field].delete(id);
    else if (store === 'overrides') for (const o of goneEdits) state[field].delete(o);
  }
  if (hidden) state.peopleEdits.set(id, hidden); else state.peopleEdits.delete(id);
  return goneClips;
}

// Deletes a sound the user made. A browser that refuses the delete is told so,
// since the sound may come back after a reload.
export async function deleteUserClip(clip) {
  state.userClips = state.userClips.filter((c) => c.id !== clip.id);
  try {
    await db.remove('clips', clip.id);
  } catch (err) {
    console.error('Delete failed:', err);
    showNotice(`“${clip.label}” is gone for now, but this browser wouldn't delete it (${err.message || err.name}), so it may come back after a reload.`);
  }
}

// A kid's own voice (⭐ Save voice, voice-knobs.js), made or changed.
export async function saveMyVoice(record) {
  state.myVoices = [...state.myVoices.filter((v) => v.id !== record.id), record];
  await persist('voices', record);
}

// Deletes a kid's own voice. A sound made with it keeps its knobs: a sound
// stores knob positions, never which voice made them.
export async function deleteMyVoice(id) {
  state.myVoices = state.myVoices.filter((v) => v.id !== id);
  try {
    await db.remove('voices', id);
  } catch (err) {
    console.error('Delete failed:', err);
    showNotice(`That voice is gone for now, but this browser wouldn't delete it (${err.message || err.name}), so it may come back after a reload.`);
  }
}
