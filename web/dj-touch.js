// 👆 The touch layout (ADR 0029): 🎤 Live and Beats with ⌨️ Keys played on
// big tiles in bands, one group each, top to bottom (Ben, 2026-10-16: "not
// tied to a kbd… preset groups… far simpler"). This file draws the bands
// for playing; dj.js listens to them and plays through the same path as the
// keys. It also draws ✏️ Layout (👆 Pads), the focused view for building one:
// layouts to load or save on top, then the bands (⠿ to move, S M L, ✕), then
// + Add a group. The rules are in touch.js.

import {
  MINE, SIZES, SIZE_NAMES, MAX_BANDS, READY_TOUCH, readyTouch, newBand, addBand, removeBand, moveBand, resizeBand,
  offeredSounds, addSounds, swapTile, swapBand, removeTile, sameTouch, keepAsMine, touchName, cleanTouch,
} from './touch.js';
import { MAX_NAME } from './names.js';
import { hasPicker, pickerButton, pickerList, pickedFor, pickInstrument } from './inst-picker.js';
import { presetInstrument, versionFor, ownIdOf, instrumentById } from './instruments.js';
import {
  READY_GRIDS, MIN_PART, blocks, useGrid, fillBlock, gridShape, bestColumns, pathKey, pathOf, setEdge, nudgeEdge, fraction,
  splitBlock, joinBlock, cannotSplit,
} from './touch-grid.js';
import { openDialog, setupDialog } from './dialogs.js';
import { newId } from './util.js';
import { holdToDrag } from './finger.js';

// A group's emoji and name: 🎤 Sounds, a kit group's own, or 🔊 Sounds.
function groupParts(group, kitGroups = []) {
  if (group === MINE) return { emoji: '🎤', name: 'Sounds' };
  const g = kitGroups.find((x) => x.id === group);
  return g ? { emoji: g.emoji || '🔊', name: g.name } : { emoji: '🔊', name: 'Sounds' };
}

// A band's heading: the group's emoji and name, or 🎤 Sounds.
export function groupLabel(group, kitGroups = []) {
  const { emoji, name } = groupParts(group, kitGroups);
  return `${emoji} ${name}`;
}

// Who plays a band of Notes, Chords or Bass: its first tile's own
// instrument, else the person's pick for the group.
function bandInstrument(b, clipById) {
  const first = b.sounds.map(clipById).find((c) => c?.kit && c.group === b.group);
  return instrumentById(presetInstrument(first)) ?? pickedFor(b.group);
}

// Draws `touch` into `box` for playing: a heading and a grid of tiles per
// band, each tile a sound in its family's color. A sound that is gone is
// left out, and so is a band with none left. With a grid (touch-grid.js),
// the bands sit in its blocks instead, each block's pads filling it.
// `deps`: clipById, family(clip) -> {color}, kitGroups(), isLooping(id).
export function drawBands(box, touch, deps) {
  const live = (b) => b.sounds.map((id) => deps.clipById(id)).filter(Boolean);
  if (touch?.grid) {
    const frac = new Map(blocks(touch.grid).map((x) => [pathKey(x.path), x.frac]));
    const grid = document.createElement('div');
    grid.className = 'touch-grid';
    grid.append(splitEl(touch.grid, [], (part, path) => {
      const b = part.band == null ? null : touch.bands[part.band];
      const clips = b ? live(b) : [];
      if (!clips.length) {
        // An empty block keeps its room: the grid is the kid's shape.
        const empty = document.createElement('div');
        empty.className = 'touch-block-empty';
        empty.setAttribute('aria-hidden', 'true');
        return empty;
      }
      const band = playBand(b, part.band, clips, deps);
      band.classList.add('touch-cell');
      const tiles = band.querySelector('.touch-tiles');
      tiles.classList.add('cell-tiles');
      // A first guess from the block's share of a phone-sized grid, until it is measured.
      const f = frac.get(pathKey(path));
      tiles.style.setProperty('--cols', bestColumns(clips.length, f.w * 360, f.h * 480));
      return band;
    }));
    box.replaceChildren(grid);
    fitPads(box);
    return;
  }
  const bands = (touch?.bands ?? []).map((b, i) => ({ b, i, clips: live(b) })).filter((x) => x.clips.length);
  if (!bands.length) {
    const p = document.createElement('p');
    p.className = 'touch-empty';
    p.textContent = 'No sounds here yet. ✏️ Layout adds a group of them.';
    box.replaceChildren(p);
    return;
  }
  box.replaceChildren(...bands.map(({ b, i, clips }) => playBand(b, i, clips, deps)));
}

