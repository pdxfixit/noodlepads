// The cloud's screens: the PIN pad (with 🤷 I don't know the PIN for a PIN new
// to this device), the avatar picker, the PIN part of a person's profile
// sheet (change, remove = leave; the guard on their name, picture and color),
// a person's ☁️ Cloud switch with 🔄 Sync now and 🔗 Share (🚫 Unshare), ☁️ Open from the cloud, 🔗 Shared
// with me (▶ Play, 🎛️ Remix, ✕ Remove). The work is in cloud.js.

import { state, setPersonEdit, storedLists } from './state.js';
import { person, people } from './board.js';
import { PICTURES, KIND_EMOJI, personCounts, countsText, countsWords } from './model.js';

// A share's kind ("sound", "beat", "song") as its emoji (model.js KIND_EMOJI).
const shareEmoji = (kind) => KIND_EMOJI[`${kind}s`] ?? KIND_EMOJI.shares;
import { emojiMore, withCurrent } from './emoji-more.js';
import { openDialog, setupDialog } from './dialogs.js';
import { announce } from './ui.js';
import { audio } from './audio.js';
import { count } from './util.js';
import { applyChain } from './voices.js';
import { PIN_RESET_EMAIL } from './contact.js';
import {
  api, CloudError, cloudTrouble, cloudThere, inCloud, linkOf, keyOf, statusOf, syncNow,
  openProfile, unlock, pinIsNew, checkPin, setPin, goUp, leaveCloud, removeProfile, shareable, shareItem, showCode,
  sharedHere, openShare, forgetShare, remixShare, fetchShare, checkShared, mySharesOf, unshareItem, listProfiles,
  unsyncedCount, unsyncedText, rememberHere, declineRemember, offersRemember, forgetHere, deviceCount, forgetAllDevices, isRemembered, keyWasDropped, FORGOT_HERE, bringDown, leaveInCloud,
} from './cloud.js';
import { newProgress, progressShare } from './cloud-sync.js';
import { askSum } from './grown-up.js';
import { SETTINGS } from './settings.js';
import { obviousPin, PIN_OBVIOUS } from './codes.js';
import { mergeSummary } from './merge.js';

// Where a forgotten PIN goes: Ben resets it by hand (`just cloud-reset-pin`). The address is built in web/contact.js.
export const FORGOT_PIN = `Forgot your PIN? A grown-up can email ${PIN_RESET_EMAIL} with your fun name.`;

const el = {};
let refresh = () => {};    // redraws People and the corner, after a person changes
let addPerson = () => {};  // 👋 Someone new, from a PIN pad that guards a locked board
let dropPerson = async () => {};  // 🤷 I don't know the PIN: deletes them from this device (app.js)
let backup = async () => {};      // ⬇️ Back up: one person's backup file (backup-ui.js savePersonBackup)
let play = () => {};              // 🎉 Play as them: closes the sheets and shows that person on Pads (app.js)

