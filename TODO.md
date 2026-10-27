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

- **Add the new cloud events to the telemetry runner** (2 min, on the Mac): in `../telemetry/events.toml` (the pdxfixit/telemetry repo beside this checkout) add `up` and `leave` under `noodlepads.cloud` (what `web/track-page.js` now sends in place of `put` and `offline`), then run `just test` in the main checkout, since `tests/telemetry.test.mjs` checks it only there.

- **Let this repo tell the privacy site when the policy changes** (3 min), after the policy move lands: GitHub → Settings → Developer settings → Fine-grained tokens → new token, owner `pdxfixit`, only repository `pdxfixit/privacy`, repository permission **Contents: Read and write** (the one permission `repository_dispatch` asks for; "Actions: write" is not enough), 1 year. Add it as the secret `PRIVACY_DISPATCH_TOKEN` on `pdxfixit/noodlepads` (Settings → Secrets and variables → Actions). Until then `.github/workflows/privacy-policy.yml` only warns, and the privacy site picks up an edited `docs/privacy-policy.md` at its next deploy. Put a reminder to renew it in a year.

- **Record the spoken callouts** (15 min, when you like): the 14 callouts ("Let's go!", "Level up!" …; list in `web/clips/kit/LICENSE-samples.txt`) and the evil laugh and cackle are macOS `say` voices, which may not be ours to share (Ben, 2026-10-26: replace them). Record your own (no names in them) and attach them in a chat, or say "use a CC0 voice set".

- **Read the mission and make it yours** (2 min): `AGENTS.md` → Mission, drafted from your interview answers (2026-10-26). Reword anything that isn't how you'd say it; the council checks every change against it.


