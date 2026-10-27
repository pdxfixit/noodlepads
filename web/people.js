// The People dialog (the corner avatar → 👥 People) and each person's profile
// sheet. The list is short, one line per person: their picture, name, how
// much they have here (🔊 27 · 🥁 4, model.js countsText) and their ☁️ state;
// ➕ Add a person, ☁️ Open from the cloud, and Bring back for deleted
// boards.json people. Tapping a line opens their profile sheet: a new fun name
// (🎲 opens Pick a name, including the special names), a picture, a color,
// their ☁️ (cloud-ui.js), their PIN, and Delete: two taps delete them from
// this device; for someone in the cloud a third deletes their cloud copy too.
//
// With a PIN on their cloud profile, the sheet opens only past it, once per
// visit, and their counts stay hidden until then (cloud.js pinGuards; Ben,
// 2026-10-24). Without one, anyone can. It is a gate on this device's
// screens: a sync from another device changes them as before.

import { state, persist, setPersonEdit, deletePerson } from './state.js';
import { audio } from './audio.js';
import { people, person } from './board.js';
import { PERSON_COLORS, PERSON_COLOR_NAMES, nextPersonColor, freePicture, personCounts, countsText, countsWords, KIND_EMOJI } from './model.js';
import { newId } from './util.js';
import { funName, nameChoices, isFunName } from './names.js';
import { inCloud, dropLink, restoreLink, forgetBases, linkOf, keyOf, pinGuards, onCloud, syncEnded } from './cloud.js';
import { avatarBadge, openAvatar, cloudLabel, askEditPin, drawPin, loadDevices, pinClick, disarmCloud, deleteLeftCloud } from './cloud-ui.js';
import { openDialog, setupDialog } from './dialogs.js';
import { announce, showNotice } from './ui.js';
import { logEvent } from './log.js';
import { markNew, offerWelcome } from './welcome.js';
import { whoNowOpen, openWhoNow } from './who-now.js';
import { openThings } from './things.js';

const el = {};
let showPerson = () => {};
let startOver = () => {};
let letGoOf = () => {};
let profileFor = null;   // the person whose profile sheet is open
// Someone Delete just took off this device whose cloud copy is still there:
// {id, name, avatar, color, key, pin}. Their sheet stays open for the cloud copy's Delete.
let left = null;

// What each person has on this device, as lists the way a backup holds them:
// what 👥 People counts and 🗂️ See all lists (model.js personThings).
// `voices` is ⭐ My voices (IndexedDB `voices`, state.myVoices).
export const storedLists = () => ({
  clips: state.userClips, beats: state.savedBeats, songs: [...state.songs.values()],
  songbook: state.songbook, takes: state.takes, voices: state.myVoices,
  overrides: [...state.overrides.values()], decks: [...state.decks.values()],
  layouts: state.layouts, touchLayouts: state.touchLayouts,
});

const anyone = (id) => people({ includeHidden: true }).find((x) => x.id === id);

// The ☁️ state on a line: ☁️✓ or ☁️⚠️ (nothing for someone only on this
// device), with 🔒 when they have a PIN.
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
    // Someone with a PIN not typed on this visit shows none of it: what a
    // person has is read only past their PIN (Ben, 2026-10-24).
    const hidden = pinGuards(p.id);
    const counts = hidden ? {} : personCounts(lists, p.id);
    const tally = document.createElement('span');
    tally.className = 'pe-counts';
    tally.textContent = hidden ? '🔒 PIN to see' : countsText(counts);
    tally.setAttribute('aria-label', hidden ? `${p.name}: their PIN shows what they have` : `${p.name} has ${countsWords(counts)}`);
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
    open.setAttribute('aria-label', `${p.name}: ${hidden ? 'PIN set' : countsWords(counts)}${cloud ? `; ${cloud.words}` : ''}. Opens their profile${hidden ? ' after their PIN' : ''}.`);
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

