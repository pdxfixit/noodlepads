// 👆 Layout grids (docs/design/layout-grids.md, ADR 0032): a touch layout's
// blocks side by side, like a pad controller, each resized by dragging its
// edge as a window splitter is (Ben, 2026-10-19). Pure rules: no DOM, no
// audio, no storage; dj-touch.js draws and listens, touch.js keeps the bands.
//
// A grid is a tree of splits. A split lays its parts `across` (side by side)
// or `down` (one under another); each part takes `size` twelfths of it, so
// ¼ ⅓ ½ ⅔ ¾ all fit, and is a block or a split of its own:
//
//   grid  {dir: 'across' | 'down', parts: [part…]}
//   part  {size: 1…12, band?: index}             a block (no band: empty, dashed)
//       | {size: 1…12, dir, parts: [part…]}      a split inside it
//
// `band` is an index into the layout's `bands`, which stay what holds the
// sounds: an older copy that knows no grid still plays them, stacked. A
// layout with a grid keeps its bands in the blocks' reading order (`settle`),
// so the beat's rows follow it as they follow the stack. A block's place is
// its path: the part indexes from the top split down, as `[0, 1]`, or '0-1'
// in the page.

export const UNITS = 12;          // a split's parts share twelfths
export const MIN_PART = 2;        // a part never under ⅙ of its split
export const MAX_PARTS = 4;       // parts in one split
export const MAX_DEPTH = 3;       // splits inside splits
export const MAX_BLOCKS = 8;      // one band each at most, as MAX_BANDS
export const DIRS = ['across', 'down'];
const other = (dir) => (dir === 'across' ? 'down' : 'across');

// The ready-made grids (Ben, 2026-10-19: "preset grids that one drags
// instruments onto"), every block empty. ☰ Stacked is no grid: the bands,
// one under another, as before.
export const READY_GRIDS = [
  { id: 'two-one', name: 'Two and one', grid: { dir: 'down', parts: [{ size: 8, dir: 'across', parts: [{ size: 8 }, { size: 4 }] }, { size: 4 }] } },
  { id: 'corners', name: 'Four corners', grid: { dir: 'down', parts: [{ size: 6, dir: 'across', parts: [{ size: 6 }, { size: 6 }] }, { size: 6, dir: 'across', parts: [{ size: 6 }, { size: 6 }] }] } },
  { id: 'three', name: 'Three across', grid: { dir: 'across', parts: [{ size: 4 }, { size: 4 }, { size: 4 }] } },
  { id: 'halves', name: 'Side by side', grid: { dir: 'across', parts: [{ size: 6 }, { size: 6 }] } },
];

const isSplit = (p) => Array.isArray(p?.parts);
const clone = (g) => (g ? JSON.parse(JSON.stringify(g)) : null);
export const pathKey = (path) => path.join('-');
export const pathOf = (key) => (typeof key === 'string' && /^\d+(-\d+)*$/.test(key) ? key.split('-').map(Number) : null);

// Sizes made whole twelfths that add up to 12, each at least 1, keeping
// their proportions as near as rounding allows.
function share(sizes) {
  const raw = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  const out = raw.map((s) => Math.max(1, Math.round((s / sum) * UNITS)));
  // Rounding can miss by a few: the biggest parts give or take the rest.
  let diff = UNITS - out.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const order = out.map((s, i) => i).sort((a, b) => out[b] - out[a]);
    const i = diff > 0 ? order[0] : order.find((k) => out[k] > 1);
    if (i == null) break;
    out[i] += Math.sign(diff);
    diff -= Math.sign(diff);
  }
  return out;
}

// A grid as stored, from anywhere (the app, a backup, the cloud): splits
// 2 to 4 parts (the top one may have 1), at most 3 deep and 8 blocks, sizes
// in twelfths, each band index whole, under `bands` and used once. A split
// inside a split the same way joins its parent; a split of one part is that
// part. Returns null for anything that is no grid.
export function cleanGrid(g, bands = MAX_BLOCKS) {
  if (!g || typeof g !== 'object' || !DIRS.includes(g.dir) || !Array.isArray(g.parts) || !g.parts.length) return null;
  const used = new Set();
  let blocks = 0;
  const node = (n, depth) => {
    const parts = [];
    for (const p of n.parts.slice(0, MAX_PARTS * 2)) {
      if (!p || typeof p !== 'object') continue;
      if (isSplit(p) && DIRS.includes(p.dir) && depth < MAX_DEPTH) {
        const inner = node(p, depth + 1);
        if (!inner) continue;
        // The same way as this split: its parts join this one's, in its share.
        if (inner.dir === n.dir) {
          const total = inner.parts.reduce((a, q) => a + q.size, 0);
          for (const q of inner.parts) parts.push({ ...q, size: ((p.size || 1) * q.size) / total });
        } else if (inner.parts.length === 1) parts.push({ ...inner.parts[0], size: p.size });
        else parts.push({ size: p.size, dir: inner.dir, parts: inner.parts });
        continue;
      }
      // Too deep, or a broken split: an empty block in its room.
      if (blocks >= MAX_BLOCKS) continue;
      blocks += 1;
      const b = isSplit(p) ? null : p.band;
      const ok = Number.isInteger(b) && b >= 0 && b < bands && !used.has(b);
      if (ok) used.add(b);
      parts.push(ok ? { size: p.size, band: b } : { size: p.size });
    }
    const kept = parts.slice(0, MAX_PARTS);
    if (!kept.length) return null;
    const sizes = share(kept.map((p) => p.size));
    return { dir: n.dir, parts: kept.map((p, i) => ({ ...p, size: sizes[i] })) };
  };
  const out = node(g, 1);
  if (!out) return null;
  // The top split of one part that is a split is that split.
  if (out.parts.length === 1 && isSplit(out.parts[0])) return { dir: out.parts[0].dir, parts: out.parts[0].parts };
  return out;
}

