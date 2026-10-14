# 0023. A tune row stores notes (pitch, start, length), and old melody rows are read as notes

- **Status:** Accepted (the piano roll and that it replaces melody rows are Ben's; the stored shape is an agent's)
- **Date:** 2026-10-12
- **Decided by:** Ben, 2026-10-12: "replace" (melody rows); scale lock "yes"; two octaves "yes"; "whole pills… halves… an Advanced thing"; own screen (A).

**In short.** A tune row keeps `melody: true` and adds `tune: [{p, s, l}]`. Its `steps` and per-pill `notes` are still written, worked out from the notes, so an older copy plays the tune roughly instead of losing the row. Nothing in IndexedDB is upgraded in place: every reader cleans rows (`cleanRow`), and that is where old rows turn into notes.

## Context

Melody rows (`web/sequencer.js`, before this) stored one note per pill, `notes[i]`, from a five-note scale (`MELODY_NOTES`, semitones above the sound's C), and only played with Advanced on. A piano roll needs notes of any pitch and length, and chords. A beat travels in many places: the open beat (`patterns`), the library and the scratch (`beats`), beat files, backups (format 1.x must still load), share codes and cloud records (`web/cloud-sync.js`, merged by `web/merge3.js`). Devices on older copies sync with newer ones until they reload.

## Decision

- **A note** is `{p, s, l}` (`web/notes.js`): `p` the pitch in semitones above the row's sound's C, −24 to 36 (0 plays the sound as itself, moved to its nearest C when 🎵 Find its note knows its `root`, as melody rows did); `s` the start pill and `l` the length in pills, both in halves. Whole pills in the roll at Regular; halves with Advanced (½ Half pills). Two notes of one pitch never overlap; different pitches may (chords). At most 256 notes a row, 64 pills a note.
- **A tune row** is `{…row, melody: true, tune: [notes], steps, notes}`. `steps[i]` is on where a note starts in pill i and `notes[i]` is that note's nearest old-scale value (the highest of a chord): both are derived on every clean, never edited.
- **Old rows:** a `melody` row with no `tune` (stored before this, or by an older copy) is read as one note a pill long per pill on, at its old note (an off-scale or missing note is 0, as it played). Backups, beat files and share codes need no new format: they carry rows as they are, and `cleanPattern` reads them.
- **Playing:** each note plays the row's sound at rate 2^(p/12) (a sampler) from its start and fades out at its end (`fadeStop`); a note longer than the sound ends with the sound. Tune rows play their notes at every level (melody rows needed Advanced). Their voices overlap like 🔔 Overlap rows, up to 8.
- **Cloud merge:** `tune` merges note by note (a note is its start and pitch): notes added on two devices both stay; a note both changed takes the newer edit; overlaps are cut when read.
- **💃 Grooves:** a groove's bass rows (one row per note, `bass-a`, `bass-f`) load as one tune row of the kit's Bass C, each note lasting until the next (at most 8 pills). Chord rows stay rows of pills: a chord moved to another root would turn minor into major.

## Older copies of the app

- An older copy plays a tune row as its pills at the old-scale notes, one sound's length each, and only with Advanced on (as melody rows did). With Advanced off it plays the starts at the sound's own pitch.
- It draws the row as its old 8-lane roll, the notes snapped to the five-note scale.
- If it changes and saves that beat, its `cleanRow` drops `tune`: the newer copy then reads the row's pills back as notes a pill long, at the nearest old notes. Lengths, half pills and notes off the old scale are lost for that beat. The update notice (`web/update.js`) makes this window short.

## Options turned down

- **Rewriting `notes` into note objects.** An older copy would read every note as "no note" and save the row back empty of pitches.
- **An IndexedDB upgrade (`store.js`) converting every beat at once.** The clean on read already does it, a backup or a synced record would still need it, and an upgrade can't reach records still arriving from older devices.
- **Absolute pitch (MIDI numbers).** It needs each sound's note to convert old rows, and most sounds (every kit sound, most recordings) have none.
- **Grooves' bass rows as one row per note, kept.** The roll would show one note per row and could not move a bass note.

## Consequences

- The compact row, chips and thumbnails need no change: they read `steps`.
- A tune row's pills are a preview; a tap on one opens the roll instead of switching it.
- Revisit if older copies must edit tune rows without loss (then `steps` and `notes` would need to win over `tune` when they disagree).