const $ = (s) => document.querySelector(s);
function make(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(className, text, data = {}) {
  const b = make('button', className, text);
  b.type = 'button';
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  return b;
}
// A first tap turns it red and asks; the second does it.
function armed(b, question) {
  if (b.classList.contains('armed')) return true;
  b.dataset.was = b.textContent;
  b.classList.add('armed');
  b.textContent = question;
  announce(question);
  return false;
}
function disarm(b) {
  if (!b.classList.contains('armed')) return;
  b.classList.remove('armed');
  b.textContent = b.dataset.was;
}
// A CloudError may carry its own sentence (`say`, cloud.js unlock).
const trouble = (err) => err?.say ?? (err instanceof CloudError ? cloudTrouble(err) : String(err?.message || err));

// The round picture: the avatar, else the name's first letter, on the color.
export function avatarBadge(p, className = 'cl-badge') {
  const b = make('span', className, p.avatar || ([...(p.name || '?').trim()][0] || '?').toUpperCase());
  b.style.setProperty('--c', p.color);
  b.setAttribute('aria-hidden', 'true');
  return b;
}

// ── the PIN pad ──

let pinDone = null;
let pinDigits = '';

function drawDots() {
  [...el.pinDots.children].forEach((d, i) => d.classList.toggle('on', i < pinDigits.length));
  el.pinDots.setAttribute('aria-label', `${pinDigits.length} of 4 digits`);
}

function pinKey(k) {
  if (el.pin.classList.contains('pin-waiting')) return;   // the wait screen has no keys
  if (k === '⌫') pinDigits = pinDigits.slice(0, -1);
  else if (/^\d$/.test(k) && pinDigits.length < 4) pinDigits += k;
  drawDots();
  if (pinDigits.length === 4) {
    const done = pinDone;
    const digits = pinDigits;
    pinDone = null;
    el.pin.close();
    done?.(digits);
  }
}

// Asks for four digits. Resolves with them, null when closed, 'new' for
// 👋 Someone new, or 'unknown' for 🤷 I don't know the PIN (two taps), which
// `unknown` shows. `forgot` shows the line on what to do about a forgotten PIN.
// `shown`: a line in a box of its own over the dots (what putting someone in
// the cloud makes public), none when empty.
// `unsynced`: how many changes made here the cloud doesn't have yet, said on
// 🤷's second tap, since deleting them from this device loses those.
let pinUnsynced = 0;
export function askPin({ title = 'PIN', hint = '', note = '', shown = '', forgot = false, someoneNew = false, unknown = false, unsynced = 0 } = {}) {
  pinUnsynced = unsynced;
  pinDigits = '';
  drawDots();
  el.pinTitle.textContent = title;
  el.pinHint.textContent = hint;
  el.pinPublic.textContent = shown;
  el.pinPublic.hidden = !shown;
  el.pinNote.textContent = note;
  // A note is trouble (a wrong PIN, two that didn't match): red, and the dots
  // shake once, so the pad says no out loud (a tester, 2026-10-19).
  el.pin.classList.remove('pin-wrong', 'pin-waiting');
  el.pinBack.hidden = true;
  void el.pin.offsetWidth;   // restarts the shake when it says no again
  el.pin.classList.toggle('pin-wrong', !!note);
  el.pinForgot.hidden = !forgot;
  el.pinNew.hidden = !someoneNew;
  el.pinUnknown.hidden = !unknown;
  disarm(el.pinUnknown);
  return new Promise((resolve) => {
    pinDone = resolve;
    openDialog(el.pin, { focus: el.pinKeys.querySelector('[data-key="1"]') });
  });
}

// The 10-minute wait, said on the pad itself (council, 2026-10-27): who knows
// the PIN, when the pad opens again, and one obvious way out. No dots or keys.
// Resolves 'back' (⬅️ Back to Pads), 'new' (👋 Someone new, when `locked`: the
// pad cannot be left) or null (closed).
export function askWait({ title, wait, locked }) {
  // The waits double up to a day (worker/pin.js): one that ends on another day names it.
  const end = new Date(Date.now() + wait * 1000);
  const time = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const opens = end.toDateString() === new Date(Date.now()).toDateString() ? `at ${time}` : `${end.toLocaleDateString([], { weekday: 'long' })} at ${time}`;
  pinDigits = '';
  drawDots();
  el.pinTitle.textContent = title;
  el.pinHint.textContent = 'That was too many tries. A grown-up knows the PIN: ask them.';
  el.pinPublic.hidden = true;
  el.pinNote.textContent = `The PIN pad opens again ${opens}.`;
  el.pin.classList.remove('pin-wrong');
  el.pin.classList.add('pin-waiting');
  el.pinForgot.hidden = false;
  el.pinNew.hidden = !locked;
  el.pinUnknown.hidden = true;
  el.pinBack.hidden = locked;
  return new Promise((resolve) => {
    pinDone = resolve;
    openDialog(el.pin, { focus: locked ? el.pinNew : el.pinBack });
  });
}

// Tries `act(pin)` until it works, asking again on a wrong PIN; null when the
// kid gives up, {unknown: true} after 🤷 I don't know the PIN.
async function withPin(act, { title, hint, forgot = true, locked = false, unknown = false, unsynced = 0 }) {
  let note = '';
  for (;;) {
    const pin = await askPin({ title, hint, note, forgot, someoneNew: locked, unknown, unsynced });
    if (pin === 'new') { addPerson(); return null; }
    if (pin === 'unknown') return { unknown: true };
    if (pin === null) {
      if (!locked) return null;
      note = 'Everyone on this device has a PIN. Type yours, or tap 👋 Someone new.';
      continue;
    }
    try {
      return { result: await act(pin) };
    } catch (err) {
      if (err instanceof CloudError && err.status === 401 && err.error === 'pin') { note = cloudTrouble(err); continue; }
      if (err instanceof CloudError && err.status === 429 && err.error === 'wait') {
        const went = await askWait({ title, wait: err.wait, locked });
        if (went === 'new') { addPerson(); return null; }
        if (locked) { note = ''; continue; }
        return null;
      }
      if (err instanceof CloudError && err.status === 0 && locked) { note = "That isn't this device's PIN for them."; continue; }
      throw err;
    }
  }
}

// Opening a person with a PIN (app.js setPerson), asked on every visit.
// Resolves true once the right PIN is typed. `locked`: nobody else can show
// meanwhile, so the pad stays until a PIN or 👋 Someone new. A PIN new to
// this device (set or changed elsewhere since) also offers 🤷 I don't know
// the PIN, which deletes them from this device (Ben, 2026-10-19). One ask
// per person at a time: a sync that finds a new PIN asks again (app.js).
const asking = new Map();   // person id -> the ask's promise
export function askToOpen(personId, opts) {
  if (!asking.has(personId)) asking.set(personId, askOnce(personId, opts).finally(() => asking.delete(personId)));
  return asking.get(personId);
}
async function askOnce(personId, { locked = false } = {}) {
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  const fresh = pinIsNew(personId);
  // A device that remembered them, whose key the cloud refused, says so first
  // (Ben, 2026-10-27): a kid who played yesterday knows why the pad is back.
  const why = keyWasDropped(personId) ? `${FORGOT_HERE} ` : 'They have a new PIN. Type it to open them here. ';
  // Changes made here that the cloud hasn't got: deleting them here loses those.
  const lost = fresh ? unsyncedCount(personId) : 0;
  try {
    const opened = await withPin(async (pin) => { await unlock(personId, pin); return pin; }, {
      title: `${p?.avatar ? `${p.avatar} ` : ''}${p?.name ?? 'PIN'}`,
      hint: fresh
        ? `${why}Don't know it? Their things on this device are deleted; the cloud keeps what it has${lost ? `, but ${unsyncedText(lost)}` : ''}.`
        : 'Type their PIN to open them.',
      locked,
      unknown: fresh,
      unsynced: lost,
    });
    if (opened?.unknown) {
      await dropPerson(personId);
      return false;
    }
    // They show at once; the offer opens over them.
    if (opened) offerRemember(personId, opened.result);
    return !!opened;
  } catch (err) {
    announce(trouble(err));
    return false;
  }
}

// 🔑 Remember them here? Offered once a PIN opens someone (Ben, 2026-10-26):
// this device then skips their PIN until Forget this device, a PIN change, or
// the cloud drops its key unused (Ben, 2026-10-27); sharing still asks it.
// Not now, ✕ or Esc stops the offer on this device; their profile's PIN part
// keeps the choice. Not now has the focus, as big as Remember: a kid tapping
// on through gets the safe one. Exported for `just look remember`.
let rememberDone = null;
export const REMEMBER_SUB = 'Anyone using this device can open them. This device skips the PIN until someone taps Forget this device. Sharing still asks it.';
export async function offerRemember(personId, pin) {
  if (!offersRemember(personId)) return;
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  el.rememberTitle.textContent = `🔑 Remember ${p ? nameOf(p) : 'them'} here?`;
  el.rememberSub.textContent = REMEMBER_SUB;
  const yes = await new Promise((resolve) => {
    rememberDone = resolve;
    openDialog(el.remember, { focus: el.rememberNo });
  });
  if (!yes) { await declineRemember(personId); return; }
  try {
    await rememberHere(personId, pin);
    announce('🔑 Remembered on this device, until someone taps Forget this device.');
  } catch (err) {
    announce(trouble(err));
  }
  refresh();
}

// The PIN guard (people.js, backup-ui.js): their PIN, asked before their
// profile opens, a change to their name, picture or color, or a backup that
// reads or changes them; `hint` says which. A wrong PIN says so and asks again; five wrong
// tries mean the Worker's 10-minute wait. Resolves {ok: true}, {ok: false}
// when the kid gives up, or {ok: false, note} when it can't be checked.
export async function askEditPin(personId, hint = 'Type their PIN to change their name, picture or color.') {
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  try {
    const done = await withPin((pin) => checkPin(personId, pin), {
      title: `${p?.avatar ? `${p.avatar} ` : ''}${p?.name ?? 'PIN'}`,
      hint,
    });
    return { ok: !!done };
  } catch (err) {
    const note = trouble(err);
    announce(note);
    return { ok: false, note };
  }
}

// ☁️ Delete their cloud copy too, tapped twice, in a profile sheet (people.js): deletes the cloud copy of
// someone just deleted from this device. `left` is what the sheet kept of
// them: their id, the key this device held (none with a PIN) and whether they
// have a PIN, which is asked. `ok` once it is gone; `note` says what went wrong.
export async function deleteLeftCloud(left) {
  const go = (pin) => removeProfile(left.id, left.key, pin);
  try {
    if (!left.pin) { await go(); return { ok: true }; }
    const done = await withPin(go, { title: '☁️ Delete the cloud copy', hint: 'Type their PIN. Their cloud copy is deleted for every device.' });
    return { ok: !!done };
  } catch (err) {
    const note = trouble(err);
    announce(note);
    return { ok: false, note };
  }
}

// ── the avatar picker ──

let avatarFor = null;
let avatarAll = null;   // the "…" full list (emoji-more.js)
const avatarOf = () => (person(avatarFor) ?? people({ includeHidden: true }).find((x) => x.id === avatarFor))?.avatar;
// The short list, the picture in use if it came from "…", then "…".
function renderAvatars() {
  const now = avatarOf();
  el.avatarGrid.replaceChildren(...withCurrent(PICTURES, now).map((p) => {
    const b = button('', p, { avatar: p });
    b.setAttribute('aria-label', `Picture ${p}`);
    b.setAttribute('aria-pressed', String(p === now));
    return b;
  }), avatarAll.button);
}
export function openAvatar(personId) {
  avatarFor = personId;
  avatarAll.reset();
  renderAvatars();
  openDialog(el.avatar, { focus: el.avatarGrid.querySelector('[aria-pressed="true"]') ?? el.avatarGrid.children[0] });
}
async function chooseAvatar(avatar) {
  if (!avatarFor) return;
  await setPersonEdit(avatarFor, { avatar });
  el.avatar.close();
  refresh();
}

// ── a person's ☁️ Cloud and 🔒 PIN, in their profile sheet ──
// ☁️ In the cloud is a switch, the whole row its target
// (docs/design/cloud-needs-pin.md). Nobody goes to the cloud by themselves.
// On asks the grown-up sum, a new PIN typed twice (the first pad says what
// becomes public) and puts them there, then offers 🔑 Remember them here?.
// Off (and Remove PIN, the same thing, with the same words) asks first, then
// the PIN; their latest is brought here and their cloud copy and shared links are
// deleted, and this device keeps everything (cloud.js leaveCloud). Under the
// switch, 🔄 Sync now and 🔗 Share… (in the cloud) and ⬇️ Back up (always).
// The PIN part shows only in the cloud: its pill says a PIN is on, with
// Change PIN and Remove PIN. What a PIN button just did shows in the pill for
// a while, then the pill fades back to saying what is on (Ben: "PIN set
// appears where PIN on is").

export const PIN_FLASH_MS = 3000;
let flash = null;   // {id, text, until}: what the pill says just after a change

const nameOf = (p) => p?.name ?? 'them';
// Where the PIN part (and Help) explain 🔑 Remember: what to do about a lost phone.
export const LOST_DEVICE = 'Lost this device? Change the PIN, and every device asks it again.';

// A cloud state someone has to see to: ☁️⚠️ on their line in 👥 People
// (cloudLabel), and the same ⚠️ before what is wrong in their profile sheet.
const warns = (s) => s?.state === 'trouble' || s?.state === 'locked';

// What the switch's line says about someone only on this device.
export const ONLY_HERE = 'Only on this device. A grown-up can put them in the cloud with a PIN, to open them on any phone or tablet.';
// What putting someone in the cloud makes public: on the first PIN pad, and
// the same as the privacy statement (web/privacy.js), voices included.
export const PIN_PUBLIC = 'Their sounds, beats and recorded voices are stored on noodlepads.com. Anyone can see their fun name and picture, and play a sound of theirs if they have its link.';
export const PICK_PIN_HINT = 'A grown-up picks this PIN. Four numbers, asked each time they are opened, on every device.';
// Leaving the cloud: Remove PIN's red button asks this, with the note under it.
export const LEAVE_ASK = 'Leave the cloud?';
export const LEAVE_NOTE = 'Tap again, then type the PIN: their cloud copy is deleted for every device, and links you shared stop working. This device keeps everything.';
export const IN_THE_WAY = 'Something in the cloud is in the way. Nothing was sent.';

// What the Cloud part says about a person.
function cloudText(p) {
  if (!inCloud(p.id)) {
    // Taken out on another device, said where they are: the switch's line.
    const s = statusOf(p.id);
    return s?.state === 'trouble' ? `⚠️ ${s.text}` : ONLY_HERE;
  }
  const s = statusOf(p.id);
  if (warns(s)) return `⚠️ ${s.text.replace(/^🔒 /, '')}`;
  if (s?.text) return s.text;
  if (!keyOf(p.id)) return '🔒 Syncs once they are opened with their PIN.';
  return 'In the cloud ✓ Opens on any phone or tablet, with their PIN.';
}

// How many devices remember the person whose sheet is open: {id, n}, from the
// cloud (loadDevices), or null when unknown.
let devices = null;

// Asked once when a profile sheet opens: the count behind 🔑 Forget all N
// devices. Offline or on an error there is no count and the sheet offers only
// Forget this device. `redraw` runs when the count arrives and the sheet still
// shows them.
export async function loadDevices(personId, redraw = () => {}) {
  if (devices?.id !== personId) devices = null;
  const n = await deviceCount(personId);
  const was = devices?.n ?? null;
  devices = n ? { id: personId, n } : null;
  if ((n ?? null) !== was) redraw();
}

// Draws the Cloud and PIN parts for `personId`.
export function drawPin(personId) {
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  if (!p) return;
  const link = linkOf(personId);
  const linked = inCloud(personId);
  el.cloudSwitch.hidden = !p.added;
  el.cloudSwitch.setAttribute('aria-checked', String(p.added && linked));
  if (!el.cloudSwitch.classList.contains('armed')) {
    el.cloudText.textContent = p.added ? cloudText(p) : "Someone from the app's own list stays on this device.";
  }
  // ⬇️ Back up needs no cloud: it shows for everyone (Ben, 2026-10-24).
  el.cloudTools.hidden = false;
  el.syncBtn.hidden = !linked;
  el.shareBtn.hidden = !linked;
  el.backupBtn.setAttribute('aria-label', `Back up ${nameOf(p)}: one file of everything of theirs`);

  // A PIN now means the cloud, so there is nothing to set on its own: the
  // PIN part shows once they are in the cloud.
  el.pinPart.hidden = !p.added || !linked;
  const hasPin = !!link?.pin;
  const kept = hasPin && !pinIsNew(personId) && isRemembered(personId);
  const now = flash && flash.id === personId && flash.until > Date.now() ? flash : null;
  el.pinState.textContent = now ? now.text : hasPin ? '🔒 PIN on' : '🔓 No PIN';
  el.pinState.classList.toggle('on', hasPin);
  el.pinState.classList.toggle('flash', !!now);
  el.pinTools.hidden = !linked;
  el.pinRemember.hidden = !p.added || !hasPin || pinIsNew(personId);
  el.pinRemember.textContent = kept ? 'Forget this device' : '🔑 Remember on this device';
  // 🔑 Forget all N devices: N is the cloud's count, asked when the sheet
  // opens (loadDevices); it shows only when this device remembers them and
  // the count is more than this device.
  const n = kept && devices?.id === personId ? devices.n : 1;
  el.pinForgetAll.hidden = n < 2;
  el.pinForgetAll.textContent = `🔑 Forget all ${n} devices`;
  el.pinForgetAll.setAttribute('aria-label', `Forget all ${n} devices that remember ${nameOf(p)}, this one too. A grown-up types the PIN.`);
  const asked = hasPin
    ? (pinIsNew(personId)
      ? (keyWasDropped(personId) ? `This device forgot ${nameOf(p)}. Open them and type the PIN.` : `They got a new PIN on another device. Open ${nameOf(p)} and type it.`)
      : kept
        ? `This device opens ${nameOf(p)} without it until someone taps Forget this device. Sharing still asks it. Anyone using this device can open them. ${LOST_DEVICE}`
        : `Asked every time ${nameOf(p)} is opened, on every device, and before the name, picture or color changes.`)
    : `Anyone on any device can open ${nameOf(p)}.`;
  el.pinPartHint.textContent = `${asked} Removing it takes ${nameOf(p)} out of the cloud.`;
}

// The pill says `text` for PIN_FLASH_MS, then fades back to the PIN's state.
// A later change flashes its own, so only the latest flash ends itself: by
// which flash it is, not the clock, since a timer can fire a millisecond
// before Date.now() reaches `until`, and the pill then said ✅ for good.
function flashPin(personId, text) {
  const mine = { id: personId, text, until: Date.now() + PIN_FLASH_MS };
  flash = mine;
  setTimeout(() => {
    if (flash !== mine) return;
    flash = null;
    el.pinState.classList.add('settle');
    refresh();
    setTimeout(() => el.pinState.classList.remove('settle'), 600);
  }, PIN_FLASH_MS);
}

// This visit's key for a person whose PIN this device hasn't had typed yet:
// asks for it (a wrong one asks again). True once there is one.
async function haveKey(personId, why) {
  if (keyOf(personId)) return true;
  const got = await withPin((pin) => unlock(personId, pin), { title: 'Their PIN', hint: why });
  return !!got && !got.unknown && !!keyOf(personId);
}

// 🔗 Share always asks the PIN of someone with one (Ben, 2026-10-27), even
// on a device that remembers them: 🔑 Remember covers opening, playing and
// syncing; a code anyone can play does not. One ask for each code made (a
// bulk Share of several sounds is one code), on its own pad. True to go on;
// false after ✕ (nothing is shared). A wrong PIN says so and asks again.
// `shareAsked`: 🔗 Share… just asked the PIN to get a key, which counts for
// the first code made before its sheet closes, so a kid types it once.
export const SHARE_PIN_HINT = 'Type their PIN to share. Anyone with the code can play it.';
let shareAsked = null;
async function askToShare(personId) {
  if (!linkOf(personId)?.pin) return true;
  if (shareAsked === personId) { shareAsked = null; return true; }
  shareAsked = null;
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  const got = await withPin((pin) => checkPin(personId, pin), {
    title: `${p?.avatar ? `${p.avatar} ` : ''}${p ? nameOf(p) : 'PIN'}`,
    hint: SHARE_PIN_HINT,
  });
  return !!got && !got.unknown;
}

// A new PIN, typed twice. A second that doesn't match says so on the pad and
// asks again from the start, never closing on a mismatch (a tester, 2026-10-19:
// a different second PIN "didn't do anything"). Null when the pad is closed.
export const PIN_MISMATCH = "Those two didn't match. Pick a new PIN again.";
async function askNewPin(hint, { title = 'A new PIN', shown = '' } = {}) {
  let note = '';
  for (;;) {
    const next = await askPin({ title, hint, note, shown });
    if (next === null) return null;
    // Asked again at once, saying why, so the second pad is never wasted on one the cloud would refuse.
    if (obviousPin(next)) { note = PIN_OBVIOUS; continue; }
    const again = await askPin({ title: 'Once more', hint: 'Type the same four numbers again.' });
    if (again === null) return null;
    if (again === next) return next;
    note = PIN_MISMATCH;
  }
}

// The PIN they have now, checked by the cloud (a wrong one asks again; five
// mean the 10-minute wait). Null when the kid gives up.
async function currentPin(personId, hint) {
  const got = await withPin(async (pin) => { await checkPin(personId, pin); return pin; }, { title: 'The PIN now', hint });
  return got?.result ?? null;
}

// Leaving the cloud asks twice: the first tap (on the switch, or on Remove
// PIN) turns it red and says what leaving does; the second asks the PIN.
// `leaveArmed`: which one asked, or null.
let leaveArmed = null;
// The person whose leaving just said that records a newer Noodle Pads wrote
// can't be kept here and would be deleted (cloud.js leaveCloud): the next
// leave, armed again, goes ahead knowing it.
let leaveWarned = null;

// Takes the switch and Remove PIN back to resting: a half-done "Tap again" is
// dropped, and the line under the switch says what it said before. Any other
// tap in the sheet does this (people.js), as a sheet's Delete is taken back.
export function disarmCloud(personId) {
  leaveArmed = null;
  leaveWarned = null;
  el.pinOffNote.hidden = true;
  disarm(el.pinOff);
  if (!el.cloudSwitch.classList.contains('armed')) return;
  el.cloudSwitch.classList.remove('armed');
  el.cloudText.classList.remove('danger');
  if (personId) drawPin(personId);
}

// The first tap of leaving: red, with the words.
function armLeave(from, personId) {
  disarmCloud(personId);
  leaveArmed = from;
  if (from === el.cloudSwitch) {
    el.cloudSwitch.classList.add('armed');
    el.cloudText.classList.add('danger');
    el.cloudText.textContent = `${LEAVE_ASK} ${LEAVE_NOTE}`;
    announce(el.cloudText.textContent);
  } else {
    armed(el.pinOff, LEAVE_ASK);
    el.pinOffNote.textContent = LEAVE_NOTE;
    el.pinOffNote.hidden = false;
    announce(`${LEAVE_ASK} ${LEAVE_NOTE}`);
  }
}

// The grown-up sum for putting `p` in the cloud (Ben, 2026-10-27: the usual
// sum, no stronger gate), with who it is for under its title. A wrong answer
// says so and asks another; true after the right one, false after ✕ or Esc.
function askPutUpSum(p) {
  return new Promise((resolve) => askSum({
    owner: 'cloud-up', stay: true,
    why: `☁️ To put ${p.avatar ? `${p.avatar} ` : ''}${p.name} in the cloud`,
    right: () => resolve(true), cancel: () => resolve(false),
  }));
}

// Already in the cloud with a PIN (goUp's 409): their own PIN, not the one
// just picked, joins them up. ✕ leaves them on this device.
async function joinPad(personId, p) {
  let got;
  try {
    got = await withPin(async (pin) => { await openProfile(personId, pin); return pin; }, {
      title: `${p.avatar ? `${p.avatar} ` : ''}${p.name}`,
      hint: 'Already in the cloud with a PIN. Type that one to join up.',
    });
  } catch (err) {
    // A row with no PIN, made by hand: the Worker has no such profile to open.
    if (err instanceof CloudError && err.status === 404) throw new Error(IN_THE_WAY);
    throw err;
  }
  if (!got) return null;
  refresh();
  syncNow(personId);
  return got.result;
}

// ☁️ In the cloud switched on: the sum, a new PIN twice, then the cloud.
// Nothing is sent before the second pad is answered; ✕ anywhere leaves them
// on this device. Returns the PIN once they are in, else null.
async function putUp(personId, p) {
  if (!await cloudThere()) throw new CloudError(0, { error: 'no cloud' });
  if (!await askPutUpSum(p)) return null;
  const next = await askNewPin(PICK_PIN_HINT, { title: '☁️ Pick their PIN', shown: PIN_PUBLIC });
  if (next === null) return null;
  el.cloudText.textContent = 'Putting them in the cloud…';
  const went = await goUp(personId, next);
  if (went === 'joins') return joinPad(personId, p);
  return next;
}

// A tap in the Cloud or PIN part: true when it was one of their buttons.
// `note` says what went wrong (in the PIN part); the pill says what went right.
export async function pinClick(personId, t, note = () => {}) {
  const parts = [el.cloudSwitch, el.syncBtn, el.shareBtn, el.backupBtn, el.pinChange, el.pinOff, el.pinRemember, el.pinForgetAll];
  if (t !== el.cloudSwitch && t !== el.pinOff) disarmCloud(personId);
  if (!parts.includes(t)) return false;
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  el.pinPartNote.textContent = '';
  // Runs `fn`; what went wrong shows under the part tapped (the switch's
  // line for ☁️, the note for 🔒), after the redraw so it stays.
  const cloudPart = [el.cloudSwitch, el.syncBtn, el.shareBtn].includes(t);
  const run = async (fn) => {
    let said = '';
    try {
      return await fn();
    } catch (err) {
      said = trouble(err);
      note(said);
      return undefined;
    } finally {
      refresh();
      if (said) (cloudPart ? el.cloudText : el.pinPartNote).textContent = said;
    }
  };

  if (t === el.cloudSwitch && el.cloudSwitch.getAttribute('aria-checked') !== 'true') {
    const pin = await run(() => putUp(personId, p));
    if (pin) {
      flashPin(personId, '✅ In the cloud, PIN set');
      refresh();
      await offerRemember(personId, pin);
    }
    return true;
  }
  // Leaving: ☁️ off and Remove PIN are the same thing, with the same words.
  if (t === el.cloudSwitch || t === el.pinOff) {
    if (leaveArmed !== t) { armLeave(t, personId); return true; }
    const knowing = leaveWarned === personId;
    disarmCloud(personId);
    const leave = (pin) => leaveCloud(personId, pin, { knowing });
    let warning = '';
    await run(async () => {
      try {
        await withPin(leave, { title: '☁️ Leave the cloud', hint: 'Type the PIN. Their cloud copy is deleted for every device; this device keeps everything.' });
      } catch (err) {
        if (!err?.unheld) throw err;
        warning = `${err.message} Tap again to leave anyway.`;
      }
    });
    if (warning) {
      // Nothing was deleted. Red again, with the warning; the next tap asks the PIN and goes ahead.
      armLeave(t, personId);
      leaveWarned = personId;
      (t === el.cloudSwitch ? el.cloudText : el.pinOffNote).textContent = warning;
      announce(warning);
    }
    return true;
  }
  // ⬇️ Back up: one file of just them, as 🗂️ See all's ⬇️ Export a backup
  // makes (backup-ui.js savePersonBackup), in one tap.
  if (t === el.backupBtn) {
    await backup(personId, nameOf(p), el.backupBtn);
    return true;
  }
  if (t === el.syncBtn) {
    if (await run(() => haveKey(personId, 'Type the PIN to sync them.'))) await run(() => syncNow(personId));
    return true;
  }
  if (t === el.shareBtn) {
    const asks = !keyOf(personId) && !!linkOf(personId)?.pin;
    if (await run(() => haveKey(personId, 'Type the PIN to share from them.'))) {
      openShareDialog(personId);
      if (asks) shareAsked = personId;
    }
    return true;
  }
  // 🔑 Remember on this device asks the PIN (the cloud gives a key that
  // lasts for it). Forget this device asks the grown-up sum first (Ben,
  // 2026-10-27), so a kid can't lock themselves out by a slip: a wrong
  // answer asks another, and ✕ forgets nothing.
  if (t === el.pinRemember) {
    if (isRemembered(personId)) {
      askSum({
        owner: 'forget', stay: true,
        right: () => run(async () => { await forgetHere(personId); flashPin(personId, '🔒 Forgotten here'); }),
      });
      return true;
    }
    await run(async () => {
      const got = await withPin(async (pin) => { await rememberHere(personId, pin); return true; }, {
        title: `${p?.avatar ? `${p.avatar} ` : ''}${p ? nameOf(p) : 'PIN'}`,
        hint: 'Type their PIN. This device then opens them without it until someone taps Forget this device. Sharing still asks it.',
      });
      if (got) flashPin(personId, '🔑 Remembered here');
    });
    return true;
  }
  // 🔑 Forget all N devices: the grown-up sum, then the PIN (a wrong PIN asks
  // again; ✕ at either changes nothing). Every device, this one too, asks the
  // PIN next time.
  if (t === el.pinForgetAll) {
    askSum({
      owner: 'forget-all', stay: true, why: `🔑 To forget every device that remembers ${nameOf(p)}`,
      right: () => run(async () => {
        const got = await withPin((pin) => forgetAllDevices(personId, pin), {
          title: `${p?.avatar ? `${p.avatar} ` : ''}${nameOf(p)}`,
          hint: 'Type their PIN. Every device, this one too, asks it again the next time they are opened.',
        });
        if (got) { devices = null; flashPin(personId, '🔒 Forgotten on every device'); }
      }),
    });
    return true;
  }
  if (t === el.pinChange) {
    const current = await currentPin(personId, 'First, the PIN it has now.');
    if (current === null) return true;
    const next = await askNewPin('Pick four new numbers.');
    if (next === null) return true;
    await run(async () => { await setPin(personId, current, next); flashPin(personId, '✅ PIN changed'); });
    return true;
  }
  return false;
}

// ── 🔗 Share ──

let shareFrom = null;
let shareKind = 'sound';

function openShareDialog(personId) {
  shareFrom = personId;
  shareKind = 'sound';
  el.shareNote.textContent = '';
  el.shareMade.hidden = true;
  drawShare();
  loadMine();
  openDialog(el.shareDialog);
}

// Shared already: this person's own codes, each with 🚫 Unshare.
let mine = [];
async function loadMine() {
  const from = shareFrom;
  mine = [];
  drawMine();
  el.shareMineNote.textContent = inCloud(from) ? 'Looking…' : '';
  try {
    const list = await mySharesOf(from);
    if (shareFrom !== from) return;
    mine = list;
    el.shareMineNote.textContent = '';
  } catch (err) {
    if (shareFrom === from) el.shareMineNote.textContent = trouble(err);
  }
  drawMine();
}

function drawMine() {
  el.shareMine.replaceChildren(...(mine.length ? mine.map((s) => {
    const li = make('li', 'cl-item cl-shared');
    const text = make('span', 'cl-text', `${shareEmoji(s.kind)} ${s.title}`);
    text.append(make('span', 'cl-code', showCode(s.code)));
    const off = button('quiet danger', '🚫 Unshare', { unshare: s.code });
    off.setAttribute('aria-label', `Unshare ${s.title} (${showCode(s.code)})`);
    li.append(text, off);
    return li;
  }) : [make('li', 'field-hint', 'Nothing shared yet.')]));
}

function drawShare() {
  const all = shareable(shareFrom);
  el.shareWhat.replaceChildren(...[['sound', 'Sounds'], ['beat', 'Beats'], ['song', 'Songs']].map(([k, label]) => {
    const b = button('cl-kind', `${shareEmoji(k)} ${label}`, { kind: k });
    b.setAttribute('aria-pressed', String(k === shareKind));
    return b;
  }));
  const items = all[shareKind];
  el.shareItems.replaceChildren(...(items.length ? items.map((it) => {
    const li = make('li', 'cl-item');
    li.append(button('cl-pick', `${it.emoji} ${it.name}`, { item: it.id }));
    return li;
  }) : [make('li', 'field-hint', `No ${shareKind}s to share yet.`)]));
}

async function onShareClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.kind) { shareKind = t.dataset.kind; drawShare(); return; }
  for (const b of el.shareMine.querySelectorAll('.armed')) if (b !== t) disarm(b);
  if (t.dataset.unshare) {
    if (!armed(t, 'Unshare? It stops for everyone')) return;
    el.shareMineNote.textContent = 'Unsharing…';
    try {
      await unshareItem(shareFrom, t.dataset.unshare);
      mine = mine.filter((s) => s.code !== t.dataset.unshare);
      el.shareMineNote.textContent = '🚫 Unshared. That code no longer works; remixes others made stay.';
    } catch (err) {
      el.shareMineNote.textContent = trouble(err);
    }
    drawMine();
    return;
  }
  if (t === el.shareCopy) {
    try {
      await navigator.clipboard.writeText(el.shareCode.textContent);
      el.shareNote.textContent = '📋 Copied.';
    } catch {
      el.shareNote.textContent = 'Copying is not allowed here: write the code down instead.';
    }
    return;
  }
  if (t.dataset.item) {
    const from = shareFrom;
    el.shareMade.hidden = true;
    try {
      if (!await askToShare(from)) return;
      el.shareNote.textContent = 'Making a share code…';
      const { code, title, left } = await shareItem(from, shareKind, t.dataset.item);
      el.shareCode.textContent = showCode(code);
      el.shareTitle.textContent = title;
      el.shareMade.hidden = false;
      el.shareNote.textContent = left ?? '';
      announce(`Share code for ${title}: ${showCode(code).split('').join(' ')}`);
      loadMine();
    } catch (err) {
      el.shareNote.textContent = trouble(err);
    }
  }
}

