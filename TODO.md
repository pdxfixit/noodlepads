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

- **Read the mission and make it yours** (2 min): `AGENTS.md` → Mission, drafted from your interview answers (2026-10-26). Reword anything that isn't how you'd say it; the council checks every change against it.

- **Delete the old address's DNS record** (1 min): in Cloudflare, open the old address's domain → DNS and delete its `soundboard` record if it is still there (the Worker is gone and the name answers 530). The domain's apex stays. Also, if you like, delete the old address's leftover folder in `~/src/flarepress/` (only wrangler's local `.wrangler/` cache is in it).




### v1: prove out the interface

- [ ] Attach any real sound clips in chat (5 min) 🔼
  an agent adds them to the kit (`web/boards.json` `kit`, `web/clips/kit/`). The site is public, so no names in them. `docs/guide.md` "How sounds are stored"
- [ ] Listen to the new presets (10 min) 🔼
  open Presets on a phone: 🐵 Animals, 👽 Sci-fi, the new 🤪 Silly ones, and the new drums, notes, chords and bass, plus the sharps and flats (⚙️ Advanced on: Notes, Chords, Bass). Say which to redo or drop (each is a short recipe in `tools/make_placeholders.py`).
- [ ] Decide: 🧸 Kids' beat drums keep 🎩 Hi-hat, or swap it for a drum whose picture matches its sound (🧂 Shaker, 🔔 Ride) (2 min)
  the Kids pads now show only sounds whose picture says what they are (2026-10-22), but the beat's four drums are still kick 🦶, snare 🥁, hi-hat 🎩, clap 👏: the hat is a pun a five-year-old won't get. Swapping changes `KIDS_DRUMS` (kids-logic.js); an old beat's hi-hat row would stay in the regular app and leave the Kids grid.
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

- **☁️ Open from the cloud shows its progress** (Ben, 2026-10-26): today a tap shows only "Opening…" and the list stays live, so a kid taps again. While a person comes down, the list goes modal (nothing else to tap) and a real progress bar says how far it has got, never one that jumps 0 to 100; where nothing can be measured, a spinner. Mockup: https://claude.ai/artifact/BYxQxnwjXQY1PAoDmL7pZF; the council passed it with changes (no blocks). Ben's answers (2026-10-26): locked with no way out, but 20 s with nothing arriving stops it (Stopped); the bar fills by bytes with "🔊 5 of 12" and "4.1 of 9.8 MB" always; done offers <their avatar> Play as them (closes, switches, lands on Pads, ends the welcome) and ☁️ Open someone else; Stopped offers 🔄 Try again (picks up where it stopped, fetched sounds kept for the visit) and Don't bring them (forgets the link). Council asks: a stall abort on the fetches, a byte cap, totals from the records' `bytes`, the bar throttled to a frame, no motion under reduced motion, `aria-valuetext`, focus moved, the e2e (`tools/look-cloud.mjs`) and `just look` views updated.







- **More kinds of music** (Ben, 2026-10-17; the goal is both trying many styles and learning how music works). Design review accepted with his answers (`docs/design/more-kinds-of-music.md`; decisions.md: instruments are a picker per person, 6 MB budget, Kids pentatonic, 7 groove groups, the emoji rule's exceptions). The grooves, 🧸 Kids' pentatonic toy keys and instruments' phase 1 are built; next:
  1. Instruments, phase 3 (ADR 0030; the pickers everywhere, 🧸 Kids' instrument button, the grooves' instruments and chips, Soca and Chiptune are built): one ready-made key layout per family in ✏️ Layout's keys.










- **Toward a kid-sized music studio** (Ben, 2026-10-12; north star: ADR 0022). Done: pattern chips, mixer, four tabs, the piano roll, the playlist (ADR 0024). Next: Ben's call.

- **After launch: stop loading backups from before 1.0** (Ben, 2026-10-11, "it will only be this once"): once the testing copies' backups are in, remove `beforeOne` in `web/backup.js` so they are refused again (ADR 0011).

Other work:

- [ ] About 2026-11-16: remove the no-op `POST /api/profiles/:id/uses` route (`takeUses` in `worker/cloud.js`, its route line and `tests/metrics.test.mjs`'s test), and `forget('uses')`/`forget('visits')` in `web/app.js startUsage` if no old copy is left (ADR 0027).

- [ ] Move `skills/noodlepads-logs` to `~/src/skills/noodlepads-logs` and link it (the skills workspace convention); the recurrent routine's leg is now named `noodlepads-logs`, and its state file `~/.local/state/skills/noodlepads-logs.state.json`

- [ ] **One beat engine** (Ben, 2026-10-26: "I would prefer to have one beat engine and just… optional hooks for the kids' side"): 🧸 Kids' `playBeat` plays through `sequencer.js`, with hooks for what Kids leaves out. Design and plan first (`docs/design/one-beat-engine.md`), council on the plan, then Ben's OK before building.
- [ ] **Deduplicate and simplify** (Ben, 2026-10-26; `docs/design/simplify.md`). Approved, after the bug sweep lands, one commit each: S1 one list of a person's stores, S2 dead code out, S3 exact copies made one (after the name-length fix), S4 one semitone rate and one latency sum, S6 one writer for saved lists (and a refused delete of a take or layout shows the notice, as beats and songs do: decisions.md), S8 test and tool tidy (the `.node-version` file included). S5 and S7 are steps of the one beat engine's build. The needs-care items (C1–C15) wait on Ben, one at a time.
- [ ] **Bugs found while mapping docs/architecture/ (2026-10-26).** Each: write the failing test first, then fix, then update the area file's Seams or gotchas. ✔ = confirmed in the code; the rest are likely.
  - ✔ `web/feedback.js appVersion` refuses the `-` in a live label (`v1.0.277-b328291`), so feedback from noodlepads.com is tagged `dev` (the Worker's rule likely too).
  - ✔ `tools/look.mjs`: `VIEWS.beat = VIEWS.beats` replaces the `beat` view defined above it, so its 🆕 New script never runs.
  - ✔ Esc runs only `audio.stopAll()` (`app.js bindEvents`), so a playing beat or song keeps going; Help says Esc stops everything.
  - `tools/doctor.sh` compares the live label with a bare sha, so it always warns that main is not live.
  - A `prefs` clash in a sync always takes the cloud's copy: `settings.js cleanPrefs` drops the `changed` stamp (cloud.md).
  - 🗂️ See all's ▶, or making a share, while a beat plays clears the beat maker's loaded sounds (`prepareBeats` → `ready.clear()`), so its rows go quiet until the next ▶ (beats-song.md).
  - Warble and Robot effects (live oscillators) keep running after a song or a groove sample ends (beats-song.md).
  - After 🧸 Kids, the beat maker may hold an old copy of the scratch beat; a pill tapped on Beats before the next screen change could save over the kid's squares (keys-kids.md).
  - A key hit counts as both `pads` and `keys` in `noodlepads.play` (keys-kids.md).
  - 🧸 Kids' tune row ignores 🎵 Find its note's root, accents and row speed (keys-kids.md).
  - Stale docs and comments: AGENTS.md cites a missing `tests/pill-height.test.mjs` and says `just look` flags only short buttons; docs/deploy-cloudflare.md lists the removed `just deploy-migrated`; docs/layout.md's `follow.js`, `overflow.js`, `worker/clean.js` and `tests/` lines; `dialogs.js` says four dialogs (there are 33); `state.js` lists the old `'dj'` screen; `track-page.js errorOf` names a retired `visits` module.

### Offered, not approved

Agents suggested these; nothing happens until Ben says yes.

- **Test files that end by themselves** (offered 2026-10-19, about 60–90 min): the app's test files never exit without `--test-force-exit`, and that flag cuts a parallel run's last reports, here and on GitHub (`ℹ tests` drops below the full count; `just test` prints ⚠️). Find what holds them open (`process.getActiveResourcesInfo()` after the last test; a first try at unref-ing the app's timers in `tests/fake-dom.mjs` was not enough), make `installPage` release it, then drop the flag. Saves: a test count you can trust, and `just test` can fail on a cut run again.
- **The privacy site pulls Noodle Pads' policy from this repo** (Ben, 2026-10-24: "it would be cool if the privacy repository pulls from our content"; offered, about 60–90 min). Today the policy is `src/noodlepads/policy.md` in `pdxfixit/privacy`, and every app change has to be copied there by hand: on 2026-10-24 its delete steps still named buttons removed on 2026-10-19. Option A (recommended): the text moves here (`docs/privacy-policy.md`, keeping its `@include`s), and the privacy build reads it from GitHub. A push here that changes it starts the privacy deploy (`repository_dispatch`; Ben adds a token with access to that repo as a secret). Option B (about 30 min, no token): the text stays there; CI here clones the public privacy repo, and a test fails when its steps name a button the app no longer has.
- **Spoken prompts in 🧸 Kids** (a recorded "tap a pad!" for kids who can't read yet; the clip would be public). Ben, 2026-10-16: "Maybe… some of it should just be found by poking. I'm not closed to it."

