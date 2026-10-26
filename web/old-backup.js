// Everything an older copy of the app left in this browser, as one zip that
// today's Noodle Pads loads (⚙️ Settings → Load a backup), and what it holds,
// in words. ⚙️ Settings → "Older sounds found on this device" (leftover.js)
// makes it.
//
//   backup.json            the older copy's database, every store raw, in the
//                          old app's own backup format: app "noodlepads",
//                          format 1 (a number), which the app reads as "from
//                          before 1.0" and converts with the old-store
//                          conversions (web/backup.js beforeOne);
//   sounds/<id>.<ext>      every sound's audio, byte for byte;
//   everything/…           the rest of what this address saved, which the app's
//                          loader ignores: every other database's stores
//                          (`everything/<n>-<database>/<store>.json`, any
//                          Blob in them under `…/blobs/`) and every
//                          localStorage key (`everything/localStorage.json`).
//
// Nothing is left out: every database, every store, every record as it is. A
// sound with no audio keeps its details.

import { zip } from './zip.js';
import { KIND_EMOJI } from './model.js';

// The file name a sound's audio gets, by its type (as web/util.js extensionFor).
export function extensionFor(mime = '') {
  const m = String(mime);
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'audio';
}

// ── What it holds, in words ─────────────────────────────────────────────

// "1 sound", "2 sounds", "2 people".
export function plural(n, word) {
  if (n === 1) return `${n} ${word}`;
  return `${n} ${word === 'person' ? 'people' : `${word}s`}`;
}

// A size people read: "800 KB", "1.4 MB", "12 MB".
export function sizeWords(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b < 1048576) return `${Math.max(b ? 1 : 0, Math.round(b / 1024))} KB`;
  const mb = b / 1048576;
  return mb < 9.95 ? `${String(mb.toFixed(1)).replace(/\.0$/, '')} MB` : `${Math.round(mb)} MB`;
}

const list = (stores, name) => (Array.isArray(stores?.[name]) ? stores[name] : []);

// How much of each kind a set of the app's stores holds ({store: [records]},
// as the database or a backup keeps them). Songs are the saved songs, plus an
// open song that isn't one of them. Audio is the bytes of every sound's audio.
export function holdings(stores) {
  const songbook = list(stores, 'songbook');
  const saved = new Set(songbook.map((s) => s?.id).filter(Boolean));
  return {
    sounds: list(stores, 'clips').length,
    beats: list(stores, 'beats').length,
    songs: songbook.length + list(stores, 'songs').filter((s) => !s?.id || !saved.has(s.id)).length,
    takes: list(stores, 'takes').length,
    voices: list(stores, 'voices').length,
    people: list(stores, 'people').length,
    edits: list(stores, 'overrides').length,
    djKeys: list(stores, 'decks').length,
    layouts: list(stores, 'layouts').length,
    touchLayouts: list(stores, 'touchLayouts').length,
    audio: list(stores, 'clips').reduce((sum, c) => sum + (Number(c?.blob?.size) || 0), 0),
  };
}

// The same, in words, each kind with its emoji: "🔊 27 sounds · 🥁 4 beats ·
// 🎼 1 song · 👥 2 people · 12 MB of audio". Kinds with none are left out;
// `other` (records outside the app's stores) is added as "5 other saved
// things". "nothing yet" when there is none.
export function holdsWords(stores, other = 0) {
  const h = holdings(stores);
  const parts = [
    ['sounds', 'sound'], ['beats', 'beat'], ['songs', 'song'], ['takes', 'take'], ['voices', 'voice'],
    ['people', 'person'], ['edits', 'sound edit'], ['djKeys', 'DJ key set'],
    ['layouts', 'key layout'], ['touchLayouts', 'touch layout'],
  ].filter(([k]) => h[k] > 0).map(([k, word]) => `${KIND_EMOJI[k]} ${plural(h[k], word)}`);
  if (h.audio > 0) parts.push(`${sizeWords(h.audio)} of audio`);
  if (other > 0) parts.push(plural(other, 'other saved thing'));
  return parts.length ? parts.join(' · ') : 'nothing yet';
}

// ── Reading everything ──────────────────────────────────────────────────

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);   // no version: opens it as it is, never upgrades it
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('another tab is holding it'));
  });
}

const ask = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// Every database this address saved (but those named in `skip`), each store
// read whole, only ever read: {databases: [{name, version, stores: {store:
// [records]}, keys: {store: [keys]}}], localStorage: {key: value}}. `keys` is
// kept for a store whose records don't hold their own key. A database that
// won't open stops it all: better to say so than to save half.
export async function readEverything({ skip = [] } = {}) {
  const databases = [];
  for (const { name } of await indexedDB.databases()) {
    if (!name || skip.includes(name)) continue;
    const database = await openDatabase(name);
    try {
      const names = [...database.objectStoreNames];
      const stores = {};
      const keys = {};
      if (names.length) {
        const tx = database.transaction(names, 'readonly');
        // Every request is made before any answer is awaited, so the
        // transaction stays open on older browsers too.
        await Promise.all(names.map((n) => {
          const store = tx.objectStore(n);
          const reads = [ask(store.getAll()).then((r) => { stores[n] = r; })];
          if (store.keyPath === null) reads.push(ask(store.getAllKeys()).then((k) => { keys[n] = k; }));
          return Promise.all(reads);
        }));
      }
      databases.push({ name, version: database.version, stores, keys });
    } finally {
      database.close();
    }
  }
  const local = {};
  try {
    const ls = globalThis.localStorage;
    for (let i = 0; i < (ls?.length ?? 0); i++) {
      const key = ls.key(i);
      if (key !== null) local[key] = ls.getItem(key);
    }
  } catch { /* storage blocked: there is nothing to read */ }
  return { databases, localStorage: local };
}

