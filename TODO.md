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
updated: 2026-10-28
---

# Noodle Pads — to do

The one list. **Ben does** is what only Ben can do: tries, decisions, recordings. **Agents do** is agent work, in order. Each section runs quickest first. Rules Ben decided are in `docs/decisions.md`; open questions are in `docs/questions.md`.

## Ben does

- **Add the new cloud events to the telemetry runner** (2 min, on the Mac): in `../telemetry/events.toml` (the pdxfixit/telemetry repo beside this checkout) add `up` and `leave` under `noodlepads.cloud` (what `web/track-page.js` now sends in place of `put` and `offline`), then run `just test` in the main checkout, since `tests/telemetry.test.mjs` checks it only there.

- **Listen to the 10 new voice clips** (CC0 or CC BY): the 8 callouts, the Evil laugh and the Cackle (2026-10-27). Then a family member records the last six, which are still macOS `say` voices and may not be ours to share: "Oh yeah!", "Bruh.", "Nice!", "G G!", "Drop the beat!" and "Boom!" (list in `web/clips/kit/LICENSE-samples.txt`). Attach each in a chat; each file is one short clip, no names in it.

- **Isopix: set its name hashes** (in the isopix repo, TODO "The owner does"): run `just names-secret`, then `gh secret set ISOPIX_NAME_HASHES`.

- **Isopix: approve the history rewrite** (in the isopix repo): it is ready and verified; say yes and the force-push goes.

- **Cloud session setup**: add `f=/home/user/noodlepads/tools/cloud_setup.sh; [ -f "$f" ] && bash "$f" || true` to the cloud environment's setup script, or add a .claude SessionStart hook (`tools/cloud_setup.sh`, 6fadfb8).

- **Telemetry: land the branch `land/noodlepads-cloud-actions`** from a session with `gh`.

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



- **Toward a kid-sized music studio** (Ben, 2026-10-12; north star: ADR 0022). Done: pattern chips, mixer, four tabs, the piano roll, the playlist (ADR 0024), ✏️ on a song block into Beats with ↩ Back to song (2026-10-28).

Other work:

- [ ] About 2026-11-16: remove the no-op `POST /api/profiles/:id/uses` route (`takeUses` in `worker/cloud.js`, its route line and `tests/metrics.test.mjs`'s test), and `forget('uses')`/`forget('visits')` in `web/app.js startUsage` if no old copy is left (ADR 0027).

- [ ] Move `skills/noodlepads-logs` to `~/src/skills/noodlepads-logs` and link it (the skills workspace convention); the recurrent routine's leg is now named `noodlepads-logs`, and its state file `~/.local/state/skills/noodlepads-logs.state.json`

- **Council round 1, fixes in flight** (2026-10-26): Kids' keyboard and sum; Live take Undo and audio clock, iOS silent switch, context resume, late pills; sync re-uploads edited audio and splits pushes by bytes; shares deleted with a profile; deploy.yml version checks, stale deploy docs. Delete this line when they land.
- **Apple voices out** (Ben, 2026-10-26), once Ben's recordings or another CC0 voice set arrive ("Ben does"): they replace the 6 Apple-voice clips that `web/clips/kit/LICENSE-samples.txt` lists (`tools/make_placeholders.py` `KIT_CALLOUTS`: oh-yeah, bruh, nice, gg, drop-the-beat, boom-word), and that file's Apple section goes. A CC0 voice that says the same words is better than a near word: no GitHub set searched on 2026-10-27 had "Oh yeah", "Nice", "Boom" or "Drop the beat" (Kenney's Voiceover Pack and Google's Speech Commands gave the other eight).
- **Council round 1, next fixes** (each one approved by Ben, 2026-10-26). Most urgent first:
  1. Sound designer ✏️: add a loudness floor to `tools/test_preset_loudness.py` (8 presets sit 8–10 dB under the middle). (Roar, Heartbeat, Djembe, Djembe slap, Dhol and Dhol tik stay synthesized, decided 2026-10-27: see decisions.md.)

### Offered, not approved

Agents suggested these; nothing happens until Ben says yes.

- **Song's "On the beat" Echo follows tempo marks** (audio seat, 2026-10-27): a Song mix is built at the song's tempo, so an Echo set to a note length keeps that gap after a tempo mark changes the speed.

- **Test files that end by themselves** (offered 2026-10-19, about 60–90 min): the app's test files never exit without `--test-force-exit`, and that flag cuts a parallel run's last reports, here and on GitHub (`ℹ tests` drops below the full count; `just test` prints ⚠️ and runs a cut file again alone). Find what holds them open (`process.getActiveResourcesInfo()` after the last test; a first try at unref-ing the app's timers in `tests/fake-dom.mjs` was not enough), make `installPage` release it, then drop the flag. Saves: a test count you can trust, and no file run twice.
- **Spoken prompts in 🧸 Kids** (a recorded "tap a pad!" for kids who can't read yet; the clip would be public). Ben, 2026-10-16: "Maybe… some of it should just be found by poking. I'm not closed to it."

