// ✏️ Edit sounds with several sounds chosen (Ben, 2026-10-11, Google Photos
// style): the bar that says "2 selected · Clear" and acts on all of them —
// 📁 Move to group, 🎨 Color · picture, 🪄 Voice, 🔗 Share (one code) and
// 🗑️ Delete (two taps, then Undo) — plus Select all (every sound the kid
// made), a group's own ✏️ sheet (rename, move, delete, select its sounds)
// and the Undo bar after a delete. pads.js draws the pads
// and keeps what is chosen; groups.js is the groups' logic.
//
// Presets can be chosen too: Color · picture, Voice and Delete (which hides
// them, as their 🗑️ does) work on them; Move and Share are for sounds the
// kid made, and say so (provisional, docs/questions.md).

import { state, persist, setOverride, deleteUserClip } from './state.js';
import { audio } from './audio.js';
import { currentPerson, clipsFor, findClip, colorName } from './board.js';
import { overrideFor, withHidden, withBulkChanges } from './model.js';
import { applyChain, chainOf } from './voices.js';
import { NO_TWEAKS, MORE_KNOBS, fullTweaks, tweakText, tweakByKey, layerRows, addableKnobs, ADDED_AT } from './tweaks.js';
import { renderLayers, renderLayerPalette } from './shape.js';
import { PRESETS, stackAll, matches, voiceLine, cleanMyVoice, myVoicesFor } from './voice-knobs.js';
import { renderPads, chosenIds, clearChosen, chooseAll, setPadHooks, ownGroups, ownClosed, toggleOwnGroup } from './pads.js';
import { EMOJI } from './sheet.js';
import { emojiMore, withCurrent } from './emoji-more.js';
import { openDialog, setupDialog } from './dialogs.js';
import { announce } from './ui.js';
import { count } from './util.js';
import { cleanGroups, pruneGroups, moveGroup, groupName, newGroupId, MAX_GROUP_NAME } from './groups.js';

const el = {};
let share = async () => {};   // cloud-ui.js shareSounds
let deleteArmed = '';         // the chosen ids 🗑️ Delete is asking about, waiting for a second tap

const make = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
};
const button = (className, text, data = {}) => {
  const b = make('button', className, text);
  b.type = 'button';
  Object.assign(b.dataset, data);
  return b;
};

// The chosen sounds as they are now, in the order they were chosen.
const chosenClips = () => chosenIds().map(findClip).filter(Boolean);
const ownOnly = (clips) => clips.every((c) => c.source === 'user');
const sounds = (n) => count(n, 'sound');
// Every sound this person made, in pad order: what Select all chooses
// (provisional Q50). Presets are left out, so Move and Share stay open.
const ownSounds = () => clipsFor(state.personId, { includeHidden: true }).filter((c) => c.source === 'user');

// ── The bar ────────────────────────────────────────────────────────────

function drawBar() {
  const clips = state.editing ? chosenClips() : [];
  const on = clips.length > 0;
  el.bar.hidden = !on;
  document.body.classList.toggle('choosing', on);
  if (!on) { deleteArmed = ''; return; }
  el.undo.hidden = true;   // the bar takes its place
  el.count.textContent = `${clips.length} selected`;
  const picked = new Set(chosenIds());
  const own = ownSounds();
  el.all.hidden = own.every((c) => picked.has(c.id));
  el.all.setAttribute('aria-label', `Select all ${sounds(own.length)} you made`);
  const presets = clips.filter((c) => c.source !== 'user').length;
  for (const what of ['move', 'share']) el.bar.querySelector(`[data-bulk="${what}"]`).disabled = presets > 0;
  el.why.hidden = presets === 0;
  el.why.textContent = 'Presets keep their own groups and can’t be shared.';
  const key = chosenIds().join(',');
  if (deleteArmed !== key) deleteArmed = '';
  const del = el.bar.querySelector('[data-bulk="delete"]');
  del.classList.toggle('armed', !!deleteArmed);
  del.querySelector('.chosen-word').textContent = deleteArmed ? `Delete ${clips.length}?` : 'Delete';
  del.setAttribute('aria-label', deleteArmed ? `Delete ${sounds(clips.length)}? Tap again to delete` : `Delete ${sounds(clips.length)}`);
}