// Several sounds in one code, from ✏️ Edit sounds → 🔗 Share (bulk.js): their
// PIN first (askToShare), then the Share sheet opens and makes the code
// straight away; it shows like any other. ✕ on the PIN shares nothing.
export async function shareSounds(personId, ids) {
  try {
    if (!await askToShare(personId)) return;
  } catch (err) {
    announce(trouble(err));
    return;
  }
  openShareDialog(personId);
  el.shareNote.textContent = 'Making a share code…';
  try {
    const { code, title, left } = await shareItem(personId, 'sound', ids);
    if (shareFrom !== personId) return;
    el.shareCode.textContent = showCode(code);
    el.shareTitle.textContent = title;
    el.shareMade.hidden = false;
    el.shareNote.textContent = left ?? '';
    announce(`Share code for ${title}: ${showCode(code).split('').join(' ')}`);
    loadMine();
  } catch (err) {
    if (shareFrom === personId) el.shareNote.textContent = trouble(err);
  }
}

// ── 🔗 Shared with me ──

let playing = null;   // {code, src}
const previews = new Map();   // code -> Promise<AudioBuffer>, the last played last
// How many shares' decoded previews are kept: a second ▶ on one is instant,
// and a long list played through does not fill a phone's memory.
const KEEP_SHARE_PREVIEWS = 4;
// The preview plays through the app's player, so stopping everything (Esc,
// entering 🧸 Kids) stops it too, and the grille lights while it plays.
const PREVIEW_ID = 'share-preview';

