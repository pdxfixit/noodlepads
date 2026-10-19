// 👆 Layout grids' pure rules (web/touch-grid.js, ADR 0032): blocks side by
// side, each holding one band, resized by their edges, split and joined.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  READY_GRIDS, cleanGrid, blocks, settle, useGrid, fillBlock, emptyBlock, swapBlocks, dropBand, setEdge, nudgeEdge,
  splitBlock, joinBlock, cannotSplit, gridShape, bestColumns, fraction, pathKey, pathOf, MAX_BLOCKS,
} from '../web/touch-grid.js';
import { cleanTouch, cleanTouchLayout, removeBand, sameTouch, touchSounds, touchOrder, addSounds } from '../web/touch.js';

const band = (group, ...sounds) => ({ group, size: 'm', sounds });
const twoOne = () => READY_GRIDS.find((r) => r.id === 'two-one').grid;
const keys = (g) => blocks(g).map((b) => pathKey(b.path));

test('every ready-made grid is clean as it is, every block empty', () => {
  for (const r of READY_GRIDS) {
    assert.deepEqual(cleanGrid(r.grid), r.grid, r.id);
    assert.ok(blocks(r.grid).every((b) => b.band == null), r.id);
  }
  assert.deepEqual(keys(twoOne()), ['0-0', '0-1', '1'], 'reading order: the top line left to right, then the bottom');
  const [drums, chords, bass] = blocks(twoOne());
  assert.deepEqual([drums.frac.w, drums.frac.h], [8 / 12, 8 / 12], 'a block knows its share of the whole');
  assert.deepEqual([chords.frac.w, bass.frac.w, bass.frac.h], [4 / 12, 1, 4 / 12]);
});

test('cleaning: sizes become twelfths, bad bands go, a split the same way joins its parent, one part is that part', () => {
  assert.equal(cleanGrid(null), null);
  assert.equal(cleanGrid({ dir: 'sideways', parts: [{ size: 6 }] }), null);
  assert.equal(cleanGrid({ dir: 'across', parts: [] }), null);
  assert.deepEqual(cleanGrid({ dir: 'across', parts: [{ size: 1 }, { size: 1 }, { size: 1 }] }).parts.map((p) => p.size), [4, 4, 4]);
  assert.deepEqual(cleanGrid({ dir: 'across', parts: [{ size: 2, band: 0 }, { size: 1, band: 0 }, { size: 1, band: 7 }, { size: 1, band: 1.5 }] }, 2).parts,
    [{ size: 6, band: 0 }, { size: 2 }, { size: 2 }, { size: 2 }], 'a band used twice, past the bands or not whole is no band');
  assert.deepEqual(cleanGrid({ dir: 'across', parts: [{ size: 6 }, { size: 6, dir: 'across', parts: [{ size: 6 }, { size: 6 }] }] }).parts.map((p) => p.size), [6, 3, 3]);
  assert.deepEqual(cleanGrid({ dir: 'across', parts: [{ size: 6 }, { size: 6, dir: 'down', parts: [{ size: 12, band: 0 }] }] }, 1).parts, [{ size: 6 }, { size: 6, band: 0 }]);
  assert.deepEqual(cleanGrid({ dir: 'down', parts: [{ size: 12, dir: 'across', parts: [{ size: 6 }, { size: 6 }] }] }), { dir: 'across', parts: [{ size: 6 }, { size: 6 }] });
  const many = { dir: 'across', parts: Array.from({ length: 4 }, () => ({ size: 3, dir: 'down', parts: [{ size: 4 }, { size: 4 }, { size: 4 }] })) };
  assert.equal(blocks(cleanGrid(many)).length, MAX_BLOCKS, 'at most 8 blocks');
  const deep = { dir: 'across', parts: [{ size: 6 }, { size: 6, dir: 'down', parts: [{ size: 6 }, { size: 6, dir: 'across', parts: [{ size: 6 }, { size: 6, dir: 'down', parts: [{ size: 6 }, { size: 6 }] }] }] }] };
  assert.equal(Math.max(...blocks(cleanGrid(deep)).map((b) => b.path.length)), 3, 'splits go 3 deep at most');
});

test('settle: bands follow the blocks\' reading order, and a band no block holds goes', () => {
  const t = { bands: [band('bass', 'b'), band('drums', 'k'), band('notes', 'n')], grid: { dir: 'across', parts: [{ size: 6, band: 1 }, { size: 6, band: 0 }] } };
  assert.deepEqual(settle(t), { bands: [band('drums', 'k'), band('bass', 'b')], grid: { dir: 'across', parts: [{ size: 6, band: 0 }, { size: 6, band: 1 }] } });
  const stack = { bands: [band('bass', 'b')] };
  assert.equal(settle(stack), stack, 'no grid: as it was');
});

