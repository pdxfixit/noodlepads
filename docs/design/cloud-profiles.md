# Cloud profiles

**What it is.** Everyone on a Noodle Pads board lives in the cloud once they
have made something: one shared list on noodlepads.com, open on any device.
Their sounds, beats, songs, takes, DJ keys, kit edits and settings follow
them. A person can be set 📴 Offline (this device only) instead. The device
keeps working offline and catches up when it is online again. Kids never type
a profile name: they get a fun name and choose an emoji. A 4-digit PIN is
optional, asked each time the person is opened unless the device remembers
it. One sound, beat or song can be shared with a code.

Decided by Ben, 2026-10-11 (the rules are in [decisions.md](../decisions.md),
Hosting and data and People and boards; why, in
[ADR 0002](../adr/0002-cloud-profiles-on-one-worker.md)). Calls an agent made
while Ben was away are marked **provisional** here and carded in
[questions.md](../questions.md).

## 1. The footprint

One Cloudflare Worker and one D1 database, on the free plan. Nothing else: no
KV, no R2 (it needs a card on file), no Cron Triggers, no rate-limit binding.
No secrets. The player metrics keep nothing of the IP
([ADR 0016](../adr/0016-player-metrics.md)).

- The Worker is `worker/index.js`, the same script that serves the static
  files. It owns `/api/…` and hands every other path to the assets.
- The database is `noodle-pads`, binding `DB`. Its tables are in
  [worker/schema.sql](../../worker/schema.sql).
- Problem reports move from KV into the same database (table `reports`, 30
  days). Expired reports are deleted by the next report that arrives, so no
  scheduled job is needed.

## 2. Free-plan budget

Verified against Cloudflare's docs on 2026-10-11 (D1, Workers Free):

| Limit | Free | What we use, in a busy family day | Guard in the Worker |
|---|---|---|---|
| Storage per database | 500 MB | about 50 MB a year (5 kids, 50 sounds each, about 200 KB a sound) | all sounds together at most 400 MB; one profile at most 40 MB |
| Row or BLOB size | 2,000,000 bytes | audio in pieces of 1,900,000 bytes | `CHUNK_BYTES` |
| Rows read a day | 5,000,000 | about 2,000 | list at most 300 profiles; pulls read only changed rows (index on `rev`) |
| Rows written a day | 100,000 | about 1,500 | 1,000 reports, 50 new profiles, 5,000 pushes and 500 shares a day; 200 records a push; last activity at most once an hour a profile |
| Worker requests a day | 100,000 | about 3,500 at most | no polling while hidden: sync on open, on change (20 s debounce), on focus and blur, and every 5 minutes only while shown and focused (per device: below) |
| Worker CPU per request | 10 ms | PIN check about 2 ms | PBKDF2 at 20,000 rounds |
| Request body | 100 MB | at most 1.9 MB (one audio piece) | `readCapped` |

The busy day, worked out: 5 kids each open the app 10 times (50 opens × about
4 reads = 200 reads, 50 key checks); each makes 100 changes, gathered by the
debounce into about 20 pushes of 5 records (5 × 20 × (5 records + their
indexes + the rev bump) ≈ 1,000 writes); 10 new sounds each, one piece each
(50 × 3 = 150 writes). Listing profiles when People opens: at most 300 reads,
a few times a day. Two orders of magnitude below every limit.

**Per device.** One sync is one request per person in the cloud on that
device when nothing changed (a pull of an empty page), plus a push and a
piece per new sound when something did. A device shown and focused for an
hour, idle, syncs 12 times; each focus or blur adds one at most every 10 s
(`MIN_GAP_MS`), and a run of edits one per 20 s quiet spell. A busy hour, then:
12 timed syncs, about 30 focus and blur syncs and about 30 after changes,
about 70 syncs, so about 100 requests for one person and about 350 for a
shared tablet with five. The busy day, five kids on five devices for two
hours each, is about 1,000–3,500 requests: 3.5 % of the free 100,000 at
worst. Each empty pull reads about 4 rows and writes none (last activity is
written at most once an hour), so syncing adds about 15,000 row reads a day
at worst, 0.3 % of the free 5,000,000.

