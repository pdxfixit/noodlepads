# 0035. Beats saved before time signatures are stamped once

- **Status:** Accepted
- **Date:** 2026-10-27
- **Decided by:** Ben, 2026-10-27: beats saved before time signatures existed get their signature stamped once, so the app stops guessing.

**In short.** A beat with no `signature` was read by a guess: the person's old Settings signature with Advanced on, else 4/4. The guess is now written into each such beat, by a database upgrade to version 16 and as beats come in (backups, cloud pulls, beat files). No code guesses after that.

## Context

- Until each beat had its own time signature (2026-10-11), the choice lived in Settings. Beats saved then have no `signature`, and the beat maker and 🎼 Song read them by the Settings of whoever was looking.
- That made an old beat's length in a song change when someone flipped Advanced, and it left a Settings-only reading in the code for a v2 import to carry.

## Decision

- **The stamp is the answer the guess gave**, from the beat owner's settings (their `prefs`, then the device's `settings`), so nothing a kid hears changes. `web/old-beats.js` holds the rule.
- **Database version 16, no new store.** `store.js upgradeStores` stamps every `beats` and `patterns` record without a signature, in the upgrade's transaction. A request that fails is handled so the database still opens; the beats stay unsigned and play as 4/4.
- **On the way in:** `backup.js cleanBackup` (backups 1.0 and 1.1, older sounds found, cloud pulls, share remixes) and `beatFromFile` stamp what has none. The backup format does not change, and nothing is dropped.
- **A missing signature is 4/4 from now on.** The guess is deleted from `sequencer.js` and `song.js`.

## Options turned down

- **Keep the guess as a fallback.** Cheaper, but it keeps Settings in the reading of a beat for good.
- **Stamp 4/4 on everything.** An old 3/4 beat would change what a kid hears.
- **Stamp when a beat is opened.** Beats nobody opens would stay unsigned and the guess would stay.

## Consequences

- Like every version bump, a copy of the app still open at version 15 cannot open the upgraded database; it shows "can't be saved" until it updates. A rollback across the bump is not possible, so a fault is fixed forward.
- Two devices that were offline with different settings can stamp one cloud beat differently; the newer edit wins on `signature` (`merge3.js`).
- A device syncs its stamped beats up once, like an edit.
- A failure at commit (a full disk) can still abort the upgrade, as for any version bump.
- Tests: `tests/stamp-signatures.test.mjs`, `tests/song-unsigned.test.mjs`.
