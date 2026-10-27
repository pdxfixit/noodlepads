// Storage: the IndexedDB database `noodle-pads`. Stored formats are
// part of what users keep on their devices, so a change here needs an
// upgrade path that old databases can follow (see upgradeStores).
//
//   clips      sounds made in the app, with their audio Blob       key id
//   overrides  edits to boards.json clips                          key id
//   orders     a person's pad order                                key personId
//   patterns   Beats' open beat, per person (none open: no record) key personId
//   beats      the saved-beat library                              key id
//   people     renames/recolors/hides, and people added in the app key id
//   settings   this device's choices, {key, value} (settings.js)  key key
//   decks      DJ mode: changed keys, Beat Builder's open beat id  key personId
//   takes      DJ mode: freestyle recordings                       key id
//   songs      Song mode: a person's open song                     key personId
//   songbook   Song mode: every saved song                         key id
//   cloud      a person in the cloud: key, rev, what was sent      key id (the person's)
//              (never in backups: it is this device's link)
//   prefs      a person's own settings, {personId, values}         key personId
//   layouts    DJ mode: a person's saved key layouts (keyset.js)   key id
//   voices     a kid's own voices (⭐ Save voice): {id, personId,   key id
//              name, emoji, knobs, created, used} (voice-knobs.js)
//   bases      cloud sync: each synced record as it was at the last  key id
//              sync, the base of the three-way merge (merge3.js):
//              {id: "<person>|<kind>:<record id>", personId, body}
//              (never in backups, and never read into the app's state)
//   touchLayouts  a person's saved 👆 touch layouts: {id, personId,  key id
//              name, created, bands} (touch.js, ADR 0029)

import { stampBeats } from './old-beats.js';

// Named when the app moved to noodlepads.com, where nothing was stored yet.
// A database an older copy left under the old name is only read, by
// ⚙️ Settings → Older sounds found on this device (leftover.js).
// It keeps its hyphen through the 1.0 rename: a browser can't rename a
// database, so a new name would leave every kid's sounds behind.
export const DB_NAME = 'noodle-pads';

// Every store, with the database version that introduced it.
export const SCHEMA = [
  { name: 'clips', keyPath: 'id', since: 1 },
  { name: 'overrides', keyPath: 'id', since: 1 },
  { name: 'orders', keyPath: 'personId', since: 2 },
  { name: 'patterns', keyPath: 'personId', since: 3 },
  { name: 'beats', keyPath: 'id', since: 4 },
  { name: 'people', keyPath: 'id', since: 5 },
  { name: 'settings', keyPath: 'key', since: 6 },
  { name: 'decks', keyPath: 'personId', since: 7 },  // DJ mode: the keys a person changed
  { name: 'takes', keyPath: 'id', since: 7 },        // DJ mode: freestyle recordings
  { name: 'songs', keyPath: 'personId', since: 8 },  // Song mode: a person's open song (ADR 0006, 0007)
  { name: 'songbook', keyPath: 'id', since: 9 },     // Song mode: every saved song (ADR 0007)
  { name: 'cloud', keyPath: 'id', since: 10 },       // people in the cloud: this device's key and sync state (ADR 0002)
  { name: 'prefs', keyPath: 'personId', since: 11 }, // a person's settings, which travel with them (settings.js)
  { name: 'layouts', keyPath: 'id', since: 12 },     // DJ mode: a person's saved key layouts (ADR 0014)
  { name: 'voices', keyPath: 'id', since: 13 },      // a kid's own voices, knob settings with a name (voice-knobs.js)
  { name: 'bases', keyPath: 'id', since: 14 },       // cloud sync: each record as last synced, for the three-way merge (merge3.js)
  { name: 'touchLayouts', keyPath: 'id', since: 15 }, // a person's saved 👆 touch layouts (ADR 0029)
];

// Version 16 changes no store: it writes the time signature into every beat
// saved before each beat had its own (old-beats.js).
export const STAMP_SINCE = 16;

export const DB_VERSION = Math.max(STAMP_SINCE, ...SCHEMA.map((s) => s.since));
export const STORE_NAMES = SCHEMA.map((s) => s.name);

