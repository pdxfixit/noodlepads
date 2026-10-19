// ✏️ Layout with ⌨️ Keys: a focused view for arranging the 40 keys, with none of
// the beat, take or mode controls. Layouts on top (whole-keyboard
// arrangements: the kid's own ⭐ ones first, then the ready-made ones), the
// keyboard in the middle, and Sounds at the bottom (one at a time, or a
// whole group). Ben, 2026-10-11: "there should be key-layout saves, which is
// different than the custom sounds… above the kbd is layouts… below sounds;
// individual and grouped".
//
// Sounds go on keys by drag (pointer events, so touch works: on a touch
// screen, hold first, so a swipe still scrolls) or by tapping: pick sounds,
// then tap a key. The rules live in keyset.js; this file draws and listens.

import { KEY_ROWS, keyFor } from './rhythm.js';
import {
  fullKeys, placeSounds, loadRow, nextFreeRow, swapKeys, clearKey, sameKeys, changedKeys,
  READY_LAYOUTS, readyKeys, keepAsMine, layoutName, MAX_LAYOUT_NAME,
} from './keyset.js';
import { groupKit } from './model.js';
import { openDialog, setupDialog } from './dialogs.js';
import { newId } from './util.js';
import { hasPicker, pickerButton, pickerList, pickInstrument } from './inst-picker.js';
import { instrumentById } from './instruments.js';

const DRAG_PX = 6;          // a mouse or pen moved this far is dragging, not tapping
const HOLD_MS = 280;        // a finger held this long without moving starts a drag
const SLOP_PX = 10;         // a finger moving further first is a scroll
const UNDO_MAX = 30;
const ROW_NAMES = ['number row', 'top letter row', 'middle row', 'bottom row'];   // rhythm.js KEY_ROWS, top to bottom