// How many records sit outside the app's database: every other database's
// records, and every localStorage key.
export function otherCount(all, appName) {
  let n = Object.keys(all?.localStorage ?? {}).length;
  for (const d of all?.databases ?? []) {
    if (d.name === appName) continue;
    for (const records of Object.values(d.stores)) n += records.length;
  }
  return n;
}

// ── Writing the zip ─────────────────────────────────────────────────────

// A record as JSON can hold it: each Blob (and raw bytes) becomes a file
// beside it, named in place as {"$blob": path, "type": …}; a Map or a Set
// keeps its entries. Dates become their ISO text, as JSON does.
function storable(value, addFile) {
  if (value instanceof Blob) return { $blob: addFile(value, value.type), type: value.type, size: value.size };
  if (value instanceof ArrayBuffer) return { $bytes: addFile(new Blob([value])), size: value.byteLength };
  if (ArrayBuffer.isView(value)) return { $bytes: addFile(new Blob([value])), size: value.byteLength, kind: value.constructor.name };
  if (value instanceof Map) return { $map: [...value].map(([k, v]) => [storable(k, addFile), storable(v, addFile)]) };
  if (value instanceof Set) return { $set: [...value].map((v) => storable(v, addFile)) };
  if (Array.isArray(value)) return value.map((v) => storable(v, addFile));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, storable(v, addFile)]));
  }
  return value;
}

const json = (doc) => new TextEncoder().encode(JSON.stringify(doc, null, 1));
const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || '_';

// The app's stores as backup.json and its sounds' files. Any Blob outside a
// sound's audio goes under `blobDir`.
async function appFiles(stores, when, blobDir) {
  const files = [];
  const pending = [];
  const addFile = (blob, type = '') => {
    const name = `${blobDir}/${pending.length + 1}.${extensionFor(type) === 'audio' ? 'bin' : extensionFor(type)}`;
    pending.push({ name, blob });
    return name;
  };
  const clips = [];
  for (const c of stores.clips ?? []) {
    const { blob, ...meta } = c ?? {};
    if (blob && typeof blob.arrayBuffer === 'function') {
      const file = `sounds/${meta.id}.${extensionFor(meta.mime || blob.type)}`;
      files.push({ name: file, data: new Uint8Array(await blob.arrayBuffer()) });
      clips.push({ ...storable(meta, addFile), file });
    } else {
      clips.push(storable(meta, addFile));
    }
  }
  const doc = { app: 'noodlepads', format: 1, exported: when.toISOString(), version: 'older copy' };
  for (const [name, records] of Object.entries(stores)) doc[name] = name === 'clips' ? clips : storable(records, addFile);
  for (const p of pending) files.push({ name: p.name, data: new Uint8Array(await p.blob.arrayBuffer()) });
  files.unshift({ name: 'backup.json', data: json(doc) });
  return files;
}

// stores: the app's database, {store name: [records]}, read raw from
// IndexedDB. Returns the zip: backup.json and the sounds.
export async function makeOldBackup(stores, when = new Date()) {
  return zip(await appFiles(stores, when, 'everything/app/blobs'), when);
}

// all: readEverything's answer; appName: the app's database among it (or
// null). Returns the zip of everything: the app's part as makeOldBackup makes
// it, and every other database and localStorage under everything/.
export async function makeEverything(all, appName, when = new Date()) {
  const app = all.databases.find((d) => d.name === appName);
  const files = await appFiles(app?.stores ?? {}, when, 'everything/app/blobs');
  const index = { exported: when.toISOString(), app: appName ? 'backup.json' : null, databases: [], localStorage: 'everything/localStorage.json' };
  let i = 0;
  for (const d of all.databases) {
    if (d.name === appName) continue;
    const dir = `everything/${++i}-${safe(d.name)}`;
    const pending = [];
    const addFile = (blob, type = '') => {
      const name = `${dir}/blobs/${pending.length + 1}.${extensionFor(type) === 'audio' ? 'bin' : extensionFor(type)}`;
      pending.push({ name, blob });
      return name;
    };
    const entry = { name: d.name, version: d.version, dir, stores: [] };
    for (const [store, records] of Object.entries(d.stores)) {
      const file = `${dir}/${safe(store)}.json`;
      const doc = { database: d.name, version: d.version, store, records: storable(records, addFile) };
      if (d.keys?.[store]) doc.keys = storable(d.keys[store], addFile);
      files.push({ name: file, data: json(doc) });
      entry.stores.push({ name: store, file, records: records.length });
    }
    for (const p of pending) files.push({ name: p.name, data: new Uint8Array(await p.blob.arrayBuffer()) });
    index.databases.push(entry);
  }
  files.push({ name: 'everything/localStorage.json', data: json(all.localStorage ?? {}) });
  files.push({ name: 'everything/index.json', data: json(index) });
  return zip(files, when);
}

// Today's date, for the file name.
export const everythingName = (when = new Date()) =>
  `noodlepads-everything-${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}.zip`;
