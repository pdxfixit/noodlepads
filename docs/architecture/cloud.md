# The cloud, the Worker, what leaves the device, offline and updates

**Answer first.**

- **One Worker, five doors.** `worker/index.js` sends `/api/log` to `reports.js`, `/api/events` and `/api/feedback` to the vendored `events-worker.js`, and every other `/api` path to `cloud.js`. Every path with no static file behind it goes to `env.ASSETS`. Static files never reach the Worker.
- **One D1 database (`DB`), two R2 buckets (`EVENTS`, `FEEDBACK`), seven rate limits** (`FEEDBACK_LIMITER` for the whole app; `PUSH_LIMITER`, `SOUND_LIMITER`, `SHARE_LIMITER`, `OPEN_LIMITER`, `PULL_LIMITER`, `DOWNLOAD_LIMITER` per profile, `cloud.js LIMITERS`). One secret, `CHECKS_KEY`: the deploy checks' proof (`cloud.js provenCheck`). D1 holds profiles, records, audio, shares, problem reports, daily counters and player metrics.
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
| `cloud-ui.js` | the PIN pad, avatar picker, profile sheet's ☁️ and 🔒 parts, 🔗 Share, 🔗 Shared with me, ☁️ Open from the cloud and its progress (`drawOpen`, locked while `locked`) | `app.js` (`initCloudUI`, `askToOpen`, `shareSounds`), `people.js` (the profile sheet), `backup-ui.js` (`askEditPin`, `avatarBadge`), `welcome.js` (`openCloudList`), `bulk.js` (via `app.js` `share: shareSounds`) | `cloud.js`, `contact.js`, `merge.js mergeSummary`, `audio` |
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
| `play-count.js` | per-visit play counts | `pads.js` (`tapPad`, for the keys too), `kids.js`, `song.js`, `sequencer.js` (`countPlay`); `track-page.js` (`takePlay`); `app.js` (`clearPlay`) | `usage.js` |
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
| `sounds` | `{<clip id>: {sha256, sound, print?}}`: the cloud's audio for the clip (its hash and sound id), and `print` (`<blob size>:<changed stamp>`) of the device's blob last hashed equal to it, so an unchanged clip is not hashed again (`cloud-sync.js hashAudio`) |
| `pin` | the profile has a PIN |
| `check` | `{salt, hash}`: PBKDF2 of the PIN, so the device can check it with no network |
| `newPin` | the profile got a PIN this device never had typed; until typed, the person can't open, and 🤷 I don't know the PIN deletes them here |
| `rememberUntil` | ms: 🔑 Remember on this device skips the PIN here until then (`REMEMBER_DAYS`, 30). Set by `cloud.js rememberHere`; cleared by `forgetHere`, a removed PIN or a PIN changed elsewhere; a PIN changed on this device keeps it |
| `noOffer` | they said Not now to the offer, so `offersRemember` stops offering it on this device |

Readers and writers:

- Written only through `cloud.js saveLink` (and `dropLink`, which deletes; `restoreLink` saves a just-dropped link again when `people.js deleteHere` could not delete the person after all). `deps.saveLink` inside a sync re-reads the live link so a key, PIN or drop that happened mid-sync is kept.
- `state.js readStorage` loads it; `state.js reIdStoredPeople` deletes links whose id is not a `CLOUD_ID` (logs `cloud {unlinked}`).
- Read by `cloud.js` (`linkOf`, `inCloud`, `keyOf`, `pinIsNew`, `needsPin`, `pinGuards`), `people.js` (`linkOf`, `keyOf` when deleting), `who-now.js` (`linkOf(...).pin`).
- Backups never carry it (`backup-ui.js storedLists` has no `cloud`).

### Keys: remembered and session

- A no-PIN profile gets a remembered key (`keys.session = 0`): `putInCloud` (create, or open after a 409) and `openProfile` with no PIN (`remember = !pin`).
- A PIN profile gets a session key (`session = 1`): `unlock` calls `api.open(id, pin, remembers(link))`, so `false` unless this device remembers them. The key goes in `sessionKeys`, never IndexedDB.
- 🔑 Remember on this device (Ben, 2026-10-26): after a PIN opens someone, `cloud-ui.js offerRemember` asks once (`cloud.js offersRemember`); their profile's PIN part offers it too. `rememberHere(personId, pin)` opens again with `remember: true`, keeps that lasting key in the link, drops the visit's key (`api.forget` on the old one) and sets `rememberUntil`. While it holds, `needsPin` and `pinGuards` are false. `rememberedUntil` forgets a remembering whose day has come; so does `initCloud` at start. `forgetHere` (Forget this device, or the day) deletes the key here and in the cloud.
- `unlock` deletes the device's previous key in the cloud (`api.forget`), so a device holds one key per profile.
- The Worker deletes session keys older than `SESSION_KEY_MS` (7 days) only when that profile is next opened (`openProfile`). That is why a remembered PIN asks for a lasting key.
- Any key unused for `KEY_IDLE_MS` (180 days) stops working: `keyProfile` deletes it when it is next sent, and `openProfile` sweeps the profile's. `keys.used` is marked at most once an hour (0 on a key an older Worker made: its `created` counts). A profile keeps its `KEYS_PER_PROFILE` (20) most recently used keys: `newKey` drops the one unused longest. A device whose key went gets 401 like any other refused key (`keyRefused`).
- A new PIN, or a PIN reset by Ben, deletes every key of the profile (`changeProfile`). The next sync gets 401 → `cloud.js keyRefused` asks the public list: no PIN now → opens again by itself; a PIN → `newPin: true`, `rememberUntil` cleared, status `locked`. A PIN changed on this device keeps its `rememberUntil`.
- `initCloud` moves a stored key of a PIN profile with no `rememberUntil` (from the retired Remember, before 2026-10-19) into `sessionKeys` for this visit.

