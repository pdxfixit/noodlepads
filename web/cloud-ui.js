// The cloud's screens: the PIN pad (with 🤷 I don't know the PIN for a PIN new
// to this device), the avatar picker, the PIN part of a person's profile
// sheet (set, change, remove; the guard on their name, picture and color),
// a person's ☁️ Cloud switch with 🔄 Sync now and 🔗 Share (🚫 Unshare), ☁️ Open from the cloud, 🔗 Shared
// with me (▶ Play, 🎛️ Remix, ✕ Remove). The work is in cloud.js.

import { state, setPersonEdit } from './state.js';
import { person, people } from './board.js';
import { PICTURES, KIND_EMOJI } from './model.js';

// A share's kind ("sound", "beat", "song") as its emoji (model.js KIND_EMOJI).
const shareEmoji = (kind) => KIND_EMOJI[`${kind}s`] ?? KIND_EMOJI.shares;
import { emojiMore, withCurrent } from './emoji-more.js';
import { openDialog, setupDialog } from './dialogs.js';
import { announce } from './ui.js';
import { audio } from './audio.js';
import { PIN_RESET_EMAIL } from './contact.js';
import {
  api, CloudError, cloudTrouble, cloudThere, inCloud, linkOf, keyOf, isOffline, statusOf, syncNow,
  openProfile, unlock, pinIsNew, checkPin, setPin, setOffline, removeProfile, putUpNow, wantsCloud, shareable, shareItem, showCode,
  sharedHere, openShare, forgetShare, remixShare, fetchShare, checkShared, mySharesOf, unshareItem, listProfiles,
} from './cloud.js';
import { mergeSummary } from './merge.js';

// Where a forgotten PIN goes: Ben resets it by hand (`just cloud-reset-pin`). The address is built in web/contact.js.
export const FORGOT_PIN = `Forgot your PIN? A grown-up can email ${PIN_RESET_EMAIL} with your fun name.`;

