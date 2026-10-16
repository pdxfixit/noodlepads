// The People dialog (the corner avatar → 👥 People) and each person's profile
// sheet. The list is short, one line per person: their picture, name, how
// much they have here (🔊 27 · 🥁 4, model.js countsText) and their ☁️ state;
// ➕ Add a person, ☁️ Open from the cloud, and Bring back for deleted
// boards.json people. Tapping a line opens their profile sheet: a new fun name
// (🎲 opens Pick a name, including the special names), a picture, a color,
// their ☁️ (cloud-ui.js), their PIN, and Delete (two taps).
//
// With a PIN on their cloud profile, changing the name, picture or color asks
// for it once per visit (cloud.js pinGuards; Ben, 2026-10-12). Without one,
// anyone can. It is a gate in this sheet only: a sync from another device
// changes them as before.

import { state, persist, setPersonEdit, deletePerson } from './state.js';
import { audio } from './audio.js';
import { people, person } from './board.js';
import { PERSON_COLORS, PERSON_COLOR_NAMES, nextPersonColor, freePicture, personCounts, countsText, countsWords, KIND_EMOJI } from './model.js';
import { newId } from './util.js';
import { funName, nameChoices, isFunName } from './names.js';
import { inCloud, dropLink, linkOf, pinGuards } from './cloud.js';
import { avatarBadge, openAvatar, openCloudSheet, cloudLabel, askEditPin, drawPin, pinClick } from './cloud-ui.js';
import { openDialog, setupDialog } from './dialogs.js';
import { announce } from './ui.js';
import { logEvent } from './log.js';
import { markNew, offerWelcome } from './welcome.js';

const el = {};
let showPerson = () => {};
let profileFor = null;   // the person whose profile sheet is open

// What each person has on this device, as lists the way a backup holds them.
// `voices` is ⭐ My voices (IndexedDB `voices`, state.myVoices).
const storedLists = () => ({
  clips: state.userClips, beats: state.savedBeats, songs: [...state.songs.values()],
  songbook: state.songbook, takes: state.takes, voices: state.myVoices,
});

const anyone = (id) => people({ includeHidden: true }).find((x) => x.id === id);

// The ☁️ state on a line: ☁️✓, ☁️, 📴 or ☁️⚠️, with 🔒 when they have a PIN.
function cloudBits(p) {
  const info = cloudLabel(p);
  if (!info) return null;
  const pin = linkOf(p.id)?.pin;
  return { text: `${info.text}${pin ? ' 🔒' : ''}`, words: `${info.label.replace(/^Cloud for [^:]*: /, '')}${pin ? ', with a PIN' : ''}` };
}

// Redraws the list. Redrawing replaces every line, so keyboard focus is put
// back on the same person's line.
export function renderPeopleEditor() {
  const active = document.activeElement;
  const inDialog = el.peopleEdit.contains(active) || el.peopleGoneList.contains(active);
  const spot = inDialog && active.closest('[data-person]')
    ? { id: active.closest('[data-person]').dataset.person }
    : null;

  const all = people({ includeHidden: true });
  const lists = storedLists();
  const shown = all.filter((p) => !p.hidden);
  el.peopleEdit.replaceChildren(...shown.map((p) => {
    const li = document.createElement('li');
    li.className = 'pe-row';
    li.dataset.person = p.id;
    li.style.setProperty('--c', p.color);

    // One button per person: the whole line opens their profile sheet.
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'pe-open';
    open.dataset.profile = p.id;
    const name = document.createElement('span');
    name.className = 'pe-name';
    name.textContent = p.name;
    // Under the name, how much of each kind they have here: "🔊 27 · 🥁 4".
    const counts = personCounts(lists, p.id);
    const tally = document.createElement('span');
    tally.className = 'pe-counts';
    tally.textContent = countsText(counts);
    tally.setAttribute('aria-label', `${p.name} has ${countsWords(counts)}`);
    const who = document.createElement('span');
    who.className = 'pe-who';
    who.append(name, tally);
    open.append(avatarBadge(p, 'pe-badge'), who);
    const cloud = cloudBits(p);
    if (cloud) {
      const c = document.createElement('span');
      c.className = 'pe-cloud';
      c.textContent = cloud.text;
      c.setAttribute('aria-hidden', 'true');
      open.append(c);
    }
    const go = document.createElement('span');
    go.className = 'pe-go';
    go.textContent = '›';
    go.setAttribute('aria-hidden', 'true');
    open.append(go);
    open.setAttribute('aria-label', `${p.name}: ${countsWords(counts)}${cloud ? `; ${cloud.words}` : ''}. Opens their profile.`);
    li.append(open);
    return li;
  }));

  // Deleted boards.json people, to bring back.
  const away = all.filter((p) => p.hidden);
  el.peopleGone.hidden = away.length === 0;
  el.peopleGoneList.replaceChildren(...away.map((p) => {
    const li = document.createElement('li');
    li.className = 'pe-gone-row';
    li.dataset.person = p.id;
    li.style.setProperty('--c', p.color);
    const label = document.createElement('span');
    label.textContent = p.name;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'quiet';
    back.dataset.restore = p.id;
    back.textContent = 'Bring back';
    back.setAttribute('aria-label', `Bring back ${p.name}`);
    li.append(label, back);
    return li;
  }));

  if (spot) {
    // A brought-back person's line is in the list again; a deleted one's is gone.
    const target = el.peopleEdit.querySelector(`[data-person="${CSS.escape(spot.id)}"] [data-profile]`) || el.personAdd;
    target.focus({ preventScroll: true });
  }
  renderProfile();
}

