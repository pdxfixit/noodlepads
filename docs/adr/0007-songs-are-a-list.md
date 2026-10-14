# 0007. Songs are a list, like beats: `songs` keeps each person's open song, `songbook` every song

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Ben, 2026-10-11: "songs should be a list, like beats". Replaces [0006](0006-song-mode-data.md) (one song per person).

**In short.** IndexedDB goes to version 9 with one more store, `songbook` (key `id`), holding every saved song. `songs` (key `personId`, from version 8) stays and now holds each person's **open** song, with its id. This is the same pair as `patterns` (the open beat) and `beats` (every beat).

## Context

- Version 8 kept one song per person in `songs`, keyed by person, with no id.
- Ben wants songs to work like beats: one is open and saves itself; 🆕 New and 📂 Open (duplicate, delete) list the rest.
- Stored formats are kept by users; old databases and backups must keep working (AGENTS.md "The code").

## Decision

- **`songbook`** (key `id`, since version 9): `{id: 'song-…', personId, name, slots: [{beatId, times}], created, saved}`. A song joins it once it has a slot, as a beat joins `beats` once it has a pill.
- **`songs`** (key `personId`, unchanged): the open song, `{id, personId, name, slots}`, written on every change along with its `songbook` copy.
- **Migration:** the version 9 upgrade only creates `songbook`; it never touches existing stores. A version 8 record has no id, so when the app opens that person's song, `linkSong` gives it one (or the id of a saved song of the same name) and saves it into `songbook`. The beat maker linked its open beats to the library the same way.
- **Backups** stay format 1. `songs` is read with or without ids (the version 8 shape loads, and is linked on open). `songbook` is optional, at most 1000 songs, cleaned by `cleanSong` with ids checked against `song-…`.
- Deleting a person deletes their open song and every song in `songbook` that is theirs.

## Options turned down

- **Re-keying `songs` by id with a `personId` index.** The upgrade would have to read, delete and recreate a store inside the version-change transaction, which no upgrade here does yet, and the open song would still need a home.
- **Migrating inside the upgrade.** It can't pick a fun name or check the list for a same-named song; doing it on open reuses the beat maker's tested path.

## Consequences

- Opening the app after this deploy upgrades the database; a tab still on version 8 holds it until closed (the app says so).
- The open song is stored twice (`songs` and `songbook`), like the open beat. Small, and either copy can rebuild the other.
