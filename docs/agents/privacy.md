# Privacy

What is public, what the privacy disclosure must keep true, and what problem reports send. The rule on kids' names stays in [AGENTS.md](../../AGENTS.md). Moved out of it unchanged.

## Privacy

The site is public. Anyone can load every file under `web/` (at noodlepads.com). Sounds recorded in the app stay in the browser that made them until their person is put in the cloud ([ADR 0002](../adr/0002-cloud-profiles-on-one-worker.md)); then they are stored in D1 and anyone with a sound's link can play it, and the profile list is public. They also leave in a backup someone saves. The disclosure in `web/privacy.js` must stay true: change it in the same commit as any change to what the cloud stores or shows, and change `docs/privacy-policy.md` and README's copy with it (`tests/privacy.test.mjs` fails until the three agree). Bump the policy's `updated:` date when its words change. The test `tests/privacy.test.mjs` keeps the policy well formed (front matter, a real date, no address, the `@include` lines); set `PRIVACY=/path` to check its `@include` lines against the privacy checkout.

📮 Problem reports (on by default since 2026-10-26, per device; one switched off stays off) send the event log to `/api/log`, cleaned by `web/log-clean.js`: no audio, no names. A new `logEvent` kind or field sends nothing until it has a rule in `RULES` there, and `tests/log-clean.test.mjs` fails until it does. Never add a free-text field without `text` (redaction).
