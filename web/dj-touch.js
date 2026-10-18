// 👆 The touch layout (ADR 0029): 🎤 Live and Beats with ⌨️ Keys played on
// big tiles in bands, one group each, top to bottom (Ben, 2026-10-16: "not
// tied to a kbd… preset groups… far simpler"). This file draws the bands
// for playing; dj.js listens to them and plays through the same path as the
// keys. It also draws ✏️ Edit layout, the focused view for building one:
// layouts to load or save on top, then the bands (⠿ to move, S M L, ✕), then
// + Add a group. The rules are in touch.js.

import {
  MINE, SIZES, SIZE_NAMES, MAX_BANDS, READY_TOUCH, readyTouch, newBand, addBand, removeBand, moveBand, resizeBand,
  offeredSounds, addSounds, swapTile, swapBand, removeTile, sameTouch, keepAsMine, touchName, MAX_TOUCH_NAME, cleanTouch,
} from './touch.js';
import { hasPicker, pickerButton, pickerList, pickedFor, pickInstrument } from './inst-picker.js';
import { presetInstrument, versionFor, ownIdOf, instrumentById } from './instruments.js';
import { openDialog, setupDialog } from './dialogs.js';
import { newId } from './util.js';

// A group's emoji and name: 🎤 My sounds, a kit group's own, or 🔊 Sounds.
function groupParts(group, kitGroups = []) {
  if (group === MINE) return { emoji: '🎤', name: 'My sounds' };
  const g = kitGroups.find((x) => x.id === group);
  return g ? { emoji: g.emoji || '🔊', name: g.name } : { emoji: '🔊', name: 'Sounds' };
}

// A band's heading: the group's emoji and name, or 🎤 My sounds.
export function groupLabel(group, kitGroups = []) {
  const { emoji, name } = groupParts(group, kitGroups);
  return `${emoji} ${name}`;
}

// Draws `touch` into `box` for playing: a heading and a grid of tiles per
// band, each tile a sound in its family's color. A sound that is gone is
// left out, and so is a band with none left. `deps`: clipById, family(clip)
// -> {color}, kitGroups(), isLooping(id).
export function drawBands(box, touch, deps) {
  const bands = (touch?.bands ?? []).map((b, i) => ({ b, i, clips: b.sounds.map((id) => deps.clipById(id)).filter(Boolean) }))
    .filter((x) => x.clips.length);
  if (!bands.length) {
    const p = document.createElement('p');
    p.className = 'touch-empty';
    p.textContent = 'No sounds here yet. ✏️ Edit layout adds a group of them.';
    box.replaceChildren(p);
    return;
  }
  box.replaceChildren(...bands.map(({ b, i, clips }) => {
    const band = document.createElement('section');
    band.className = 'touch-band';
    band.dataset.band = i;
    band.dataset.size = b.size;
    const head = document.createElement('h3');
    head.className = 'touch-head';
    head.id = `touch-head-${i}`;
    head.textContent = groupLabel(b.group, deps.kitGroups());
    band.setAttribute('aria-labelledby', head.id);
    const tiles = document.createElement('div');
    tiles.className = 'touch-tiles';
    tiles.append(...clips.map((clip) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'touch-tile';
      t.dataset.clip = clip.id;
      t.style.setProperty('--c', deps.family(clip).color);
      t.setAttribute('aria-label', clip.label);
      if (deps.isLooping?.(clip.id)) t.classList.add('looping');
      const emoji = document.createElement('span');
      emoji.className = 'touch-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = clip.emoji || '🔊';
      const name = document.createElement('span');
      name.className = 'touch-name';
      name.setAttribute('aria-hidden', 'true');
      name.textContent = clip.label;
      t.append(emoji, name);
      return t;
    }));
    band.append(head, tiles);
    return band;
  }));
}

// ── ✏️ Edit layout ──

const UNDO_MAX = 30;
const ARM_MS = 3000;        // how long a red ✕? or Delete? waits for its second tap
const DRAG_PX = 6;          // a mouse or pen moved this far is dragging, not tapping
const HOLD_MS = 280;        // a finger held this long without moving starts a drag (as in ✏️ Edit keys)
const SLOP_PX = 10;         // a finger moving further first is a scroll

