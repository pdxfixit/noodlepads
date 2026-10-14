# 0021. A 📌 pin is a time on the beat record, left out when not pinned

- **Status:** Proposed (the field is an agent's; pins and the chip order are Ben's)
- **Date:** 2026-10-12
- **Decided by:** Ben, 2026-10-12: "1 and 3. 8 spots, minus the number of pinned items" (pattern chips: pins from 📂 Open first, then the most recent beats in a stable order).

**In short.** A saved beat (IndexedDB `beats`) may store `pinned`, the time it was pinned. Pinned beats take the pattern chips' first spots in that order. The field is left out when the beat is not pinned, so an unpinned beat is stored exactly as before.

## Context

- Pins belong to one person and must travel with them: to their other devices (the cloud) and in backups.
- Each beat already travels as a library record, and backups and the cloud carry those records (backups clean them in `cleanBackup`, the cloud pulls through the same cleaner). The `saved` stamp already orders "most recently used".
- The person's prefs record (`prefs`) also syncs, but a list of beat ids there would need cleaning when a beat is deleted, and a beat copied to another person would leave it behind.

## Decision

- **Beat record:** `pinned: <ms time>` only while pinned. 📌 in 📂 Open sets it to now or removes it. Pinning does not touch `saved`: it is not using the beat.
- **Order:** `chipBeats` (`web/sequencer.js`): pinned beats by `pinned`, then the `8 − pins` unpinned beats with the newest `saved`, shown by `created`. At most 8 pins (`MAX_PINS`).
- **Kept:** saving the open beat keeps its pin; backups keep a number above 0 and drop anything else; the cloud's three-way merge treats it as a setting (the newer edit wins).
- **Left behind:** a ⧉ copy, a share code and a remix start unpinned: a pin is the person's choice, not part of the beat.
- **No IndexedDB upgrade, no backup format change, no Worker change, no migration:** the field is additive.

## Options turned down

- **A list of pinned ids in the person's prefs.** Order for free, but stale ids after a delete, and one more cleaning rule for a list in a setting.
- **A new store.** An upgrade, a backup kind and a cloud kind for one number per beat.
- **`pinned: true` and an order field.** Two fields to keep in step; a time gives the order.

## Consequences

- An older copy of the app ignores `pinned` and shows its own chips; saving a beat there drops the pin (its `save` does not carry it).
- Two devices pinning different beats offline both keep their pins after a sync; more than 8 pinned shows the first 8 pinned.
- Revisit if pins ever need to reach Song or Live, or a kid wants to reorder pins.
