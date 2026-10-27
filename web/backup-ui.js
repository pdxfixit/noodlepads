// ⚙️ Settings → 💾 Save a backup / 📂 Load a backup. The zip format and its
// checks are in backup.js; this is the buttons around it.

import { state, readStorage, deletePerson, reIdIncoming, rememberRenames, storedLists as allStoredLists } from './state.js';
import { db } from './store.js';
import { audio } from './audio.js';
import { makeBackup, readBackup, heardWav, leftOutNote, personBackupLists, onePersonIn, intoPerson, namesPerson, withoutPeople } from './backup.js';
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
import { openDialog, setupDialog } from './dialogs.js';
import { avatarBadge, askEditPin } from './cloud-ui.js';
import { pinGuards } from './cloud.js';
import { personCounts, countsText } from './model.js';

const el = {};

// Everyone `data` holds anything of who has a PIN not typed on this visit is
// asked for it, one after another; anyone whose PIN isn't given is left out
// (Ben, 2026-10-24: nothing of a person is read or changed past their PIN).
// `hint` says why it is asked. Returns the data that may go on, and the
// names of who was left out.
async function pastPins(data, hint) {
  const left = [];
  let out = data;
  for (const p of people({ includeHidden: true })) {
    if (!pinGuards(p.id) || !namesPerson(out, p.id)) continue;
    const { ok } = await askEditPin(p.id, hint);
    if (!ok) { left.push(p.name); out = withoutPeople(out, [p.id]); }
  }
  return { data: out, left };
}
const leftOutWords = (left) => (left.length
  ? ` Left out ${left.join(', ')}: ${left.length === 1 ? 'their PIN wasn\'t' : 'their PINs weren\'t'} typed.` : '');

// A sound as it plays now (its voice, knobs, trim, edits and fade), for the
// backup's "as heard" copy (format 1.2): the player v2 has no voice engine, so
// it plays this. A sound that won't render goes without one; the original is
// in the backup either way.
async function heardOf(clip) {
  try { return heardWav(await audio.load(clip)); } catch { return null; }
}

async function saveBackup() {
  el.save.disabled = true;
  try {
    const { data: lists, left } = await pastPins(storedLists(), 'Type their PIN to put them in the backup.');
    const blob = await makeBackup(lists, state.version, { heardOf });
    downloadBlob(blob, `noodlepads-backup-${localDate()}.zip`);
    logEvent('backup', { saved: true, sounds: lists.clips.length, beats: lists.beats.length, bytes: blob.size });
    showNotice(`Saved a backup: ${holdsWords(lists)}. The file is ${sizeWords(blob.size)}.${leftOutWords(left)}`);
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
    const blob = await makeBackup(lists, state.version, { heardOf });
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
    // This device's settings, for the signature an unsigned beat coming in is stamped with (old-beats.js).
    settingsHere: { prefs: new Map([...state.prefs].map(([id, p]) => [id, p.values])), device: Object.fromEntries(state.settings) },
  };
}

// The stores on this device as lists, the way a backup holds them.
const storedLists = () => allStoredLists({ settings: true });

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

// A one-person backup asks where it goes (Ben, 2026-10-24): ♻️ Restore them
// as their own person, as any backup does, or load it all into someone on
// this device, who keeps their own name, look and settings. Resolves to a
// person id (theirs to restore), or null for ✕ (nothing loads).
let answerWhere = null;
function askWhere(who, data) {
  el.whoTitle.textContent = `Load ${who.name}'s backup`;
  el.whoCounts.textContent = countsText(personCounts(data, who.id));
  el.whoRestore.textContent = `♻️ Restore ${who.name}`;
  el.whoRestore.dataset.into = who.id;
  const others = people().filter((p) => p.id !== who.id);
  el.whoInto.hidden = others.length === 0;
  el.whoPeople.replaceChildren(...others.map((p) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cl-pick';
    b.dataset.into = p.id;
    b.setAttribute('aria-label', `Load it all into ${p.name}`);
    const name = document.createElement('span');
    name.textContent = p.name;
    b.append(avatarBadge(p), name);
    li.append(b);
    return li;
  }));
  return new Promise((resolve) => {
    answerWhere = resolve;
    openDialog(el.who, { focus: el.whoRestore });
  });
}

async function loadBackup(file) {
  try {
    let data = await readBackup(file, whatIsHere());
    const who = onePersonIn(data);
    let into = null;
    if (who) {
      const to = await askWhere(who, data);
      if (!to) return;
      if (to !== who.id) {
        into = people().find((p) => p.id === to);
        data = intoPerson(data, who.id, to);
      }
    }
    // Whoever it would add to who has a PIN: theirs, or their part stays out.
    const gate = await pastPins(data, into ? 'Type their PIN to load a backup into them.' : 'Type their PIN to load their backup.');
    if (who && (gate.left.includes(into?.name) || (!into && gate.left.length))) {
      showNotice(`Nothing loaded: ${(into ?? who).name}'s PIN wasn't typed.`);
      return;
    }
    data = gate.data;
    const merged = await storeLoaded(data);
    const made = data.exported ? new Date(data.exported) : null;
    const when = made && !Number.isNaN(made.getTime()) ? ` from ${localDate(made)}` : '';
    logEvent('backup', { loaded: true, into: !!into, sounds: merged.added.sounds, beats: merged.added.beats, already: merged.already, skipped: data.skipped });
    const what = into ? `Loaded ${who.name}'s backup${when} into ${into.name}.` : `Loaded the backup${when}.`;
    showNotice(`${what} ${mergeSummary(merged)}${leftOut(data, merged)}${leftOutWords(gate.left)}`);
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
    who: document.querySelector('#load-who'),
    whoTitle: document.querySelector('#load-who-title'),
    whoCounts: document.querySelector('#load-who-counts'),
    whoRestore: document.querySelector('#load-who-restore'),
    whoInto: document.querySelector('#load-who-into'),
    whoPeople: document.querySelector('#load-who-people'),
  });
  if (el.who) {
    setupDialog(el.who);
    let picked = null;
    el.who.addEventListener('click', (e) => {
      const b = e.target.closest?.('[data-into]');
      if (!b) return;
      picked = b.dataset.into;
      el.who.close();
    });
    // ✕, Esc or a pick: the load goes on with the pick, or stops with none.
    el.who.addEventListener('close', () => {
      const done = answerWhere;
      answerWhere = null;
      const to = picked;
      picked = null;
      done?.(to);
    });
  }
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
