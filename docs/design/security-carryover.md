# Security carry-over: a brief for the Isopix agent

Written 2026-10-27 from noodlepads `origin/main` at 7859da0. Ben asked for these features to carry over to Isopix (`/home/user/pdxfixit/isopix`, a flarepress app with its own Worker), 2026-10-26.

Read this cold. Each section gives the noodlepads commits and files, the threat in one line, and what to copy and change. noodlepads is public (`github.com/pdxfixit/noodlepads`), so `git show <commit>` works in any clone.

## Summary

1. Most of these protect cloud profiles in D1. Isopix has none: its Worker serves only `POST /api/events` and `POST /api/feedback`, with no database and no profiles.
2. Carry now, cheaply: the edge rate limit on `/api/` (Ben adds it in Cloudflare), the Worker's limiter bindings and their namespace block, the CSP check, the names-hash test, and the privacy-in-step test.
3. Carry only if Isopix gets accounts or a database: the PIN counters, daily allowances, size caps, the per-address profile cap, reset-PIN, the checks' proof, and the cloud log rules.
4. One gap belongs in flarepress itself: its shared `handleEvents` has no rate limit. Both apps vendor that file, so the fix goes there first.
5. Check two things before copying numbers: the edge rule's figures (decisions.md and the old TODO disagree), and a device-side PIN weakness (section "Gaps").

## Table