// After anyone changes: show the same person (or the first, if theirs went
// away) and redraw the list and any open profile sheet.
export function refreshPeople() {
  const still = person(state.personId);
  showPerson(still ? still.id : people()[0].id);
  renderPeopleEditor();
}

// The fun names everyone else has, so a new one never repeats theirs.
const namesBesides = (id) => people({ includeHidden: true }).filter((p) => p.id !== id).map((p) => p.name);

export async function addPerson() {
  const everyone = people({ includeHidden: true });
  const record = {
    id: newId('p'),
    name: funName(everyone.map((p) => p.name)),
    fun: true,
    // A picture of their own from the start, one nobody here has if possible.
    avatar: freePicture(everyone.map((p) => p.avatar)),
    color: nextPersonColor(everyone.map((p) => p.color)),
    added: true,
    created: Date.now(),
  };
  state.peopleEdits.set(record.id, record);
  await persist('people', record);
  logEvent('person', { added: record.id });
  markNew(record.id);
  showPerson(record.id);
  renderPeopleEditor();
  el.peopleEdit.querySelector(`[data-person="${CSS.escape(record.id)}"] [data-profile]`)?.focus();
  offerWelcome(record.id);   // 👋 Who's playing? (welcome.js, ADR 0028)
}

// ── a person's profile sheet ──

const profileNote = (text) => { el.profileNote.textContent = text; };

export function openProfileSheet(id) {
  profileFor = id;
  profileNote('');
  renderProfile(true);
  openDialog(el.profile, { returnTo: () => el.peopleEdit.querySelector(`[data-profile="${CSS.escape(id)}"]`) });
}

function renderProfile(fresh = false) {
  if (!profileFor || !el.profile) return;
  const p = anyone(profileFor);
  if (!p || p.hidden) {
    // Deleted, here or by a sync: nothing left to show.
    if (el.profile.open) el.profile.close();
    profileFor = null;
    return;
  }
  el.profile.style.setProperty('--c', p.color);
  el.profileAvatar.replaceChildren(avatarBadge(p));
  el.profileName.textContent = p.name;
  el.profileCounts.textContent = `On this device: ${countsText(personCounts(storedLists(), p.id))}`;
  el.profileFace.replaceChildren(avatarBadge(p, 'pf-face'));
  el.profilePicture.setAttribute('aria-label', `Picture for ${p.name}`);
  el.profileReroll.dataset.reroll = p.id;
  el.profileReroll.setAttribute('aria-label', `Pick a new fun name for ${p.name}`);
  el.profileColors.setAttribute('aria-label', `Color for ${p.name}`);
  for (const b of el.profileColors.children) {
    b.setAttribute('aria-pressed', String(b.dataset.color.toLowerCase() === p.color.toLowerCase()));
  }
  const cloud = cloudLabel(p);
  el.profileCloudText.textContent = cloud ? cloud.label.replace(/^Cloud for [^:]*: /, '').replace(/^./, (c) => c.toUpperCase()) + '.'
    : "Someone from the app's own list stays on this device.";
  el.profileCloud.hidden = !cloud;
  drawPin(p.id, fresh);

  // Everyone can be deleted, with what is theirs, except the last on show.
  const n = state.userClips.filter((c) => c.personId === p.id).length;
  const sounds = n ? ` and ${n} ${n === 1 ? 'sound' : 'sounds'}` : '';
  const del = el.profileDelete;
  if (fresh) del.classList.remove('armed');
  if (!del.classList.contains('armed')) {
    del.textContent = n ? `Delete (and ${KIND_EMOJI.sounds} ${n} ${n === 1 ? 'sound' : 'sounds'})` : 'Delete';
    del.setAttribute('aria-label', `Delete ${p.name}${sounds}`);
  }
  del.disabled = people().length === 1;
}

