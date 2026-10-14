# 0015. A beat row's loudness is stored as `volume`, left out at full

**Status:** Accepted (2026-10-11)

## Context

Ben (2026-10-11): "a full volume control for that particular instrument. So one can do mixing as well as volume. Plain muting." Rows already had `muted`. A level has to travel everywhere a beat goes: saved beats, the open beat, beat files, backups, the cloud and share codes.

## Decision

- A row may have `volume`, a number from 0 to 1 in hundredths. Full volume is stored as no field at all (`cleanRow` in `web/sequencer.js`), so a beat nobody turned down is stored exactly as before.
- Cleaning clamps it: below 0 is 0, above 1 is full, anything not a number is full. Backups, beat files and share codes all clean rows through `cleanPattern`; the cloud carries rows whole.
- Every hit plays at `hitGain(row, loud)`: a loud hit's lift times the row's level. A row at 0 plays nothing, as a muted one does. Muting keeps the level.
- No IndexedDB upgrade and no backup format change: the field is additive. An older copy of the app ignores it and plays the row at full volume.

## Consequences

- A beat mixed on a new copy plays its quieter rows at full on an older copy, until that copy updates. Editing the beat on the older copy drops the field (its `cleanRow` does not know it).
- The speaker (`web/row-volume.js`) is one control for mute and level on Beats and in Beat Builder.
