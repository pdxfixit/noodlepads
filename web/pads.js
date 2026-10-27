// The pads: the people row, the grid of pads, playing and looping them, and
// Edit sounds: each pad's ✏️ and 🗑️ in its upper right, tapping pads to
// choose several (bulk.js acts on them), and dragging one to move it. A
// kid's own sounds can sit in groups of their own (groups.js).

import { state, persist, setOverride } from './state.js';
import { audio } from './audio.js';
import { people, person, clipsFor, findClip, padColor } from './board.js';
import { voiceById, amountText, chainOf, chainText, stepLook } from './voices.js';
import { announce } from './ui.js';
import { isKitClip, ownSoundsTitle, groupKit, openKitGroups, withHidden } from './model.js';
import { remember, recall } from './util.js';
import { countPlay } from './play-count.js';
import { groupOwn, cleanGroups, UNGROUPED } from './groups.js';
import { getSetting, setSetting, onSetting } from './settings.js';
import { padWidth, sliderAt } from './pad-size.js';
import { fingerTaps, isFinger } from './finger.js';
import { hasPicker, pickerButton, pickerList, instrumentBadge } from './inst-picker.js';
import { PLAYED } from './instruments.js';

const HOLD_TO_LOOP_MS = 350;  // hold a pad this long and it keeps repeating; a tap stops it

const el = {};
let openSheet = () => {};
let onPerson = () => {};
let onLooping = () => {};  // other screens that show looping sounds (DJ keys)

// ── Drawing ────────────────────────────────────────────────────────────

export function padFor(id) {
  return el.pads.querySelector(`[data-id="${CSS.escape(id)}"]`);
}

// How far through its sound a pad is, 0 to 1 (meter.js, each frame), and
// `playing` while it is part way: the skins that show playing (Switch, Lit
// pads; styles.css "Pad skins") key on it. A stop or the end sets 0, which
// clears it.
export function setProgress(id, p) {
  const pad = padFor(id);
  if (!pad) return;
  pad.style.setProperty('--progress', p);
  pad.classList.toggle('playing', p > 0 && p < 1);
}

// Whose sounds: a round button in the top right corner, like an account
// picture: the person's first letter in their color. It opens a list of
// everyone, plus 👥 People to rename, recolor, add or delete (Ben,
// 2026-10-11), the one home for managing people (people.js opens it; Ben:
// "people can leave settings"). Everyone shows, the first person on a new device included:
// they have a fun name and a picture from the start.
export function renderPeople() {
  const hadFocus = el.people.contains(document.activeElement);
  const list = people();
  el.people.hidden = list.length === 0;
  if (el.people.hidden) { el.people.replaceChildren(); return; }
  el.people.replaceChildren(makePeopleMenu(list));
  if (hadFocus) el.people.querySelector('.person-menu-btn').focus();
}

// A name's first letter (a whole emoji or accented letter), for the button.
export const initialOf = (name) => ([...(name || '?').trim()][0] || '?').toUpperCase();

function makePeopleMenu(list) {
  const current = list.find((p) => p.id === state.personId) || list[0];
  const wrap = document.createElement('div');
  wrap.className = 'person-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'person-menu-btn';
  button.style.setProperty('--c', current.color);
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'person-list');
  button.setAttribute('aria-label', `Whose sounds: ${current.name}. ${list.length} ${list.length === 1 ? 'person' : 'people'}.`);
  button.title = current.name;
  const letter = document.createElement('span');
  letter.setAttribute('aria-hidden', 'true');
  letter.textContent = current.avatar || initialOf(current.name);   // their picture, else their letter
  button.append(letter);

  const menu = document.createElement('ul');
  menu.className = 'person-list';
  menu.id = 'person-list';
  menu.hidden = true;
  for (const p of list) {
    const li = document.createElement('li');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'person-item';
    item.dataset.person = p.id;
    item.style.setProperty('--c', p.color);
    item.setAttribute('aria-current', String(p.id === state.personId));
    // 🔒: their cloud profile has a PIN, asked when they are opened (Ben, 2026-10-19).
    const lock = state.cloud.get(p.id)?.pin ? ' 🔒' : '';
    item.textContent = `${p.avatar ? `${p.avatar} ${p.name}` : p.name}${lock}`;
    li.append(item);
    menu.append(li);
  }
  // 🧸 Kids, now, for whoever is showing (app.js enterKids), and 👥 People:
  // one line under a rule, held at the menu's foot, so they never read as
  // two more people and a long list never scrolls them out of sight.
  const tools = document.createElement('li');
  tools.className = 'person-tools';
  const kids = document.createElement('button');
  kids.type = 'button';
  kids.className = 'person-item person-edit';
  kids.dataset.kidsOpen = '';
  kids.id = 'kids-open-menu';
  kids.textContent = '🧸 Kids mode';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'person-item person-edit';
  edit.dataset.peopleEdit = '';
  edit.id = 'people-open';
  edit.textContent = '👥 People';
  tools.append(kids, edit);
  menu.append(tools);
  wrap.append(button, menu);
  return wrap;
}

