# 0005. DJ mode keeps changed keys and freestyle takes in two new stores, carried in backups

- **Status:** Accepted
- **Date:** 2026-10-10
- **Decided by:** Ben, 2026-10-10: DJ mode with "a freestyling mode ... where they can just record whatever the heck they push", saved as a replayable performance with a button to make it a sound

**In short.** IndexedDB goes to version 7 with two stores: `decks` (only the keys a person changed) and `takes` (freestyle recordings as timed events). Backups carry both without a format change; an older backup loads, and an older app ignores them.

## Context

- DJ mode ([design](../design/dj-mode.md)) puts a sound on each of 30 keys. The default keys are computed, so a new recording joins the top row by itself.
- A freestyle take must replay exactly and later become a sound. A rendered sound alone could not be edited or replayed with the keys lighting up.
- Stored formats are kept by users; old databases and backups must keep working (AGENTS.md "The code").

## Decision

- **`decks`** (key `personId`): `{personId, keys: {KeyA: clipId | null}}`, only keys that differ from the default. `null` is "No sound". A key naming a sound that is gone falls back to the default on read.
- **`takes`** (key `id`): `{id: 'take-…', personId, name, created, duration, events: [{t, clipId, kind}]}`. `t` is seconds from the take's start, to 1 ms. `kind` is `hit`, `loop`, `stop` or `beat` (a playing beat's own hits, so a take replays as it was heard). A `hit` played with 🎤 Live's 🔔 Overlap on also has `ring: true` (2026-10-12; only when true): it rang over the sound's earlier hits instead of cutting them off. An older copy drops it and plays the hit restarting.
- **Limits:** a take is at most 180 s and 10 000 events. A backup holds at most 100 decks and 500 takes.
- **Cleaning:** `cleanDeck` and `cleanTake` in `web/rhythm.js`, used by the app and by `readBackup`. Unknown key codes, kinds, out-of-range times and unsafe ids are dropped and counted.
- **Backups** stay format 1: `decks` and `takes` are optional, like `settings`.
- Deleting a person deletes their deck and takes.

## Options turned down

- **A take stored only as a rendered sound.** It could not be replayed live, renamed into a performance, or re-rendered after a sound changes.
- **Storing the whole deck.** The defaults would freeze, and new recordings would never reach the keys.
- **A new backup format.** Nothing an older app needs changes; optional fields keep every backup loadable.

## Consequences

- Takes reference sounds by id. A deleted sound is skipped on replay, with a note.
- Revisit if takes need editing (moving hits), which would want a richer event shape.