async function onBar(e) {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b === el.clear) { clearChosen(); announce('Nothing selected.'); return; }
  if (b === el.all) { chooseAll(ownSounds().map((c) => c.id)); announce(`${chosenIds().length} selected.`); return; }
  const what = b.dataset.bulk;
  if (what !== 'delete' && deleteArmed) { deleteArmed = ''; drawBar(); }
  if (what === 'move') openMove();
  else if (what === 'look') openLook();
  else if (what === 'voice') openVoice();
  else if (what === 'share') share(state.personId, chosenIds());
  else if (what === 'delete') {
    if (!deleteArmed) { deleteArmed = chosenIds().join(','); drawBar(); return; }
    deleteArmed = '';
    await removeSounds(chosenClips());
  }
}

// ── Changing sounds ────────────────────────────────────────────────────

// Puts `changes` ({emoji?, color?, voice?, tweaks?}) on each sound: a
// recorded one's own record, a preset's stored edit (only what differs from
// boards.json, as the sound sheet stores it).
async function changeSounds(clips, changes) {
  const p = currentPerson();
  for (const clip of clips) {
    if (clip.source === 'user') {
      const i = state.userClips.findIndex((c) => c.id === clip.id);
      if (i < 0) continue;
      state.userClips[i] = withBulkChanges(state.userClips[i], changes);
      await persist('clips', state.userClips[i]);
    } else {
      const base = p.clips.find((c) => c.id === clip.id);
      if (!base) continue;
      const now = withBulkChanges(clip, changes);
      await setOverride(overrideFor(base, state.overrides.get(base.id), {
        label: now.label, emoji: now.emoji, color: colorName(now.color), voice: now.voice, amount: now.amount,
        fx: now.fx, tweaks: now.tweaks, trim: now.trim, edits: now.edits, fade: now.fade, root: now.root,
      }, state.manifest.palette));
    }
    const after = findClip(clip.id);
    if (after) { audio.dropRendered(after.id, audio.key(after)); audio.load(after).catch(() => {}); }
  }
  renderPads();
}

// The person's pad order record, with `groups` (empty groups dropped).
async function saveGroups(groups) {
  const pid = state.personId;
  const own = state.userClips.filter((c) => c.personId === pid);
  const kept = pruneGroups(groups, own);
  const next = { ...(state.orders.get(pid) ?? { personId: pid, ids: clipsFor(pid, { includeHidden: true }).map((c) => c.id) }) };
  if (kept.length) next.groups = kept; else delete next.groups;
  state.orders.set(pid, next);
  await persist('orders', next);
}

// Deletes sounds the kid made and hides presets, then offers Undo, which
// puts back the records, the presets' edits and the groups as they were.
async function removeSounds(clips) {
  const pid = state.personId;
  const records = clips.filter((c) => c.source === 'user').map((c) => state.userClips.find((r) => r.id === c.id)).filter(Boolean);
  const presets = clips.filter((c) => c.source !== 'user' && !c.hidden);
  const edits = presets.map((c) => [c.id, state.overrides.get(c.id) ?? null]);
  const order = state.orders.get(pid);
  const orderBefore = order ? { ...order, ids: [...order.ids], ...(order.groups ? { groups: order.groups.map((g) => ({ ...g })) } : {}) } : null;
  for (const r of records) {
    audio.forget(r.id);
    await deleteUserClip(r);
  }
  for (const c of presets) await setOverride(withHidden(state.overrides.get(c.id), c.id, true));
  if (order?.groups) await saveGroups(order.groups);
  clearChosen();
  renderPads();
  const said = [records.length && (records.length === 1 ? `Deleted ${records[0].label}` : `Deleted ${sounds(records.length)}`),
    presets.length && (presets.length === 1 ? `hid ${presets[0].label}` : `hid ${count(presets.length, 'preset')}`)].filter(Boolean).join(', ');
  const text = `${said[0].toUpperCase()}${said.slice(1)}.`;
  announce(text);
  showUndo(text, async () => {
    for (const r of records) {
      if (!state.userClips.some((c) => c.id === r.id)) state.userClips.push(r);
      await persist('clips', r);
    }
    for (const [id, before] of edits) await setOverride(before ?? { id });
    if (orderBefore && state.personId === pid) { state.orders.set(pid, orderBefore); await persist('orders', orderBefore); }
    renderPads();
    announce('Back again.');
  });
}