test('filling, emptying and swapping blocks', () => {
  let t = useGrid(twoOne());
  assert.deepEqual(t.bands, []);
  t = fillBlock(t, [1], band('bass', 'b1'));
  t = fillBlock(t, [0, 0], band('drums', 'k', 's'));
  assert.deepEqual(t.bands.map((b) => b.group), ['drums', 'bass'], 'reading order, whatever order they came in');
  assert.deepEqual(blocks(t.grid).map((b) => b.band), [0, null, 1]);
  t = fillBlock(t, [0, 0], band('animals', 'moo'));
  assert.deepEqual(t.bands.map((b) => b.group), ['animals', 'bass'], 'a filled block takes the new group in place of its old one');
  t = swapBlocks(t, [0, 0], [0, 1]);
  assert.deepEqual(blocks(t.grid).map((b) => b.band), [null, 0, 1]);
  t = emptyBlock(t, [0, 1]);
  assert.deepEqual(t.bands.map((b) => b.group), ['bass']);
  assert.deepEqual(blocks(t.grid).map((b) => b.band), [null, null, 0]);
  assert.equal(fillBlock(t, [5], band('drums')), t, 'no block there: unchanged');
  assert.equal(fillBlock(t, [0], band('drums')), t, 'a split is no block');
});

test('touch.js keeps the grid: a band removed empties its block; sounds, rows and saves follow the blocks', () => {
  let t = fillBlock(fillBlock(useGrid(twoOne()), [0, 0], band('drums', 'k', 's')), [0, 1], band('chords', 'c'));
  t = fillBlock(t, [1], band('bass', 'b'));
  t = addSounds(t, 1, ['am']);
  assert.ok(t.grid, 'a band\'s sounds change, the grid stays');
  assert.deepEqual(touchSounds(t), ['k', 's', 'c', 'am', 'b']);
  assert.deepEqual(touchOrder([{ clipId: 'b' }, { clipId: 'c' }, { clipId: 'k' }], t), [2, 1, 0], 'the beat\'s rows read the blocks in order');
  const out = removeBand(t, 0);
  assert.deepEqual(out.bands.map((b) => b.group), ['chords', 'bass']);
  assert.deepEqual(blocks(out.grid).map((b) => b.band), [null, 0, 1], 'its block stays, empty');
  assert.deepEqual(dropBand({ dir: 'across', parts: [{ size: 6, band: 0 }, { size: 6, band: 1 }] }, 0).parts, [{ size: 6 }, { size: 6, band: 0 }]);
  assert.deepEqual(cleanTouch(t), t, 'clean as it is');
  assert.equal(sameTouch(t, { bands: t.bands }), false, 'the same bands stacked are another layout');
  const saved = cleanTouchLayout({ id: 'touch-1', personId: 'pip', name: 'Mine', created: 1, ...t });
  assert.deepEqual(saved.grid, t.grid, 'a saved layout keeps its grid');
  assert.equal(cleanTouchLayout({ id: 'touch-2', personId: 'pip', name: 'Old', created: 1, bands: t.bands }).grid, undefined);
  // A band that fails cleaning: the blocks after it still point at theirs.
  const odd = cleanTouch({ bands: [{ group: 'NOPE!' }, band('drums', 'k')], grid: { dir: 'across', parts: [{ size: 6, band: 0 }, { size: 6, band: 1 }] } });
  assert.deepEqual(odd, { bands: [band('drums', 'k')], grid: { dir: 'across', parts: [{ size: 6 }, { size: 6, band: 0 }] } });
  assert.deepEqual(cleanTouch({ bands: [band('drums')], grid: { dir: 'nope' } }), { bands: [band('drums')] }, 'a broken grid: the stack');
});

test('edges: an edge moves in twelfths, never leaving a part under ⅙; ← → nudge it', () => {
  const g = twoOne();
  assert.deepEqual(setEdge(g, [0], 0, 6).parts[0].parts.map((p) => p.size), [6, 6], 'drums and chords half and half');
  assert.deepEqual(setEdge(g, [0], 0, 11.4).parts[0].parts.map((p) => p.size), [10, 2], 'chords keeps ⅙');
  assert.deepEqual(setEdge(g, [0], 0, 0).parts[0].parts.map((p) => p.size), [2, 10]);
  assert.deepEqual(setEdge(g, [], 0, 9).parts.map((p) => p.size), [9, 3], 'the line between the top and the bottom');
  assert.equal(setEdge(g, [], 1, 6), g, 'no edge after the last part');
  assert.equal(setEdge(g, [1], 0, 6), g, 'a block has no edges inside');
  assert.equal(setEdge(g, [0], 0, 8), g, 'where it is already');
  assert.deepEqual(nudgeEdge(g, [0], 0, -1).parts[0].parts.map((p) => p.size), [7, 5]);
  assert.deepEqual(g.parts[0].parts.map((p) => p.size), [8, 4], 'never changes the grid it was given');
});