Once a daily limit is used up, D1 refuses queries until 00:00 UTC. The Worker
answers 503 with `{over: true}`; the app keeps everything on the device and
says "The cloud is resting until tomorrow. Everything still works here, and
it will catch up."

## 3. The data

### On the server (D1)

| Table | One row per | Notes |
|---|---|---|
| `profiles` | person in the list | fun name, avatar, color, PIN hash and salt, wrong tries, `rev`, `active` (last open, pull or push, to the hour) |
| `keys` | device that opened a profile | only the key's SHA-256; `session` 1 when that device does not remember it |
| `records` | record in a profile | `kind` + `id`, the record as JSON without audio; tombstones for deletes |
| `sounds` | piece of audio | unguessable id, owner (`''` once only shares use it), size, piece count, SHA-256 |
| `sound_chunks` | 1.9 MB piece | BLOB |
| `shares` | share code | the snapshot (`bundle`), its preview sound, who shared it |
| `share_sounds` | sound a share uses | keeps it when its clip or profile is deleted |
| `reports` | problem report | 14 days |
| `counters` | name × UTC day | the daily caps |
| `migrations` | migration applied | `worker/migrations/`, `just cloud-migrate` |

`worker/schema.sql` is the whole schema, for a new database (`just
cloud-schema`, which refuses one that has tables). The live database is
brought there by `worker/migrations/NNN-*.sql`, applied in order by `just
cloud-migrate` (a dry run unless `--yes`), each recording itself in
`migrations`. `tests/migrations.test.mjs` runs them on the schema the live
database had (`tests/schema-before-001.sql`) and checks the result equals
`schema.sql`.

Record kinds are the IndexedDB stores that belong to one person: `clips`
(their sounds, without the Blob, plus `sound` and `sha256`), `overrides`
(edits to their copy of the kit, ids `<person>-<kit id>`), `orders`,
`patterns`, `decks`, `songs`, `prefs` (one each per person, id = the person's
id), `beats`, `takes`, `songbook`. **Settings travel with the person** (Ben,
Q8): `prefs` holds the person's own (`settings.js` `scope: 'person'`:
Advanced, time signature, pad size); the DJ keyboard (the device's own
keyboard), 📮 problem reports and the device code stay the device's (Q17).

### On the device (IndexedDB version 10, and `bases` since 14)

A new store, `cloud` (key `id`, the person's id), one record per person who is
in the cloud on this device:

```
{ id, key, rev, sent: {"<kind>:<id>": hash}, sounds: {<clip id>: {sha256, sound}} }
```

- `key`: the device key from opening the profile.
- `rev`: the profile's `rev` this device has caught up to.
- `sent`: a hash of each record as the cloud has it, from the last sync. A
  local record whose hash differs was changed here; one in `sent` but gone
  here was deleted here.
- `sounds`: each clip's audio SHA-256 and cloud sound id, so audio is hashed
  and uploaded once. A clip's audio never changes (trims, voices and edits are
  settings), so a clip id's entry never goes stale.

The link also holds `pin` (the profile has one), `remember` (this device
remembers it: the key is stored; otherwise it lives in the page's memory
only) and `check` (a PBKDF2 hash of the PIN, so the device can check it
offline). Backups never carry `cloud`: it is this device's link.

A second store, `bases` (key `id`, `"<person>|<kind>:<record id>"`), holds
each synced record as it was at the last sync, without its audio:
`{id, personId, body}`. It is the base of the three-way merge (§ 6). Its
hash is the record's `sent` entry; the two are saved together after each
pull and push slice. Backups never carry it, the app's state never reads it,
and dropping a person's link drops their bases. A device upgraded from
version 13 starts with none: until its first sync after the upgrade, `sent`
decides as before.

