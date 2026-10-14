// ⚙️ Settings → "Older sounds found on this device". The app's database was
// renamed `noodle-pads` when it moved to noodlepads.com (store.js); sounds an
// older copy saved on this same address (Ben's dev server, localhost:8765, or
// any browser that ran an older copy here) sit in a database under the old
// name, which the app no longer opens. That name is not written here (it
// named a person): the database is found by its stores.
//
// The section shows only when such a database holds something a kid made:
//   📥 Bring them in        the checks a backup gets plus the conversions
//                           only data from before 1.0 needs (readOldStores),
//                           and a backup's merge (backup-ui.js storeLoaded),
//                           with the same plain notice;
//   💾 Save everything it left  everything this address saved but the app's
//                           own database (old-backup.js): the older database
//                           raw, every sound byte for byte, any other
//                           database and localStorage; it loads through
//                           Settings → 📂 Load a backup.
// Both say first what is there, by kind (old-backup.js holdsWords).
// Nothing found is ever changed or deleted.
//
// Tested: the pure parts (tests/leftover.test.mjs, tests/old-device.test.mjs).
// Not tested here: a real indexedDB.databases() and IndexedDB, which need a
// browser.

import { DB_NAME } from './store.js';
import { cleanBackup } from './backup.js';
import { whatIsHere, storeLoaded, leftOut } from './backup-ui.js';
import { mergeSummary } from './merge.js';
import { makeEverything, everythingName, readEverything, holdsWords, otherCount, sizeWords } from './old-backup.js';
import { downloadBlob } from './download.js';
import { showNotice } from './ui.js';
import { logEvent } from './log.js';
import { unfoldSettings } from './settings-ui.js';

// An older copy's database among `found` ({name, stores: [store names]}):
// not this app's, and with the stores every copy of the app had ("clips" and
// "overrides" since the first version; "people" from version 5). Null when
// there is none.
export function pickOldDatabase(found, current = DB_NAME) {
  return found.find((d) => d.name && d.name !== current && d.stores.includes('clips')
    && (d.stores.includes('overrides') || d.stores.includes('people')))?.name ?? null;
}

// All the older copy's sounds together, at most. They are read as Blobs (not
// unpacked into memory), so this is far above what a kid could have made.
export const MAX_OLD_AUDIO_BYTES = 2048 * 1024 * 1024;

const STORES = ['people', 'clips', 'overrides', 'orders', 'patterns', 'beats', 'settings', 'decks', 'takes', 'songs', 'songbook'];

// The older database's stores ({<store>: [records]}, as IndexedDB holds them;
// a sound's audio is its Blob), checked exactly as a backup is checked
// (backup.js cleanBackup: the same fields, types, caps and limits), plus the
// conversions only data from before 1.0 needs (`oldStores`: people an older
// boards.json named, model.js adoptPeople; open songs without an id; the old
// starter sounds, starters.js). Returns the cleaned data, as backup.js
// readBackup does; throws on anything that is not that shape. `here` is what
// is on this device (whatIsHere); `maxBytes` the most all the sounds together
// may be.
export function readOldStores(stores, here, { maxBytes = MAX_OLD_AUDIO_BYTES } = {}) {
  if (!stores || typeof stores !== 'object' || Array.isArray(stores)) throw new Error("what was found wasn't Noodle Pads data");
  const doc = Object.fromEntries(STORES.map((name) => [name, Array.isArray(stores[name]) ? stores[name] : []]));
  let total = 0;
  const audioOf = (clip) => {
    const blob = clip?.blob;
    if (!(blob instanceof Blob)) return null;
    total += blob.size;
    return total <= maxBytes ? blob : null;
  };
  return cleanBackup(doc, audioOf, here, { oldStores: true });
}

// Anything a kid made or changed. Settings alone (a switch flipped) don't count.
export function hasData(stores) {
  return Object.entries(stores ?? {}).some(([name, records]) => name !== 'settings' && Array.isArray(records) && records.length > 0);
}

// Everything this address saved but the app's own database: {all, name},
// where `name` is the older copy's database among `all.databases` (null when
// there is none). Null when this browser can't tell (indexedDB.databases is
// missing).
export async function readLeftover() {
  if (typeof globalThis.indexedDB?.databases !== 'function') return null;
  const all = await readEverything({ skip: [DB_NAME] });
  const name = pickOldDatabase(all.databases.map((d) => ({ name: d.name, stores: Object.keys(d.stores) })));
  return { all, name };
}

const el = {};
let stores = null;
let found = null;

async function bringIn() {
  el.bring.disabled = true;
  try {
    const here = whatIsHere();
    const data = readOldStores(stores, here);
    const merged = await storeLoaded(data);
    logEvent('move', { sounds: merged.added.sounds, beats: merged.added.beats, people: merged.added.people, already: merged.already, skipped: data.skipped });
    showNotice(`Older sounds brought in 🎉 ${mergeSummary(merged)}${leftOut(data, merged)}`);
  } catch (err) {
    console.error('Bringing in the older sounds failed:', err);
    showNotice(`The older sounds didn't come in (${err.message || err.name}). They are still on this device: try again, or save everything it left.`);
  } finally {
    el.bring.disabled = false;
  }
}

// What there is, by kind: the older database, and anything else saved here.
const what = () => holdsWords(stores, otherCount(found?.all, found?.name));

async function saveThem() {
  el.save.disabled = true;
  try {
    const blob = await makeEverything(found.all, found.name);
    downloadBlob(blob, everythingName());
    showNotice(`Saved everything the older copy left: ${what()}. The file is ${sizeWords(blob.size)}. It loads in ⚙️ Settings → 📂 Load a backup.`);
  } catch (err) {
    console.error('The backup of the older sounds failed:', err);
    showNotice(`The backup didn't save (${err.message || err.name}).`);
  } finally {
    el.save.disabled = false;
  }
}

// Looks once, after the app has started; shows the section only when there
// is something to bring in.
export async function initLeftover() {
  Object.assign(el, {
    section: document.querySelector('#set-older'),
    what: document.querySelector('#older-what'),
    bring: document.querySelector('#older-bring'),
    save: document.querySelector('#older-save'),
  });
  if (!el.section) return;
  el.bring.addEventListener('click', bringIn);
  el.save.addEventListener('click', saveThem);
  try {
    found = await readLeftover();
    stores = found?.name ? found.all.databases.find((d) => d.name === found.name).stores : null;
  } catch (err) {
    console.error('Looking for older sounds failed:', err);
    return;
  }
  if (!hasData(stores)) return;
  el.what.textContent = `An older copy of the app left these in this browser: ${what()}. They are still here, and stay here.`;
  el.section.hidden = false;
  unfoldSettings('set-older', { keep: false });   // news: open, without remembering it open
}
