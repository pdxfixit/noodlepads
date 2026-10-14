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

- **Check [old address removed] reaches you** (2 min): noodlepads.com mail is Google Workspace (MX checked 2026-10-11). Add `pin.reset` as an alias or group in the Admin console unless a catch-all already covers it, then send it a test. The app shows it for PIN resets.


### v1: prove out the interface

- [ ] Attach any real sound clips in chat (5 min) 🔼
  an agent adds them to the kit (`web/boards.json` `kit`, `web/clips/kit/`). The site is public, so no names in them. `docs/guide.md` "How sounds are stored"
- [ ] Listen to the new presets (10 min) 🔼
  open Presets on a phone: 🐵 Animals, 👽 Sci-fi, the new 🤪 Silly ones, and the new drums, notes, chords and bass, plus the sharps and flats (⚙️ Advanced on: Notes, Chords, Bass). Say which to redo or drop (each is a short recipe in `tools/make_placeholders.py`).
- [ ] Record three one-liners and try every voice on them (10 min) 🔼
  on https://noodlepads.com/, tap New sound. Say which voices are funny and which to drop. Listen for a stutter at word endings on Slow, and how crunchy Loud gets at 10.
- [ ] Make a beat in 🥁 Beats with three sounds and play it on a phone (5 min) 🔼
  note anything that feels off: the pinned Play bar, the row buttons, the sound chooser.
- [ ] Try the four tabs and Beats' ⌨️ Keys on a phone (5 min) 🔼
  tap 🔊 Pads, 🥁 Beats, 🎼 Song, 🎤 Live and ⏹️ at 320 px wide; on Beats tap ⌨️ in the beat bar and back. Say if ⌨️ is easy to find, and what feels off (the agents' smaller calls are in the old cards Q58 and Q59: `git show 16b7111^:docs/questions.md`).
- [ ] Try the tempo, growing bars and tap tempo with ⌨️ Keys on a phone (5 min) 🔼
  in 🥁 Beats with ⌨️ Keys on, 🆕 New, ● Record: keep playing into bar 1 and it grows to 2 bars, then 4; rest a bar and it goes round. Change the tempo mid-take. Tap ⏲️ Click track three times in time. Say if growing feels fair at 80 and 140 BPM, and if tap tempo lands where you expect.
- [ ] Try 🎹 the piano roll on a phone, and listen (5 min) 🔼
  in 🥁 Beats tap 🎹 Add a tune: tap squares, drag a note longer, tap one away, ⌃ ⌄ and a swipe, ♯ All notes, ▶ Play. Load 💃 House and listen to its bass (one tune row now). Say what feels off (the agents' smaller calls are in the old cards Q80 and Q81: `git show 16b7111^:docs/questions.md`).
- [ ] Try ✏️ Edit keys on a phone and a laptop (5 min)
  on 🎤 Live tap ✏️ Edit keys: load 🚀 Space band, then ⭐ My keys; pick two sounds and tap a key; hold a sound and drag it onto a key; drag a key off the board; ⭐ Save this layout. Say if the hold before a drag feels too long or short (280 ms now).
- [ ] Try the wave editor on a phone (5 min)
  Advanced on, record "hello there", ✂️ Trim and edit → 👆 Select part around "there": 🔄 Backwards, 🔊 Louder, 🔇 Silence it, ↩️ Undo; 📐 Fades: drag one in. Listen for clicks at the part's edges.
- [x] Decide: when a row's sound is still playing at its next hit, cut it off or let hits overlap ✅ 2026-10-10
  both: hits cut off with a short fade; Advanced beats adds a per-row Overlap switch.
- [ ] Hand a phone to a kid with https://noodlepads.com/ open and watch what they tap (15 min) 🔼

### Hosting at noodlepads.com

- [x] Apply the player-metrics migration (`just cloud-migrate --yes`) ✅ 2026-10-13
- [ ] Set the Worker secret `IP_KEY` for the scrambled IP codes (2 min) 🔼
  `cd ~/src/flarepress/noodlepads.com && openssl rand -hex 32 | npx wrangler secret put IP_KEY` (nobody sees the key; it stays through deploys). Until then the metrics keep everything but that code. Don't change it later: old and new codes stop matching. `docs/deploy-cloudflare.md`
- [x] Move the cloud ids and the logs token to their new names ✅ 2026-10-13
- [x] Pick the address: noodlepads.com ✅ 2026-10-11
- [x] Pick public or family-only: public ✅ 2026-10-10
- [ ] Open https://noodlepads.com/ on a tablet, record a sound, play a beat (5 min) 🔼
  first real test of recording off-localhost. `docs/deploy-cloudflare.md`
- [ ] Save a backup on two devices, load both on a third, and check nothing doubled (5 min)
  ⚙️ Settings → 📂 Load a backup. The notice says what came; loading one again should say "Nothing new".
- [ ] Before real voice clips go into `web/clips/`, remember the site is public: anyone can play them (1 min)

### v2: Android app

- [ ] Decide whether v2 reimplements the voices natively or plays copies rendered ahead of time (5 min) 🔼
  native keeps voices switchable on the phone; pre-rendered is less code. `docs/adr/0001-web-prototype-then-native.md`
- [ ] List what to change from v1 before an agent starts v2 (10 min)
  after the phone test above.

## Agents do

Approved work, in order. Record a request here the moment Ben makes it; delete the line when the work lands (the commit is the record).








- **Toward a kid-sized music studio** (Ben, 2026-10-12; north star: ADR 0022). Done: pattern chips, mixer, four tabs, the piano roll, the playlist (ADR 0024). Next: Ben's call.

- **After launch: stop loading backups from before 1.0** (Ben, 2026-10-11, "it will only be this once"): once the testing copies' backups are in, remove `beforeOne` in `web/backup.js` so they are refused again (ADR 0011).

Other work:

- [ ] Move `skills/noodlepads-logs` to `~/src/skills/noodlepads-logs` and link it (the skills workspace convention); the recurrent routine's leg is now named `noodlepads-logs`, and its state file `~/.local/state/skills/noodlepads-logs.state.json`

### Offered, not approved

Agents suggested these; nothing happens until Ben says yes.

- **A `just secret <domain> NAME` recipe in flarepress** (10 min): `wrangler secret put` with flarepress's own Keychain auth, so a Worker secret (like `IP_KEY`) is set the same way every site's D1 is, not by a hand-typed `npx wrangler` line.