Every record a kid edits carries `changed` (milliseconds), stamped when it
is saved (`state.js` `persist`). Backups and the cloud carry it; it is not
content, so it never makes a record look different. A stamp more than a day
in the future is dropped.

Person records gain `avatar` (an emoji), `fun: true` (the name was made by
the generator), `offline: true` (📴 Offline) and `solo: true` (the device's
own first person, until edited). Backups carry all four.

**Shared with me** is localStorage `shared`: the codes this device opened,
with kind and title, newest first, at most 100.

## 4. Names and avatars

- `web/names.js` `funName(taken, random)` makes two styles, each as likely
  (Ben's examples): an adjective and an animal ("Friendly Sloth"), or a title
  and a food or thing with its first letter ("Captain Cranberries"); at most
  20 characters, never one in `taken`. `isFunName(name)` says whether a name
  is one the generator can make; the Worker uses it to refuse any other name.
  🎲 rerolls.
- The avatar is any emoji in `PICTURES` (`web/model.js`), the picture chooser
  the app already has. The Worker refuses any other.
- **No typing, and nobody is "Me".** People has no name field. Every new
  person, a new device's first included, gets a fun name, a random picture
  and the next free color. An older copy's "Me" gets a fun name when the app
  starts.
- **A typed name from before stays on the device** until that person's first
  sync, which gives them a fun name first (and stamps `edited`), so a typed
  name never leaves the device.

## 5. Opening and changing a profile: the API

All routes are under `/api/`. Every request with a body is JSON from the
site's own Origin, at most 64 KB, except audio pieces (raw bytes, at most
1.9 MB). Every answer is JSON with `Cache-Control: no-store`, except audio.
A device key goes in `Authorization: Bearer <key>`.

| Route | Needs | Does |
|---|---|---|
| `GET /api/cloud` | — | `{ok: true}`: the app's check that the cloud is there |
| `GET /api/profiles` | — | the list: id, name, avatar, color, `pin` (has one), newest first, at most 300 |
| `POST /api/profiles` | — | makes a profile: `{id, name, avatar, color, pin?}` → `{key, rev}` |
| `POST /api/profiles/:id/open` | the PIN, if set | `{pin?, remember?}` → `{key, rev, name, avatar, color, edited}`; `remember: false` makes a session key; a wrong PIN → 401 `{tries}`; while waiting → 429 `{wait}` |
| `DELETE /api/profiles/:id/key` | key | Forget on this device: deletes the key the request carries |
| `PATCH /api/profiles/:id` | key | `{name?, avatar?, color?, edited?}`; `{pin, newPin}` sets, changes (`newPin` a PIN) or removes (`newPin: null`) the PIN, and needs the current PIN too |
| `DELETE /api/profiles/:id` | key, and the PIN if set | deletes the profile, its records, keys and unshared sounds (📴 Offline uses it) |
| `GET /api/profiles/:id/records?since=N` | key | records with `rev > N`, oldest first, 500 at a time: `{records, rev, more}` |
| `POST /api/profiles/:id/records` | key | `{put: [{kind, id, body}], del: [{kind, id}]}` (200 at most) → `{rev, was}` |
| `POST /api/profiles/:id/sounds` | key | `{sha256, bytes, mime}` → `{id, need: [piece numbers]}`; a sound the profile already has (same SHA-256 and size) needs none |
| `PUT /api/sounds/:sid/:n` | key of its owner | one piece, raw → `{need}` |
| `GET /api/sounds/:sid` | — | the audio, once every piece is in; `Cache-Control: immutable` |
| `POST /api/profiles/:id/shares` | key | `{kind, title, bundle, preview?}` → `{code}`; the same snapshot again gives the same code |
| `GET /api/shares/:code` | — | `{kind, title, bundle, preview, created}`; case and dashes don't matter; no record in the bundle says whose it was (no `personId`) |
| `POST /api/log` | — | a problem report (ADR 0009), into `reports` |