// After anyone changes: show the same person, and redraw the list and any
// open profile sheet. When theirs went away (deleted), the board starts over
// on 👋 Who's playing now? (app.js startOver; Ben, 2026-10-24). `note` says
// why there.
export function refreshPeople(note) {
  const still = person(state.personId);
  // Behind 👋 Who's playing now? nobody is showing: it is redrawn, and only a
  // pick shows someone (a PIN board must never show without its PIN).
  if (whoNowOpen()) {
    if (still) openWhoNow(note);
    else startOver(note);
  } else if (still) showPerson(still.id);
  else {
    // The chooser takes over; 👥 People isn't left behind it.
    if (el.peopleDialog?.open) el.peopleDialog.close();
    startOver(note);
  }
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

// Who is being deleted right now: id -> a promise of whether it went.
export const beingDeleted = new Map();

// Deletes a person and everything of theirs from this device: Delete in their
// profile sheet, and 🤷 I don't know the PIN (cloud-ui.js). It never deletes
// the cloud's profile: this device just stops syncing it. A sync of theirs
// still running ends first, or it would store them again (a tester,
// 2026-10-24: someone deleted was back after a reload). Returns false when
// this browser wouldn't delete them: they stay whole, in the cloud too.
export async function deleteHere(id) {
  // Being deleted until the delete is done or refused: a recording kept
  // meanwhile waits for the outcome (beingDeleted), so it is never saved for
  // nobody, nor lost when the browser refuses.
  let settle;
  beingDeleted.set(id, new Promise((r) => { settle = r; }));
  // What they are recording or playing stops now, KEPT as theirs (app.js):
  // its saves queue before the delete's one transaction, which takes them
  // with it, or keeps them all when it is refused.
  letGoOf(id);
  const p = anyone(id);
  const link = linkOf(id);
  let gone = null;
  try {
    if (link) await dropLink(id, { keepBases: true });
    await syncEnded(id);
    gone = await deletePerson(id);
  } finally {
    beingDeleted.delete(id);
    settle(!!gone);
  }
  if (!gone) {
    if (link) await restoreLink(link);
    return false;
  }
  if (link) await forgetBases(id);
  for (const clipId of gone) audio.forget(clipId);
  logEvent('person', { deleted: id, bundled: !p?.added, sounds: gone.length });
  return true;
}

// ── a person's profile sheet ──

// What 👋 Who's playing now? says when the one on show was just deleted.
const goneNote = (name) => `${name} is deleted from this device. Tap your picture.`;

const profileNote = (text) => { el.profileNote.textContent = text; };

// A profile opens only past its PIN, when one is set and not typed on this
// visit (Ben, 2026-10-24: everything that reads or changes a person). So
// 🗂️ See all, ⬇️ Export, Delete and the cloud tools are behind it too.
export async function openProfileSheet(id) {
  if (pinGuards(id)) {
    const { ok, note } = await askEditPin(id, 'Type their PIN to open their profile.');
    if (note) showNotice(note);   // the sheet isn't open to say it
    if (!ok) return;
    refreshPeople();   // their counts show now
  }
  profileFor = id;
  profileNote('');
  renderProfile(true);
  openDialog(el.profile, { returnTo: () => el.peopleEdit.querySelector(`[data-profile="${CSS.escape(id)}"]`) });
}

function renderProfile(fresh = false) {
  if (!profileFor || !el.profile) return;
  if (left?.id === profileFor) { drawLeft(); return; }
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
  // Someone in the cloud has the same here and there, so the line says only
  // what they have; 📴 says it is on this device alone (Ben, 2026-10-24).
  const counts = personCounts(storedLists(), p.id);
  const alone = !inCloud(p.id);
  el.profileCountsText.textContent = `${alone ? '📴 This device only: ' : ''}${countsText(counts)}`;
  el.profileCounts.setAttribute('aria-label', `See all: everything ${p.name} has${alone ? ', on this device only' : ''}: ${countsWords(counts)}`);
  el.profileFace.replaceChildren(avatarBadge(p, 'pf-face'));
  el.profilePicture.setAttribute('aria-label', `Picture for ${p.name}`);
  el.profileReroll.dataset.reroll = p.id;
  el.profileReroll.setAttribute('aria-label', `Pick a new fun name for ${p.name}`);
  el.profileColors.setAttribute('aria-label', `Color for ${p.name}`);
  for (const b of el.profileColors.children) {
    b.setAttribute('aria-pressed', String(b.dataset.color.toLowerCase() === p.color.toLowerCase()));
  }
  if (fresh) disarmCloud();
  drawPin(p.id);
  if (fresh) loadDevices(p.id, () => { if (profileFor === p.id) renderProfile(); });

  // Everyone can be deleted, with what is theirs, except the last on show.
  const n = state.userClips.filter((c) => c.personId === p.id).length;
  const sounds = n ? ` and ${n} ${n === 1 ? 'sound' : 'sounds'}` : '';
  const del = el.profileDelete;
  if (fresh) del.classList.remove('armed');
  if (!del.classList.contains('armed')) {
    del.textContent = n ? `🗑️ Delete (and ${KIND_EMOJI.sounds} ${n} ${n === 1 ? 'sound' : 'sounds'})` : '🗑️ Delete';
    del.setAttribute('aria-label', `Delete ${p.name}${sounds}`);
  }
  del.disabled = people().length === 1;
  el.profileParts.hidden = false;
  el.profileZone.classList.remove('left');
  el.profileKeep.hidden = true;
  el.profileDeleteHint.textContent = del.disabled
    ? `${p.name} is the only one here, so they can't be deleted. Close this and ➕ Add a person first.`
    : inCloud(p.id)
      ? 'Delete takes them, their recordings and their beats off this device. Then they can delete their cloud copy too.'
      : 'Delete takes them, their recordings and their beats off this device.';
}

// The sheet of someone just deleted here, cloud copy left: only the Delete box
// shows, its red button moved to the top for the cloud copy and ☁️ Keep where
// the first two landed. Keep and ✕ keep the cloud copy. The red button asks
// first, as every Delete does (Ben, 2026-10-26): `left.asked` once it has.
function drawLeft() {
  el.profile.style.setProperty('--c', left.color);
  el.profileAvatar.replaceChildren(avatarBadge(left));
  el.profileName.textContent = left.name;
  el.profileParts.hidden = true;
  const del = el.profileDelete;
  del.classList.toggle('armed', !!left.asked);
  del.disabled = false;
  del.textContent = left.asked ? '☁️ Tap again to delete their cloud copy' : '☁️ Delete their cloud copy too';
  del.setAttribute('aria-label', left.asked ? `Tap again to delete the cloud copy of ${left.name}` : `Delete the cloud copy of ${left.name} too`);
  el.profileZone.classList.add('left');
  el.profileKeep.hidden = false;
  el.profileDeleteHint.textContent = `${left.name} is deleted from this device. Their cloud copy is still there, for any other phone or tablet.${left.pin ? ' Deleting it asks for their PIN.' : ''}`;
}

// Any other tap takes back a half-done Delete. The cloud copy's waits until the
// sheet closes.
function disarmDelete() {
  clearTimeout(armTimer);
  armTimer = null;
  if (left?.id === profileFor || !el.profileDelete.classList.contains('armed')) return;
  el.profileDelete.classList.remove('armed');
  renderProfile();
}

// The cloud copy's Delete takes back its "Tap again", as Delete does.
function unaskCloud() {
  armTimer = null;
  if (!left?.asked) return;
  left.asked = false;
  drawLeft();
}

// The guard: asks for the PIN, true once it is right. Call it only when
// pinGuards(id), so a change nobody guards happens at once, in the same tap.
async function passGuard(id) {
  const { ok, note } = await askEditPin(id);
  if (note) profileNote(note);
  return ok;
}

// A change to someone's name, picture or color: past their PIN guard, saved
// (state.js setPersonEdit, so it syncs), then everyone redrawn. The profile
// sheet and the welcome's Pick your stage name (welcome.js) both change a
// person's looks through here and openPictures. False when the guard said no.
export async function editLook(id, changes) {
  if (pinGuards(id) && !await passGuard(id)) return false;
  await setPersonEdit(id, changes);
  refreshPeople();
  return true;
}

// The full picture chooser for `id` (cloud-ui.js), past the guard.
export async function openPictures(id) {
  if (!pinGuards(id) || await passGuard(id)) openAvatar(id);
}

// ── Pick a name: 🎲 ──
// A tap on 🎲, a hold (HOLD_MS), a right-click or Shift+Enter lists a dozen
// fresh fun names and the special names nobody has (names.js nameChoices).
// Tapping one is a fun name, so it syncs.
const HOLD_MS = 500;
let namesFor = null;   // the person the list is for
let holdTimer = null;
let held = false;      // a hold opened the list, so the tap that ends it opens nothing more
const SLIP_MS = 500;   // a Delete tap this soon after the last is a double tap
const ARM_MS = 4000;   // how long Delete's "Tap again" waits before it takes itself back
let armedAt = -Infinity;   // when Delete last asked (the click's timeStamp)
let armTimer = null;

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
  // The whole ☁️ In the cloud row turns the switch, not only the switch itself.
  const t = e.target.closest('button') ?? (e.target.closest('.pf-row-switch') ? document.getElementById('profile-cloud') : null);
  if (!id || !t) return;
  if (t === el.profileKeep) { el.profile.close(); return; }   // ✕ does the same
  if (t !== el.profileDelete) disarmDelete();
  if (t.id !== 'profile-cloud' && t.id !== 'cloud-pin-off') disarmCloud(id);
  if (t === el.profileCounts) { openThings(id, { opener: t }); return; }
  const swatch = t.closest('[data-color]');
  if (swatch) {
    if (await editLook(id, { color: swatch.dataset.color })) swatch.focus({ preventScroll: true });
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
    openPictures(id);
    return;
  }
  if (t !== el.profileDelete) { await pinClick(id, t); return; }
  if (t.disabled) return;
  // A double tap is one slip, not a yes: the tap that deletes must come on
  // its own, a moment after the one that asked.
  if (t.classList.contains('armed') && e.timeStamp - armedAt < SLIP_MS) {
    announce('Tap once more to delete.');
    return;
  }
  armedAt = e.timeStamp;
  if (left?.id === id) {
    clearTimeout(armTimer);
    if (!left.asked) {
      left.asked = true;
      drawLeft();
      announce(`Tap again to delete the cloud copy of ${left.name}.`);
      armTimer = setTimeout(unaskCloud, ARM_MS);
      return;
    }
    await deleteCloudToo();
    return;
  }
  const p = anyone(id);
  if (!t.classList.contains('armed')) {
    t.classList.add('armed');
    t.textContent = 'Tap again to delete';
    t.setAttribute('aria-label', `Tap again to delete ${p.name}`);
    announce(`Tap again to delete ${p.name}.`);
    // Left red, it would wait for any stray tap later: it takes itself back.
    armTimer = setTimeout(disarmDelete, ARM_MS);
    return;
  }
  // In the cloud: the sheet stays for the cloud copy's Delete, so keep what deleting
  // the cloud copy needs. A profile with a PIN keeps no key; it is asked.
  if (inCloud(id)) {
    const pin = !!linkOf(id)?.pin;
    left = { id, name: p.name, avatar: p.avatar, color: p.color, pin, key: pin ? null : keyOf(id) };
  }
  if (!await deleteHere(id)) {
    left = null;   // nothing went: the notice says so
    return;
  }
  if (left?.id === id) {
    // Nobody else shows while the sheet waits for the cloud copy's Delete: a PIN pad
    // for the next person would cover it (Ben, 2026-10-24). The sheet's
    // closing brings them on.
    renderPeopleEditor();
    // Focus goes to Keep, where the taps were: a third Enter keeps it too.
    el.profileKeep.focus({ preventScroll: true });
    announce(`${p.name} is deleted from this device. Keep their cloud copy, or delete it too.`);
    return;
  }
  el.profile.close();
  refreshPeople(goneNote(p.name));
  el.personAdd.focus({ preventScroll: true });
  announce(`${p.name} is deleted from this device.`);
}

