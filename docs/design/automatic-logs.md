# Automatic logs: design

**Where reports are stored now:** the site's one D1 database, table `reports`, 30 days, deleted on the next insert, with a per-device and a daily cap instead of a rate-limit binding ([ADR 0009](../adr/0009-opt-in-problem-reports.md), [cloud profiles](cloud-profiles.md) § 1). `tools/logs.py --sync` reads it through D1's query API. Where this plan says KV, read D1; the rest (cleaning, the archive, the digest) stands.

**Status (2026-10-11):** Ben lifted the hold and answered Q2–Q5 and Q8 (§ 11). The app side, steps 1–3 of § 10, is built: `web/log-clean.js`, the switch in ⚙️ Settings, `web/log-send.js`. The Worker (step 4) and the Cloudflare setup are separate work.

**Ben's flow decision (2026-10-11):** KV is a 30-day inbox; a **`noodlepads-logs` leg of the recurrent routine** (`~/src/routines/recurrent`), due once a day, pulls new uploads into a **SQLite archive at `~/.local/state/noodlepads/logs.sqlite3`, kept forever**, and once a week files the week's new errors in `TODO.md`. No launchd (Ben: "it should be part of the recurrent skill, but only running 1/day"). Agents are the main readers ("I'll probably never do so manually"). See § 6. Backing up `~/.local/state` as a whole is a separate, later job.

Written 2026-10-11 for `TODO.md` "Agents do" → Automatic logs, within the decisions.md row "Automatic logs: an opt-in Settings switch, off by default …". Questions for Ben are in § 11.

**In short.** A new Settings switch, off by default, lets a device send its event log to `https://noodlepads.com/api/log`. The app sends only what an agent needs to find a bug: event kinds, numbers, settings, kit sound ids, the app version and the device type. It never sends audio, and it never sends any text a person typed: no people's names, no sound names, no beat or song names. The soundboard's existing Worker gains one small route that checks each upload, rate-limits it and stores it in Workers KV for 30 days. Ben (or an agent) reads it with `just logs`. No CSP change is needed. About 5 hours to build, plus about 15 minutes of Ben's time in Cloudflare.

| | Recommendation |
|---|---|
| What is sent | The event log since the last send, cleaned by an allowlist on the device, then checked again by the Worker |
| When | When the page is hidden (tab closed, app switched, screen locked), and 10 s after an error; at most once a minute |
| Where | Workers KV namespace `soundboard-logs`, bound to the site's Worker (flarepress) |
| How long | 30 days in KV (its own expiry, no clean-up job); forever in the local SQLite archive |
| How it is read | The `noodlepads-logs` recurrent leg (once a day) copies new uploads into `~/.local/state/noodlepads/logs.sqlite3`, and once a week files new errors in `TODO.md`; agents query the archive with SQL |
| Abuse limits | 64 KB a body, 10 uploads a minute per IP, the Worker re-checks every field, the site's Origin only |
| CSP | No change: `connect-src 'self'` already allows it |

---

## 1. What the event log holds today

`web/log.js` keeps the last 400 entries in memory, as `{t, kind, data}`. Every call site, and what in it is kids' content:

