# Beat rows with the controls on the left

Status: mockup shown, waiting for Ben's OK before building (2026-10-25).
Mockup: [beat-rows-mockup.html](beat-rows-mockup.html) (open it in a browser; it uses the real 🍭 Pop groove, no sound).

## The idea

Every beat row has its controls in a column on the left and its pills on one line, and the grid scrolls sideways. 🧸 Kids' beat grid on a wide screen started it: emoji on the left, one line of squares. An H/V toggle was weighed first and dropped: a time-down grid fits about 6 instruments across a 320 px phone and 7 across 375, and half the 51 grooves have 8 rows or more.

## Ben's answers (2026-10-25)

| Question | Answer |
|---|---|
| Phone row header | Emoji + 🔊. A tap on the emoji opens the row's menu: 🔄 Change sound, 🔔 Overlap, 🧹 Clear, ✕ Remove, ↑ ↓ Move. |
| How much time a phone shows | Half a bar, at today's pill size (about 7–8 pills). No skinny pills, no every-other-pill view. |
| Follow the playhead | Yes: a page turn a screen at a time; a scroll by the kid stops following until the next ▶︎ Play. |
| Wide screens | One line and sideways scroll everywhere; bars no longer wrap. |
| Scope | Every form: Beats rows (⌨️ Keys off and on), the 🎹 piano roll's drums strip, 🎼 Song lanes. |

## What the mockup measured

| | Today | Mockup |
|---|---|---|
| Pop at 375 px, rows' height | 5,564 px page (each row 8 lines) | 810 px panel |
| Time on screen at 375 | a whole bar, wrapped | 7 pills (0.48 bar) |
| Time on screen at 1100, every button in the header (360 px) | a bar a line | 21 pills (1.31 bars) |

## Open before building

- On a phone, is ↑ ↓ in the menu enough to reorder, or does a held emoji drag the row?
- ▾ Fold goes (a one-line row has nothing to fold).
- From 700 px the header shows every button (⠿ emoji name 🔔 🔊 🧹 ✕): 360 px at 1100 leaves 1.31 bars. A slimmer wide header (name, 🔊, ⋯) would show about 1.6.
- ⌨️ Keys on today shows all 64 pills of a 4-bar row as thin slivers on one line, so the whole beat shows while recording. The same rows as Keys off lose that.
- 🧸 Kids stays as it is.
- "Nothing scrolls sideways" (decisions.md) needs an exception for these grids, as the 🎚️ Mixer has. Recorded with the build.
