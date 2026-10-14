# 0014. Saved DJ key layouts are their own records, apart from the live keyboard

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Ben, 2026-10-11: "there should be key-layout saves, which is different than the custom sounds… above the kbd is layouts… below sounds; individual and grouped"

**In short.** IndexedDB goes to version 12 with a `layouts` store: a person's saved whole-keyboard arrangements, synced as a new cloud kind and carried in backups. The live keyboard stays in `decks`, which gains `mine` (⭐ My keys). Backups (format 1.1) carry both; an older app skips them.

## Context

- DJ ✏️ Edit keys ([decisions](../decisions.md) "DJ") puts layouts above the keyboard and sounds below. A layout replaces all the keys at once (30 then, 40 since the number row), like the voice sets on an old Casio keyboard.
- `decks` already holds the keys a person changed ([ADR 0005](0005-dj-mode-data.md)), only the ones that differ from the defaults, so new recordings still reach the top row. That stays the live keyboard.
- A kid who loads a layout must not lose the board they built by hand (Ben approved keeping it as ⭐ My keys).

## Decision

- **`layouts`** (key `id`): `{id: 'layout-…', personId, name, created, keys: {KeyA: clipId | null}}`, every key (40 since 2026-10-12; see the note below). A name is 1 to 24 characters, typed by the kid; never pre-filled.
- **`decks.mine`**: every key of the kid's own board, kept when a layout replaced it. One per person, so it follows the deck's sync and merge (the device's wins).
- **Ready-made layouts** are code (`web/keyset.js` `READY_LAYOUTS`, kit ids), never stored. Each resolves to the person's own copy of the kit.
- **Cloud:** `layouts` is a new record kind on the Worker (`worker/cloud.js` `KINDS`); the `records` table already takes any kind, so no migration.
- **Backups and merge:** `layouts` is optional (format 1.1, additive), at most 500. A clash keeps both under a new id, and keys follow a renamed sound, like takes.
- **Cleaning:** `cleanLayout` (keyset.js) and `cleanDeck` (rhythm.js) for the app, backups and the cloud.
- Deleting a person deletes their layouts.

## Options turned down

- **Layouts inside `decks`.** One record per person syncs last-writer-wins, so two devices saving layouts would lose one.
- **⭐ My keys as a layout record.** Each device would make its own, and a sync would show two.
- **Storing ready-made layouts.** They would freeze and never pick up a kit change.

## Consequences

- An older copy of the app still open on another device skips `layouts` records it pulls (cloud-sync.js `pulledDoc`). A copy from before that check fails its sync until it reloads; the update bar asks it to.
- Layouts reference sounds by id. A deleted sound shows as No sound.

## Note, 2026-10-12: the number row

Ben: "the keyboard layout should have the number row as well" ([decisions](../decisions.md), "The keys have four rows"). The keys go from 30 to 40: `Digit1` … `Digit0` above Q–P. The formats stay what they were, keyed by `KeyboardEvent.code`, and the change is additive:

- `decks.keys`, `decks.mine` and `layouts.keys` may carry the ten `Digit` codes. `cleanDeck` and `cleanLayout` keep them. No IndexedDB upgrade, no backup format change (still 1.1), no cloud migration: the Worker stores records as they come.
- A deck from before stores no number keys, so they play their defaults (a scale, `rhythm.js` `defaultDeck`). A saved layout or ⭐ My keys from before loads with the number row empty (No sound). Ready-made layouts have a number row of their own.
- An older copy of the app drops the `Digit` keys when it cleans what it pulls or loads. If it then saves the deck, layout or ⭐ My keys and syncs, the number row it lost goes with it; the update bar asks such a copy to reload.
