# ▦ Layout grids: blocks side by side, resized by their edges

Ben, 2026-10-19, on the ✏️ Layout mockups (https://claude.ai/artifact/1yWPXSmMheecBRQ4urP6f3, artboards 4 and 5): "B; but i want to move toward a customizeable grid layout, where like a frame/window slider, one could resize the dimensions of a grid area"; then "go with the recommendations" on the four questions at the end. The stored shape is [ADR 0032](../adr/0032-layout-grids.md); the rules are in docs/decisions.md (Live).

**Answer.** With 👆 Pads, a touch layout can become a grid of blocks. ✏️ Layout offers empty grids (dashed blocks, some side by side); a kid drags a group onto each. The edge between two blocks drags like a window splitter, snapping to halves, thirds and quarters. Each block's pads fill it. The bands stay what holds the sounds, so an older copy still plays the same sounds, stacked.

## What a kid sees

- **Playing.** The pads area is a frame of blocks, like a pad controller: 🥁 Drums as a big 2 × 2 on the left, 🎶 Chords as a column on the right, 🐘 Bass as a strip across the bottom. Each block's pads are as big as the block allows.
- **✏️ Layout, 👆 Pads.** Grids shows the empty grids as small pictures (Big + small, Two + one, Four corners, Three columns). A tap on one turns the board into its dashed blocks, each saying "Drop a group here" (the board as it was is kept as ⭐ My layout, as a ready-made one is today). The groups sit in a tray at the bottom: drag one onto a block, or tap the group, then the block. A filled block keeps today's band controls: ✕, + more, a pad tapped to swap, 🎹 who plays.
- **Resizing.** Between two blocks sits a handle (a short bar on the edge, 44 px to grab). Drag it: the blocks on either side grow and shrink, snapping to ¼, ⅓, ½, ⅔ and ¾, with the fraction shown while dragging. ↩️ Undo takes a drag back. A block never goes under a set minimum (about 2 pads of 64 px).
- **Splitting and joining.** A block's ⋯ has ⇹ Split across and ⇳ Split down (two halves, the new one empty and dashed) and ✕ Join with the next (the group goes back to the tray). That is how a kid makes a grid of their own past the presets.

## Stored shape

The touch layout keeps `bands` and gains an optional `grid` that places them: a tree of splits, as window splitters nest, so a block can be split down inside a row of blocks (rows of cells could not):

```
touch  {bands: [{group, size, sounds}…],
        grid?: {dir: 'across' | 'down', parts: [{size, band?} | {size, dir, parts}…]}}
```

- Each part takes `size` twelfths of its split (so ¼ ⅓ ½ all fit). `band` is an index into `bands`; left out, the block is empty and dashed.
- At most 4 parts a split, 3 splits deep, 8 blocks; at most 8 bands, as today. The bands follow the blocks' reading order.
- `size` stays on each band, unused while a `grid` is there; with no `grid` the layout is today's stack.
- Saved layouts (`touchLayouts`) and ⭐ My layout carry `grid` the same way. Ready-made grids are code in `touch.js`, as `READY_TOUCH` is.
- No IndexedDB version: `grid` rides inside the `touch` field the deck already has. Backups stay format 1.1 (additive). No D1 migration: records are JSON.

**Older copies.** `cleanTouch` there drops `grid`, so an older copy shows the same bands stacked and plays the same sounds. If it then saves the person's keys and syncs, the `grid` it dropped is lost and the kid sees the stack on every device (the same risk ADR 0029 took; the update bar asks such a copy to reload). An ADR records this.

## Screens

- **Height.** A grid fills the room it has, like a controller: on 🎤 Live the height under the bar down to the toolbar; on Beats with ⌨️ Keys, under the beat's rows, at least 320 px. Today's stack grows the page instead.
- **Phone first.** The grid is the same shape at every width; the kid builds it on the screen they play on. A block is at least ⅙ of its split, so at 320 px its pads are still 44 px or more.
- **Wide screens.** The frame stops at 1500 px wide, centered, as the keys do; pads stop growing at 220 px.

## Phases

1. **Preset grids, fixed** (built 2026-10-19): `web/touch-grid.js` (shape, cleaning, ready-made grids), drawing it in `dj-touch.js`, Grids and a tap or drop onto a block in ✏️ Layout.
2. **Resize by the edges** (about half a day): the splitter handles, snapping, Undo, the minimum, keyboard (← → on a focused handle).
3. **Split and join** (a few hours): a block's ⋯.

Each phase ships on its own; phase 1 is useful without the others.

## Questions for Ben (answered 2026-10-19: the recommendations)

1. **Pad size in a block.** Recommended: the block decides (pads fill it, as many across as fit at about 64 px, then bigger); S M L goes away in grid layouts. Or: keep S M L per block, and a block too small scrolls.
2. **Height.** Recommended: a grid fills the room under the bar, like a controller (above). Or: it grows the page, as the stack does now.
3. **Split and join (phase 3).** Recommended: yes, it is what makes the grid the kid's own. Or: presets plus resizing only.
4. **Today's stack.** Recommended: keep it as one of the presets ("Stacked", every band full width), so nothing a kid made changes. Or: turn every saved layout into a grid of full-width rows.