function setPeopleMenu(open, { focus = false } = {}) {
  const button = el.people.querySelector('.person-menu-btn');
  const menu = el.people.querySelector('.person-list');
  if (!button || !menu) return;
  menu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (open) (menu.querySelector('[aria-current="true"]') || menu.querySelector('button')).focus();
  else if (focus) button.focus();
}

// Keys in the menu: arrows, Home and End move, Esc closes. They are marked
// used so the page's own Esc and arrow keys (stop all, change person) stand down.
function peopleMenuKey(e) {
  if (e.target.closest('.person-menu-btn') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    setPeopleMenu(true);
    return;
  }
  const items = [...el.people.querySelectorAll('.person-item')];
  const i = items.indexOf(e.target);
  if (i < 0) return;
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
  if (to !== undefined) { e.preventDefault(); items[(to + items.length) % items.length].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); setPeopleMenu(false, { focus: true }); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    // On the foot's line, 🧸 Kids mode and 👥 People sit side by side.
    if (e.target.closest('.person-tools')) items[e.key === 'ArrowLeft' ? items.length - 2 : items.length - 1].focus();
  }
}

// A pad's look: color, picture, name and voice. The board and the beat maker
// both build pads with this, so a sound looks the same everywhere.
export function makePad(clip) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pad';
  b.style.setProperty('--pad', padColor(clip.color));
  if (audio.broken.has(clip.id)) b.classList.add('broken');

  const emoji = document.createElement('span');
  emoji.className = 'pad-emoji';
  emoji.textContent = clip.emoji || '🔊';
  emoji.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'pad-label';
  label.textContent = clip.label;
  b.append(emoji, label);

  // Who plays it, for an instrument's note (ADR 0030): a small picture at
  // the top right, since the note keeps its fruit on every instrument.
  const inst = instrumentBadge(clip);
  if (inst) b.append(inst.tag);
  const said = [clip.label, ...(inst ? [inst.name] : [])];

  // The voice's emoji in the corner; a chain shows each step's.
  const chain = chainOf(clip).filter((s) => s.voice !== 'normal');
  if (chain.length) {
    const one = chain.length === 1 && chain[0].type === 'voice';
    const v = voiceById(chain[0].voice);
    const tag = document.createElement('span');
    tag.className = 'pad-voice';
    tag.textContent = chain.map((s) => stepLook(s).emoji).join('');
    const amount = amountText(v.id, chain[0].amount);
    tag.title = !one ? `Voices: ${chainText(chain)}` : amount ? `${v.name} voice, ${amount}` : `${v.name} voice`;
    b.append(tag);
    said.push(tag.title);
  }
  if (said.length > 1) b.setAttribute('aria-label', said.join(', '));
  return b;
}

// The dashed "New sound" slot that ends the board (and starts a beat row
// with no sound yet).
export function makeAddPad(text) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pad pad-add';
  const plus = document.createElement('span');
  plus.className = 'pad-emoji';
  plus.setAttribute('aria-hidden', 'true');
  plus.textContent = '+';
  const label = document.createElement('span');
  label.className = 'pad-label';
  label.textContent = text;
  b.append(plus, label);
  return b;
}

