# 0020. A scratch beat (and song) per person, kept on purpose with 💾 Keep

**Status:** Accepted (2026-10-12), built (2026-10-12)

## Context

Since ADR 0008 the open beat saves itself on every change, and a groove tried becomes a new beat the moment it is changed, so trying grooves filled 📂 Open with copies ("Ska", "Ska 2"…). Ben (2026-10-12): "beats should be able to load a groove without saving a distinct copy of it. maybe we have a more intentional save button?"; then option A, "have the scratch pattern available by default throughout the app, where applicable"; and "what if new grooves got a random name with a suffix like (Ska version)".

## Decision

- Each person has one **scratch** beat. A groove loads into it; changing it copies nothing. It is not in 📂 Open or the pattern chips.
- The scratch is the default: a screen with nothing open shows the scratch, ready to play with, instead of an empty "nothing open" line. This holds wherever a document is open: Beats (with or without ⌨️ Keys) and Song.
- **💾 Keep** turns the scratch into a named beat in 📂 Open, which becomes the open beat; the scratch starts empty again. A kept groove is named with a random fun name and the groove in brackets: "Sleepy Squid (Ska version)".
- Beats in 📂 Open still save themselves on every change, as before. Only the scratch needs Keep.
- Loading a groove over a scratch with changes warns in one line, with Undo.
- The scratch syncs and backs up like any per-person record, so it survives a reload and another device.

## Consequences

- ADR 0008's own-open-document rule stays; the scratch is one more document, not listed.
- Q54's "a changed groove becomes a new beat" is replaced by Keep.
- Kids mode's one beat is that person's scratch. (Replaced 2026-10-27: see As built.)

## As built

- The scratch is an ordinary record with a reserved id: `beat-scratch-<person>` in `beats`, `song-scratch-<person>` in `songbook` (`web/scratch.js`). No IndexedDB upgrade, no backup format change, no new cloud kind, no Worker change, no migration: the Worker already takes `beats` and `songbook` records, and backups clean them like any other. Two devices that start one offline make the same id, so the cloud merges them.
- The scratch open is no `patterns` (or `songs`) record. It is saved only once it changes, so a new device's empty person still makes nothing.
- A scratch from a groove is stored under the groove's name (a backup gives an empty name a default, so a plain scratch is stored as "Scratch"); 💾 Keep finds the groove by that name.
- 🧸 Kids' old `beat-kids-…` beat becomes the scratch when the scratch has no hits, else a beat of its own; an empty one goes (app.js `adoptKidsBeat`, whenever a person shows).
- 🆕 New (Beats, ⌨️ Keys off and on, and Song) opens the scratch blank by removing its record, so the next change saves it afresh with a new beat's tempo and bars. Amended 2026-10-24 (Ben: "New keeps the scratch first"): a scratch with hits (blocks) is first copied into 🗂️ My beats (My songs) under a new id and the name 💾 Keep would give it (`sequencer.js` `keepAside`, `song.js` `newScratch`), and a line says so; there is no Undo, since nothing is lost. Before, New emptied it with an 8-second Undo, and a beat 🗂️ See all listed as the person's could vanish with one tap.
- Amended 2026-10-27 (Ben: a 🧸 Kids visit never touches the grown-up's scratch beat): 🧸 Kids no longer uses the scratch beat. Its 4×8 grid and ● tune live in a hidden beat of its own, `beat-kidsown-<person>` (`scratch.js kidsBeatId`), an ordinary `beats` record like the scratch: no IndexedDB upgrade, no backup format change, no new cloud kind. A kept ● tune is still a beat in 🗂️ Beats named "🧸 <fun name>". A scratch that held a Kids grid keeps it. "Kids mode's one beat is that person's scratch" no longer holds.
- Smaller calls are provisional: questions.md Q64 and Q65.
- A name typed into the scratch's title keeps it under that name (Ben, 2026-10-16): at once with rows (blocks), else with the first one. The name waits in memory only (`wantedName` in `sequencer.js` and `song.js`), so an empty named scratch stores nothing.
