# Beats' settings menu: the play line, and 🎛️ for the rest

**Status: accepted, to build** (Ben, 2026-11-05). Mockup: [beat-menu-mockup.html](beat-menu-mockup.html) (the key there reads "100 ▾"; it reads 🎛️ over the number, below).

Ben, 2026-11-05: "bars and tempo are rarely used; they could all be moved into a sub menu along with anything like it." Then 🎛️ for the key (A).

## What changes

On 🥁 Beats, ⌨️ Keys off and on, at every width:

- **The play line** holds only what a kid taps while playing: ▶ Play, ● Record (Keys on), ↩️ Undo, ↪️ Redo, ✏️ Layout (Keys on), and the **🎛️ key** at its right end.
- **The 🎛️ key** shows 🎛️ over the tempo number (100), and a small dot while ⏲️ Click track is on, so a ticking click is never hidden. Its name: "Beat settings, tempo 100" (`aria-expanded`, `aria-controls`; the glyphs `aria-hidden`).
- **Tapping it opens one panel under the bar** (the tempo key's open line today, grown), in this order:
  1. Tempo: 🐢 the slider 🐇, the number, and ⏲️ Click track (its tap tempo stays on ⏲️, as today).
  2. Bars: 1 · 2 · 4.
  3. Feel: Straight · Swing · Shuffle (Regular and Advanced, Keys off and on).
  4. Time signature (Advanced).
  5. 🎚️ Mixer and ⇆ Move pills, worded.
- **It closes** on the key again, Esc (`preventDefault`, focus back on the key), or a tap outside, and that tap only closes it: it never also plays a pad or flips a pill.
- **The bars line goes.** Every phone gains a line of rows.
- The panel stays short: from 700 px its parts sit side by side, so the rows stay in view on a 680 px tall phone; it never scrolls sideways.
- The chosen Bars, Feel and signature option shows a ✓ as well as yellow (`aria-pressed`). While ● Record records, Bars and signature wait, `aria-disabled` with their reason in the name, as today.
- Opening or closing the panel never stops a beat, ⏲️ or a recording, and saves nothing of its own. Its open state is not remembered: it starts closed.

## What stays

- Every value keeps its stored field (`bpm`, `bars`, `swing`, `signature`, the click's setting); nothing new is stored or synced. Layout only.
- 🎼 Song and 🎤 Live keep their bars as they are.
- The tempo key on Song and Live works as today (`tempo-key.js` stays generic: the Beats panel is its own wiring or a per-screen class, not a branch inside it).

## Costs, named for Ben

- 🎚️ Mixer and ⇆ Move pills go from one tap to two.
- ⏲️ Click track is in the panel with Keys on too (the producer seat wanted it beside ● Record; there is no room on a phone). The dot on 🎛️ shows it is on.
- With Keys on at 320 px six controls share the line; if `just look` shows they don't fit, ✏️ Layout joins the panel on the narrowest phones only.

## The council (2026-11-05)

All 22 seats on the mockup: 5 ✅, 17 ✏️, no block. Folded in above: a picture on the key (amateur, pre-reader, child psychologist, music educator, accessibility; Ben chose 🎛️); the click's dot (sound designer, child psychologist); Feel with Keys on (producer); a tap outside only closes (child psychologist, kids-ux, parent); a short panel, side by side from 700 px (kids-ux, producer, browser); ✓ and names (accessibility); no new stored field (storage, reliability, architect); classes, never inline style (security). To check when built: the bars and signature rows' Undo through ↩️ (parent), a tempo change while playing retimes on the audio clock as today (audio), no long frame while dragging the slider at `--cpu 4` (performance), `just look` views for the panel open (devex), the decisions rows that place ⏲️, ⇆ and the phone grid on the bar replaced (docs).