| Kind | Where | Data | Kids' content in it |
|---|---|---|---|
| `error` | `log.js`, `state.js` | message, source file, line | The message is free text. It can quote a value (`"…" isn't a value for …`) |
| `notice` | `ui.js` | the notice's text | **Yes.** Notices quote sound labels: `"Burp" didn't load` |
| `beat` | `sequencer.js` | play: bpm, bars, advanced, mode, signature, rows; stop: seconds, hits, cuts, limiter | **Yes.** Each row's `sound` is the clip's label, which a kid may have typed or renamed |
| `person` | `people.js`, `app.js` | added / restored / deleted id, bundled, sounds | **Yes.** Ids of people an older `boards.json` listed were first names |
| `backup` | `backup-ui.js` | counts, bytes, saved/loaded, error | Only in `error` (free text) |
| `song` | `song.js` | action, slots, parts, seconds | No |
| `render` | `voices.js` | voice, amount, seconds, ms | No (voices are a fixed list) |
| `setting` | `settings.js` | key, value, was | No (keys and values are declared in `settings.js`) |
| `storage` | `state.js` | booleans, error | Only in `error` (free text) |

So three things must never be sent as they are: free text (errors, notices), clip labels, and person ids.

## 2. What is sent

### The rule: allowlist, then redact

1. **Numbers and booleans pass.**
2. **A string passes only if its key has a fixed list of values** (`voice`, `mode`, `signature`, `action`, setting keys and values, kit sound ids). Any other string becomes `"«text»"`.
3. **Two free-text fields are redacted, not dropped:** `error.message` and `notice.text`. They help most. Before sending, the app replaces every name it knows on this device (people's names, every clip label, beat names, song names, take names) with `«name»`, then cuts the text to 200 characters. Redaction matches whole words, any case.
4. **Sounds are sent as what they are, never by name.** A kit sound sends its kit id (`kick`, public in `boards.json`). Anything else sends its kind: `recorded`, `uploaded`, `beat-sound`, `song-sound`.
5. **People are sent as a count and a position**, never an id: `{deleted: true, bundled: true, sounds: 12}`.
6. **An unknown kind is dropped**, and the payload says how many were dropped. A new `logEvent` kind sends nothing until someone adds its rule, and a test fails until they do (§ 9).
7. **Error sources** send the file name only if it is the site's own (`sequencer.js`), else `"external"` (a browser extension's script path can hold anything).

Hashing names is not used. A family's names are few and short; a hash of a short first name is found by trying every first name. A per-device secret salt would stop that, but then the hash means nothing to the reader either. Dropping is simpler and safer.

### The payload

One upload is one JSON object, at most 64 KB (the app keeps it under 60,000 bytes, leaving out the oldest entries if it must). The exact schema, as built in `web/log-clean.js` `cleanPayload` (the Worker can import it and run it again on every upload):

| Field | Type | Rule |
|---|---|---|
| `format` | `1` | Anything else: not a report (reject) |
| `app` | string | `state.version` (`"3e7f681"`, `"dev"`); must match `^[\w .:+-]{1,40}$`, else `"unknown"` |
| `device` | string | `^[0-9A-Z]{4}-[0-9A-Z]{4}$` (the app uses no 0, O, 1 or I). Missing or bad: not a report (reject) |
| `session` | string \| null | `^s-[a-z0-9]{1,12}$`, new each page load |
| `sent` | string \| null | ISO time, UTC, `…Z` |
| `env.ua` | string \| null | User-Agent, control characters removed, at most 300 characters |
| `env.screen` | `[w, h]` \| null | numbers |
| `env.dpr` | number \| null | |
| `env.tz` | string \| null | `^[A-Za-z0-9_+\-/]{1,40}$` |
| `env.audio` | object \| null | `{sampleRate, baseLatencyMs, state}`: numbers or null; `state` one of running, suspended, closed, interrupted, or null. Null before the first sound plays |
| `settings` | object | Only `advancedBeats`, `timeSignature`, `sendLogs`, each with a value from its list |
| `counts` | object | Only `people`, `sounds`, `recorded`, `beats`, `takes`, `songs`, numbers |
| `dropped` | integer ≥ 0 | Entries left out: unknown kinds, over 400, or too big for one upload |
| `entries` | array, ≤ 400 | `{t, kind, data}`: `t` whole ms since the page loaded; `kind` one of `RULES` in `log-clean.js`; `data` only that kind's fields |

Other top-level fields are dropped. Every number is rounded to 3 decimals. A string field outside its list becomes `"«text»"`. Beat rows send `sound` as a kit id (checked against `kitIds` when given, else `"kit"`) or `bundled` / `made` / `recorded`: the store does not record whether a sound was recorded, uploaded or made from a beat, so those three of the plan's kinds are one, `recorded`. A person's sounds from `boards.json` are `bundled`; ✨ Make one sounds are `made`.

Example: Example (a tablet, after a beat cut out):

```json
{
  "format": 1,
  "app": "3e7f681 2026-10-11",
  "device": "K7Q4-M2XD",
  "session": "s-9f3a",
  "sent": "2026-10-11T19:42:07Z",
  "env": {
    "ua": "Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
    "screen": [800, 1280], "dpr": 1.5, "tz": "America/Los_Angeles",
    "audio": { "sampleRate": 48000, "baseLatencyMs": 10.7, "state": "running" }
  },
  "settings": { "advancedBeats": true, "timeSignature": "4/4" },
  "counts": { "people": 3, "sounds": 41, "recorded": 6, "beats": 9, "takes": 2 },
  "dropped": 0,
  "entries": [
    { "t": 81234, "kind": "beat", "data": { "action": "play", "bpm": 120, "bars": 2, "advanced": true, "mode": "beats", "signature": "4/4",
      "rows": [ { "sound": "kick", "voice": null, "pills": 8, "rate": 1, "ring": false, "muted": false },
                { "sound": "recorded", "voice": "chipmunk", "pills": 4, "rate": 2, "ring": true, "muted": false } ] } },
    { "t": 95010, "kind": "notice", "data": { "text": "“«name»” didn't load, so it can't play." } },
    { "t": 95012, "kind": "error", "data": { "message": "Failed to decode audio data", "source": "audio.js", "line": 231 } },
    { "t": 97400, "kind": "beat", "data": { "action": "stop", "seconds": 16.2, "hits": 88, "cuts": 3, "maxRinging": 14, "limiterDb": -2.1 } }
  ]
}
```

(The example's `app` is illustrative; the built app sends `state.version`.)

Never in it: audio, waveforms, people's names or ids, sound/beat/song/take names, the board layout, the IP address (the Worker sees it for rate limiting and does not store it).

The **device code** is random, made when the switch is turned on and deleted when it is turned off. Settings shows it ("This device's code: K7Q4-M2XD") so Ben can find one tablet's logs. Ben chose it (Q4). It is kept in `localStorage` `log-device`.

## 3. When it is sent

| Moment | Why |
|---|---|
| The page is hidden (`visibilitychange` → hidden): tab closed, app switched, screen locked | One upload a session, sent with `fetch(…, {keepalive: true})`, which survives the page closing |
| 10 s after an `error` entry | A crash gets through even if the tab stays open; the 10 s gathers what happened next |
| Never more than once a minute per device | Caps a loop of errors |

Each upload holds only entries since the last successful send. A failed send is not retried until the next moment; the entries stay in memory (the 400-entry limit still applies). Nothing is sent from `localhost` or the Wi-Fi dev address: the switch shows "Only on noodlepads.com" there.

## 4. The switch and its wording

In Settings, a new section under Diagnostics, using the existing switch style (like Advanced):

As built (its own section, "Problem reports", under Diagnostics):

> Ask a grown-up before you turn this on.
> **📮 Send problem reports** — The app sends the soundboard's own website a short report of what it did, so problems can be found and fixed. Off unless you turn it on.
> Reports never hold sounds, recordings or anyone's names. They go only to Ben, to fix the app.
> This device's code: K7Q4-M2XD
> (on a dev copy) Reports send only from noodlepads.com, not from this copy.

Notes on the wording:

- It says what is sent, what is not, and where it goes, in words a 9-year-old can read.
- "Problem reports" fits what a kid expects; "logs" and "telemetry" do not.
- The grown-up line is Ben's answer to Q2.
- Turning it on sends nothing at once. Turning it off stops sending and forgets the device code.

The setting is `sendLogs: {default: false, values: [false, true]}` in `settings.js`. Backups carry it like every setting (Ben, Q5: "Carry it"); the device code stays in localStorage and is never in a backup. A ❓ Help line goes in the Settings tab.

## 5. Where it is stored

### What exists now (read from `~/src/flarepress`, 2026-10-11)

- `noodlepads.com/wrangler.toml` (as planned for the earlier address): one Worker, `compatibility_date = "2026-10-10"`, one Custom Domain, `[assets] directory = "./public"` (a symlink to this repo's `web/`). **No `main`, no Worker code, no bindings.** It is assets only.
- No site in flarepress has a KV, D1, R2, Analytics Engine or rate-limit binding. This would be the first. flarepress's `AGENTS.md` describes "plain static sites"; its doc needs a line for this.
- flarepress auth: a Keychain API token (`cloudflare-www-deploy`) scoped to Workers Scripts:Edit, Workers Routes:Edit, DNS:Edit, Zone:Read, else `wrangler login`. **That token cannot create or read a KV namespace** (it would need Workers KV Storage:Edit). Ben runs the one-time namespace creation, or adds that permission.
- The Cloudflare plan is **Free** (Ben, 2026-10-11). The Paid columns below are kept only for comparison.

### The change to the Worker

Add a Worker script beside the assets. Requests that match a file still go straight to the assets and never run the script; only `/api/log` (no such file) reaches it.

```toml
# flarepress/noodlepads.com/wrangler.toml (added lines)
main = "worker/index.js"          # symlink to ~/src/noodlepads/worker, like public/

