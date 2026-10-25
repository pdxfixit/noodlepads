# Beat rows with the controls on the left

Status: design agreed (2026-10-25); the build plan waits for Ben's OK.
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

## Ben's second answers (2026-10-25)

| Question | Answer |
|---|---|
| Wide row header | The slimmer one: ⠿ · emoji · name · 🔊, about 250 px (1.45 bars at 1100 px, against 1.31 with every button). |
| ⌨️ Keys on | Keeps its slivers: the whole beat on one line, no scroll. Its controls move to the left column like the rest. |
| Moving a row on a phone | ↑ ↓ in the emoji's menu is enough. |

Calls made without asking, named in the report:
- The emoji opens the same row menu at every width, so the wide header has no ⋯ (Ben had picked "name, 🔊, ⋯"; the emoji already is the menu).
- ▾ Fold goes; a stored `collapsed` is still read and ignored.
- 🧸 Kids stays as it is.
- A bar ruler (1 · · · 2 …) sits above the scrolling rows, so a kid knows where they are.

## Build plan

1. Beats rows (⌨️ Keys off): one line each in one sideways scroller, the sticky left header, the row menu, a single playhead that follows by page turns and stops when the kid scrolls, pills that flip only on a tap that stays put. Retire the wrapping (`layoutMeasures`, `barsPerLine`, `pillHeight`) and the fold. ⇆ Move, mouse picking and the ⠿ drag keep working inside the scroller.
2. ⌨️ Keys on: the same left header (emoji + 🔊, the menu), the slivers unchanged.
3. 🎹 Piano roll: the same follow rule; the drums strip lined up with the notes.
4. 🎼 Song: lane headers in the same style; its playhead follow stops when the kid scrolls (today it always pulls back).
5. Docs and checks: decisions.md (the row rows, and "nothing scrolls sideways" gets these grids as an exception), guide.md, ❓ Help lines, `just look` views, tests.