function stopPreview() {
  if (!playing) return;
  if (audio.playing.get(PREVIEW_ID)?.src === playing.src) audio.stop(PREVIEW_ID);
  playing = null;
  drawShared();
}

async function playPreview(code) {
  if (playing?.code === code) { stopPreview(); return; }
  stopPreview();
  audio.wake();
  try {
    if (!previews.has(code)) {
      previews.set(code, fetchShare(code).then(async (s) => {
        if (!s.preview) throw new Error('This one has nothing to play. 🎛️ Remix it to hear it in the app.');
        // Levelled as a pad is (peak 0.9), so a preview made anywhere is as loud as the app's sounds.
        const decoded = await audio.decode(await (await api.fetchSound(s.preview)).arrayBuffer());
        return (await applyChain(decoded, [], null)).buffer;
      }));
      previews.get(code).catch(() => previews.delete(code));
    }
    const job = previews.get(code);
    previews.delete(code);
    previews.set(code, job);   // played last: kept longest
    for (const old of [...previews.keys()].slice(0, Math.max(0, previews.size - KEEP_SHARE_PREVIEWS))) previews.delete(old);
    const buffer = await job;
    audio.start(PREVIEW_ID, { buffer, duration: buffer.duration });
    const { src } = audio.playing.get(PREVIEW_ID);
    src.addEventListener('ended', () => { if (playing?.src === src) { playing = null; drawShared(); } });
    playing = { code, src };
  } catch (err) {
    el.sharedNote.textContent = trouble(err);
  }
  drawShared();
}