// One band for playing: its heading, then its tiles.
function playBand(b, i, clips, deps) {
  const band = document.createElement('section');
  band.className = 'touch-band';
  band.dataset.band = i;
  band.dataset.size = b.size;
  const head = document.createElement('h3');
  head.className = 'touch-head';
  head.id = `touch-head-${i}`;
  const name = groupLabel(b.group, deps.kitGroups());
  head.textContent = name;
  // Notes, Chords and Bass say who plays them, in parentheses after the
  // name (Ben, 2026-10-27), "Chords (Synth)"; the heading's label says it in full.
  if (hasPicker(b.group)) {
    const who = bandInstrument(b, deps.clipById);
    const pic = document.createElement('span');
    pic.className = 'touch-head-inst';
    pic.setAttribute('aria-hidden', 'true');
    pic.textContent = `(${who.name})`;
    head.append(' ', pic);
    head.title = `${name.replace(/^\S+ /, '')}: played by ${who.name}`;
    head.setAttribute('aria-label', head.title);
  }
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
}

// A split of a grid as boxes: its parts side by side (`across`) or one
// under another (`down`), each as big as its twelfths say (`--part`).
// `leaf(part, path)` draws a block; `edge(split, path, k)`, when given, the
// handle between part k and the next.
export function splitEl(n, path, leaf, edge = null) {
  const box = document.createElement('div');
  box.className = 'grid-split';
  box.dataset.dir = n.dir;
  n.parts.forEach((p, k) => {
    const at = [...path, k];
    const child = Array.isArray(p.parts) ? splitEl(p, at, leaf, edge) : leaf(p, at);
    child.style.setProperty('--part', p.size);
    box.append(child);
    if (edge && k < n.parts.length - 1) box.append(edge(n, path, k));
  });
  return box;
}

// Each block's pads in as many columns as fill it best (touch-grid.js
// bestColumns), measured now and again whenever the pads' box changes size.
const fitting = new WeakSet();
function fitPads(box) {
  const fit = () => {
    for (const t of box.querySelectorAll('.cell-tiles')) {
      if (t.clientWidth > 0 && t.clientHeight > 0) t.style.setProperty('--cols', bestColumns(t.children.length, t.clientWidth, t.clientHeight));
    }
  };
  fit();
  if (fitting.has(box) || !globalThis.ResizeObserver) return;
  fitting.add(box);
  new ResizeObserver(fit).observe(box);
}

// ── ✏️ Layout (👆 Pads) ──

const UNDO_MAX = 30;
const ARM_MS = 3000;        // how long a red ✕? or Delete? waits for its second tap

const button = (cls, text, data = {}, label = null) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  if (label) b.setAttribute('aria-label', label);
  return b;
};

