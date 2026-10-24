// ⚙️ Settings → 💾 Save a backup / 📂 Load a backup. The zip format and its
// checks are in backup.js; this is the buttons around it.

import { state, readStorage, deletePerson, reIdIncoming, rememberRenames } from './state.js';
import { db } from './store.js';
import { audio } from './audio.js';
import { makeBackup, readBackup, leftOutNote, personBackupLists } from './backup.js';
import { mergeLoaded, mergeSummary } from './merge.js';
import { colorName, people } from './board.js';
import { renderPeople } from './pads.js';
import { refreshPeople } from './people.js';
import { notifyAllSettings } from './settings.js';
import { downloadBlob } from './download.js';
import { showNotice } from './ui.js';
import { logEvent } from './log.js';
import { localDate } from './util.js';
import { holdsWords, sizeWords } from './old-backup.js';

const el = {};

async function saveBackup() {
  el.save.disabled = true;
  try {
    const lists = storedLists();
    const blob = await makeBackup(lists, state.version);
    downloadBlob(blob, `noodlepads-backup-${localDate()}.zip`);
    logEvent('backup', { saved: true, sounds: state.userClips.length, beats: state.savedBeats.length, bytes: blob.size });
    showNotice(`Saved a backup: ${holdsWords(lists)}. The file is ${sizeWords(blob.size)}.`);
  } catch (err) {
    console.error('Backup failed:', err);
    logEvent('backup', { saved: false, error: err.message || err.name });
    showNotice(`The backup didn't save (${err.message || err.name}).`);
  } finally {
    el.save.disabled = false;
  }
}

// 🗂️ See all's ⬇️ Save a backup of them: one person's backup, named after
// them ("noodlepads-plucky-walrus-2026-10-24.zip"; every name is a fun name).
export async function savePersonBackup(personId, name, button) {
  if (button) button.disabled = true;
  try {
    const lists = personBackupLists(storedLists(), personId);
    const blob = await makeBackup(lists, state.version);
    const slug = String(name).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person';
    downloadBlob(blob, `noodlepads-${slug}-${localDate()}.zip`);
    logEvent('backup', { saved: true, person: true, sounds: lists.clips.length, beats: lists.beats.length, bytes: blob.size });
    showNotice(`Saved a backup of ${name}: ${holdsWords(lists)}. The file is ${sizeWords(blob.size)}.`);
  } catch (err) {
    console.error('Backup failed:', err);
    logEvent('backup', { saved: false, person: true, error: err.message || err.name });
    showNotice(`The backup didn't save (${err.message || err.name}).`);
  } finally {
    if (button) button.disabled = false;
  }
}

// What incoming data is checked against (backup.js cleanBackup): who and
// what is on this device now.
export function whatIsHere() {
  return {
    peopleIds: new Set(state.manifest.people.map((p) => p.id)),
    clipIds: new Set(people({ includeHidden: true }).flatMap((p) => p.clips.map((c) => c.id))),
    kitIds: new Set((state.manifest.kit ?? []).map((k) => k.id)),
    addedPeopleIds: new Set([...state.peopleEdits.values()].filter((e) => e.added).map((e) => e.id)),
    takenNames: people({ includeHidden: true }).map((p) => p.name),
    takenColors: people({ includeHidden: true }).map((p) => p.color),
    takenPictures: people({ includeHidden: true }).map((p) => p.avatar),
    colorOk: (name) => Object.hasOwn(state.manifest.palette, colorName(name)),
  };
}

// The stores on this device as lists, the way a backup holds them.
const storedLists = () => ({
  people: [...state.peopleEdits.values()], clips: state.userClips, overrides: [...state.overrides.values()],
  orders: [...state.orders.values()], patterns: [...state.patterns.values()], beats: state.savedBeats,
  settings: [...state.settings].map(([key, value]) => ({ key, value })),
  decks: [...state.decks.values()], takes: state.takes, songs: [...state.songs.values()], songbook: state.songbook,
  prefs: [...state.prefs.values()],
  layouts: state.layouts, voices: state.myVoices, touchLayouts: state.touchLayouts,
});

