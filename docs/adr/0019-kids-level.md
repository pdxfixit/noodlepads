# 0019. Three levels per person: Kids, Regular, Advanced

**Status:** Accepted (2026-10-12), built (`web/kids.js`, `web/kids-logic.js`; smaller calls provisional, questions.md Q63)

## Context

Ben (2026-10-12): "add a kids mode where it changes the interface to support a 5yo. presume we've been designing the medium and high levels, now let's strip stuff back for a low experience." Until now each person had one switch, `advancedBeats`, so the app had two levels.

## Decision

- Each person has a level: 🧸 Kids · Regular · Advanced. It replaces the Advanced switch: a stored `advancedBeats: true` reads as Advanced, anything else as Regular. Settings, backups and the cloud carry the level like any per-person setting.
- **Kids** shows four screens, all picture-led and fun, with no words a kid has to read:
  - **Pads**: big picture pads, swiped sideways between pages, pinched to change their size; a kid's own recordings are pads too.
  - **Record**: hold the big mic, let go to stop; it becomes a pad. Three big voice buttons.
  - **Beats**: four drum rows of eight big squares, ▶︎ Play, 🐢 slow and 🏃 fast. One beat, always saved.
  - **Live keys**: big colored keys that play while held, like a toy keyboard. ● records a tune played on them into the kid's beat, for a grown-up to keep (2026-10-22).
- Kids mode has no delete, no edit, no settings, no cloud and no sharing on screen.
- A grown-up taps ⚙️ (the usual gear, in its usual corner) and answers a sum (like 7 + 8); that opens Settings and the regular app for the visit.
- 🧸 Kids mode in the corner menu (and 🧸 at the top of the regular app, from 600 px wide) goes the other way (2026-10-22): a Kids-level person comes back to Kids, and a Regular or Advanced person sees Kids for the visit, their level unchanged; ⚙️ and the sum lead out again.

## Consequences

- The regular screens stay as they are; Kids is a separate, simpler set of views over the same sounds and beats.
- Every new feature decides whether it shows in Kids, Regular or only Advanced.