// Any other tap takes back a half-done Delete.
function disarmDelete() {
  if (!el.profileDelete.classList.contains('armed')) return;
  el.profileDelete.classList.remove('armed');
  renderProfile();
}

// The guard: asks for the PIN, true once it is right. Call it only when
// pinGuards(id), so a change nobody guards happens at once, in the same tap.
async function passGuard(id) {
  const { ok, note } = await askEditPin(id);
  if (note) profileNote(note);
  return ok;
}

// ── Pick a name: 🎲 ──
// A tap on 🎲, a hold (HOLD_MS), a right-click or Shift+Enter lists a dozen
// fresh fun names and the special names nobody has (names.js nameChoices).
// Tapping one is a fun name, so it syncs.
const HOLD_MS = 500;
let namesFor = null;   // the person the list is for
let holdTimer = null;
let held = false;      // a hold opened the list, so the tap that ends it opens nothing more

function drawNames() {
  const p = anyone(namesFor);
  if (!p) return;
  const choices = nameChoices([...namesBesides(namesFor), p.name]);
  el.namesList.replaceChildren(...choices.map((name) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cl-pick';
    b.dataset.pickName = name;
    b.textContent = name;
    li.append(b);
    return li;
  }));
}

// Pick a name for `id`, past the guard.
export async function openNames(id) {
  if (el.namesDialog.open) return;
  if (pinGuards(id) && !await passGuard(id)) return;
  namesFor = id;
  drawNames();
  openDialog(el.namesDialog, { focus: el.namesList.querySelector('button') });
}

async function pickName(name) {
  if (!namesFor || !isFunName(name)) return;
  await setPersonEdit(namesFor, { name, fun: true });
  el.namesDialog.close();
  refreshPeople();
  announce(`Now called ${name}.`);
}

const stopHold = () => { clearTimeout(holdTimer); holdTimer = null; };

async function onProfileClick(e) {
  const id = profileFor;
  const t = e.target.closest('button');
  if (!id || !t) return;
  if (t !== el.profileDelete) disarmDelete();
  const swatch = t.closest('[data-color]');
  if (swatch) {
    if (pinGuards(id) && !await passGuard(id)) return;
    await setPersonEdit(id, { color: swatch.dataset.color });
    refreshPeople();
    swatch.focus({ preventScroll: true });
    return;
  }
  // One tap opens Pick a name, so a kid can look, change their mind, or
  // close it with the name kept (Ben, 2026-10-12); 🎲 More names in it
  // deals another dozen.
  if (t === el.profileReroll) {
    if (held) { held = false; return; }   // a hold already opened it
    openNames(id);
    return;
  }
  if (t === el.profilePicture) {
    if (!pinGuards(id) || await passGuard(id)) openAvatar(id);
    return;
  }
  if (t === el.profileCloud) { openCloudSheet(id); return; }
  if (t !== el.profileDelete) { await pinClick(id, t, profileNote); return; }
  if (t.disabled) return;
  const p = anyone(id);
  if (!t.classList.contains('armed')) {
    t.classList.add('armed');
    t.textContent = 'Tap again to delete';
    t.setAttribute('aria-label', `Tap again to delete ${p.name}`);
    announce(`Tap again to delete ${p.name}.`);
    return;
  }
  // Deleting here never deletes the cloud's profile: this device just stops syncing it.
  if (inCloud(id)) await dropLink(id);
  const gone = await deletePerson(id);
  for (const clipId of gone) audio.forget(clipId);
  logEvent('person', { deleted: id, bundled: !p.added, sounds: gone.length });
  el.profile.close();
  refreshPeople();
  el.personAdd.focus({ preventScroll: true });
  announce(`${p.name} is deleted from this device.`);
}