// ── Undo ───────────────────────────────────────────────────────────────

let undoing = null;
function showUndo(text, fn) {
  undoing = fn;
  el.undoText.textContent = text;
  el.undo.hidden = false;
}
function hideUndo() {
  undoing = null;
  el.undo.hidden = true;
}

// ── The sheets: one dialog, drawn for each action ──────────────────────

function openBulk(title, parts, focus) {
  el.title.textContent = title;
  el.body.replaceChildren(...parts);
  openDialog(el.dialog, { focus: focus ?? el.body.querySelector('button, input'), returnTo: () => el.bar.querySelector('[data-bulk]') });
}

const close = () => { if (el.dialog.open) el.dialog.close(); };

// 📁 Move to group: the person's groups, Not in a group, or a new one.
function openMove() {
  const clips = chosenClips();
  if (!clips.length || !ownOnly(clips)) return;
  const groups = cleanGroups(ownGroups()) ?? [];
  const list = make('ul', 'cl-list bulk-groups');
  const pick = (text, id, pressed) => {
    const li = make('li');
    const b = button('cl-pick', text, { moveTo: id });
    b.setAttribute('aria-pressed', String(pressed));
    li.append(b);
    return li;
  };
  for (const g of groups) list.append(pick(`📁 ${g.name}`, g.id, clips.every((c) => c.group === g.id)));
  const known = new Set(groups.map((g) => g.id));
  list.append(pick('Not in a group', '', clips.every((c) => !known.has(c.group))));
  const form = make('form', 'bulk-new');
  const name = make('input', 'set-field');
  Object.assign(name, { id: 'bulk-group-name', maxLength: MAX_GROUP_NAME, autocomplete: 'off', placeholder: 'New group’s name' });
  name.setAttribute('aria-label', 'New group’s name');
  const add = button('chip-dark', '➕ New group');
  add.type = 'submit';
  form.append(name, add);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const typed = groupName(name.value);
    if (!typed) { note.textContent = 'Type a name for the new group first.'; name.focus(); return; }
    moveTo(null, typed);
  });
  const note = make('p', 'set-note');
  note.setAttribute('role', 'status');
  const hint = make('p', 'field-hint', `Move ${clips.length === 1 ? clips[0].label : sounds(clips.length)} into a group, or make a new one.`);
  openBulk('📁 Move to group', [hint, list, form, note]);
}

async function moveTo(groupId, newName) {
  const clips = chosenClips().filter((c) => c.source === 'user');
  let groups = cleanGroups(ownGroups()) ?? [];
  if (newName) {
    groupId = newGroupId(groups.map((g) => g.id));
    groups = [...groups, { id: groupId, name: newName }];
  }
  for (const clip of clips) {
    const rec = state.userClips.find((c) => c.id === clip.id);
    if (!rec) continue;
    if (groupId) rec.group = groupId; else delete rec.group;
    await persist('clips', rec);
  }
  await saveGroups(groups);
  if (groupId && ownClosed().has(groupId)) toggleOwnGroup(groupId);   // open, so the sounds can be seen landing
  close();
  const where = groupId ? groups.find((g) => g.id === groupId)?.name : 'Not in a group';
  clearChosen();
  renderPads();
  announce(`Moved ${clips.length === 1 ? clips[0].label : sounds(clips.length)} to ${where}.`);
}