### The PIN

- Four digits, optional, per profile. Stored as PBKDF2-SHA-256 (WebCrypto in
  the Worker), 20,000 rounds, with 16 random bytes of salt per profile.
- **Open** (read the records) needs it; **change** (anything else) needs the
  device key that opening gave. Changing or removing the PIN needs the current
  PIN as well.
- **Wrong tries:** after 5 wrong PINs in a row the profile waits 10 minutes
  before any PIN is checked again (`fails`, `locked_until`, in D1). Trying all
  10,000 PINs takes 2,000 waits: about two weeks without a break.
- **Asked each time the person is opened** (Ben, Q9): switching to them, or
  starting the app on them. Online, `open` checks it and gives a key; offline,
  the device's own `check` lets them in and the sync waits. "Remember on this
  device" on the PIN pad (off to start) keeps the key, so this device stops
  asking; 🙈 Forget on this device (beside Change PIN) drops it, in the cloud
  too. Each open deletes the key this device held before, so a device holds
  one key per profile; session keys a week old are deleted on the next open.
  A new PIN or a reset deletes every key.
- **If everyone on a device has a PIN** the board stays hidden behind the PIN
  pad, which offers 👋 Someone new (Q19).
- **What it is not:** sound files play without it (their ids are unguessable
  but not secret), and four digits behind a slow hash do not survive anyone
  holding the database. It stops a sibling opening or changing your profile in
  the app. The disclosure says so.

### Making the list and keys

- Profile ids are the person's id on the device, always random (`p-…`,
  `web/reid.js` `CLOUD_ID`), so every record that names its person still does
  on every device. Making a profile with any other id is 400 `id`, and the
  app's API client refuses such an id before sending (`cloud-api.js`). Making
  a profile whose id exists is 409; the app then opens it instead (the same
  person, from a backup on another device).