const button = (cls, text, data = {}, label = null) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  if (label) b.setAttribute('aria-label', label);
  return b;
};

// A sound to pick, as in ✏️ Edit keys: its emoji and name in its color.
function soundButton(c, family, data) {
  const b = button('ke-sound', '', data);
  b.style.setProperty('--c', family(c).color);
  const emoji = document.createElement('span');
  emoji.className = 'ke-sound-emoji';
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = c.emoji || '🔊';
  const name = document.createElement('span');
  name.className = 'ke-sound-name';
  name.textContent = c.label;
  b.append(emoji, name);
  return b;
}

// `el`: the dialog's parts (app.js). `deps`: from dj.js: personId(),
// clipById, family(clip), kitGroups(), sounds() (touch.js soundsOf),
// touch() (the layout as it plays), saveTouch(t), mine() and saveMine(t)
// (⭐ My layout), layouts(pid), saveLayout(l), deleteLayout(id),
// preview(clip), closed().
export function createTouchEditor({ el, deps }) {
  let undo = [];              // earlier layouts, newest last
  let asking = null;          // 'save' | 'delete' | {remove: band}: a line or a second tap waits
  let askTimer = 0;
  let picking = null;         // {band, tile (null: + more, adding), group, groupsOpen}: the picker under a band
  let focusAfter = null;      // a selector to focus after a redraw
  let instBand = null;        // the band whose instrument list is open, or null

  const pid = () => deps.personId();
  const clip = (id) => (id ? deps.clipById(id) : null);
  const label = (group) => groupLabel(group, deps.kitGroups());
  const soundText = (id) => { const c = clip(id); return c ? `${c.emoji || '🔊'} ${c.label}` : 'that sound'; };
  const now = () => deps.touch();
  // The groups a band can be: 🎤 My sounds, then each kit group with sounds on this board.
  const groups = () => { const s = deps.sounds(); return [MINE, ...deps.kitGroups().map((g) => g.id).filter((g) => s.groups.get(g)?.length)]; };

  function set(next, note, { keepUndo = false } = {}) {
    if (!keepUndo) undo = [...undo, now()].slice(-UNDO_MAX);
    instBand = null;   // the bands may have moved
    deps.saveTouch(cleanTouch(next));
    say(note);
    render();
  }
  function say(text) { el.note.textContent = text || ''; }

  // ── Layouts: ⭐ My layout, the kid's own, then the ready-made ──

  const own = () => deps.layouts(pid()).slice().sort((a, b) => a.created - b.created);
  function allLayouts() {
    const s = deps.sounds();
    const out = [];
    const mine = deps.mine();
    if (mine) out.push({ id: 'mine', label: '⭐ My layout', touch: mine, mine: true });
    for (const l of own()) out.push({ id: l.id, label: `⭐ ${l.name}`, touch: { bands: l.bands }, own: l });
    for (const r of READY_TOUCH) out.push({ id: `ready-${r.id}`, label: `${r.emoji} ${r.name}`, touch: readyTouch(r, s) });
    return out;
  }
  // The layout on screen, when it is the kid's own, is kept as ⭐ My layout first.
  function loadLayout(id) {
    const all = allLayouts();
    const l = all.find((x) => x.id === id);
    if (!l) return;
    const kept = keepAsMine(now(), all.filter((x) => !x.mine).map((x) => x.touch));
    if (kept && !sameTouch(kept, l.touch)) deps.saveMine(kept);
    picking = null;
    set(l.touch, `${l.label} is on.${kept && !l.mine ? ' Your own layout is kept in ⭐ My layout.' : ''}`);
  }
  function renderLayouts() {
    const t = now();
    const all = allLayouts();
    // Lit: the one on screen, a saved one first (it can be renamed or deleted).
    const on = all.find((l) => l.own && sameTouch(l.touch, t)) ?? all.find((l) => sameTouch(l.touch, t));
    const save = button('ke-layout ke-save', '⭐ Save this layout');
    save.id = 'te-save';
    save.setAttribute('aria-expanded', String(asking === 'save'));
    el.layouts.replaceChildren(...all.map((l) => {
      const b = button('ke-layout', l.label, { layout: l.id });
      b.setAttribute('aria-pressed', String(l === on));
      return b;
    }), save);
    el.saveLine.hidden = asking !== 'save';
    const ownOn = on?.own;
    el.ownLine.hidden = !ownOn || asking === 'save';
    if (ownOn) {
      if (document.activeElement !== el.rename) el.rename.value = ownOn.name;
      el.rename.dataset.id = ownOn.id;
      el.remove.textContent = asking === 'delete' ? `Delete ⭐ ${ownOn.name}?` : '🗑️ Delete';
      el.remove.classList.toggle('armed', asking === 'delete');
    }
  }

  // ── The bands ──

  function bandEl(b, i) {
    const name = label(b.group);
    const sec = document.createElement('section');
    sec.className = 'te-band';
    sec.dataset.band = i;
    sec.setAttribute('aria-label', name);
    const head = document.createElement('div');
    head.className = 'te-band-head';
    const handle = button('te-handle', '⠿', { handle: i }, `Move ${name}: drag it, or press ↑ or ↓`);
    const title = document.createElement('span');
    title.className = 'te-band-name';
    title.textContent = name;
    const sizes = document.createElement('span');
    sizes.className = 'seq-barsel te-sizes';
    sizes.setAttribute('role', 'group');
    sizes.setAttribute('aria-label', `Tile size for ${name}`);
    sizes.append(...Object.keys(SIZES).map((k) => {
      const s = button('', k.toUpperCase(), { size: k, band: i }, `${SIZE_NAMES[k]} tiles, ${SIZES[k]} across on a phone`);
      s.setAttribute('aria-pressed', String(b.size === k));
      return s;
    }));
    const asked = asking?.remove === i;
    const rm = button(`icon-btn te-remove${asked ? ' armed' : ''}`, asked ? '✕?' : '✕', { remove: i }, asked ? `Tap again to remove ${name}` : `Remove ${name}`);
    head.append(handle, title, sizes, rm);
    const tiles = document.createElement('div');
    tiles.className = 'te-tiles';
    tiles.dataset.size = b.size;
    b.sounds.forEach((id, k) => {
      const c = clip(id);
      if (!c) return;   // a sound that is gone
      const t = button('te-tile', '', { band: i, tile: k }, `${c.label}: tap to swap it or take it out`);
      t.style.setProperty('--c', deps.family(c).color);
      t.setAttribute('aria-pressed', String(picking?.band === i && picking.tile === k));
      const emoji = document.createElement('span');
      emoji.className = 'touch-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = c.emoji || '🔊';
      const n = document.createElement('span');
      n.className = 'touch-name';
      n.setAttribute('aria-hidden', 'true');
      n.textContent = c.label;
      t.append(emoji, n);
      tiles.append(t);
    });
    const more = button('te-more', '+ more', { more: i }, `Add more sounds to ${name}`);
    more.setAttribute('aria-expanded', String(picking?.band === i && picking.tile == null));
    tiles.append(more);
    sec.append(head, ...instLine(b, i), tiles);
    if (picking?.band === i) sec.append(pickerEl(b, i));
    return sec;
  }

  // A band of Notes, Chords or Bass: who plays it, under its name (ADR
  // 0030). The button shows the band's own instrument; a pick plays every
  // tile's note on another one, and is the person's pick too.
  const kitName = (group) => deps.kitGroups().find((g) => g.id === group)?.name ?? group;
  function bandInstrument(b) {
    const first = b.sounds.map(clip).find((c) => c?.kit && c.group === b.group);
    return instrumentById(presetInstrument(first)) ?? pickedFor(b.group);
  }
  function instLine(b, i) {
    if (!hasPicker(b.group)) return [];
    const g = { id: b.group, name: kitName(b.group) };
    const open = instBand === i;
    const line = document.createElement('div');
    line.className = 'te-band-inst';
    const pick = pickerButton(g, open, { where: `band-${i}`, inst: bandInstrument(b), title: `Who plays this band: pick an instrument, and every tile keeps its note` });
    pick.dataset.instBand = i;
    line.append(pick);
    if (!open) return [line];
    const list = pickerList(g, { where: `band-${i}`, now: bandInstrument(b).id, label: `Who plays ${label(b.group)}` });
    for (const c of list.querySelectorAll('[data-inst]')) c.dataset.instBand = i;
    return [line, list];
  }
  async function swapInstrument(i, inst) {
    const cur = now();
    const b = cur.bands[i];
    if (!b) return;
    instBand = null;
    const swap = (id) => {
      const c = clip(id);
      if (!c?.kit || c.group !== b.group) return id;
      const kitId = versionFor(ownIdOf(c), c.group, inst);
      return (kitId && clip(`${c.personId}-${kitId}`)?.id) || id;
    };
    const who = instrumentById(inst);
    focusAfter = `[data-inst-pick][data-inst-band="${i}"]`;
    set(swapBand(cur, i, swap), `${who.emoji} ${who.name} plays ${label(b.group)} now, each tile the same note.`);
    await pickInstrument(b.group, inst);
    render();
  }

  // Under a band: swap a tile's sound, take it out, or (+ more) add more,
  // all at once or one by one. One ▾ picker says which group's sounds show
  // (the band's own first); its list of groups opens only on a tap (Ben,
  // 2026-10-18: the wall of group chips "went on so long that at first
  // glance I misunderstood what was happening"). A sound already anywhere
  // in the layout is not offered; a swap shows its tile's own as picked.
  function pickerEl(b, i) {
    const swapping = picking.tile != null;
    const t = now();
    const s = deps.sounds();
    const keep = swapping ? b.sounds[picking.tile] : null;
    const count = (g) => offeredSounds(t, g, s, keep).filter((id) => id !== keep).length;
    const box = document.createElement('div');
    box.className = 'te-picker';
    box.setAttribute('role', 'group');
    const line = document.createElement('p');
    line.className = 'ke-hint';
    line.textContent = swapping ? `Swap ${soundText(keep)} for:` : `Add to ${label(b.group)}:`;
    box.setAttribute('aria-label', line.textContent);

    const from = document.createElement('div');
    from.className = 'te-pick-from';
    const fromText = document.createElement('span');
    fromText.className = 'te-from';
    fromText.textContent = 'Sounds from';
    fromText.setAttribute('aria-hidden', 'true');
    const open = !!picking.groupsOpen;
    const listId = `te-group-list-${i}`;
    const n = count(picking.group);
    const g = groupParts(picking.group, deps.kitGroups());
    const pick = button('inst-pick te-group-pick', '', { groupPick: i });
    pick.setAttribute('aria-expanded', String(open));
    pick.setAttribute('aria-controls', listId);
    pick.setAttribute('aria-label', `Sounds from ${g.emoji} ${g.name}: ${n} to ${swapping ? 'pick' : 'add'}. Tap to pick another group`);
    pick.title = 'Pick which group\'s sounds show';
    pick.append(...groupBits(g, n), part('inst-pick-caret', open ? '▴' : '▾'));
    from.append(fromText, pick);

    if (open) {
      const list = document.createElement('div');
      list.className = 'inst-list te-group-list';
      list.id = listId;
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', 'Pick a group');
      const row = document.createElement('div');
      row.className = 'inst-choices';
      row.append(...[b.group, ...groups().filter((x) => x !== b.group)].map((id) => {
        const c = button('inst-choice te-group-choice', '', { pickGroup: id });
        const on = id === picking.group;
        const left = count(id);
        c.setAttribute('aria-pressed', String(on));
        c.setAttribute('aria-label', `${label(id)}: ${left === 0 ? 'none left' : `${left} to ${swapping ? 'pick' : 'add'}`}`);
        if (!left) c.classList.add('te-none-left');
        c.append(...groupBits(groupParts(id, deps.kitGroups()), left));
        if (on) c.append(part('inst-choice-tick', '✓'));
        return c;
      }));
      list.append(row);
      box.append(line, from, list);
      return box;
    }

    const ids = offeredSounds(t, picking.group, s, keep);
    const list = document.createElement('div');
    list.className = 'ke-picks';
    list.append(...ids.map(clip).filter(Boolean).map((c) => {
      const btn = soundButton(c, deps.family, { pickSound: c.id });
      btn.setAttribute('aria-pressed', String(c.id === keep));
      return btn;
    }));
    const empty = document.createElement('p');
    empty.className = 'ke-hint';
    empty.hidden = n > 0;
    empty.textContent = picking.group === MINE && !(s.groups.get(MINE)?.length)
      ? 'No sounds of your own yet. Make one on 🔊 Pads with ➕ New sound, and it shows up here.'
      : `Every sound in ${label(picking.group)} is on the board already. Pick another group.`;
    const actions = document.createElement('div');
    actions.className = 'te-pick-actions';
    if (swapping) actions.append(button('seq-tool', '🗑️ Take it out', { takeOut: '' }), button('seq-tool', 'Cancel', { pickClose: '' }));
    else {
      if (n) actions.append(button('seq-tool', `+ Add all ${n}`, { addAll: '' }));
      actions.append(button('seq-tool', '✅ Done adding', { pickClose: '' }));
    }
    box.append(line, from, list, empty, actions);
    return box;
  }
  // A span with a class and text, hidden from a screen reader (the button says it all).
  function part(cls, text) {
    const sp = document.createElement('span');
    sp.className = cls;
    sp.setAttribute('aria-hidden', 'true');
    sp.textContent = text;
    return sp;
  }
  // A group's picture, name and how many of its sounds are left to offer.
  const groupBits = (g, n) => [part('inst-pick-emoji', g.emoji), part('inst-pick-name', g.name), part('te-group-count', String(n))];

  function renderBands() {
    const t = now();
    if (picking && !t.bands[picking.band]) picking = null;
    const empty = document.createElement('p');
    empty.className = 'ke-hint';
    empty.textContent = 'No groups yet. Add one below.';
    el.bands.replaceChildren(...(t.bands.length ? t.bands.map(bandEl) : [empty]));
    el.undo.disabled = !undo.length;
    const full = t.bands.length >= MAX_BANDS;
    el.add.replaceChildren(...groups().map((g) => {
      const b = button('ke-group', label(g), { addGroup: g });
      b.disabled = full;
      return b;
    }));
    el.addHint.textContent = full
      ? `A layout holds ${MAX_BANDS} groups at most. Remove one (✕) to add another.`
      : 'Tap a group to add it at the bottom, with a few of its sounds.';
  }

  function render() {
    renderLayouts();
    renderBands();
    if (focusAfter) { el.dialog.querySelector(focusAfter)?.focus(); focusAfter = null; }
  }

  // ── Actions ──

  function arm(next) {
    asking = next;
    clearTimeout(askTimer);
    askTimer = setTimeout(() => { asking = null; render(); }, ARM_MS);
  }
  function move(from, to) {
    const t = now();
    if (to < 0 || to >= t.bands.length || to === from) return;
    picking = null;
    focusAfter = `[data-handle="${to}"]`;
    set(moveBand(t, from, to), `${label(t.bands[from].group)} moved ${to < from ? 'up' : 'down'}.`);
  }

  // ── Taps ──

  let justDragged = false;   // the click that ends a drag is not a tap

  el.dialog.addEventListener('click', (e) => {
    if (justDragged) { justDragged = false; return; }
    const t = e.target;
    const at = (attr) => t.closest(`[data-${attr}]`);
    const layout = at('layout');
    if (layout) { asking = null; loadLayout(layout.dataset.layout); return; }
    if (t.closest('#te-save')) {
      asking = asking === 'save' ? null : 'save';
      el.saveName.value = '';     // never pre-filled with a name
      renderLayouts();
      if (asking === 'save') el.saveName.focus();
      return;
    }
    const cur = now();
    const who = at('inst-pick');
    if (who && who.dataset.instBand != null) {
      const i = Number(who.dataset.instBand);
      instBand = instBand === i ? null : i;
      focusAfter = `[data-inst-pick][data-inst-band="${i}"]`;
      render();
      return;
    }
    const inst = at('inst');
    if (inst && inst.dataset.instBand != null) { swapInstrument(Number(inst.dataset.instBand), inst.dataset.inst); return; }
    const size = at('size');
    if (size && size.dataset.band != null) {
      const i = Number(size.dataset.band);
      const k = size.dataset.size;
      const next = resizeBand(cur, i, k, deps.sounds());
      const added = next.bands[i].sounds.length - cur.bands[i].sounds.length;
      focusAfter = `[data-size="${k}"][data-band="${i}"]`;
      set(next, `${label(cur.bands[i].group)}: ${SIZE_NAMES[k].toLowerCase()} tiles.${added > 0 ? ` ${added === 1 ? '1 more sound fills' : `${added} more sounds fill`} the line.` : ''}`);
      return;
    }
    const rm = at('remove');
    if (rm) {
      const i = Number(rm.dataset.remove);
      if (asking?.remove !== i) { arm({ remove: i }); focusAfter = `[data-remove="${i}"]`; render(); return; }
      asking = null;
      picking = null;
      set(removeBand(cur, i), `Removed ${label(cur.bands[i].group)}. ↩️ Undo brings it back.`);
      return;
    }
    const tile = at('tile');
    if (tile) {
      const i = Number(tile.dataset.band);
      const k = Number(tile.dataset.tile);
      picking = picking?.band === i && picking.tile === k ? null : { band: i, tile: k, group: cur.bands[i].group };
      render();
      return;
    }
    const more = at('more');
    if (more) {
      const i = Number(more.dataset.more);
      picking = picking?.band === i && picking.tile == null ? null : { band: i, tile: null, group: cur.bands[i].group };
      render();
      return;
    }
    if (at('group-pick') && picking) {
      picking = { ...picking, groupsOpen: !picking.groupsOpen };
      focusAfter = '[data-group-pick]';
      render();
      return;
    }
    const group = at('pick-group');
    if (group && picking) {
      picking = { ...picking, group: group.dataset.pickGroup, groupsOpen: false };
      focusAfter = '[data-group-pick]';
      render();
      return;
    }
    const sound = at('pick-sound');
    if (sound && picking) {
      const id = sound.dataset.pickSound;
      const c = clip(id);
      if (c) deps.preview(c);
      if (picking.tile != null) {
        const { band: i, tile: k } = picking;
        const was = cur.bands[i].sounds[k];
        picking = null;
        set(swapTile(cur, i, k, id), `${soundText(id)} is where ${soundText(was)} was.`);
        return;
      }
      set(addSounds(cur, picking.band, [id]), `Added ${soundText(id)}.`);
      return;
    }
    if (t.closest('[data-take-out]') && picking?.tile != null) {
      const { band: i, tile: k } = picking;
      picking = null;
      set(removeTile(cur, i, k), `Took out ${soundText(cur.bands[i].sounds[k])}.`);
      return;
    }
    if (t.closest('[data-add-all]') && picking) {
      const ids = offeredSounds(cur, picking.group, deps.sounds());
      const i = picking.band;
      picking = null;
      set(addSounds(cur, i, ids), `Added ${ids.length === 1 ? '1 sound' : `${ids.length} sounds`} to ${label(cur.bands[i].group)}.`);
      return;
    }
    if (t.closest('[data-pick-close]')) { picking = null; render(); return; }
    const add = at('add-group');
    if (add && !add.disabled) {
      const g = add.dataset.addGroup;
      if (cur.bands.length >= MAX_BANDS) return;
      picking = null;
      focusAfter = `[data-handle="${cur.bands.length}"]`;
      set(addBand(cur, newBand(g, deps.sounds(), cur)), `Added ${label(g)} at the bottom.`);
    }
  });

  // Esc in an open instrument list closes it, not Edit layout; so does Esc
  // in the picker's open list of groups.
  el.bands.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && picking?.groupsOpen && e.target.closest?.('.te-group-list, [data-group-pick]')) {
      e.preventDefault();
      e.stopPropagation();
      picking = { ...picking, groupsOpen: false };
      focusAfter = '[data-group-pick]';
      render();
      return;
    }
    if (e.key !== 'Escape' || instBand == null || !e.target.closest?.('.inst-list, [data-inst-pick]')) return;
    e.preventDefault();
    e.stopPropagation();
    focusAfter = `[data-inst-pick][data-inst-band="${instBand}"]`;
    instBand = null;
    render();
  });

  // ⠿ with the keys: ↑ and ↓ move its band.
  el.bands.addEventListener('keydown', (e) => {
    const h = e.target.closest?.('[data-handle]');
    if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = Number(h.dataset.handle);
    move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
  });

  function save() {
    const name = touchName(el.saveName.value);
    if (!name) { el.saveName.focus(); return; }
    deps.saveLayout({ id: newId('touch'), personId: pid(), name, created: Date.now(), bands: now().bands });
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
  el.saveName.maxLength = MAX_TOUCH_NAME;
  el.rename.maxLength = MAX_TOUCH_NAME;
  el.rename.addEventListener('change', () => {
    const l = deps.layouts(pid()).find((x) => x.id === el.rename.dataset.id);
    const name = touchName(el.rename.value);
    if (l && name && name !== l.name) { deps.saveLayout({ ...l, name }); say(`Renamed to ⭐ ${name}.`); }
    renderLayouts();
  });
  el.rename.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.rename.blur(); } });
  // Delete asks first: the first tap turns it red, the second deletes.
  el.remove.addEventListener('click', () => {
    const l = deps.layouts(pid()).find((x) => x.id === el.rename.dataset.id);
    if (!l) return;
    if (asking !== 'delete') { arm('delete'); renderLayouts(); return; }
    asking = null;
    deps.deleteLayout(l.id);
    say(`Deleted ⭐ ${l.name}. The layout stays as it is.`);
    render();
  });
  el.undo.addEventListener('click', () => {
    const before = undo.pop();
    if (!before) return;
    picking = null;
    set(before, 'Undone.', { keepUndo: true });
  });
  // Any other tap takes back a waiting second tap.
  el.dialog.addEventListener('pointerdown', (e) => {
    if (asking?.remove != null && !e.target.closest?.(`[data-remove="${asking.remove}"]`)) { asking = null; renderBands(); }
    if (asking === 'delete' && !e.target.closest?.('#te-delete')) { asking = null; renderLayouts(); }
  }, true);

  // ── Drag ⠿ to move a band ──
  // A mouse or pen drags once it moves; a finger holds still first, so a
  // swipe still scrolls the dialog.

  let press = null;   // {id, x, y, from, touch, timer, dragging, over}

  function startDrag() {
    press.dragging = true;
    el.dialog.classList.add('te-dragging');
    el.bands.querySelector(`.te-band[data-band="${press.from}"]`)?.classList.add('ke-lifted');
  }
  function overAt(x, y) {
    const band = document.elementFromPoint?.(x, y)?.closest?.('.te-band');
    const to = band && el.bands.contains(band) ? Number(band.dataset.band) : null;
    for (const b of el.bands.querySelectorAll('.te-over')) if (b !== band) b.classList.remove('te-over');
    if (to != null && to !== press.from) band.classList.add('te-over');
    press.over = to;
  }
  function endDrag(drop) {
    const p = press;
    press = null;
    if (!p?.dragging) return;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    el.dialog.classList.remove('te-dragging');
    for (const b of el.bands.querySelectorAll('.te-over, .ke-lifted')) b.classList.remove('te-over', 'ke-lifted');
    if (drop && p.over != null) move(p.from, p.over);
  }
  el.bands.addEventListener('pointerdown', (e) => {
    const h = e.target.closest?.('[data-handle]');
    if (!h || e.button > 0 || press) return;
    const touch = e.pointerType === 'touch';
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, from: Number(h.dataset.handle), touch, dragging: false, over: null };
    try { h.setPointerCapture?.(e.pointerId); } catch { /* the pointer is gone */ }
    if (touch) press.timer = setTimeout(() => { if (press && !press.dragging) startDrag(); }, HOLD_MS);
  });
  el.dialog.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.dragging) { overAt(e.clientX, e.clientY); return; }
    const far = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.touch) { if (far > SLOP_PX) { clearTimeout(press.timer); press = null; } return; }
    if (far > DRAG_PX) { startDrag(); overAt(e.clientX, e.clientY); }
  });
  el.dialog.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(press.timer);
    endDrag(true);
  });
  el.dialog.addEventListener('pointercancel', () => { if (press) { clearTimeout(press.timer); endDrag(false); } });
  // While a finger drags, the dialog must not scroll under it.
  el.dialog.addEventListener('touchmove', (e) => { if (press?.dragging) e.preventDefault(); }, { passive: false });
  el.dialog.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-handle]')) e.preventDefault(); });

  setupDialog(el.dialog);
  el.dialog.addEventListener('close', () => {
    if (press) endDrag(false);
    picking = null;
    asking = null;
    deps.closed?.();
  });

  function open() {
    undo = [];
    picking = null;
    instBand = null;
    asking = null;
    say('');
    render();
    openDialog(el.dialog, { focus: el.bands.querySelector('[data-handle]') ?? el.add.querySelector('button') });
  }

  return { open, render };
}