// 🎨 Color · picture: one color and/or one picture for them all.
function openLook() {
  const clips = chosenClips();
  if (!clips.length) return;
  const look = { color: null, emoji: null };
  const swatches = make('div', 'swatches');
  swatches.replaceChildren(...Object.entries(state.manifest.palette).map(([name, hex]) => {
    const b = button('', '', { color: name });
    b.style.setProperty('--c', hex);
    b.setAttribute('aria-label', name[0].toUpperCase() + name.slice(1));
    b.setAttribute('aria-pressed', 'false');
    return b;
  }));
  const field = (legend, ...kids) => {
    const f = make('fieldset', 'field');
    f.append(make('legend', 'field-name', legend), ...kids);
    return f;
  };
  const grid = make('div', 'emoji-grid');
  const pictures = field('Picture', grid);   // in place first: "…" puts its full list after the grid
  let more = null;
  const drawGrid = () => {
    grid.replaceChildren(...withCurrent(EMOJI, look.emoji ?? '').filter(Boolean).map((e) => {
      const b = button('', e, { emoji: e });
      b.setAttribute('aria-pressed', String(e === look.emoji));
      return b;
    }), more.button);
  };
  more = emojiMore({
    grid,
    stateOf: (e) => ({ pressed: e === look.emoji }),
    onPick: (e) => { look.emoji = e; drawGrid(); more.refresh(); ready(); },
  });
  drawGrid();
  const apply = button('chip-dark bulk-apply', '');
  const ready = () => {
    apply.disabled = !look.color && !look.emoji;
    apply.textContent = `✓ Use for ${clips.length === 1 ? clips[0].label : sounds(clips.length)}`;
  };
  ready();
  swatches.addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    look.color = look.color === b.dataset.color ? null : b.dataset.color;   // a second tap keeps each one's own
    for (const x of swatches.children) x.setAttribute('aria-pressed', String(x.dataset.color === look.color));
    ready();
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]');
    if (!b || !grid.contains(b) || b.closest('.emoji-all')) return;
    look.emoji = look.emoji === b.dataset.emoji ? null : b.dataset.emoji;
    drawGrid();
    ready();
  });
  apply.addEventListener('click', async () => {
    if (apply.disabled) return;
    await changeSounds(clips, { ...(look.color ? { color: look.color } : {}), ...(look.emoji ? { emoji: look.emoji } : {}) });
    close();
    announce(`Changed ${sounds(clips.length)}.`);
  });
  const hint = make('p', 'field-hint', 'Pick a color, a picture or both. What you leave alone stays as each sound has it.');
  openBulk('🎨 Color · picture', [hint, field('Color', swatches), pictures, apply]);
}