[assets]
directory = "./public"
binding = "ASSETS"

[[kv_namespaces]]
binding = "LOGS"
id = "<made by `wrangler kv namespace create soundboard-logs`>"

[[ratelimits]]                    # syntax unverified against current wrangler docs
name = "LOG_LIMIT"
namespace_id = "1001"
simple = { limit = 10, period = 60 }
```

The script (about 80 lines, in this repo at `worker/index.js` so `just test` covers it):

1. Only `POST /api/log`. Anything else under `/api/` gets 404; other paths fall to `env.ASSETS.fetch`.
2. `Origin` must be `https://noodlepads.com`, `Content-Type` must be `application/json`, the body at most 64 KB. Else 400/413.
3. Rate limit by IP: 10 a minute. Else 429.
4. Parse, then run **the same allowlist as the app** (one shared module, `web/log-clean.js`, imported by both). A spammer's text in a field without a fixed list becomes `«text»`, so the store cannot be used to host arbitrary content.
5. Store: key `<ISO time>_<device>_<random>`, value the cleaned JSON, `expirationTtl` 30 days. Metadata `{app, device, errors: n}` so a list shows errors without reading every value.
6. Reply 204, with `Cache-Control: no-store`. (`_headers` covers assets only, so the script sets its own headers.)

### Options compared

