# 0033. Play and Make: two modes in the bottom bar

**Status:** Accepted (2026-10-26), built (2026-10-26). Replaces [ADR 0017](0017-four-peer-tabs.md)'s four peer tabs; the rest of 0017 (Beats' ⌨️ Keys, one open beat, Song for everyone, Live) stands.

## Context

On 2026-10-25 Beats' rows, the 🎹 piano roll and 🎼 Song came to share one layout: heads on the left, time running across, scrolling sideways. Ben: "I keep wondering if there's a massive UI shift to have maybe like a singular interface and somehow a distributed pair of interfaces." Two shifts were offered: one timeline that zooms (Song → a beat's rows → a tune's notes), or splitting the app by its two jobs. Ben chose the split: "make the two interfaces play and make." The zooming timeline was set aside: weeks of work, and a 5-year-old needs a flat, obvious place more than a deep one.

## Decision

- The bottom bar has two modes, then ⏹️ Stop all: **🎉 Play** (🔊 Pads, 🎤 Live) and **🛠️ Make** (🥁 Beats, 🎼 Song). The 🎹 piano roll opens from Beats, as before.
- The open mode is one light box holding its name and its two screens, the one showing lit yellow. The other mode is one button that goes back to the screen it last had (`play-side`, `make-side`, per device), else its first. Ben, 2026-10-26, picked this over a switch at the top of each screen: the bar stays as tall as it was, and nothing scrolls away.
- Play stays at the left and Make in the middle, open or not, so neither moves under a finger.
- Recording keys into a beat (Beats' ⌨️ Keys, ● Record) stays in Make. 🧸 Kids is unchanged.
- The four screens keep their names and ids (`pads`, `live`, `beats`, `song`), in the page, the event log and the code; only the bar groups them.

## Options considered

- **A switch at the top of each tab** (two tabs, 🔊 Pads | 🎤 Live under the header): the first mockup. It costs a line on every screen and scrolls away on a long beat.
- **Four tabs, grouped** under two small labels: mostly a look, and four equal choices still.
- **One zooming timeline**: see Context.

## Consequences

- Going from Pads to Song is two taps (🛠️ Make, then Song) where it was one; going back to where you were in a mode is one.
- Help's tabs follow the bar: Pads, Sounds, Live, Beats, Song, Settings.
- A third mode, or a third screen in one, would need the bar's room checked again at 320 px.
