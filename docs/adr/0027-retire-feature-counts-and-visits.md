# 0027. Retire the feature-use counts and visit summaries; keep devices and activity

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** Ben, 2026-10-16: "Go with option B (retire uses and visits, keep activity and devices). Add the app side for G2 and G3 in commit 1, leave the no-op /uses route four weeks, and build commit 1." Rows in [decisions.md](../decisions.md) (Hosting and data).

**In short.** The shared usage events ([ADR 0026](0026-telemetry-standard.md)) were seen live on 2026-10-16, so the older counters they cover go: the per-profile feature-use counts (`uses`) and the visit summaries (`visits`), with the code that counted and sent them (`web/uses.js`, `web/visits.js`) and the D1 tables (migration 005). `devices` and `activity` stay, because they alone say whether one profile is used from several devices or places, and whether someone is guessing a PIN.

## Context

- ADR 0026 left the older metrics flowing beside the events "until the events are seen live; then they can go". The telemetry runner's `noodlepads_events` job read them on 2026-10-16 (54 daily rows).
- The counters answered two kinds of question. App questions (which screens, tools and dialogs; how long a visit lasts; load time; errors) are answered for every device, in the cloud or not, by `screen.view`, `dialog.open`, `control.use`, `content.*`, `app.background`, `perf.load` and `error`. Profile questions (is a profile used from several devices or countries; a wrong PIN; how often a profile syncs) cannot be answered by the standard: its player is a random per-device code, never a profile, and its record has no country.

## Decision

- **Retired:** `uses` and `visits`, both D1 tables (migration `005-drop-uses-visits.sql`), the client code that counted and sent them, the Worker code that checked and stored them, and the `uses` and `visits` parts of `just cloud-stats`. `site/harvest.conf` stops copying them in a second commit, after the runner has harvested what D1 still holds and Ben has applied 005.
- **Kept:** `devices` and `activity` (country only, 14 days and 90), `players` (a profile's id and created time) and the problem reports. The `X-Noodle-App` header stays (`web/device-meta.js`), and so does the `sendUsage` gate on it.
- **The old `POST /api/profiles/:id/uses` route** answers 200 and stores nothing for four weeks (until about 2026-11-16), so a device still on an older copy drops what it holds instead of retrying. It then goes.
- **Left in a device's storage** by older copies (`uses`, `visits` in localStorage) is removed once at start.
- **What the events now carry in their place.** `perf.latency` (the sound's delay, once a visit) and `noodlepads.play` (pads, keys, roll notes, song blocks and Kids pads played in a visit, one count each, sent as the page hides) are new; a sound recorded, sounds chopped and a voice rendered are `content.finish`; a PIN the cloud refuses is `noodlepads.cloud` with action `pin-wrong`. The three new event names are not in the shared `events.toml` yet (asked for): the runner stores and counts an event it does not list.
- **Not carried over (asked for in `events.toml`):** the visit's `level` and the device's browser family on `app.open`, and a per-screen count in `screen.view`'s daily summary.

## Options turned down

- **Retire all four counters.** Less to keep, but nothing else answers the profile questions above, and both tables are small (333 activity rows in two days).
- **Keep every counter beside the events.** Two sets of numbers for one question, and the per-profile counts sat outside the switch's spirit: the shared policy describes the events, not these.
- **Put the profile id in the events.** It would answer the profile questions, and break the rule that the player is never a profile ([ADR 0026](0026-telemetry-standard.md)).

## Consequences

- Migration 005 is applied by Ben, only after this commit's Worker is live and the runner has harvested `uses` and `visits` once more (D1 holds 52 and 25 rows, all from 2026-10-14 on). Applying it first would make the older Worker's sweep fail, which shares a batch with the `activity` insert.
- Stopping the writes also stops the 14-day sweep for those two tables: what has not been harvested waits in D1 until 005 drops it, instead of running down.
- Until 005, deleting a profile still deletes its old `uses` and `visits` rows (in a call of its own in `worker/metrics.js`, removed in the commit after 005).
- The shared privacy policy (https://privacy.pdxfixit.com/noodlepads/) lists what Noodle Pads keeps; its owner drops the lines on feature-use counts and visit summaries.
- Revisit if a profile-level question is wanted that `devices` and `activity` cannot answer.
