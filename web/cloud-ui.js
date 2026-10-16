// The cloud's screens: the PIN pad (with "Remember on this device"), the
// avatar picker, the PIN part of a person's profile sheet (set, change,
// remove, Forget on this device; the guard on their name, picture and color),
// a person's ☁️ sheet (sync, 🔗 Share with 🚫 Unshare, 📴 Offline), ☁️ Open from the cloud, 🔗 Shared
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
  api, CloudError, cloudTrouble, cloudThere, inCloud, linkOf, keyOf, isOffline, statusOf, onCloud, syncNow, syncAll,
  openProfile, unlock, forgetHere, checkPin, setPin, setOffline, wantsCloud, shareable, shareItem, showCode,
  sharedHere, openShare, forgetShare, remixShare, fetchShare, checkShared, mySharesOf, unshareItem, listProfiles,
} from './cloud.js';
import { mergeSummary } from './merge.js';

// Where a forgotten PIN goes: Ben resets it by hand (`just cloud-reset-pin`). The address is built in web/contact.js.
export const FORGOT_PIN = `Forgot your PIN? A grown-up can email ${PIN_RESET_EMAIL} with your fun name.`;

const el = {};
let refresh = () => {};    // redraws People and the corner, after a person changes
let addPerson = () => {};  // 👋 Someone new, from a PIN pad that guards a locked board
let sheetFor = null;       // the person the ☁️ sheet is open for

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

// Asks for four digits. Resolves with them, null when closed, or 'new' for
// 👋 Someone new. `remember` shows the "Remember on this device" switch;
// `forgot` the line on what to do about a forgotten PIN.
export function askPin({ title = 'PIN', hint = '', note = '', remember = false, forgot = false, someoneNew = false } = {}) {
  pinDigits = '';
  drawDots();
  el.pinTitle.textContent = title;
  el.pinHint.textContent = hint;
  el.pinNote.textContent = note;
  el.pinRememberLine.hidden = !remember;
  el.pinForgot.hidden = !forgot;
  el.pinNew.hidden = !someoneNew;
  return new Promise((resolve) => {
    pinDone = resolve;
    openDialog(el.pin, { focus: el.pinKeys.querySelector('[data-key="1"]') });
  });
}
export const rememberChosen = () => el.pinRemember.checked;

// Tries `act(pin, remember)` until it works, asking again on a wrong PIN;
// null when the kid gives up.
async function withPin(act, { title, hint, remember = false, forgot = true, locked = false }) {
  let note = '';
  if (remember) el.pinRemember.checked = false;
  for (;;) {
    const pin = await askPin({ title, hint, note, remember, forgot, someoneNew: locked });
    if (pin === 'new') { addPerson(); return null; }
    if (pin === null) {
      if (!locked) return null;
      note = 'Everyone on this device has a PIN. Type yours, or tap 👋 Someone new.';
      continue;
    }
    try {
      return { result: await act(pin, el.pinRemember.checked) };
    } catch (err) {
      if (err instanceof CloudError && err.status === 401 && err.error === 'pin') { note = cloudTrouble(err); continue; }
      if (err instanceof CloudError && err.status === 0 && locked) { note = "That isn't this device's PIN for them."; continue; }
      throw err;
    }
  }
}