### PINs (and the three PIN sets in `cloud.js`)

| Set | Meaning | Cleared by |
|---|---|---|
| `sessionKeys` | person → key for this page | `dropLink`, `keyRefused`, `unlock` (replaced) |
| `unlocked` | PIN typed since this person was last opened; `needsPin` reads it | `leftPerson` (switching away), `dropLink`, `keyRefused` |
| `pinTyped` | PIN typed on this visit; `pinGuards` reads it (name, picture, color, counts, sounds on others' screens, backups) | `keyRefused`, page reload |

The PIN flow on opening a person: `app.js setPerson` → `needsPin` → `cloud-ui.js askToOpen` (one ask per person at a time) → `withPin` → `cloud.js unlock` → `api.open`. Offline (`CloudError` status 0) the device checks `link.check` itself; a PIN new to the device (`newPin`) has no `check`, so only the cloud can check it. `app.js` `onCloud` re-asks when a sync finds a new PIN for the person showing.

The PIN hash is done twice, the same way: `web/cloud.js pinHash` (`PIN_ROUNDS` 20,000) for the device's offline check, and `worker/pin.js hashSecret` (`ROUNDS` 20,000) for the real one. Wrong tries: `worker/pin.js checkSecret`, 5 in a row then `WAIT_MS` (10 minutes), kept in `profiles.fails`/`locked_until`. Each try is counted before the compare, by one `UPDATE … SET fails = fails + 1 … RETURNING fails`, so tries sent at once get 5 compares in all; a try past the fifth starts the wait without one. Wrong PINs answer 401 `{error:'pin', tries}`; a wait answers 429 `{error:'wait', wait}`.

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

### Progress while someone comes down

- `cloud-ui.js onListClick` → `cloud.js openProfile` (the link and key only, no sync) → `cloud.js bringDown(id, onProgress)` → `syncNow(id, { onProgress })` → `cloud-sync.js syncProfile` with `deps.onProgress`, `deps.signal` and `deps.fetched`.
- `syncProfile` tells a whole snapshot each time (`newProgress`: `phase` finding → sounds → storing → done, `sounds`, `done`, `total`, `got`, `now`, `stored`). `pullOnce` lists every sound to fetch before fetching any, so `total` (the clip records' `bytes`, checked by `soundBytes`; null when one is missing) is known up front; a later round adds to it. `progressShare` turns a snapshot into 0–1: by bytes, or by sounds when a size is missing. A throw from `onProgress` is ignored.
- `cloud-api.js fetchSound(sound, mime, { signal, onBytes, max })` reads the body as it arrives (`res.body.getReader`, else `res.blob()`), refuses more than `max` (`CLOUD_MAX_SOUND`, never the record's own size, which would stop every sync on a mismatch), and turns a stop into `CloudError(0, 'stalled')`. `pull` and `push` take the signal too.
- `syncNow` keeps `hearing` (listeners, so a caller can join a sync already running) and `stops` (its AbortController) per person. `bringDown` aborts it when nothing is heard for `STALL_MS` (20 s). `fetchedFor` keeps a cut-short open's sounds for 🔄 Try again; cleared on success and in `dropLink`.
- `leaveInCloud` (✕ Don't bring them) drops the link and forgets the key in the cloud. Logged as `cloud {opened: 'left'}`.
- `cloud-ui.js drawSoon` draws the latest snapshot once a frame; the bar is `.co-fill`'s `transform: scaleX(var(--got))`, set through `style.setProperty` (CSP: no style attributes).

### Bases and `sent` hashes

- `sent` (in the link): the hash of each record as the cloud holds it. `cloud-sync.js hashOf(record, sha)` = cyrb53 of `canonical(record)` plus the clip's audio SHA-256. `canonical` drops `blob`, `sound`, `sha256`, `bytes` and `changed`.
- `bases` (IndexedDB, since DB version 14, keyPath `id` = `"<person>|<kind>:<id>"`, value `{id, personId, body}`): each record as last synced, without audio. `cloud.js bases.load/save`; `dropBases` on `dropLink`, except `people.js deleteHere`, which keeps them (`keepBases`) until the person's delete has committed (`forgetBases`). `state.js readStorage` skips it.
- A base is trusted only when `hashOf(base) === sent[k]` (`cloud-sync.js decideRecord`): a sync cut off between the two saves is not trusted.

### The `changed` stamp

`merge3.js STAMP` = `'changed'`. `state.js persist` calls `stampEdit(store, value)` on every write of a `STAMPED` store. `merge3.js stampOf` reads it (else `saved`, else `edited`) for "the newer edit wins"; a tie goes to the cloud. `cleanStamp` drops a stamp more than a day ahead. `backup.js cleanBackup` keeps it, and so does `settings.js cleanPrefs` (which `cloud.js storedLists` runs on `prefs`), so a setting changed on two devices goes to the newer edit. Writes a sync makes (`deps.put`, `storeLoaded`) bypass `persist`, so they carry the stamp they arrived with.

### Sounds in pieces

`CHUNK_BYTES` = 1,900,000 on both sides (`web/cloud-sync.js`, `worker/cloud.js`). A sound is `ceil(bytes / CHUNK_BYTES)` rows in `sound_chunks`; at most `MAX_SOUND_BYTES` = 25 MB (14 pieces). Sound ids are `s-` + 26 base32 characters (128 random bits). Audio is deduplicated per profile by `(sha256, bytes)`. `GET /api/sounds/:id` needs no key and streams one piece per D1 query, `Cache-Control: public, max-age=31536000, immutable`.

### Shares

- **Making:** `cloud-ui.js` (🔗 Share… or `shareSounds` from ✏️ Edit sounds) → `cloud.js shareItem`: syncs first, `cloud-sync.js shareBundle` builds `{kind, title, bundle: {clips, beats, songs}}` (kit sounds as `kit:<id>`; `personId`, `group`, `pinned` and `blob` stripped), each clip gets its cloud `sound` from `link.sounds` (a sound share left with none, every sound too long for the cloud or empty, is refused: `SHARE_TOO_LONG`, "That sound is too long to share (the most is 25 MB).", and the Worker answers 400 `empty` to one; a share of several sounds, or a beat or song playing one, keeps what fits, and `leftOutNote` names the rest under the code; the preview is rendered from the kept sounds only, and `renderShare(kind, ids, {leave})` takes a left-out sound's rows out of a beat or song (`share-render.js leaving`), so a kid's long recording never reaches the public preview; `tests/cloud-share-long.test.mjs`), `renderShare` (= `share-render.js renderPreview`) records a preview WAV, `uploadAudio` puts it up, then `api.share`.
- **Shape in D1:** `shares` row (code, profile_id, kind, title ≤ 24 chars, bundle JSON ≤ 1 MB, preview sound id, hash, created) plus `share_sounds` rows that keep the audio alive after its clip or profile goes.
- **Receiving:** `openShare` (localStorage `shared`, at most `MAX_SHARED` 100, `{code, kind, title, at, gone?}`), `checkShared` marks unshared ones `gone`, `fetchShare`, ▶ Play (`cloud-ui.js playPreview`: decodes the preview into `audio.master`), 🎛️ Remix (`remixShare`: `shareDoc` with fresh ids → `cleanBackup` → `storeLoaded`).
- **Unsharing:** `DELETE /api/profiles/:id/shares/:code` deletes the share, its `share_sounds`, and audio nothing else uses. Deleting the profile (`deleteProfile`, and `cloud_admin.py delete_profile_sql` for a prune) deletes all its shares and sounds: 🚫 Unshare needs the profile's key, so a share left behind could never be ended. Shares of profiles deleted before 2026-10-26 still stand, with their sounds under profile_id `''`.

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
| a change | `store.js db.onChange(store)` (after every successful put, delete or batch) → `cloud.js` filter (a `CLOUD_KINDS` store or `people`; not while `applying`, which counts only the sync's own writes: `deps.put`, `deps.remove`, `deps.merge` and the `readStorage` after, each wrapped in `quietly`) → `scheduleSync` → `timing.changed()`. A kid's edit while a sync waits on the network schedules the next one (`tests/cloud-sync-edits.test.mjs`) | `SYNC_DELAY_MS` 20 s after the last change |
| focus, blur, visibility, pagehide | `timing.transition()` | gathered for `TRANSITION_MS` 1.5 s; skipped if a sync ran within `MIN_GAP_MS` 10 s and nothing changed; hiding with a change waiting syncs at once |
| active | `timing.arm()` | every `ACTIVE_MS` 5 min, only while shown and focused (`pageActive`) |
| slowed down | `syncNow` on a 429 `slow` → `timing.slow()` | `SLOW_MS` 1 minute later, if shown and focused; else on the next focus |
| by hand | `syncNow` from `unlock`, `openProfile`, `putUpNow`, 🔄 Sync now, `shareItem` | at once, one person |

`syncAll` runs one at a time; a call while one runs queues one more run, shared by every caller. `syncEveryone` calls `timing.ran()`, checks `cloudThere()` (`GET /api/cloud`), puts up everyone `wantsCloud`, then `syncNow` for each link in turn. `syncNow` runs one sync per person at a time (`running`), and needs a key (else status `waiting`).

### Pull (`cloud-sync.js pullOnce`)

1. `api.pull(id, key, since)` page by page (`more`), from `link.rev`.
2. The last word on each `kind:id` wins (`latest`).
3. Shortcuts: deleted here and unchanged there (`sent` equals the remote hash) → `skip`; same on both sides → `same`. Neither needs audio.
4. For other clips, audio comes from this device's blob when the SHA matches, else `api.fetchSound`.
5. Clean: `pulledDoc` makes a backup-shaped doc (each record given `personId`; `overrides` kept only under `<person>-`), and `deps.clean` = `backup.js cleanBackup(doc, audioOf, whatIsHere())`. A record the checks drop is left alone.

### Merge (`decideRecord` → `merge3.js resolve`/`merge3`)

Before each pull and each push, `hashAudio` hashes the audio of every clip whose `print` changed: a made sound whose sliders moved keeps its id and gets new audio (`sheet.js saveSheet`). merge3 compares records without audio, so for a clip on both sides `audioDecides` then lets the audio hashes overrule: new audio on one side wins it the audio (a `take` of the cloud's fields keeps this device's audio, as a `merged`), new audio on both keeps both sounds (`keepBoth`).

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

Right before each `take`, `merged`, `delete` or `fresh` write, with nothing awaited in between, the record here is checked against how the pull first read it (`printRecord`: content, `changed` stamp, audio size, kept as text since records are changed in place). One a kid edited meanwhile is held: not written, its `sent` and base left as they were, and `link.rev` not moved on, so the next round (`syncProfile` runs another while `held`) pulls it again and merges it.

After the stores: `deps.merge` always runs (even with nothing in it), and `storeLoaded` ends with `readStorage()`. Only then `pullOnce` sets `sent` and the base for each record (`take` and `same` from the cloud's copy, `fresh` from `after`, read from `state`), sets `link.rev` unless a record was held, and saves bases and link.

### Push (`cloud-sync.js pushAll`)

1. Clips over `CLOUD_MAX_SOUND` (25 MB) whose audio the cloud lacks stay home (`report.tooBig`). So does an empty clip (0 bytes, say from a backup), quietly: `startSound` takes no empty sound, and one would stop the whole sync.
2. Audio first, for each clip with no cloud sound or with audio changed here (`hashAudio`): `uploadAudio` → `api.startSound({sha256, bytes, mime})` → `{id, need}` → `api.putPiece` for each needed piece (`pieces`). `link.sounds[clip] = {sha256, sound, print}`. The Worker lets the clip's old audio go when the push names the new one. A 507 (the profile or the cloud is full) keeps that sound home (`report.full`) and the push carries on with everything else.
3. `planPush(local, sent)`: put what hashes differently, delete what is in `sent` but gone. A clip still on the device is never a delete.
4. A record whose JSON is over `RECORD_BYTES` (512 KB, the Worker's `recordBytes`) stays home as the cloud has it (`report.heavy`). The rest go in slices (`pushSlices`) of at most `PER_PUSH` (200) items and `PUSH_BYTES` (4 MB, less 1 KB for the envelope): `api.push(id, key, put, del, link.rev)`. A clip body is the record minus `blob`, plus `sound`, `sha256`, `bytes`. Each body is a snapshot taken with its hash before the pushes start, so an edit made meanwhile is pushed next time, never taken for sent.
5. The Worker writes only records with `rev <= since`; the rest come back in `stale`. Before writing, two reads in one batch cover the whole push (the sounds it names, and the sound each of its clips held: `json_each`, so D1's per-call query cap holds at 200 records; `tests/worker-cloud.test.mjs` counts the calls). In the write batch one pair of statements deletes the audio a deleted clip held, or a clip held before new audio, once no record and no share names it. Landed records update `sent` and the base. `link.rev` moves to the new rev only when `res.was === link.rev` (nobody else pushed in between). Bases and link are saved after each slice.

`syncProfile` repeats pull + push while `stale` is non-zero, at most `SYNC_ROUNDS` (3). A 409 `sound` (the push names audio the cloud no longer has: most often another device gave the clip new audio since this pull) pulls again and pushes; only a second 409 (the cloud lost it) drops that sound from `link.sounds` and sends the audio again, once. Then `pushLook` sends name, avatar and color by `api.change` when this device's `edited` is newer.

### After (`cloud.js syncNow`)

`readStorage()`, `followPerson()` (settings listeners hear a pulled `prefs`), `logEvent('cloud', {sync: true, …report})`, status `ok` with `syncNote(report)` (what stayed home, if anything). Errors: 404 `profile` → drop link, set 📴 Offline; 401 → `keyRefused`; anything else → status `trouble` with `cloudTrouble(err)`.

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
| `syncProfile` → | `{pulled, pushed, deleted, sounds, merged, clashes, kept, tooBig?, full?, heavy?}`; `cloud-sync.js syncNote` turns it into the status line |

## D1 tables (`worker/schema.sql`)

| Table | Key | Written by | Read by | Kept |
|---|---|---|---|---|
| `profiles` | `id` | `makeProfile`, `changeProfile`, `checkSecret`, `touch`, push (rev, `record_bytes`) | list, open, pull, every keyed route | until deleted or pruned |
| `keys` | `hash` (SHA-256 of the key) | `newKey`, `openProfile` (old sessions), `forgetKey`, `changeProfile` (new PIN), `deleteProfile` | `keyProfile` (marks `used`) | session keys a week; any key 180 days unused; 20 a profile |
| `records` | `(profile_id, kind, id)` | push (tombstones `deleted = 1`) | pull, push (orphan sounds), unshare | tombstones forever |
| `sounds` | `id` | `startSound`, `putPiece` (`got`), push (orphans: a deleted clip's, and a changed clip's old audio) and unshare, `deleteProfile` (all its own; profile_id `''` only on shared sounds of profiles deleted before 2026-10-26) | `getSound`, `ownSound`, push | until no record or share uses it; unfinished, an hour (`PENDING_MS`) |
| `sound_chunks` | `(sound_id, n)` | `putPiece` | `getSound`, `need` | with its sound |
| `shares`, `share_sounds` | `code`; `(code, sound_id)` | `makeShare`, `unshare`, `deleteProfile` | `getShare`, `myShares` | until unshared or its profile is deleted |
| `reports` | `key` = `<ISO>_<device>_<random>` | `reports.js handleLog` | the telemetry runner | `TTL_MS` 14 days; expired ones deleted when the next report arrives, and on every make, open, pull, push, share and PIN change and every look at the profile list (`metrics.js expireReports`, a query of its own, which logs `reports: N expired, deleted`) |
| `counters` | `(name, day)` | `http.js withinDaily` (`check-profiles`: the deploy checks' own; `profile:<id>:pushes`/`sounds`/`shares`: one profile's own, `cloud.js withinProfileDaily`) | the same | the site's old days stay; a profile's are deleted when a profile is made (`sweepProfileCounters`, by the key's range) |
| `devices` | `hash` (key hash) | `metrics.js noteEvent` | the runner | 90 days since last seen |
| `activity` | autoincrement `id` | `metrics.js noteEvent` | the runner | 14 days |
| `migrations` | `name` | each migration; schema.sql lists 001–007 as applied | `just cloud-migrate` | — |

Migrations: 001 drops gifts and families, adds `active`, `keys.session`, shares; 002 adds `devices`, `activity`, `uses`; 003 adds `visits`, drops `ip_hash`; 004 keeps country only; 005 drops `uses` and `visits`; 006 adds `profiles.record_bytes`, counted from the records and shares, and `bytes_counted`; 007 adds `keys.used`. `tests/migrations.test.mjs` checks the migrations reach `schema.sql`.

## Every /api/ route and its limits

All JSON bodies go through `http.js readJson`: `Origin` must be `https://noodlepads.com`, `Content-Type` `application/json`, at most 64 KB unless noted, an object. Keys are `Authorization: Bearer <32 base32>`. Path ids must match `model.js PERSON_ID`; new profiles must match `reid.js CLOUD_ID`.

| Route | Needs | Limits and checks |
|---|---|---|
| `GET /api/cloud` | — | — |
| `GET /api/profiles` | — | 300 newest, `CLOUD_ID` only, never a deploy check's (`TEST_PROFILE`, left out in the SQL before the 300) |
| `POST /api/profiles` | Origin | fun name, listed emoji, person color; 409 if it exists; 507 at 1,000 profiles; 429 at 10 new a UTC day across the site (a deleted one still counts); the deploy checks' ids (`TEST_PROFILE`: `p-smoke-…`, `p-e2e-…`) only with `X-Checks-Key` (below), 100 a day on their own counter; first deletes every check profile over `CHECK_MS` (10 minutes) old (a sound's start does too). A check profile holds only `CHECK_LIMITS`: 64 KB of records and shares, one sound of at most 4 MB, one share |
| `POST /api/profiles/:id/open` | Origin; PIN if set | 10 a minute a profile (`OPEN_LIMITER`, keyed by the profile id: an open has no key yet); 5 wrong → 10-minute wait (401 `tries`, 429 `wait`); a new key: the profile keeps its 20 most recently used, and sweeps session keys over a week old and any unused 180 days |
| `DELETE /api/profiles/:id/key` | Origin, key | deletes the key sent |
| `PATCH /api/profiles/:id` | Origin, key; current PIN for `newPin` | look kept only if `edited` ≥ stored; a new PIN deletes every key and returns a new one |
| `DELETE /api/profiles/:id` | Origin, key, PIN | deletes records, keys, shares, every sound of its own, metrics |
| `GET /api/profiles/:id/records?since=N` | key | 600 a minute a profile (`PULL_LIMITER`); 500 a page, never split inside one push |
| `POST /api/profiles/:id/records` | Origin, key | body ≤ 4 MB; ≤ 200 records; each ≤ 512 KB; 60 a minute a profile (`PUSH_LIMITER`); a clip must name whole audio of this profile (409 `sound`); a push that adds bytes: 507 `records full` over 10 MB of records a profile, 507 `cloud full` over 60 MB in all (each record its JSON + `ROW_BYTES` 100); 1,000 pushes a UTC day a profile (429 `busy` with `mine`), 5,000 in all |
| `POST /api/profiles/:id/sounds` | Origin, key | 600 a minute a profile (`SOUND_LIMITER`); ≤ 25 MB; `audio/*` mime; 507 over 40 MB a profile (its unfinished sounds counted whole) or 400 MB in all (others' unfinished ones only as far as they uploaded); first deletes every sound left unfinished over `PENDING_MS` (an hour); the caps are checked in the same `INSERT … SELECT … WHERE` that makes the sound, so starts sent at once can't all pass; 2,000 new sounds a UTC day a profile (429 `busy` with `mine`; asking again about one it has never counts) |
| `PUT /api/sounds/:sid/:n` | Origin, owner's key | counts on `SOUND_LIMITER` with the starts (600 a minute a profile); `n` 0–99 by the path, < `chunks`; a piece already stored: 409 `piece` with `need`, never written again (two sent at once: the second writes nothing, `ON CONFLICT DO NOTHING`); exact piece size; 404 on a sound left unfinished over an hour |
| `GET`/`HEAD /api/sounds/:sid` | — | 404 until every piece is in; 1,200 a minute for the profile that owns it (`DOWNLOAD_LIMITER`) |
| `POST /api/profiles/:id/shares` | Origin, key | 10 a minute a profile (`SHARE_LIMITER`); body ≤ 1 MB + 4 KB; ≤ 100 clips, 100 beats, 20 songs; title ≤ 24; 50 shares a profile; its bundle, title and rows count in the profile's 10 MB and everyone's 60 MB (507 `records full` / `cloud full`); 50 a UTC day a profile (429 `busy` with `mine`), 500 in all; same snapshot → same code |
| `GET /api/profiles/:id/shares` | key | — |
| `DELETE /api/profiles/:id/shares/:code` | Origin, key | only the sharer; gives its bytes back |
| `GET /api/shares/:code` | — | case and dashes ignored |
| `POST /api/profiles/:id/uses` | Origin, key | retired: ≤ 32 KB, stores nothing, answers ok; to remove about 2026-11-16 |
| `POST /api/log` | Origin | JSON, 64 KB, `cleanUpload`; 10 a minute a device code; 1,000 a UTC day (`reports`), and 1,000 more holding an error or a silent tap (`reports-problems`, `isProblem`); all kept reports at most 40 MB (`MAX_STORED_BYTES`, else 507); 204 |
| `POST /api/events` | Origin | `text/plain`, ≤ 64 KB, UUID batch id (`X-Batch` or `?batch=`); stored in R2 `EVENTS` as `v1/<day>/<batch>.jsonl`; 204 |
| `POST /api/feedback` | Origin | `text/plain`, 1–4096 bytes, `X-Feedback` UUID, `X-App-Version` `[0-9A-Za-z.+_]{1,32}`; rate limit 10 a minute for the whole app; R2 `FEEDBACK` as `v1/noodlepads/<day>/<version>-<id>.txt`; 204 |

**The deploy checks prove who they are** (`cloud.js provenCheck`): any request naming a `TEST_PROFILE` id, in the path or as a new profile's `id`, must carry `X-Checks-Key` (`CHECKS_HEADER`) equal to the Worker secret `CHECKS_KEY`, compared by `events-worker.js allowed` (constant time); else 400 `{error: 'id'}`, before anything else runs. Refused rather than made ordinary: the checks' clean-up (`dropOldChecks`, `cloud-prune --smoke`) goes by the prefix, and would delete such a profile. The app's ids never match (`util.js newId`: "p-" and the time in base 36). While the Worker has no `CHECKS_KEY`, the id alone passes, as before. The deploy puts the GitHub secret in with `wrangler secret put CHECKS_KEY` before the upload (skipped, with a notice, while it is empty); `tools/look-cloud.mjs` sends it from the environment, from Node and on the app's own `/api/` requests in its headless Chrome (DevTools `Fetch`, `/api/` only). `tests/worker-checks.test.mjs`.

**Per-profile rate limits** (`cloud.js slowDown`): every limit counts by the profile id, never an IP (the edge rule is the per-IP one). A push, a sound's start or piece, a share and a pull count once `needKey` has passed, so a profile's up to 20 keys share one count, and a stranger's made-up bearers are refused (401) before they count against a family; an open (it has no key yet) counts by the profile it opens, before the PIN check; a sound's download (no key) by the profile that owns the sound (one a deleted profile shared: by the sound's id), once the sound is found. Over the limit answers 429 `{error: 'slow'}`, apart from the daily caps' 429 `busy`: a sync it stops shows "Busy right now: trying again in a minute." (`cloud.js SLOW_TEXT`) and `timing.slow()` syncs again `SLOW_MS` (a minute) later; anything else (an open, a share) says "The cloud is busy right now. Try again in a minute." (`cloudTrouble`). A 429 that names no reason (the edge rule answers in a page of its own) reads as `slow` too (`cloud-api.js call`), and a 429 `slow` on an open is never noted as a wrong PIN (`cloud.js unlock`: only 401 and 429 `wait`). The daily caps keep "busy today, try again tomorrow"; a profile's own daily allowance (`LIMITS.profilePushesPerDay` 1,000, `profileSoundsPerDay` 2,000, `profileSharesPerDay` 50; 429 `busy` with `mine: true`) says "This profile has done a lot in the cloud today. It catches up tomorrow…", so one profile can't spend the site's day for every family. No binding (the tests' env), or a limiter that throws: not limited. The limits are far above a family's: the app pushes 20 s after a change and every 5 minutes while open; a restore of a full profile is a few dozen pushes of 200 records or 4 MB, saved one by one, so a cut-off restore goes on where it stopped; its sound starts go one at a time, at most a few a second, and start again from the first when cut off, so that limit is high. Pulls (600 a minute) and downloads (1,200) are limited only so one key can't spend D1's daily reads for every family: a restore pulls a few dozen pages and fetches its sounds one at a time, each at least two D1 reads in turn and the trip to the phone; a download over it is a 429 `slow` too (`cloud-api.js fetchSound`): a sync tries again in a minute, and ☁️ Open from the cloud's 🔄 Try again keeps the sounds it already fetched (`cloud.js fetchedFor`). A minute's limit slows one profile without stopping it over a whole day: its daily allowance stops it there. `tests/worker-limits.test.mjs`.

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
- Sweeps (`activity` > 14 days, `devices` > 90 days) run on make, open, push, share and PIN change (`SWEEPS`), with the usage switch on or off. On those and on a pull, and on every `GET /api/profiles`, `expireReports` deletes problem reports past `expires`, in a query of its own, and logs how many went.
- `forgetProfile` deletes both when a profile is deleted.
- Every write is caught; a missing table is skipped quietly.

## Feedback

⚙️ Settings → About → Feedback → `grown-up.js askSum` → `#feedback-dialog` → `feedback.js createFeedbackSender`: live host only, ≤ 4096 UTF-8 bytes, one `X-Feedback` UUID per text (a retry of the same text reuses it), `X-App-Version` = `appVersion(state.version)` (the label's `-` sent as `+`), `credentials: 'omit'`. 204 means sent. The text never enters the log, reports or usage events.

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
| the list shows the newest 300 profiles: fun names, avatars, colors, whether each has a PIN, and when its look last changed | the list also carries the id; `edited` is the look's last change (`LIMITS.listed` 300, `CLOUD_ID` ids only) | true |
| a sound's link plays for anyone | `getSound` needs no key | true |
| a share code works until 🚫 Unshare or its profile is deleted | `deleteProfile` deletes its shares and sounds (`dropProfileData`); a remix's audio is its maker's own | true |
| a PIN is not security | 4 digits, PBKDF2, waits; audio needs no PIN | true |
| nobody types a profile name | `funNamed` before upload; Worker `isFunName` | true |
| ☁️ off stays on this device | `isOffline` keeps them out; usage events are still sent from the device (not per person) | true for their things |
| problem reports: cleaned log, settings, counts, browser/system/type, screen size, time zone, sound timing, the app's version, random codes for this device and this visit; deleted about 14 days later, once the site is next used | the payload also holds the send time and the device pixel ratio (part of the screen size). Expired reports are deleted when the next report arrives, or on a make, open, pull, push, share or PIN change, or a look at the profile list | true: nothing is scheduled (no Cron Triggers, Ben 2026-10-26), so the line says "about" and "once the site is next used" |
| feedback: only what was typed and the app's version; no name or IP | as typed; `X-App-Version` is the live label with its dash sent as `+` (`v1.0.277+b328291`), since the Worker allows `[0-9A-Za-z.+_]` only; 90 days is the runner's job (unverified here) | true |
| deleting a profile: gone from the cloud at once, with every share code it made | `deleteProfile` deletes records, keys, shares, audio, profile, and `forgetProfile` its metrics | true |

## Seams (one job done twice, or in an odd home)

| Seam | Where | What a fix in one place misses |
|---|---|---|
| PIN hash | `web/cloud.js pinHash`/`PIN_ROUNDS` and `worker/pin.js hashSecret`/`ROUNDS` | a change of rounds or algorithm on one side breaks offline checks (the device's `check` is its own, so only consistency within each side matters today) |
| share code rules | `web/cloud.js plainCode` + `/^[A-Z2-9]{8}$/`, `worker/pin.js plainCode` + `isShareCode` | the device's check is wider (lets I and O through) |
| code alphabet | `log-send.js CODE_CHARS` and `worker/pin.js CODE_CHARS` | the same 32 characters, kept by hand |
| record kinds | `CLOUD_KINDS`, worker `KINDS`, `STAMPED`, schema comment | a new per-person store added to `CLOUD_KINDS` and `KINDS` but not `STAMPED` would never get its `changed` stamp, so its clashes always go to the cloud (no test) |
| record content and hash | `cloud-sync.js canonical` + `NOT_CONTENT`, `merge3.js canon` + `NOT_CONTENT` | a new non-content field added to one makes "changed" and "same" disagree |
| the stores as lists | `cloud.js storedLists`, `backup-ui.js storedLists`, `state.js storedLists` | the cloud's maps `prefs` through `cleanPrefs`; a new store must be added to all three |
| pieces and caps | `CHUNK_BYTES` (web and worker), `CLOUD_MAX_SOUND`/`MAX_SOUND_BYTES` (tested equal), `PER_PUSH`, `RECORD_BYTES`, `PUSH_BYTES`/`LIMITS.perPush`, `recordBytes`, `pushBytes` (tested equal) | the Worker's `GET /api/cloud` already returns `chunk` and `maxSound`; the app ignores them |
| browser and OS families | `agent.js parseAgent` (reports, metrics), `track-page.js browserOf` and `environment` `os` (usage events) | different order of checks and different case (`'Chrome'` vs `'chrome'`; `OPT/` only in `browserOf`) |
| the site's origin | `worker/http.js ORIGIN`, `worker/clean.js KNOWN.origin` (literal), `log-send.js LIVE_HOST`, `index.js EVENTS_OPTS`/`FEEDBACK_OPTS` (from `ORIGIN`) | a domain change must touch all of them |
| kit ids | `boards.json`, `worker/clean.js KIT_IDS` (test-guarded), `sw.js KIT` (test-guarded by the file list) | three lists of one kit |
| feedback limits | `feedback.js MAX_BYTES`/`appVersion` regex and `events-worker.js MAX_FEEDBACK`/`VERSION` | equal today; the device copy is hand-kept |
| person id patterns | `reid.js CLOUD_ID` (make, list, client) and `model.js PERSON_ID` (Worker path ids) | `CLOUD_ID` allows up to 62 characters, `PERSON_ID` 49 |
| storing pulled records | `deps.put`/`deps.remove` write IndexedDB directly; only `fresh`/`keepBoth` go through `storeLoaded` (merge.js) | a rule added to `merge.js` or `persist` does not reach `take`, `merged` or `delete` |
| `noodlepads.cloud` events | built from log entries in `track-page.js appEventOf`, except `pin-wrong`, tracked directly in `cloud.js unlock` | a new cloud action needs both a `logEvent` field in `RULES` and a branch in `appEventOf` |
| retired route | `worker/cloud.js takeUses` (`/uses`) | to delete about 2026-11-16 with its test |
| a clip's audio checked, then written | `worker/cloud.js push`: the 409 `sound` check reads before the write batch, not inside it | not atomic: another device's push can free that audio in between, and the record lands naming audio that is gone; the next pull's `fetchSound` 404s that sync, and the one after takes the newer record |
| the second 409 resend | `cloud-sync.js syncProfile`: after a 409, one pull, then a second 409 drops the sound from `link.sounds` and sends this device's audio again | an edit made during that re-pull can send audio that the push then leaves unnamed (a stale record): it stays in D1, counting toward the profile's bytes, until a sound that names it is deleted |
| audio freed while a pull fetches it | `worker/cloud.js push` frees a clip's old audio at once; `cloud-sync.js pullOnce` fetches audio named by the records it pulled | a pull that read a record just before another device replaced its audio gets 404 from `fetchSound`, and that whole sync fails (`trouble`); the next sync pulls the newer record and goes through |
| the privacy policy link | `privacy.js PRIVACY_URL` and the literal URL in `index.html` `.privacy-link` | a new URL in one place leaves the other; `privacy.js` is in `sw.js MODULES` and cached, though the page never loads it |

## Invariants and gotchas

| Rule | Why | Guard |
|---|---|---|
| `pullOnce` reads `after` from `state` after `deps.merge` for `fresh` records; it relies on `storeLoaded` ending with `readStorage()` | `deps.merge` may store them changed (a new id); without the reload, `sent` and bases would hash the old local copy | `tests/cloud-sync.test.mjs` (fake devices) |
| a pull never writes over a record changed since it read it | the audio downloads and network waits leave time for a kid's edit | `tests/cloud-sync.test.mjs` ("an edit made while a sync waits") |
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

- **Every sync redraws.** `storeLoaded` (always called by `pullOnce`) ends with `readStorage`, `notifyAllSettings`, `renderPeople`, `refreshPeople`, and `syncNow` reads storage again.
- **Reports expire lazily.** Nothing is scheduled: `reports.js` deletes expired rows when a new report arrives, and `metrics.js expireReports` on every make, open, pull, push, share and PIN change and every look at the profile list. A site nobody uses keeps an expired report until then.
- **Record bytes are kept as a running count.** `push` and `makeShare` first reserve their growth in one `UPDATE … SET reserved_bytes = reserved_bytes + ? WHERE record_bytes + reserved_bytes + ? <= cap AND (SELECT SUM(record_bytes + reserved_bytes) FROM profiles) + ? <= total RETURNING` (`reserve`), so writes sent at once can't all pass on the same count. Reservations live in `profiles.reserved_bytes`, apart from what is written, so a recount never wipes them; one older than `RESERVE_MS` (a minute: a write that died between taking and settling) counts for nothing. The write's batch ends its reservation (`settle`), subtracts what the records it writes held and adds what landed; a failed batch gives the room back (`release`). A refusal counts the profile's written bytes again first, so a drift high never refuses wrongly. A push's growth is read before its write, so its batch checks the caps once more, from what its records hold at that moment (another push may have deleted them and filled the room): over a cap, a `SELECT … json('over a cap')` stops the batch, and the push answers 507. Everyone's total is `SUM(record_bytes)` over `profiles`, one row per profile. `profiles.bytes_counted` is 0 until this Worker has counted the profile itself (migration 006 leaves every one at 0, as a push the older Worker took after it left the count low): each reservation counts the writer and up to 5 more such profiles (`countUncounted`), so every count is exact soon after the deploy. `tests/fake-d1.mjs` `slow` makes each query wait a turn, so such races show in a test.
- **Old keys are swept only on open.** A PIN profile nobody opens again keeps its old session keys (at most 20); an idle key is also deleted when it is next sent.
- **`track-page.js errorOf`'s comment names a `visits` module**, which no longer exists.
- **A sync triggered on hide is not `keepalive`, on purpose.** A closing page can cut it off, and nothing is lost or wedged: a pull stores nothing in the link until its merge is done, a push is one D1 batch whose `sent`, bases and `rev` are saved after it lands (a lost answer only means the next pull finds this device's own records, `same`), and audio pieces resume from `need`. `keepalive` could not carry it anyway: browsers cap a page's keepalive bodies at 64 KB in all, and a push may be 4 MB and a piece 1.9 MB.

## To change X, touch …

| Change | Touch |
|---|---|
| a new per-person store that syncs | `store.js SCHEMA`; `state.js` (`readStorage`, `storedLists`); `cloud.js storedLists`; `backup-ui.js storedLists`; `cloud-sync.js CLOUD_KINDS` (and `ONE_EACH`, `MADE`, `recordsOf`); `merge3.js STAMPED` (and `KEEP_BOTH`, `KIND_RULES`); `worker/cloud.js KINDS`; the `schema.sql` comment; `backup.js cleanBackup`; `merge.js` |
| a new cloud route | `worker/cloud.js route` (+ Origin check, `seen` if it should count in metrics); `web/cloud-api.js`; `cloud.js`; `tests/worker-cloud.test.mjs`; `docs/design/cloud-profiles.md` §5; `privacy.js` if it stores or shows something new |
| a D1 table or column | `worker/migrations/NNN-*.sql`, `worker/schema.sql` (and its `migrations` insert), `tests/migrations.test.mjs` passes; TODO "Ben does" for `just cloud-migrate --yes` |
| a cloud limit | `worker/cloud.js LIMITS` (or `CHUNK_BYTES`, `MAX_SOUND_BYTES`), the web twin (`cloud-sync.js CHUNK_BYTES`, `CLOUD_MAX_SOUND`, `PER_PUSH`, `RECORD_BYTES`, `PUSH_BYTES`), `cloud-api.js cloudTrouble` for a new answer |
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

- `site/wrangler.toml`: Worker `noodlepads-com`, `main = ../worker/index.js`, assets `../web` as `ASSETS`, D1 `noodle-pads` as `DB` (`${D1_DATABASE_ID}` filled at deploy), R2 `noodlepads-telemetry` as `EVENTS`, R2 `app-suggestions` as `FEEDBACK`, rate limits `FEEDBACK_LIMITER` (10 a minute), `PUSH_LIMITER` (60), `SOUND_LIMITER` (600), `SHARE_LIMITER` (10), `OPEN_LIMITER` (10), `PULL_LIMITER` (600), `DOWNLOAD_LIMITER` (1,200), each a 60 s window, custom domain apex only.
- `site/site.conf`: `url`, `committed=web worker site`, `pwa=0` (meaning not checked here), `version_wait=90`, `release=web/version.js`, `rollback=revert` (the Worker must match the live D1 tables).
- `web/.assetsignore` keeps `.DS_Store` and itself out of the upload.

## ✅ Checked by tests

The claims above marked as checked are tests in `tests/architecture.test.mjs`. When one fails, change this file and the test in the same commit as the code.