export function renderPads() {
  // Redrawing replaces every pad; keep keyboard focus on the same control.
  const focused = el.pads.contains(document.activeElement) ? document.activeElement : null;
  const focusedId = focused?.closest?.('[data-cell]')?.dataset.cell ?? focused?.dataset?.id;
  const focusedTool = focused?.dataset?.edit !== undefined ? 'edit' : focused?.dataset?.x !== undefined ? 'x' : null;
  const focusedAdd = focused?.classList?.contains('pad-add');
  const focusedGroupEdit = focused?.dataset?.groupEdit;
  const focusedGroup = focused?.classList?.contains('pad-group') ? focused.dataset.group : undefined;
  const focusedPick = focused?.dataset?.instPick ?? focused?.dataset?.instGroup;

  // Two sections: this person's own sounds (recordings, uploads, their
  // boards.json sounds), in their groups when they have some, ending with
  // the New sound slot; then the shared kit in its fixed groups.
  const all = clipsFor(state.personId, { includeHidden: state.editing });
  const own = all.filter((c) => !isKitClip(c));
  const kit = all.filter(isKitClip);
  // Chosen sounds that are gone (deleted, another person showing) are let go.
  for (const id of [...chosen]) if (!state.editing || !all.some((c) => c.id === id)) chosen.delete(id);
  const pads = new Map([...own, ...kit].map((clip, i) => {
    const b = makePad(clip);
    b.dataset.id = clip.id;
    if (clip.hidden) b.classList.add('hidden-clip');
    if (audio.isLooping(clip.id)) b.classList.add('looping');
    if (i < 9 && !state.editing) {
      const key = document.createElement('span');
      key.className = 'pad-key';
      key.textContent = String(i + 1);
      key.setAttribute('aria-hidden', 'true');
      b.append(key);
    }
    if (clip.hidden) {
      const badge = document.createElement('span');
      badge.className = 'pad-badge';
      badge.textContent = 'Hidden';
      b.append(badge);
    }
    return [clip.id, state.editing ? editCell(b, clip) : playCell(b, clip)];
  }));

  // The person's own groups, in their order; a closed group shows just its
  // header. With no groups, their sounds sit straight under the heading.
  const groups = ownGroups();
  const closed = ownClosed();
  const ownParts = cleanGroups(groups)
    ? groupOwn(own, groups).map((g) => fold([
      ownGroupHeader(g, !closed.has(g.id)),
      ...(closed.has(g.id) ? [] : g.clips.map((c) => pads.get(c.id))),
    ]))
    : own.map((c) => pads.get(c.id));

  // The kit, in its groups; a closed group shows just its header. A group
  // (or the whole kit) whose sounds are all hidden has no heading outside
  // Edit sounds (groupKit leaves it out); in Edit sounds its heading stays,
  // dimmed and saying so, as the way back to its sounds.
  const open = kitOpen();
  const kitParts = groupKit(kit, state.manifest.kitGroups).map((g) => fold([
    ...kitGroupHead(g, open.has(g.id)),
    ...(open.has(g.id) ? g.clips.map((c) => pads.get(c.id)) : []),
  ]));
  el.pads.classList.toggle('choosing', state.editing && chosen.size > 0);
  el.pads.replaceChildren(
    sectionHeading(ownSoundsTitle(people(), person(state.personId))),
    ...ownParts,
    makeAddPad('New sound'),
    ...(kit.length ? [sectionHeading('Presets', kit.every((c) => c.hidden)), ...kitParts] : []),
  );
  onChosen();

  if (focusedId) {
    const cell = el.pads.querySelector(`[data-cell="${CSS.escape(focusedId)}"]`);
    const tool = focusedTool === 'edit' ? cell?.querySelector('[data-edit]') : focusedTool === 'x' ? cell?.querySelector('[data-x]') : null;
    (tool || padFor(focusedId))?.focus({ preventScroll: true });
  } else if (focusedAdd) el.pads.querySelector('.pad-add')?.focus({ preventScroll: true });
  else if (focusedGroupEdit) el.pads.querySelector(`[data-group-edit="${CSS.escape(focusedGroupEdit)}"]`)?.focus({ preventScroll: true });
  else if (focusedGroup !== undefined) el.pads.querySelector(`.pad-group[data-group="${CSS.escape(focusedGroup)}"]`)?.focus({ preventScroll: true });
  else if (focusedPick !== undefined) el.pads.querySelector(`[data-inst-pick="${CSS.escape(focusedPick)}"]`)?.focus({ preventScroll: true });
}

// ── Edit sounds: a pad with its badges ─────────────────────────────────

// In Edit sounds a pad sits in a cell with its badges (Ben, 2026-10-11:
// "selection upper left, the edit / delete upper right"). The pad itself
// chooses it (a toggle, "Select Kick"); ✏️ opens its sound sheet; 🗑️
// deletes a sound the kid made (two taps, then Undo) or hides a preset, and
// 👁 brings a hidden preset back. Every pad shows its select circle in the
// upper left from the start, ticked when chosen; tapping it chooses too
// (Ben, 2026-10-11: "if each editing sound tile is going to have the badge,
// it should have selection bubble as well (on the left)"). The circle is a
// pointer convenience: the pad is the control a keyboard and screen reader use.
function editCell(b, clip) {
  const cell = document.createElement('div');
  cell.className = 'pad-cell';
  cell.dataset.cell = clip.id;
  const on = chosen.has(clip.id);
  b.classList.toggle('chosen', on);
  b.setAttribute('aria-pressed', String(on));
  const voice = b.getAttribute('aria-label');   // "Kick, Robot voice": the voice part stays
  b.setAttribute('aria-label', `Select ${voice || clip.label}`);
  const picks = document.createElement('span');
  picks.className = 'pad-tools pad-picks';
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'pad-tool pad-check';
  check.classList.toggle('on', on);
  check.dataset.pick = '';
  check.tabIndex = -1;
  check.setAttribute('aria-hidden', 'true');
  check.textContent = on ? '✓' : '';
  check.title = on ? 'Selected' : 'Select';
  picks.append(check);
  const tools = document.createElement('span');
  tools.className = 'pad-tools';
  const edit = editBadge(clip);
  const kind = clip.source === 'user' ? 'delete' : clip.hidden ? 'show' : 'hide';
  const armed = asking === clip.id;
  const x = document.createElement('button');
  x.type = 'button';
  x.className = `pad-tool pad-x pad-x-${kind}`;
  x.classList.toggle('asking', armed);
  x.dataset.x = kind;
  x.textContent = kind === 'show' ? '👁' : '🗑️';
  x.setAttribute('aria-label', kind === 'delete' ? (armed ? `Delete ${clip.label}? Tap again to delete` : `Delete ${clip.label}`)
    : kind === 'show' ? `Bring back ${clip.label}` : `Hide ${clip.label}`);
  x.title = kind === 'delete' ? (armed ? 'Tap again to delete' : 'Delete') : kind === 'show' ? 'Bring back' : 'Hide';
  tools.append(edit, x);
  cell.append(b, picks, tools);
  return cell;
}