export function openSharedDialog() {
  el.sharedNote.textContent = '';
  el.sharedCode.value = '';
  drawShared();
  openDialog(el.sharedDialog, { focus: el.sharedCode });
  // Marks the codes their sharers unshared since this list was last drawn.
  checkShared().then(() => { if (el.sharedDialog.open) drawShared(); });
}

function drawShared() {
  const list = sharedHere();
  const me = person(state.personId);
  el.sharedNone.hidden = list.length > 0;
  el.sharedItems.replaceChildren(...list.map((s) => {
    const li = make('li', 'cl-item cl-shared');
    li.dataset.code = s.code;
    const text = make('span', 'cl-text', `${shareEmoji(s.kind)} ${s.title}`);
    text.append(make('span', 'cl-code', s.gone ? '🚫 No longer shared' : showCode(s.code)));
    const remove = button('quiet danger', '✕ Remove', { remove: s.code });
    remove.setAttribute('aria-label', `Remove ${s.title} from Shared with me`);
    if (s.gone) {
      // Its sharer unshared it: nothing left to play or remix, only to remove.
      li.classList.add('cl-gone');
      li.append(text, remove);
      return li;
    }
    const play = button('chip-dark', playing?.code === s.code ? '■ Stop' : '▶ Play', { play: s.code });
    play.setAttribute('aria-pressed', String(playing?.code === s.code));
    const remix = button('chip-dark', '🎛️ Remix', { remix: s.code });
    remix.setAttribute('aria-label', `Remix ${s.title} onto ${me?.name ?? 'this board'}`);
    li.append(text, play, remix, remove);
    return li;
  }));
}