// Brings a database from `oldVersion` (0 for a new one) to DB_VERSION by
// creating the stores it doesn't have yet, then, with the upgrade's
// `transaction`, stamping old beats (stampStored). Never changes anything else.
export function upgradeStores(database, oldVersion, transaction) {
  for (const { name, keyPath, since } of SCHEMA) {
    if (oldVersion < since) database.createObjectStore(name, { keyPath });
  }
  if (transaction && oldVersion > 0 && oldVersion < STAMP_SINCE) stampStored(transaction);
}

// Writes each saved beat's time signature, and each open beat's, where it has
// none: what the beat was read in until now, by its person's settings (the
// old Settings signature with Advanced on, else 4/4), so nothing a kid hears
// changes and nothing is guessed after this. It runs inside the upgrade's
// transaction, in plain callbacks (a promise can let the transaction end
// early). If anything goes wrong it stops without a word: the upgrade must
// finish, or the app cannot open its database; a beat left unsigned plays as 4/4.
// A request that fails aborts the whole upgrade unless its error is handled
// (and then `open()` rejects on every load), so each request handles its own.
// A failure at commit (a full disk) still aborts the upgrade; nothing here can catch that.
function stampStored(transaction) {
  const rows = {};
  let unread = false;
  const names = ['prefs', 'settings', 'beats', 'patterns'];
  // Keeps a failed request from aborting the transaction.
  const quiet = (req, then) => {
    req.onerror = (e) => { e?.preventDefault?.(); e?.stopPropagation?.(); then?.(); };
  };
  const next = (i) => {
    try {
      if (i < names.length) {
        const req = transaction.objectStore(names[i]).getAll();
        req.onsuccess = () => { rows[names[i]] = req.result; next(i + 1); };
        // A store that cannot be read: the rest still read, but nothing is stamped
        // (a person's settings missing would stamp their beats wrongly; unsigned plays as 4/4).
        quiet(req, () => { unread = true; next(i + 1); });
        return;
      }
      if (unread) return;
      for (const store of ['beats', 'patterns']) {
        for (const record of stampBeats(rows[store], rows.prefs, rows.settings)) quiet(transaction.objectStore(store).put(record));
      }
    } catch { /* leave them unsigned */ }
  };
  next(0);
}

export const db = {
  handle: null,

  // Opening can be held up when another tab still has the database open at
  // an older version: the upgrade waits until that tab lets go. That is
  // reported through `onBlocked` and the open carries on waiting; it is not a
  // failure. Once open, if a newer copy of the app (another tab, after a
  // deploy) asks to upgrade, this tab lets go at once so the upgrade can
  // happen, and says so through `onVersionChange`.
  open({ onBlocked = () => {}, onVersionChange = () => {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => upgradeStores(req.result, e.oldVersion, req.transaction);
      req.onsuccess = () => {
        this.handle = req.result;
        this.handle.onversionchange = () => {
          this.handle.close();
          this.handle = null;
          onVersionChange();
        };
        resolve();
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => onBlocked();
    });
  },

  run(store, mode, fn) {
    return new Promise((resolve, reject) => {
      if (!this.handle) { reject(new Error('storage is not available')); return; }
      const tx = this.handle.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    });
  },

  // Told the store's name after every put and delete that succeeds, so cloud
  // sync (cloud.js) knows something changed. Set by whoever listens.
  onChange: () => {},

  // Several changes, across stores, in one transaction: every one of them is
  // saved, or none is. `ops` is a list of {store, put: record} and
  // {store, del: key}, run in order.
  batch(ops) {
    const names = [...new Set(ops.map((o) => o.store))];
    if (!names.length) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!this.handle) { reject(new Error('storage is not available')); return; }
      const tx = this.handle.transaction(names, 'readwrite');
      tx.oncomplete = () => {
        for (const name of names) this.onChange(name);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
      for (const op of ops) {
        const s = tx.objectStore(op.store);
        if ('put' in op) s.put(op.put); else s.delete(op.del);
      }
    });
  },

  all(store) { return this.run(store, 'readonly', (s) => s.getAll()); },
  async put(store, value) {
    const out = await this.run(store, 'readwrite', (s) => s.put(value));
    this.onChange(store);
    return out;
  },
  async remove(store, id) {
    const out = await this.run(store, 'readwrite', (s) => s.delete(id));
    this.onChange(store);
    return out;
  },
};