// While playing, a pad's cell holds just its ✏️, which shows only with a
// mouse or trackpad, on hover or when the keyboard reaches it (Ben,
// 2026-10-11: "the pad screen should provide an edit badge when hovering
// over a sound (on browser not phone obv)"). styles.css hides it on touch.
function playCell(b, clip) {
  const cell = document.createElement('div');
  cell.className = 'pad-cell';
  cell.dataset.cell = clip.id;
  const tools = document.createElement('span');
  tools.className = 'pad-tools pad-hover';
  tools.append(editBadge(clip));
  cell.append(b, tools);
  return cell;
}

function editBadge(clip) {
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'pad-tool pad-edit';
  edit.dataset.edit = '';
  edit.textContent = '✏️';
  edit.setAttribute('aria-label', `Edit ${clip.label}`);
  edit.title = 'Edit';
  return edit;
}

// ── Choosing several (bulk.js acts on them) ────────────────────────────

const chosen = new Set();   // pad ids chosen in Edit sounds, in the order they were tapped
let onChosen = () => {};    // bulk.js redraws its bar

// What bulk.js does for the pads: delete sounds (with Undo) and open a
// group's ✏️ sheet. Set by setPadHooks.
const bulk = { remove: async () => {}, editGroup: () => {} };
export function setPadHooks(hooks) {
  if (hooks.onChosen) onChosen = hooks.onChosen;
  if (hooks.remove) bulk.remove = hooks.remove;
  if (hooks.editGroup) bulk.editGroup = hooks.editGroup;
}

export const chosenIds = () => [...chosen];
export const hasChosen = () => chosen.size > 0;

export function clearChosen() {
  if (!chosen.size) return;
  chosen.clear();
  renderPads();
}

// Adds `ids` to what is chosen (Select all), after what was chosen already.
export function chooseAll(ids) {
  const before = chosen.size;
  for (const id of ids) chosen.add(id);
  if (chosen.size !== before) renderPads();
}

export function toggleChosen(id) {
  if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
  const clip = findClip(id);
  renderPads();
  if (clip) announce(`${clip.label} ${chosen.has(id) ? 'selected' : 'not selected'}. ${chosen.size} selected.`);
}

// ── A kid's own groups ─────────────────────────────────────────────────

// The person's groups, in their order: kept on their pad order record.
export const ownGroups = (personId = state.personId) => state.orders.get(personId)?.groups ?? null;

// Which own groups are closed (they start open). Per device, like the
// kit's, and held in memory too for when storage is blocked.
let closedOwn = null;
export function ownClosed() {
  if (!closedOwn) {
    try {
      const ids = JSON.parse(recall('groups-closed') || '[]');
      closedOwn = new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []);
    } catch { closedOwn = new Set(); }
  }
  return closedOwn;
}
export function toggleOwnGroup(id) {
  const closed = ownClosed();
  if (closed.has(id)) closed.delete(id); else closed.add(id);
  remember('groups-closed', JSON.stringify([...closed]));
}

// An own group's header: a kit group's, with ✏️ beside it in Edit sounds
// to rename, move or delete the group ("Not in a group" has none).
// A group, its header and its pads, in one box with a light stroke round it
// (Ben, 2026-10-18: the dark screens get "a similar contrasting stroke" to
// the light dialogs' bordered panels). Its pads lay out as the bed's do.
function fold(parts) {
  const box = document.createElement('div');
  box.className = 'pad-fold';
  box.append(...parts);
  return box;
}

function ownGroupHeader(g, isOpen) {
  const h = groupHeader(g, isOpen);
  h.dataset.own = '';
  if (!state.editing || g.id === UNGROUPED) return h;
  const row = document.createElement('div');
  row.className = 'pad-group-row';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'pad-group-edit';
  edit.dataset.groupEdit = g.id;
  edit.textContent = '✏️';
  edit.setAttribute('aria-label', `Edit group ${g.name}`);
  edit.title = 'Rename, move or delete this group';
  row.append(h, edit);
  return row;
}

// A heading across the whole pad grid. Not a pad: it takes no taps and is
// skipped by drag, swap and the number keys.
function sectionHeading(text, allHidden = false) {
  const h = document.createElement('h2');
  h.className = 'pad-section';
  h.classList.toggle('all-hidden', allHidden);
  h.textContent = text;
  return h;
}

// A pad's or cell's sound id.
const idOf = (node) => node?.dataset.cell ?? node?.dataset.id;

// Pads move only within their own section: one of the kid's own groups (or
// Not in a group), or one kit group. Moving between groups is 📁 Move to group.
const sectionOf = (clip) => {
  if (isKitClip(clip)) return `kit:${clip.group}`;
  const known = new Set((cleanGroups(ownGroups()) ?? []).map((g) => g.id));
  return `own:${known.has(clip?.group) ? clip.group : UNGROUPED}`;
};
const sameSection = (a, b) => sectionOf(findClip(idOf(a))) === sectionOf(findClip(idOf(b)));

// Which kit groups are open. Held in memory, so it works with storage
// blocked, and remembered per device in localStorage (a viewer's
// convenience, not data, so not in the database).
let openGroups = null;

export function kitOpen() {
  openGroups ??= openKitGroups(recall('kit-open'), state.manifest.kitGroups);
  return openGroups;
}

export function toggleKitGroup(id) {
  const open = kitOpen();
  if (open.has(id)) open.delete(id); else open.add(id);
  remember('kit-open', JSON.stringify([...open]));
}

