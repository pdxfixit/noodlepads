# 0010. The app is at noodlepads.com, and the old address is retired

- **Status:** Accepted
- **Date:** 2026-10-11; retired the old address 2026-10-13
- **Decided by:** Ben, 2026-10-11: the app is Noodle Pads at https://noodlepads.com; no kids' names anywhere in the repo; a one-tap move with no server; the old data is always offered as a backup. Ben, 2026-10-13: "time to retire the original hostname"; "retire it now".

**In short.** The app is served at `noodlepads.com`, and only there. The old address is retired: its one-tap move page, the app's receiving end of the move, and the old address's Worker, domain and flarepress folder are gone. Sounds an older copy saved on the *same* address (under the database's old name) are still found and offered in ⚙️ Settings, with the same checks, conversions and merge the move used. A backup is the way to bring sounds from anywhere else.

## Context

- The old address had a kid's name in it, and Ben decided that no kid's name belongs in the repo or the public site.
- Everything a kid makes lives in that browser's IndexedDB ([ADR 0002](0002-cloud-profiles-on-one-worker.md)). Browsers keep each address's storage apart, so the new address started empty.
- The app's database was renamed `noodle-pads` at the same time. A browser that ran an older copy on the same address (Ben's dev server at `localhost:8765`) keeps its sounds under the old name, where the app no longer looks.
- The old `boards.json` listed people, each with starter sounds and a spoken name clip. A device may still hold a kid's renamed or re-voiced copy of one, or a beat that plays one.

## Decision

- **noodlepads.com is the only address.** Nothing in the repo names the old one; `tests/no-names.test.mjs` knows it only by a hash and fails if it appears.
- **Older sounds on the same address (`web/leftover.js`):** when `indexedDB.databases()` shows another database with the app's stores (a `clips` store and an `overrides` or `people` store, so any schema version), ⚙️ Settings shows "Older sounds found on this device".
  - 📥 Bring them in: `readOldStores` checks the stores exactly as a backup is checked (`cleanBackup`), plus the conversions only data from before 1.0 needs (`oldStores`), at most 2 GB of sounds in all; the merge is a backup's ([ADR 0011](0011-backups-1-0-merge.md): by id, nothing replaced or doubled, the empty "Me" a new device made is removed).
  - 💾 Save everything it left (Ben, 2026-10-11: "exporting _all_ available saved content, not a backup"): every database but the app's own and every localStorage key, in one file whose app part loads as a backup from before 1.0 (`web/old-backup.js`).
  - That database is only read, never written or deleted.
- **Everything a kid made comes, or is named:**
  - Each sound's audio is copied into the page before it is saved, and each record is saved on its own: one the browser refuses never stops the rest, and the notice names it.
  - A sound may be up to 80 MB (a 3-minute song or take saved as a sound is 35–69 MB).
  - A sound stored with no type or a video type keeps its audio. An added person with no name comes in with a fun name and a picture, and one with no color gets the next free color.
  - People an older `boards.json` named become added people (`adoptPeople`): named by the device's rename, else a fun name and a picture (Ben, Q21).
  - **Starter sounds (Ben, Q21):** the old app's eight starter sounds are presets, under the same ids and with the same audio (`web/clips/kit/`), so a kid's rename, voice or hide of one, and every beat, DJ key, take and pad order that plays it, comes as an edit of that preset (`web/starters.js`). The spoken name clips are never kept: changes to them are left out and said.
  - The notice (`leftOutNote`) says what was left out and why in plain words.
- **New stores:** none. The database is `noodle-pads`.

## As retired (2026-10-13)

From 2026-10-11 the old address served one page that read that browser's data and, on one tap, handed it to `noodlepads.com/#move` through `window.open` and `postMessage`, with 💾 Save everything saved here as a fallback. Two days later Ben retired it: the page (`moved/`), `just deploy-moved`, the app's receiver (`web/move.js`) and their tests were removed, then the Worker, domain and flarepress folder. A device that never made the move, or whose sounds were never saved, keeps them only in that browser's storage for the old address, which nothing serves any more.

## Options turned down

- **A server relay** (upload from the old address, download at the new): every sound on every device would pass through the server, whether or not its person goes in the cloud.
- **An iframe of the old address inside the new one**: storage partitioning gives the frame an empty, separate storage, so it sees nothing.
- **Keeping the old address**: it names a kid.
- **Putting the starter sounds back in the kit**: Ben said no to offering them to everyone. Only a kid's own changed or used copy comes back.

## Consequences

- Sounds left at the old address can no longer be reached from the app.
- `indexedDB.databases()` is missing in old browsers (Firefox before 126). There Settings can't find older sounds.
- Sounds over 25 MB come in, but the cloud's own cap is 25 MB, so they can't be put in the cloud.
- Tested: the pure parts and the merge (`tests/old-device.test.mjs`, `tests/older-stores.test.mjs`, `tests/leftover.test.mjs`, `tests/holds.test.mjs`). Not tested: a real browser's IndexedDB.
