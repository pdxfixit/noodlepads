# 0016. Player metrics: devices, places, activity, feature use and visits, 14 days in D1 and an archive kept forever

- **Status:** Accepted
- **Date:** 2026-10-12, 2026-10-15
- **Decided by:** Ben, 2026-10-12: "all the metrics we relatively can, so we can try to understand if a player profile is being used from multiple locations, or any other statistic"; 2026-10-15: "add a bunch of telemetry … store it in D1, and harvest it back to an sqlite db", for people in the cloud only, "strip out what's not really needed. I want the local data to keep forever, but the D1 data to be pruned frequently", and a shared flarepress harvest tool. Rows in [decisions.md](../decisions.md) (Hosting and data).

**In short.** For people in the cloud, the Worker notes each device that uses a profile, each make, open, pull, push, share and PIN change with where it came from (city, region, country, network), the feature-use counts each device sends, and a short summary of each visit. D1 keeps events, counts and visits 14 days and a device's row 90. flarepress's `just harvest` copies it all, with Cloudflare's own stats for the site, into a SQLite archive on Ben's Mac, kept forever: at the start of every deploy, daily from the `noodlepads-logs` leg, and before `just cloud-stats` reports per player.

## Context

- Ben wants to know whether a profile is used from several places (a profile shared outside the family, or a PIN guessed), and how the app is used, to steer what gets built next.
- The site is one Worker and one D1 database on the free plan ([ADR 0002](0002-cloud-profiles-on-one-worker.md)). Nothing else may be added.
- The site is public and used by kids. What is kept must be said plainly in "🔓 What's private" (`web/privacy.js`).
- Isopix collects telemetry the same way; the harvest is one tool in flarepress for both.

## Decision

- **Only people in the cloud send anything.** Everything below rides on the cloud calls a person in the cloud already makes. Someone set 📴 Offline, or who has made nothing yet, sends nothing; Cloudflare's own request totals for the site are the only view of them.
- **A device is a key.** The `keys` row a device holds (its SHA-256) names it in `devices`: first and last seen, syncs (pulls), app version, browser, OS and type (phone, tablet, desktop), and a screen-width bucket. A new PIN gives the device a new key; its row follows. A device that does not tick "Remember on this device" gets a new key, so a new device, each open.
- **What the device says.** Every cloud call carries `X-Noodle-App: v=<version>&w=<bucket>&t=<touch>` (`web/uses.js appMeta`). The Worker keeps each part only if valid.
- **The User-Agent is read, not kept.** `worker/metrics.js parseAgent` turns it into families. An iPad asking for the desktop site is told apart by touch.
- **Places, nothing of the IP.** Each event row (`activity`) has Cloudflare's `request.cf` city, region, country, network name and ASN. City and network are what answer "is this somewhere else?".
- **Events:** make, open, pull, push, share, pin (a new PIN), pin-wrong (a wrong PIN; no device yet).
- **Feature use, counted on the device.** `web/uses.js` counts screens, tools and every dialog opened, per person (a fixed list, `USES`, about 75 names), in localStorage `uses`, mostly from the event log the app keeps already and from `dialogs.js openDialog`. The person's next sync sends them (`POST /api/profiles/:id/uses`); the Worker checks every name and count and adds them to the day's row in `uses`. Counts only, never what was made.
- **Visits.** `web/visits.js` keeps one summary per visit (the page in view, from showing to hiding): when, seconds in view, the screens shown, the level, the page's load time, the sound's delay, and errors as `file.js:line` with counts. Never a message, a name or anything typed. They wait in localStorage `visits` and go up in the same call as the counts; the Worker checks each as the app does, drops a bad one, and stores the rest in `visits`.
- **14 days in D1, a device 90.** Opens, makes, pushes, shares and PIN changes delete events, counts and visits past 14 days, and devices not seen in 90, as reports delete theirs: nothing scheduled. A device's row keeps its first-seen and sync count, which a 14-day cut would reset each time a device came back. Deleting a profile deletes its metrics too.
- **Never in the way.** Metrics run after the answer (`waitUntil`) and every error is caught. While the tables are missing (a migration not run yet), they are skipped without a word, so the deploy and `just cloud-migrate` can come in either order.
- **An archive kept forever, filled by one shared tool.** flarepress's `just harvest noodlepads.com` (configured by `noodlepads.com/harvest.conf`) copies new `activity` and `visits` rows by their never-reused ids, every `devices` row (the earliest first-seen wins) and day count (the biggest wins), each player's name, avatar and created time (never the PIN hash), and Cloudflare's daily request, country, status, browser and Worker stats into `~/.local/state/noodlepads/metrics.sqlite3`. This repo's `just harvest` runs it and then `just logs --sync`. `just cloud-stats` reports from the archive.
- **When it harvests.** Daily, from the telemetry runner (pdxfixit/telemetry), the only harvester since 2026-10-15 (Ben): flarepress's `tools/harvest.py` on `site/` in a cloud container, with its own read-only token; the Mac reads its store with `telemetry.py pull`. Deploys, `just cloud-stats` and the `noodlepads-logs` leg no longer harvest. Cloudflare keeps its stats at least 31 days on the free plan (2026-10-02) and D1 keeps 14, so a daily run leaves room for a missed week.

## Options turned down

- **An anonymous beacon from every visitor:** Ben chose people in the cloud only.
- **Keeping the IP, or a keyed hash of it:** the most exact, and the most to protect. City and network answer the question; the hash was never filled (its secret was never set), so dropping it lost nothing.
- **Keeping the User-Agent:** families are all the report needs.
- **Analytics Engine, Cloudflare Web Analytics, or a third-party script:** another product, another origin in the CSP, and a view of visitors who are not in the cloud.
- **A Worker cron copying Cloudflare's stats into D1:** a daily harvest from the Mac reaches back a month, and the Worker would need an analytics token.
- **The device code from problem reports as the device:** it never leaves the device except in an opt-in report ([decisions.md](../decisions.md)).
- **Counting every DJ key or beat pill:** too many writes for what it tells.

## Consequences

- Each sync writes about two more rows (the device and the event), plus one per finished visit: well inside the free plan's daily writes.
- A device that does not remember its profile shows as many devices; places still tie them together.
- A harvest missed for more than 14 days loses events, counts and visits that D1 has let go. The `noodlepads-logs` leg warns after 3 days without one.
- The harvest token (Keychain `noodlepads-logs`) needs D1 Read, Zone → Analytics: Read and Account → Account Analytics: Read.
- "🔓 What's private" says what is kept; `tests/privacy.test.mjs` ties the 14 and 90 days and "the internet address is not kept" to the code.
- Revisit if the app gets accounts, or if a metric is wanted that needs anything a person typed.