// A kit group's header. Notes, Chords and Bass have who plays them beside
// it (inst-picker.js, ADR 0030), and its list under it while open. Their
// count goes after who plays them, at the line's end, so every group's
// count lines up (Ben, 2026-10-18); the header's label still says it.
function kitGroupHead(g, isOpen) {
  if (!hasPicker(g.id)) return [groupHeader(g, isOpen)];
  const row = document.createElement('div');
  row.className = 'pad-group-row pad-group-inst';
  const listOpen = pickerOpen === g.id;
  const head = groupHeader(g, isOpen);
  row.append(head, pickerButton(g, listOpen), head.querySelector('.pad-group-count'));
  return listOpen ? [row, pickerList(g)] : [row];
}

// Which group's instrument list is open (one at a time), or null.
let pickerOpen = null;

// A tap on who plays a group: opens or closes its list. A tap on an
// instrument in it picks it, closes the list and opens the group, so the
// kid sees and can play the new notes at once.
async function pickInstrument(group, inst) {
  pickerOpen = null;
  if (!kitOpen().has(group)) toggleKitGroup(group);
  await setSetting(PLAYED[group].setting, inst);   // app.js redraws what shows the presets
  renderPads();
  el.pads.querySelector(`[data-inst-pick="${CSS.escape(group)}"]`)?.focus({ preventScroll: true });
}

// A kit group's header: a full-width button that opens or closes the group.
function groupHeader(g, isOpen) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pad-group';
  b.dataset.group = g.id;
  b.setAttribute('aria-expanded', String(isOpen));
  const caret = document.createElement('span');
  caret.className = 'pad-group-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.textContent = isOpen ? '▾' : '▸';
  const label = document.createElement('span');
  label.textContent = `${g.emoji ? `${g.emoji} ` : ''}${g.name}`;
  const count = document.createElement('span');
  count.className = 'pad-group-count';
  const allHidden = g.clips.every((c) => c.hidden);
  b.classList.toggle('all-hidden', allHidden);
  count.textContent = allHidden ? `${g.clips.length} hidden` : `${g.clips.length}`;
  count.setAttribute('aria-hidden', 'true');
  // Its label, and so its tooltip: "🎮 Game: 9 sounds", not the text run
  // together ("▸🎮 Game9"; Ben, 2026-10-18).
  b.setAttribute('aria-label', `${g.emoji ? `${g.emoji} ` : ''}${g.name}: ${g.clips.length} ${g.clips.length === 1 ? 'sound' : 'sounds'}${allHidden ? ', all hidden' : ''}. Tap to ${isOpen ? 'close' : 'open'}.`);
  b.append(caret, label, count);
  return b;
}

// ── Playing ────────────────────────────────────────────────────────────

// The recorded sound whose 🗑️ is asking "Delete?", waiting for a second tap.
let asking = null;

// A tap on a pad's 🗑️ (or 👁) in Edit sounds. Deleting goes through
// bulk.js, which offers Undo.
async function cornerBadge(kind, clip) {
  if (!clip) return;
  if (kind === 'delete') {
    if (asking !== clip.id) { asking = clip.id; renderPads(); return; }
    asking = null;
    await bulk.remove([clip]);
  } else {
    await setOverride(withHidden(state.overrides.get(clip.id), clip.id, kind === 'hide'));
    announce(`${kind === 'hide' ? 'Hid' : 'Brought back'} ${clip.label}.`);
  }
  renderPads();
}

// A tap on a looping pad stops it; on any other pad, plays it once. Returns
// true when it stopped a loop.
// `ring`: 🎤 Live's 🔔 Let it ring, the sound's earlier hits ring on under this
// one. A pad always restarts its sound (Ben, 2026-10-12).
export function tapPad(clip, { ring = false } = {}) {
  if (audio.isLooping(clip.id)) {
    audio.stop(clip.id);
    return true;
  }
  audio.play(clip, { ring });
  countPlay('pads');
  return false;
}

export function flash(pad) {
  pad.classList.add('hit');
  setTimeout(() => pad.classList.remove('hit'), 90);
}

// ── Reordering (drag pads in edit mode) ────────────────────────────────

// Mouse drags start after a small move. Touch needs a short hold first, so a
// swipe over the pads still scrolls the page.
const DRAG_SLOP = 6;
const TOUCH_HOLD_MS = 220;

const drag = {
  pad: null,
  pointerId: null,
  x0: 0, y0: 0,       // where the pointer went down
  grabX: 0, grabY: 0, // pointer offset inside the pad
  active: false,
  hold: 0,
  suppressClick: false,
};

// In Edit sounds a pad is dragged with its badges: its cell moves.
function dragDown(e) {
  if (!state.editing || e.button !== 0 || drag.pad) return;
  if (e.target.closest('.pad-tools')) return;   // a badge is a tap, not a drag
  const pad = e.target.closest('.pad[data-id]');
  if (!pad) return;
  const moving = pad.closest('.pad-cell') ?? pad;
  const r = moving.getBoundingClientRect();
  Object.assign(drag, {
    pad: moving, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY,
    grabX: e.clientX - r.left, grabY: e.clientY - r.top, active: false,
  });
  if (e.pointerType === 'touch') drag.hold = setTimeout(() => startDrag(e), TOUCH_HOLD_MS);
}