async function onSharedClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t === el.sharedOpen) {
    el.sharedNote.textContent = 'Looking…';
    try {
      const s = await openShare(el.sharedCode.value);
      el.sharedCode.value = '';
      el.sharedNote.textContent = `🔗 ${s.title} is in your list now.`;
    } catch (err) {
      el.sharedNote.textContent = trouble(err);
    }
    drawShared();
    return;
  }
  for (const b of el.sharedItems.querySelectorAll('.armed')) if (b !== t) disarm(b);
  if (t.dataset.play) { await playPreview(t.dataset.play); return; }
  if (t.dataset.remix) {
    el.sharedNote.textContent = 'Remixing…';
    try {
      const merged = await remixShare(t.dataset.remix, state.personId);
      el.sharedNote.textContent = `🎛️ ${mergeSummary(merged)} It's yours to change; the original stays as it was.`;
    } catch (err) {
      el.sharedNote.textContent = trouble(err);
      drawShared();
    }
    return;
  }
  if (t.dataset.remove) {
    if (!armed(t, 'Remove?')) return;
    if (playing?.code === t.dataset.remove) stopPreview();
    forgetShare(t.dataset.remove);
    el.sharedNote.textContent = 'Removed from your list. The code opens it again.';
    drawShared();
  }
}

// ── ☁️ Open from the cloud ──

// The list, or, once someone is picked, them coming down (Ben, 2026-10-26):
// the sheet locks (no ✕, Esc or backdrop) while they come and after a stop,
// until 🔄 Try again or Don't bring them; a spinner until there is something
// to measure, then a bar that fills by bytes and never goes back.
let listed = new Map();   // profile id -> the public list's entry
let opening = null;       // {id, p, pin, shown}: the one coming down
let locked = false;
let frameAsked = false;
let latest = null;
const nextFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));

function showList(on) {
  el.listHint.hidden = !on;
  el.listNote.hidden = !on;
  el.listItems.hidden = !on;
  el.open.hidden = on;
}

function lock(on) {
  locked = on;
  el.listClose.hidden = on;
}