- **Delete the old address's DNS record** (1 min): in Cloudflare, open the old address's domain → DNS and delete its `soundboard` record if it is still there (the Worker is gone and the name answers 530). The domain's apex stays. Also, if you like, delete the old address's leftover folder in `~/src/flarepress/` (only wrangler's local `.wrangler/` cache is in it).

### v1: prove out the interface

- [ ] Attach any real sound clips in chat (5 min) 🔼
  an agent adds them to the kit (`web/boards.json` `kit`, `web/clips/kit/`). The site is public, so no names in them. `docs/guide.md` "How sounds are stored"
- [ ] Listen to the new presets (10 min) 🔼
  open Presets on a phone: 🐵 Animals, 👽 Sci-fi, the new 🤪 Silly ones, and the new drums, notes, chords and bass, plus the sharps and flats (⚙️ Advanced on: Notes, Chords, Bass). Say which to redo or drop (each is a short recipe in `tools/make_placeholders.py`).
- [ ] Record three one-liners and try every voice on them (10 min) 🔼
  on https://noodlepads.com/, tap New sound. Say which voices are funny and which to drop. Listen for a stutter at word endings on Slow, and how crunchy Loud gets at 10.

### Hosting at noodlepads.com

- [ ] Re-clone flarepress on the Mac: it is public code now, and the old one is archived as `flarepress-archive` (2 min)
  `mv ~/src/flarepress ~/src/flarepress-archive && git clone https://github.com/pdxfixit/flarepress ~/src/flarepress`. Then `just doctor`. Migration 003 adds `visits` and drops the always-empty `ip_hash` column; events written in the minute between the two are skipped, never failed. `docs/adr/0016-player-metrics.md`
- [ ] Before real voice clips go into `web/clips/`, remember the site is public: anyone can play them (1 min)

### v2: Android app

- [ ] Decide whether v2 reimplements the voices natively or plays copies rendered ahead of time (5 min) 🔼
  native keeps voices switchable on the phone; pre-rendered is less code. `docs/adr/0001-web-prototype-then-native.md`
- [ ] List what to change from v1 before an agent starts v2 (10 min)
  after trying v1 on phones.

## Agents do

Approved work, in order. Record a request here the moment Ben makes it; delete the line when the work lands (the commit is the record).

- **First, when no other session has this repo open: rewrite git history to remove the old PIN-reset address** (Ben, 2026-10-26; the security seat found it in plain text in the first public commit). Rewriting breaks every clone and worktree, so Ben picks the moment: about ten sessions were open when he asked. Then every checkout re-clones. The app already uses a new address.

- **🎤 Live's control bar: move 🔔 Let it ring into a ⋯ menu, and "almost everything else" with it** (Ben, 2026-10-27, from the Overlap council round: "2, as should almost everything else"). Mockup first (new layout; it replaces `docs/decisions.md` rows 206 and 277, which put 🔔 and ✏️ Layout on the bar), and ask which controls stay (▶ Record and tempo, surely; ⏲️ Click track, ✏️ Layout, 🎬 Takes?). On a phone the bar shows a bare 🔔 today, the one place it has no word. Settled the same day: Let it ring stays off for new rows, no drawn pile icon, no demo sound on tap.


- **More kinds of music** (Ben, 2026-10-17; the goal is both trying many styles and learning how music works). Design review accepted with his answers (`docs/design/more-kinds-of-music.md`; decisions.md: instruments are a picker per person, 6 MB budget, Kids pentatonic, 7 groove groups, the emoji rule's exceptions). The grooves, 🧸 Kids' pentatonic toy keys and instruments' phase 1 are built; next:
  1. Instruments, phase 3 (ADR 0030; the pickers everywhere, 🧸 Kids' instrument button, the grooves' instruments and chips, Soca and Chiptune are built): one ready-made key layout per family in ✏️ Layout's keys.

- **Toward a kid-sized music studio** (Ben, 2026-10-12; north star: ADR 0022). Done: pattern chips, mixer, four tabs, the piano roll, the playlist (ADR 0024). Next: Ben's call.

- **After launch: stop loading backups from before 1.0** (Ben, 2026-10-11, "it will only be this once"): once the testing copies' backups are in, remove `beforeOne` in `web/backup.js` so they are refused again (ADR 0011).

Other work:

- [ ] About 2026-11-16: remove the no-op `POST /api/profiles/:id/uses` route (`takeUses` in `worker/cloud.js`, its route line and `tests/metrics.test.mjs`'s test), and `forget('uses')`/`forget('visits')` in `web/app.js startUsage` if no old copy is left (ADR 0027).

- [ ] Move `skills/noodlepads-logs` to `~/src/skills/noodlepads-logs` and link it (the skills workspace convention); the recurrent routine's leg is now named `noodlepads-logs`, and its state file `~/.local/state/skills/noodlepads-logs.state.json`

- [ ] **One beat engine** (Ben, 2026-10-26: "I would prefer to have one beat engine and just… optional hooks for the kids' side"): 🧸 Kids' `playBeat` plays through `sequencer.js`, with hooks for what Kids leaves out. Design and plan first (`docs/design/one-beat-engine.md`), council on the plan, then Ben's OK before building.
- [ ] **Deduplicate and simplify** (Ben, 2026-10-26; `docs/design/simplify.md`). All approved, after the bug sweep lands, one commit each, council seats as each item names. Safe now: S1 one list of a person's stores, S2 dead code out, S3 exact copies made one (after the name-length fix), S4 one semitone rate and one latency sum, S6 one writer for saved lists (a refused delete of a take or layout shows the notice: decisions.md), S8 test and tool tidy (the `.node-version` file included). Needs care: C1 one table of the stores (with a test that nothing of a deleted person survives), C2 one way to make an own sound, C3 one hold-or-drag press, C4 one microphone recorder (`mic.js`), C5 voice recipes written once, C6 the kept audio built once, C7 one `MAX_NAME` (the cut is the bug sweep's), C8 the Worker reads kit ids from `boards.json`, C9 one `codes.js` for the cloud's codes and PIN hash, C10 one reading of the User-Agent (note the date in state.md), C11 stop storing `row.collapsed`, C12 one quiet-moment check for the nudge and the update bar, C13 split `sheet.js` (after C4), C14 split `dj.js`'s Live takes into `dj-takes.js` (take replay is already on the audio clock: the council round's fix, `021a2f0` and `be48a71`, 2026-10-26; move it as it is). S5 and S7 are steps of the one beat engine's build; C15 (split the beat maker's factory) comes after it.
- [ ] **The privacy site pulls Noodle Pads' policy from this repo** (Ben approved Option A, 2026-10-26; pdxfixit/privacy is attached to cloud sessions on request). The same push lands 📮 problem reports on by default (the tip of branch `ccr-ab0b03fb-uw70o6`: the switch, and a default device sending only after an error or a silent tap; decisions.md), with the policy saying so. After the cloud bug fixes land (they change `web/privacy.js`): move `src/noodlepads/policy.md` here as `docs/privacy-policy.md` with its `@include`s, the privacy build reads it from GitHub, a push here that changes it starts the privacy deploy, and a test keeps `web/privacy.js`, README and the policy in step. The two wordings this sweep changed (the public list's fields, the report's version and visit code) go in with it. Was offered as: **The privacy site pulls Noodle Pads' policy from this repo** (Ben, 2026-10-24: "it would be cool if the privacy repository pulls from our content"; offered, about 60–90 min). Today the policy is `src/noodlepads/policy.md` in `pdxfixit/privacy`, and every app change has to be copied there by hand: on 2026-10-24 its delete steps still named buttons removed on 2026-10-19. Option A (recommended): the text moves here (`docs/privacy-policy.md`, keeping its `@include`s), and the privacy build reads it from GitHub. A push here that changes it starts the privacy deploy (`repository_dispatch`; Ben adds a token with access to that repo as a secret). Option B (about 30 min, no token): the text stays there; CI here clones the public privacy repo, and a test fails when its steps name a button the app no longer has.
- [ ] **Bugs found while mapping docs/architecture/ (2026-10-26).** Each: write the failing test first, then fix, then update the area file's Seams or gotchas. ✔ = confirmed in the code; the rest are likely.
  - 🧸 Kids' tune row ignores 🎵 Find its note's root, accents and row speed (keys-kids.md).

- **One quiet rule for no storage** (the data seat's ask, 2026-10-27): with no storage at all, `persist`, `setOverride`, `setPersonEdit`, `deleteUserClip` and `deleteMyVoice` stay quiet as `removeRecord` does (one `noStorage()` helper in `web/state.js`), so a save can't push an ↩️ Undo off; `deleteUserClip` and `deleteMyVoice` go through `removeRecord`.
- **Council round 1, fixes in flight** (2026-10-26): Kids keyboard/tune/mic/sum; Live take Undo and audio clock, iOS silent switch, context resume, late pills; sync re-uploads edited audio and splits pushes by bytes; Worker caps, the PIN race, keys, shares deleted with a profile; `just test` fails on cut tests, deploy.yml version checks, the no-names self-test, stale deploy docs. Delete this line when they land.
- **Apple voices out** (Ben, 2026-10-26), once Ben's recordings or a CC0 set arrive ("Ben does"): they replace the 16 Apple-voice clips that `web/clips/kit/LICENSE-samples.txt` lists, `tools/make_placeholders.py` stops making them (`KIT_CALLOUTS`, `cackle`), and that file's Apple section goes.
- **⬇️ Save as audio file** (Ben approved the mockup, 2026-10-26; `docs/design/save-audio.md`, its "Ben's answers"): build after the bug sweep's beats+song branch lands. Its three buttons share one row.
- **New profiles per IP** (Ben, 2026-10-26; decisions.md, Hosting and data): 3 a UTC day per IP and 50 site-wide (up from 10). The Worker keeps the IP only as HMAC(ip, a secret that changes each UTC day, e.g. derived from a Worker secret and the date) in `counters` for that day; old days' rows go. Never logged. web/privacy.js says so in one line (and the shared policy). Starts once the Worker limits branch lands (same file).
- **A handoff brief for an Isopix agent** (Ben, 2026-10-26: "carry over a lot of the security features we've implemented here"), written once the Worker limits and the per-IP profile cap land: `docs/design/security-carryover.md`, each feature with its noodlepads commit, why, and where it applies (any flarepress app, cloud-profile apps only, or a fix that belongs in flarepress itself, e.g. the events route's missing rate limit). Ben starts the Isopix agent with it.

- **Council round 1, next fixes** (each one approved by Ben, 2026-10-26). Most urgent first:
  1. Sound designer ⛔: about 20 real-world presets are still synthesized (Quack, Roar, Airhorn, Burp, Heartbeat, Djembe, Dhol…, `tools/make_placeholders.py` KIT) against decisions.md's recordings rule. Source CC0 recordings (Freesound, Kenney, VCSL), animals first; add a loudness floor to `tools/test_preset_loudness.py` (8 presets sit 8–10 dB under the middle).
  2. Mission keeper: show the scratch beat in 🎼 Song's strip so a goofed-on beat goes on a lane without 💾 Keep; drop the groove card's creative prompt ("Can you hum a tune over them?").
  3. Storage and sync: a sync's change to the open beat is undone by the next pill tap while it plays (web/sequencer.js ~734); `cleanPrefs` drops `changed`; an older copy of the app strips newer fields from the cloud (keep unknown fields, or refuse pushes from an older app); `navigator.storage.persist()`.
  5. Reliability and browser compat: a classic boot script that reloads once when modules from two versions meet; the service worker installs the app first and the clips after; the daily live check reaches D1; deploy checks call /api/log, /api/events, /api/feedback.
  6. Performance: load the open groups' sounds first and the rest when idle; keep one decoded copy; `drawPlayhead` and `meter.run` without layout thrash; looping pulses on opacity/transform.
  7. Pre-reader and child psychologist: no picture used twice on a Kids screen (a test across tabs, pads, drums, voices, skins); ▶️ page arrows become 👉/👈; ⏹️ set apart from the tabs; a Kids visit no longer changes the grown-up's pad size, skin, instrument or scratch beat.
  8. Accessibility: a slow tap no longer turns into a loop by accident (hold time as a setting); a Loop action without a hold; `aria-pressed` on looping pads; flash rate capped.
  9. Audio engineer and sound designer: a soft clip after the limiter; 2–3 ms edge fades on recordings; seed the reverb noise; voice extremes that a phone can play.
  10. Producer: Seven, Motown, Bossa and Salsa texts match their patterns; dB-like fader taper; a 6/8 or 3/4 beat in Song rounds to whole song bars.
  11. Kids UX: 🧸 Kids fits a phone held sideways; `just look --landscape`; the tap-size check covers links, text fields and `[tabindex]`.
  12. Privacy text: web/privacy.js says what the cloud's player metrics keep (per profile, with a device hash and country, up to a year) and that the Cloudflare beacon runs; the mission no longer says "anonymous" (Ben, 2026-10-26).
  13. Docs: CHANGELOG catches up with 1.0.280; README, guide and the manifest say the mission's words; ADRs 0018, 0021, 0029 marked built; state.md back to present tense.

### Offered, not approved

Agents suggested these; nothing happens until Ben says yes.

- **Test files that end by themselves** (offered 2026-10-19, about 60–90 min): the app's test files never exit without `--test-force-exit`, and that flag cuts a parallel run's last reports, here and on GitHub (`ℹ tests` drops below the full count; `just test` prints ⚠️ and runs a cut file again alone). Find what holds them open (`process.getActiveResourcesInfo()` after the last test; a first try at unref-ing the app's timers in `tests/fake-dom.mjs` was not enough), make `installPage` release it, then drop the flag. Saves: a test count you can trust, and no file run twice.
- **Spoken prompts in 🧸 Kids** (a recorded "tap a pad!" for kids who can't read yet; the clip would be public). Ben, 2026-10-16: "Maybe… some of it should just be found by poking. I'm not closed to it."

