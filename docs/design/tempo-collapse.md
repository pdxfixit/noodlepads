# One-line control bars on phones

Ben, 2026-10-26: "I want the BPM control to be far more capable of collapsing in small width settings across all interfaces. So maybe it's some sort of a click open slider, right? I don't know. I'm open to what that looks like but these buttons all need to live on the same line like even takes should be reduced down to just an emoji when things are compressed."

Mockup: [tempo-collapse-mockup.html](tempo-collapse-mockup.html) (open it from a checkout; it loads the app's fonts from `web/fonts/`).

## The proposal

- Where a bar runs short of room, its controls give up words before they wrap: 🎬 Takes → 🎬, ● Record → ●. Every key stays at least 44 px wide and 52 px tall.
- The tempo (now a slider, or ⌄ 100 BPM ⌃ on a phone) becomes one key showing the number. Tapping it opens the tempo: the slider, ⌄ ⌃ for the next common tempo, and the number to tap and type. The tempo changes as it moves. Tapping outside, the key again, or Esc closes it.
- Two ways it could open: **A**, a panel drops down under the bar, over the top of the pads or rows; **B**, the bar's line itself turns into the tempo, with ✓ to go back, so nothing under it moves or is covered.
- The same tempo key on every screen with a tempo: 🎤 Live (the click's tempo), 🥁 Beats with ⌨️ Keys on and off, and 🎼 Song (in place of ➖ 100 BPM ➕).
- On wider screens nothing changes: the slider stays in the bar.

| Screen | Now, 375 px | Proposed, 375 px |
|---|---|---|
| 🎤 Live | 2 lines | 1 line (● · 100 · ⏲️ 🔔 ✏️ 🎬) from 360 px; 2 lines at 320 |
| 🥁 Beats with ⌨️ Keys | 3 lines | 2 lines |
| 🥁 Beats | 2 lines | 2 lines, ▶ Play wider |
| 🎼 Song | 3 lines | 2 lines |

At 320 px the bar has 264 px inside, and six 44 px keys with gaps need about 284, so 🎤 Live keeps two lines on the narrowest phones.
