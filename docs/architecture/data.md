# Data: the board, people, sounds and backups

**Answer first.**

- There is **one database** (`noodle-pads`, `store.js`), **one in-memory copy** of it (`state.js` `state`), and **one rule set** for the board (`model.js`, pure), bound to that copy by `board.js`.
- There is **no single write path.** `state.js persist` is the common one: it stamps the record and turns a failed write into a banner. App.js, backup-ui.js and cloud.js also write with `store.js db` directly. Their failures are reported in other ways, or only logged to the console.
- There is **one gate for data that comes in as a whole** (a backup zip, Older sounds found, a cloud pull): `backup.js cleanBackup`, then `merge.js mergeLoaded` through `backup-ui.js storeLoaded`. A beat file does not use it. It is cleaned by `sequencer.js beatFromFile` (`cleanPattern`).
- **"Which stores exist" is written out by hand in about ten places** (listed under [Seams](#seams)). Only `SCHEMA` order and the upgrades are tested. Adding a store means touching every one of those places.
- **Two kinds of sound:** presets (`source: 'bundled'`, from boards.json; `kit: true` for the shared kit, copied per person as `<personId>-<kitId>`) and own sounds (`source: 'user'`, IndexedDB `clips`, `user-…` ids). A preset is never stored. Only an edit of it is stored, as an `overrides` record.

## Files and what each owns

| File | Owns | Pure? | Called by |
|---|---|---|---|
| `store.js` | `DB_NAME`, `SCHEMA`, `DB_VERSION`, `STORE_NAMES`, `upgradeStores`, the `db` handle (`open`, `run`, `all`, `put`, `remove`, `batch`, `onChange`) | no (IndexedDB) | state.js; direct writes in app.js, backup-ui.js, cloud.js; leftover.js reads `DB_NAME` |
| `state.js` | `state`; `readStorage`, `loadStorage`, `persist`, `setOverride`, `setPersonEdit`, `deletePerson`, `deleteUserClip`, `saveMyVoice`, `deleteMyVoice`, `adoptStoredPeople`, `reIdStoredPeople`, `reIdIncoming`, `rememberRenames`, `renamedId` | no | nearly every screen |
| `model.js` | person colors, `kitFor`, `mergePeople`, `clipsForPerson`, `orderClips`, `withNewPresets`, `overrideFor`, `withBulkChanges`, `withHidden`, `overrideWithEmoji`, `personEditRecord`, `validateManifest`, `soloPerson`, `isDefaultPerson`, `personIdsIn`, `adoptPeople`, `groupKit`, `PICTURES`, `KIND_EMOJI`, `PERSON_KINDS`, `personThings`, `personCounts` | yes | state.js, board.js, backup.js, merge.js, screens |
| `board.js` | `people`, `person`, `currentPerson`, `clipsFor`, `anyClip`, `findClip`, `instrumentPicks`, `colorName`, `padColor`, `nextClipColor` | reads `state` | every screen |
| `settings.js` | `SETTINGS`, `LEVELS`, `levelOf`, `getSetting`, `setSetting`, `onSetting`, `followPerson`, `notifyAllSettings`, `cleanPrefs`, `allowedValue`, `inBackups`, `storedPair` | reads/writes `state.prefs`, `state.settings` | ~20 modules |
| `groups.js` | a kid's own groups: `cleanGroups`, `groupOwn`, `pruneGroups`, `moveGroup`, `joinGroups`, `newGroupId` | yes | pads.js, bulk.js, backup.js, merge.js, app.js |
| `pad-size.js` | the size slider's maths, `PAD_STOPS`, `fromOldSize` (settings upgrade) | yes | pads.js, settings.js |
| `pads.js` | the pad grid, the person menu, Edit sounds' choosing (`chosen`), drag order (`saveOrder`), kit/own group open state (localStorage) | no | app.js, bulk.js, sheet.js, backup-ui.js |
| `bulk.js` | Edit sounds with sounds chosen: change, move to group, delete with Undo, a group's ✏️ sheet | no | pads.js hooks (`setPadHooks`) |
| `sheet.js` | the sound sheet: makes, edits, hides and deletes one sound; ⭐ Save voice | no | pads.js (`openSheet` via app.js) |
| `people.js` | 👥 People, the profile sheet, `addPerson`, `deleteHere`, `editLook`, its own `storedLists` | no | app.js, backup-ui.js, welcome.js |
| `things.js` | 🗂️ See all: lists `personThings`, plays rows | no | people.js (`openThings`), app.js deps |
| `reid.js` | `CLOUD_ID`, `isCloudId`, `PERSON_STORES`, `remapId`, `remapText`, `remapRecord`, `reIdDoc` | yes | state.js, backup.js |
| `starters.js` | `STARTERS`, `nameSoundOf`, `dropNameSounds` (pre-1.0 data only) | yes | backup.js |
| `backup.js` | backup format, `makeBackup`, `readBackup`, `cleanBackup`, `refusal`, `beforeOne`, one-person helpers, `leftOutNote` | yes (plus zip) | backup-ui.js, leftover.js, cloud.js |
| `merge.js` | `mergeLoaded`, `mergeSummary`, `sameBytes` | yes | backup-ui.js |
| `zip.js` | `zip`, `unzip`, `crc32` | yes | backup.js, old-backup.js |
| `backup-ui.js` | 💾 / 📂 buttons, `storeLoaded`, `whatIsHere`, `savePersonBackup`, `pastPins`, its own `storedLists` | no | app.js, leftover.js, cloud.js |
| `old-backup.js` | `readEverything`, `makeEverything`, `holdings`, `holdsWords`, `sizeWords` | partly | leftover.js, backup-ui.js |
| `leftover.js` | ⚙️ Settings → Older sounds found on this device | no | app.js (`initLeftover`) |
| `download.js` | `downloadBlob` | needs a page | backup-ui.js, leftover.js, others |
| `util.js` | `newId`, `extensionFor`, `slug`, `count`, `localDate`, `remember`/`recall`/`forget` (localStorage that never throws), `versionLabel` | yes | everywhere |
| `app.js` | start-up order, who is showing (`setPerson`, `showPerson`, `startOver`), `settlePeople`, `addMadeSound`, `setClipEmoji`, the stores the factories write through (`beatLibrary`, `songBook`, the `deps` of `createDJ`, `createSong`, `initKids`) | no | `index.html` |

## IndexedDB: every store

`store.js` `SCHEMA` lists each store with its key and the database version that added it. `DB_VERSION` is the highest `since` (15 today). `upgradeStores(database, oldVersion)` only creates stores whose `since` is greater than `oldVersion`. It never changes an existing store or record. A field change needs no database upgrade. Every reader cleans old shapes instead (`cleanPattern`, `cleanSong`, `allowedValue`, `personColor`…).

| Store | Key | Since | Record (as written today) | Written by | Backup | Cloud |
|---|---|---|---|---|---|---|
| `clips` | `id` (`user-…`) | 1 | `{id, personId, label, emoji, color (palette name), voice, amount?, fx?, tweaks?, trim?, edits?, fade?, root?, from?: {id, how: 'mix'\|'chop'}, synth?, group? (g-…), blob, mime, created, exact?, changed?}` | sheet.js, chop.js, bulk.js, app.js (`addMadeSound`, `setClipEmoji`, Kids `saveClip`) | yes, audio as `sounds/<id>.<ext>` | yes |
| `overrides` | `id` (a preset's id, `<person>-<kitId>`) | 1 | `{id, label?, emoji?, color?, voice?, amount?, fx?, tweaks?, trim?, edits?, fade?, root?, hidden?, changed?}`: only what differs from boards.json | `state.js setOverride` (sheet.js, bulk.js, pads.js, app.js) | yes | yes |
| `orders` | `personId` | 2 | `{personId, ids: [clipId], groups?: [{id, name}], changed?}` | pads.js `saveOrder`, bulk.js `saveGroups` and Undo | yes | yes (one each) |
| `patterns` | `personId` | 3 | the person's one open beat (ADR 0017): `cleanPattern` shape `{id?, personId, name, bpm, bars, swing, rows, signature?, volume?, fx?}` | app.js `makeSequencer` `setOpen` | yes | yes (one each) |
| `beats` | `id` (`beat-…`, scratch `beat-scratch-<person>`) | 4 | a pattern plus `{id, name, created, saved, pinned?}` | app.js `beatLibrary`, `adoptKidsBeat`, Kids `saveBeat` | yes | yes |
| `people` | `id` | 5 | boards.json person: `{id, name?, color?, hidden?}` (only what differs). Added person: `{id, name, color, avatar, added: true, created, edited?, fun?, solo?, hidden?, offline?}` | `state.js setPersonEdit`, people.js `addPerson`, `app.js settlePeople`, `adoptStoredPeople` | yes | person record, not a `CLOUD_KINDS` kind (cloud area) |
| `settings` | `key` | 6 | `{key, value}`: device settings, older person choices from before `prefs`, and `renamedPeople` (not declared in `SETTINGS`) | `settings.js setSetting`, `state.js rememberRenames`, `reIdStoredPeople` | declared keys only (`inBackups`) | no |
| `decks` | `personId` | 7 | `{personId, keys: {KeyA: clipId\|null}, mine?, touch?, touchMine?, beatId? (old, dropped on next save)}` | app.js dj `saveDeck` | yes | yes (one each) |
| `takes` | `id` (`take-…`) | 7 | `{id, personId, name, created, duration, events}` | app.js dj `saveTake` / `deleteTake` | yes | yes |
| `songs` | `personId` | 8 | the open song: `cleanSong` shape `{id?, personId, name, tempo, tempos?, lanes, slots}` | app.js `makeSong` `save` / `close` | yes | yes (one each) |
| `songbook` | `id` (`song-…`) | 9 | a song plus `{id, created, saved}` | app.js `songBook` | yes | yes |
| `cloud` | `id` (person id) | 10 | this device's link: `{id, key, rev, sent, sounds, pin, check, newPin?, rememberUntil?, noOffer?}` (cloud.md "The cloud link") | cloud.js `saveLink`, `dropLink` | **never** | it is the link |
| `prefs` | `personId` | 11 | `{personId, values: {level, advancedBeats, padSize, …}}` | `settings.js setSetting` | yes | yes (one each) |
| `layouts` | `id` (`layout-…`) | 12 | `{id, personId, name, created, keys}` | app.js dj `saveLayout` | yes | yes |
| `voices` | `id` (`voice-…`) | 13 | `{id, personId, name, emoji, knobs, created, used, edited?}` | `state.js saveMyVoice` (sheet.js) | yes | yes |
| `bases` | `id` (`<person>\|<kind>:<record id>`) | 14 | `{id, personId, body}`: each record as last synced | cloud.js only | **never** | sync's own |
| `touchLayouts` | `id` (`touch-…`) | 15 | `{id, personId, name, created, bands, grid?}` | app.js dj `saveTouchLayout` | yes | yes |

`changed` is the edit stamp (`merge3.js` `STAMP`). `persist` adds it to records of the stores in `merge3.js STAMPED`, which today equals `cloud-sync.js CLOUD_KINDS`. People keep their own `edited` stamp instead.

The comments on `state` in `state.js` give older shapes for `patterns` (`rows: [{clipId, steps}]`) and `songs` (`slots`). The cleaners above are the true shapes.

**Opening.** `store.js db.open` reports `onBlocked` (another tab holds an older version) and closes itself on `onversionchange` (a newer tab wants to upgrade). Both become banners in `state.js loadStorage`. `db.run` and `db.batch` reject with "storage is not available" before the database opens (`tests/store.test.mjs`).

## The in-memory `state`, field by field

`state` is one exported object in `state.js`. `readStorage` replaces every stored field at once, from IndexedDB (all stores but `bases`).

| Field | From | Written by | Read by |
|---|---|---|---|
| `manifest` | boards.json (`app.js loadManifest`, checked by `model.js validateManifest`) | app.js once | board.js, state.js, backup-ui.js `whatIsHere`, pads.js (`kitGroups`), app.js |
| `personId` | — (who is showing) | app.js only: `showPerson`, `startOver` (null), `followRenames` | board.js `currentPerson`, settings.js `getSetting`/`setSetting`, every screen |
| `userClips` | `clips` | sheet.js, chop.js, bulk.js, app.js; `state.js deleteUserClip`, `deletePerson` | board.js `clipsFor` (via `clipsForPerson`), people.js counts |
| `overrides` (Map id→) | `overrides` | `state.js setOverride`, `deletePerson` | board.js `clipsFor`, bulk.js, sheet.js, app.js `setClipEmoji` |
| `orders` (Map personId→) | `orders` | pads.js `saveOrder`, bulk.js `saveGroups` / Undo | board.js `clipsFor`, pads.js `ownGroups`, app.js (`ownGroups` dep) |
| `patterns` (Map) | `patterns` | app.js `setOpen` | sequencer via `opened` |
| `savedBeats` | `beats` | app.js `beatLibrary`, `adoptKidsBeat`, Kids `saveBeat` | sequencer, song, kids, things |
| `peopleEdits` (Map) | `people` | `state.js setPersonEdit`, `adoptStoredPeople`, `deletePerson`; people.js `addPerson`; app.js `settlePeople` | board.js `people` (`mergePeople`), cloud.js `isOffline`, backup-ui.js |
| `settings` (Map key→value) | `settings` | settings.js `setSetting`, `state.js rememberRenames` | settings.js, `state.js renamedId` |
| `decks` (Map) | `decks` | app.js `saveDeck` | dj.js via `savedDeck` |
| `takes` | `takes` | app.js `saveTake`, `deleteTake` | dj.js, things |
| `songs` (Map) | `songs` | app.js `makeSong` `save`/`close` | song.js |
| `songbook` | `songbook` | app.js `songBook` | song.js, listen-ui.js, things |
| `cloud` (Map) | `cloud` | cloud.js `saveLink`, `dropLink`; `reIdStoredPeople` (deletes stale links) | cloud.js, pads.js (🔒 in the menu), people.js |
| `prefs` (Map) | `prefs` | settings.js `setSetting` | settings.js `getSetting` |
| `layouts`, `touchLayouts` | same names | app.js dj deps | dj-keys.js, dj-touch.js |
| `myVoices` | `voices` | `state.js saveMyVoice`, `deleteMyVoice` | sheet.js, bulk.js (🪄 Voice), things |
| `version` | version.json (`app.js loadVersion`) | app.js | backups, update.js, cloud.js, feedback, log-send |
| `screen` | localStorage `screen` | `app.js setScreen` | help.js, app.js |
| `beats` | — | `app.js setScreen` | nothing (dead) |
| `editing` | — | `app.js setEditing` | pads.js, bulk.js, app.js |
| `selected` | — | app.js sets it to null | nothing (dead) |

The `state.screen` comment in `state.js` says `'dj'`. The values are `app.js` `SCREENS` (`pads`, `beats`, `song`, `live`).

## Writing: `persist` and the other ways in

| Path | What it does | On failure |
|---|---|---|
| `state.js persist(store, value)` | `stampEdit` (in place), then `db.put` | console error and a banner: "This browser wouldn't save that change…", or "Not saved: another soundboard tab…" while `loadStorage` waits |
| `state.js setOverride(next)` | puts when the override changes something, else deletes it so the preset follows boards.json again | as `persist` |
| `state.js setPersonEdit(id, changes)` | `model.js personEditRecord`: a boards.json person keeps only differences (none: record deleted); an added person stores everything and gets `edited` on a name/color/avatar change | put: as `persist`; delete: console only |
| `state.js deleteUserClip`, `deleteMyVoice` | memory first, then `db.remove` | banner: "…it may come back after a reload" |
| `state.js deletePerson(id)` | one `db.batch` of every removal (and, for a boards.json person, the hidden record), then memory | refused, or storage not open (still opening, or closed for another tab's upgrade): nothing changes, a notice says so, returns null; `people.js deleteHere` then puts their cloud link back (`cloud.js restoreLink`; its bases were kept, `dropLink keepBases`) and returns false. With no storage at all (the open failed), memory only |
| app.js `beatLibrary.remove`, `songBook.remove` | `db.remove` | banner, as above |
| app.js `setOpen(null)`, song `close`, `deleteTake`, `deleteLayout`, `deleteTouchLayout` | `db.remove` | console only |
| app.js `adoptKidsBeat` | `db.batch` (unstamped) | console only |
| `backup-ui.js storeLoaded` | `db.put` per merged record (unstamped; keeps the incoming `changed`) | collected into `failed`; the notice names up to 5 |
| cloud.js (`deps.put`, `deps.remove`, links, bases) | `db.put` / `db.remove` / `db.batch` | the cloud area's own status |
| `state.js reIdStoredPeople` | one `db.batch` across every store, so a stopped start leaves old ids whole | throws; `app.js settlePeople` logs it |

Every successful `db.put`, `db.remove` and `db.batch` calls `db.onChange(store)`. `cloud.js initCloud` sets it: a change to a `CLOUD_KINDS` store or `people` schedules a sync, unless the sync itself is writing (`applying`).

## Start-up order

From `app.js start` (the exported `ready` promise resolves when it ends):

1. `installErrorLog`, the backdrop, usage events (`startUsage`), the grilles.
2. `loadManifest`: fetch `boards.json`, `validateManifest`. On a problem: a banner, and nothing else starts.
3. `state.js loadStorage({onLateOpen})`: `db.open` then `readStorage`, raced against `STORAGE_WAIT_MS` (1500 ms). If storage is late, the board starts without it ("waiting for another soundboard tab") and `onLateOpen` later runs `settlePeople` and redraws with `setPerson`. If it fails, a banner says sounds won't be saved. `readStorage` also runs `movePersonColors`. Guarded by `tests/storage-wait.test.mjs`.
4. `app.js settlePeople`:
   1. if storage is open, `adoptStoredPeople` (people an older boards.json named become added people; `tests/adopt-people.test.mjs`);
   2. `reIdStoredPeople` then `followRenames` (plain person ids become `p-…`; `tests/new-ids.test.mjs`);
   3. any added person still named `SOLO_NAME` ("Me") gets a fun name;
   4. if nobody is on show, `soloPerson(newId('p'))` is stored and `markNew` (`tests/fresh-start.test.mjs`).
5. `followUsage`, then the screens: `initPads`, `initSheet`, `initBulk`, `initPeople`, `initWhoNow`, `initThings`, `initWelcome`, `initTips`, `initCloudUI`, `initBackups`, `initSettingsUI`, …, `makeSequencer`, `makeSong`, `createDJ`, `initListen`, `initKids`, the `onSetting` hooks, `bindEvents`.
6. Who shows: `renamedId(location.hash || localStorage 'person')`, else the first person; `setPerson`.
7. `loadVersion`, `registerOffline`, `initUpdate`, `initNudge`, `setScreen` (remembered), `applyKids`, `offerWelcome`, `initLeftover` (looks for Older sounds once), and last `initCloud` (sets `db.onChange`, then `syncAll`).

Writes before step 7 (`settlePeople`'s) do not schedule a sync: `db.onChange` is still a no-op. `syncAll` at step 7 covers them.

## Concepts

### Presets and own sounds (the clip model)

A **clip** as screens see it is `board.js clipsFor`'s output, built by `model.js clipsForPerson`:

| Kind | Where it lives | `source` | `kit` | Id |
|---|---|---|---|---|
| Kit preset (365 today) | boards.json `kit`, copied per person by `model.js kitFor` | `'bundled'` | `true`, plus `kitId` | `<personId>-<kitId>` |
| A boards.json person's own clip (none today: `people` is `[]`) | boards.json `people[].clips` | `'bundled'` | — | as in the file |
| Own sound | IndexedDB `clips` | `'user'` | — | `user-<time36>-<rand4>` |

A preset clip is the kit entry (`label, emoji, color, file, group, inst?, plays?, shift?, chord?, level?, advanced?`) with its `overrides` record spread over it, plus `personId` and `source`. An own sound is its stored record plus `source: 'user'`. `model.js isKitClip` is the test for "a preset of the shared kit".

`clipsForPerson` filters, in order:

1. bundled first (overrides applied), then own sounds, oldest first;
2. `orderClips` with the saved order (`withNewPresets` slots a newly shipped preset after its neighbour);
3. hidden left out unless `includeHidden`;
4. `advanced: true` presets left out unless Advanced;
5. Notes / Chords / Bass presets of instruments the person did not pick left out (`instruments.js showsFor`).

`board.js clipsFor` options:

| Option | Means | Used for |
|---|---|---|
| (none) | what the person sees on 🔊 Pads | pads, kids, keys |
| `includeHidden` | hidden pads too | Edit sounds, name and colour choices, `findClip` |
| `allPresets` | every Advanced-only and every instrument's preset | following a reference: `anyClip`, `findClip`, a beat row, a DJ key, a take |
| `ownSounds` | the groups' own presets whatever the instrument pick | default keys and touch layouts |

`anyClip(id)` searches every person's board. `findClip(id)` searches only the person showing (hidden and all presets included).

**Audio is never stored for a preset.** Its file is `web/clips/kit/…`. An own sound's audio is the `blob` on its record. The voice, knobs, trim, edits and fade are settings on the record; `audio.js` renders from the original (sound area).

### Ids

| Thing | Shape | Made by | Checked by |
|---|---|---|---|
| Person (added) | `p-<time36>-<rand4>` | `util.js newId('p')` | `reid.js CLOUD_ID` (cloud), `model.js PERSON_ID` (any person id) |
| Own sound | `user-…` | `newId('user')` in sheet.js, chop.js, kids.js, app.js, cloud-sync.js | `backup.js` `CLIP_ID` |
| Preset copy | `<personId>-<kitId>` | `model.js kitFor` | `validateManifest` (no clash with a person's clip) |
| Beat / scratch beat | `beat-…` / `beat-scratch-<person>` | sequencer.js, app.js, `scratch.js scratchId` | `sequencer.js` `BEAT_ID` |
| Song / scratch song | `song-…` / `song-scratch-<person>` | song.js, listen-make.js | `song.js` `SONG_ID` |
| Take, key layout, touch layout, own voice | `take-…`, `layout-…`, `touch-…`, `voice-…` | dj.js, dj-keys.js, dj-touch.js, sheet.js | `rhythm.js` `TAKE_ID`, `keyset.js` `LAYOUT_ID`, `touch.js` `TOUCH_ID`, `backup.js` `VOICE_RECORD_ID` |
| Own group | `g-<time36>-<rand4>` | `groups.js newGroupId` | `groups.js` `GROUP_ID` |

`newId` must keep to lowercase letters, digits and dashes: backups refuse other ids.

### Preset edits (`overrides`)

An override holds only what differs from boards.json (`model.js overrideFor`; the sheet's and bulk's changes). `state.js setOverride` deletes one that holds only its `id`, so a later boards.json change shows through. Hiding a preset is `hidden: true` on its override (`model.js withHidden`): 🗑️ / 👁 in Edit sounds (`pads.js cornerBadge`), Hide/Show in the sheet, and bulk 🗑️. A picture change from the emoji chooser uses `model.js overrideWithEmoji` (`app.js setClipEmoji`). An override's person is found by its id prefix: exactly (`state.js deletePerson`), or by suffix search over kit ids (`model.js personIdsIn`, `backup.js` `isKitCopy`, `app.js setClipEmoji`).

### People

| Kind | Where | Stored record | Delete |
|---|---|---|---|
| boards.json person (none today; the format keeps them for v2) | `manifest.people` | only differences (`setPersonEdit`) | becomes `{id, hidden: true}`; "Bring back" in 👥 People |
| Added person | `people` store, `added: true` | everything | record and all theirs removed |
| Solo person | an added person with `solo: true` | `model.js soloPerson` | as added |

`board.js people()` is `model.js mergePeople`: boards.json people (edits applied, each with their clips plus kit), then added people by `created`, hidden left out unless asked.

- **Fields on an added person:** `name` (a fun name from `names.js`, max `MAX_PERSON` 20), `fun` (the name is generated, so it syncs), `avatar` (one of `model.js PICTURES` or any listed emoji), `color` (one of `PERSON_COLORS`), `created`, `edited` (set by `personEditRecord`; merges keep the newer), `solo`, `hidden`, `offline` (kept out of the cloud).
- **Two palettes.** Person colors are dark hex values white text reads on (`PERSON_COLORS`; old ones moved by `personColor` / `OLD_PERSON_COLORS` on every read). Pad colors are boards.json `palette` names (`red`, `blue`…), with `OLD_COLOR_NAMES` for older names. `board.js padColor` turns a name into CSS.
- **Default person.** `model.js isDefaultPerson`: an added solo (or "Me") person, never edited, not hidden, owning nothing. `merge.js` drops an incoming one always, and the device's once someone else arrives.
- **Adopting.** `model.js adoptPeople`: any person id that stored data names (`personIdsIn`) without a record becomes an added person with a fun name, a free color and picture. A hidden record with nothing stored is dropped. Used at start (`state.js adoptStoredPeople`) and for pre-1.0 data (`cleanBackup` with `oldStores`).
- **PINs** (cloud area) gate this device's views of a person's data: `cloud.js pinGuards`. In this area it hides 👥 People counts, gates the profile sheet (`people.js openProfileSheet`, `editLook`), and leaves a person out of a backup save or load (`backup-ui.js pastPins`, `backup.js withoutPeople`).

### Who is showing

`state.personId`. Set only in app.js: `setPerson` (asks for a PIN, `cloud-ui.js askToOpen`) → `showPerson` (sets it, `followPerson()`, the `--board` color, `#<id>` in the address, localStorage `person`, redraws pads, `seq.setPerson`, `song.setPerson`, Kids, preloads the person's sounds). `startOver` sets it to null, then draws the first person hidden behind 👋 Who's playing now?. `followRenames` moves it after a re-id. The `hashchange` handler and the start read the address through `state.js renamedId`, so an old plain-id link still lands. `people.js refreshPeople` re-shows the same person after any people change, or starts over when they are gone.

### Random person ids (`reid.js`, ADR 0002)

- **What it renames.** A plain id (an older boards.json gave kids' first names) is renamed everywhere it occurs. `reid.js remapRecord` rewrites every JSON string that equals the id or starts with `<id>-` (preset copies), so new fields are never missed. `blob` is kept as it is.
- **Order.** `state.js plainPersonIds` sorts longest first, so `ab` never touches `ab-2`.
- **On the device:** `state.js reIdStoredPeople`. Stale `cloud` links are dropped first. Then one `db.batch`, and the map goes into settings `renamedPeople`.
- **For incoming data:** `state.js reIdIncoming`, then `rememberRenames` (called by `backup-ui.js storeLoaded`).
- **Scratch ids are not renamed.** `beat-scratch-<old id>` keeps its old id and is found by prefix and `personId` (`scratch.js`). `backup.js intoPerson` renames scratch ids itself.

### Pad order and groups

- **One order record per person:** `orders` `{personId, ids, groups?}`. `ids` names the pads that were on screen when it was saved. `pads.js saveOrder` uses `mergeOrder`, so pads not showing (closed group, hidden) keep their slots. A drag moves a pad only within its section (`pads.js` `sectionOf`).
- **Own groups (ADR 0013):** a clip's `group: 'g-…'` and the order's `groups: [{id, name}]`. `groups.js groupOwn` draws them, then "Not in a group". `bulk.js saveGroups` prunes empty groups (`pruneGroups`). A merge joins groups (`joinGroups`).
- **Open and closed state is per device, in localStorage:** `kit-open` (kit groups, `model.js openKitGroups`), `groups-closed` (own groups), `chooser-closed` (the beat chooser's person sections, app.js). These never go into a backup.

### Levels and Advanced

- **The setting:** `level` is `kids` / `regular` / `advanced` (ADR 0019). It is stored as a pair with `advancedBeats` (`settings.js storedPair`) and read through `levelOf`, so an older copy that knows only `advancedBeats` still agrees.
- **Who reads `level`:** app.js `applyKids` (🧸 Kids screens), nudge.js, tips.js, listen-ui.js.
- **Who reads `advancedBeats`:** `board.js clipsFor` (sharps and flats), sheet.js, chop.js, sequencer.js, song.js; app.js redraws pads and keys on it.
- **Who sets them:** settings-ui.js, welcome.js, nudge.js (with Undo), sheet.js (the Advanced switch under Layers).

### Settings: person and device

`settings.js SETTINGS` declares every setting with a `scope` and either a `values` list or a `clean` function. Some also have `upgrade`, `legacy`, `read` or `quiet`.

| | Person (`scope: 'person'`) | Device (`scope: 'device'`) |
|---|---|---|
| Keys | `level`, `advancedBeats`, `timeSignature`, `padSize`, `padSkin`, `instNotes`, `instChords`, `instBass`, `seen`, `reaches` | `djLayout`, `sendLogs`, `sendUsage` |
| Stored in | `prefs` `{personId, values}` | `settings` `{key, value}` |
| Read order | the person's `prefs` value, then this device's `settings` value (choices from before per-person settings), then `legacy`, then `default` | `settings`, then `legacy` (`djLayout` reads localStorage `dj-layout`), then `default` |
| Travels | cloud (`prefs` is a `CLOUD_KINDS` kind) and backups | backups only (`inBackups`); `renamedPeople` never |

**Changing a setting.** `setSetting` throws on an unknown key or value. It logs the change (unless `quiet`) and writes the pair. With no `state.personId`, a person setting is written to the device (`tests/levels.test.mjs`). It then tells listeners and runs `followPerson`.

**Hearing about changes.** There are three ways:

| Call | Tells listeners | Called by |
|---|---|---|
| `onSetting(key, fn)` | registers `fn`; returns a function that stops it | about 20 modules (`settings-ui.js` listens to every key) |
| `followPerson()` | only of values that changed | `app.js showPerson`, after a cloud sync, inside `setSetting` |
| `notifyAllSettings()` | of every value | after a backup load (`backup-ui.js storeLoaded`) |

### Audio caches follow records

`audio.js` caches decoded and voiced audio by clip id. Every path that changes a clip's record or override must clear or rewarm the cache:

| Path | What it does to the cache |
|---|---|
| `sheet.js saveSheet` | `keepOriginal`, `dropRendered`, `load` |
| `bulk.js changeSounds` | `dropRendered`, `load` |
| `bulk.js removeSounds`, `sheet.js removeFromSheet`, `people.js deleteHere` | `forget` |
| `backup-ui.js storeLoaded` | `forget` for every put clip and override |
| cloud.js `deps.put` / `deps.remove` | `forget` for clips and overrides |

`app.js setClipEmoji` changes only the picture and leaves the cache alone (the picture is not audio).

### The stores as lists

Pure code (backups, merges, adoption, counts, sync) takes "the stores as lists", the shape of backup.json. Four modules build it from `state` by hand:

| Builder | Holds |
|---|---|
| `state.js storedLists` | everything but `settings` |
| `backup-ui.js storedLists` | everything with `settings`; `prefs` raw |
| `cloud.js storedLists` | everything with `settings`; `prefs` through `cleanPrefs` |
| `people.js storedLists` | only the kinds a person counts |

### Counting what someone has

Three separate counters say "what is here":

| Counter | Counts | Used by |
|---|---|---|
| `model.js personThings` / `personCounts` / `countsText` (`PERSON_KINDS`) | sounds, beats, songs, takes, voices, edits, key sets, layouts, touch layouts | 👥 People, 🗂️ See all, the one-person load sheet |
| `old-backup.js holdings` / `holdsWords` | sounds, beats, songs, takes, people, edits, DJ key sets, audio bytes (no voices or layouts) | "A backup now holds…", Older sounds |
| `merge.js mergeSummary` | the merge's `added` counts | the notice after a load |

### Backups (format 1.x, ADR 0011)

**backup.json**: `{app: 'noodlepads', format: '1.1', exported, version, people, clips (without blob, with file), overrides, orders, patterns, beats, settings, decks, takes, songs, songbook, prefs, layouts, voices, touchLayouts}`. The audio is under `sounds/<id>.<ext>`. Never in a backup: `cloud`, `bases`, `renamedPeople`, localStorage.

**Accepted** (`backup.js refusal`): app `noodlepads` or `noodle-pads`, any `1.x`. A pre-1.0 file (`beforeOne`: format `1` as a number, or an app id ending `-soundboard`) loads with `oldStores`.

**Saving:**
- 💾 Save a backup (`backup-ui.js` `saveBackup`): the whole device, past PINs.
- ⬇️ Export one person (`backup-ui.js savePersonBackup`, from 🗂️ See all): `backup.js personBackupLists`. It holds no device settings.

**Loading** (`backup-ui.js` `loadBackup`):
1. `readBackup(file, whatIsHere())`.
2. If `onePersonIn(data)`, ask ♻️ Restore them, or load it into someone here (`intoPerson`: reid'd onto them; their person record and settings stay out).
3. `pastPins`.
4. `storeLoaded`: `reIdIncoming`, copy each sound's bytes (`ownAudio`), `mergeLoaded`, `db.put` each record, forget audio, `deletePerson` the dropped defaults, `rememberRenames`, `readStorage`, `notifyAllSettings`, `renderPeople`, `refreshPeople`.
5. The notice: `mergeSummary` + `leftOut` (`leftOutNote`).

`tests/backup.test.mjs`, `tests/load-who.test.mjs` and `tests/merge.test.mjs` guard this path.

### What `cleanBackup` lets in

Every list keeps only known fields of the right type. Anything else is dropped and counted (`skipped`, and `left` by reason).

| Limit | Value |
|---|---|
| Zip file | under 300 MB unpacked (`zip.js unzip` `maxBytes`) plus 1 MB; at most 5,000 entries; stored or deflated only; no ZIP64; every entry CRC-checked; inflate stops past the declared size |
| backup.json | 8 MB (`MAX_JSON_BYTES`) |
| One sound | 80 MB (`MAX_SOUND_BYTES`); type must read as audio (`audioMime`: `video/*` becomes `audio/*`) |
| Older sounds, all audio | 2 GB (`leftover.js` `MAX_OLD_AUDIO_BYTES`) |
| Records per store | `MAX_RECORDS`: people 100, clips 2000, overrides 2000, orders 100, patterns 100, beats 1000, settings 50, decks 100, takes 500, songs 100, songbook 1000, prefs 100, layouts 500, voices 500, touchLayouts 500 |
| Ids | `CLIP_ID`, `BEAT_ID`, `SONG_ID`, `TAKE_ID`, `LAYOUT_ID`, `TOUCH_ID`, `VOICE_RECORD_ID`, `PERSON_ID`, `groupIdOf` |
| People | a non-added person must be a boards.json person; an added one must not reuse a boards.json id. Name ≤ 20, trimmed (blank: a fun name). Color must carry white text (`whiteReadsOn`), else the next free one. Avatar must be a listed emoji. |
| Sounds | label ≤ 24, emoji ≤ 8 chars, color must be a palette name (`colorOk`), voice must be known; every sub-field through its own cleaner (`cleanTweaks`, `cleanTrim`, `cleanEdits`, `cleanFade`, `cleanFrom`, `cleanSynth`) |
| Overrides | only for a boards.json clip or a known person's preset copy |
| Orders | ≤ 500 ids of ≤ 64 chars; `cleanGroups` (≤ 50 groups, names ≤ 24) |
| Owner | every per-person record must name a known person (boards.json, added in the backup, or added on this device) |
| Settings | declared keys with allowed values only |
| Stamps | `changed` kept when `cleanStamp` accepts it (not more than a day in the future) |

### Merge rules (`merge.js mergeLoaded`)

Loading never replaces or deletes anything on the device (except a default person), and loading twice changes nothing.

| Kind | Rule |
|---|---|
| People | matched by id. The newer `edited` brings `name`, `color`, `avatar`, `fun`; else the device's stays. Default people are dropped (see above). |
| Clips, beats, songbook, takes, layouts, touchLayouts | matched by content without the id (`canonical`; clips also compare audio bytes, `sameBytes`, and ignore `from` and `group`). Same content: skipped, and a renamed id is remembered. A different record under a used id: kept under a fresh id, and every reference is pointed at it (beat rows, take events, key maps, bands, songs' beats, pad orders, `from`). |
| Voices | one per id. The newer `edited` (or `created`) wins; `used` keeps the latest. |
| Orders, patterns, decks, songs, prefs (one per person), overrides, settings | the device's when it has one, else the incoming one. Order `groups` are joined. |

A cloud pull also ends in `storeLoaded` for some records. Others are put directly after the three-way merge (`merge3.js`; cloud area).

### Older sounds found on this device (`leftover.js`)

`initLeftover` runs once after start. `readLeftover` lists every database at this address but `noodle-pads` (`old-backup.js readEverything`, read only). `pickOldDatabase` picks one with `clips` and `overrides` or `people`. The section shows only if `hasData`.

- 📥 **Bring them in:** `readOldStores` → `cleanBackup` with `oldStores` (adopts people, drops name sounds, `starters.js dropNameSounds`) → `storeLoaded`. It reads only 11 named stores (`leftover.js` `STORES`). Whether any older copy had more is unverified.
- 💾 **Save everything it left:** `old-backup.js makeEverything`, a zip with a pre-1.0 backup.json (format `1` as a number) plus every other database and localStorage under `everything/`. 📂 Load a backup reads it.

Nothing found is changed or deleted.

### Deleting

| What | Path | Asks first | Undo |
|---|---|---|---|
| Own sounds (and hiding presets) from Edit sounds | `pads.js cornerBadge` / bulk bar → `bulk.js removeSounds` | yes (two taps) | ↩️ Undo in the banner, 8 s: puts back records, override edits and the order's groups |
| A sound from its sheet | `sheet.js removeFromSheet` → `state.js deleteUserClip` | yes for own; hide is one tap | none (hide: Show sound) |
| A group | `bulk.js editGroup` | yes | none; its sounds stay, in no group |
| An own voice | `sheet.js` `deleteVoice` → `state.js deleteMyVoice` | yes | none |
| A person | `people.js` profile Delete → `deleteHere` → `cloud.js dropLink` (bases kept), `syncEnded`, `state.js deletePerson`, then `cloud.js forgetBases`, `audio.forget` | yes; a third tap deletes the cloud copy | boards.json people: Bring back (their own sounds don't come back) |

`state.js deletePerson` removes their clips, preset edits (`<id>-<kitId>`), beats, songbook, takes, layouts, voices, touch layouts, open beat, order, deck, open song, prefs, and the people record, all in one transaction (a boards.json person's record is put back hidden in the same one). It returns the clip ids so the caller can forget their audio, or null when the browser refused it (nothing changed).

### Edit stamps

`state.js persist` stamps `changed` in place (`merge3.js stampEdit`). The cloud's three-way merge uses it for "the newer edit wins" (`stampOf` falls back to `saved` and `edited`). App.js persists beats, the open beat and saved songs as `structuredClone`, so the copy in memory has no stamp while the stored copy does. Only the next `readStorage` brings the stamp into memory. Whether a sync from memory loses a clash because of this is unverified (cloud area).

## Seams

1. **The list of stores is written out by hand in about ten places, and only SCHEMA is tested:**
   - `store.js SCHEMA`
   - `state.js readStorage` (a positional destructuring: a new store must go in the same place as in `SCHEMA`)
   - `state.js deletePerson`
   - the four `storedLists`
   - `reid.js PERSON_STORES`
   - `merge.js` `STORES`
   - `backup.js` `MAX_RECORDS`, `makeBackup`, `personBackupLists`, `cleanBackup`'s return, `STORE_WORDS`
   - `model.js personIdsIn` (leaves out `prefs` on purpose: settings alone make no person)
   - `merge3.js STAMPED` and `cloud-sync.js CLOUD_KINDS`
   - `leftover.js` `STORES`

   A new store missed in `deletePerson` outlives its person, and `adoptStoredPeople` then brings the person back. Missed in `PERSON_STORES`, the store keeps old plain ids. Missed in `merge.js STORES`, it never loads from a backup.
2. **Writes bypass `persist`** (see the table above). A fix to failure reporting in `persist` misses `storeLoaded`, the app.js deletes, `adoptKidsBeat` and cloud.js. The app.js deletes report failure two different ways.
3. **Four "stores as lists" builders** (above). A new store added to one is easy to miss in the others: `people.js storedLists` feeds 👥 counts and See all, `backup-ui.js` feeds backups, `cloud.js` feeds sync.
4. **Three counters of what is here** (above). "A backup now holds…" does not mention voices or key/touch layouts, though a backup carries them.
5. **`extensionFor` is defined twice:** `util.js extensionFor` and `old-backup.js extensionFor` (the second says it copies the first). Pluralizers are three: `util.js count`, `old-backup.js plural`, and `model.js`'s private `plural`.
6. **Making an own sound is done in five places, each building the record by hand:**
   - `sheet.js saveSheet`
   - `sheet.js makeMix`
   - `chop.js makePads`
   - `app.js addMadeSound` (beats, songs, takes made into sounds)
   - Kids, through `app.js initKids` `saveClip` (kids.js builds the record)

   A new required field on `clips` must be added to all five, and to `backup.js cleanBackup`.
7. **Editing one sound is done in three ways:** `sheet.js saveSheet`, `bulk.js changeSounds` (through `model.js withBulkChanges`) and `app.js setClipEmoji`. All three branch on own sound or preset, then call `persist('clips')` or `setOverride(overrideFor…)`.
8. **The open-beat and open-song wiring lives in `app.js`** (`setOpen`, `beatLibrary`, `songBook`, the dj `deps`), not in `state.js`. A change to how a beat or song is stored is made there.
9. **Finding a preset edit's person.** It is done by exact prefix plus kit lookup (`state.js deletePerson`), by `.some` over kit ids (`backup.js` `isKitCopy`), and by the first kit id that is a suffix (`model.js personIdsIn`, `app.js setClipEmoji`). The last two depend on kit order (gotcha 1).
10. **`SOLO_COLOR` is an old person color.** `model.js` `SOLO_COLOR` is `#1F3FA8`, a key of `OLD_PERSON_COLORS`. A new device's first person is made in that color. They show in it until the next `readStorage` moves it to `#2D3FD6` in memory; storage keeps the old one until the record saves again. Until then the profile's color picker shows no color as chosen.

## Invariants and gotchas

| # | Rule the code depends on | Guarded by |
|---|---|---|
| 1 | **Kit order:** no kit id may be a `-`suffix of a kit id listed *before* it. `personIdsIn` takes the first suffix match: with `go` listed before `lets-go`, an edit of `p-x-lets-go` names a person `p-x-lets`, and `adoptStoredPeople` makes a phantom person at the next start (checked with Node: `lets-go` is 337th and `go` 348th today, so it holds by luck). | none (check 6 below) |
| 2 | `SCHEMA` only grows: a new store gets a new `since`, never an edit of an old line | `tests/store.test.mjs` |
| 3 | `readStorage`'s destructuring matches `STORE_NAMES` minus `bases`, by position | none (check 5 below) |
| 4 | Every per-person store is in `reid.js PERSON_STORES`, or a renamed person loses it | none (check 2 below) |
| 5 | Ids from `newId` stay `[a-z0-9-]`; backups refuse others | `tests/backup.test.mjs` (id tests) |
| 6 | A 1.x backup from 1.0 on must load in every newer copy (ADR 0011) | `tests/backup.test.mjs` ("any 1.x loads") |
| 7 | An override holding only its id is deleted, never stored | `tests/model.test.mjs` (`overrideFor`) |
| 8 | A boards.json person's record holds only differences; added people never lose their record to `personEditRecord` | `tests/model.test.mjs` (`personEditRecord`) |
| 9 | `readStorage` replaces memory. Anything held only in memory (a change `persist` failed to save, a solo person made while storage waited) is gone after a backup load, a cloud sync or a late open. | `tests/storage-wait.test.mjs` (late open) |
| 10 | `deletePerson` must remove every record naming the person. One left behind (a preset edit once did) brings them back through `adoptStoredPeople`. Its removals are one transaction, so a refused delete keeps all of them. | `tests/delete-shown.test.mjs`, `tests/delete-cloud.test.mjs`, `tests/delete-leftover.test.mjs` |
| 11 | `persist` mutates the record (`changed`) | none |
| 12 | `setSetting` with nobody showing writes a person setting to the device | `tests/levels.test.mjs` |
| 13 | `level` and `advancedBeats` are always written together | `tests/levels.test.mjs` |
| 14 | A setting not declared in `SETTINGS` never enters or leaves in a backup | `tests/backup.test.mjs` (settings) |
| 15 | Merging the same backup twice adds nothing | `tests/merge.test.mjs` |
| 16 | Moving a sound into a group does not make it a new sound on merge (`group` and `from` are left out of the comparison) | `tests/groups.test.mjs` |
| 17 | A saved order names only pads that were shown; a new preset slots in by `withNewPresets` | `tests/model.test.mjs` (`clipsForPerson`) |
| 18 | IndexedDB in tests is `tests/fake-idb.mjs` (all-or-nothing commits, `failCommit`). docs/layout.md still says IndexedDB is checked only by hand. | — |

## To change X, touch …

| Change | Touch |
|---|---|
| **A new IndexedDB store** | 1. `store.js SCHEMA` (new `since`) and its header comment; `tests/store.test.mjs`. 2. `state.js` `state`, `readStorage` (same position), `deletePerson` and `storedLists`. 3. The other storedLists (`backup-ui.js`, `cloud.js`, and `people.js` if it counts). 4. `reid.js PERSON_STORES`. 5. `model.js personIdsIn` (and `PERSON_KINDS`, `personThings` if 👥 counts it). 6. `backup.js`: `MAX_RECORDS`, `makeBackup`, `personBackupLists`, `cleanBackup` (a cleaner and the return), `STORE_WORDS`. 7. `merge.js` `STORES` and a rule. 8. `merge3.js STAMPED` and `cloud-sync.js CLOUD_KINDS` if it syncs (cloud area). 9. The writer in `app.js` deps, or a helper in `state.js`. 10. The backup header comment, docs/guide.md, `web/privacy.js` if it goes to the cloud. |
| **A new field on an own sound** | the five places that make one (Seam 6); `sheet.js saveSheet`'s edit branch (it deletes fields before assigning); `backup.js cleanBackup` clips; `model.js overrideFor` and `cleanBackup` overrides if presets get it too; `model.js withBulkChanges` if bulk edits change it; `merge.js` skip list if it is not content |
| **A new setting** | `settings.js SETTINGS` (scope; `values` or `clean`); a control in settings-ui.js; `onSetting` where it acts; `tests/startup-remembered.test.mjs` only if it uses localStorage. Backups carry it automatically. |
| **A new person field** | people.js `addPerson`; `model.js soloPerson`, `mergePeople` (it copies named fields only), `adoptPeople`, `personEditRecord` (`edited` stamping); `backup.js cleanBackup` people; `merge.js` people rule (its field list); cloud (cloud area) |
| **A new kit sound** | `boards.json` `kit` (id, label, emoji, palette color, file, group); `validateManifest` checks it; `just preset-loudness --fix`; place it *after* any kit id it is a `-`suffix of (gotcha 1). A saved order slots it in by `withNewPresets`. |
| **A new id kind** | `util.js newId(prefix)`; an id regex for `cleanBackup`; `merge.js byId` with its prefix and the references it must follow |
| **A new way data comes in** | `backup.js cleanBackup` then `backup-ui.js storeLoaded`; never `db.put` raw input |
| **A destructive action** | two taps (`armed` class) and, where work is lost, `ui.js showBanner` with `action: {label: '↩️ Undo', fn}` as `bulk.js showUndo` does |

## ✅ Checked by tests

The claims above marked as checked are tests in `tests/architecture.test.mjs`. When one fails, change this file and the test in the same commit as the code.