// A sound's audio as bytes in this page's memory. Audio read from another
// database (older sounds found on this device) may be backed by that
// browser's storage, and some browsers won't store such a Blob again; a
// fresh copy of its bytes always stores. Reading it first also finds audio
// that can't be read before anything is saved.
export async function ownAudio(clip) {
  const bytes = await clip.blob.arrayBuffer();
  return { ...clip, blob: new Blob([bytes], { type: clip.mime || clip.blob.type }) };
}

// Merges cleaned data (a backup, or older sounds found) into this device
// (merge.js: nothing here is replaced or deleted, nothing doubled; an empty
// default "Me" goes once someone arrives) and redraws. Returns the merge,
// for its summary, plus `failed`: the labels of sounds (and the stores of
// other records) this browser wouldn't read or save. One record that fails
// never stops the rest: before, the first failure stopped the whole loop, and
// every record after it was never saved. People with a plain id (from an
// older copy: a kid's name) arrive with a random one, the same one this
// device already gave them, if it did (state.js reIdIncoming).
export async function storeLoaded(incoming) {
  const { data, pairs } = reIdIncoming(incoming);
  const failed = [];
  const clips = [];
  for (const c of data.clips) {
    try { clips.push(await ownAudio(c)); } catch (err) {
      console.error('A sound would not read:', c.id, err);
      failed.push(c.label);
    }
  }
  const merged = await mergeLoaded(storedLists(), { ...data, clips }, { kitIds: (state.manifest.kit ?? []).map((k) => k.id) });
  for (const [store, records] of Object.entries(merged.put)) {
    for (const r of records) {
      try {
        await db.put(store, r);
      } catch (err) {
        console.error(`Storing a ${store} record failed:`, err);
        failed.push(store === 'clips' ? r.label : `a ${store} record`);
        if (store === 'clips') merged.added.sounds--;
      }
    }
  }
  merged.failed = failed;
  for (const c of merged.put.clips) audio.forget(c.id);
  for (const o of merged.put.overrides) audio.forget(o.id);
  for (const id of merged.dropPeople) await deletePerson(id);
  await rememberRenames(pairs);
  await readStorage();
  notifyAllSettings();
  renderPeople();
  refreshPeople();
  return merged;
}

// What didn't come, in plain words (backup.js leftOutNote), plus what this
// browser wouldn't save, by name, so the kid knows to try again.
export function leftOut(data, merged) {
  const failed = merged?.failed ?? [];
  const names = failed.slice(0, 5).map((l) => `“${l}”`).join(', ') + (failed.length > 5 ? ` and ${failed.length - 5} more` : '');
  return leftOutNote(data) + (failed.length ? ` This browser wouldn't save ${names}: try again.` : '');
}

// What a backup would hold now, by kind, said before the tap: worked out each
// time Settings opens and after a backup loads (old-backup.js holdsWords,
// the same words the older-sounds section uses).
export function showHolds() {
  if (el.holds) el.holds.textContent = `A backup now holds ${holdsWords(storedLists())}.`;
}

async function loadBackup(file) {
  try {
    const data = await readBackup(file, whatIsHere());
    const merged = await storeLoaded(data);
    const made = data.exported ? new Date(data.exported) : null;
    const when = made && !Number.isNaN(made.getTime()) ? ` from ${localDate(made)}` : '';
    logEvent('backup', { loaded: true, sounds: merged.added.sounds, beats: merged.added.beats, already: merged.already, skipped: data.skipped });
    showNotice(`Loaded the backup${when}. ${mergeSummary(merged)}${leftOut(data, merged)}`);
    showHolds();
  } catch (err) {
    console.error('Loading a backup failed:', err);
    logEvent('backup', { loaded: false, error: err.message || err.name });
    showNotice(`That backup didn't load: ${err.message || err.name}.`);
  }
}

export function initBackups() {
  Object.assign(el, {
    save: document.querySelector('#backup-save'),
    file: document.querySelector('#backup-file'),
    holds: document.querySelector('#backup-holds'),
  });
  // Settings opens from ⚙️ and from the version in the footer.
  for (const id of ['#settings-open', '#version']) document.querySelector(id)?.addEventListener('click', showHolds);
  showHolds();
  el.save.addEventListener('click', saveBackup);
  el.file.addEventListener('change', () => {
    const file = el.file.files[0];
    el.file.value = '';
    if (file) loadBackup(file);
  });
}