// 🪄 Voice: one set of knobs for them all (voices are knob settings,
// voice-knobs.js). The voice chips are the sound sheet's, emoji only: a tap
// moves the knobs, a second adds on top (the last tap wins a shared knob),
// a lit one taps off; moving a knob makes it your own. Applying puts the
// knobs on every chosen sound in place of its knobs and its old voices;
// Shape it steps stay.
function openVoice() {
  const clips = chosenClips();
  if (!clips.length) return;
  const pick = { knobs: { ...NO_TWEAKS }, lit: [], touched: false };
  const mine = myVoicesFor(state.myVoices, currentPerson().id).map(cleanMyVoice).filter(Boolean)
    .map((v) => ({ id: `my:${v.id}`, name: v.name, emoji: v.emoji, knobs: v.knobs }));
  const choices = [...PRESETS, ...mine];
  const voices = make('div', 'voices voice-chips');
  voices.replaceChildren(...choices.map((v) => {
    const b = button('voice-chip', '', v.id.startsWith('my:') ? { my: v.id.slice(3) } : { preset: v.id });
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', v.name || v.emoji);
    b.title = v.name || v.emoji;
    const e = make('span', 'voice-emoji', v.emoji || '⭐');
    e.setAttribute('aria-hidden', 'true');
    b.append(e);
    if (v.special) { const s = make('span', 'voice-special', '✦'); s.setAttribute('aria-hidden', 'true'); b.append(s); }
    if (v.id.startsWith('my:') && v.name) { b.classList.add('my-voice'); b.append(make('span', 'voice-name', v.name)); }
    return b;
  }));
  const line = make('p', 'voice-line', voiceLine([], NO_TWEAKS));
  // The knobs as the sound sheet's Layers rows (shape.js), without 🔈: one
  // row per knob in play order, the main five always, the others from + Add
  // a layer or a voice that uses them, ✕ (two taps) to take one out.
  const list = make('ol', 'layer-rows');
  const add = button('chain-tool', '+ Add a layer');
  add.setAttribute('aria-expanded', 'false');
  const addLine = make('div', 'chain-tools layer-add-line');
  addLine.append(add);
  const palette = make('div', 'layer-palette');
  palette.hidden = true;
  const shown = new Set();
  let armed = null;
  let armTimer = 0;
  const apply = button('chip-dark bulk-apply', '');
  const draw = () => {
    for (const k of MORE_KNOBS) if (pick.knobs[k] !== NO_TWEAKS[k]) shown.add(k);
    renderLayers(list, layerRows(pick.knobs, { shown: [...shown] }), { tweaks: pick.knobs, muted: new Set(), chain: [], ready: true, armed, mutes: false });
    const more = addableKnobs(pick.knobs, [...shown]);
    renderLayerPalette(palette, { knobs: more, steps: false });
    add.disabled = !more.length;
    if (add.disabled) { palette.hidden = true; add.setAttribute('aria-expanded', 'false'); }
    const ids = new Set(pick.lit.map((p) => p.id));
    for (const b of voices.children) b.setAttribute('aria-pressed', String(ids.has(b.dataset.preset ?? `my:${b.dataset.my}`)));
    line.textContent = voiceLine(pick.lit, pick.knobs);
    apply.disabled = !pick.touched;
    apply.textContent = `✓ Use for ${clips.length === 1 ? clips[0].label : sounds(clips.length)}`;
  };
  draw();
  // A pick plays the first chosen sound with it, as it would be.
  const hear = async () => {
    const clip = clips[0];
    try {
      audio.wake();
      const after = withBulkChanges(clip, { knobs: pick.knobs });
      audio.start('preview', await applyChain(await audio.original(clip), chainOf(after), after.tweaks));
    } catch (err) {
      console.error('The voice did not render:', err);
    }
  };
  voices.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const voice = choices.find((v) => v.id === (b.dataset.preset ?? `my:${b.dataset.my}`));
    if (!voice) return;
    const on = pick.lit.some((p) => p.id === voice.id);
    pick.lit = on ? pick.lit.filter((p) => p.id !== voice.id) : [...pick.lit, voice];
    pick.knobs = stackAll(NO_TWEAKS, pick.lit);
    pick.lit = pick.lit.filter((p) => matches(pick.knobs, p.knobs));
    pick.touched = true;
    shown.clear();   // the knobs jumped: only the ones on show (Q42b)
    draw();
    hear();
  });
  const byHand = (key, value) => {
    pick.knobs = fullTweaks({ ...pick.knobs, [key]: value });
    if (key !== 'special') shown.add(key);
    pick.lit = [];
    pick.touched = true;
  };
  const value = (input) => (tweakByKey(input.dataset.layerKnob)?.flag ? Number(input.value) === 1 : Number(input.value));
  list.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-layer-knob]');
    if (!input) return;
    byHand(input.dataset.layerKnob, value(input));
    if (!tweakByKey(input.dataset.layerKnob).flag) input.parentElement.querySelector('output').textContent = tweakText(input.dataset.layerKnob, pick.knobs[input.dataset.layerKnob]);
  });
  list.addEventListener('change', (e) => { if (e.target.closest('input[data-layer-knob]')) { draw(); hear(); } });
  list.addEventListener('click', (e) => {
    const x = e.target.closest('[data-remove-layer]');
    if (!x) return;
    const row = x.dataset.removeLayer;
    clearTimeout(armTimer);
    if (armed !== row) {
      armed = row;
      armTimer = setTimeout(() => { armed = null; draw(); }, 4000);
    } else {
      armed = null;
      shown.delete(row);
      byHand(row, NO_TWEAKS[row]);
      shown.delete(row);
      hear();
    }
    draw();
  });
  add.addEventListener('click', () => {
    if (add.disabled) return;
    palette.hidden = !palette.hidden;
    add.setAttribute('aria-expanded', String(!palette.hidden));
  });
  palette.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add-knob]');
    if (!b) return;
    palette.hidden = true;
    add.setAttribute('aria-expanded', 'false');
    byHand(b.dataset.addKnob, ADDED_AT[b.dataset.addKnob]);
    draw();
    hear();
  });
  apply.addEventListener('click', async () => {
    if (apply.disabled) return;
    audio.stop('preview');
    await changeSounds(clips, { knobs: pick.knobs });
    close();
    announce(`Changed ${sounds(clips.length)}.`);
  });
  const field = (legend, ...kids) => {
    const f = make('fieldset', 'field');
    f.append(make('legend', 'field-name', legend), ...kids);
    return f;
  };
  const hint = make('p', 'field-hint', `The knobs you set here go on every one, in place of its voice and knobs. Picking plays ${clips[0].label}.`);
  openBulk('🪄 Voice', [hint, field('Voice', voices, line), field('Layers', list, addLine, palette), apply]);
}

