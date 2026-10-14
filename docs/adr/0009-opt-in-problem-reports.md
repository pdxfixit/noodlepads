# 0009. Opt-in problem reports: one route on the site, 30 days in D1, and a local archive

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Ben, 2026-10-11: approved the plan in [automatic-logs.md](../design/automatic-logs.md) (a 30-day inbox, a local SQLite archive kept forever), "it should be part of the recurrent skill, but only running 1/day", and the one-database footprint of [ADR 0002](0002-cloud-profiles-on-one-worker.md)

**In short.** A device whose owner turns on 📮 Send problem reports sends its cleaned event log to `POST /api/log` on the site. The Worker cleans it again and keeps it in the site's one D1 database for 30 days; a daily `noodle-logs` leg of Ben's recurrent routine copies it into a SQLite archive on his Mac, kept forever. It costs one table and a read-only API token.

## Context

- Bugs on the kids' tablets reach an agent only if someone copies the diagnostics report by hand ([decisions.md](../decisions.md), Diagnostics).
- A report must hold nothing of the kids': no audio, no names, nothing a person typed.
- The site is one Worker and one D1 database on the free plan ([ADR 0002](0002-cloud-profiles-on-one-worker.md)); nothing else may be added.
- Agents, not Ben, are the main readers ("I'll probably never do so manually").

## Decision

- **Opt-in, per device.** A Settings switch, off by default. Backups carry it like every setting (Ben, Q5: "Carry it"); the device code never goes in one.
- **Cleaned twice.** The app keeps only numbers, booleans, values from fixed lists, and two free-text fields (error messages, notices) with every known name blanked and a 200-character cap. The Worker (`worker/clean.js`) applies the same allowlist again, because anyone can POST.
- **One route.** `POST /api/log`: from the site's own Origin, JSON, at most 64 KB. At most 10 a minute from one device code, and 1,000 a day in all (`counters`). The IP is never stored or used.
- **D1 as an inbox.** Table `reports` (`worker/schema.sql`): key `<ISO time>_<device>_<random>`, the device, app version, error count and the cleaned upload, with an expiry 30 days on. Each report that arrives first deletes the expired ones, so no scheduled job is needed.
- **A local archive, kept forever.** `tools/logs.py` (`just logs`) copies new reports into `~/.local/state/noodle-pads/logs.sqlite3` (`uploads` and `events` tables) through D1's query API, with a read-only token from the Keychain, and reads it with SQL.
- **A recurrent leg.** `noodle-logs` syncs once a day and digests once a week; each new kind of error becomes one "Agents do" line in `TODO.md`. It never changes code.

## Options turned down

- **Workers KV:** a second product on the account, for what one table does.
- **Analytics Engine:** good for counts, poor for reading one session's story.
- **A rate-limit binding by IP:** another binding, and it uses the IP; a per-device count and a daily cap keep the site inside the free plan without it.
- **A Cron Trigger to delete old reports:** deleting on the next insert does the same with nothing scheduled.
- **A launchd job** for the sync: Ben wants it in the recurrent routine, once a day.
- **Hashing names** instead of dropping them: a family's names are few; a hash of a short first name is found by trying every first name.

## Consequences

- A flood of reports stops at 1,000 a day and costs nothing.
- If no report arrives for a while, expired ones wait for the next; the archive skips anything past its expiry.
- The allowlist exists in the app and in the Worker; tests check both against the app's kit, voices, settings and modules. A new logged kind or field needs a rule in both until they share one module.
- Revisit if reports need to be read across devices in real time, or if the app ever sends anything a person typed.