test('splitting: the block keeps its group in the first half; a split the other way nests', () => {
  let t = fillBlock(useGrid(twoOne()), [0, 0], band('drums', 'k'));
  const across = splitBlock(t, [0, 0], 'across');
  assert.deepEqual(across.grid.parts[0].parts, [{ size: 4, band: 0 }, { size: 4 }, { size: 4 }], 'in its own line: two parts in its room');
  const down = splitBlock(t, [0, 0], 'down');
  assert.deepEqual(down.grid.parts[0].parts[0], { size: 8, dir: 'down', parts: [{ size: 6, band: 0 }, { size: 6 }] });
  assert.equal(blocks(down.grid).length, 4);
  t = useGrid({ dir: 'across', parts: [{ size: 3 }, { size: 3 }, { size: 3 }, { size: 3 }] });
  assert.equal(cannotSplit(t.grid, [0], 'across'), 'crowded', 'four in a line at most');
  assert.equal(splitBlock(t, [0], 'across'), t);
  t = useGrid({ dir: 'across', parts: [{ size: 9 }, { size: 3 }] });
  assert.equal(cannotSplit(t.grid, [1], 'across'), 'small', 'halves of ⅙ at least');
  assert.equal(cannotSplit(t.grid, [1], 'down'), null);
  const deep = useGrid({ dir: 'across', parts: [{ size: 6 }, { size: 6, dir: 'down', parts: [{ size: 6 }, { size: 6, dir: 'across', parts: [{ size: 6 }, { size: 6 }] }] }] });
  assert.equal(cannotSplit(deep.grid, [1, 1, 0], 'down'), 'deep');
  assert.equal(cannotSplit(deep.grid, [1, 1, 0], 'across'), null, 'the same way as its split is fine');
  const eight = useGrid({ dir: 'down', parts: [0, 1].map(() => ({ size: 6, dir: 'across', parts: [{ size: 3 }, { size: 3 }, { size: 3 }, { size: 3 }] })) });
  assert.equal(cannotSplit(eight.grid, [0, 0], 'down'), 'full');
});

test('joining: the next part takes the block\'s room (else the one before), a lone part is lifted, the last block stays', () => {
  let t = fillBlock(fillBlock(useGrid(twoOne()), [0, 0], band('drums', 'k')), [0, 1], band('chords', 'c'));
  const j = joinBlock(t, [0, 0]);
  assert.deepEqual(j.grid, { dir: 'down', parts: [{ size: 8, band: 0 }, { size: 4 }] }, 'chords takes the top line, which is no split any more');
  assert.deepEqual(j.bands.map((b) => b.group), ['chords'], 'drums goes with its block');
  const back = joinBlock(t, [1]);
  assert.deepEqual(back.grid, { dir: 'across', parts: [{ size: 8, band: 0 }, { size: 4, band: 1 }] }, 'the bottom joins the one before; the top line is the whole grid now');
  const one = useGrid({ dir: 'across', parts: [{ size: 12 }] });
  assert.equal(joinBlock(one, [0]), one);
});

test('shapes, pad columns and fractions', () => {
  assert.equal(gridShape({ bands: [] }), 'stacked');
  assert.equal(gridShape(fillBlock(useGrid(twoOne()), [1], band('bass'))), 'two-one', 'what a block holds is no part of its shape');
  assert.equal(gridShape({ bands: [], grid: setEdge(twoOne(), [], 0, 6) }), null, 'a resized one is the kid\'s own');
  assert.equal(bestColumns(4, 300, 300), 2, 'a square block: 2 × 2');
  assert.equal(bestColumns(4, 600, 100), 4, 'a wide strip: one line');
  assert.equal(bestColumns(4, 100, 600), 1, 'a tall column: one across');
  assert.equal(bestColumns(5, 343, 120), 5);
  assert.equal(bestColumns(3, 0, 0), 3, 'unmeasured: a guess');
  assert.deepEqual([6, 4, 8, 3, 9, 2, 5].map(fraction), ['½', '⅓', '⅔', '¼', '¾', '⅙', '5/12']);
  assert.deepEqual(pathOf('0-1'), [0, 1]);
  assert.equal(pathOf('a'), null);
});