- A profile an older copy made under a plain id (a kid's name) is unlisted,
  and nothing renames it (Ben, Q27). A device still linked to one drops the
  link, and the person goes up as new under their random id.
- Keys and sound ids are 128 random bits (`crypto.getRandomValues`), base32.
  Share codes are 8 characters from 32 with no 0/O or 1/I: about 40 bits,
  shown as `ABCD-2345`.

## 6. Sync

`web/cloud-sync.js` holds the rules as pure functions; `web/cloud.js` runs
them against storage and the API.

**Who:** everyone on the device who has made something (a sound, beat, song,
take or kit edit) and is not 📴 Offline; a person with nothing of theirs
stays here, so a visitor's empty first board never fills the public list
(Q20). Their profile is made at the first sync, with a fun name
first. The same person already in the cloud (from a backup elsewhere) is
opened instead; one with a PIN waits, locked, for it.

**When** (`web/sync-timing.js`; Ben, 2026-10-11: "transitions focus/blur, as
well as every 5?m while active"): on open; 20 s after the last change (`db`
reports every put and delete); on every focus and blur (window `focus` and
`blur`, and `visibilitychange` both ways), gathered for 1.5 s so a quick
blur and focus run one sync; and every 5 minutes while the page is shown and
focused. Hiding the page with a change waiting syncs at once, since the page
may close. A focus or blur within 10 s of the last sync, with nothing
changed, skips. Nothing runs on a timer while the page is hidden or in the
background. One `syncAll` at a time, and one sync at a time per person.
A sound over 25 MB (the app makes up to 80 MB: a long song as a sound) stays
on the device, and the rest syncs.

**A sync is a pull, a three-way merge, then a push** (Ben, 2026-10-11:
"ensure reconciliation of save data is robust and prepared for 3-way
merging"). The rules are `web/merge3.js`; `web/cloud-sync.js` runs them.

1. **Pull.** `GET records?since=rev`, page by page. The records become a
   backup-shaped document for that person and go through `cleanBackup`, the
   same checks as a backup. A sound's audio comes from this device when it
   has that sound (audio never changes under a sound's id), else from the
   cloud. A record deleted here and unchanged there, or the same on both
   sides, needs nothing fetched.
2. **Merge.** Each pulled record meets two others: this device's copy and
   its **base**, the record as it was at this device's last sync (IndexedDB
   `bases`). Then:

   | Here (vs the base) | There (vs the base) | What happens |
   |---|---|---|
   | unchanged | changed | the cloud's is stored |
   | changed | unchanged | this device's stays; the push sends it |
   | changed | changed | **field by field** (below) |
   | unchanged | deleted | deleted here |
   | changed | deleted | this device's stays, and goes back up |
   | deleted | unchanged | the push deletes it in the cloud |
   | deleted | changed | the cloud's comes back |
   | none | new | stored through the backup merge, which spots one the device already has under another id |

   **Field by field:** a field changed on one side takes that side. A field
   changed on both:

   | Field | Rule |
   |---|---|
   | settings (a name, emoji, color, tempo, swing, voice, a trim, knobs…) | the newer edit wins |
   | a beat's rows (`beats`, the open beat `patterns`) | row by row when both sides have the same sounds in the same places; else by sound, when no sound has two rows. Within a row, pill by pill: a pill turned on or off on one side takes that side; a pill with no base (a bar or a row added on both sides) is on if either has it on. Rows added on either side come in; a row removed on one side goes unless the other changed it. |
   | a song's slots | slot by slot when both play the same beats in the same order |
   | a pad order's sounds and groups | by id: added on either side come in; removed goes unless changed; the side that reordered sets the order |
   | a person's settings (`prefs`), DJ keys (`decks`), a layout's keys | key by key, the newer edit winning a key both changed |
   | an own voice's last use | the later one |

   **Newer** compares `changed`, the time of the record's last edit on the
   device that made it (stamped by `state.js` `persist`, carried by backups
   and the cloud, never counted as content; a record from before it uses
   `saved` or `edited`). A tie goes to the cloud's.

   **No safe merge** (a list changed on both sides with no rule above, such
   as an effect chain, a take's events, a song's slots rearranged, or a beat
   with two rows of one sound rearranged): a sound, beat, take, song or
   layout keeps both, as a backup does: this device's under its id, the
   cloud's under a new id. Pad orders, open beats, DJ keys, open songs,
   settings, kit edits and own voices can hold only one, so the newer edit
   wins there.

   **No base** (a device synced before bases were kept, or a record both
   sides made): the hash in `sent` still tells which side is unchanged; a
   record changed on both is kept as two, as before, or, for kinds that hold
   one, merged field by field with the newer edit winning each clash. A base
   whose hash is not `sent` (a sync cut off between saving the two) is not
   trusted.

   The profile's name, avatar and color take the newer `edited`.
3. **Push.** Every local record of the person is hashed. Those whose hash
   differs from `sent` are put, those in `sent` but gone are deleted. A
   clip's audio goes first: `POST sounds` with its SHA-256 (hashed once,
   kept in `cloud.sounds`), then each piece the server says it needs. 200
   records a request. Each push says which rev the device pulled up to
   (`since`): a record another device wrote after that is left as it is and
   comes back in `stale`, and the sync pulls, merges and pushes again (at
   most 3 rounds; the next sync carries on). So two devices pushing the same
   record at once never overwrite each other's edit. The answer's `was` tells
   whether anyone else pushed since this device's `rev`; if not, `rev` moves
   to the new one.
4. `sent`, the bases and `rev` are saved after each step that succeeds, so a
   sync cut off halfway carries on where it stopped.

**Idempotent and convergent.** After a merge the base is the cloud's copy
and the device holds the merge, so the same pull again finds the cloud
unchanged and keeps it; once pushed, the merge is the base on this device
and the cloud's copy on the others, which take it as an edit made there.
The cloud orders the pushes, so devices that sync in any order end equal
(`tests/cloud-sync.test.mjs`, two and three devices through the real
Worker).

**Backups and older sounds found** still use the backup merge
(`web/merge.js`): there is no base there.

**Atomic.** A push is one D1 batch (one transaction): the profile's `rev` goes
up by one and every record in it gets the new `rev`, so a pull never sees half
a push.

**Deleting a sound** puts a tombstone; the server deletes its audio once no
live record in that profile names it.

**Removing a person from a device** (People → Delete) first drops its `cloud`
record, so the deletes stay on the device and the profile stays in the cloud.
**📴 Offline (this device only)** deletes the cloud copy: it asks twice, says
plainly what goes, and needs the PIN. A person taken out of the cloud
elsewhere (Offline there, or pruned) goes Offline here too, rather than
coming back by itself.

## 7. Chunking

`CHUNK_BYTES = 1,900,000`. A sound of `b` bytes has `ceil(b / CHUNK_BYTES)`
pieces, each a row in `sound_chunks`. The cloud's cap on one sound (25 MB)
means at most 14 pieces. `GET /api/sounds/:sid` streams the
pieces in order, one query each, so the Worker never holds a whole sound.
Pure helpers (`pieceCount`, `pieces`) are tested at 0, 1, exactly 1.9 MB,
1.9 MB + 1 and 25 MB.

## 8. Sharing: share codes

Ben (Q10): from a sound, beat or song, 🔗 Share gives a short code; anyone who
enters it on any device can see and play it, read-only, forever. Gifts and
Send to… are gone.

- **Where:** 🔗 Share… in the person's ☁️ sheet picks a sound, beat or song
  (Q18; a Share key on the sound sheet can follow its rework).
  The code shows big, with 📋 Copy the code.
- **What it holds:** a snapshot (`shareBundle`): the item, the recorded sounds
  it uses (by their cloud sound ids) and, for a song, its beats; kit sounds
  by kit id. And a **preview**: the sharer's device records it as it plays
  (`share-render.js`: a sound with its voices, a beat twice round, a song up
  to 3 minutes; mono, 22,050 Hz), so it plays anywhere without the app
  rebuilding it.
- **Until unshared** (Ben, Q18: "allow to be unshared. copies remain"): a
  share is never changed. Deleting its sound, or the whole profile, keeps the
  sounds a share uses (`share_sounds`; owner `''`). Shared already, in the
  share sheet, lists the person's codes (`GET /api/profiles/:id/shares`, with
  their key); 🚫 Unshare (two taps, `DELETE /api/profiles/:id/shares/:code`)
  deletes the share, its `share_sounds` rows, and any of its audio no record
  or other share uses. The code then answers 404 for everyone. A profile
  already deleted can't unshare; Ben can delete one by hand.