// Opening a person whose PIN this device doesn't remember (app.js setPerson).
// Resolves true once the right PIN is typed. `locked`: nobody else can show
// meanwhile, so the pad stays until a PIN or 👋 Someone new.
export async function askToOpen(personId, { locked = false } = {}) {
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  try {
    const opened = await withPin((pin, remember) => unlock(personId, pin, remember), {
      title: `${p?.avatar ? `${p.avatar} ` : ''}${p?.name ?? 'PIN'}`,
      hint: 'Type their PIN to open them.',
      remember: true,
      locked,
    });
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

// ── a person's ☁️ sheet ──

const sheetNote = (text) => { el.status.textContent = text; };

export function openCloudSheet(personId) {
  sheetFor = personId;
  renderSheet();
  openDialog(el.sheet);
}

// What the sheet says about a person not in the cloud.
function outText(p) {
  if (!p.added) return "This person comes from the app's own list and can't go in the cloud.";
  if (isOffline(p.id)) return '📴 Offline: everything of theirs stays on this device only.';
  if (wantsCloud(p)) return "They go in the cloud on the next sync. If that doesn't happen, the cloud isn't reachable from here.";
  return `They go in the cloud once they make something: a ${KIND_EMOJI.sounds} sound, a ${KIND_EMOJI.beats} beat, a ${KIND_EMOJI.songs} song or a ${KIND_EMOJI.takes} take.`;
}

function renderSheet() {
  if (!sheetFor) return;
  const p = people({ includeHidden: true }).find((x) => x.id === sheetFor);
  if (!p) return;
  el.sheetAvatar.replaceChildren(avatarBadge(p));
  el.sheetName.textContent = p.name;
  const linked = inCloud(p.id);
  const offline = isOffline(p.id);
  el.in.hidden = !linked;
  const s = statusOf(p.id);
  sheetNote(s?.text ?? (linked ? 'In the cloud ✓' : outText(p)));
  const hasKey = !!keyOf(p.id);
  el.reopen.hidden = !linked || hasKey;
  el.shareBtn.disabled = !p.added || offline;
  el.offline.hidden = !p.added || offline;
  el.online.hidden = !offline;
  el.offlineHint.textContent = offline
    ? 'Offline: nothing of theirs goes to the cloud. Put them back and they sync again.'
    : linked
      ? 'Offline (this device only) deletes their copy in the cloud. This device keeps everything; other devices keep their own copy but stop syncing it.'
      : 'Offline (this device only) keeps them out of the cloud.';
  for (const b of el.sheet.querySelectorAll('.armed')) disarm(b);
}

async function act(fn, { done } = {}) {
  try {
    const out = await fn();
    if (done && out !== null) sheetNote(typeof done === 'function' ? done(out) : done);
    return out;
  } catch (err) {
    sheetNote(trouble(err));
    return undefined;
  } finally {
    refresh();
    renderSheet();
  }
}

async function onSheetClick(e) {
  const t = e.target.closest('button');
  if (!t || !sheetFor) return;
  const id = sheetFor;
  if (t !== el.offline) disarm(el.offline);
  if (t === el.sync) {
    if (!inCloud(id)) { await act(() => syncAll()); return; }
    await act(() => syncNow(id));
    return;
  }
  if (t === el.reopen) {
    await act(() => withPin((pin, remember) => openProfile(id, pin, remember), {
      title: 'Open again', hint: 'Type the PIN to open this profile on this device again.', remember: true,
    }), { done: 'In the cloud ✓' });
    return;
  }
  if (t === el.shareBtn) { openShareDialog(id); return; }
  if (t === el.offline) {
    if (inCloud(id) && !armed(t, 'Tap again: delete the cloud copy')) return;
    const link = linkOf(id);
    const run = (pin) => setOffline(id, true, pin);
    await act(() => (inCloud(id) && link?.pin
      ? withPin(run, { title: '📴 Offline', hint: 'Type the PIN. Their cloud copy is deleted; this device keeps everything.' })
      : run()), { done: '📴 Offline now. Their cloud copy is gone; everything is still here.' });
    return;
  }
  if (t === el.online) {
    await act(() => setOffline(id, false), { done: '☁️ Back in the cloud.' });
  }
}

// ── the PIN, in a person's profile sheet ──
// Set or change it, remove it, and 🙈 Forget on this device. It needs the
// cloud: a person not in it yet (or not opened here) gets a line saying so.

// `fresh`: the sheet just opened, so a half-done 🙈 Forget is taken back.
export function drawPin(personId, fresh = false) {
  const p = people({ includeHidden: true }).find((x) => x.id === personId);
  if (!p) return;
  const link = linkOf(personId);
  const hasKey = !!keyOf(personId);
  el.pinBtn.textContent = link?.pin ? '🔒 Change the PIN' : '🔒 Set a PIN';
  el.pinBtn.hidden = !hasKey;
  el.pinOff.hidden = !link?.pin || !hasKey;
  el.forget.hidden = !link?.pin || !hasKey;
  el.pinPartHint.textContent = !p.added ? "Someone from the app's own list can't have a PIN."
    : hasKey ? (link?.pin
      ? 'Their PIN is asked each time they are opened, unless a device remembers it, and before their name, picture or color changes.'
      : 'A PIN is asked each time this person is opened, and before their name, picture or color changes.')
      : inCloud(personId) ? '🔒 Open them on this device first (☁️ Cloud).'
        : 'A PIN comes once they are in the cloud.';
  if (fresh) disarm(el.forget);
}

// A tap in the PIN part: true when it was one of its buttons. `note` shows
// what happened; `done` redraws after.
export async function pinClick(personId, t, note) {
  if (t !== el.forget) disarm(el.forget);
  if (![el.pinBtn, el.pinOff, el.forget].includes(t)) return false;
  const run = async (fn, said) => {
    try {
      await fn();
      note(said);
    } catch (err) {
      note(trouble(err));
    } finally {
      refresh();
    }
  };
  if (t === el.pinBtn) {
    const link = linkOf(personId);
    let current = null;
    if (link?.pin) {
      current = await askPin({ title: 'The PIN now', hint: 'First, the PIN it has now.', forgot: true });
      if (current === null) return true;
    }
    const next = await askPin({ title: 'A new PIN', hint: 'Pick four numbers. They are asked each time this person is opened.' });
    if (next === null) return true;
    const again = await askPin({ title: 'Once more', hint: 'Type the new PIN again.' });
    if (again === null) return true;
    if (again !== next) { note("The two PINs didn't match. Nothing changed."); return true; }
    await run(() => setPin(personId, current, next), '🔒 PIN set. It is asked each time they are opened, unless a device remembers it.');
    return true;
  }
  if (t === el.pinOff) {
    const current = await askPin({ title: 'Remove the PIN', hint: 'Type the PIN it has now.', forgot: true });
    if (current === null) return true;
    await run(() => setPin(personId, current, null), '🔓 No PIN now.');
    return true;
  }
  if (!armed(t, 'Tap again: forget it here')) return true;
  await run(() => forgetHere(personId), '🙈 Forgotten on this device. The PIN is asked each time now.');
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
      ? await withPin((pin, remember) => openProfile(id, pin, remember), { title: 'Their PIN', hint: 'Type the PIN to open this profile on this device.', remember: true })
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
  Object.assign(el, {
    pin: $('#pin-dialog'), pinTitle: $('#pin-title'), pinHint: $('#pin-hint'), pinNote: $('#pin-note'), pinDots: $('#pin-dots'), pinKeys: $('#pin-keys'),
    pinRememberLine: $('#pin-remember-line'), pinRemember: $('#pin-remember'), pinForgot: $('#pin-forgot'), pinNew: $('#pin-new'),
    avatar: $('#avatar-dialog'), avatarGrid: $('#avatar-grid'),
    sheet: $('#cloud-dialog'), sheetAvatar: $('#cloud-avatar'), sheetName: $('#cloud-name'), status: $('#cloud-status'),
    in: $('#cloud-in'), sync: $('#cloud-sync'), shareBtn: $('#cloud-share'),
    pinBtn: $('#cloud-pin'), pinOff: $('#cloud-pin-off'), forget: $('#cloud-forget'), pinPartHint: $('#profile-pin-hint'), reopen: $('#cloud-reopen'),
    offline: $('#cloud-offline'), online: $('#cloud-online'), offlineHint: $('#cloud-offline-hint'),
    list: $('#cloud-list'), listNote: $('#cloud-list-note'), listItems: $('#cloud-list-items'),
    shareDialog: $('#share-dialog'), shareNote: $('#share-note'), shareWhat: $('#share-what'), shareItems: $('#share-items'),
    shareMine: $('#share-mine'), shareMineNote: $('#share-mine-note'),
    shareMade: $('#share-made'), shareCode: $('#share-code'), shareTitle: $('#share-title-made'), shareCopy: $('#share-copy'),
    sharedDialog: $('#shared-dialog'), sharedCode: $('#shared-code'), sharedOpen: $('#shared-open'), sharedNote: $('#shared-note'),
    sharedItems: $('#shared-items'), sharedNone: $('#shared-none'),
    browse: $('#cloud-browse'), sharedBtn: $('#shared-browse'),
  });
  for (const d of [el.pin, el.avatar, el.sheet, el.list, el.shareDialog, el.sharedDialog]) setupDialog(d);

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
  el.pin.addEventListener('close', () => { const done = pinDone; pinDone = null; done?.(null); });
  el.pinForgot.textContent = FORGOT_PIN;
  el.pinNew.addEventListener('click', () => { const done = pinDone; pinDone = null; el.pin.close(); done?.('new'); });

  avatarAll = emojiMore({
    grid: el.avatarGrid,
    onPick: chooseAvatar,
    stateOf: (p) => ({ pressed: p === avatarOf() }),
  });
  el.avatarGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-avatar]');
    if (b) chooseAvatar(b.dataset.avatar);
  });

  el.sheet.addEventListener('click', onSheetClick);
  el.sheet.addEventListener('close', () => { sheetFor = null; });
  el.shareDialog.addEventListener('click', onShareClick);
  el.sharedDialog.addEventListener('click', onSharedClick);
  el.sharedDialog.addEventListener('close', stopPreview);
  el.sharedCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.sharedOpen.click(); } });
  el.list.addEventListener('click', onListClick);
  el.browse.addEventListener('click', openCloudList);
  el.sharedBtn.addEventListener('click', openSharedDialog);
  onCloud(() => { if (sheetFor) renderSheet(); });
}

// For the People rows: what the ☁️ button says.
export function cloudLabel(p) {
  if (!p.added) return null;
  const s = statusOf(p.id);
  if (isOffline(p.id)) return { text: '📴', label: `Cloud for ${p.name}: offline, this device only` };
  if (!inCloud(p.id)) return { text: '☁️', label: `Cloud for ${p.name}: not in the cloud yet` };
  if (s?.state === 'trouble' || s?.state === 'locked') return { text: '☁️⚠️', label: `Cloud for ${p.name}: ${s.text}` };
  return { text: '☁️✓', label: `Cloud for ${p.name}: in the cloud` };
}