// The cloud copy's Delete, asked and tapped again: the cloud copy goes too,
// past their PIN if they have one.
async function deleteCloudToo() {
  const gone = left;
  profileNote('');
  const { ok, note } = await deleteLeftCloud(gone);
  if (note) profileNote(note);
  if (!ok) {
    // The PIN pad closed or the cloud said no: it asks again next time.
    if (left === gone) unaskCloud();
    return;
  }
  el.profile.close();
  el.personAdd.focus({ preventScroll: true });
  announce(`${gone.name} is deleted from the cloud too.`);
}

export function initPeople(hooks) {
  showPerson = hooks.showPerson;
  startOver = hooks.startOver ?? startOver;
  letGoOf = hooks.letGoOf ?? letGoOf;
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
    profileCountsText: document.querySelector('#profile-counts-text'),
    profilePicture: document.querySelector('#profile-picture'),
    profileFace: document.querySelector('#profile-face'),
    profileReroll: document.querySelector('#profile-reroll'),
    profileColors: document.querySelector('#profile-colors'),
    profileDelete: document.querySelector('#profile-delete'),
    profileDeleteHint: document.querySelector('#profile-delete-hint'),
    profileZone: document.querySelector('.pf-zone'),
    profileKeep: document.querySelector('#profile-keep'),
    profileParts: document.querySelector('#profile-parts'),
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
  el.profile.addEventListener('close', () => {
    const waited = left;
    profileFor = null;
    left = null;
    stopHold();
    disarmDelete();
    // Deleted while on show, the sheet open for the cloud copy's Delete: someone else
    // comes on now.
    if (waited && !person(state.personId)) refreshPeople(goneNote(waited.name));
  });
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
  // A sync, a PIN found new, a link dropped: the open list's ☁️ (and so its
  // ⚠️) and the open sheet's ☁️ and 🔒 follow.
  onCloud(() => {
    if (el.peopleDialog.open) renderPeopleEditor();
    else if (profileFor) renderProfile();
  });

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