// Every block, in reading order (top split first, each part in turn):
// [{path, band, size, frac: {w, h}}], `frac` its share of the whole grid's
// width and height.
export function blocks(grid) {
  const out = [];
  const walk = (n, path, w, h) => n.parts.forEach((p, i) => {
    const pw = n.dir === 'across' ? (w * p.size) / UNITS : w;
    const ph = n.dir === 'down' ? (h * p.size) / UNITS : h;
    if (isSplit(p)) walk(p, [...path, i], pw, ph);
    else out.push({ path: [...path, i], band: p.band ?? null, size: p.size, frac: { w: pw, h: ph } });
  });
  if (grid) walk(grid, [], 1, 1);
  return out;
}

// The part at `path`, and the split holding it.
function find(grid, path) {
  if (!grid || !Array.isArray(path) || !path.length) return null;
  let parent = grid;
  for (let d = 0; d < path.length - 1; d += 1) {
    parent = parent.parts[path[d]];
    if (!isSplit(parent)) return null;
  }
  const k = path[path.length - 1];
  const part = parent.parts[k];
  return part ? { parent, k, part } : null;
}
// The split at `path` ([] is the top one).
function splitAt(grid, path) {
  if (!path.length) return grid;
  const f = find(grid, path);
  return f && isSplit(f.part) ? f.part : null;
}

// A layout with a grid, its bands put in the blocks' reading order: a band
// no block holds goes (the stack holds every band; a grid only what it
// shows). A layout with no grid comes back as it is.
export function settle(t) {
  if (!t?.grid) return t;
  const grid = clone(t.grid);
  const bands = [];
  const walk = (n) => n.parts.forEach((p) => {
    if (isSplit(p)) { walk(p); return; }
    if (p.band == null) return;
    const b = t.bands[p.band];
    if (!b) { delete p.band; return; }
    bands.push(b);
    p.band = bands.length - 1;
  });
  walk(grid);
  return { bands, grid };
}

// ── Changing a grid ──

// `t` turned into an empty `grid` (a ready-made one).
export const useGrid = (grid) => ({ bands: [], grid: clone(grid) });

// The block at `path` holds `band` now, in place of what it held.
export function fillBlock(t, path, band) {
  const grid = clone(t?.grid);
  const f = find(grid, path);
  if (!f || isSplit(f.part)) return t;
  const bands = [...(t.bands ?? []), band];
  f.part.band = bands.length - 1;
  return settle({ bands, grid });
}

// The block at `path` empty again; its band goes.
export function emptyBlock(t, path) {
  const grid = clone(t?.grid);
  const f = find(grid, path);
  if (!f || isSplit(f.part)) return t;
  delete f.part.band;
  return settle({ bands: t.bands, grid });
}

// The blocks at `a` and `b` trade what they hold.
export function swapBlocks(t, a, b) {
  const grid = clone(t?.grid);
  const fa = find(grid, a);
  const fb = find(grid, b);
  if (!fa || !fb || isSplit(fa.part) || isSplit(fb.part) || pathKey(a) === pathKey(b)) return t;
  const was = fa.part.band;
  if (fb.part.band == null) delete fa.part.band; else fa.part.band = fb.part.band;
  if (was == null) delete fb.part.band; else fb.part.band = was;
  return settle({ bands: t.bands, grid });
}

// After band `i` is taken out of `bands`: no block holds it, and the
// blocks after it count one less.
export function dropBand(grid, i) {
  const out = clone(grid);
  const walk = (n) => n.parts.forEach((p) => {
    if (isSplit(p)) { walk(p); return; }
    if (p.band === i) delete p.band;
    else if (p.band > i) p.band -= 1;
  });
  if (out) walk(out);
  return out;
}

