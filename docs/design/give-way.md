# Give-way order

What gives way when a line of controls runs out of room, everywhere in the app. Ben, 2026-11-18: "set up a global pattern of order of operations for when buttons have to appear or disappear so that this question doesn't come up again and again but we have consistency across the app." The order lives in code as `web/give-way.js` (`GIVE_WAY`, `DOUBLES`); `tests/give-way.test.mjs` holds the bars to it.

## The order

Every line takes these stages in this order, and never skips back:

1. **Tight.** Padding, then gaps, tighten. A key never goes under 44 px; gaps never under 4 px.
2. **Compact.** A group compacts: keys become a picker (`lines.js` `pickerFor`), a slider with few stops becomes keys or keys fall back to the slider (`KEYED_STEPS`), and a slider the page also shows elsewhere steps out to it (Pad size waits at the top of the page).
3. **Words.** Words go, the least-used key's word first (the same order its key would fold in). The emoji stays; screen readers and the tooltip keep the whole name. A second word goes before the first ("sounds" before "Edit").
4. **Doubles.** Keys the screen also shows elsewhere step out, always in `DOUBLES` order: ❓ Help (back at the top of the screen), then ⬆️ back to the top (the page scrolls there itself), then ⚙️ Settings (the way to everything else, so last).
5. **Fold.** What still doesn't fit folds into a ⋯ at the line's end, the least-used first.

**Never gives way:** the screen's main action (▶ Play, ● Record, ✏️ Edit, + New sound) and the person's round button. They stay at every width, 44 px or more.

## How a line follows it

- **Measured is better than a breakpoint.** A line measured on its own width (`lines.js` `fitLine`, `foldLine`, `mini-deck.js`) degrades the same on any screen, font or language. A fixed breakpoint is allowed where the line's room is known; its steps must still come in the order above, widest first.
- **Name the stage.** A comment on each step says which stage it is, so the next change slots into the right place.
- **A new key in a bar** takes its place in the order: decide which stage it gives way in (or that it never does), then check every width with `just look --wide`.

## Where it applies now

| Line | How | Order |
|---|---|---|
| 🔊 Pads slim band | breakpoints | tight <720 · Pad size <700 · words <600, <530, <470 · ❓ <420 · ⬆️ <360 |
| 🥁 Beats slim bar (tucked deck) | measured (`mini-deck.js`, `STEPS` from `DOUBLES`) | ❓ · ⬆️ · ⚙️ |
| 🎤 Live's control bar | breakpoints, then measured fold | words <760 (🎬, 🔔, ✏️) · fold 🎬, ✏️, 🔔 |
| Toolbar, beat bar, keyed slider rows | measured (`fitLine`) | tight · words or compact |

The lines not yet in this order are listed in [TODO.md](../../TODO.md) "Agents do".
