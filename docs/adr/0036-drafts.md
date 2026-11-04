# 0036. A kept beat or song changes only on 💾 Save; edits wait in a draft

- **Status:** Accepted (to build)
- **Date:** 2026-11-04
- **Decided by:** Ben, 2026-11-04: "we don't want the saved file altered any more than we want to lose the work in progress." He chose the draft model (A), 💾 Save on the way back to 🎼 Song, the same model for Song, and 🗑️ Throw away changes inside 💾.

**In short.** Edits to a beat or song in 🗂️ Beats or 🗂️ Songs go into a draft that saves on every change, syncs and goes in backups; the kept one changes only on 💾 Save. ↩️ Undo · ↪️ Redo cover every change for the visit. The cost is one more tap to keep a change, and a second stored record per changed beat or song.

## Context

- Since ADR 0008 the open beat saves itself on every change, into the kept beat's own record (`sequencer.js save`). A stray tap on a beat opened from 🗂️ Beats or a pattern chip changed it for good, and a tap on a pill had no Undo. Song was the same.
- The scratch beat and song (ADR 0020) already work as drafts: 💾 Keep is their save.

## Decision

- A kept beat or song opens as itself. Its first change makes its **draft**: `beat-draft-<rest of the kept id>` in `beats`, `song-draft-<rest>` in `songbook`, with `draftOf: <kept id>`. An ordinary record with a reserved id, as the scratch is: no IndexedDB upgrade, no new cloud kind, no Worker change, no D1 migration.
- The draft saves on every change (coalesced, flushed on `pagehide`), so a crash or a closed tab loses nothing. Leaving never asks; the draft waits, and a yellow dot marks the beat or song on its name line, its chip, 🗂️ Beats or 🗂️ Songs, and 🎼 Song's blocks.
- 💾 (where ✏️ is) opens two choices: 💾 Save, which writes the draft into the kept record and then drops the draft, and 🗑️ Throw away changes, which asks first and drops it. Both have ↩️ Undo.
- What you hear on 🥁 Beats or 🎼 Song is the open draft; everything else (a song's blocks, Share, the chips' switch, 🗂️ See all, thumbnails, the public profile) plays the kept one.
- Back to 🎼 Song from a block's ✏️ reads "💾 Save · ↩ Back to song" while the beat has a draft.
- ↩️ Undo · ↪️ Redo on the play line cover every change, at most 50 steps a beat or song, for the visit.
- Built in four steps: Undo · Redo on Beats; a release that only hides draft records; drafts on Beats; drafts and Undo on Song. The plan and the council's asks: `docs/design/drafts.md`.

## Options turned down

- An autosave switch: a grown-up setting whose "off" is where work is lost.
- Ask before leaving: the interruption Ben does not want.
- Autosave into the kept record with a restore point: the restore point needs a rule for when it is replaced, and the only clean one is a save.
- The draft as a field on the kept record: an older copy's `cleanPattern` drops unknown fields, so its next save would lose the draft.
- Songs playing drafts: the song and the kept beat would disagree, and another device would play it otherwise.

## Consequences

- Keeping a change to a kept beat takes two taps. A stray tap, a groove ➕ added by mistake or a wrong ⌨️ Keys pass costs nothing.
- An older copy of the app lists a draft as a beat of its own until it updates; step 2 ships the hiding first so few ever do.
- docs/formats.md gains the id prefixes and `draftOf`; v2 hides records with a draft prefix and keeps `draftOf`.
