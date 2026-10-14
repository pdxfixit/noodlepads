# 0018. The 🎚️ Mixer's solo, effects and master are stored on the beat, left out at normal

- **Status:** Proposed (the field shapes are an agent's; the rule that mute and solo save with the beat is Ben's)
- **Date:** 2026-10-12
- **Decided by:** Ben, 2026-10-12: "yes" to a mixer with per-row fader, mute, solo and one effect plus a master column; mute and solo save with the beat.

**In short.** A row may store `solo: true` and `fx: '<effect id>'`; a beat may store `volume` (the master, 0 to 1) and `fx`. Each is left out at normal, so an unmixed beat is stored exactly as before and an older copy of the app plays a mixed beat unmixed.

## Context

- Rows already store `muted` and `volume` (ADR 0015). Mute needs nothing new.
- A beat travels as a library record, the open beat, a beat file, a backup, the cloud and a share code. Backups and beat files clean beats through `cleanPattern` (`web/sequencer.js`); the cloud and share codes carry records whole.
- The effects a kid already knows are the sound sheet's knobs, built from `web/steps.js`; the ones that run live (Room, Echo, Muffled ↔ Bright, Crunch, Warble, Robot, Louder) can sit on a playing beat.

## Decision

- **Row:** `solo: true` only when soloed; `fx`, one of `web/mixer.js` `MIX_FX` ids (`room`, `hall`, `echo`, `muffled`, `bright`, `crunch`, `warble`, `robot`, `louder`), only when set.
- **Beat:** `volume` below 1 (as a row's, clamped, hundredths); `fx`, as a row's.
- **Playing:** when any row is soloed, only soloed rows play; a muted row never plays. Every hit goes through a small graph per beat (`buildMix`): its row's effect, then the master's effect and level. Live play, Save as a sound, songs and share previews all use it, so a beat sounds the same everywhere.
- **Cleaning:** unknown effects and non-`true` solos are dropped; `samePattern` counts all four as changes.
- **No IndexedDB upgrade, no backup format change, no Worker change:** the fields are additive. Beat files carry the master's `volume` and `fx`; rows carry their fields as they already did.

## Options turned down

- **A separate mix record per beat.** Another store to upgrade, back up and sync, for a few fields that belong to the beat.
- **Storing every field at its default.** Every old beat would change its stored form on its next save, and records would grow for nothing.
- **Effects as full step chains, like a sound's.** More than a kid needs on a mixer (one effect each, Ben), and a chain is costly to rebuild live.

## Consequences

- An older copy plays a mixed beat with every row unsoloed and no effects; editing it there drops the fields (its `cleanRow` does not know them), as with `volume`.
- A new effect is one line in `MIX_FX`; an id an older copy does not know is dropped there.
- Revisit if a row ever needs more than one effect, or effect settings of its own.
