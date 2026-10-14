# 0013. Groups of a kid's own sounds live on the sound and on the pad order

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Ben approved the mockup on 2026-10-11 ("Groups of a kid's own sounds, select for bulk, edit badge"): groups in My sounds only, as collapsible headings like the presets', per person. The storage shape is the agent's call.

**In short.** A sound made in the app gets an optional `group: 'g-…'`. A person's pad order record (`orders`) gets an optional `groups: [{id, name}]`, in the kid's order. No new IndexedDB store, no database version, no cloud schema change. Backups go to format 1.1, which only adds fields.

## Context

- Presets already have fixed groups from boards.json (`kitGroups`, a kit sound's `group`). A kid's own sounds had none.
- `orders` is one record per person, already in backups (`cleanBackup`) and cloud sync (`CLOUD_KINDS`, kept as an opaque JSON record by the Worker).
- Stored formats are kept by users (AGENTS.md "The code"); a backup from 1.0 on must load in every newer copy (ADR 0011).

## Decision

- **A sound's group:** `group` on its `clips` record, a `g-` id (`GROUP_ID` in `web/groups.js`). None means Not in a group. A sound naming a group the person no longer has is in no group.
- **The groups:** `groups` on the person's `orders` record, `{id, name}` each, names 1 to 24 characters (like a sound's name), at most 50. Their order is the order they show. An empty group is dropped when a move or delete writes the record; until then it simply does not show.
- **Backups:** format 1.1. `cleanBackup` keeps `group` only when it is a group id, and `groups` through `cleanGroups`. A 1.0 copy of the app loads a 1.1 backup and skips both.
- **Merging** (`web/merge.js`, a backup or a cloud pull): `group` is left out when comparing two sounds, so a sound moved into a group is the same sound, not a second copy. A pad order stays the device's, but groups it lacks come in after its own, so incoming sounds keep their group.
- **Shares:** a share is the sharer's snapshot, so `group` is left out of a shared sound. One share of several sounds (kind `sound`, several clips; the Worker already allowed up to 100) is named after their group when they share one.
- Only sounds made in the app can be in a group. boards.json lists no people now, so a kid's own sounds are all made in the app; a boards.json person's own sounds stay ungrouped.

## Options turned down

- **A new `groups` store.** Cleaner to read, but a database version, a new cloud kind the Worker must accept, a new backup list and a new merge rule, for one small list per person that `orders` can already carry.
- **Groups as a field on overrides.** Overrides are edits to boards.json sounds; most own sounds are not.
- **Group names in each sound.** Renaming a group would rewrite every sound in it, and two devices could disagree on a name.

## Consequences

- An older copy of the app shows a kid's grouped sounds in one list, as before.
- The pad order record now changes when groups change, so a pad order and its groups sync together; a device's own pad order still wins on a clash (merge rules unchanged).
- If groups ever hold presets too, or beats, revisit: they would need their own store.
