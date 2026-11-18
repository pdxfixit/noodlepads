// The app's one give-way order (Ben, 2026-11-18: "a global pattern of order
// of operations for when buttons have to appear or disappear … consistency
// across the app"). Every line of controls that runs out of room gives way in
// these stages, in this order, and never skips back (docs/design/give-way.md):
//
//   1 tight     spacing tightens: padding, then gaps (never a key under 44 px)
//   2 compact   a group compacts: keys become a picker, a slider steps out to
//               where it also lives (Pad size waits at the top of the page)
//   3 words     words go, the least-used key's first; the emoji stays, and
//               screen readers and the tooltip keep the name
//   4 doubles   keys the screen also shows elsewhere step out, in DOUBLES order
//   5 fold      what is left over folds into a ⋯ at the line's end, the
//               least-used first
//
// Never: the screen's main action (▶ Play, ● Record, ✏️ Edit, + New sound)
// and the person's round button stay at every width.

export const GIVE_WAY = ['tight', 'compact', 'words', 'doubles', 'fold'];

// Stage 4, in order: ❓ is back at the top of the screen; ⬆️ only scrolls
// there; ⚙️ is the last, as it is the way to everything else (Ben,
// 2026-10-25, for Beats' slim bar; every slim bar since 2026-11-18).
export const DOUBLES = ['help', 'top', 'settings'];
