# 0030. 🎹 Instruments: who plays Notes, Chords and Bass

- **Status:** Accepted, phases 1 and 2 built (the picker on Pads; then the sound chooser, 🎹 Add a tune and the roll, ✏️ Edit keys, 👆 bands, 🧸 Kids' instrument button)
- **Date:** 2026-10-17
- **Decided by:** Ben, 2026-10-17, accepting the design review (`docs/design/more-kinds-of-music.md`, section 1, option C) with his answers: instruments are a picker, remembered per person and synced; presets under 6 MB in all, 5 MB shown with Advanced off, one clip under 160 KB; a note keeps its fruit on every instrument, with a badge. Rows in [decisions.md](../decisions.md) (People and boards).

**In short.** An instrument is a view over the kit. Each instrument's notes and chords are presets of their own (`piano-e`, `piano-am-chord`, `808-c`) in the same group as today's, all played from one or two recordings per instrument moved to the note. The person picks who plays each of Notes, Chords and Bass; the group shows that instrument's presets. Nothing stored changes shape: no IndexedDB, backup or D1 change. boards.json gains fields.

## Context

- Ben wants many kinds of music and to learn how music works. Real instruments are most of that.
- A group of pads per instrument (🎹 Piano, 🎻 Strings…) would make 17 or more folded headers and about 100 more pads on a phone.
- A switch that changes how a stored beat sounds ("Notes, as Flute") changes old beats under the kid, and needs a new stored field.
- The budget was spent: the kit was 4.49 MB of 5. Ben raised it to 6 MB.

## Decision

- **The list** is code, `web/instruments.js` `INSTRUMENTS`: an id, a name, an emoji (the badge), a family (Keys, Mallets, Strings, Wind, each with a color) and the groups it plays. Notes: Pluck, Piano, Organ, Chip, Marimba, Steel drum, Kalimba, Guitar, Strings, Brass, Flute. Chords: Synth, Piano, Organ, Guitar, Strings. Bass: Synth, 808, Upright. Pluck and Synth are the sounds those groups always had.
- **boards.json:** an instrument's preset is a kit entry with `inst` (who plays it), `plays` (the group's own preset it is another instrument's version of: `piano-e` plays `note-e`, with its label, emoji, color and `advanced`), and `file` naming one of the instrument's recordings, `clips/kit/<inst>-<MIDI note>.wav`. `shift` (whole semitones, ±12 at most) moves it to the note; `chord` (1 to 6 of them) plays several notes of it at once. The groups' own presets carry none of these. `tools/kit_instruments.py` writes these entries from a table of each instrument's recordings, picking the recording that moves least.
- **Ids** never end in another kit id (`piano-am-chord`, not `piano-chord-am`), because lookups match `-<kit id>` at the end of a person's copy. A test holds this.
- **Playing:** `audio.decoded` decodes a shared recording once (`audio.recordings`) and moves it by resampling, as a tune row's playbackRate does, summing a chord's notes and keeping the recording's peak (`instruments.js` `voice`). That is the preset's stored audio: trims, edits, voices and the mix work on it as on any sound.
- **The pick** is three person settings, `instNotes`, `instChords`, `instBass` (`settings.js`), each defaulting to the group's own sound. They sync and ride in backups like every person setting. A value this copy doesn't know reads as the default.
- **Everywhere else (phase 2):** the same picker, setting the same pick, on the beat row's sound chooser and ✏️ Edit keys; 🎹 Add a tune asks "Who plays it?". The piano roll's and a 👆 band's pickers also swap that tune row or band to the same notes on another instrument (`instruments.js` `versionFor`, by `plays`). The person's default keys and touch layout stay on the groups' own sounds (`clipsFor` `ownSounds`), because only keys that differ from the default are stored. 🧸 Kids' Keys has a round button stepping through Pluck, Piano, Marimba, Steel drum and Kalimba, as `instNotes`.
- **What shows:** `board.js clipsFor` leaves out every other instrument's presets of those groups, wherever presets are listed (Pads, the sound chooser, ✏️ Edit keys, 👆 + more). Lookups that follow a reference (`allPresets`: a beat row, key, band or take) see every instrument's, so a sound already used keeps playing after another pick.
- **The emoji rule's exception:** an instrument's preset wears its `plays` preset's emoji; every other preset's emoji is its own. The pad shows the instrument's emoji as a small badge at its top right.
- **Problem reports** name an instrument's preset by its kit id, like any preset; the Worker's list (`worker/clean.js`) builds those ids with `kitIdsOf`.

## Options turned down

- **A group per instrument:** drowns Pads, and the chooser and 👆 lists double.
- **A timbre switch on what is stored:** old beats would change sound, and it needs a stored field, an ADR on the format and a backup change.
- **Every note its own file:** 10 instruments × 13 notes, plus chords, would be several MB. One or two recordings each cost about 0.9 MB in all.
- **The instrument list in boards.json:** the settings, the problem reports' allowlist and the Worker need it without loading boards.json, so it is a module with no imports.

## Consequences

- A new note or chord for an instrument costs no bytes; a new instrument costs one or two recordings and a line in `kit_instruments.py`.
- boards.json grows by 220 entries, all written by the tool; a test fails when it and the table disagree.
- A recording moved far sounds stretched (a chipmunk up, a growl down). Piano and strings have two recordings each; the struck and plucked ones are generated and move cleanly. How each sounds is still to be heard on a phone.
- The roll's swap needs no `root`: each instrument's preset plays exactly the note its `plays` preset plays, octave and all, so a tune row moved to the same note's preset sounds every note where it was. A `root` on the instrument presets alone would move a tune off a group's own note when swapped; on the groups' own presets too, it would move old tune rows on D to B.
- Still to do (TODO.md): one ready-made key layout per family, the groove cards' "who plays" chips, grooves with real instruments, Soca and Chiptune.
