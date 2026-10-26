# The cloud, the Worker, what leaves the device, offline and updates

**Answer first.**

- **One Worker, five doors.** `worker/index.js` sends `/api/log` to `reports.js`, `/api/events` and `/api/feedback` to the vendored `events-worker.js`, and every other `/api` path to `cloud.js`. Every path with no static file behind it goes to `env.ASSETS`. Static files never reach the Worker.
- **One D1 database (`DB`), two R2 buckets (`EVENTS`, `FEEDBACK`), one rate limit (`FEEDBACK_LIMITER`).** No secrets. D1 holds profiles, records, audio, shares, problem reports, daily counters and player metrics.
- **The device owns the working copy.** `web/cloud.js` binds the sync to storage; `web/cloud-sync.js` holds the sync itself, run on injected storage and API; `web/merge3.js` is the three-way merge of one record; `web/cloud-api.js` is the HTTP client. The Worker only checks, stores and hands back.
- **Four things leave the device besides cloud profiles:** problem reports (opt-in, `sendLogs`), usage events (on by default, `sendUsage`), device metrics (the `X-Noodle-App` header on cloud calls, also behind `sendUsage`), and feedback (typed by a grown-up). Each has its own sender, its own cap and its own home.
- **One problem-report allowlist, run twice.** `web/log-clean.js` `cleanPayload` cleans the report on the device, and `worker/clean.js` runs the same function again on arrival. The only hand-kept copy is `worker/clean.js` `KIT_IDS` (the kit's ids).
- **The service worker only routes.** Online, every answer comes from the network; the cache answers only when the network fails. `/api/` is never touched. `version.json` is network-only.
- **"Offline" means three different things** here: 📴 Offline (a person kept out of the cloud), no network (the sync waits, the PIN is checked on the device), and the service worker's copy (the app opens with no network). See "Concepts".

## Files and who calls whom

### The device side

| File | Owns | Called by | Calls |
|---|---|---|---|
| `cloud.js` | the links (`state.cloud`, IndexedDB `cloud`), session keys, PIN unlocks, per-person status, `syncAll`/`syncNow`, putting people up and taking them out, shares both ways | `app.js` (`initCloud`, `needsPin`, `leftPerson`, `onCloud`, `pinGuards`), `cloud-ui.js`, `people.js`, `backup-ui.js` (`pinGuards`), `who-now.js` (`linkOf`) | `cloud-api.js`, `cloud-sync.js`, `sync-timing.js`, `device-meta.js`, `backup.js cleanBackup`, `state.js`, `store.js db`, `audio.forget`, `log.js logEvent`, `telemetry.js track` |
| `cloud-sync.js` | the sync of one profile (`syncProfile`), the push plan, record hashes, share bundles and remix docs | `cloud.js` | `merge3.js resolve`, `playlist.js`, `names.js`, `groups.js` |
| `merge3.js` | the three-way merge, the `changed` stamp (`STAMP`, `stampEdit`, `STAMPED`, `KEEP_BOTH`) | `cloud-sync.js`, `state.js` (`stampEdit` in `persist`), `backup.js` and `merge.js` (stamps) | `playlist.js legacySlots`, `firsts.js unionSeen` |
| `cloud-api.js` | every cloud route as a function, `CloudError`, `cloudTrouble` (the kid's sentence) | `cloud.js` (one instance, `api`), `cloud-ui.js` (`api.fetchSound` for previews) | `fetch`, `reid.js isCloudId` |
| `sync-timing.js` | when a sync runs (pure: clock and timers injected) | `cloud.js` (`timing`) | `run` = `cloud.js syncAll` |
| `cloud-ui.js` | the PIN pad, avatar picker, profile sheet's ☁️ and 🔒 parts, 🔗 Share, 🔗 Shared with me, ☁️ Open from the cloud | `app.js` (`initCloudUI`, `askToOpen`, `shareSounds`), `people.js` (the profile sheet), `backup-ui.js` (`askEditPin`, `avatarBadge`), `welcome.js` (`openCloudList`), `bulk.js` (via `app.js` `share: shareSounds`) | `cloud.js`, `contact.js`, `merge.js mergeSummary`, `audio` |
| `share-render.js` | a share's preview as a WAV (`renderPreview`), and `renderAudio`/`renderTake` | `app.js` (hands `renderPreview` to `initCloud` as `renderShare`), `things.js`, `dj.js` | `audio.load`, `makeVoice`, `fadeStop`, `sequencer.js encodeWav`/`normalize`, `seq.beatPlan`/`prepareBeats`/`soundHit`, `song.js planSong`/`soundSong` |
| `device-meta.js` | the `X-Noodle-App` value (`appMeta`), `WIDTHS` | `cloud.js` (`deviceMeta`), `worker/metrics.js` (`WIDTHS`) | `usage.js usageOn` |
| `usage.js` | the usage switch in memory (`usageOn`, `setUsage`) | `app.js followUsage` (writes), `telemetry.js`, `play-count.js`, `device-meta.js` (read) | nothing |
| `log.js` | the in-memory event log (400 entries), `onLog`, `installErrorLog` | every module that logs; `track-page.js` and `log-send.js` listen | nothing |
| `log-clean.js` | the report allowlist (`RULES`, `SETTING_VALUES`, `cleanPayload`, `redact`, `soundKind`) | `log-send.js`, `worker/clean.js`, `sequencer.js` (`soundKind`) | `agent.js` |
| `log-send.js` | sending reports (`createLogSender`, `initLogSend`), the device code, `LIVE_HOST` | `app.js` (`initLogSend`), `feedback.js` and `settings-ui.js` (`LIVE_HOST`) | `log-clean.js`, `agent.js`, `state`, `board.js`, `settings.js` |
| `tap-watch.js` | the silent-tap report: a finger tap on a pad, key or tile that made no voice in 3 s is logged as `tap` (`watchTaps`, `silence`, `screenOf`) | `app.js` (`watchTaps`, with `finger.js lately` and `audio.js voicesMade`) | `finger.js` |
| `agent.js` | User-Agent → browser, OS, device-type families | `log-send.js`, `log-clean.js`, `worker/metrics.js` | nothing |
| `telemetry.js` | `EVENTS`, `cleanDetails`, the player id, `track` (page-wide) | `app.js startUsage` (`createTelemetry`, `useTelemetry`), `cloud.js`, `listen-ui.js`, `sheet.js` (direct `track`) | `events-client.js createEvents`, `usage.js` |
| `events-client.js` | (vendored from flarepress, never edited) the record's columns, the localStorage queue, batches, `sendBeacon` | `telemetry.js` only | `fetch`, `navigator.sendBeacon` |
| `track-page.js` | where events come from: lifecycle, screens, dialogs, one click listener, content and settings from the log, errors, speed | `app.js startUsage` (`trackPage`, `learnLabels`), `page.screen`, `page.level` | `telemetry` (passed in), `tooltips.js CONTROLS`/`tipFor`, `play-count.js takePlay`, `settings.js LEVELS` |
| `play-count.js` | per-visit play counts | `pads.js`, `dj.js`, `kids.js`, `song.js`, `sequencer.js` (`countPlay`); `track-page.js` (`takePlay`); `app.js` (`clearPlay`) | `usage.js` |
| `feedback.js` | the Feedback dialog and its sender | `app.js initFeedback` | `grown-up.js askSum`, `dialogs.js`, `log-send.js LIVE_HOST` |
| `privacy.js` | the "What's private" lines, `PRIVACY_URL` | no page module imports it; only `tests/privacy.test.mjs` reads it. The page's link is written out again in `index.html` (`.privacy-link`) | nothing |
| `contact.js` | the PIN-reset address, decoded at load | `cloud-ui.js` (`FORGOT_PIN`), `help.js` | nothing |
| `update.js` | the 🆕 update bar | `app.js` (`initUpdate`, with `busy`) | `fetch('version.json')`, `util.js versionLabel` |
| `offline.js` | registering `sw.js` after load | `app.js` (`registerOffline`) | `navigator.serviceWorker.register` |
| `sw.js` | the service worker (`SHELL`, `route`, `keyFor`, `fill`) | the browser | `fetch`, `caches` |

### The Worker side

| File | Owns | Imports |
|---|---|---|
| `index.js` | routing, `EVENTS_OPTS`, `FEEDBACK_OPTS` | `reports.js`, `cloud.js`, `events-worker.js`, `http.js` |
| `cloud.js` | every cloud route, `LIMITS`, `KINDS`, `CHUNK_BYTES`, `MAX_SOUND_BYTES`, keys, shares | `http.js`, `pin.js`, `metrics.js`, and from `web/`: `model.js` (`PERSON_ID`, `PERSON_COLORS`, `OLD_PERSON_COLORS`), `emoji-check.js`, `names.js isFunName`, `reid.js CLOUD_ID` |
| `http.js` | `ORIGIN`, `reply`/`json`/`fail`, `Refuse`, `readBytes`/`readCapped`/`readJson`, `randomId`, `sha256Hex`, `toBytes`, `withinDaily` (the `counters` table) | nothing |
| `pin.js` | PIN hash and wrong-try rule, share codes | `http.js hex` |
| `metrics.js` | `devices` and `activity` rows, sweeps, `forgetProfile` | `web/device-meta.js WIDTHS`, `web/agent.js parseAgent` |
| `reports.js` | `POST /api/log` | `clean.js`, `http.js` |
| `clean.js` | `cleanUpload` (runs `web/log-clean.js cleanPayload`), `KIT_IDS` | `web/log-clean.js`, `web/instruments.js kitIdsOf` |
| `events-worker.js` | (vendored) `handleEvents`, `handleFeedback` | nothing |

**The Worker pulls 19 `web/` modules in.** Through `model.js`, the Worker's import closure is `agent, contrast, cuts, device-meta, emoji-check, instruments, log-clean, log, loudness, model, names, playlist, reid, row-volume, steps, stretch, tweaks, usage, voices` (computed from the import lines). Any of them that touches `document`, `window` or an `AudioContext` at import time breaks the Worker. `tests/worker*.test.mjs` import the Worker under Node (no DOM), which catches a top-level DOM touch.

## Concepts

### The cloud link (one per person in the cloud on this device)

What: this device's tie to a profile. Lives in IndexedDB `cloud` (keyPath `id`, since DB version 10) and in memory as `state.cloud` (Map person id → link).

Shape (as written by `cloud.js saveLink`):

| Field | Meaning |
|---|---|
| `id` | the person id = the profile id (`p-…`) |
| `key` | the device key; stored only when the profile has no PIN, or this device remembers the PIN (`keepsKey`). Any other PIN profile's key lives in `cloud.js sessionKeys` for this page's life |
| `rev` | the profile `rev` this device has caught up to |
| `sent` | `{"<kind>:<id>": hash}`: each record as the cloud has it (`cloud-sync.js hashOf`) |
| `sounds` | `{<clip id>: {sha256, sound}}`: the audio's hash and its cloud sound id |
| `pin` | the profile has a PIN |
| `check` | `{salt, hash}`: PBKDF2 of the PIN, so the device can check it with no network |
| `newPin` | the profile got a PIN this device never had typed; until typed, the person can't open, and 🤷 I don't know the PIN deletes them here |
| `rememberUntil` | ms: 🔑 Remember on this device skips the PIN here until then (`REMEMBER_DAYS`, 30). Set by `cloud.js rememberHere`; cleared by `forgetHere`, a removed PIN or a PIN changed elsewhere; a PIN changed on this device keeps it |
| `noOffer` | they said Not now to the offer, so `offersRemember` stops offering it on this device |

Readers and writers:

- Written only through `cloud.js saveLink` (and `dropLink`, which deletes). `deps.saveLink` inside a sync re-reads the live link so a key, PIN or drop that happened mid-sync is kept.
- `state.js readStorage` loads it; `state.js reIdStoredPeople` deletes links whose id is not a `CLOUD_ID` (logs `cloud {unlinked}`).
- Read by `cloud.js` (`linkOf`, `inCloud`, `keyOf`, `pinIsNew`, `needsPin`, `pinGuards`), `people.js` (`linkOf`, `keyOf` when deleting), `who-now.js` (`linkOf(...).pin`).
- Backups never carry it (`backup-ui.js storedLists` has no `cloud`).
- `state.js` `state.cloud` comment still lists the old `remember` field (no day it ends, from before 2026-10-19) and not `rememberUntil` or `noOffer`.

### Keys: remembered and session

- A no-PIN profile gets a remembered key (`keys.session = 0`): `putInCloud` (create, or open after a 409) and `openProfile` with no PIN (`remember = !pin`).
- A PIN profile gets a session key (`session = 1`): `unlock` calls `api.open(id, pin, remembers(link))`, so `false` unless this device remembers them. The key goes in `sessionKeys`, never IndexedDB.
- 🔑 Remember on this device (Ben, 2026-10-26): after a PIN opens someone, `cloud-ui.js offerRemember` asks once (`cloud.js offersRemember`); their profile's PIN part offers it too. `rememberHere(personId, pin)` opens again with `remember: true`, keeps that lasting key in the link, drops the visit's key (`api.forget` on the old one) and sets `rememberUntil`. While it holds, `needsPin` and `pinGuards` are false. `rememberedUntil` forgets a remembering whose day has come; so does `initCloud` at start. `forgetHere` (Forget this device, or the day) deletes the key here and in the cloud.
- `unlock` deletes the device's previous key in the cloud (`api.forget`), so a device holds one key per profile.
- The Worker deletes session keys older than `SESSION_KEY_MS` (7 days) only when that profile is next opened (`openProfile`). That is why a remembered PIN asks for a lasting key.
- A new PIN, or a PIN reset by Ben, deletes every key of the profile (`changeProfile`). The next sync gets 401 → `cloud.js keyRefused` asks the public list: no PIN now → opens again by itself; a PIN → `newPin: true`, `rememberUntil` cleared, status `locked`. A PIN changed on this device keeps its `rememberUntil`.
- `initCloud` moves a stored key of a PIN profile with no `rememberUntil` (from the retired Remember, before 2026-10-19) into `sessionKeys` for this visit.

### PINs (and the three PIN sets in `cloud.js`)

| Set | Meaning | Cleared by |
|---|---|---|
| `sessionKeys` | person → key for this page | `dropLink`, `keyRefused`, `unlock` (replaced) |
| `unlocked` | PIN typed since this person was last opened; `needsPin` reads it | `leftPerson` (switching away), `dropLink`, `keyRefused` |
| `pinTyped` | PIN typed on this visit; `pinGuards` reads it (name, picture, color, counts, sounds on others' screens, backups) | `keyRefused`, page reload |

The PIN flow on opening a person: `app.js setPerson` → `needsPin` → `cloud-ui.js askToOpen` (one ask per person at a time) → `withPin` → `cloud.js unlock` → `api.open`. Offline (`CloudError` status 0) the device checks `link.check` itself; a PIN new to the device (`newPin`) has no `check`, so only the cloud can check it. `app.js` `onCloud` re-asks when a sync finds a new PIN for the person showing.

The PIN hash is done twice, the same way: `web/cloud.js pinHash` (`PIN_ROUNDS` 20,000) for the device's offline check, and `worker/pin.js hashSecret` (`ROUNDS` 20,000) for the real one. Wrong tries: `worker/pin.js checkSecret`, 5 in a row then `WAIT_MS` (10 minutes), kept in `profiles.fails`/`locked_until`. Wrong PINs answer 401 `{error:'pin', tries}`; a wait answers 429 `{error:'wait', wait}`.

### Who goes to the cloud

`cloud.js wantsCloud(p)`: `p.added && !p.hidden && !isOffline(p.id) && !inCloud(p.id) && hasMade(...)`. `cloud-sync.js hasMade` counts only `MADE` kinds: `clips, overrides, beats, takes, songbook, layouts, voices, touchLayouts`. An open beat (`patterns`), DJ keys, an open song or settings alone do not count. ☁️ In the cloud switched on (`putUpNow`) or setting a PIN puts a person up at once, made or not.

Before the first upload, `cloud.js funNamed` gives a typed name a fun name (`names.js funName`), so a typed person name never leaves. The Worker refuses any name `isFunName` rejects and any avatar not in `emoji-check.js`.

### Per-person cloud status

`cloud.js status` (Map person → `{state, text, at}`), `state` one of `syncing`, `ok`, `trouble`, `locked`, `waiting`. Written by `syncNow`, `keyRefused`, `putInCloud`, `syncEveryone`. Read by `statusOf`, `cloud-ui.js cloudText`/`cloudLabel`/`drawPin`, and through `onCloud(fn)` watchers (`app.js`, `people.js`). `trouble` and `locked` show ⚠️.

### The record kinds (one list, kept four times)

The 13 per-person stores that sync: `clips, overrides, orders, patterns, beats, decks, takes, songs, songbook, prefs, layouts, voices, touchLayouts`.

| Copy | Used for | Guard |
|---|---|---|
| `web/cloud-sync.js CLOUD_KINDS` | what a sync reads and pulls; `cloud.js db.onChange` filter | — |
| `worker/cloud.js KINDS` | what a push may carry | `tests/cloud-sync.test.mjs` ("the app and the Worker agree on every kind") |
| `web/merge3.js STAMPED` | which stores get the `changed` stamp | none (checked here: equal today) |
| `worker/schema.sql` `records.kind` comment | documentation | none |

`cloud-sync.js ONE_EACH` (`orders, patterns, decks, songs, prefs`) are keyed by person id. `merge3.js KEEP_BOTH` (`clips, beats, takes, songbook, layouts, touchLayouts`) may keep two copies on a clash.

### Bases and `sent` hashes

- `sent` (in the link): the hash of each record as the cloud holds it. `cloud-sync.js hashOf(record, sha)` = cyrb53 of `canonical(record)` plus the clip's audio SHA-256. `canonical` drops `blob`, `sound`, `sha256`, `bytes` and `changed`.
- `bases` (IndexedDB, since DB version 14, keyPath `id` = `"<person>|<kind>:<id>"`, value `{id, personId, body}`): each record as last synced, without audio. `cloud.js bases.load/save`; `dropBases` on `dropLink`. `state.js readStorage` skips it.
- A base is trusted only when `hashOf(base) === sent[k]` (`cloud-sync.js decideRecord`): a sync cut off between the two saves is not trusted.

### The `changed` stamp

`merge3.js STAMP` = `'changed'`. `state.js persist` calls `stampEdit(store, value)` on every write of a `STAMPED` store. `merge3.js stampOf` reads it (else `saved`, else `edited`) for "the newer edit wins"; a tie goes to the cloud. `cleanStamp` drops a stamp more than a day ahead. `backup.js cleanBackup` keeps it. Writes a sync makes (`deps.put`, `storeLoaded`) bypass `persist`, so they carry the stamp they arrived with.

### Sounds in pieces

`CHUNK_BYTES` = 1,900,000 on both sides (`web/cloud-sync.js`, `worker/cloud.js`). A sound is `ceil(bytes / CHUNK_BYTES)` rows in `sound_chunks`; at most `MAX_SOUND_BYTES` = 25 MB (14 pieces). Sound ids are `s-` + 26 base32 characters (128 random bits). Audio is deduplicated per profile by `(sha256, bytes)`. `GET /api/sounds/:id` needs no key and streams one piece per D1 query, `Cache-Control: public, max-age=31536000, immutable`.

### Shares

- **Making:** `cloud-ui.js` (🔗 Share… or `shareSounds` from ✏️ Edit sounds) → `cloud.js shareItem`: syncs first, `cloud-sync.js shareBundle` builds `{kind, title, bundle: {clips, beats, songs}}` (kit sounds as `kit:<id>`; `personId`, `group`, `pinned` and `blob` stripped), each clip gets its cloud `sound` from `link.sounds`, `renderShare` (= `share-render.js renderPreview`) records a preview WAV, `uploadAudio` puts it up, then `api.share`.
- **Shape in D1:** `shares` row (code, profile_id, kind, title ≤ 24 chars, bundle JSON ≤ 1 MB, preview sound id, hash, created) plus `share_sounds` rows that keep the audio alive after its clip or profile goes.
- **Receiving:** `openShare` (localStorage `shared`, at most `MAX_SHARED` 100, `{code, kind, title, at, gone?}`), `checkShared` marks unshared ones `gone`, `fetchShare`, ▶ Play (`cloud-ui.js playPreview`: decodes the preview into `audio.master`), 🎛️ Remix (`remixShare`: `shareDoc` with fresh ids → `cleanBackup` → `storeLoaded`).
- **Unsharing:** `DELETE /api/profiles/:id/shares/:code` deletes the share, its `share_sounds`, and audio nothing else uses.

### Three meanings of "offline"

| Word | Where | What it does |
|---|---|---|
| 📴 Offline (this device only) | `peopleEdits` record `offline: true`; `cloud.js isOffline`, `setOffline` | the person never goes up; switching it on deletes the cloud copy |
| no network | `CloudError` status 0 (`cloud-api.js`) | syncs wait; `unlock` checks the PIN on the device; `cloudThere` re-asks after 60 s |
| the offline copy | `sw.js`, `offline.js` | the app opens with no network after one visit |

A 404 `profile` on sync (deleted or pruned elsewhere) drops the link and sets the person 📴 Offline here (`cloud.js syncNow`).

### The two switches (device settings)

| Setting | Default | Gates | Read where |
|---|---|---|---|
| `sendUsage` (scope device) | `true` | usage events, play counts, the `X-Noodle-App` header and so D1 player metrics | `app.js followUsage` → `usage.js setUsage`; off also calls `telemetry.clear()` and `clearPlay()` |
| `sendLogs` (scope device) | `false` | problem reports | `log-send.js` (`getSetting` and `onSetting`); off forgets the device code |

### The live host

Three things send only from noodlepads.com, each checked on its own: `log-send.js LIVE_HOST` (reports), `feedback.js` (imports `LIVE_HOST`), and the Worker's `ORIGIN` check (`http.js`, and `worker/clean.js` `KNOWN.origin` as a literal). Usage events have no host check on the device; the Worker refuses another Origin.

### The version

`app.js loadVersion` reads `version.json` (`util.js versionLabel`) into `state.version` (`"v1.0.277-b328291"` on the live site, `'dev'` elsewhere). It flows to: `telemetry.setVersion` (starts the events client), `cloud.js deviceMeta` (`X-Noodle-App v=`), `log-send.js` payload `app`, `feedback.js` `X-App-Version`, and `update.js` (`loaded`).

## A sync, end to end

### When (`sync-timing.js`, bound in `cloud.js initCloud`)

| Trigger | Wiring | Timing |
|---|---|---|
| start | `initCloud` → `syncAll()` | once |
| a change | `store.js db.onChange(store)` (after every successful put, delete or batch) → `cloud.js` filter (a `CLOUD_KINDS` store or `people`; not while `applying`) → `scheduleSync` → `timing.changed()` | `SYNC_DELAY_MS` 20 s after the last change |
| focus, blur, visibility, pagehide | `timing.transition()` | gathered for `TRANSITION_MS` 1.5 s; skipped if a sync ran within `MIN_GAP_MS` 10 s and nothing changed; hiding with a change waiting syncs at once |
| active | `timing.arm()` | every `ACTIVE_MS` 5 min, only while shown and focused (`pageActive`) |
| by hand | `syncNow` from `unlock`, `openProfile`, `putUpNow`, 🔄 Sync now, `shareItem` | at once, one person |

`syncAll` runs one at a time; a call while one runs queues one more run, shared by every caller. `syncEveryone` calls `timing.ran()`, checks `cloudThere()` (`GET /api/cloud`), puts up everyone `wantsCloud`, then `syncNow` for each link in turn. `syncNow` runs one sync per person at a time (`running`), and needs a key (else status `waiting`).

### Pull (`cloud-sync.js pullOnce`)

1. `api.pull(id, key, since)` page by page (`more`), from `link.rev`.
2. The last word on each `kind:id` wins (`latest`).
3. Shortcuts: deleted here and unchanged there (`sent` equals the remote hash) → `skip`; same on both sides → `same`. Neither needs audio.
4. For other clips, audio comes from this device's blob when the SHA matches, else `api.fetchSound`.
5. Clean: `pulledDoc` makes a backup-shaped doc (each record given `personId`; `overrides` kept only under `<person>-`), and `deps.clean` = `backup.js cleanBackup(doc, audioOf, whatIsHere())`. A record the checks drop is left alone.

### Merge (`decideRecord` → `merge3.js resolve`/`merge3`)

| Action | Meaning | Stored by |
|---|---|---|
| `same` | both sides agree | nothing |
| `take` | the cloud's | `deps.put` → `db.put` straight to IndexedDB |
| `keep` | this device's; the push sends it (or its delete) | nothing |
| `delete` | gone in the cloud, unchanged here | `deps.remove` → `db.remove` |
| `merged` | field by field (`KIND_RULES`), cleaned again, then stored and pushed | `deps.put` |
| `keepBoth` | no safe merge in a `KEEP_BOTH` kind | `deps.merge` = `backup-ui.js storeLoaded` (merge.js: the cloud's under a new id) |
| `fresh` | new here, no base, no `sent` | `deps.merge` (merge.js spots one already here under another id) |

`KIND_RULES` (merge3.js): beats and patterns `rows` (row by row, else by sound; pills by `pillByPill`; tune notes by `mergeTune`), songs and songbook `slots`, `lanes` (blocks keyed by bar), `tempos`; orders `ids`, `groups`; decks `keys`, `mine`; layouts `keys`; prefs `values` (`seen` by `unionSeen`); voices `used` (max), `knobs`. Any other field is a setting (the newer edit wins) or a list with no safe merge.

After the stores: `deps.merge` always runs (even with nothing in it), and `storeLoaded` ends with `readStorage()`. Only then `pullOnce` reads `after` from `state`, sets `sent` and the base for each record, sets `link.rev`, and saves bases and link.

### Push (`cloud-sync.js pushAll`)

1. Clips over `CLOUD_MAX_SOUND` (25 MB) with no cloud sound stay home (`report.tooBig`).
2. Audio first: `uploadAudio` → `api.startSound({sha256, bytes, mime})` → `{id, need}` → `api.putPiece` for each needed piece (`pieces`). `link.sounds[clip] = {sha256, sound}`.
3. `planPush(local, sent)`: put what hashes differently, delete what is in `sent` but gone. A clip still on the device is never a delete.
4. Slices of `PER_PUSH` (200): `api.push(id, key, put, del, link.rev)`. A clip body is the record minus `blob`, plus `sound`, `sha256`, `bytes`.
5. The Worker writes only records with `rev <= since`; the rest come back in `stale`. Landed records update `sent` and the base. `link.rev` moves to the new rev only when `res.was === link.rev` (nobody else pushed in between). Bases and link are saved after each slice.

`syncProfile` repeats pull + push while `stale` is non-zero, at most `SYNC_ROUNDS` (3). A 409 `sound` (the cloud lost audio this device thought it had) drops that sound from `link.sounds` and pushes once more. Then `pushLook` sends name, avatar and color by `api.change` when this device's `edited` is newer.

### After (`cloud.js syncNow`)

`readStorage()`, `followPerson()` (settings listeners hear a pulled `prefs`), `logEvent('cloud', {sync: true, …report})`, status `ok`. Errors: 404 `profile` → drop link, set 📴 Offline; 401 → `keyRefused`; anything else → status `trouble` with `cloudTrouble(err)`.

## Cloud record shapes

| Crosses | Shape |
|---|---|
| `GET /api/cloud` → | `{ok: true, chunk, maxSound}` (the app reads only `ok`) |
| `GET /api/profiles` → | `{profiles: [{id, name, avatar, color, edited, pin}]}` (newest 300, `CLOUD_ID` ids only) |
| `POST /api/profiles` | `{id, name, avatar, color, edited?, pin?}` → 201 `{key, rev: 0}` |
| `POST …/open` | `{pin?, remember?}` → `{key, rev, id, name, avatar, color, edited, pin}` |
| pull → | `{records: [{kind, id, body} \| {kind, id, deleted: true}], rev, profile: {…looks, created}, more}` |
| push | `{put: [{kind, id, body}], del: [{kind, id}], since?}` → `{rev, was, stale?: [{kind, id}]}` |
| `POST …/sounds` | `{sha256, bytes, mime}` → `{id, need: [n]}` |
| `PUT /api/sounds/:id/:n` | raw bytes, exactly `pieceSize(bytes, n)` → `{need}` |
| `POST …/shares` | `{kind, title, bundle: {clips, beats, songs}, preview}` → `{code}` |
| `GET /api/shares/:code` → | `{code, kind, title, bundle, preview, created}` (any `personId` stripped) |
| any error → | `{error, …}` with `wait`, `tries`, `over`, `sound` or `id` (`http.js fail`); `cloud-api.js` turns it into `CloudError` |
| `syncProfile` → | `{pulled, pushed, deleted, sounds, merged, clashes, kept, tooBig?}` |

## D1 tables (`worker/schema.sql`)

| Table | Key | Written by | Read by | Kept |
|---|---|---|---|---|
| `profiles` | `id` | `makeProfile`, `changeProfile`, `checkSecret`, `touch`, push (rev) | list, open, pull, every keyed route | until deleted or pruned |
| `keys` | `hash` (SHA-256 of the key) | `newKey`, `openProfile` (old sessions), `forgetKey`, `changeProfile` (new PIN), `deleteProfile` | `keyProfile` | session keys a week |
| `records` | `(profile_id, kind, id)` | push (tombstones `deleted = 1`) | pull, push (orphan sounds), unshare | tombstones forever |
| `sounds` | `id` | `startSound`, `putPiece` (`got`), push and unshare (orphans), `dropSounds` (profile_id `''`) | `getSound`, `ownSound`, push | until no record or share uses it |
| `sound_chunks` | `(sound_id, n)` | `putPiece` | `getSound`, `need` | with its sound |
| `shares`, `share_sounds` | `code`; `(code, sound_id)` | `makeShare`, `unshare` | `getShare`, `myShares` | until unshared |
| `reports` | `key` = `<ISO>_<device>_<random>` | `reports.js handleLog` | the telemetry runner | `TTL_MS` 14 days, deleted when the next report arrives |
| `counters` | `(name, day)` | `http.js withinDaily`; `deleteProfile` gives one back the same day | the same | old days stay |
| `devices` | `hash` (key hash) | `metrics.js noteEvent` | the runner | 90 days since last seen |
| `activity` | autoincrement `id` | `metrics.js noteEvent` | the runner | 14 days |
| `migrations` | `name` | each migration; schema.sql lists 001–005 as applied | `just cloud-migrate` | — |

Migrations: 001 drops gifts and families, adds `active`, `keys.session`, shares; 002 adds `devices`, `activity`, `uses`; 003 adds `visits`, drops `ip_hash`; 004 keeps country only; 005 drops `uses` and `visits`. `tests/migrations.test.mjs` checks the migrations reach `schema.sql`.

## Every /api/ route and its limits

All JSON bodies go through `http.js readJson`: `Origin` must be `https://noodlepads.com`, `Content-Type` `application/json`, at most 64 KB unless noted, an object. Keys are `Authorization: Bearer <32 base32>`. Path ids must match `model.js PERSON_ID`; new profiles must match `reid.js CLOUD_ID`.

| Route | Needs | Limits and checks |
|---|---|---|
| `GET /api/cloud` | — | — |
| `GET /api/profiles` | — | 300 newest, `CLOUD_ID` only |
| `POST /api/profiles` | Origin | fun name, listed emoji, person color; 409 if it exists; 507 at 1,000 profiles; 429 at 50 new a UTC day |
| `POST /api/profiles/:id/open` | Origin; PIN if set | 5 wrong → 10-minute wait (401 `tries`, 429 `wait`) |
| `DELETE /api/profiles/:id/key` | Origin, key | deletes the key sent |
| `PATCH /api/profiles/:id` | Origin, key; current PIN for `newPin` | look kept only if `edited` ≥ stored; a new PIN deletes every key and returns a new one |
| `DELETE /api/profiles/:id` | Origin, key, PIN | deletes records, keys, unshared sounds, metrics; gives back the day's profile count if made today |
| `GET /api/profiles/:id/records?since=N` | key | 500 a page, never split inside one push |
| `POST /api/profiles/:id/records` | Origin, key | body ≤ 4 MB; ≤ 200 records; each ≤ 512 KB; a clip must name whole audio of this profile (409 `sound`); 5,000 pushes a UTC day |
| `POST /api/profiles/:id/sounds` | Origin, key | ≤ 25 MB; `audio/*` mime; 507 over 40 MB a profile or 400 MB in all |
| `PUT /api/sounds/:sid/:n` | Origin, owner's key | `n` 0–99 by the path, < `chunks`; exact piece size |
| `GET`/`HEAD /api/sounds/:sid` | — | 404 until every piece is in |
| `POST /api/profiles/:id/shares` | Origin, key | body ≤ 1 MB + 4 KB; ≤ 100 clips, 100 beats, 20 songs; title ≤ 24; 200 shares a profile; 500 a UTC day; same snapshot → same code |
| `GET /api/profiles/:id/shares` | key | — |
| `DELETE /api/profiles/:id/shares/:code` | Origin, key | only the sharer |
| `GET /api/shares/:code` | — | case and dashes ignored |
| `POST /api/profiles/:id/uses` | Origin, key | retired: ≤ 32 KB, stores nothing, answers ok; to remove about 2026-11-16 |
| `POST /api/log` | Origin | JSON, 64 KB, `cleanUpload`; 10 a minute a device code; 1,000 a UTC day; 204 |
| `POST /api/events` | Origin | `text/plain`, ≤ 64 KB, UUID batch id (`X-Batch` or `?batch=`); stored in R2 `EVENTS` as `v1/<day>/<batch>.jsonl`; 204 |
| `POST /api/feedback` | Origin | `text/plain`, 1–4096 bytes, `X-Feedback` UUID, `X-App-Version` `[0-9A-Za-z.+_]{1,32}`; rate limit 10 a minute for the whole app; R2 `FEEDBACK` as `v1/noodlepads/<day>/<version>-<id>.txt`; 204 |

Any D1 error inside a cloud route answers 503 `{error: 'cloud', over}` (`over` when the message looks like a daily limit). `cloudTrouble` says "The cloud is resting until tomorrow."

## Share codes

`worker/pin.js shareCode` = 8 characters from `CODE_CHARS` (no 0/O, 1/I), about 40 bits; `isShareCode` checks `[A-HJ-NP-Z2-9]{8}`; `plainCode` uppercases and drops anything not A–Z or 0–9. Shown as `ABCD-2345` (`cloud.js showCode`). The device's own check (`cloud.js openShare`, `sharedHere`) accepts `[A-Z2-9]{8}`, a little wider (an I or O passes the device and gets 404 from the Worker).

## The problem-report path

1. **Written:** any module calls `log.js logEvent(kind, data)` (strings cut to 300, depth 3, 30 keys, 50 items). `installErrorLog` adds `error` entries for uncaught errors and rejections. 400 entries kept, in memory only.
2. **Triggered:** `log-send.js initLogSend` listens with `onLog`. An `error` or `tap` entry (`SEND_SOON`) arms a send after `ERROR_DELAY_MS` (10 s), later if the last try was under `MIN_GAP_MS` (60 s) ago. `visibilitychange` to hidden sends at once (if the minute allows).
3. **Gated:** `sendLogs` on, and `location.hostname === LIVE_HOST`. Switching on sends only what happens from then (`start`).
4. **Built:** `buildPayload` → `log-clean.js cleanPayload` with `{names: namesOnDevice(), kitIds, origin}`. `namesOnDevice` lists every person, sound, beat, song, take, layout and voice name (and person ids). Over `MAX_BODY_BYTES` (60,000), the oldest quarter is cut until it fits, and counted in `dropped`.
5. **Sent:** one `fetch('/api/log', {keepalive, credentials: 'omit'})`. Entries up to the newest sent (`sentUpTo`) are never sent again; a failed send keeps them.
6. **Received:** `worker/reports.js handleLog` checks method, Origin, JSON type, 64 KB, runs `worker/clean.js cleanUpload` (= `cleanPayload` again with `KIT_IDS` and the site origin; no names list on the Worker), counts the rate limits, deletes expired reports, inserts.

**The allowlist (`log-clean.js RULES`).** Each kind lists its fields; an unknown kind is dropped and counted, an unknown field dropped. Numbers round to 3 places; booleans pass; strings pass only from fixed lists (`oneOf`), else `«text»`. Free text (`text` rule: `error.message`, `error.storage`, `notice.text`, `backup.error`, `cloud.error`) has every known name and every quoted phrase blanked, then is cut to 200 characters. `error.source` becomes a site file name or `external`. Sounds become a kit id or `bundled`/`made`/`recorded` (`soundKind`). `settings` keep only `SETTING_VALUES` keys with listed values. The device is `agent.js` families; an old app's raw `ua` is read into families and dropped.

**Both ends, one rule set.** The Worker runs the same `cleanPayload`, so it stores exactly what the app would send. On the Worker the names list is empty: a name that slips past the device stays (only quoted phrases are blanked there). The kit ids on the device come from `state.manifest.kit`; on the Worker from the hand-kept `worker/clean.js KIT_IDS` plus `kitIdsOf`.

## The usage-events path

1. **Sources.** `track-page.js trackPage` wires: `app.open` (once, `environment`), `app.foreground`/`app.background` (visibility), `perf.longtask`, `perf.latency` and `noodlepads.play` (on hide), `perf.load`, `dialog.open`/`dialog.close` (`dialogs.js onDialogOpen`), `control.use` (one capture-phase click listener on `document.body`, controls by `tooltips.js CONTROLS`, play surfaces `PLAY` left out, code-made clicks ignored), and from the log: `content.*` (`contentOf`), `setting.change`, `error` (`errorOf`: kind and the file and line only), `noodlepads.keep`/`groove`/`cloud` (`appEventOf`). `page.screen(name)` gives `screen.view`; `page.level(value)` gives `noodlepads.level` once. Direct `track` calls: `cloud.js` (`noodlepads.cloud {action: 'pin-wrong'}`), `listen-ui.js` (`listen_start`, `listen_end`), `sheet.js` (`content.finish` sound-record).
2. **Checked:** `telemetry.js track` drops events not in `EVENTS`; `cleanDetails` keeps listed keys, numbers (3 places), booleans, null, strings ≤ `MAX_TEXT` 60. Before `version.json` answers, up to `MAX_WAITING` 200 events wait in memory.
3. **Queued and sent:** `events-client.js` adds `app, platform, form, version, player, session, seq, at, tz, event, screen`, queues JSON lines in localStorage `events:noodlepads:<session>`, freezes them into ≤ 64 KB batches with a UUID, sends by `fetch` every 60 s while shown, and by `sendBeacon` (`?batch=`) on hide and pagehide. A batch leaves the queue only on a 2xx (a beacon's never does until the next fetch). The next page load adopts a closed page's queue after three quiet intervals.
4. **Stored:** `events-worker.js handleEvents` writes the body as sent to R2 `EVENTS`; never parsed, no IP. The telemetry runner reads and deletes.
5. **Switch off:** `track` does nothing, `telemetry.clear()` drops the queue and storage, `clearPlay()` drops the counts.

The player id is localStorage `telemetry-player` (a random UUID, `newPlayer`), never a profile id.

## Player metrics (D1)

`worker/cloud.js handleCloud` fills `seen` for make, open, pull, push, share and PIN change; a wrong PIN on open becomes `pin-wrong`. After the answer (`ctx.waitUntil`), `metrics.js noteEvent`:

- Nothing is noted when the request has no `X-Noodle-App` (the device's `sendUsage` is off: `device-meta.js appMeta` returns null and `cloud-api.js` leaves the header out). Old rows are still swept.
- A `devices` row per key hash: first/last seen, pull count (`syncs`), app version, browser, OS, type (`agent.js parseAgent`), width bucket (`WIDTHS`). A new PIN renames the row to the new key (`seen.was`).
- An `activity` row: time, profile, device, kind, country (`request.cf.country`, two letters).
- Sweeps (`activity` > 14 days, `devices` > 90 days) run on every kind but `pull`.
- `forgetProfile` deletes both when a profile is deleted.
- Every write is caught; a missing table is skipped quietly.

## Feedback

⚙️ Settings → About → Feedback → `grown-up.js askSum` → `#feedback-dialog` → `feedback.js createFeedbackSender`: live host only, ≤ 4096 UTF-8 bytes, one `X-Feedback` UUID per text (a retry of the same text reuses it), `X-App-Version` = `appVersion(state.version)`, `credentials: 'omit'`. 204 means sent. The text never enters the log, reports or usage events.

## The service worker (`sw.js`)

| Request | `route` | What happens |
|---|---|---|
| not GET, another origin, outside scope, `/api` or `/api/…`, `sw.js` | `pass` | the browser handles it; never kept |
| `version.json` | `version` | network only; offline, the kept copy under `__precached-version.json`, marked `X-Noodle-Offline: 1` |
| anything else | `network` | network first; a 200 `basic` answer for a `SHELL` file refreshes the kept copy (`keyFor`: the page is one key whatever its query; others drop the query); offline, the kept copy (a redirected one is copied plain) |

- **Install:** `fill(true)` fetches `version.json`, `cache.addAll(SHELL)` (all or nothing, `cache: 'no-cache'`), stores the version mark, then `skipWaiting`.
- **Activate:** deletes other `noodlepads*` caches, `clients.claim`.
- **Refill:** a navigation that gets a good answer calls `refresh()` → `fill(false)`, which refills only when `version.json` differs from the mark. One refill at a time.
- **`SHELL`:** the page, `styles.css`, `boards.json`, the manifest, fonts, app icons, `MODULES` (every `web/*.js` the page can load), `BG` tiles, `KIT` and `INSTRUMENT_FILES` WAVs. `tests/offline.test.mjs` fails when a file in `web/` is missing (or one listed is not there), unless named in its `NOT_LOADED`.
- **Registered** by `offline.js registerOffline` after `load`.

## The update bar (`update.js`)

`initUpdate` asks `version.json` (`cache: 'no-store'`) when a check is owed: every `CHECK_MS` (10 min) while visible, on focus, on becoming visible; never within `MIN_GAP_MS` (60 s) of the last ask, never while `busy()`, never from a `dev` copy. A `TICK_MS` (2 s) timer retries owed checks and redraws. `updateOffer` → `show` when the live version differs from `state.version`, is not the one ✕ dismissed, and nothing is busy. An answer marked `X-Noodle-Offline` is no news. ✕ lasts until the next successful check. `busy` (from `app.js`): recording, any `dialog[open]`, the beat, song or keys playing, 🧸 Kids busy, or a looping pad. ⟳ reloads only if the bar still shows. `nudge.js` uses the same bar's place.

## Headers and the CSP (`web/_headers`)

Applied to every static file (the Worker's own answers set `Cache-Control: no-store` and `nosniff` in `http.js`; audio sets `immutable`):

- `Cache-Control: no-cache`: every load checks with the server.
- `Permissions-Policy`: microphone and display-capture for this site; accelerometer, camera, geolocation, gyroscope, magnetometer, payment, usb off.
- `Cross-Origin-Opener-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`.
- CSP: `default-src 'self'`; `script-src 'self' https://static.cloudflareinsights.com`; `style-src 'self'`; `font-src 'self'`; `img-src 'self' data: blob:`; `connect-src 'self' https://cloudflareinsights.com`; `object-src 'none'`; `base-uri 'none'`; `form-action 'none'`; `frame-ancestors 'none'`. No `worker-src`, so workers and worklets fall back to `script-src 'self'`.
- `tools/serve.py` sends the same headers (except `Cache-Control`). `tests/headers.test.mjs` guards them. The live site serves this exact CSP today (checked 2026-10-26).
- The Cloudflare Web Analytics beacon is added at the edge, outside the repo; it is why the two Cloudflare origins are in the CSP.

## Privacy text vs code (`web/privacy.js PRIVACY`)

| Line says | Code does | Verdict |
|---|---|---|
| everyone goes up once they make something, unless ☁️ is off | `wantsCloud`: added, not hidden, not Offline, `hasMade` (`MADE` kinds only) | true |
| Cloudflare stores fun name, avatar, color, sounds, beats, songs, settings, the names given | records also hold takes, kit edits, pad order and groups, DJ keys, layouts, own voices; and `activity`/`devices` rows per profile (country, browser, OS, device type, width, app version) while `sendUsage` is on | incomplete; the metrics are left to the shared policy on purpose (`tests/privacy.test.mjs`: no usage words in the lines) |
| the list shows fun names and avatars only; everyone in the cloud is in it | the list also carries id, color, `edited` and whether a PIN is set; only the newest 300, `CLOUD_ID` ids only | slightly understated; "everyone" stops at 300 |
| a sound's link plays for anyone | `getSound` needs no key | true |
| a share code works after its profile is deleted, until 🚫 Unshare | `deleteProfile` keeps shares and their audio (`dropSounds`) | true |
| a PIN is not security | 4 digits, PBKDF2, waits; audio needs no PIN | true |
| nobody types a profile name | `funNamed` before upload; Worker `isFunName` | true |
| ☁️ off stays on this device | `isOffline` keeps them out; usage events are still sent from the device (not per person) | true for their things |
| problem reports: cleaned log, settings, counts, browser/system/type, screen size, time zone, sound timing, a random code; deleted after 14 days | the payload also holds the app version, a per-page session id, the send time and the device pixel ratio. Expired reports are deleted only when the next report arrives | deletion is lazy: with no new report, an expired one stays in D1 |
| feedback: only what was typed and the app's version; no name or IP | as typed; `X-App-Version` is `'dev'` on the live site (see gotchas); 90 days is the runner's job (unverified here) | true; the version part does not work |
| deleting a profile: gone from the cloud at once, except what it shared | `deleteProfile` deletes records, keys, profile, unshared audio, and `forgetProfile` its metrics | true |

## Seams (one job done twice, or in an odd home)

| Seam | Where | What a fix in one place misses |
|---|---|---|
| PIN hash | `web/cloud.js pinHash`/`PIN_ROUNDS` and `worker/pin.js hashSecret`/`ROUNDS` | a change of rounds or algorithm on one side breaks offline checks (the device's `check` is its own, so only consistency within each side matters today) |
| share code rules | `web/cloud.js plainCode` + `/^[A-Z2-9]{8}$/`, `worker/pin.js plainCode` + `isShareCode` | the device's check is wider (lets I and O through) |
| code alphabet | `log-send.js CODE_CHARS` and `worker/pin.js CODE_CHARS` | the same 32 characters, kept by hand |
| record kinds | `CLOUD_KINDS`, worker `KINDS`, `STAMPED`, schema comment | a new per-person store added to `CLOUD_KINDS` and `KINDS` but not `STAMPED` would never get its `changed` stamp, so its clashes always go to the cloud (no test) |
| record content and hash | `cloud-sync.js canonical` + `NOT_CONTENT`, `merge3.js canon` + `NOT_CONTENT` | a new non-content field added to one makes "changed" and "same" disagree |
| the stores as lists | `cloud.js storedLists`, `backup-ui.js storedLists`, `state.js storedLists` | the cloud's maps `prefs` through `cleanPrefs`; a new store must be added to all three |
| pieces and caps | `CHUNK_BYTES` (web and worker), `CLOUD_MAX_SOUND`/`MAX_SOUND_BYTES` (tested equal), `PER_PUSH`/`LIMITS.perPush` (no test) | the Worker's `GET /api/cloud` already returns `chunk` and `maxSound`; the app ignores them |
| browser and OS families | `agent.js parseAgent` (reports, metrics), `track-page.js browserOf` and `environment` `os` (usage events) | different order of checks and different case (`'Chrome'` vs `'chrome'`; `OPT/` only in `browserOf`) |
| the site's origin | `worker/http.js ORIGIN`, `worker/clean.js KNOWN.origin` (literal), `log-send.js LIVE_HOST`, `index.js EVENTS_OPTS`/`FEEDBACK_OPTS` (from `ORIGIN`) | a domain change must touch all of them |
| kit ids | `boards.json`, `worker/clean.js KIT_IDS` (test-guarded), `sw.js KIT` (test-guarded by the file list) | three lists of one kit |
| feedback limits | `feedback.js MAX_BYTES`/`appVersion` regex and `events-worker.js MAX_FEEDBACK`/`VERSION` | equal today; the device copy is hand-kept |
| person id patterns | `reid.js CLOUD_ID` (make, list, client) and `model.js PERSON_ID` (Worker path ids) | `CLOUD_ID` allows up to 62 characters, `PERSON_ID` 49 |
| storing pulled records | `deps.put`/`deps.remove` write IndexedDB directly; only `fresh`/`keepBoth` go through `storeLoaded` (merge.js) | a rule added to `merge.js` or `persist` does not reach `take`, `merged` or `delete` |
| `noodlepads.cloud` events | built from log entries in `track-page.js appEventOf`, except `pin-wrong`, tracked directly in `cloud.js unlock` | a new cloud action needs both a `logEvent` field in `RULES` and a branch in `appEventOf` |
| retired route | `worker/cloud.js takeUses` (`/uses`) | to delete about 2026-11-16 with its test |
| the privacy policy link | `privacy.js PRIVACY_URL` and the literal URL in `index.html` `.privacy-link` | a new URL in one place leaves the other; `privacy.js` is in `sw.js MODULES` and cached, though the page never loads it |

## Invariants and gotchas

| Rule | Why | Guard |
|---|---|---|
| `pullOnce` reads `after` from `state` after `deps.merge`; it relies on `storeLoaded` ending with `readStorage()` | `deps.put` writes IndexedDB only; without the reload, `sent` and bases would hash the old local copy | `tests/cloud-sync.test.mjs` (fake devices) |
| every `/api` POST, PUT, PATCH and DELETE checks the Origin (`readJson`, or by hand in `forgetKey`, `putPiece`, `unshare`) | only the site's own page may write | `tests/worker-cloud.test.mjs` ("writes come only from the site's own page") |
| a clip record names whole audio of the same profile before the push | the Worker refuses 409 `sound`; the app uploads audio first | `tests/worker-cloud.test.mjs` |
| a push is one D1 batch; `rev` bumps once | a pull never sees half a push; pages end between pushes | "a push is all or nothing", "a pull pages by 500" |
| `since` on every push | without it the Worker overwrites records another device wrote | "a push with `since` …" |
| everything the Worker imports from `web/` is import-safe without a page | the Worker runs with no DOM | the worker tests import it in Node |
| `usage.js`, `agent.js`, `device-meta.js` (but for `usage.js`), `log-clean.js` (but for `agent.js`) import nothing else | the Worker imports them | `tests/agent.test.mjs` (the Worker uses `web/agent.js` itself) |
| every `logEvent` kind and field has a rule in `log-clean.js RULES` | an unlisted one is silently dropped | `tests/log-clean.test.mjs` |
| `worker/clean.js KIT_IDS` equals the kit in `boards.json` | else kit sounds report as `'kit'` | `tests/worker-clean.test.mjs` |
| every `EVENTS` name and key is in the standard's `events.toml` | the runner refuses others | `tests/telemetry.test.mjs` (only when `../telemetry` sits beside the checkout) |
| every `web/` file is in `sw.js SHELL` or `NOT_LOADED` | else the app opens broken offline | `tests/offline.test.mjs` |
| `sw.js` never serves the cache while the network answers | deploys must reach tablets at once | `tests/offline.test.mjs` ("online, every answer comes from the network") |
| `version.json` is never cached and its offline answer is marked | the update bar must not take the cached copy for news | `tests/offline.test.mjs`, `tests/update.test.mjs` |
| the CSP allows only what the page loads | no inline code, one outside origin | `tests/headers.test.mjs` |
| `events-client.js` and `events-worker.js` are never edited here | they are vendored with a recorded sha256 | `tests/events-route.test.mjs`, `tests/feedback-route.test.mjs` |
| privacy lines equal README's | the statement is quoted | `tests/privacy.test.mjs` |
| no plain email in a tracked file | scrapers | `tests/no-plain-email.test.mjs` |
| a schema change is a migration plus the full `schema.sql` | two roads to one schema | `tests/migrations.test.mjs` |

**Gotchas found while reading:**

- **Feedback's version is always `'dev'` on the live site.** `feedback.js appVersion` allows `[0-9A-Za-z.+_]` only, and the live `state.version` is `"v1.0.277-b328291"` (has a `-`). Checked: `appVersion('v1.0.215-4d5ef56')` returns `'dev'`. The test checks only a bare commit (`'fd576a9'`). The Worker's `VERSION` regex refuses `-` too, so the fix is in what the app sends (for example the release or the commit part).
- **A person's settings clash always goes to the cloud (as read).** `cloud.js storedLists` passes `prefs` through `settings.js cleanPrefs`, which returns only `{personId, values}` and drops the `changed` stamp. Both sides of a `prefs` merge then have stamp 0, `ctx.localNewer` is false, and a key changed on both devices takes the cloud's value. Other kinds keep their stamp. Likely unintended; no test covers it.
- **Edits during a sync do not schedule a sync.** `cloud.js` counts `applying` for the whole of `syncNow`, network waits included, and `db.onChange` ignores every store while it is non-zero. An edit pushed in the same sync is fine; one made after its last push slice waits for the next focus, blur, 5-minute tick or change.
- **Every sync redraws.** `storeLoaded` (always called by `pullOnce`) ends with `readStorage`, `notifyAllSettings`, `renderPeople`, `refreshPeople`, and `syncNow` reads storage again.
- **Reports expire lazily.** `reports.js` deletes expired rows only when a new report arrives.
- **`log-clean.js RULES.cloud` lists `forgot`**, which no code logs any more (dead entry; harmless). `remember` is logged again by 🔑 Remember (`true`) and `forgetHere` (`false`).
- **Session keys are swept only on open.** A PIN profile nobody opens again keeps its old session keys.
- **`cloud-sync.js pieces(0)`** is `[[0, 0]]`, but `startSound` refuses 0 bytes; an empty clip would fail its upload.
- **`track-page.js errorOf`'s comment names a `visits` module**, which no longer exists.
- **A sync triggered on hide is not `keepalive`.** `cloud-api.js` fetches have no `keepalive`; a closing page can cut the sync off. `sent`, bases and `rev` are saved after each step, so the next sync carries on.

## To change X, touch …

| Change | Touch |
|---|---|
| a new per-person store that syncs | `store.js SCHEMA`; `state.js` (`readStorage`, `storedLists`); `cloud.js storedLists`; `backup-ui.js storedLists`; `cloud-sync.js CLOUD_KINDS` (and `ONE_EACH`, `MADE`, `recordsOf`); `merge3.js STAMPED` (and `KEEP_BOTH`, `KIND_RULES`); `worker/cloud.js KINDS`; the `schema.sql` comment; `backup.js cleanBackup`; `merge.js` |
| a new cloud route | `worker/cloud.js route` (+ Origin check, `seen` if it should count in metrics); `web/cloud-api.js`; `cloud.js`; `tests/worker-cloud.test.mjs`; `docs/design/cloud-profiles.md` §5; `privacy.js` if it stores or shows something new |
| a D1 table or column | `worker/migrations/NNN-*.sql`, `worker/schema.sql` (and its `migrations` insert), `tests/migrations.test.mjs` passes; TODO "Ben does" for `just cloud-migrate --yes` |
| a cloud limit | `worker/cloud.js LIMITS` (or `CHUNK_BYTES`, `MAX_SOUND_BYTES`), the web twin (`cloud-sync.js CHUNK_BYTES`, `CLOUD_MAX_SOUND`, `PER_PUSH`), `cloud-api.js cloudTrouble` for a new answer |
| a merge rule | `merge3.js KIND_RULES` (and `KEEP_BOTH`); `tests/merge3.test.mjs`; `cloud-profiles.md` §6 |
| when sync runs | `sync-timing.js` constants; `tests/sync-timing.test.mjs` (incl. the request budget) |
| a new `logEvent` kind or field | `log-clean.js RULES` (`text` for free text); fixed lists in `SETTING_VALUES`, `VOICE_IDS`…; maybe `track-page.js contentOf`/`appEventOf` |
| a new setting | `settings.js`; `log-clean.js SETTING_VALUES` (the test fails until then) |
| a new usage event | `telemetry.js EVENTS`; the standard's `events.toml` (other repo) for standard names; `track-page.js` or a direct `track` |
| what the cloud stores or shows | `web/privacy.js PRIVACY`, README "Privacy" (word for word), `tests/privacy.test.mjs`, the shared policy (pdxfixit/privacy) |
| a new `web/` file | `sw.js MODULES` (or the right list) or `NOT_LOADED` in `tests/offline.test.mjs` |
| a new outside origin | `web/_headers` CSP on purpose; `tests/headers.test.mjs` |
| the domain | `worker/http.js ORIGIN`, `worker/clean.js KNOWN.origin`, `log-send.js LIVE_HOST`, `site/wrangler.toml routes`, `site/site.conf url` |
| the vendored events files | from a flarepress checkout: `just events-vendor` (never by hand) |

## Deploy settings

- `site/wrangler.toml`: Worker `noodlepads-com`, `main = ../worker/index.js`, assets `../web` as `ASSETS`, D1 `noodle-pads` as `DB` (`${D1_DATABASE_ID}` filled at deploy), R2 `noodlepads-telemetry` as `EVENTS`, R2 `app-suggestions` as `FEEDBACK`, rate limit `FEEDBACK_LIMITER` (10 a minute), custom domain apex only.
- `site/site.conf`: `url`, `committed=web worker site`, `pwa=0` (meaning not checked here), `version_wait=90`, `release=web/version.js`, `rollback=revert` (the Worker must match the live D1 tables).
- `web/.assetsignore` keeps `.DS_Store` and itself out of the upload.

## ✅ Checked by tests

The claims above marked as checked are tests in `tests/architecture.test.mjs`. When one fails, change this file and the test in the same commit as the code.