// A sound to pick, as in ✏️ Layout (⌨️ Keys): its emoji and name in its color.
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
// (⭐ Layout), layouts(pid), saveLayout(l), deleteLayout(id),
// preview(clip), closed().
export function createTouchEditor({ el, deps }) {
  let undo = [];              // earlier layouts, newest last
  let asking = null;          // 'save' | 'delete' | {remove: band}: a line or a second tap waits
  let askTimer = 0;
  let picking = null;         // {band, tile (null: + more, adding), group, groupsOpen}: the picker under a band
  let focusAfter = null;      // a selector to focus after a redraw
  let instBand = null;        // the band whose instrument list is open, or null
  let chosen = null;          // a grid's block picked for the next group tapped ('0-1'), or null
  let blockMenu = null;       // the grid's block whose ⋯ is open ('0-1'), or null

  const pid = () => deps.personId();
  const clip = (id) => (id ? deps.clipById(id) : null);
  const label = (group) => groupLabel(group, deps.kitGroups());
  const soundText = (id) => { const c = clip(id); return c ? `${c.emoji || '🔊'} ${c.label}` : 'that sound'; };
  const now = () => deps.touch();
  // The groups a band can be: 🎤 Sounds, then each kit group with sounds on this board.
  const groups = () => { const s = deps.sounds(); return [MINE, ...deps.kitGroups().map((g) => g.id).filter((g) => s.groups.get(g)?.length)]; };

  function set(next, note, { keepUndo = false } = {}) {
    if (!keepUndo) undo = [...undo, now()].slice(-UNDO_MAX);
    instBand = null;   // the bands may have moved
    deps.saveTouch(cleanTouch(next));
    say(note);
    render();
  }
  function say(text) { el.note.textContent = text || ''; }

  // ── Layouts: ⭐ Layout, the kid's own, then the ready-made ──

  const own = () => deps.layouts(pid()).slice().sort((a, b) => a.created - b.created);
  function allLayouts() {
    const s = deps.sounds();
    const out = [];
    const mine = deps.mine();
    if (mine) out.push({ id: 'mine', label: '⭐ Layout', touch: mine, mine: true });
    for (const l of own()) out.push({ id: l.id, label: `⭐ ${l.name}`, touch: { bands: l.bands, ...(l.grid ? { grid: l.grid } : {}) }, own: l });
    for (const r of READY_TOUCH) out.push({ id: `ready-${r.id}`, label: `${r.emoji} ${r.name}`, touch: readyTouch(r, s) });
    return out;
  }
  // The layout on screen, when it is the kid's own, is kept as ⭐ Layout first.
  function loadLayout(id) {
    const all = allLayouts();
    const l = all.find((x) => x.id === id);
    if (!l) return;
    const kept = keepAsMine(now(), all.filter((x) => !x.mine).map((x) => x.touch));
    if (kept && !sameTouch(kept, l.touch)) deps.saveMine(kept);
    picking = null;
    chosen = null;
    set(l.touch, `${l.label} is on.${kept && !l.mine ? ' Your own layout is kept in ⭐ Layout.' : ''}`);
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

  // ── Grids: ☰ Stacked, or a ready-made grid of empty blocks ──

  // A small picture of a grid: its blocks as boxes, the way they sit.
  function shapePic(grid) {
    const pic = grid
      ? splitEl(grid, [], () => { const b = document.createElement('span'); b.className = 'shape-block'; return b; })
      : splitEl({ dir: 'down', parts: [{ size: 4 }, { size: 4 }, { size: 4 }] }, [], () => { const b = document.createElement('span'); b.className = 'shape-block'; return b; });
    pic.classList.add('shape-pic');
    pic.setAttribute('aria-hidden', 'true');
    return pic;
  }
  function renderShapes() {
    const on = gridShape(now());
    const shapes = [{ id: 'stacked', name: 'Stacked', grid: null }, ...READY_GRIDS];
    el.grids.replaceChildren(...shapes.map((g) => {
      const b = button('te-shape', '', { shape: g.id });
      b.setAttribute('aria-pressed', String(g.id === on));
      b.setAttribute('aria-label', g.grid ? `${g.name}: a grid of empty blocks to drop groups onto` : 'Stacked: each group a band of its own, top to bottom');
      const name = document.createElement('span');
      name.className = 'te-shape-name';
      name.textContent = g.name;
      b.append(shapePic(g.grid), name);
      return b;
    }));
  }
  // A ready-made grid in place of the layout, its blocks empty; the one on
  // screen kept as ⭐ Layout when it is the kid's own. ☰ Stacked keeps
  // the groups, one band each, in the blocks' order.
  function useShape(id) {
    const cur = now();
    if (id === gridShape(cur)) return;
    picking = null;
    chosen = null;
    blockMenu = null;
    if (id === 'stacked') { set({ bands: cur.bands }, 'Stacked: each group is a band of its own, top to bottom.'); return; }
    const r = READY_GRIDS.find((x) => x.id === id);
    if (!r) return;
    const kept = cur.bands.length ? keepAsMine(cur, allLayouts().filter((x) => !x.mine).map((x) => x.touch)) : null;
    if (kept) deps.saveMine(kept);
    focusAfter = '[data-drop]';
    set(useGrid(r.grid), `${r.name}: tap a block, then a group, or drag a group onto a block.${kept ? ' Your own layout is kept in ⭐ Layout.' : ''}`);
  }

  // ── The bands ──

  // `cell`, a grid's block ('0-1') the band sits in: no ⠿ (its place is the
  // block) and no S M L (the block decides its pads' size, Ben 2026-10-19).
  function bandEl(b, i, cell = null) {
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
    sizes.setAttribute('aria-label', `Pad size for ${name}`);
    sizes.append(...Object.keys(SIZES).map((k) => {
      const s = button('', k.toUpperCase(), { size: k, band: i }, `${SIZE_NAMES[k]} pads, ${SIZES[k]} across on a phone`);
      s.setAttribute('aria-pressed', String(b.size === k));
      return s;
    }));
    const asked = asking?.remove === i;
    const rm = button(`icon-btn te-remove${asked ? ' armed' : ''}`, asked ? '✕?' : '✕', { remove: i }, asked ? `Tap again to remove ${name}` : `Remove ${name}`);
    if (cell) head.append(title, moreButton(cell), rm);
    else head.append(handle, title, sizes, rm);
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
    if (picking?.band === i && !cell) sec.append(pickerEl(b, i));
    return sec;
  }

  // ⋯ on a block: split it or join it (in the menu under the grid).
  function moreButton(key) {
    const b = button('icon-btn te-block-more', '⋯', { blockMore: key }, 'More for this block: split it in two, or join it to the next');
    b.setAttribute('aria-expanded', String(blockMenu === key));
    return b;
  }

  // Under the grid, for the block whose ⋯ is open: ⇹ Split across, ⇳ Split
  // down, and join it to its neighbour, each saying why when it can't.
  const WHY = {
    full: 'A grid holds 8 blocks.',
    crowded: 'Four side by side at most.',
    small: 'Too small to cut in two: drag its edge to make it bigger first.',
    deep: 'Blocks inside blocks go three deep at most.',
  };
  function blockMenuEl(t, key) {
    const path = pathOf(key) ?? [];
    const parent = splitOf(t.grid, path.slice(0, -1));
    const k = path[path.length - 1];
    const part = parent.parts[k];
    const name = partName(t, part);
    const box = document.createElement('div');
    box.className = 'te-picker te-block-menu';
    box.setAttribute('role', 'group');
    const line = document.createElement('p');
    line.className = 'ke-hint';
    line.textContent = `The ${name.replace(/^the /, '')} block:`;
    box.setAttribute('aria-label', line.textContent);
    const why = [];
    const acts = document.createElement('div');
    acts.className = 'te-pick-actions';
    for (const [dir, text] of [['across', '⇹ Split across'], ['down', '⇳ Split down']]) {
      const b = button('seq-tool', text, { split: dir });
      const no = cannotSplit(t.grid, path, dir);
      b.disabled = !!no;
      if (no) why.push(`${text.slice(2)}: ${WHY[no]}`);
      acts.append(b);
    }
    const last = k === parent.parts.length - 1;
    const side = parent.dir === 'across' ? (last ? 'the one on its left' : 'the one on its right') : (last ? 'the one above' : 'the one below');
    const join = button('seq-tool', `Join with ${side}`, { join: '' });
    join.disabled = blocks(t.grid).length <= 1;
    if (join.disabled) why.push('Join: it is the only block.');
    acts.append(join, button('seq-tool', 'Cancel', { blockClose: '' }));
    box.append(line, acts);
    if (why.length) {
      const p = document.createElement('p');
      p.className = 'ke-hint';
      p.textContent = why.join(' ');
      box.append(p);
    }
    return box;
  }

  // A grid's block in ✏️ Layout: its band, or a dashed "Drop a group here".
  function cellEl(t, part, path) {
    const key = pathKey(path);
    const cell = document.createElement('div');
    cell.className = 'te-cell';
    cell.dataset.cell = key;
    if (part.band == null) {
      cell.classList.add('te-empty');
      const drop = button('te-drop', 'Drop a group here', { drop: key }, 'An empty block: tap it, then a group below, or drag a group onto it');
      drop.setAttribute('aria-pressed', String(chosen === key));
      cell.append(drop, moreButton(key));
    } else cell.append(bandEl(t.bands[part.band], part.band, key));
    return cell;
  }

  // A band of Notes, Chords or Bass: who plays it, under its name (ADR
  // 0030). The button shows the band's own instrument; a pick plays every
  // tile's note on another one, and is the person's pick too.
  const kitName = (group) => deps.kitGroups().find((g) => g.id === group)?.name ?? group;
  function instLine(b, i) {
    if (!hasPicker(b.group)) return [];
    const g = { id: b.group, name: kitName(b.group) };
    const open = instBand === i;
    const line = document.createElement('div');
    line.className = 'te-band-inst';
    const pick = pickerButton(g, open, { where: `band-${i}`, inst: bandInstrument(b, clip), title: `Who plays this band: pick an instrument, and every pad keeps its note` });
    pick.dataset.instBand = i;
    line.append(pick);
    if (!open) return [line];
    const list = pickerList(g, { where: `band-${i}`, now: bandInstrument(b, clip).id, label: `Who plays ${label(b.group)}` });
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
    set(swapBand(cur, i, swap), `${who.emoji} ${who.name} plays ${label(b.group)} now, each pad the same note.`);
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
    if (t.grid) { renderGrid(t); return; }
    el.bandsTitle.textContent = 'Groups, top to bottom';
    const empty = document.createElement('p');
    empty.className = 'ke-hint';
    empty.textContent = 'No groups yet. Add one below.';
    el.bands.replaceChildren(...(t.bands.length ? t.bands.map((b, i) => bandEl(b, i)) : [empty]));
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

  // What a part of a grid is, for a sentence: its group, an empty block, or
  // the blocks a split inside it holds.
  function partName(t, p) {
    if (Array.isArray(p.parts)) return 'those blocks';
    return p.band == null ? 'the empty block' : label(t.bands[p.band].group);
  }
  // The edge between part k of a split and the next: a splitter, dragged
  // (Ben, 2026-10-19: "like a frame/window slider") or moved with the arrow
  // keys, a twelfth at a time. It says each side's share while it moves.
  function edgeEl(t, n, path, k) {
    const a = n.parts[k];
    const b = n.parts[k + 1];
    const e = document.createElement('div');
    e.className = 'te-edge';
    e.tabIndex = 0;
    e.dataset.edgePath = pathKey(path);
    e.dataset.edgeK = k;
    e.dataset.dir = n.dir;
    e.setAttribute('role', 'separator');
    // A split across has its edges standing up; a split down, lying flat.
    e.setAttribute('aria-orientation', n.dir === 'across' ? 'vertical' : 'horizontal');
    e.setAttribute('aria-valuemin', String(MIN_PART));
    e.setAttribute('aria-valuemax', String(a.size + b.size - MIN_PART));
    e.setAttribute('aria-valuenow', String(a.size));
    const keys = n.dir === 'across' ? '← or →' : '↑ or ↓';
    e.setAttribute('aria-label', `The edge between ${partName(t, a)} (${fraction(a.size)}) and ${partName(t, b)} (${fraction(b.size)}): drag it, or press ${keys}`);
    e.dataset.label = `${fraction(a.size)} · ${fraction(b.size)}`;
    return e;
  }
  const edgeAt = (e) => ({ path: e.dataset.edgePath ? pathOf(e.dataset.edgePath) : [], k: Number(e.dataset.edgeK) });
  const edgeSel = (path, k) => `[data-edge-path="${pathKey(path)}"][data-edge-k="${k}"]`;
  // The split at `path` in grid `g` ([] the top one).
  const splitOf = (g, path) => path.reduce((n, i) => n?.parts?.[i], g);
  function moveEdge(path, k, next, focus = true) {
    const cur = now();
    if (next === cur.grid) return;
    const n = splitOf(next, path);
    if (focus) focusAfter = edgeSel(path, k);
    set({ ...cur, grid: next }, `${partName(cur, n.parts[k])[0].toUpperCase()}${partName(cur, n.parts[k]).slice(1)} takes ${fraction(n.parts[k].size)}, ${partName(cur, n.parts[k + 1])} ${fraction(n.parts[k + 1].size)}.`);
  }

  // With a grid: its blocks, then (when open) the picker of the band tapped.
  function renderGrid(t) {
    if (chosen && !blocks(t.grid).some((b) => pathKey(b.path) === chosen && b.band == null)) chosen = null;
    el.bandsTitle.textContent = 'Blocks';
    const tree = splitEl(t.grid, [], (part, path) => cellEl(t, part, path), (n, path, k) => edgeEl(t, n, path, k));
    tree.classList.add('te-grid');
    if (blockMenu && !blocks(t.grid).some((b) => pathKey(b.path) === blockMenu)) blockMenu = null;
    const under = picking ? [pickerEl(t.bands[picking.band], picking.band)] : blockMenu ? [blockMenuEl(t, blockMenu)] : [];
    el.bands.replaceChildren(tree, ...under);
    el.undo.disabled = !undo.length;
    const empty = blocks(t.grid).some((b) => b.band == null);
    el.add.replaceChildren(...groups().map((g) => button('ke-group', label(g), { addGroup: g })));
    el.addHint.textContent = empty
      ? 'Drag a group onto a block, or tap one: it goes in the block picked, else the first empty one.'
      : 'Every block holds a group. Drag one onto a block to swap it in, ✕ a group to empty its block, or cut a block in two with its ⋯.';
  }

  function render() {
    renderLayouts();
    renderShapes();
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

  // Group `g` into the block at `key`, with its starting sounds not on the
  // board yet; a block holding a group takes the new one in its place.
  function putInBlock(g, key) {
    const cur = now();
    const path = pathOf(key);
    const was = blocks(cur.grid).find((b) => pathKey(b.path) === key);
    if (!path || !was) return;
    picking = null;
    chosen = null;
    focusAfter = `[data-cell="${key}"] [data-remove]`;
    const old = was.band == null ? null : cur.bands[was.band];
    const rest = old ? { ...cur, bands: cur.bands.map((b) => (b === old ? { ...b, sounds: [] } : b)) } : cur;
    set(fillBlock(cur, path, newBand(g, deps.sounds(), rest)), old ? `${label(g)} is in the block now, in place of ${label(old.group)}.` : `${label(g)} is in the block.`);
  }

  // ── Taps ──

  let justDragged = false;   // the click that ends a drag is not a tap

  el.dialog.addEventListener('click', (e) => {
    if (justDragged) { justDragged = false; return; }
    const t = e.target;
    const at = (attr) => t.closest(`[data-${attr}]`);
    const fold = t.closest('#te-fold');
    if (fold) {
      const open = fold.getAttribute('aria-expanded') !== 'true';
      fold.setAttribute('aria-expanded', String(open));
      fold.querySelector('.te-fold-caret').textContent = open ? '▾' : '▸';
      el.dialog.querySelector('#te-fold-body').hidden = !open;
      return;
    }
    const layout = at('layout');
    if (layout) { asking = null; loadLayout(layout.dataset.layout); return; }
    if (t.closest('#te-save')) {
      asking = asking === 'save' ? null : 'save';
      el.saveName.value = '';     // never pre-filled with a name
      renderLayouts();
      if (asking === 'save') el.saveName.focus();
      return;
    }
    const shape = at('shape');
    if (shape) { useShape(shape.dataset.shape); return; }
    const cur = now();
    const dots = at('block-more');
    if (dots) {
      const key = dots.dataset.blockMore;
      blockMenu = blockMenu === key ? null : key;
      picking = null;
      focusAfter = blockMenu ? '.te-block-menu [data-split]:not([disabled]), .te-block-menu [data-join]' : `[data-block-more="${key}"]`;
      render();
      return;
    }
    if (blockMenu && (at('split') || at('join'))) {
      const path = pathOf(blockMenu) ?? [];
      const parent = splitOf(cur.grid, path.slice(0, -1));
      const k = path[path.length - 1];
      const name = partName(cur, parent.parts[k]);
      blockMenu = null;
      if (at('split')) {
        const dir = at('split').dataset.split;
        const next = splitBlock(cur, path, dir);
        if (next === cur) return;
        // The new half: beside it in its own line, or the second half of a new split in its place.
        const fresh = parent.dir === dir ? [...path.slice(0, -1), k + 1] : [...path, 1];
        focusAfter = `[data-drop="${pathKey(fresh)}"]`;
        set(next, `Split: a new empty block ${dir === 'across' ? 'beside' : 'under'} ${name}.`);
        return;
      }
      const next = joinBlock(cur, path);
      if (next === cur) return;
      const held = parent.parts[k].band != null;
      set(next, held ? `Joined: ${name} went with its block. ↩️ Undo brings it back.` : 'Joined: its neighbour takes its room.');
      return;
    }
    if (at('block-close')) { focusAfter = `[data-block-more="${blockMenu}"]`; blockMenu = null; render(); return; }
    const drop = at('drop');
    if (drop) {
      chosen = chosen === drop.dataset.drop ? null : drop.dataset.drop;
      focusAfter = `[data-drop="${drop.dataset.drop}"]`;
      say(chosen ? 'Now tap a group below for this block.' : '');
      render();
      return;
    }
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
      set(next, `${label(cur.bands[i].group)}: ${SIZE_NAMES[k].toLowerCase()} pads.${added > 0 ? ` ${added === 1 ? '1 more sound fills' : `${added} more sounds fill`} the line.` : ''}`);
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
      blockMenu = null;
      render();
      return;
    }
    const more = at('more');
    if (more) {
      const i = Number(more.dataset.more);
      picking = picking?.band === i && picking.tile == null ? null : { band: i, tile: null, group: cur.bands[i].group };
      blockMenu = null;
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
    if (add && cur.grid) {
      const into = chosen ?? (() => { const b = blocks(cur.grid).find((x) => x.band == null); return b ? pathKey(b.path) : null; })();
      if (!into) { say('Every block holds a group. Drag this one onto a block to swap it in, ✕ a group first, or cut a block in two with its ⋯.'); return; }
      putInBlock(add.dataset.addGroup, into);
      return;
    }
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

  // An edge with the keys: ← → (across) or ↑ ↓ (down), a twelfth a press.
  el.bands.addEventListener('keydown', (e) => {
    const edge = e.target.closest?.('[data-edge-k]');
    if (!edge) return;
    const by = edge.dataset.dir === 'across' ? { ArrowLeft: -1, ArrowRight: 1 }[e.key] : { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!by) return;
    e.preventDefault();
    const { path, k } = edgeAt(edge);
    moveEdge(path, k, nudgeEdge(now().grid, path, k, by));
  });

  function save() {
    const name = touchName(el.saveName.value);
    if (!name) { el.saveName.focus(); return; }
    const t = now();
    deps.saveLayout({ id: newId('touch'), personId: pid(), name, created: Date.now(), bands: t.bands, ...(t.grid ? { grid: t.grid } : {}) });
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
  el.saveName.maxLength = MAX_NAME;
  el.rename.maxLength = MAX_NAME;
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

  // The press (finger.js holdToDrag) is {id, x, y, from, touch, timer, dragging, over}.

  function startDrag(p, x, y, moved) {
    el.dialog.classList.add('te-dragging');
    el.bands.querySelector(`.te-band[data-band="${p.from}"]`)?.classList.add('ke-lifted');
    if (moved) overAt(p, x, y);
  }
  function overAt(press, x, y) {
    const band = document.elementFromPoint?.(x, y)?.closest?.('.te-band');
    const to = band && el.bands.contains(band) ? Number(band.dataset.band) : null;
    for (const b of el.bands.querySelectorAll('.te-over')) if (b !== band) b.classList.remove('te-over');
    if (to != null && to !== press.from) band.classList.add('te-over');
    press.over = to;
  }
  function endDrag(p, drop) {
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    el.dialog.classList.remove('te-dragging');
    for (const b of el.bands.querySelectorAll('.te-over, .ke-lifted')) b.classList.remove('te-over', 'ke-lifted');
    if (drop && p.over != null) move(p.from, p.over);
  }
  const drag = holdToDrag(el.bands, el.dialog, {
    match: (e) => {
      const h = e.target.closest?.('[data-handle]');
      return h && { from: Number(h.dataset.handle), handle: h, over: null };
    },
    down: (p, e) => { try { p.handle.setPointerCapture?.(e.pointerId); } catch { /* the pointer is gone */ } },
    start: startDrag,
    move: overAt,
    end: endDrag,
    menu: '[data-handle]',
  });

  // ── Drag an edge ──
  // At once, a finger too: the edge is a handle, never a place to scroll.
  // While it moves only its two parts change on screen; letting go keeps
  // it, one ↩️ Undo.

  let edging = null;   // {id, edge, path, k, across, start, length, total, grid, next, sides}

  el.bands.addEventListener('pointerdown', (e) => {
    const edge = e.target.closest?.('[data-edge-k]');
    if (!edge || e.button > 0 || edging) return;
    const { path, k } = edgeAt(edge);
    const grid = now().grid;
    const n = splitOf(grid, path);
    const kids = [...edge.parentElement.children];
    const at = kids.indexOf(edge);
    const sides = [kids[at - 1], kids[at + 1]];
    if (!n?.parts?.[k + 1] || !sides[0] || !sides[1]) return;
    const across = n.dir === 'across';
    const a = sides[0].getBoundingClientRect();
    const b = sides[1].getBoundingClientRect();
    const start = across ? a.left : a.top;
    const length = (across ? b.right : b.bottom) - start;
    if (!(length > 0)) return;
    e.preventDefault();
    edging = { id: e.pointerId, edge, path, k, across, start, length, total: n.parts[k].size + n.parts[k + 1].size, grid, next: grid, sides };
    edge.classList.add('te-edge-moving');
    try { edge.setPointerCapture?.(e.pointerId); } catch { /* the pointer is gone */ }
  });
  el.dialog.addEventListener('pointermove', (e) => {
    if (!edging || e.pointerId !== edging.id) return;
    const pos = (edging.across ? e.clientX : e.clientY) - edging.start;
    const next = setEdge(edging.grid, edging.path, edging.k, (pos / edging.length) * edging.total);
    const n = splitOf(next, edging.path);
    edging.next = next;
    edging.sides[0].style.setProperty('--part', n.parts[edging.k].size);
    edging.sides[1].style.setProperty('--part', n.parts[edging.k + 1].size);
    edging.edge.dataset.label = `${fraction(n.parts[edging.k].size)} · ${fraction(n.parts[edging.k + 1].size)}`;
  });
  function endEdge(keep) {
    const g = edging;
    edging = null;
    if (!g) return;
    g.edge.classList.remove('te-edge-moving');
    if (keep) moveEdge(g.path, g.k, g.next);
    else renderBands();
  }
  el.dialog.addEventListener('pointerup', (e) => { if (edging && e.pointerId === edging.id) endEdge(true); });
  el.dialog.addEventListener('pointercancel', () => endEdge(false));

  // ── Drag a group onto a block (a grid) ──
  // As ⠿ above: a mouse or pen once it moves, a finger after holding still.

  // The press (finger.js holdToDrag) is {id, x, y, group, touch, timer, dragging, over}.

  function carryOver(carry, x, y) {
    const cell = document.elementFromPoint?.(x, y)?.closest?.('.te-cell');
    const to = cell && el.bands.contains(cell) ? cell.dataset.cell : null;
    for (const c of el.bands.querySelectorAll('.te-over')) if (c !== cell) c.classList.remove('te-over');
    if (to) cell.classList.add('te-over');
    carry.over = to;
  }
  function startCarry(c, x, y, moved) {
    el.dialog.classList.add('te-dragging');
    el.add.querySelector(`[data-add-group="${c.group}"]`)?.classList.add('ke-lifted');
    if (moved) carryOver(c, x, y);
  }
  function endCarry(c, drop) {
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    el.dialog.classList.remove('te-dragging');
    for (const x of el.dialog.querySelectorAll('.te-over, .ke-lifted')) x.classList.remove('te-over', 'ke-lifted');
    if (drop && c.over) putInBlock(c.group, c.over);
  }
  const carrying = holdToDrag(el.add, el.dialog, {
    match: (e) => {
      const g = e.target.closest?.('[data-add-group]');
      return g && now().grid && { group: g.dataset.addGroup, handle: g, over: null };
    },
    down: (c, e) => { try { c.handle.setPointerCapture?.(e.pointerId); } catch { /* the pointer is gone */ } },
    start: startCarry,
    move: carryOver,
    end: endCarry,
    menu: '[data-add-group]',
    menuOnlyWhilePressed: true,
  });

  setupDialog(el.dialog);
  el.dialog.addEventListener('close', () => {
    drag.cancel();
    carrying.cancel();
    if (edging) endEdge(false);
    picking = null;
    asking = null;
    chosen = null;
    blockMenu = null;
    deps.closed?.();
  });

  // focus: where to start, else the first key (band). ✏️ Layout's switch
  // passes its own button, and the first view's opener, when it swaps one
  // view for the other.
  function open({ focus, opener } = {}) {
    undo = [];
    picking = null;
    instBand = null;
    asking = null;
    chosen = null;
    blockMenu = null;
    say('');
    render();
    openDialog(el.dialog, { focus: focus ?? el.bands.querySelector('[data-handle]') ?? el.add.querySelector('button'), opener });
  }

  return { open, render };
}