| Store | Fit | Retention | Read with | Free-plan limits (unverified) | Paid (unverified) |
|---|---|---|---|---|---|
| **Workers KV** (recommended) | One upload = one key. Simple | `expirationTtl` per key; nothing to run | `wrangler kv key list / get` | 1,000 writes/day, 1 GB | Included in $5/mo Workers Paid; far above this use |
| D1 (SQLite) | Rows per entry; real queries ("all errors in audio.js this week") | A Cron Trigger deletes old rows (one more moving part) | `wrangler d1 execute --remote` | 100,000 rows written/day, 5 GB | Included in $5/mo |
| Workers Analytics Engine | Built for counts, not for reading one session's story | Fixed, about 3 months | SQL API with an account token | Unverified on Free | Included |
| R2 | One file per upload | Lifecycle rule | `wrangler r2 object get` | 10 GB; may need a payment method on file | Pennies |

KV wins on parts to set up and own: no schema, no cron, retention is one argument. D1 is the upgrade if Ben later wants to query across many uploads. On the Free plan, the 1,000 writes a day is also a hard spending cap: a flood stops storing, and costs nothing.

## 6. How the logs are read: KV inbox → daily SQLite archive → weekly digest, as a recurrent leg

Ben, 2026-10-11 (option 2): uploads wait in KV for up to 30 days; once a day they are copied into a local SQLite archive kept forever; once a week the new errors are filed. All of it runs as a leg of his `recurrent` routine, not launchd. Mostly agents read the logs; Ben rarely will.

