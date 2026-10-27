# 0011. Backups start over at format 1.0, and loading one merges

- **Status:** Accepted
- **Date:** 2026-10-11; format 1.2 added 2026-10-27
- **Decided by:** Ben, 2026-10-11: "drop default users"; "old backups go away: this is 1.0"; importing a backup must merge, never replace or duplicate, so he can gather detail from several devices into one

**In short.** A backup says `app: 'noodle-pads'`, `format: '1.0'`, and only 1.x backups load. Loading one merges into the device by id: nothing there is replaced or deleted, nothing is doubled, and loading it twice changes nothing. Data from before 1.0 comes through the one-tap move ([ADR 0010](0010-move-to-noodlepads-com.md)), or, until launch, a backup file from the testing copies.

## Context

- `web/backup.js` accepted three shapes: this app's id, any old id ending in `-soundboard`, and old record shapes (people an older `boards.json` named, an open song with no id). Each was a path to keep working and tested forever.
- Loading a backup wrote every record with `put`, so a sound or beat with the same id was replaced, and the "Me" each new device makes for itself piled up as a second empty board.
- Ben gathers what the kids made on several devices into one, so a load must add, not overwrite.

## Decision

- **Format.** `backup.json` says `app: 'noodle-pads'`, `format: '1.0'`. Any `1.x` loads; a later minor version only adds what an older copy can skip. A newer major is "made by a newer version". An old app id, or `format: 1` as a number, is a backup from before 1.0: it loads through the move's old-store conversions. Ben, 2026-10-11: "we do want to allow pre-1.0 backups from the testing instances … it will only be this once" (about three Android Chrome devices). That path is removed after launch. From 1.0 on, a backup must still load in every newer copy. **1.2** (Ben, 2026-10-26, [ADR 0001](0001-web-prototype-then-native.md)) adds each own sound **as heard**: a clip's `heard` names `sounds/<id>.heard.wav`, the sound rendered as its pad plays it, beside the original, for v2's importer. It is optional (a sound that won't render goes without; together they stop at 120 MB), a 1.0 or 1.1 backup has none, and loading reads past it. The format is written out in `docs/formats.md`; the golden backups of 1.0, 1.1 and 1.2 in `tests/fixtures/` must always load with nothing dropped.
- **Old shapes only for data from before 1.0.** `cleanBackup(…, { oldStores: true })` turns people an older `boards.json` named into added people and keeps an open song with no id. Only older sounds found on this device (`web/leftover.js`) and backups from before 1.0 get it.
- **Merge** (`web/merge.js` `mergeLoaded`, pure and tested):
  - People by id. A person both sides have keeps the newer name and color by `edited` (stamped on every rename or recolor); with no newer edit, the device's.
  - A default person (the automatic "Me", never renamed or recolored, with nothing of theirs stored: `model.js` `isDefaultPerson`) is never imported, and the device's own goes once someone real arrives. Each device's "Me" has its own random id (`newId('p')`), so two devices' people never collide.
  - Sounds, saved beats, saved songs and takes by id. The same record is skipped. A different record under an id the device uses is kept too, under a new id, and every reference to it (beat rows, DJ keys, pad orders, takes, songs, a sound's `from`) follows. A record the device already holds under another id counts as the same, so a second load adds nothing.
  - Pad orders, open beats, DJ keys, open songs, kit edits and settings: the device's when it has one; otherwise the incoming one.
- **Say everything.** The notice says what came ("Added 3 sounds, 2 beats; 4 already here.") and how many items were refused. A refused backup or move says why.

## Options turned down

- **Keep loading old backups.** Every old shape stays code and tests forever; Older sounds found on this device already carry pre-1.0 data, and Ben chose a clean 1.0.
- **Replace on load** (the old behavior): loses work when two devices both changed something.
- **A "replace or merge" choice:** one more decision for a kid, and replace is the one that loses work.
- **Match people by name:** two kids may share a name; ids are what the data points at.
- **Re-id the people an older `boards.json` named** (fixed ids such as `pip`): on two devices they are the same person, and matching them by id merges their sounds, which is what Ben wants.

## Consequences

- Until launch, a backup file saved before 1.0 still loads, through the old-store conversions. After launch it is refused.
- A sound edited on one device and loaded from the other shows twice (the same id, different content keeps both). The kid can delete either.
- The device's settings always win, so a backup never changes how this device behaves, except for settings it never set.