function startDrag(e) {
  clearTimeout(drag.hold);
  drag.active = true;
  drag.pad.classList.add('dragging');
  document.body.classList.add('reordering');
  navigator.vibrate?.(15);
  followPointer(e.clientX, e.clientY);
}

// The moving part under a point: a cell in Edit sounds.
const movingAt = (x, y) => {
  const hit = document.elementFromPoint(x, y);
  return hit?.closest('.pad-cell') ?? hit?.closest('.pad[data-id]');
};

function dragMove(e) {
  if (!drag.pad || e.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > DRAG_SLOP;
    if (!moved) return;
    if (e.pointerType === 'touch') { cancelDrag(); return; }  // a swipe, not a hold
    startDrag(e);
  }
  e.preventDefault();
  const over = movingAt(e.clientX, e.clientY);
  if (over && over !== drag.pad && sameSection(over, drag.pad)) {
    const all = [...drag.pad.parentElement.children];
    const before = all.indexOf(over) < all.indexOf(drag.pad);
    slide(() => over.insertAdjacentElement(before ? 'beforebegin' : 'afterend', drag.pad));
  }
  followPointer(e.clientX, e.clientY);
}

// Keeps the dragged pad under the finger, wherever its grid slot now is.
function followPointer(x, y) {
  const pad = drag.pad;
  pad.style.translate = 'none';
  const r = pad.getBoundingClientRect();
  pad.style.translate = `${x - drag.grabX - r.left}px ${y - drag.grabY - r.top}px`;
}

// Moves the other pads to their new slots smoothly (FLIP). Uses the
// `translate` property so it never fights the edit-mode wobble's transform.
function slide(change) {
  const others = [...drag.pad.parentElement.children].filter((p) => p !== drag.pad);
  const before = new Map(others.map((p) => [p, p.getBoundingClientRect()]));
  change();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const p of others) {
    const a = before.get(p);
    const b = p.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (!dx && !dy) continue;
    p.style.transition = 'none';
    p.style.translate = `${dx}px ${dy}px`;
    requestAnimationFrame(() => {
      p.style.transition = 'translate 160ms ease-out';
      p.style.translate = '0 0';
    });
  }
}

async function dragUp(e) {
  if (!drag.pad || e.pointerId !== drag.pointerId) return;
  const wasActive = drag.active;
  cancelDrag();
  if (!wasActive) return;
  drag.suppressClick = true;  // the click that follows a drop must not choose the pad
  setTimeout(() => { drag.suppressClick = false; }, 0);
  await saveOrder();
}

// Saves the pads' on-screen order as this person's order. Pads not on
// screen (in a closed group, hidden outside Edit sounds) keep their places:
// the ones showing are put in the slots the showing ones had.
async function saveOrder() {
  const shown = [...el.pads.querySelectorAll('.pad[data-id]')].map((p) => p.dataset.id);
  const order = { ...state.orders.get(state.personId), personId: state.personId, ids: mergeOrder(clipsFor(state.personId, { includeHidden: true }).map((c) => c.id), shown) };
  state.orders.set(order.personId, order);
  await persist('orders', order);
}

// `all` in board order with the ids in `shown` put in the order `shown` has,
// each in a slot one of them had. Pure.
export function mergeOrder(all, shown) {
  const showing = new Set(shown);
  const next = shown[Symbol.iterator]();
  return [...all.map((id) => (showing.has(id) ? next.next().value : id)), ...shown.filter((id) => !all.includes(id))];
}

// From the keyboard in Edit sounds, Alt+← and Alt+→ move the focused pad one
// place within its section (a drag's keyboard twin).
async function nudge(pad, by) {
  const cell = pad.closest('.pad-cell') ?? pad;
  const all = [...cell.parentElement.children];
  let i = all.indexOf(cell) + by;
  while (all[i] && !all[i].classList.contains('pad-cell')) i += by;
  const other = all[i];
  const clip = findClip(pad.dataset.id);
  if (!other || !sameSection(other, cell)) { announce(`${clip?.label} is at the ${by < 0 ? 'start' : 'end'} of its group.`); return; }
  other.insertAdjacentElement(by < 0 ? 'beforebegin' : 'afterend', cell);
  pad.focus({ preventScroll: true });
  await saveOrder();
  announce(`${clip?.label} moved ${by < 0 ? 'earlier' : 'later'}.`);
}

export function cancelDrag() {
  clearTimeout(drag.hold);
  if (drag.pad) {
    drag.pad.classList.remove('dragging');
    drag.pad.style.translate = '';
  }
  document.body.classList.remove('reordering');
  drag.pad = null;
  drag.pointerId = null;
  drag.active = false;
}

// ── Pad size ───────────────────────────────────────────────────────────

// One smooth slider (Ben, 2026-10-11: "allow the user to see the transition
// of 'any' size they want; but keep the extreme ends within reasonableness").
// Its ends are this screen's smallest and biggest pads (pad-size.js): the
// bed is measured, so the far right is one whole-width column on a phone and
// the largest sensible pad on a wide screen, and every position moves them.
// The slider runs 0 to 100; the size kept is that over 100, or 'auto' (the
// screen's own size) until the person moves it. pads.js sets `--pad-w`;
// styles.css puts as many pads of that width on a line as fit.

