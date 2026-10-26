# 0029. 👆 Touch layouts: bands of sounds on the deck, named saves as their own records

- **Status:** Accepted, built
- **Date:** 2026-10-16
- **Decided by:** Ben, 2026-10-16: "On the phone, live should have the ability for programming the key layout, but it should not be tied to a kbd. It should offer preset groups (chords, drums etc), but be far simpler in how to construct the layout and size of the tiles/buttons." He picked stacked groups, a ⌨️ / 👆 switch everywhere, one layout shared with Beats, and named saves. Row in [decisions.md](../decisions.md) (Live).

**In short.** 🎤 Live and Beats with ⌨️ Keys get a second way to play: a touch layout of bands, each one group of sounds at one size. The live layout is a new `touch` field on the person's `decks` record; its named saves are a new IndexedDB store, `touchLayouts` (version 15), synced as a new cloud kind and carried in backups (still format 1.1, additive). An older copy of the app drops the field and skips the store.

## Context

- The keys ([ADR 0005](0005-dj-mode-data.md), [ADR 0014](0014-dj-key-layouts.md)) are 40 places on a keyboard. On a phone they show as pads, but arranging them still means thinking in keyboard rows.
- Ben wants a layout a kid builds from preset groups, with a size per group, and no keyboard in sight.
- A kid who loads a saved layout must not lose the one they built by hand, as with ⭐ My keys.

## Decision

- **The shape:** `{bands: [{group, size, sounds}]}`, top to bottom. `group` is a kit group id (`drums`, `chords`, …) or `mine` (🎤 My sounds); `size` is `s`, `m` or `l` (5, 4 or 2 tiles across on a phone); `sounds` are the person's clip ids (`<person>-kick` for their copy of the kit), each once, at most 40. At most 8 bands. The pure rules are `web/touch.js`.
- **`decks.touch`:** the live touch layout, shared by 🎤 Live and Beats with ⌨️ Keys. Left out until the person changes it; until then the default plays (🎸 Band under the newest of their own sounds), so new recordings still show.
- **`decks.touchMine`:** ⭐ My layout, the hand-made one kept when a saved or ready-made one replaced it. One per person, so it follows the deck's sync and merge (the device's wins), like `decks.mine`.
- **`touchLayouts`** (key `id`): `{id: 'touch-…', personId, name, created, bands}`. A name is 1 to 24 characters, typed by the kid; never pre-filled. At most 500 per backup.
- **Ready-made touch layouts** are code (`touch.js` `READY_TOUCH`, kit ids), never stored. Each resolves to the person's own copies of the kit.
- **Cloud:** `touchLayouts` is a new record kind on the Worker (`worker/cloud.js` `KINDS`). The `records` table takes any kind, so no D1 migration.
- **Backups and merge:** `touchLayouts` is optional and additive in format 1.1. A clash keeps both under a new id; bands follow a renamed sound, as keys and takes do.
- **Cleaning:** `cleanTouch` and `cleanTouchLayout` (touch.js), through `cleanDeck` (rhythm.js) and `cleanBackup`, for the app, backups and the cloud.
- **Which way a device plays** (⌨️ or 👆) is remembered on the device (`localStorage` `dj-input`), not with the person: it is about the screen in hand. Until it is picked, 👆 under 700 px wide, ⌨️ otherwise.
- Deleting a person deletes their touch layouts.

## Options turned down

- **A grid of cells, each sized on its own.** Ben picked stacked groups: far simpler to build, and bands reflow to any width.
- **Saves inside `decks`.** One record per person syncs last-writer-wins, so two devices saving layouts would lose one (as ADR 0014 found for key layouts).
- **Reusing `layouts` for touch saves.** Their `keys` are 40 keyboard places; a band has no place on a keyboard, and an older copy would clean a touch save into an empty keyboard.
- **The ⌨️ / 👆 choice per person.** The same kid plays a laptop and a phone; the screen decides.

## Consequences

- An older copy of the app still open on another device skips `touchLayouts` records it pulls (cloud-sync.js `pulledDoc`), and its `cleanDeck` drops `touch` and `touchMine`. If it then saves the person's keys and syncs, the touch layout it dropped goes with it, and that person's 👆 shows the default again; the update bar asks such a copy to reload. Saved touch layouts are untouched.
- A backup made by this copy loads in an older 1.x copy: it skips `touchLayouts` and the deck's touch fields.
- Bands name sounds by id. A deleted sound's tile is left out of the band when it plays.
