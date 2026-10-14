# 0008. One open beat and one open song per person, and either may be none

- **Status:** Accepted
- **Date:** 2026-10-11, rewritten 2026-10-12 for [ADR 0017](0017-four-peer-tabs.md)
- **Decided by:** Ben, 2026-10-11: "it and other situations like this, shouldn't be auto created -- the modes can start and have nothing loaded"; 2026-10-12 (ADR 0017): one open beat, with Beat Builder folded into Beats as ⌨️ Keys

**In short.** Each person has one open beat (🥁 Beats, with ⌨️ Keys on or off) and one open song (🎼 Song). Either may be nothing; the app never makes a beat or song by itself. 🎤 Live has no open beat. No IndexedDB version change.

## Context

- The app made a beat (and a song) on its own for a new device, a new person, a first visit, and after the open one was deleted. Kids found empty beats they never made.
- From 2026-10-11 DJ's Beat Builder kept a second open beat of its own, as `beatId` on the person's `decks` record. ADR 0017 folds Beat Builder into Beats as the ⌨️ Keys toggle, so Beats and its keys show one beat.
- Stored formats are kept by users; old databases and backups must keep working (AGENTS.md "The code").

## Decision

- **The open beat** is the whole beat in `patterns` (key `personId`), with or without ⌨️ Keys. Nothing open is no record.
- **The open song** is in `songs` as before; nothing open is no record.
- **Every open document is in the list.** 🆕 New puts it in `beats` or `songbook` at once, empty or not; a groove or a ⧉ copy joins too. The open beat saves itself on every change, and the beat maker reads it again from the library whenever Beats shows, so a sync or a backup's change shows.
- **Delete** leaves nothing open.
- **Older devices, on open (no upgrade step):** a `patterns` record whose id is in the library opens as the library has it. One with notes but not in the library joins it (linked by name or given an id). An empty one never in the list was made by the app, so it is dropped and nothing is open. A song record works the same way.
- **Beat Builder's old open beat.** A `decks` record from an older copy may carry `beatId`. Nothing reads it: Beats' open beat is the one that stays open, and Beat Builder's beat is already in the library, so it stays in 📂 Open. The deck drops `beatId` the next time it saves (✏️ Edit keys); one that comes back from the cloud or a backup changes nothing.
- **Backups** stay format 1.x. `decks` may still carry `beatId` (checked against `beat-…`; anything else is dropped), so older backups load as they were.
- **With nothing open**, the screen's name bar shows only 🆕 New and 📂 Open (and on Beats 💃 Grooves and ⌨️ Keys), a dashed callout says so, and its deck and rows go. 🎲 Grooves still opens a groove as a new beat (➕ Add to this beat is off). 🎤 Live's ⏲️ Click track ticks at 100 BPM, which its slider changes for the visit.

## Options turned down

- **A second open beat for the keys** (DJ's Beat Builder had one from 2026-10-11). ADR 0017 makes the keys part of Beats, so they show Beats' beat.
- **`localStorage` for the open beat.** It would not travel in a backup or the cloud.
- **Copying a beat when it is opened elsewhere.** One file, open in one place.

## Consequences

- No empty beats or songs appear in 📂 Open unless the kid made them with 🆕 New.
- ⌨️ Keys on or off never changes which beat is open; Record with the keys adds to the same beat the rows show.
- Revisit if a screen ever shows two documents at once, or if Song gains its own open beat.