**The archive.** `~/.local/state/noodlepads/logs.sqlite3` (the XDG state folder this Mac's other tools use). Stdlib `sqlite3`, so agents and tools can query it directly. Two tables:

```sql
CREATE TABLE uploads (            -- one row per KV upload, never deleted
  key TEXT PRIMARY KEY,           -- the KV key: <ISO time>_<device>_<random>
  received TEXT NOT NULL,         -- ISO time the Worker stored it
  device TEXT, app TEXT, ua TEXT, -- device code, app version, browser
  errors INTEGER NOT NULL,
  payload TEXT NOT NULL           -- the cleaned upload, as JSON
);
CREATE TABLE events (             -- each upload's event log, flattened for SQL
  upload TEXT NOT NULL REFERENCES uploads(key),
  seq INTEGER NOT NULL, t TEXT, kind TEXT NOT NULL, data TEXT,   -- data as JSON (json_extract works)
  PRIMARY KEY (upload, seq)
);
CREATE INDEX events_kind ON events(kind);
```

**The `noodlepads-logs` leg.** `recurrent` (`~/src/routines/recurrent`, three runs a day) runs every skill whose description says it is "a leg of the recurrent routine", through `leg.py`'s contract. The leg is a new skill at `~/src/skills/noodlepads-logs/` (linked into `~/.claude/skills` like the others):

- `gate.py` answers in about a second and never writes: **due** (exit 10) when the last good sync is over 20 hours old, so three runs a day sync once; or when the last digest is over 7 days old. Otherwise exit 0. `gate.py attention` prints its open items (a failing sync, new errors not yet filed).
- State in `~/.local/state/skills/noodlepads-logs.state.json`: last sync time and newest key copied, last digest time.
- The protocol: `just logs --sync` in this repo (copy new KV uploads into the archive in one transaction; a key already there is skipped, so a re-run or a missed day loses nothing while under 30 days); when the digest is due, `just logs --digest` (errors and notices since the last digest, grouped by message and app version, with counts and device counts). It finishes with `leg.py finish noodlepads-logs --status … --attention …`, so a failing sync reaches Ben's CURRENT.md digest the same run.
- Its capability model (its own, as each leg's is): may write the archive and its state; for each **new kind** of error, may add an "Agents do" line to this repo's `TODO.md` naming the query that shows it, commit just that file, and push and deploy as every commit here is (the repo's deploy rule). Nothing new: no commit. It never changes code.

**Reading by hand** (rare) and for agents, `tools/logs.py` (stdlib Python) behind these recipes:

| Command | Shows |
|---|---|
| `just logs` | The last 20 uploads, newest first: time, device code, app version, error count |
| `just logs --errors` | Only uploads with errors |
| `just logs K7Q4-M2XD` | One device's uploads, each printed like the diagnostics report's "Event log" section |
| `just logs --json <key>` | One upload as raw JSON, for an agent |
| `just logs --sync` | Copy new uploads from KV into the archive (the leg, daily) |
| `just logs --digest` | The week's errors, grouped (the leg, weekly) |
| `just logs --sql '…'` | A query against the archive |

The sync needs a Cloudflare token that can read KV. A wrangler login expires, which would break a daily job, so the plan is a long-lived **read-only KV token kept in Keychain**, created by Ben once (the flarepress token lacks KV permission). Reading the archive needs nothing: it is a local file.

## 7. Abuse and spam

The endpoint is public; anyone can POST to it, not only the app.

| Threat | Limit |
|---|---|
| Flood from one address | 10 uploads a minute per IP (rate-limit binding). Client side, once a minute |
| Flood from many addresses | Free plan: KV's 1,000 writes a day stops storage at no cost. Paid: KV writes cost about $5 a million (unverified), so a flood of a million costs about $5. A Cloudflare WAF rate-limit rule is the next step if it ever happens |
| Huge bodies | 64 KB cap, checked before parsing |
| Using the store to host text or links | The Worker re-runs the allowlist: free text only in two fields, 200 characters each |
| Cross-site pages posting from a visitor's browser | `Origin` must be the soundboard's. (A script can fake `Origin`; this only stops other web pages) |
| Junk making the logs hard to read | `just logs` shows device codes; junk without a code from the app's format is rejected |

## 8. The CSP

**No change.** `web/_headers` already has `connect-src 'self'`, which allows `fetch` to `/api/log` on the same origin. `form-action 'none'` does not apply to `fetch`. The design keeps it this way: no outside origin, no inline script.

## 9. Privacy note

For `README.md`, `AGENTS.md` § Privacy and the Help tab, once built:

> Problem reports are off unless someone turns them on, per device. When on, the app sends the soundboard's own website a record of what it did: buttons and features used, settings, errors, the browser and screen size. It never sends sounds or recordings, and never sends any name: not people's, not sounds', not beats'. Names inside error messages are blanked before sending. Reports wait on the website for up to 30 days, then are copied to Ben's own computer. Only Ben can read them. The website does not keep your IP address.

Things Ben should know (not a legal review):

- The device code is a persistent random identifier. Under COPPA (US, children under 13), persistent identifiers count as personal information unless used only for "support for internal operations", such as fixing bugs. This design uses it only for that. **Unverified as legal advice**; Ben's call (Q4). Dropping the code removes the question at the cost of not telling devices apart.
- The User-Agent string names the device model on Android (`SM-X200`). Useful for audio bugs; it is not personal, but it is fingerprint-ish. Q5.
- Cloudflare itself sees each request's IP, as it does for every page load today.

## 10. Build steps

Each step is one commit, tests first. As built, steps 1–3 show the switch. Deployed before step 6, a device that turns it on gets a failed upload (no `/api/log` yet); the entries just wait, and nothing breaks. Hide the section (`hidden` on it in `index.html`) if that should not be seen before the Worker is live.

| # | Step | Hours |
|---|---|---|
| 1 ✅ | `web/log-clean.js`: the allowlist per kind, kit id or kind for sounds, redaction of known names, the 200-character cap. Tests: every `logEvent` kind in `web/` has a rule (a test greps for them); a name typed anywhere never appears in output | 1.5 |
| 2 ✅ | `sendLogs` setting, the switch and device code in Settings, a Help line, contrast and 320–1100 px checks | 0.75 |
| 3 ✅ | `web/log-send.js`: entries since last send, `keepalive` fetch on hide, 10 s after an error, once a minute, nothing on localhost. Tests with a fake fetch | 0.75 |
| 4 | `worker/index.js`: route, Origin, size, rate limit, re-clean, KV put with TTL. Tests in `node --test` with fake `env` | 1 |
| 5 | **Ben's step (15 min):** approve; run `npx wrangler kv namespace create soundboard-logs`; create a read-only KV API token and store it in Keychain | — |
| 6 | flarepress: `worker` symlink, the `wrangler.toml` lines above, its `AGENTS.md` line; `just deploy-check`, then deploy; unhide the switch; send one test upload from the live site | 0.5 |
| 7 | `tools/logs.py` and the `just logs` recipes, with the SQLite archive (`--sync`, `--sql`), tests on a temp database | 1.25 |
| 8a | The `noodlepads-logs` recurrent leg: `~/src/skills/noodlepads-logs/` (SKILL.md, `gate.py` with tests, state), `--digest` and its TODO lines; `leg.py check` passes | 1.25 |
| 8 | Docs: `README.md`, `docs/deploy-cloudflare.md` (new binding, rollback), `docs/decisions.md` row, an ADR (it changes [ADR 0002](../adr/0002-cloud-profiles-on-one-worker.md) "No backend"), `docs/state.md` | 0.5 |
| | **Total** | **about 7.5** |

The TODO's "about 2 h" was low: the cleaning rules and the Worker each need their own tests.

Rollback: remove `main` and the bindings from `wrangler.toml` and redeploy (the site is static again), then `wrangler kv namespace delete`.

## 11. Decisions for Ben

**Q1. Where the logs are stored.** Answered 2026-10-11: KV as a 30-day inbox, plus the local SQLite archive kept forever (§ 6).
- A. Workers KV, 30-day expiry. Simplest; read one upload at a time. **Recommended.**
- B. D1. Can query across uploads ("every error this week"); needs a nightly clean-up job. About 1 h more.
- C. Analytics Engine. Good for counts, poor for reading what one session did.

**Q2. Does turning it on need a grown-up?** Answered 2026-10-11: A, the one-line hint.
- A. One switch, with the line "Ask a grown-up before you turn this on." **Recommended**: the app's choices are already the family's, and nothing is sent that names anyone.
- B. The switch asks a grown-up question first (a sum like "7 × 8"). Stops a curious kid; adds a dialog.
- C. No grown-up line at all.

**Q3. Do backups carry the switch?** Ben, 2026-10-11: B, "Carry it" (built).
- A. No: consent stays with the device. **Recommended.** Needs a small `backup: false` flag in `settings.js`.
- B. Yes, like every other setting today (simpler, but a restore can switch reports on silently).

**Q4. A device code?** Answered 2026-10-11: A.
- A. Yes, random, shown in Settings, deleted when switched off. Ben can find "the tablet's" logs. **Recommended.**
- B. No code. Each upload stands alone; nothing persistent is sent. Uploads from one device cannot be grouped.

**Q5. How much device detail?** Answered 2026-10-11: A, full.
- A. Full User-Agent, screen size, time zone, audio latency. Most useful for audio bugs. **Recommended.**
- B. Browser name and version and OS only (`Chrome 141, Android 14`), no model, no time zone.

**Q6. How long to keep them?**
- A. 30 days. **Recommended**: long enough to notice and fix, short enough not to pile up.
- B. 7 days.
- C. 90 days.

**Q7. What the sound in a beat row says.** Provisional (the lead's default, 2026-10-11): as written, built. Kit sounds by kit id (`kick`), all others by kind (`recorded`). Kit labels are public, but a kid can rename a kit copy, so the id is sent, not the label. Any objection? **Recommended: as written.**

**Q8. Send everything, or only sessions with a problem?** Answered 2026-10-11: A, every session.
- A. Every session's log, on hide. Shows what normal use looks like too. **Recommended.**
- B. Only when the session had an `error`, a cut-off notice or a storage problem. Fewer uploads; no picture of normal use.