// The pad bed's inner width and the gap between pads, as drawn now. Zero
// before the page has a layout (and in the tests): sizes wait for one.
function bedSize() {
  if (typeof getComputedStyle !== 'function' || !(el.pads.clientWidth > 0)) return { bed: 0, gap: 0 };
  const css = getComputedStyle(el.pads);
  const bed = el.pads.clientWidth - (parseFloat(css.paddingLeft) || 0) - (parseFloat(css.paddingRight) || 0);
  return { bed, gap: parseFloat(css.columnGap) || 0 };
}

const sizeText = (size, pos) => (size === 'auto' ? 'Medium' : pos === 0 ? 'Smallest' : pos === 100 ? 'Biggest' : `${pos}%`);
let sliding = null;   // the size under the finger while the slider moves, before it is kept

// Puts the grid and the slider in step with a size ('auto' or 0 to 1).
function showScale(size, { moveSlider = true } = {}) {
  const { bed, gap } = bedSize();
  const pos = bed > 0 ? sliderAt(bed, gap, size) : (size === 'auto' ? 50 : Math.round(size * 100));
  if (bed > 0) {
    const w = padWidth(bed, gap, size);
    el.pads.style.setProperty('--pad-w', `${(w - 0.1).toFixed(2)}px`);   // the 0.1 keeps rounding from dropping a column
    el.pads.style.setProperty('--pad-scale', (w / 150).toFixed(3));        // the pads' padding follows their size
  }
  if (moveSlider) el.sizeSlider.value = String(pos);
  el.sizeSlider.setAttribute('aria-valuetext', sizeText(size, pos));
}
const showSize = (size = getSetting('padSize')) => showScale(size);

function initSize() {
  const input = el.sizeSlider;
  const picked = () => Number(input.value) / 100;
  // The grid follows the slider as it moves; the choice is kept when it lets go.
  input.addEventListener('input', () => { sliding = picked(); showScale(sliding, { moveSlider: false }); });
  input.addEventListener('change', () => {
    sliding = null;
    setSetting('padSize', picked()).catch((err) => console.error('Saving the pad size failed:', err));
  });
  onSetting('padSize', showSize);   // a loaded backup brings its own
  // A new width (a turned phone, a resized window) has new ends: the same
  // kept size is redrawn for it.
  // (While the slider moves, the size under the finger is the one redrawn.)
  const redraw = () => (sliding === null ? showSize() : showScale(sliding, { moveSlider: false }));
  if (typeof ResizeObserver === 'function') new ResizeObserver(redraw).observe(el.pads);
  globalThis.addEventListener?.('resize', redraw);
  showSize();
}

// ── Events ─────────────────────────────────────────────────────────────

