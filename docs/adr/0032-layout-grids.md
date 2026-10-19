# 0032. 👆 Layout grids: a tree of splits placing the touch layout's bands

- **Status:** Accepted (2026-10-19); phases 1 and 2 built (ready-made grids, filled by a tap or a drag; edges dragged)
- **Date:** 2026-10-19
- **Decided by:** Ben, 2026-10-19, on the ✏️ Layout mockups (https://claude.ai/artifact/1yWPXSmMheecBRQ4urP6f3): option B, blocks side by side, "toward a customizeable grid layout, where like a frame/window slider, one could resize the dimensions of a grid area"; then "go with the recommendations" on the four questions in [docs/design/layout-grids.md](../design/layout-grids.md). Rows in [decisions.md](../decisions.md) (Live).

**In short.** A touch layout ([ADR 0029](0029-touch-layouts.md)) may carry a `grid`: a tree of splits, each laying its parts across or down in twelfths, each part a block holding one band (by index) or a split of its own. The bands stay what holds the sounds. No IndexedDB version, no backup format change, no D1 migration: `grid` rides inside `decks.touch`, `decks.touchMine` and `touchLayouts` records, which are already JSON.

## Context

- The stack of bands (ADR 0029) reads like a list. Ben wants a pad controller: groups side by side, and areas a kid resizes by dragging their edges.
- Rows of cells cannot split one block down inside a row. Window managers and splitters solve this with a tree of splits.
- An older copy of the app, still open somewhere, must not lose a kid's sounds.

## Decision

- **The shape** (`web/touch-grid.js`): `grid {dir: 'across' | 'down', parts: [part]}`; a part is `{size, band?}` (a block; no `band` is an empty, dashed one) or `{size, dir, parts}` (a split inside it). `size` is twelfths of its split, whole, adding up to 12, each at least 2 (⅙) when an edge moves. At most 4 parts a split, 3 splits deep, 8 blocks.
- **The bands follow the blocks.** With a grid, `bands` are exactly the ones the blocks hold, in reading order (top split first, each part in turn), each once. `cleanTouch` puts any layout in that order (`settle`) and drops a band no block holds. The beat's rows (Beats with ⌨️ Keys) follow that order, as they follow the stack's.
- **Pads fill their block.** In a grid a band's `size` (S M L) waits unused; the block's own size picks the columns that make its pads biggest (`bestColumns`). The grid fills the room under the bar, at least 320 px tall.
- **Ready-made grids** are code (`READY_GRIDS`: Two and one, Four corners, Three across, Side by side), every block empty. ☰ Stacked is no grid, and stays the default and the shape of every layout made before.
- **Cleaning** (`cleanGrid`, through `cleanTouch` and `cleanTouchLayout`): sizes are rescaled to twelfths, a split inside a split the same way joins its parent, a split of one part is that part, a split too deep is an empty block, and a band index that is not whole, past the bands or used twice is no band. A broken grid leaves the stack.

## Options turned down

- **Rows of cells.** Simpler, but a block could not be split down inside a row of blocks.
- **Each block holding its band inline** (no `bands`). An older copy would see a layout with no sounds at all.
- **Free sizes in pixels or percentages.** Twelfths snap to ¼ ⅓ ½ ⅔ ¾, keep backups small and compare exactly (`gridShape`).

## Consequences

- An older copy of the app drops `grid` when it cleans the deck: it shows the same bands stacked, in the blocks' order, and plays the same sounds. If it then saves the person's keys and syncs, the grid is lost on every device (the risk ADR 0029 took for `touch`); the update bar asks such a copy to reload. A saved layout it pulls loses its grid only if that copy saves it again.
- A backup made by this copy loads in an older 1.x copy as the stacks.
- `sameTouch` compares grids too, so a resized grid is the kid's own layout, kept as ⭐ My layout when another one is loaded.
