# 0016. Player metrics: devices, places, activity and feature use, 90 days in D1 and an archive kept forever

- **Status:** Accepted
- **Date:** 2026-10-12
- **Decided by:** Ben, 2026-10-12: "all the metrics we relatively can, so we can try to understand if a player profile is being used from multiple locations, or any other statistic", and the row in [decisions.md](../decisions.md) (Hosting and data)

**In short.** The Worker notes each device that uses a profile, each make, open, pull, push, share and PIN change with where it came from (city, region, country, network, and a keyed hash of the IP), and the feature-use counts each device sends. D1 keeps 90 days. `just cloud-stats` copies it all into a SQLite archive on Ben's Mac, kept forever, and reports per player, flagging one seen from more than one place.

## Context

- Ben wants to know whether a profile is used from several places (a profile shared outside the family, or a PIN guessed), and how the app is used.
- The site is one Worker and one D1 database on the free plan ([ADR 0002](0002-cloud-profiles-on-one-worker.md)). Nothing else may be added.
- The site is public and used by kids. What is kept must be said plainly in "🔓 What's private" (`web/privacy.js`).
- Until now nothing kept an IP or a User-Agent ([ADR 0009](0009-opt-in-problem-reports.md): reports still keep neither).

## Decision

- **A device is a key.** The `keys` row a device holds (its SHA-256) names it in `devices`: first and last seen, syncs (pulls), app version, browser, OS and type (phone, tablet, desktop), and a screen-width bucket. A new PIN gives the device a new key; its row follows. A device that does not tick "Remember on this device" gets a new key, so a new device, each open.
- **What the device says.** Every cloud call carries `X-Noodle-App: v=<version>&w=<bucket>&t=<touch>` (`web/uses.js appMeta`). The Worker keeps each part only if valid.
- **The User-Agent is read, not kept.** `worker/metrics.js parseAgent` turns it into families. An iPad asking for the desktop site is told apart by touch.
- **Places, never the IP.** Each event row (`activity`) has Cloudflare's `request.cf` city, region, country, network name and ASN, and an HMAC-SHA-256 of the IP with the Worker secret `IP_KEY`, cut to 16 hex characters. The same address matches; the code can't be turned back into the address without the secret. No secret: no code, and nothing fails.
- **Events:** make, open, pull, push, share, pin (a new PIN), pin-wrong (a wrong PIN; no device yet).
- **Feature use, counted on the device.** `web/uses.js` counts screens and tools per person (a fixed list, `USES`) in localStorage `uses`, mostly from the event log the app keeps already. The person's next sync sends them (`POST /api/profiles/:id/uses`); the Worker checks every name and count and adds them to the day's row in `uses`. Counts only, never what was made.
- **90 days.** Opens, makes, pushes, shares and PIN changes delete rows past 90 days, as reports delete theirs: nothing scheduled. Deleting a profile deletes its metrics too.
- **Never in the way.** Metrics run after the answer (`waitUntil`) and every error is caught. While the tables are missing (the migration not run yet), they are skipped without a word, so the deploy and `just cloud-migrate` can come in either order.
- **An archive kept forever.** `just cloud-stats` copies new `activity` rows (by their never-reused id), every `devices` and `uses` row, and each player's look into `~/.local/state/noodle-pads/metrics.sqlite3`, beside the reports archive, then reports from it.

## Options turned down

- **Keeping the IP:** the most exact, and the most to protect. City and network answer "is this somewhere else?".
- **A plain SHA-256 of the IP:** anyone with the table could try all 4 billion IPv4 addresses in minutes. The key makes that need the secret too.
- **Keeping the User-Agent:** families are all the report needs.
- **Analytics Engine, or a third-party analytics script:** another product, or another origin in the CSP; and the counts would leave the family's own database.
- **The device code from problem reports as the device:** it never leaves the device except in an opt-in report ([decisions.md](../decisions.md)).
- **Counting every DJ key or beat pill:** too many writes for what it tells.

## Consequences

- Each sync writes about two more rows (the device and the event): well inside the free plan's daily writes.
- Someone with both the database and `IP_KEY` could still find an IPv4 address by trying them all. The secret lives only in Cloudflare. Changing it makes old and new codes stop matching.
- A device that does not remember its profile shows as many devices; places and IP codes still tie them together.
- "🔓 What's private" says what is kept; `tests/privacy.test.mjs` ties the 90 days and "the address itself is not kept" to the code.
- Revisit if the app gets accounts, or if a metric is wanted that needs anything a person typed.