// openSheet(mode, clip?, {returnToPad?}) opens the new/edit sound sheet;
// onPerson(id) switches to a person.
export function initPads(hooks) {
  openSheet = hooks.openSheet;
  onPerson = hooks.onPerson;
  if (hooks.onLooping) onLooping = hooks.onLooping;
  Object.assign(el, {
    people: document.querySelector('#people'),
    pads: document.querySelector('#pads'),
    sizeSlider: document.querySelector('#pads-size-slider'),
  });
  initSize();

  // Group headers open and close their group (a kid's own, or the kit's);
  // focus stays on the header. ✏️ beside an own group's header edits it.
  el.pads.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-group-edit]');
    if (edit) { bulk.editGroup(edit.dataset.groupEdit); return; }
    const pick = e.target.closest('[data-inst-pick]');
    if (pick) {
      pickerOpen = pickerOpen === pick.dataset.instPick ? null : pick.dataset.instPick;
      renderPads();
      return;
    }
    const choice = e.target.closest('[data-inst]');
    if (choice) { pickInstrument(choice.dataset.instGroup, choice.dataset.inst); return; }
    const header = e.target.closest('.pad-group');
    if (!header) return;
    if (header.dataset.own !== undefined) toggleOwnGroup(header.dataset.group);
    else toggleKitGroup(header.dataset.group);
    const own = header.dataset.own !== undefined;
    renderPads();
    for (const h of el.pads.querySelectorAll('.pad-group')) {
      if (h.dataset.group === header.dataset.group && (h.dataset.own !== undefined) === own) h.focus({ preventScroll: true });
    }
  });

  audio.on.progress = setProgress;
  audio.on.looping = (id, on) => {
    padFor(id)?.classList.toggle('looping', on);
    onLooping(id, on);
  };
  audio.on.broken = (id) => padFor(id)?.classList.add('broken');

  // A mouse plays a pad on pointerdown (quicker than click). A finger plays
  // it on the lift, and only if it stayed put, so a scroll that starts on a
  // pad never sounds it (finger.js). Keyboard presses arrive as clicks with
  // detail 0; in edit mode, a click opens the editor instead.
  // Holding a pad switches its loop on, and it keeps going after the finger
  // lets go, so several can loop at once. Tapping a looping pad stops it.
  // Shift does what a hold does: Shift-click, Shift+Enter or Shift+Space
  // starts the loop at once (and stops a looping pad, as a tap does).
  const holds = new Map();  // mouse pointer id -> timer that turns the loop on
  const fingers = fingerTaps({
    onTap: (clip) => tapPad(clip),
    onHold: (clip) => audio.loop(clip),
    holdMs: HOLD_TO_LOOP_MS,
  });
  el.pads.addEventListener('pointerdown', (e) => {
    if (state.editing || e.button !== 0) return;
    const pad = e.target.closest('.pad[data-id]');
    if (!pad) return;
    const clip = findClip(pad.dataset.id);
    if (!clip) return;
    if (isFinger(e)) { fingers.down(e, clip, { hold: !audio.isLooping(clip.id) }); return; }
    if (e.shiftKey && !audio.isLooping(clip.id)) { audio.loop(clip); return; }
    if (tapPad(clip)) return;
    holds.set(e.pointerId, setTimeout(() => audio.loop(clip), HOLD_TO_LOOP_MS));
  });
  // A mouse let go before the hold time is just a click.
  const release = (e) => {
    clearTimeout(holds.get(e.pointerId));
    holds.delete(e.pointerId);
  };
  window.addEventListener('pointermove', (e) => fingers.move(e));
  window.addEventListener('pointerup', (e) => { release(e); fingers.up(e); });
  // The browser cancels a touch it takes for a scroll: nothing plays.
  window.addEventListener('pointercancel', (e) => { release(e); fingers.cancel(e); });
  el.pads.addEventListener('pointerdown', dragDown);
  window.addEventListener('pointermove', dragMove);
  window.addEventListener('pointerup', dragUp);
  window.addEventListener('pointercancel', () => cancelDrag());
  // Once a touch drag has started, the page must not scroll under it.
  window.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
  el.pads.addEventListener('click', (e) => {
    if (drag.suppressClick) return;
    // A pad's ✏️ opens its sheet (while playing too, from a hover); in Edit
    // sounds 🗑️ (or 👁) deletes, hides or brings back.
    const cell = e.target.closest('[data-cell]');
    if (cell && e.target.closest('[data-edit]')) {
      if (asking) { asking = null; renderPads(); }
      const clip = findClip(cell.dataset.cell);
      if (clip) openSheet('edit', clip, { returnToPad: clip.id });
      return;
    }
    if (cell && state.editing && e.target.closest('[data-pick]')) {
      if (asking) asking = null;
      toggleChosen(cell.dataset.cell);
      padFor(cell.dataset.cell)?.focus({ preventScroll: true });
      return;
    }
    const x = cell && e.target.closest('[data-x]');
    if (x) { cornerBadge(x.dataset.x, findClip(cell.dataset.cell)); return; }
    const pad = e.target.closest('.pad');
    if (!pad) return;
    if (asking) { asking = null; renderPads(); }
    if (pad.classList.contains('pad-add')) { openSheet('new', null, { returnToPad: null }); return; }
    const clip = findClip(pad.dataset.id);
    if (!clip) return;
    if (state.editing) {
      toggleChosen(clip.id);
      padFor(clip.id)?.focus({ preventScroll: true });
    } else if (e.detail === 0) {
      flash(pad);
      if (e.shiftKey && !audio.isLooping(clip.id)) audio.loop(clip); else tapPad(clip);
    }
  });
  el.pads.addEventListener('contextmenu', (e) => { if (e.target.closest('.pad')) e.preventDefault(); });
  // Esc in an open instrument list closes it, back on its button.
  el.pads.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !pickerOpen || !e.target.closest?.('.inst-list, [data-inst-pick]')) return;
    e.preventDefault();
    e.stopPropagation();
    const group = pickerOpen;
    pickerOpen = null;
    renderPads();
    el.pads.querySelector(`[data-inst-pick="${CSS.escape(group)}"]`)?.focus({ preventScroll: true });
  });
  // Alt+← / Alt+→ on a pad in Edit sounds moves it (the page's own arrows
  // change person; it leaves Alt alone).
  el.pads.addEventListener('keydown', (e) => {
    if (!state.editing || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const pad = e.target.closest?.('.pad[data-id]');
    if (!pad) return;
    e.preventDefault();
    nudge(pad, e.key === 'ArrowLeft' ? -1 : 1);
  });

  el.people.addEventListener('click', (e) => {
    if (e.target.closest('.person-menu-btn')) {
      setPeopleMenu(el.people.querySelector('.person-list').hidden);
      return;
    }
    if (e.target.closest('[data-people-edit], [data-kids-open]')) {
      setPeopleMenu(false);   // people.js opens the People editor; app.js shows Kids
      return;
    }
    const b = e.target.closest('[data-person]');
    if (!b) return;
    const inMenu = b.classList.contains('person-item');
    onPerson(b.dataset.person);
    // Choosing from the menu redraws it closed, with focus back on its button.
    if (inMenu) setPeopleMenu(false, { focus: true });
  });
  el.people.addEventListener('keydown', peopleMenuKey);
  // Tabbing out of the menu, or pressing anywhere else, closes it.
  el.people.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !el.people.contains(e.relatedTarget)) setPeopleMenu(false);
  });
  document.addEventListener('pointerdown', (e) => { if (!el.people.contains(e.target)) setPeopleMenu(false); });
}