// `el`: the dialog's parts (app.js). `deps`: the app's, plus from dj.js
// `keys()` (the 40 keys as they play now), `base()` (the person's default
// keys), `letterFor(code)` and `family(clip)`.
export function createKeysEditor({ el, deps }) {
  let picks = [];             // sound ids picked, in the order picked
  let openGroup = null;       // the group whose sounds show
  let undo = [];              // earlier keyboards, newest last
  let asking = null;          // 'save' | 'delete' | 'reset' while a line or a second tap waits
  let focusCode = null;       // the key to focus after a redraw
  let instOpen = false;       // the open group's instrument list (Notes, Chords, Bass) is open

  const pid = () => deps.personId();
  const clip = (id) => (id ? deps.clipById(id) : null);
  const soundText = (id) => { const c = clip(id); return c ? `${c.emoji || '🔊'} ${c.label}` : 'a sound'; };

  // ── Keys ──

  function setKeys(next, note, { keepUndo = false } = {}) {
    const now = deps.keys();
    if (!keepUndo) undo = [...undo, fullKeys(now)].slice(-UNDO_MAX);
    deps.saveKeys(changedKeys(fullKeys(next), deps.base()));
    say(note);
    render();
  }

  // ── Layouts ──

  // A ready-made layout's kit ids as this person's sounds. A note, chord or
  // bass note is the picked instrument's (ADR 0030): its preset stands for
  // the group's own one it plays.
  const kitClip = () => {
    const p = pid();
    const kit = deps.clipsFor(p).filter((c) => c.kit);
    const ids = new Map(kit.filter((c) => c.plays).map((c) => [c.plays, c.id]));
    for (const c of kit) ids.set(c.id.slice(p.length + 1), c.id);
    return (kitId) => ids.get(kitId) ?? null;
  };
  const own = () => deps.layouts(pid()).slice().sort((a, b) => a.created - b.created);
  const mine = () => deps.savedDeck(pid())?.mine ?? null;
  // Every layout a kid can load: ⭐ My keys, their own, then the ready-made.
  function allLayouts() {
    const find = kitClip();
    const out = [];
    if (mine()) out.push({ id: 'mine', label: '⭐ My keys', keys: fullKeys(mine()), mine: true });
    for (const l of own()) out.push({ id: l.id, label: `⭐ ${l.name}`, keys: fullKeys(l.keys), own: l });
    for (const r of READY_LAYOUTS) out.push({ id: `ready-${r.id}`, label: `${r.emoji} ${r.name}`, keys: readyKeys(r, find), ready: true });
    return out;
  }

  // Loads a layout. The keys as they were, when they are the kid's own
  // arrangement, are kept as ⭐ My keys first (loading My keys itself swaps).
  function loadLayout(id) {
    const all = allLayouts();
    const l = all.find((x) => x.id === id);
    if (!l) return;
    const now = fullKeys(deps.keys());
    const kept = keepAsMine(now, all.filter((x) => !x.mine));
    if (kept && !sameKeys(kept, l.keys)) deps.saveMine(kept);
    setKeys(l.keys, `${l.label} is on the keys.${kept && !l.mine ? ' Your own keys are kept in ⭐ My keys.' : ''}`);
  }

  function renderLayouts() {
    const now = deps.keys();
    const all = allLayouts();
    const on = all.find((l) => sameKeys(l.keys, now));
    el.layouts.replaceChildren(...all.map((l) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ke-layout';
      b.dataset.layout = l.id;
      b.textContent = l.label;
      b.setAttribute('aria-pressed', String(l === on));
      return b;
    }), (() => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ke-layout ke-save';
      b.id = 'ke-save';
      b.textContent = '⭐ Save this layout';
      b.setAttribute('aria-expanded', String(asking === 'save'));
      return b;
    })());
    el.saveLine.hidden = asking !== 'save';
    // The kid's own layout, when it is the one on the keys: rename or delete it.
    const ownOn = on?.own;
    el.ownLine.hidden = !ownOn || asking === 'save';
    if (ownOn) {
      if (document.activeElement !== el.rename) el.rename.value = ownOn.name;
      el.rename.dataset.id = ownOn.id;
      el.remove.textContent = asking === 'delete' ? `Delete ⭐ ${ownOn.name}?` : '🗑️ Delete';
      el.remove.classList.toggle('armed', asking === 'delete');
    }
  }

  // ── Sounds ──

  // The groups below the keyboard: the kid's own sounds, then the presets'
  // groups (Drums, Notes, …), each {id, label, clips}.
  function groups() {
    const p = pid();
    const clips = deps.clipsFor(p);
    const out = [];
    const mineClips = clips.filter((c) => !c.kit);
    // Always there, even before the kid has made a sound (Ben, 2026-10-11),
    // so they know their own sounds belong here.
    out.push({ id: 'mine', label: '🎤 My sounds', clips: mineClips });
    for (const g of deps.ownGroups?.(p) ?? []) out.push({ id: `own-${g.id}`, label: `${g.emoji || '📁'} ${g.name}`, clips: g.clips });
    for (const g of groupKit(clips.filter((c) => c.kit), deps.kitGroups())) {
      if (g.clips.length) out.push({ id: `kit-${g.id}`, label: `${g.emoji || '🔊'} ${g.name}`, clips: g.clips });
    }
    return out;
  }

  function renderSounds() {
    const all = groups();
    if (!all.some((g) => g.id === openGroup)) openGroup = (all.find((g) => g.clips.length) ?? all[0])?.id ?? null;
    el.groups.replaceChildren(...all.map((g) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ke-group';
      b.dataset.group = g.id;
      b.dataset.drag = 'group';
      b.textContent = g.label;
      const open = g.id === openGroup;
      b.setAttribute('aria-pressed', String(open));
      b.title = open ? 'Tap again to put the group on a row' : 'Show its sounds';
      return b;
    }));
    const group = all.find((g) => g.id === openGroup);
    renderInstrument(group);
    el.picks.replaceChildren(...(group?.clips ?? []).map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ke-sound';
      b.dataset.sound = c.id;
      b.dataset.drag = 'sound';
      b.style.setProperty('--c', deps.family(c).color);
      const n = picks.indexOf(c.id);
      b.setAttribute('aria-pressed', String(n >= 0));
      const emoji = document.createElement('span');
      emoji.className = 'ke-sound-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = c.emoji || '🔊';
      const name = document.createElement('span');
      name.className = 'ke-sound-name';
      name.textContent = c.label;
      b.append(emoji, name);
      if (n >= 0) {
        const badge = document.createElement('span');
        badge.className = 'ke-pick-n';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = String(n + 1);
        b.append(badge);
      }
      return b;
    }));
    const empty = group && !group.clips.length;
    el.picksHint.textContent = picks.length
      ? `${picks.length === 1 ? '1 sound' : `${picks.length} sounds`} picked: tap a key to put ${picks.length === 1 ? 'it' : 'them'} there, or drag.`
      : empty
        ? 'No sounds of your own yet. Make one on 🔊 Pads with ➕ New sound, and it shows up here.'
        : 'Tap sounds to pick them, then tap a key. Or drag a sound or a group onto the keys.';
    el.clearPicks.hidden = !picks.length;
  }

  // Notes, Chords and Bass, open: who plays them, above their sounds, the
  // same picker as on 🔊 Pads (inst-picker.js, ADR 0030). A row filled
  // with the group gets the picked instrument's notes; keys already on
  // the board keep theirs.
  const instBox = el.inst ?? document.createElement('div');   // index.html #ke-inst
  const kitGroupOf = (group) => {
    const id = group?.id.startsWith('kit-') ? group.id.slice(4) : null;
    if (!id || !hasPicker(id)) return null;
    return { id, name: deps.kitGroups().find((g) => g.id === id)?.name ?? id };
  };
  function renderInstrument(group) {
    const g = kitGroupOf(group);
    if (!g) instOpen = false;
    instBox.hidden = !g;
    instBox.replaceChildren(...(g ? [pickerButton(g, instOpen, { where: 'keys' }), ...(instOpen ? [pickerList(g, { where: 'keys' })] : [])] : []));
  }
  async function chooseInstrument(group, inst) {
    instOpen = false;
    await pickInstrument(group, inst);
    const g = groups().find((x) => x.id === `kit-${group}`);
    const who = instrumentById(inst);
    say(g && who ? `${who.emoji} ${who.name} plays ${g.label} now. Tap ${g.label} again to put them on a row.` : '');
    renderSounds();
    instBox.querySelector('[data-inst-pick]')?.focus();
  }

  // ── The keyboard ──

  function renderKeys() {
    const keys = deps.keys();
    el.keys.replaceChildren(...KEY_ROWS.map((codes, r) => {
      const line = document.createElement('div');
      line.className = 'ke-row';
      line.dataset.row = r;
      line.setAttribute('role', 'group');
      line.setAttribute('aria-label', ROW_NAMES[r]);
      line.append(...codes.map((code) => {
        const c = clip(keys[code]);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ke-key';
        b.dataset.code = code;
        b.dataset.drag = 'key';
        const sym = document.createElement('span');
        sym.className = 'ke-sym';
        sym.textContent = deps.letterFor(code);
        const emoji = document.createElement('span');
        emoji.className = 'ke-emoji';
        emoji.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'ke-name';
        if (c) {
          b.style.setProperty('--c', deps.family(c).color);
          emoji.textContent = c.emoji || '🔊';
          name.textContent = c.label;
        } else {
          b.classList.add('empty');
          name.textContent = 'No sound';
        }
        b.title = c ? c.label : 'No sound';
        b.setAttribute('aria-label', `${deps.letterFor(code)}: ${c ? c.label : 'no sound'}`);
        b.append(sym, emoji, name);
        return b;
      }));
      return line;
    }));
    el.undo.disabled = !undo.length;
    el.reset.textContent = asking === 'reset' ? 'Reset all keys?' : '↺ Reset keys';
    el.reset.classList.toggle('armed', asking === 'reset');
    if (focusCode) { el.keys.querySelector(`[data-code="${focusCode}"]`)?.focus(); focusCode = null; }
  }

  function render() {
    renderLayouts();
    renderKeys();
    renderSounds();
  }

  function say(text) {
    el.note.textContent = text || '';
  }

  // What happened, in words: what landed, what moved, what didn't fit.
  function outcome(first, { left = [], moved = 0 }) {
    let text = first;
    if (moved) text += ` ${moved === 1 ? '1 sound that was there moved' : `${moved} sounds that were there moved`} to a free key.`;
    if (left.length) text += ` No room for ${left.map(soundText).join(', ')}.`;
    return text;
  }

  // ── Actions ──

  function putPicks(code, ids = picks) {
    if (!ids.length) return;
    const got = placeSounds(deps.keys(), code, ids);
    const placed = ids.length - got.left.filter((id) => ids.includes(id)).length;
    const first = placed === 1 ? `${soundText(ids[0])} is on ${deps.letterFor(code)}.` : `${placed} sounds are on the keys from ${deps.letterFor(code)}.`;
    picks = [];
    focusCode = code;
    setKeys(got.keys, outcome(first, got));
  }

  function putGroup(groupId, r) {
    const g = groups().find((x) => x.id === groupId);
    if (!g || !g.clips.length) return;
    const row = r ?? nextFreeRow(deps.keys());
    const got = loadRow(deps.keys(), row, g.clips.map((c) => c.id));
    setKeys(got.keys, outcome(`${g.label} is on the ${ROW_NAMES[row]}.`, got));
  }

  function swap(a, b) {
    if (a === b) return;
    setKeys(swapKeys(deps.keys(), a, b), `Swapped ${deps.letterFor(a)} and ${deps.letterFor(b)}.`);
  }

  function clear(code) {
    if (!deps.keys()[code]) return;
    focusCode = code;
    setKeys(clearKey(deps.keys(), code), `${deps.letterFor(code)} has no sound now.`);
  }

  function preview(code) {
    const c = clip(deps.keys()[code]);
    if (c) deps.preview(c);
  }

  // A tap on a key (or Enter, or the key itself pressed): with sounds
  // picked, they go there; otherwise the key plays.
  function tapKey(code) {
    if (picks.length) putPicks(code);
    else preview(code);
  }

  // ── Taps ──

  let justDragged = false;   // the click that ends a drag is not a tap

  el.dialog.addEventListener('click', (e) => {
    if (justDragged) { justDragged = false; return; }
    const t = e.target;
    if (t.closest('[data-inst-pick]')) {
      instOpen = !instOpen;
      renderSounds();
      instBox.querySelector('[data-inst-pick]')?.focus();
      return;
    }
    const inst = t.closest('[data-inst]');
    if (inst) { chooseInstrument(inst.dataset.instGroup, inst.dataset.inst); return; }
    const key = t.closest('[data-code]');
    if (key && el.keys.contains(key)) { tapKey(key.dataset.code); return; }
    const sound = t.closest('[data-sound]');
    if (sound) {
      const id = sound.dataset.sound;
      if (picks.includes(id)) picks = picks.filter((x) => x !== id);
      else { picks = [...picks, id]; const c = clip(id); if (c) deps.preview(c); }
      renderSounds();
      return;
    }
    const group = t.closest('[data-group]');
    if (group) {
      if (group.dataset.group === openGroup) putGroup(openGroup);
      else { openGroup = group.dataset.group; say(`Tap ${group.textContent} again to put it on a row, or drag it onto one.`); renderSounds(); }
      return;
    }
    const layout = t.closest('[data-layout]');
    if (layout) { asking = null; loadLayout(layout.dataset.layout); return; }
    if (t.closest('#ke-save')) {
      asking = asking === 'save' ? null : 'save';
      el.saveName.value = '';     // never pre-filled with a name
      renderLayouts();
      if (asking === 'save') el.saveName.focus();
      return;
    }
  });

  el.clearPicks.addEventListener('click', () => { picks = []; renderSounds(); });

  function save() {
    const name = layoutName(el.saveName.value);
    if (!name) { el.saveName.focus(); return; }
    const record = { id: newId('layout'), personId: pid(), name, created: Date.now(), keys: fullKeys(deps.keys()) };
    deps.saveLayout(record);
    asking = null;
    say(`Saved ⭐ ${name}.`);
    render();
  }
  el.saveOk.addEventListener('click', save);
  el.saveName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); asking = null; renderLayouts(); }
  });
  el.saveCancel.addEventListener('click', () => { asking = null; renderLayouts(); });
  el.saveName.maxLength = MAX_LAYOUT_NAME;

  el.rename.addEventListener('change', () => {
    const l = deps.layouts(pid()).find((x) => x.id === el.rename.dataset.id);
    const name = layoutName(el.rename.value);
    if (l && name && name !== l.name) { deps.saveLayout({ ...l, name }); say(`Renamed to ⭐ ${name}.`); }
    renderLayouts();
  });
  el.rename.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.rename.blur(); } });
  el.rename.maxLength = MAX_LAYOUT_NAME;
  // Delete asks first: the first tap turns it red, the second deletes.
  el.remove.addEventListener('click', () => {
    const l = deps.layouts(pid()).find((x) => x.id === el.rename.dataset.id);
    if (!l) return;
    if (asking !== 'delete') { asking = 'delete'; renderLayouts(); return; }
    asking = null;
    deps.deleteLayout(l.id);
    say(`Deleted ⭐ ${l.name}. The keys stay as they are.`);
    render();
  });

  el.undo.addEventListener('click', () => {
    const before = undo.pop();
    if (!before) return;
    setKeys(before, 'Undone.', { keepUndo: true });
  });
  el.reset.addEventListener('click', () => {
    if (asking !== 'reset') { asking = 'reset'; renderKeys(); return; }
    asking = null;
    setKeys(deps.base(), 'The keys are back to how they started.');
  });
  // Any other tap takes back a waiting second tap.
  el.dialog.addEventListener('pointerdown', (e) => {
    if (asking === 'reset' && !e.target.closest('#ke-reset')) { asking = null; renderKeys(); }
    if (asking === 'delete' && !e.target.closest('#ke-delete')) { asking = null; renderLayouts(); }
  }, true);

  // Keys: Delete on a focused key clears it; a keyboard's own letter key
  // works as a tap on its key.
  el.dialog.addEventListener('keydown', (e) => {
    // Esc in the open instrument list closes it, not Edit keys.
    if (e.key === 'Escape' && instOpen && e.target.closest?.('.ke-inst')) {
      e.preventDefault();
      e.stopPropagation();
      instOpen = false;
      renderSounds();
      instBox.querySelector('[data-inst-pick]')?.focus();
      return;
    }
    if (e.target.closest?.('input') || e.metaKey || e.ctrlKey || e.altKey) return;
    const focused = e.target.closest?.('[data-code]');
    if (focused && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); clear(focused.dataset.code); return; }
    if (e.key === 'Enter' || e.key === ' ') return;   // the focused button's own click
    const code = keyFor(e, deps.layout());
    if (!code || e.repeat) return;
    e.preventDefault();
    el.keys.querySelector(`[data-code="${code}"]`)?.focus();
    tapKey(code);
  });

  // ── Drag ──
  // One drag at a time. A mouse or pen drags once it moves; a finger holds
  // still for a moment first, so a swipe still scrolls the sounds.

  let press = null;   // {id, x, y, from, kind, touch, timer, dragging, ghost, ids, over}

  function dragIds(from) {
    if (from.dataset.drag === 'sound') {
      const id = from.dataset.sound;
      return picks.includes(id) ? picks : [id];
    }
    if (from.dataset.drag === 'key') return [deps.keys()[from.dataset.code]].filter(Boolean);
    return groups().find((g) => g.id === from.dataset.group)?.clips.map((c) => c.id) ?? [];
  }

  function startDrag(e) {
    const p = press;
    const ids = dragIds(p.from);
    if (!ids.length) { press = null; return; }
    p.dragging = true;
    p.ids = ids;
    const ghost = document.createElement('div');
    ghost.className = 'ke-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = p.kind === 'group' ? p.from.textContent : ids.slice(0, 3).map((id) => clip(id)?.emoji || '🔊').join('');
    if (p.kind === 'sound' && ids.length > 1) {
      const n = document.createElement('span');
      n.className = 'ke-pick-n';
      n.textContent = String(ids.length);
      ghost.append(n);
    }
    el.dialog.append(ghost);
    p.ghost = ghost;
    el.dialog.classList.add('ke-dragging', `ke-dragging-${p.kind}`);
    p.from.classList.add('ke-lifted');
    try { p.from.setPointerCapture(p.id); } catch { /* the pointer is gone */ }
    moveGhost(e.clientX, e.clientY);
  }

  function moveGhost(x, y) {
    const p = press;
    p.ghost.style.transform = `translate(${x}px, ${y}px)`;
    const under = document.elementFromPoint(x, y);
    const key = under?.closest?.('[data-code]');
    const row = under?.closest?.('.ke-row');
    let over = [];
    if (p.kind === 'group' && row && el.keys.contains(row)) over = [row];
    else if (key && el.keys.contains(key)) over = [key];
    for (const o of el.keys.querySelectorAll('.ke-over')) if (!over.includes(o)) o.classList.remove('ke-over');
    for (const o of over) o.classList.add('ke-over');
    p.over = { key: key && el.keys.contains(key) ? key.dataset.code : null, row: row && el.keys.contains(row) ? Number(row.dataset.row) : null, board: !!under?.closest?.('#ke-keys') };
  }

  function endDrag(drop) {
    const p = press;
    press = null;
    if (!p?.dragging) return;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    for (const o of el.keys.querySelectorAll('.ke-over')) o.classList.remove('ke-over');
    el.dialog.classList.remove('ke-dragging', 'ke-dragging-sound', 'ke-dragging-key', 'ke-dragging-group');
    p.from.classList.remove('ke-lifted');
    const over = drop ? p.over ?? {} : {};
    let done = false;
    if (p.kind === 'sound' && over.key) { putPicks(over.key, p.ids); done = true; }
    else if (p.kind === 'group' && over.row != null) { putGroup(p.from.dataset.group, over.row); done = true; }
    else if (p.kind === 'key' && over.key) { swap(p.from.dataset.code, over.key); done = true; }
    else if (p.kind === 'key' && drop && !over.board) { clear(p.from.dataset.code); done = true; }
    if (done) { p.ghost.remove(); return; }
    // Dropped on nothing: it flies back to where it came from.
    const home = p.from.isConnected ? p.from.getBoundingClientRect() : null;
    if (home && p.ghost.animate && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      const back = p.ghost.animate([{ transform: p.ghost.style.transform }, { transform: `translate(${home.x + home.width / 2}px, ${home.y + home.height / 2}px)` }], { duration: 220, easing: 'ease-in' });
      back.onfinish = () => p.ghost.remove();
    } else p.ghost.remove();
  }

  el.dialog.addEventListener('pointerdown', (e) => {
    const from = e.target.closest?.('[data-drag]');
    if (!from || e.button > 0 || press) return;
    const touch = e.pointerType === 'touch';
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, from, kind: from.dataset.drag, touch, dragging: false };
    if (touch) press.timer = setTimeout(() => { if (press && !press.dragging) startDrag({ clientX: press.x, clientY: press.y }); }, HOLD_MS);
  });
  el.dialog.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.dragging) { moveGhost(e.clientX, e.clientY); return; }
    const far = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.touch) { if (far > SLOP_PX) { clearTimeout(press.timer); press = null; } return; }
    if (far > DRAG_PX) startDrag(e);
  });
  el.dialog.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(press.timer);
    endDrag(true);
  });
  el.dialog.addEventListener('pointercancel', () => { if (press) { clearTimeout(press.timer); endDrag(false); } });
  // While a finger drags, the page must not scroll under it.
  el.dialog.addEventListener('touchmove', (e) => { if (press?.dragging) e.preventDefault(); }, { passive: false });
  // A held finger brings up no menu of its own.
  el.dialog.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-drag]')) e.preventDefault(); });

  setupDialog(el.dialog);
  el.dialog.addEventListener('close', () => {
    if (press) endDrag(false);
    picks = [];
    asking = null;
    deps.closed?.();
  });

  // focus: where to start, else the first key (band). ✏️ Layout's switch
  // passes its own button, and the first view's opener, when it swaps one
  // view for the other.
  function open({ focus, opener } = {}) {
    undo = [];
    picks = [];
    asking = null;
    say('');
    render();
    openDialog(el.dialog, { focus: focus ?? el.keys.querySelector('[data-code]'), opener });
  }

  return { open, render };
}