export function initPeople(hooks) {
  showPerson = hooks.showPerson;
  Object.assign(el, {
    // 👥 People is the last line of the corner menu (pads.js), redrawn with it,
    // so the menu's box listens for it.
    peopleMenu: document.querySelector('#people'),
    peopleDialog: document.querySelector('#people-dialog'),
    peopleEdit: document.querySelector('#people-edit'),
    peopleGone: document.querySelector('#people-gone'),
    peopleGoneList: document.querySelector('#people-gone-list'),
    personAdd: document.querySelector('#person-add'),
    profile: document.querySelector('#profile-dialog'),
    profileAvatar: document.querySelector('#profile-avatar'),
    profileName: document.querySelector('#profile-name'),
    profileNote: document.querySelector('#profile-note'),
    profileCounts: document.querySelector('#profile-counts'),
    profilePicture: document.querySelector('#profile-picture'),
    profileFace: document.querySelector('#profile-face'),
    profileReroll: document.querySelector('#profile-reroll'),
    profileColors: document.querySelector('#profile-colors'),
    profileCloudText: document.querySelector('#profile-cloud-text'),
    profileCloud: document.querySelector('#profile-cloud'),
    profileDelete: document.querySelector('#profile-delete'),
    namesDialog: document.querySelector('#names-dialog'),
    namesList: document.querySelector('#names-list'),
    namesMore: document.querySelector('#names-more'),
  });
  setupDialog(el.peopleDialog);
  setupDialog(el.profile);
  setupDialog(el.namesDialog);
  el.profileColors.replaceChildren(...PERSON_COLORS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.color = c;
    b.style.setProperty('--sw', c);
    b.setAttribute('aria-label', PERSON_COLOR_NAMES[c] || c);
    b.setAttribute('aria-pressed', 'false');
    return b;
  }));
  el.profile.addEventListener('close', () => { profileFor = null; stopHold(); });
  el.namesList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick-name]');
    if (b) pickName(b.dataset.pickName);
  });
  el.namesMore.addEventListener('click', () => { drawNames(); el.namesList.querySelector('button')?.focus(); });

  const rerollOf = (e) => e.target.closest?.('[data-reroll]');
  el.profile.addEventListener('pointerdown', (e) => {
    held = false;
    stopHold();
    const r = rerollOf(e);
    if (!r || e.button !== 0) return;
    holdTimer = setTimeout(() => { holdTimer = null; held = true; openNames(r.dataset.reroll); }, HOLD_MS);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerout']) el.profile.addEventListener(type, stopHold);
  el.profile.addEventListener('contextmenu', (e) => {
    const r = rerollOf(e);
    if (!r) return;
    e.preventDefault();
    stopHold();
    openNames(r.dataset.reroll);
  });
  el.profile.addEventListener('keydown', (e) => {
    const r = rerollOf(e);
    if (!r || e.key !== 'Enter' || !e.shiftKey) return;
    e.preventDefault();
    openNames(r.dataset.reroll);
  });
  el.profile.addEventListener('click', onProfileClick);

  el.peopleMenu.addEventListener('click', (e) => {
    if (!e.target.closest('#people-open')) return;
    renderPeopleEditor();
    openDialog(el.peopleDialog);
  });
  el.personAdd.addEventListener('click', addPerson);
  el.peopleDialog.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-profile]');
    if (open) { openProfileSheet(open.dataset.profile); return; }
    const back = e.target.closest('[data-restore]');
    if (!back) return;
    await setPersonEdit(back.dataset.restore, { hidden: false });
    logEvent('person', { restored: back.dataset.restore });
    refreshPeople();
  });
}