| Feature | Commit(s) | Files | Effort to carry |
|---|---|---|---|
| Edge rate limit on `/api/` (Ben's zone rule) | 203d415, a53ca37 (docs; the rule lives in Cloudflare) | Cloudflare dashboard; `docs/decisions.md` "Hosting and data" | S (Ben does it) |
| Worker rate-limit bindings and the namespace block | 506ad11, d46a6e7, 401c91f, 7637fd9, 67a1cc3, 87f3865 | `site/wrangler.toml`, `worker/cloud.js` (`LIMITERS`, `slowDown`), `tests/worker-limits.test.mjs`, `docs/deploy-cloudflare.md` | S |
| Per-profile daily allowances | c4cdd62 | `worker/cloud.js` (`withinProfileDaily`, `LIMITS`), `worker/http.js` (`withinDaily`), `worker/schema.sql` (`counters`) | M |
| Size caps with atomic reservations | 33fb1a1, 9b686a1, 81c6d45, d4c5266, 8a3f6b4, c48c0d3 | `worker/cloud.js` (`reserve`, `settle`, `release`), `worker/migrations/006-record-bytes.sql` | L |
| Atomic PIN-guess counter | 55f4f9e, 2236b92 | `worker/pin.js` (`checkSecret`) | S to copy, M to wire |
| Keyed-request counter (migration 009) | 2236b92 | `worker/migrations/009-key-fails.sql`, `worker/pin.js` (`KEYED`) | S |
| Site-wide `/open` limiter | 28efd5e | `worker/cloud.js` (route), `site/wrangler.toml` (41517) | S |
| Per-address new-profile cap | 835330c, 9ab52f8 | `worker/cloud.js` (`ipCounterName`, `addressGroup`), `worker/http.js`, `tools/ensure_ip_key.sh`, `.github/workflows/deploy.yml`, `tests/worker-ip-limit.test.mjs` | M (needs accounts) |
| Checks' proof, `CHECKS_KEY` | f2b6698, 1cc22d8, 18cbdda, 49c48f1 | `worker/cloud.js` (`provenCheck`, `TEST_PROFILE`), `tools/look-cloud.mjs`, `.github/workflows/deploy.yml` | S (only with live writes) |
| Deploy: scoped token, wrangler secrets, migrations before upload | 6ab2630, 55187c1, f6bd185, 87f3865 | `.github/workflows/deploy.yml`, `tools/cloud_admin.py` (`migrate`), `docs/deploy-cloudflare.md` | S for secrets, M for migrations |
| Names-hash secret test | ef5daf8, ab1b323, e737cd1, 5d81def | `tests/no-names.test.mjs` | S |
| Random PIN resets | b9b4d1b, 4ac782d | `tools/cloud_admin.py` (`new_pin`, `reset_pin`), `justfile`, `docs/how-to.md` | S |
| Log cleaner `RULES` | 2140c42, aead058 | `web/log-clean.js`, `worker/clean.js`, `worker/reports.js`, `tests/log-clean.test.mjs`, `tests/worker-clean.test.mjs` | M |
| Content-Security-Policy | a0abcc9, 9af8fc3, 8dd51e8, 468d901 | `web/_headers`, `tools/serve.py` | S |
| Caps on untrusted input | 2140c42, 33fb1a1, 8a3f6b4; `docs/guide.md` "Limits on what comes in" | `worker/cloud.js` (`LIMITS`), `worker/http.js` (`readBytes`), the app's import code | M |
| Privacy statement kept in step by a test | 702934c, f620c6d, 25d79f5, 835330c | `tests/privacy.test.mjs`, `web/privacy.js`, `docs/privacy-policy.md`, `README.md` | S |

---

## 1. Edge rate limit on `/api/` (Ben's zone rule)

- **Applies to:** any flarepress app with `/api/` routes. Ben sets it in the Cloudflare dashboard, zone by zone.
- **What it does:** Cloudflare counts requests per IP address on `/api/` and blocks that address for 10 s when it goes over the limit. The app never sees or stores the IP.
- **Threat:** one client drains the shared daily caps for every family (security seat, 2026-10-26).
- **Commits and files:** 203d415 and a53ca37 (docs only). The rule lives in Cloudflare's dashboard. The rule is described in `docs/decisions.md`, "Hosting and data", row "`/api/` is rate-limited twice".
- **Carry to Isopix:** Ben adds the rule to the `isopix.app` zone: Security, then WAF, then Rate limiting rules. Match "URI path starts with `/api/`", count by IP, and set the figures in section "Gaps", item 1. It covers `/api/events` and `/api/feedback`, the only `/api/` routes there.
- **Who acts:** Ben. Wrangler does not reach zone WAF rules, so ask Ben once, in one line, with the reason.

## 2. Worker rate-limit bindings and the namespace block

- **Applies to:** any flarepress app whose Worker has routes that write or read a lot.
- **What it does:** each `[[ratelimits]]` binding is a per-key counter for one minute (`simple = { limit, period = 60 }`). `slowDown` in `worker/cloud.js` calls `limiter.limit({ key })`. Over the limit it answers 429 `slow`, which the app shows as "busy right now" and retries in a minute. The key is the profile id, never an address.
- **Threat:** one profile or device spends the shared D1 reads and writes for every family.
- **Commits and files:** 506ad11 (pushes, sound starts, shares, opens), d46a6e7 (the 429 wording), 401c91f (pulls and downloads), 7637fd9 (counted only after the key is checked), 67a1cc3 (the edge's own answer reads as busy, never as a wrong PIN), 87f3865 (the namespace block). Files: `site/wrangler.toml`, `worker/cloud.js`, `tests/worker-limits.test.mjs`, `docs/deploy-cloudflare.md`.
- **Namespace block:** rate-limit namespace ids are shared by every Worker on the Cloudflare account, and nothing assigns them. The scheme: each app's feedback limiter is `415N` (Isopix `4150`, Noodle Pads `4151`). An app's other limiters take `415N0` to `415N9`. So Isopix's own limiters go in 41500 to 41509, and its feedback limiter stays 4150. Pick ids from that block only, and do not reuse one.
- **Carry to Isopix:** copy the binding pattern and `slowDown`. Copy the id check from `tests/worker-limits.test.mjs`. Limit only routes that write.
- **Gap to know:** `slowDown` fails open. If the binding is missing or `limit()` throws, the request goes on and a line is logged. Decide per route whether Isopix wants that.
- **Effort:** S.

## 3. Per-profile daily allowances

- **Applies to:** cloud-profile apps only.
- **What it does:** each profile gets its own share of the shared daily caps, counted per UTC day: 1,000 pushes, 2,000 new sounds, 50 shares (`LIMITS.profilePushesPerDay` and its siblings). Over it the Worker answers 429 `busy` with `mine: true`, and the app says it is this profile's limit for today.
- **Threat:** a minute's rate limit cannot guard a day. One profile must not use up the site's 5,000 pushes or 500 shares (Ben, 2026-10-26).
- **Commits and files:** c4cdd62. `worker/cloud.js` (`withinProfileDaily`, `LIMITS`, `sweepDailyCounters`); `worker/http.js` (`withinDaily`); `worker/schema.sql` (`counters` table).
- **Carry to Isopix:** copy `withinDaily`. It is one statement that counts and returns the new number, so two parallel calls cannot both pass. Copy the `counters` table and the sweep. Set Isopix's own numbers; none exist yet.
- **Effort:** M.

## 4. Size caps with atomic reservations

- **Applies to:** cloud-profile apps that store user data in D1.
- **What it does:** a write takes its room before it writes. `reserve()` in `worker/cloud.js` is one `UPDATE ... WHERE` that checks the profile's cap and the site's cap, adds the bytes to `reserved_bytes`, stamps `reserved_at`, and returns the row only if it passed. The write then settles the reservation in the same batch. A failed write releases it. A reservation older than 60 s (`RESERVE_MS`) no longer counts, which covers a Worker that died mid-write. The push's own guard runs again inside its write, so a cap cannot be passed between the check and the write.
- **Threat:** one device fills the 500 MB free-plan database and stops every family's sync (security review, 2026-10-26).
- **Current caps:** each profile 10 MB of records and 40 MB of sounds; all profiles 60 MB of records and 400 MB of sounds; a push body 4 MB; one record 512 KB; 200 records a push; one sound 25 MB in 1.9 MB pieces.
- **Commits and files:** 33fb1a1 (caps), 9b686a1 (pushes reserve one at a time), 81c6d45 (reservations kept apart from counted bytes), d4c5266 (a sound's start checks its caps in the statement that makes it), 8a3f6b4 (push guard inside the write), c48c0d3 (share codes count), dabec90 (a stored piece is never written again). Files: `worker/cloud.js`, `worker/migrations/006-record-bytes.sql`, `tests/worker-cloud.test.mjs`.
- **Carry to Isopix:** copy the reservation pattern and migration 006's shape. Keep the byte counting specific to the record shape. Isopix must set its own caps. Pair this with section 15.
- **Effort:** L.

## 5. Atomic PIN-guess counter

- **Applies to:** any app with a PIN checked through its Worker.
- **What it does:** `checkSecret` in `worker/pin.js` counts a try first, in one `UPDATE ... RETURNING`, and only then compares the PIN. Five tries are allowed, then a 10-minute wait (`locked_until`). Requests sent together each get their own number, so no more than five are compared in one window. The hash is PBKDF2-SHA-256 with 20,000 rounds and a random salt. The comparison takes the same time whatever differs. The app gets tries left, and from the second wrong try, a note to ask a grown-up.
- **Threat:** a 4-digit PIN has 10,000 values. The count and the wait stop a stranger who guesses through the site.
- **Commits and files:** 55f4f9e (count before compare), 2236b92 (the current PIN rule), 2140c42 (origin). Files: `worker/pin.js`, `worker/cloud.js` (`needPin`).
- **Carry to Isopix:** copy `pin.js` unchanged. Its only import is `hex` from `http.js`. Add `fails` and `locked_until` to the table that holds the secret.
- **Effort:** S to copy, M to wire.

## 6. Keyed-request counter (migration 009)

- **Applies to:** cloud-profile apps with a PIN and a device key.
- **What it does:** opening a profile counts wrong tries in `fails` and `locked_until`. Requests that carry a key (Change PIN, Leave, Remove PIN, Delete) count in `key_fails` and `key_locked_until`. `OPENING` and `KEYED` in `worker/pin.js` name the two pairs. The names are fixed in code, never taken from a request.
- **Threat:** a stranger's five wrong tries at open must not lock a family out of leaving on a device that holds its key (`docs/design/cloud-needs-pin.md`).
- **Commits and files:** 2236b92. `worker/migrations/009-key-fails.sql` (two columns with defaults, so an older Worker never names them), `worker/pin.js`.
- **Carry to Isopix:** copy the migration and the two pairs. Keep the migration additive, because the deploy applies migrations before the upload.
- **Effort:** S.

## 7. Site-wide `/open` limiter

- **Applies to:** cloud-profile apps where one client could try a PIN on every listed profile.
- **What it does:** each open first takes a count from `OPEN_SITE_LIMITER`, under the address's keyed daily hash: 60 a minute for one address (it was one key for the whole site until 2026-10-27, which let one client shut everyone out). Then it takes the per-profile `OPEN_LIMITER`: 10 a minute. Both come before the PIN is read.
- **Threat:** trying 5 PINs on each of many profiles never trips a per-profile limit (council, 2026-10-27).
- **Commits and files:** 28efd5e. `worker/cloud.js` (route, `LIMITERS.openSite`), `site/wrangler.toml` (namespace 41517).
- **Carry to Isopix:** copy the pattern as one more binding in the block from section 2.
- **Effort:** S.

## 8. Per-address new-profile cap

- **Applies to:** cloud-profile apps that let strangers create profiles. Isopix has no profiles today, so skip this unless it adds them.
- **What it does:** at most 3 new profiles a UTC day per address, and 50 a day across the site. The address is hashed twice: `HMAC(HMAC(IP_HASH_KEY, today), address)`. The inner key changes each UTC day, so a stored row cannot be matched to an address without the Worker's secret. An IPv6 address counts as its /64, the smallest network one home or phone gets. The address is never stored, logged or answered. Earlier days' rows are swept. The deploy checks' profiles are exempt, with a valid `CHECKS_KEY`. Without the secret, nothing is counted.
- **Threat:** one stranger uses up the site-wide 50 from one address (Ben, 2026-10-26).
- **The key:** the deploy makes it. `tools/ensure_ip_key.sh` pipes `openssl rand -hex 32` into `wrangler secret put IP_HASH_KEY`, but only when the Worker has none. Nobody holds the key. It is set in the Worker and nowhere else. It is left alone once set, so each deploy does not restart the day's counts.
- **Commits and files:** 835330c (code, test, deploy step), 9ab52f8 (the decision text). Files: `worker/cloud.js` (`ipCounterName`, `addressGroup`, `makeProfile`), `worker/http.js`, `tools/ensure_ip_key.sh`, `.github/workflows/deploy.yml` (step "Give the Worker its address-hash key"), `tests/worker-ip-limit.test.mjs`.
- **Carry to Isopix:** copy `ensure_ip_key.sh` unchanged (it takes the wrangler wrapper and the site folder as arguments), and copy the one deploy step.
- **Effort:** M.

## 9. The checks' proof: `CHECKS_KEY`

- **Applies to:** any app whose live checks write to the cloud. Isopix has nothing to prove yet.
- **What it does:** the live checks make throwaway profiles with ids `p-smoke-…` and `p-e2e-…`. Those ids get small caps of their own: 100 a day, 64 KB of records, one 4 MB sound, one share. Such an id is accepted only when the request carries the Worker secret `CHECKS_KEY` in `X-Checks-Key` (`provenCheck`). Otherwise it is refused with 400 `id`. The deploy puts the GitHub secret into the Worker before the upload, trimmed at both ends. A failed put stops the deploy. Until the Worker holds a key, the id alone passes, and the deploy prints a notice.
- **Threat:** anyone could type a check's id and skip the kids' caps. The checks' clean-up sweeps such profiles.
- **Commits and files:** f2b6698 (the proof), 1cc22d8 (trimmed), 18cbdda (a check's profile holds only what a check needs), 49c48f1 (clean-up). Files: `worker/cloud.js` (`TEST_PROFILE`, `provenCheck`, `CHECK_LIMITS`), `tools/look-cloud.mjs`, `.github/workflows/deploy.yml` (step "Put the checks' secret into the Worker"), `docs/deploy-cloudflare.md`.
- **Carry to Isopix:** only when Isopix has a route that creates records. Then copy the id guard, the secret step, and the environment variable for the live check.
- **Effort:** S, once there is something to prove.

## 10. Deploy: scoped token, wrangler secrets, migrations before upload

- **Applies to:** any flarepress app that deploys from GitHub. Isopix has `.github/workflows/deploy.yml` with `CLOUDFLARE_API_TOKEN`.
- **What it does:** the deploy runs tests and release checks. It then runs `just cloud-migrate --yes`, which applies migrations the database lacks. It refuses a `DROP TABLE` that the telemetry mirror has not copied. It puts `CHECKS_KEY` and `IP_HASH_KEY` into the Worker, through the flarepress wrapper, under `set -euo pipefail`. Then the flarepress action uploads. Agents hold no token. The token is scoped: Workers Scripts Edit, D1 Edit, Workers Routes Edit, DNS Edit, Zone Read. Only the steps that need it see it.
- **Threat:** a new Worker must never meet an older database. A failed secret put must not leave the live Worker running without its secret.
- **Commits and files:** 6ab2630 (GitHub deploys, no agent token), 55187c1 (migrations before the upload), f6bd185 (drop guard), 87f3865 (a failed put stops before the upload). Files: `.github/workflows/deploy.yml`, `tools/cloud_admin.py` (`migrate`), `tools/ensure_ip_key.sh`, `docs/deploy-cloudflare.md`.
- **Carry to Isopix:** copy the secret steps as they are. Add the migrate step only if Isopix gets a database. Give the token D1 Edit only then.
- **Effort:** S for the secret steps, M for migrations.

## 11. Names-hash secret test

- **Applies to:** any public repo whose content must name no one.
- **What it does:** `tests/no-names.test.mjs` reads every tracked file and every path. It checks them against hashes of names, kept outside the repo: the GitHub secret `NOODLE_NAME_HASHES` in CI, and `~/.config/noodlepads/names.json` on Ben's Mac. The test names no one. It has two lists: `anyCase` (names in any case) and `asName` (a name that is also an everyday word in code, caught only when capitalized or written as an id). A checkout without the hashes skips the scan and says so. CI always has them.
- **Threat:** an unsalted SHA-256 of a first name falls to a word list in seconds. So the hashes cannot sit in a public repo.
- **Commits and files:** ef5daf8 (hashes leave the repo), ab1b323 (read from outside; CI proves they match), e737cd1 (the test checks itself on made-up names), 5d81def (docs). File: `tests/no-names.test.mjs`.
- **Carry to Isopix:** copy the test and the secret pattern. Ben supplies the hash lists. No agent computes them or needs to see them. Isopix already has `test/names.test.mjs`, so decide how the two lists fit together.
- **Effort:** S.

## 12. Random PIN resets

- **Applies to:** cloud-profile apps with a PIN.
- **What it does:** `just cloud-reset-pin "<fun name>"` runs a dry run, then `--yes`. It finds the profile and sets a new PIN from `secrets`, each of 0000 to 9999 equally likely, never an obvious one (four of one digit, a straight run, a common pick). It sets hash and salt in one `UPDATE`, clears both wrong-try counters, and deletes every key, so each device asks once. It prints the PIN once, to stdout, for the owner to pass on. The PIN goes to no file, log or database.
- **Threat:** a fixed PIN left a public profile on a PIN everyone knows (Ben, 2026-10-27, after a security seat's finding).
- **Commits and files:** b9b4d1b (reset by fun name), 4ac782d (random PIN). Files: `tools/cloud_admin.py` (`new_pin`, `reset_pin`), `tools/test_cloud_admin.py`, `justfile`, `docs/how-to.md` ("Reset a forgotten PIN").
- **Carry to Isopix:** copy `new_pin` and `reset_pin`. They need the admin tool's database access, so this comes with section 10.
- **Effort:** S.

## 13. Log cleaner `RULES`

- **Applies to:** any app that sends problem reports or logs. Isopix sends none. Its feedback box stores a grown-up's typed text as it was sent, so the cleaner does not apply there.
- **What it does:** `web/log-clean.js` is an allowlist. `RULES` lists, for each log kind, the fields it may send. A string passes only from a fixed list. Anything else becomes «text». Free text is redacted: every known name blanked, every quoted phrase blanked, control characters removed, 200 characters at most. A sound is sent as its kit id or kind, a person as true or false and counts. The Worker runs the same `cleanPayload` again (`worker/clean.js`, `worker/reports.js`), so what is stored is what the app would send. A test fails when a log kind or field has no rule.
- **Threat:** audio, names or typed text leave a device by accident.
- **Commits and files:** 2140c42 (origin), aead058 (the cloud's allowlist keeps only what the app logs). Files: `web/log-clean.js`, `worker/clean.js`, `worker/reports.js`, `tests/log-clean.test.mjs`, `tests/worker-clean.test.mjs`.
- **Carry to Isopix:** only if Isopix adds reports. Copy both files and both tests. Write the rules for Isopix's own log kinds. Its kit ids are its own, so `KIT_IDS` in `worker/clean.js` must be replaced with Isopix's own list.
- **Effort:** M.

## 14. Content-Security-Policy

- **Applies to:** every flarepress app. Each serves `web/_headers`.
- **What it does:** on every path, the policy allows only what the page loads: `default-src 'self'`, scripts from self and the Cloudflare Web Analytics beacon, styles from self only (no inline), fonts from self, images from self, data and blob, and `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`. The same file sets Permissions-Policy (microphone for self only, the rest off), Cross-Origin-Opener-Policy, `nosniff`, Referrer-Policy, and `Cache-Control: no-cache`. The dev server (`tools/serve.py`) sends the same headers.
- **Threat:** an outside script runs on the page, or inline code is injected.
- **Commits and files:** a0abcc9 (the beacon is allowed), 9af8fc3 (screen capture for self), 8dd51e8 (fonts served from the app's own origin), 468d901 (the contact address appears in no served or tracked file). File: `web/_headers`.
- **Carry to Isopix:** compare its `web/_headers` line by line. Isopix's line allows `style-src 'self' 'unsafe-inline'`, and it has no `form-action` or `base-uri 'none'`. Tighten only after a check that the page needs no inline style. `just look` reports CSP blocks.
- **Effort:** S.

## 15. Caps on untrusted input

- **Applies to:** any app that takes files or backups from a device. Isopix imports files, so this applies there.
- **What it does:** every input is capped in bytes, count and records, and checked when it enters. Malformed items are dropped and the app says what it left out. Noodle Pads' numbers: a backup at most 300 MB unpacked, 5,000 files, `backup.json` at most 8 MB, one sound at most 80 MB. A chosen sound file must be under 10 MB and 120 s. An avatar is one emoji from a fixed list. The Worker checks the same kinds of limit again: `readBytes` in `worker/http.js` stops reading at the limit even when `Content-Length` lies. The full list is in `docs/guide.md`, "Limits on what comes in".
- **Threat:** backups, uploads and shared lists come from anywhere. One file must not run the device out of memory, or the database out of room.
- **Commits and files:** 2140c42 (the app's caps), 33fb1a1 and 8a3f6b4 (the Worker's caps). Files: the app's import code, `worker/cloud.js` (`LIMITS`), `worker/http.js` (`readBytes`).
- **Carry to Isopix:** pick a cap per format. Read with the cap, count before parsing, and say what was left out. Isopix's `test/imports.test.mjs` and `test/fuzz.test.mjs` are the place to add the checks.
- **Effort:** M.

## 16. Privacy statement kept in step by a test

- **Applies to:** any flarepress app with a privacy policy.
- **What it does:** the statement lives in three places: the shared policy (`docs/privacy-policy.md`), the in-app text (`web/privacy.js`), and `README.md`. `tests/privacy.test.mjs` fails until the three say the same. A change to what the cloud stores or shows changes all three in one commit. The policy's `updated:` date moves when its words change. Its privacy site pulls the text from GitHub, so a push that changes it tells that repo.
- **Threat:** a privacy claim that drifts from the code is a false claim to families.
- **Commits and files:** 702934c (the policy lives in this repo), f620c6d (what the cloud keeps for lists and reports), 25d79f5 (the public profile list), 835330c (the per-address cap). Files: `tests/privacy.test.mjs`, `web/privacy.js`, `docs/privacy-policy.md`, `README.md`.
- **Carry to Isopix:** Isopix already has `test/telemetry.test.mjs`, which checks its note and link. Extend it to the three-way check once Isopix's policy text lives in its repo. Check where that text lives first.
- **Effort:** S.

---

## Smaller things worth carrying

- **Origin check on writes.** `readJson` in `worker/http.js` refuses a body whose `Origin` is not the site's (403) and a body that is not JSON (415), then caps the size. The shared `handleEvents` checks the origin list the same way. S.
- **Keys expire.** A device key unused for 180 days stops working. A profile keeps its 20 most recent keys. A key that was not remembered is deleted after 7 days (`KEY_IDLE_MS`, `SESSION_KEY_MS`; 77d75f7). Only with keys. S to M.
- **No IP stored.** The Worker keeps no address anywhere except the keyed hash in section 8. This matches Isopix's own decision that no IP is read or kept.
- **Report limits keyed by the sender's word.** Problem reports allow 10 a minute per device code, which the client sends. A flood of made-up codes gets past that, but the site-wide day caps still hold: 1,000 routine reports and 1,000 error or silent-tap reports (`worker/reports.js`). Carry the day caps, not the per-device one, unless the code is made by the server.

## Gaps and things to check first

1. **The edge rule is 300 requests per 10 s per IP, block 10 s** (Ben confirmed and deployed it, 2026-10-26). An older TODO line said 100; 300 is the live figure.
2. **`handleEvents` has no rate limit.** `worker/events-worker.js` is flarepress's shared file, vendored into both apps. It checks the origin and the 64 KB size, and nothing else. Its `handleFeedback` takes an optional `limiter`, and `handleEvents` does not. The fix goes in pdxfixit/flarepress first (add the same optional `limiter`), then both apps re-vendor the file with `just events-vendor`. Until then, the edge rule in section 1 is the only flood guard on `/api/events`. Effort M, flarepress.
3. **A device keeps a PIN check it can be guessed against.** A device that remembers a PIN keeps `check`: the PIN's salt and PBKDF2 hash (`web/cloud.js`; `docs/architecture/cloud.md`, "PINs"). A 4-digit PIN has 10,000 values, so anyone with that browser's storage can try them all in a short run. The PIN keeps other people on a shared device out of the app. It does not protect the device's storage. Do not copy this design for a secret that matters.
4. **The rate limit fails open** (section 2). Decide per route.

## Order of work for Isopix

1. Ask Ben, in one line, to add the edge rule on the `isopix.app` zone (section 1). Wrangler cannot do it.
2. Compare `web/_headers` with section 14 and tighten it, after a `just look` check.
3. Copy the names test and its secret pattern (section 11), if Isopix's public text needs it.
4. Extend the telemetry test to the three-way privacy check (section 16).
5. Fix `handleEvents` in flarepress (gap 2), then re-vendor.
6. Only if Isopix gets accounts or a database: sections 3 to 10 and 12 to 13, in that order. Do not start them before the owner asks for accounts.