const mb = (n) => (n / 1048576).toFixed(1);

// What the sheet shows for `step` ('working', 'done', 'stopped') at
// `prog` (cloud-sync.js newProgress); `text`, why it stopped.
function drawOpen(step, prog, text = '') {
  if (!opening) return;
  const { p } = opening;
  el.open.dataset.step = step;
  if (!el.openPic.children.length) el.openPic.replaceChildren(avatarBadge(p));
  el.openName.textContent = p.name;
  const measured = prog.phase !== 'finding' && prog.sounds > 0;
  opening.shown = Math.max(opening.shown, step === 'done' ? 1 : progressShare(prog));
  el.openFill.style.setProperty('--got', String(opening.shown));
  el.openBar.hidden = !(measured || step === 'done');
  el.openBar.setAttribute('aria-valuenow', String(Math.round(opening.shown * 100)));
  el.openBar.setAttribute('aria-valuetext', measured ? `${prog.done} of ${prog.sounds} sounds` : `${Math.round(opening.shown * 100)}%`);
  el.openSpin.hidden = step !== 'working' || prog.phase === 'sounds';
  el.openDone.hidden = step !== 'done';
  el.openStopped.hidden = step !== 'stopped';
  if (step === 'done') {
    el.openLine.textContent = '✓ On this device now';
    el.openPlay.replaceChildren(avatarBadge(p), 'Play as them');
    el.openPlay.setAttribute('aria-label', `Play as ${p.name}`);
    // Everything that came, as 👥 People counts it (all nine kinds), and the
    // settings they changed from the defaults (Ben, 2026-10-26: a short line
    // made it look as if things were missing).
    const { text, words } = cameText(opening.id);
    el.openSize.textContent = text;
    el.openSize.setAttribute('aria-label', words);
  } else if (step === 'stopped') {
    el.openLine.textContent = `⚠️ ${text}`;
    el.openSize.textContent = '';
  } else if (prog.phase === 'finding') {
    el.openLine.textContent = 'Finding their things…';
    el.openSize.textContent = '';
  } else if (prog.phase === 'sounds') {
    el.openLine.textContent = `${KIND_EMOJI.sounds} ${prog.done} of ${prog.sounds}`;
    el.openSize.textContent = prog.total ? `${mb(Math.min(prog.got, prog.total))} of ${mb(prog.total)} MB` : `${mb(prog.got)} MB`;
  } else {
    el.openLine.textContent = 'Putting it all away…';
    el.openSize.textContent = '';
  }
}

// What a person has on this device: "🔊 27 · 🥁 4 · 🎬 2 · ⚙️ 3", the last
// the settings they picked that differ from the defaults (IndexedDB `prefs`;
// not the tips they've seen, `quiet`, nor `advancedBeats`, which their level
// says), and the same in words.
export function cameText(personId) {
  const counts = personCounts(storedLists(), personId);
  const picked = ([k, v]) => SETTINGS[k]?.scope === 'person' && !SETTINGS[k].quiet && k !== 'advancedBeats' && v !== SETTINGS[k].default;
  const settings = Object.entries(state.prefs.get(personId)?.values ?? {}).filter(picked).length;
  const text = [countsText(counts), settings ? `⚙️\u00a0${settings}` : ''].filter((t) => t && t !== 'nothing yet');
  const words = [countsWords(counts), settings ? count(settings, 'setting') : ''].filter((t) => t && t !== 'nothing yet');
  return { text: text.join('\u00a0· ') || 'Nothing made yet', words: words.join(', ') || 'Nothing made yet' };
}

// A sync tells its progress for every piece of audio: the sheet draws the
// latest once a frame.
function drawSoon(prog) {
  latest = prog;
  if (frameAsked) return;
  frameAsked = true;
  nextFrame(() => {
    frameAsked = false;
    if (latest && locked) drawOpen('working', latest);
  });
}

export async function openCloudList() {
  // Someone still coming down (the sheet closed by a back gesture): their progress.
  if (opening) { openDialog(el.list); return; }
  showList(true);
  el.listNote.textContent = 'Looking…';
  el.listItems.replaceChildren();
  openDialog(el.list);
  let list;
  try {
    list = await listProfiles();
  } catch (err) {
    el.listNote.textContent = cloudTrouble(err);
    return;
  }
  const here = list.filter((p) => !inCloud(p.id));
  listed = new Map(here.map((p) => [p.id, p]));
  el.listNote.textContent = here.length ? '' : list.length ? 'Everyone in the list is already on this device.' : 'Nobody is in the cloud yet.';
  el.listItems.replaceChildren(...here.map((p) => {
    const li = make('li', 'cl-item');
    const b = button('cl-pick', '', { open: p.id, pin: String(p.pin) });
    b.append(avatarBadge(p), make('span', 'cl-text', p.name));
    if (p.pin) b.append(make('span', 'cl-lock', '🔒'));
    b.setAttribute('aria-label', `Open ${p.name}${p.pin ? ' (has a PIN)' : ''}`);
    li.append(b);
    return li;
  }));
}

async function onListClick(e) {
  const b = e.target.closest('[data-open]');
  if (!b || locked || opening) return;
  const id = b.dataset.open;
  const pinned = b.dataset.pin === 'true';
  const p = listed.get(id) ?? { id, name: b.textContent, avatar: '', color: '' };
  opening = { id, p, pin: null, shown: 0 };
  el.listNote.textContent = '';
  try {
    if (!pinned) start();
    const opened = pinned
      ? await withPin(async (pin) => { await openProfile(id, pin); return pin; }, { title: 'Their PIN', hint: 'Type the PIN to open this profile on this device.' })
      : { result: await openProfile(id) };
    if (!opened) { finish(); el.listNote.textContent = ''; return; }
    if (pinned) { opening.pin = opened.result; start(); }
  } catch (err) {
    finish();
    el.listNote.textContent = cloudTrouble(err);
    return;
  }
  b.closest('li')?.remove();
  await bring();
}

// The sheet turns to them, locked, with the spinner.
function start() {
  showList(false);
  lock(true);
  el.openPic.replaceChildren();
  drawOpen('working', newProgress());
  el.openName.focus();
}

async function bring() {
  lock(true);
  drawOpen('working', newProgress());
  const done = await bringDown(opening.id, drawSoon);
  refresh();
  if (done.stored) {
    lock(false);
    drawOpen('done', latest ?? newProgress());
    el.openPlay.focus();
    if (opening.pin) offerRemember(opening.id, opening.pin);
  } else {
    drawOpen('stopped', latest ?? newProgress(), done.text);
    el.openAgain.focus();
  }
  latest = null;
}

// The sheet in one state with made-up progress, for `just look`'s cloud-*
// views (tools/look.mjs), which have no cloud to bring anyone from.
export function lookOpen(p, step, prog = {}, text = '') {
  opening = { id: p.id, p, pin: null, shown: 0 };
  showList(false);
  lock(step !== 'done');
  el.openPic.replaceChildren();
  drawOpen(step, { ...newProgress(), ...prog }, text);
}

// Back to the list.
function finish() {
  opening = null;
  latest = null;
  lock(false);
  showList(true);
}

// ── start ──