const el = {};
let refresh = () => {};    // redraws People and the corner, after a person changes
let addPerson = () => {};  // 👋 Someone new, from a PIN pad that guards a locked board
let dropPerson = async () => {};  // 🤷 I don't know the PIN: deletes them from this device (app.js)

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
const trouble = (err) => (err instanceof CloudError ? cloudTrouble(err) : String(err?.message || err));

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
export function askPin({ title = 'PIN', hint = '', note = '', forgot = false, someoneNew = false, unknown = false } = {}) {
  pinDigits = '';
  drawDots();
  el.pinTitle.textContent = title;
  el.pinHint.textContent = hint;
  el.pinNote.textContent = note;
  // A note is trouble (a wrong PIN, two that didn't match): red, and the dots
  // shake once, so the pad says no out loud (a tester, 2026-10-19).
  el.pin.classList.remove('pin-wrong');
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

// Tries `act(pin)` until it works, asking again on a wrong PIN; null when the
// kid gives up, {unknown: true} after 🤷 I don't know the PIN.
async function withPin(act, { title, hint, forgot = true, locked = false, unknown = false }) {
  let note = '';
  for (;;) {
    const pin = await askPin({ title, hint, note, forgot, someoneNew: locked, unknown });
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
  try {
    const opened = await withPin((pin) => unlock(personId, pin), {
      title: `${p?.avatar ? `${p.avatar} ` : ''}${p?.name ?? 'PIN'}`,
      hint: fresh
        ? "They have a new PIN. Type it to open them here. Don't know it? Their things on this device are deleted; the cloud keeps what it has."
        : 'Type their PIN to open them.',
      locked,
      unknown: fresh,
    });
    if (opened?.unknown) {
      await dropPerson(personId);
      return false;
    }
    return !!opened;
  } catch (err) {
    announce(trouble(err));
    return false;
  }
}

// The profile sheet's guard (people.js): their PIN, asked before a change to
// their name, picture or color. A wrong PIN says so and asks again; five wrong
// tries mean the Worker's 10-minute wait. Resolves {ok: true}, {ok: false}
// when the kid gives up, or {ok: false, note} when it can't be checked.
export async function askEditPin(personId) {
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  try {
    const done = await withPin((pin) => checkPin(personId, pin), {
      title: `${p?.avatar ? `${p.avatar} ` : ''}${p?.name ?? 'PIN'}`,
      hint: 'Type their PIN to change their name, picture or color.',
    });
    return { ok: !!done };
  } catch (err) {
    const note = trouble(err);
    announce(note);
    return { ok: false, note };
  }
}

// Delete's third tap in a profile sheet (people.js): deletes the cloud copy of
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
// ☁️ In the cloud is a switch (Ben, 2026-10-19): on puts them in the cloud
// now, even with nothing made; off deletes the cloud copy (two taps, and the
// PIN if they have one) and keeps them on this device only (📴 Offline).
// Under it, 🔄 Sync now and 🔗 Share…. The PIN part says at a glance whether
// a PIN is on (its pill), with 🔒 Set a PIN, or Change PIN and Remove PIN.
// What a PIN button just did shows in the pill for a while, then the pill
// fades back to saying what is on (Ben: "PIN set appears where PIN on is").

export const PIN_FLASH_MS = 3000;
let flash = null;   // {id, text, until}: what the pill says just after a change

const nameOf = (p) => p?.name ?? 'them';

// A cloud state someone has to see to: ☁️⚠️ on their line in 👥 People
// (cloudLabel), and the same ⚠️ before what is wrong in their profile sheet.
const warns = (s) => s?.state === 'trouble' || s?.state === 'locked';

// What the Cloud part says about a person.
function cloudText(p) {
  if (isOffline(p.id)) return '📴 Off: everything of theirs stays on this device only.';
  if (!inCloud(p.id)) {
    return wantsCloud(p) ? 'They go up with the next sync.'
      : `Off for now: they go up by themselves once they make something (a ${KIND_EMOJI.sounds} sound, a ${KIND_EMOJI.beats} beat, a ${KIND_EMOJI.songs} song or a ${KIND_EMOJI.takes} take), or now with the switch.`;
  }
  const s = statusOf(p.id);
  if (warns(s)) return `⚠️ ${s.text.replace(/^🔒 /, '')}`;
  if (s?.text) return s.text;
  if (!keyOf(p.id)) return '🔒 Syncs once they are opened with their PIN.';
  return 'In the cloud ✓ Opens on any phone or tablet.';
}

// Draws the Cloud and PIN parts for `personId`.
export function drawPin(personId) {
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  if (!p) return;
  const link = linkOf(personId);
  const linked = inCloud(personId);
  const switchOn = p.added && !isOffline(personId) && (linked || wantsCloud(p));
  el.cloudSwitch.hidden = !p.added;
  el.cloudSwitch.setAttribute('aria-checked', String(switchOn));
  if (!el.cloudSwitch.classList.contains('armed')) {
    el.cloudText.textContent = p.added ? cloudText(p) : "Someone from the app's own list stays on this device.";
  }
  el.cloudTools.hidden = !linked;

  const hasPin = !!link?.pin;
  const now = flash && flash.id === personId && flash.until > Date.now() ? flash : null;
  el.pinState.hidden = !p.added;
  el.pinState.textContent = now ? now.text : hasPin ? '🔒 PIN on' : '🔓 No PIN';
  el.pinState.classList.toggle('on', hasPin);
  el.pinState.classList.toggle('flash', !!now);
  el.pinBtn.hidden = !p.added || hasPin;
  el.pinTools.hidden = !p.added || !hasPin;
  el.pinPartHint.textContent = !p.added ? "Someone from the app's own list can't have a PIN."
    : hasPin ? (pinIsNew(personId)
      ? `They got a new PIN on another device. Open ${nameOf(p)} and type it.`
      : `Asked every time ${nameOf(p)} is opened, on every device, and before the name, picture or color changes.`)
      : linked ? `Anyone on any device can open ${nameOf(p)}.`
        : 'A PIN needs the cloud. Setting one turns it on.';
}

// The pill says `text` for PIN_FLASH_MS, then fades back to the PIN's state.
function flashPin(personId, text) {
  flash = { id: personId, text, until: Date.now() + PIN_FLASH_MS };
  setTimeout(() => {
    if (flash?.until > Date.now()) return;   // a later change flashes its own
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

// A new PIN, typed twice. A second that doesn't match says so on the pad and
// asks again from the start, never closing on a mismatch (a tester, 2026-10-19:
// a different second PIN "didn't do anything"). Null when the pad is closed.
export const PIN_MISMATCH = "Those two didn't match. Pick a new PIN again.";
async function askNewPin(hint) {
  let note = '';
  for (;;) {
    const next = await askPin({ title: 'A new PIN', hint, note });
    if (next === null) return null;
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

// Takes the switch back to resting: a half-done "Tap again" is dropped, and
// the line under it says what it said before. Any other tap in the sheet
// does this (people.js), as a sheet's Delete is taken back.
export function disarmCloud(personId) {
  if (!el.cloudSwitch.classList.contains('armed')) return;
  el.cloudSwitch.classList.remove('armed');
  el.cloudText.classList.remove('danger');
  if (personId) drawPin(personId);
}

// A tap in the Cloud or PIN part: true when it was one of their buttons.
// `note` says what went wrong (in the PIN part); the pill says what went right.
export async function pinClick(personId, t, note = () => {}) {
  const parts = [el.cloudSwitch, el.syncBtn, el.shareBtn, el.pinBtn, el.pinChange, el.pinOff];
  if (t !== el.cloudSwitch) disarmCloud(personId);
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

  if (t === el.cloudSwitch) {
    if (el.cloudSwitch.getAttribute('aria-checked') !== 'true') {
      el.cloudText.textContent = 'Putting them in the cloud…';
      await run(() => putUpNow(personId));
      return true;
    }
    if (inCloud(personId) && !el.cloudSwitch.classList.contains('armed')) {
      el.cloudSwitch.classList.add('armed');
      el.cloudText.classList.add('danger');
      el.cloudText.textContent = 'Tap again to take them out of the cloud: their cloud copy is deleted. This device keeps everything.';
      announce(el.cloudText.textContent);
      return true;
    }
    disarmCloud(personId);
    const off = (pin) => setOffline(personId, true, pin);
    await run(() => (inCloud(personId) && linkOf(personId)?.pin
      ? withPin(off, { title: '📴 Out of the cloud', hint: 'Type the PIN. Their cloud copy is deleted; this device keeps everything.' })
      : off()));
    return true;
  }
  if (t === el.syncBtn) {
    if (await run(() => haveKey(personId, 'Type the PIN to sync them.'))) await run(() => syncNow(personId));
    return true;
  }
  if (t === el.shareBtn) {
    if (await run(() => haveKey(personId, 'Type the PIN to share from them.'))) openShareDialog(personId);
    return true;
  }
  if (t === el.pinBtn) {
    const next = await askNewPin(`Pick four numbers. They are asked each time ${nameOf(p)} is opened.`);
    if (next === null) return true;
    await run(async () => {
      if (!inCloud(personId)) await putUpNow(personId);   // a PIN needs the cloud
      await setPin(personId, null, next);
      flashPin(personId, '✅ PIN set');
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
  const current = await currentPin(personId, 'Type the PIN it has now to remove it.');
  if (current === null) return true;
  await run(async () => { await setPin(personId, current, null); flashPin(personId, '🔓 PIN removed'); });
  return true;
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
    el.shareNote.textContent = 'Making a share code…';
    el.shareMade.hidden = true;
    try {
      const { code, title } = await shareItem(shareFrom, shareKind, t.dataset.item);
      el.shareCode.textContent = showCode(code);
      el.shareTitle.textContent = title;
      el.shareMade.hidden = false;
      el.shareNote.textContent = '';
      announce(`Share code for ${title}: ${showCode(code).split('').join(' ')}`);
      loadMine();
    } catch (err) {
      el.shareNote.textContent = trouble(err);
    }
  }
}

// Several sounds in one code, from ✏️ Edit sounds → 🔗 Share (bulk.js): the
// Share sheet opens and makes the code straight away; it shows like any other.
export async function shareSounds(personId, ids) {
  openShareDialog(personId);
  el.shareNote.textContent = 'Making a share code…';
  try {
    const { code, title } = await shareItem(personId, 'sound', ids);
    if (shareFrom !== personId) return;
    el.shareCode.textContent = showCode(code);
    el.shareTitle.textContent = title;
    el.shareMade.hidden = false;
    el.shareNote.textContent = '';
    announce(`Share code for ${title}: ${showCode(code).split('').join(' ')}`);
    loadMine();
  } catch (err) {
    if (shareFrom === personId) el.shareNote.textContent = trouble(err);
  }
}

// ── 🔗 Shared with me ──

let playing = null;   // {code, src}
const previews = new Map();   // code -> Promise<AudioBuffer>

function stopPreview() {
  if (!playing) return;
  try { playing.src.stop(); } catch { /* already stopped */ }
  playing = null;
  drawShared();
}

async function playPreview(code) {
  if (playing?.code === code) { stopPreview(); return; }
  stopPreview();
  const ctx = audio.wake();
  try {
    if (!previews.has(code)) {
      previews.set(code, fetchShare(code).then(async (s) => {
        if (!s.preview) throw new Error('This one has nothing to play. 🎛️ Remix it to hear it in the app.');
        return audio.decode(await (await api.fetchSound(s.preview)).arrayBuffer());
      }));
      previews.get(code).catch(() => previews.delete(code));
    }
    const buffer = await previews.get(code);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.master);
    src.onended = () => { if (playing?.src === src) { playing = null; drawShared(); } };
    src.start();
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

export async function openCloudList() {
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
  if (!b) return;
  const id = b.dataset.open;
  el.listNote.textContent = 'Opening…';
  try {
    const opened = b.dataset.pin === 'true'
      ? await withPin((pin) => openProfile(id, pin), { title: 'Their PIN', hint: 'Type the PIN to open this profile on this device.' })
      : { result: await openProfile(id) };
    if (!opened) { el.listNote.textContent = ''; return; }
    el.listNote.textContent = statusOf(id)?.state === 'trouble' ? statusOf(id).text : '☁️ On this device now ✓';
    b.closest('li')?.remove();
    refresh();
  } catch (err) {
    el.listNote.textContent = cloudTrouble(err);
  }
}

// ── start ──

export function initCloudUI(hooks) {
  refresh = hooks.refresh;
  if (hooks.addPerson) addPerson = hooks.addPerson;
  if (hooks.dropPerson) dropPerson = hooks.dropPerson;
  Object.assign(el, {
    pin: $('#pin-dialog'), pinTitle: $('#pin-title'), pinHint: $('#pin-hint'), pinNote: $('#pin-note'), pinDots: $('#pin-dots'), pinKeys: $('#pin-keys'),
    pinForgot: $('#pin-forgot'), pinNew: $('#pin-new'), pinUnknown: $('#pin-unknown'),
    avatar: $('#avatar-dialog'), avatarGrid: $('#avatar-grid'),
    cloudSwitch: $('#profile-cloud'), cloudText: $('#profile-cloud-text'), cloudTools: $('#profile-cloud-tools'),
    syncBtn: $('#cloud-sync'), shareBtn: $('#cloud-share'),
    pinState: $('#profile-pin-state'), pinPartHint: $('#profile-pin-hint'), pinPartNote: $('#profile-pin-note'),
    pinBtn: $('#cloud-pin'), pinTools: $('#profile-pin-tools'), pinChange: $('#cloud-pin-change'), pinOff: $('#cloud-pin-off'),
    list: $('#cloud-list'), listNote: $('#cloud-list-note'), listItems: $('#cloud-list-items'),
    shareDialog: $('#share-dialog'), shareNote: $('#share-note'), shareWhat: $('#share-what'), shareItems: $('#share-items'),
    shareMine: $('#share-mine'), shareMineNote: $('#share-mine-note'),
    shareMade: $('#share-made'), shareCode: $('#share-code'), shareTitle: $('#share-title-made'), shareCopy: $('#share-copy'),
    sharedDialog: $('#shared-dialog'), sharedCode: $('#shared-code'), sharedOpen: $('#shared-open'), sharedNote: $('#shared-note'),
    sharedItems: $('#shared-items'), sharedNone: $('#shared-none'),
    browse: $('#cloud-browse'), sharedBtn: $('#shared-browse'),
  });
  for (const d of [el.pin, el.avatar, el.list, el.shareDialog, el.sharedDialog]) setupDialog(d);

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
  el.pinNew.addEventListener('click', () => { const done = pinDone; pinDone = null; el.pin.close(); done?.('new'); });
  // 🤷 I don't know the PIN: the first tap asks, the second deletes them here.
  el.pinUnknown.addEventListener('click', () => {
    if (!armed(el.pinUnknown, 'Tap again: delete them from this device')) return;
    const done = pinDone;
    pinDone = null;
    el.pin.close();
    done?.('unknown');
  });

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
  const s = statusOf(p.id);
  if (isOffline(p.id)) return { text: '📴', label: `Cloud for ${p.name}: offline, this device only` };
  if (!inCloud(p.id)) return { text: '☁️', label: `Cloud for ${p.name}: not in the cloud yet` };
  if (warns(s)) return { text: '☁️⚠️', label: `Cloud for ${p.name}: ${s.text}` };
  if (s?.state === 'waiting') return { text: '☁️✓', label: `Cloud for ${p.name}: in the cloud, synced once opened with their PIN` };
  return { text: '☁️✓', label: `Cloud for ${p.name}: in the cloud` };
}
