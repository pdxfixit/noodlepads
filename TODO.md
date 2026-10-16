---
name: todo
title: Noodle Pads — to do
mode: todo
triggers:
  - "soundboard todo"
  - "what's next on the soundboard"
aliases: [soundboard, noodle-pads]
hide_checked_default: true
created: 2026-09-27
updated: 2026-10-12
---

# Noodle Pads — to do

The one list. **Ben does** is what only Ben can do: tries, decisions, recordings. **Agents do** is agent work, in order. Each section runs quickest first. Rules Ben decided are in `docs/decisions.md`; open questions are in `docs/questions.md`.

## Ben does

- **Delete the old address's DNS record** (1 min): in Cloudflare, open the old address's domain → DNS and delete its `soundboard` record if it is still there (the Worker is gone and the name answers 530). The domain's apex stays. Also, if you like, delete the old address's leftover folder in `~/src/flarepress/` (only wrangler's local `.wrangler/` cache is in it).

- **Check the PIN-reset address reaches you** (2 min): noodlepads.com mail is Google Workspace (MX checked 2026-10-11). Add `pin.reset` as an alias or group in the Admin console unless a catch-all already covers it, then send it a test. The app shows it for PIN resets.


### v1: prove out the interface

- [ ] Attach any real sound clips in chat (5 min) 🔼
  an agent adds them to the kit (`web/boards.json` `kit`, `web/clips/kit/`). The site is public, so no names in them. `docs/guide.md` "How sounds are stored"
- [ ] Listen to the new presets (10 min) 🔼
  open Presets on a phone: 🐵 Animals, 👽 Sci-fi, the new 🤪 Silly ones, and the new drums, notes, chords and bass, plus the sharps and flats (⚙️ Advanced on: Notes, Chords, Bass). Say which to redo or drop (each is a short recipe in `tools/make_placeholders.py`).
- [ ] Record three one-liners and try every voice on them (10 min) 🔼
  on https://noodlepads.com/, tap New sound. Say which voices are funny and which to drop. Listen for a stutter at word endings on Slow, and how crunchy Loud gets at 10.
- [x] Decide: when a row's sound is still playing at its next hit, cut it off or let hits overlap ✅ 2026-10-10
  both: hits cut off with a short fade; Advanced beats adds a per-row Overlap switch.

### Hosting at noodlepads.com

- [x] Retire the feature-use counts and visits: migration 005 applied ✅ 2026-10-16 (Ben). It ran before the runner had harvested `uses` and `visits`, so their 52 and 25 rows (2026-10-14 to 16) are gone; `activity` and `devices` stay in D1 and are still waiting for the runner's first real harvest (`just pull noodlepads` in ~/src/telemetry). `docs/adr/0027-retire-feature-counts-and-visits.md`
- [x] Apply migration 004, country only (`just cloud-migrate --yes`) ✅ 2026-10-16 (checked in D1's `migrations`)
  the live Worker already writes only the country; this drops the city, region, network and ASN columns from the activity log, with what they hold (Ben, 2026-10-16: country only). `docs/adr/0016-player-metrics.md`
- [x] Apply the player-metrics migration (`just cloud-migrate --yes`) ✅ 2026-10-13
- [ ] Re-clone flarepress on the Mac: it is public code now, and the old one is archived as `flarepress-archive` (2 min)
  `mv ~/src/flarepress ~/src/flarepress-archive && git clone https://github.com/pdxfixit/flarepress ~/src/flarepress`. Then `just doctor`. Migration 003 adds `visits` and drops the always-empty `ip_hash` column; events written in the minute between the two are skipped, never failed. `docs/adr/0016-player-metrics.md`
- [x] Move the cloud ids and the logs token to their new names ✅ 2026-10-13
- [x] Pick the address: noodlepads.com ✅ 2026-10-11
- [x] Pick public or family-only: public ✅ 2026-10-10
- [ ] Before real voice clips go into `web/clips/`, remember the site is public: anyone can play them (1 min)

### v2: Android app

- [ ] Decide whether v2 reimplements the voices natively or plays copies rendered ahead of time (5 min) 🔼
  native keeps voices switchable on the phone; pre-rendered is less code. `docs/adr/0001-web-prototype-then-native.md`
- [ ] List what to change from v1 before an agent starts v2 (10 min)
  after trying v1 on phones.

## Agents do

Approved work, in order. Record a request here the moment Ben makes it; delete the line when the work lands (the commit is the record).

- **A welcome for new people** (Ben, 2026-10-16, ADR 0028): Who's playing?, Pick your stage name, one-time tips, hint dots, 🧸 Kids' 👆 hand, then the level-up nudge. Ben picked from the mockups 2026-10-16; an agent is building it.










- **Toward a kid-sized music studio** (Ben, 2026-10-12; north star: ADR 0022). Done: pattern chips, mixer, four tabs, the piano roll, the playlist (ADR 0024). Next: Ben's call.

- **After launch: stop loading backups from before 1.0** (Ben, 2026-10-11, "it will only be this once"): once the testing copies' backups are in, remove `beforeOne` in `web/backup.js` so they are refused again (ADR 0011).

Other work:

- [ ] About 2026-11-16: remove the no-op `POST /api/profiles/:id/uses` route (`takeUses` in `worker/cloud.js`, its route line and `tests/metrics.test.mjs`'s test), and `forget('uses')`/`forget('visits')` in `web/app.js startUsage` if no old copy is left (ADR 0027).

- [ ] Move `skills/noodlepads-logs` to `~/src/skills/noodlepads-logs` and link it (the skills workspace convention); the recurrent routine's leg is now named `noodlepads-logs`, and its state file `~/.local/state/skills/noodlepads-logs.state.json`

### Offered, not approved

Agents suggested these; nothing happens until Ben says yes.

- **Spoken prompts in 🧸 Kids** (a recorded "tap a pad!" for kids who can't read yet; the clip would be public). Ben, 2026-10-16: "Maybe… some of it should just be found by poking. I'm not closed to it."

- **A `just secret <domain> NAME` recipe in flarepress** (10 min): `wrangler secret put` with flarepress's own Keychain auth, so a Worker secret is set the same way every site's D1 is, not by a hand-typed `npx wrangler` line.

