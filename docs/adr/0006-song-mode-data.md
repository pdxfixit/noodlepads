# 0006. Song mode keeps one song per person in a new `songs` store, carried in backups

- **Status:** Replaced by 0007
- **Date:** 2026-10-11
- **Decided by:** Ben, 2026-10-11: Song mode is a Song strip under the Beats grid (slots of saved beats × repeats). Where it is stored was an agent's call, provisional until Ben says otherwise ([questions.md](../questions.md) Q2).

**In short.** IndexedDB goes to version 8 with one store, `songs` (key `personId`): `{personId, name, slots: [{beatId, times}]}`. Backups carry it without a format change; an older backup loads, and an older app ignores it.

## Context

- A song is a list of saved beats, each played 1 to 4 times. It needs a home that survives a reload and travels in a backup.
- Each person has one song, so the key is the person, like `patterns` (the open beat) and `decks`.
- Stored formats are kept by users; old databases and backups must keep working (AGENTS.md "The code").

## Decision

- **`songs`** (key `personId`, since version 8): `{personId, name, slots: [{beatId, times}]}`. A slot names a saved beat by id; `times` is 1 to 4. At most 16 slots.
- **Cleaning:** `cleanSong` in `web/song.js`, used by the app and by `readBackup`. Unsafe beat ids are dropped; `times` is clamped; a missing name becomes a fun one.
- A slot whose beat is gone stays in the song, greyed, and is skipped on play. Its beat may come back with a backup.
- **Backups** stay format 1: `songs` is optional, like `decks` and `takes`. A backup holds at most 100 songs.
- Deleting a person deletes their song.

## Options turned down

- **A `song` field on the person's `patterns` record** (the open beat). That record is rewritten on every pill tap and cleaned by `cleanPattern`, so the song would ride on beat code it has nothing to do with, and a beat change could drop it.
- **A record in `beats` or `settings`.** Beats would list it as a beat; settings are app-wide, declared values, not per-person data.
- **Copying each beat into the song.** Editing a beat would not change the song, which is what a kid expects.

## Consequences

- Opening the app after this deploy upgrades the database. Another tab still on version 7 holds the upgrade until it is closed; the app already says so ("waiting for storage").
- Revisit if a person needs more than one song: the key becomes an id, as `takes` did.