export function initCloudUI(hooks) {
  refresh = hooks.refresh;
  if (hooks.play) play = hooks.play;
  if (hooks.addPerson) addPerson = hooks.addPerson;
  if (hooks.dropPerson) dropPerson = hooks.dropPerson;
  if (hooks.backup) backup = hooks.backup;
  Object.assign(el, {
    pin: $('#pin-dialog'), pinTitle: $('#pin-title'), pinHint: $('#pin-hint'), pinNote: $('#pin-note'), pinPublic: $('#pin-public'), pinDots: $('#pin-dots'), pinKeys: $('#pin-keys'),
    pinForgot: $('#pin-forgot'), pinBack: $('#pin-back'), pinNew: $('#pin-new'), pinUnknown: $('#pin-unknown'),
    remember: $('#remember-dialog'), rememberTitle: $('#remember-title'), rememberSub: $('#remember-sub'), rememberYes: $('#remember-yes'), rememberNo: $('#remember-no'),
    avatar: $('#avatar-dialog'), avatarGrid: $('#avatar-grid'),
    cloudSwitch: $('#profile-cloud'), cloudText: $('#profile-cloud-text'), cloudTools: $('#profile-cloud-tools'),
    syncBtn: $('#cloud-sync'), shareBtn: $('#cloud-share'), backupBtn: $('#cloud-backup'),
    pinState: $('#profile-pin-state'), pinPartHint: $('#profile-pin-hint'), pinPartNote: $('#profile-pin-note'),
    pinPart: $('#profile-pin-part'), pinTools: $('#profile-pin-tools'), pinChange: $('#cloud-pin-change'), pinOff: $('#cloud-pin-off'), pinOffNote: $('#cloud-pin-off-note'),
    pinRemember: $('#cloud-pin-remember'), pinForgetAll: $('#cloud-pin-forget-all'),
    list: $('#cloud-list'), listNote: $('#cloud-list-note'), listItems: $('#cloud-list-items'), listHint: $('#cloud-list-hint'),
    open: $('#cloud-open'), openPic: $('#cloud-open-pic'), openName: $('#cloud-open-name'),
    openSpin: $('#cloud-open-spin'), openBar: $('#cloud-open-bar'), openFill: $('#cloud-open-fill'), openLine: $('#cloud-open-line'),
    openSize: $('#cloud-open-size'), openDone: $('#cloud-open-done'), openPlay: $('#cloud-open-play'), openMore: $('#cloud-open-more'),
    openStopped: $('#cloud-open-stopped'), openAgain: $('#cloud-open-again'), openLeave: $('#cloud-open-leave'),
    shareDialog: $('#share-dialog'), shareNote: $('#share-note'), shareWhat: $('#share-what'), shareItems: $('#share-items'),
    shareMine: $('#share-mine'), shareMineNote: $('#share-mine-note'),
    shareMade: $('#share-made'), shareCode: $('#share-code'), shareTitle: $('#share-title-made'), shareCopy: $('#share-copy'),
    sharedDialog: $('#shared-dialog'), sharedCode: $('#shared-code'), sharedOpen: $('#shared-open'), sharedNote: $('#shared-note'),
    sharedItems: $('#shared-items'), sharedNone: $('#shared-none'),
    browse: $('#cloud-browse'), sharedBtn: $('#shared-browse'),
  });
  el.listClose = el.list.querySelector('[data-close]');
  for (const d of [el.pin, el.remember, el.avatar, el.shareDialog, el.sharedDialog]) setupDialog(d);
  // Locked while someone comes down: no ✕, Esc or backdrop.
  setupDialog(el.list, { beforeClose: () => !locked });
  // Closed when they're done (✕, or the backdrop): the list next time.
  el.list.addEventListener('close', () => { if (opening && !locked) finish(); });
  el.openPlay.addEventListener('click', () => { const id = opening?.id; finish(); el.list.close(); if (id) play(id); });
  el.openMore.addEventListener('click', () => { finish(); openCloudList().catch((err) => console.error('Opening the cloud list failed:', err)); });
  el.openAgain.addEventListener('click', () => { if (opening) bring(); });
  el.openLeave.addEventListener('click', async () => {
    if (!opening) return;
    await leaveInCloud(opening.id);
    finish();
    refresh();
    openCloudList().catch((err) => console.error('Opening the cloud list failed:', err));
  });

  // PIN pad: 1–9, then 0 under 8 and ⌫ beside it, big keys.
  el.pinKeys.replaceChildren(...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫'].map((k) => {
    const b = button('pin-key', k, { key: k });
    if (k === '⌫') b.setAttribute('aria-label', 'Delete a digit');
    return b;
  }));
  el.pinKeys.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) pinKey(b.dataset.key); });
  el.pin.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) { e.preventDefault(); pinKey(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); pinKey('⌫'); }
  });
  // Closing the pad gives up. A browser fires 'close' as a task of its own,
  // after the pad that just took four digits may already be open again for
  // the next ask ("Once more", a mismatch, a wrong PIN): then it is ignored,
  // or it would end that ask unseen (a tester, 2026-10-19).
  el.pin.addEventListener('close', () => {
    if (el.pin.open) return;
    const done = pinDone;
    pinDone = null;
    done?.(null);
  });
  el.pinForgot.textContent = FORGOT_PIN;
  el.pinBack.addEventListener('click', () => { const done = pinDone; pinDone = null; el.pin.close(); done?.('back'); });
  el.pinNew.addEventListener('click', () => { const done = pinDone; pinDone = null; el.pin.close(); done?.('new'); });
  // 🤷 I don't know the PIN: the first tap asks, the second deletes them here.
  el.pinUnknown.addEventListener('click', () => {
    if (!armed(el.pinUnknown, `Tap again: delete them from this device${pinUnsynced ? `. ${unsyncedText(pinUnsynced)}.` : ''}`)) return;
    const done = pinDone;
    pinDone = null;
    el.pin.close();
    done?.('unknown');
  });

  // 🔑 Remember them here?: Remember says yes; Not now, ✕ or Esc close it, a no.
  el.rememberYes.addEventListener('click', () => { const done = rememberDone; rememberDone = null; el.remember.close(); done?.(true); });
  el.remember.addEventListener('close', () => { const done = rememberDone; rememberDone = null; done?.(false); });

  avatarAll = emojiMore({
    grid: el.avatarGrid,
    onPick: chooseAvatar,
    stateOf: (p) => ({ pressed: p === avatarOf() }),
  });
  el.avatarGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-avatar]');
    if (b) chooseAvatar(b.dataset.avatar);
  });

  el.shareDialog.addEventListener('click', onShareClick);
  el.shareDialog.addEventListener('close', () => { shareAsked = null; });
  el.sharedDialog.addEventListener('click', onSharedClick);
  el.sharedDialog.addEventListener('close', stopPreview);
  el.sharedCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.sharedOpen.click(); } });
  el.list.addEventListener('click', onListClick);
  el.browse.addEventListener('click', openCloudList);
  el.sharedBtn.addEventListener('click', openSharedDialog);
}

// For the People rows: what the ☁️ button says.
export function cloudLabel(p) {
  if (!p.added) return null;
  // Someone only on this device shows no ☁️ at all.
  if (!inCloud(p.id)) return null;
  const s = statusOf(p.id);
  if (warns(s)) return { text: '☁️⚠️', label: `Cloud for ${p.name}: ${s.text}` };
  if (s?.state === 'waiting') return { text: '☁️✓', label: `Cloud for ${p.name}: in the cloud, synced once opened with their PIN` };
  return { text: '☁️✓', label: `Cloud for ${p.name}: in the cloud` };
}
