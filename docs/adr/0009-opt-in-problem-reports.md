# 0009. Opt-in problem reports: one route on the site, 14 days in D1, and the telemetry runner's mirror

- **Status:** Accepted; amended 2026-10-26 (on by default)
- **Date:** 2026-10-11, 2026-10-15, 2026-10-16
- **Decided by:** Ben, 2026-10-11: approved the plan in [automatic-logs.md](../design/automatic-logs.md) (an inbox in the cloud, a local SQLite archive kept forever), "it should be part of the recurrent skill, but only running 1/day", and the one-database footprint of [ADR 0002](0002-cloud-profiles-on-one-worker.md); 2026-10-15: "the D1 data to be pruned frequently" (14 days); 2026-10-16: "i want consistent local storage mirror of this data", "the telemetry tooling needs to take this over"

**In short.** A device whose owner turns on 📮 Send problem reports sends its cleaned event log to `POST /api/log` on the site. The Worker cleans it again and keeps it in the site's one D1 database for 14 days. The telemetry runner (pdxfixit/telemetry), which copies every app's data, harvests it daily; `telemetry.py pull` brings it to Ben's Mac as `noodlepads__reports`, and `just logs` reads it there. A weekly `noodlepads-logs` leg files new kinds of error. It costs one table.

## Context

- Bugs on the kids' tablets reach an agent only if someone copies the diagnostics report by hand ([decisions.md](../decisions.md), Diagnostics).
- A report must hold nothing of the kids': no audio, no names, nothing a person typed.
- The site is one Worker and one D1 database on the free plan ([ADR 0002](0002-cloud-profiles-on-one-worker.md)); nothing else may be added.
- Agents, not Ben, are the main readers ("I'll probably never do so manually").

## Decision

- **Per device, on by default.** A Settings switch, on unless someone switches it off; a device switched off stays off (Ben, 2026-10-26: "default problem reports to being on all devices", after a bug only his installed app showed; opt-in, off by default, until then). Backups carry it like every setting (Ben, Q5: "Carry it"); the device code never goes in one.
- **Cleaned twice.** The app keeps only numbers, booleans, values from fixed lists, and two free-text fields (error messages, notices) with every known name blanked and a 200-character cap. The Worker (`worker/clean.js`) applies the same allowlist again, because anyone can POST.
- **One route.** `POST /api/log`: from the site's own Origin, JSON, at most 64 KB. At most 10 a minute from one device code, and 1,000 a day in all (`counters`); since 2026-10-26 a report holding an error or a silent tap counts against 1,000 a day of its own, so routine ones never crowd it out (Ben). The IP is never stored or used.
- **D1 as an inbox.** Table `reports` (`worker/schema.sql`): key `<ISO time>_<device>_<random>`, the device, app version, error count and the cleaned upload, with an expiry 14 days on. Each report that arrives first deletes the expired ones, so no scheduled job is needed.
- **The telemetry runner's mirror, one for every app.** The runner's `noodlepads` job harvests `reports` with flarepress's `tools/harvest.py` (`site/harvest.conf`), and keeps each report for good, with its device code for a year at most (the runner's one-year rule). `telemetry.py pull` copies it to `~/.local/state/telemetry/telemetry.sqlite3`. `tools/logs.py` (`just logs`) only reads that copy, as the views `uploads` and `events`; it never talks to Cloudflare.
- **A recurrent leg.** `noodlepads-logs` digests once a week; each new kind of error becomes one "Agents do" line in `TODO.md`. It copies nothing and never changes code.

## Options turned down

- **Workers KV:** a second product on the account, for what one table does.
- **Analytics Engine:** good for counts, poor for reading one session's story.
- **A rate-limit binding by IP:** another binding, and it uses the IP; a per-device count and a daily cap keep the site inside the free plan without it.
- **A Cron Trigger to delete old reports:** deleting on the next insert does the same with nothing scheduled.
- **This repo's own archive** (`logs.sqlite3`, filled by `just logs --sync`): a second copy with its own rules, outside the runner's one-year rule. Ben wants one mirror for every app.
- **A launchd job** for the digest: Ben wants it in the recurrent routine.
- **Hashing names** instead of dropping them: a family's names are few; a hash of a short first name is found by trying every first name.

## Consequences

- A flood of reports stops at 1,000 a day and costs nothing.
- If no report arrives for a while, expired ones wait for the next delete. A runner missing more than 14 days loses the reports D1 let go.
- The allowlist exists in the app and in the Worker; tests check both against the app's kit, voices, settings and modules. A new logged kind or field needs a rule in both until they share one module.
- Revisit if reports need to be read across devices in real time, or if the app ever sends anything a person typed.
