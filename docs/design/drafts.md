# Drafts and Undo: a kept beat or song changes only on 💾 Save

**Status: accepted, to build** (2026-11-04, [ADR 0036](../adr/0036-drafts.md)); council round 1 done. Ben chose A below. Mockup: [drafts-mockup.html](drafts-mockup.html) (open it from a checkout; it loads the app's fonts from `web/fonts/`).

Ben, 2026-11-04: "if there's a user made changes they don't mean to, like say one loads a groove, and they tap around on accident and then try to exit away, that's committing all the changes that they might not want." Then: "I want to be able to have the content saved in the event of a catastrophe … we don't want the saved file altered any more than we want to lose the work in progress." He chose the draft model (A), Save on the way back to 🎼 Song (1), and the same model for Song (1).

## What is wrong today

- The open beat saves itself on every change (`sequencer.js save`), into the kept beat's own record. A stray tap on a beat opened from 🗂️ Beats or a pattern chip changes it for good.
- A tap on a pill has no Undo. Undo exists only for Clear, Remove, a groove loaded, a row's loudness, a mouse delete and ⇆ slides, as one 8 s banner (`offerUndo`).
- A groove loaded over a scratch with hits lost that scratch once its 8 s Undo faded. Fixed on its own (2026-11-04): it is kept first, as 🆕 New keeps it.
- 🎼 Song is the same: a kept song saves on every change; its ↩️ Undo is for the visit.

## The proposal

- **A kept beat opens as itself.** The first change makes its **draft**: a copy that saves on every change, so a crash or a closed tab loses nothing. The kept beat is not touched.
- **💾 Save** writes the draft into the kept beat and drops the draft. It sits where ✏️ is (as 💾 Keep does on the scratch) while a draft differs from the kept beat; the name shows "changed". 💾 Save glows 🗂️ Beats (`landed.js`).
- **⏪ Put back** drops the draft: the kept beat as it was. It asks first (red "Put back?", a second tap), and has ↩️ Undo after.
- **Leaving never asks.** The draft waits. Opening the beat again (🗂️ Beats, a chip, a song block's ✏️, another device) opens the draft, "changed" showing.
- **↩️ Undo · ↪️ Redo** on the play line, faint when there is nothing to undo or redo: every change to the open beat (pills, loud hits, rows added, removed, moved, cleared, sounds, tempo, bars, swing, signature, mixer, 🔔, ⌨️ Keys' recording as one step per pass, a groove loaded or ➕ added, ⇆ slides, the roll's commit). Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z. Kept per beat for the visit, in memory; the draft is what survives a crash. The 8 s Undo banners stay for the moment of the change and undo the same step.
- **The scratch beat and scratch song stay as they are**: they are drafts already, and 💾 Keep is their save.
- **What plays a kept beat elsewhere** (🎼 Song, Share, the pattern chips' switch, 🗂️ See all, the thumbnail, 💾 As a sound) plays the kept beat, never the draft, except the open beat on 🥁 Beats itself.
- **Back to 🎼 Song** (a song block's ✏️): while the beat has a draft, the chip reads "💾 Save · ↩ Back to song". Save keeps the change and goes back; ↩ Back goes back with the draft waiting.
- **🗂️ Beats and the pattern chips** mark a beat with a draft: a dot, and "changed" in the list.
- **🎼 Song gets the same**: a kept song's draft, 💾 Save and ⏪ Put back on its name line, ↩️ ↪️ on its play line. Its block sheet's ↩️ Undo becomes the same history.
- **Built in two steps**, each shipped on its own: Beats (⌨️ Keys off and on), then Song.

## How it is stored (for the data seats)

- A draft is an ordinary record with a reserved id, as the scratch is (ADR 0020): `beat-draft-<rest of the kept id>` in `beats`, `song-draft-<rest>` in `songbook`, with `draftOf: <kept id>`. No IndexedDB upgrade, no new cloud kind, no Worker change, no D1 migration: the Worker and backups already take `beats` and `songbook` records.
- Hidden like the scratch (`scratch.js isHiddenBeat`): never in 🗂️ Beats, the chips, a song's beats or Share as a beat of its own.
- `cleanPattern` keeps `draftOf` when it names a valid beat id. A backup carries drafts; `docs/formats.md` gains the field and the id prefix.
- Deleting a kept beat deletes its draft. A draft whose kept beat is gone (deleted on another device) opens as a beat of its own, named as 💾 Keep would.
- Two devices editing one beat's draft offline merge as beats do (`merge3`).
- An older copy of the app does not know the prefix and lists a draft as a beat called by its name (as it lists `beat-kidsown-…`). Nothing is lost; the next new copy hides it again.

## Options turned down

- **An autosave switch:** a grown-up setting whose "off" is where work is lost.
- **Ask before leaving** (as the sound sheet does): the interruption Ben does not want.
- **Autosave into the kept beat with a stored restore point:** the restore point needs a rule for when it is replaced; the only clean one is the kid saying "this is the good one", which is a save.
- **The draft as a field on the kept beat's record:** an older copy's `cleanPattern` drops unknown fields, so its next save would lose the draft; the cloud's three-way merge would also have to merge inside it.
- **Songs play drafts on this device:** the song and the kept beat no longer agree, and another device plays it otherwise.

## Questions for the council

- Is "changed" under the name, a yellow 💾 and ⏪ enough for a pre-reader to know what happened?
- ⏪ for Put back, beside ↩️ Undo: two "back" arrows on one screen.
- The name line on a 320 px phone with 🥁 · name · 💾 · ⏪ · 🆕: the name has about 70 px.

## The council (2026-11-04)

All 22 seats on the mockup and this plan: no block, 22 ✏️. Folded in:

- **Build order** (mission keeper, storage): 1. ↩️ Undo · ↪️ Redo on Beats alone; 2. a release that only hides `beat-draft-` and `song-draft-` records, so no copy that can write a draft meets one it would list as a beat; 3. drafts on Beats; 4. drafts and the same Undo on Song. Each its own push.
- **⏪ Put back reads as a second Undo** (nearly every seat): it becomes 🗑️ Throw away changes, the sound sheet's words. Where it sits is Ben's call (below).
- **"changed" is a word a pre-reader cannot read**: a yellow dot on the name line, the chip, the 🗂️ Beats row and 🎼 Song's blocks of that beat, each also spoken ("Mega Rocket, changed, not saved"), and the first change announced politely.
- **🎼 Song shows it too**: a block whose beat has a draft wears the dot, so a kid who hears the old beat in the song sees why.
- **What you hear on 🥁 Beats is the draft**, ▶ Play and 💾 As a sound from Beats included; everywhere else (Song, Share, chips' switch, 🗂️ See all, thumbnails, the public profile) plays the kept beat. One helper says which (`draft.js`), with a test per place that plays or lists a beat.
- **💾 Save has ↩️ Undo** (parent): the kept beat as it was and the draft come back.
- **A draft equal to its kept beat is dropped** (Android, reliability): undoing back to the kept beat, or an old tab saving the same, shows no "changed".
- **Save writes the kept beat first, then drops the draft** (storage): a crash between leaves a draft equal to the kept beat, which is dropped.
- **Undo · Redo**: two 44 px buttons with a gap, never one joined box (accessibility); faint and `aria-disabled` when there is nothing; never ask, never count. One step per tap, per drag (pills, ⇆, swing, tempo, a fader), per ⌨️ Keys pass, per roll commit; off while ● Record records. A step applies through the ordinary edit path, so a playing beat hears it at the next look-ahead, with no stop or click. At most 50 steps a beat, for the visit. Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, never inside a text field; a web extra (v2 has the buttons).
- **Writes** (performance, browser): a draft's save is coalesced (about 300 ms) and flushed on `pagehide` and `visibilitychange`, so a phone that kills the tab keeps the last tap.
- **Coming in** (security, storage): `cleanPattern` keeps `draftOf` only when it is a beat id and the draft's own id is `beat-draft-` plus that id's rest; else the record loads as an ordinary beat. One draft per kept beat on restore and merge. A draft never goes in a share code or the public profile list. A draft whose kept beat was deleted on another device opens as a beat of its own, named as 💾 Keep would, through `cleanPattern`.
- **Deleting a kept beat deletes its draft** here and in the cloud, by the same delete path and checks as any beat.
- **Disclosure**: `web/privacy.js`, `docs/privacy-policy.md` and README say the cloud holds a person's unsaved changes too.
- **Drafts never expire**: a draft waits until 💾 Save or 🗑️ Throw away changes.
- **Android**: system Back leaves without asking, the draft waiting; from a beat opened from a song block it goes back to the song.
- **Checks**: `just look` views for a draft (`beat-draft`, `beat-draft-back`, `lib-draft`) at 320 to 3440 and `--height 680`; a test that a stray tap leaves the kept record byte for byte; `cloud-e2e` syncs a draft and checks the kept beat unchanged; docs/formats.md, docs/architecture/, guide.md, Help lines, a decisions row and an ADR with each step.

## Decided: where 🗑️ Throw away changes sits (Ben chose A)

Where 🗑️ Throw away changes sits, given the 320 px name line (🥁 · name · 💾 · 🗑️ · 🆕 leaves the name about 70 px, "Mega Roc…"):

- **A. Inside 💾** (recommended): the name line keeps today's buttons, ✏️ turning into 💾. A tap on 💾 opens two big choices, 💾 Save and 🗑️ Throw away changes (that one asks again). Nothing moves under the thumb when the first change lands, the name keeps its room, and a stray tap on 💾 saves nothing. Saving takes two taps.
- **B. Its own button** beside 💾, as mocked; on a phone 🆕 New hides while a draft shows. Saving is one tap; the line changes shape on the first change.