- **Receiving:** ⚙️ Settings → 🔗 Sharing → 🔗 Shared with me: type the code
  (case and dashes don't matter). It joins this device's list (localStorage
  `shared`) and stays until removed. Each shows ▶ Play (the preview),
  🎛️ Remix (into the person showing: fresh ids, the shared thing named
  "<title> remix", through `cleanBackup` and the merge; the original never
  changes, and the remix is theirs, with its own audio, so it outlives an
  unshare) and ✕ Remove (two taps: it leaves this list only, "it leaves
  their world"; the code brings it back). Opening the list checks each code;
  one unshared shows "🚫 No longer shared" with only ✕ Remove.
- **Guessing:** 40 bits against at most 100,000 requests a day is about
  30,000 years to find one code. No per-guess limit is needed.

## 9. 📴 Offline (this device only)

Ben (Q13): everyone syncs, except a person set Offline. In the person's ☁️
sheet, 📴 Offline (this device only) explains what happens, asks twice,
wants the PIN if there is one, deletes the cloud copy, and marks the person
`offline` on this device. ☁️ Put back in the cloud undoes it (the next sync
makes the profile again). Families are gone (Q11).

## 10. A forgotten PIN

Ben (Q12): a grown-up emails **pin.reset@noodlepads.com** with the profile's
fun name. Ben finds it (`just cloud-profiles`) and runs `just cloud-reset-pin
<profile id>`: it shows the profile, asks, clears the PIN and every key
through `just cloud-db`, and checks. Each device then opens it once with no
PIN. The PIN pad, Help, ⚙️ Settings → 🔓 What's private and README say how.

## 11. What's private (the disclosure)

The same words in ⚙️ Settings ("🔓 What's private (not much)"), Help, and
README ("Privacy"). `web/privacy.js` holds the text once; tests tie its key
claims to the code (`tests/privacy.test.mjs`): that everyone who made
something is in the public list unless Offline, that the list and sound links
need nothing, that a share code is forever, that a PIN is not security, that
nobody types a name, that reports are deleted from the cloud after 14 days,
and how to delete a profile.

## 12. Profile sprawl

Ben: "login sprawl is a concern."

- **Built:** nobody who has made nothing goes to the cloud; the Worker keeps
  each profile's last activity (`active`, at most one write an hour);
  `just cloud-profiles` lists id, fun name, made, last active, records, sound
  bytes, keys and shares; `just cloud-prune [--days N] [--empty]` lists idle
  profiles (default 180 days), empty ones (over a day old) and loose sounds
  (no record and no share uses them), and deletes them with `--yes`. Shared
  sounds stay. A device whose profile was pruned keeps everything and goes
  Offline (Q20).
- **Already there:** 50 new profiles a UTC day (one deleted the day it was made gives its place back, so the deploy checks' throwaway profiles never count: provisional, Q24), 1,000 in all, 300 listed. The deploy checks' profiles are `p-smoke-…` and `p-e2e-…`; `just cloud-prune --smoke` removes any a killed check left, with their share codes.
- **Proposed, not built:** (1) the list shows only profiles active in the
  last 180 days (one `WHERE`, about 5 minutes, but a returning kid would look
  missing until their device syncs); (2) a cap of new profiles per device a
  day would need an IP or device id, which the site does not keep;
  (3) `just cloud-prune` as a monthly reminder in Ben's recurrent routine
  (about 10 minutes). Recommend (3).

## 13. Failure modes

| What happens | What the app does |
|---|---|
| No `/api` (the dev server, `just look`, a static copy) | `GET /api/cloud` fails: cloud buttons say "The cloud isn't reachable from here"; nothing else changes (tested) |
| Offline | Everything works on the device; the sync runs on the next open or change |
| D1 over a daily limit (503 `over`) | "The cloud is resting until tomorrow…"; sync tries again on the next open after a 30-minute pause |
| Profile full (40 MB) or everyone full (400 MB) | 507: "This profile's cloud is full: delete some sounds." The sound stays on the device |
| Wrong PIN, waiting | the PIN pad says how many tries are left, or how many minutes to wait |
| Key no longer valid (PIN changed elsewhere) | 401 on sync: the person shows 🔒 "Open again"; their records stay on the device |
| Profile deleted elsewhere (Offline there, or pruned) | 404 on sync: the person stays on the device, goes 📴 Offline here, and says so |
| A sound over 25 MB | it stays on the device; the rest syncs, and the ☁️ sheet says how many stayed |
| A PIN not remembered, after a reload | the PIN is asked when the person is opened; their sync waits for it |
| A pull with a bad record | dropped and counted by `cleanBackup`, like a backup |
| A push cut off halfway | `sent` holds what got through; the next sync sends the rest |
| Two devices push the same record at once | the second push leaves it (`stale`), pulls the first, merges and pushes again |
| The same record changed on two devices | merged field by field (§ 6); the newer edit wins a setting both changed; where no merge is safe, both are kept |
| Deleted on one device, edited on another | the edit stays on both |