// The edge after part `k` of the split at `path`, moved so part `k` takes
// `at` twelfths of the two parts' room (snapped whole, each side at least
// MIN_PART). Returns the grid as it was when nothing moves.
export function setEdge(grid, path, k, at) {
  const out = clone(grid);
  const n = splitAt(out, path);
  if (!n || !(k >= 0 && k < n.parts.length - 1)) return grid;
  const total = n.parts[k].size + n.parts[k + 1].size;
  const a = Math.max(MIN_PART, Math.min(total - MIN_PART, Math.round(at)));
  if (a === n.parts[k].size || total < MIN_PART * 2) return grid;
  n.parts[k].size = a;
  n.parts[k + 1].size = total - a;
  return out;
}

// The same edge, one twelfth (or `by`) further along.
export function nudgeEdge(grid, path, k, by) {
  const n = splitAt(grid, path);
  return n && n.parts[k] ? setEdge(grid, path, k, n.parts[k].size + by) : grid;
}

// What a split of the block at `path` would be refused for, or null:
// a grid holds 8 blocks; a split 4 parts; splits go 3 deep; each half at
// least ⅙.
export function cannotSplit(grid, path, dir) {
  const f = find(grid, path);
  if (!f || isSplit(f.part)) return 'gone';
  if (blocks(grid).length >= MAX_BLOCKS) return 'full';
  if (f.parent.dir === dir) {
    if (f.parent.parts.length >= MAX_PARTS) return 'crowded';
    if (f.part.size < MIN_PART * 2) return 'small';
    return null;
  }
  return path.length >= MAX_DEPTH ? 'deep' : null;
}

// The block at `path` cut in two, `across` (side by side) or `down` (one
// over the other): it keeps the first half and what it holds; the second
// half is a new empty block. Returns `t` as it was when it can't be split.
export function splitBlock(t, path, dir) {
  if (!DIRS.includes(dir) || cannotSplit(t?.grid, path, dir)) return t;
  const grid = clone(t.grid);
  const f = find(grid, path);
  const keep = f.part.band == null ? {} : { band: f.part.band };
  if (f.parent.dir === dir) {
    const first = Math.ceil(f.part.size / 2);
    f.parent.parts.splice(f.k, 1, { size: first, ...keep }, { size: f.part.size - first });
  } else {
    f.parent.parts[f.k] = { size: f.part.size, dir, parts: [{ size: 6, ...keep }, { size: 6 }] };
  }
  return settle({ bands: t.bands, grid });
}

// The block at `path` taken away: the next part (else the one before)
// takes its room, and what it held goes. A split left with one part is
// that part. The last block of a grid stays.
export function joinBlock(t, path) {
  const grid = clone(t?.grid);
  const f = find(grid, path);
  if (!f || isSplit(f.part) || blocks(grid).length <= 1) return t;
  const into = f.k + 1 < f.parent.parts.length ? f.k + 1 : f.k - 1;
  if (into < 0) return t;
  f.parent.parts[into].size += f.part.size;
  f.parent.parts.splice(f.k, 1);
  return settle({ bands: t.bands, grid: cleanGrid(grid, t.bands.length) ?? grid });
}

// ── Comparing and sizing ──

// A grid's shape, bands left out: two grids of one shape hold different groups.
export const shapeOf = (g) => (g ? JSON.stringify(g, (k, v) => (k === 'band' ? undefined : v)) : '');

// Which ready-made grid `t` is shaped like ('stacked' with no grid), or null.
export function gridShape(t) {
  if (!t?.grid) return 'stacked';
  return READY_GRIDS.find((r) => shapeOf(r.grid) === shapeOf(t.grid))?.id ?? null;
}

// How many pads across fill a block `w` × `h` px best (Ben's pick, 2026-10-19:
// the block decides), `n` of them with `gap` px between: the most columns
// whose pads come out biggest, as near square as the block lets them.
export function bestColumns(n, w, h, gap = 6) {
  if (!(n > 0) || !(w > 0) || !(h > 0)) return Math.max(1, Math.min(n || 1, 4));
  let best = 1;
  let size = -1;
  for (let c = 1; c <= n; c += 1) {
    const rows = Math.ceil(n / c);
    const s = Math.min((w - gap * (c - 1)) / c, (h - gap * (rows - 1)) / rows);
    if (s > size + 0.5) { size = s; best = c; }
  }
  return best;
}

// A share of twelfths as a kid reads it: ½, ⅓, ⅔, ¼, ¾, ⅙, ⅚, else 5/12.
const FRACS = { 2: '⅙', 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 9: '¾', 10: '⅚', 12: 'all' };
export const fraction = (units) => FRACS[units] ?? `${units}/12`;
