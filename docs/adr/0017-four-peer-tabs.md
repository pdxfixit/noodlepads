# 0017. Four peer tabs: Pads, Beats, Song, Live

**Status:** Accepted (2026-10-12), built (2026-10-12)

## Context

Ben (2026-10-12): "i'd prefer we deal with freestyle/beat builder as equally as song/beats. so maybe rethink the whole structure?" The app had three tabs, 🔊 Pads · 🥁 Beats · 🎛️ DJ. DJ always showed a 🎤 Freestyle · 🥁 Beat Builder switch, and Beats showed 🥁 Beat · 🎼 Song only with Advanced on. Since 2026-10-12 Beats and Beat Builder share one beat panel, so Beat Builder is Beats with the keyboard under it, holding a second open beat (ADR 0008). The app is aiming at a kid-sized pattern-and-playlist music studio: patterns, a playlist, and live play (ADR 0022).

## Decision

- The bottom bar has four peer tabs: 🔊 Pads · 🥁 Beats · 🎼 Song · 🎤 Live. No screen has a sub-switch.
- **Beats** is the pattern editor. A ⌨️ Keys toggle shows the DJ keyboard under its rows, so ● Record works there; Beat Builder is gone as a separate mode.
- **Song** is the playlist (lanes of beat blocks), out of Advanced.
- **Live** is today's Freestyle: keys, takes and the click track.
- There is one open beat, not two. This replaces ADR 0008's own-open-beat-per-screen for beats; songs keep theirs.
- On phones Stop all shows as ⏹️ alone, so four tabs fit at 320 px.

## Consequences

- A device that had a different beat open in Beat Builder keeps it in 📂 Open; the Beats screen's open beat is the one that stays open.
- Help, the tour of the screens, remembered DJ mode and every test that opens DJ's Beat Builder change with it.
- The piano roll and the playlist are built on this structure, so it lands first.