// A group's ✏️: rename it, move it earlier or later, or delete it (two
// taps; its sounds stay, in no group).
function editGroup(id) {
  const groups = cleanGroups(ownGroups()) ?? [];
  const g = groups.find((x) => x.id === id);
  if (!g) return;
  const at = groups.indexOf(g);
  const form = make('form', 'bulk-new');
  const name = make('input', 'set-field');
  Object.assign(name, { id: 'bulk-group-rename', maxLength: MAX_GROUP_NAME, autocomplete: 'off', value: g.name });
  name.setAttribute('aria-label', 'Group name');
  const save = button('chip-dark', '✓ Rename');
  save.type = 'submit';
  form.append(name, save);
  const note = make('p', 'set-note');
  note.setAttribute('role', 'status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const typed = groupName(name.value);
    if (!typed) { note.textContent = 'A group needs a name.'; name.focus(); return; }
    await saveGroups(groups.map((x) => (x.id === id ? { ...x, name: typed } : x)));
    close();
    renderPads();
    announce(`Renamed to ${typed}.`);
  });
  const tools = make('div', 'set-buttons');
  const earlier = button('chip-dark', '⬆️ Earlier', { by: '-1' });
  const later = button('chip-dark', '⬇️ Later', { by: '1' });
  earlier.disabled = at === 0;
  later.disabled = at === groups.length - 1;
  const del = button('chip-dark', '🗑️ Delete group');
  const inGroup = ownSounds().filter((c) => c.group === id);
  const pickAll = button('chip-dark', `☑️ Select its ${sounds(inGroup.length)}`, { selectGroup: id });
  pickAll.disabled = inGroup.length === 0;
  tools.append(pickAll, earlier, later, del);
  tools.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.selectGroup) {
      close();
      chooseAll(inGroup.map((c) => c.id));
      announce(`${chosenIds().length} selected.`);
      return;
    }
    if (b.dataset.by) {
      await saveGroups(moveGroup(groups, id, Number(b.dataset.by)));
      close();
      renderPads();
      announce(`${g.name} moved ${b.dataset.by === '-1' ? 'earlier' : 'later'}.`);
      return;
    }
    if (!del.classList.contains('armed')) {
      del.classList.add('armed');
      del.textContent = 'Delete it? Tap again';
      return;
    }
    for (const rec of state.userClips.filter((c) => c.personId === state.personId && c.group === id)) {
      delete rec.group;
      await persist('clips', rec);
    }
    await saveGroups(groups.filter((x) => x.id !== id));
    close();
    renderPads();
    announce(`Deleted the group ${g.name}. Its sounds are still here, not in a group.`);
  });
  const hint = make('p', 'field-hint', 'Deleting a group keeps its sounds: they go to Not in a group.');
  openBulk(`✏️ ${g.name}`, [form, note, tools, hint], name);
}

// ── Start ──────────────────────────────────────────────────────────────

// hooks: {share(personId, ids)} makes one share code for several sounds.
export function initBulk(hooks = {}) {
  if (hooks.share) share = hooks.share;
  const $ = (s) => document.querySelector(s);
  Object.assign(el, {
    bar: $('#pads-chosen'), count: $('#chosen-count'), clear: $('#chosen-clear'), all: $('#chosen-all'), why: $('#chosen-why'),
    undo: $('#pads-undo'), undoText: $('#pads-undo-text'), undoButton: $('#pads-undo-button'), undoClose: $('#pads-undo-close'),
    dialog: $('#bulk-dialog'), title: $('#bulk-title'), body: $('#bulk-body'),
  });
  setupDialog(el.dialog);
  el.dialog.addEventListener('close', () => audio.stop('preview'));
  el.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-move-to]');
    if (b) moveTo(b.dataset.moveTo || null);
  });
  el.bar.addEventListener('click', onBar);
  el.undoButton.addEventListener('click', async () => {
    const fn = undoing;
    hideUndo();
    await fn?.();
  });
  el.undoClose.addEventListener('click', hideUndo);
  setPadHooks({ onChosen: drawBar, remove: removeSounds, editGroup });
  drawBar();
}
