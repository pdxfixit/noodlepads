# 0028. New people get a welcome, a stage name and one-time tips

- **Status:** Accepted (2026-10-16), to build; the screens wait on Ben's picks from the mockups
- **Date:** 2026-10-16
- **Decided by:** Ben, 2026-10-16, on the new-user brainstorm: one-time tips and hint dots "yes"; "this dialog will directly countermand" the no-tutorials rules; "Include a 'Pick your Stage Name' chooser for the rest of the profile"; level-up nudges "yes, as a notification in the upgrade space, but maybe it fades after awhile". Rows in [decisions.md](../decisions.md) (Product).

**In short.** A new person is asked who is playing, picks a stage name, and then learns the app by playing it, with a short tip the first time each thing matters. Nothing blocks the first sound.

## Context

- A new device or a new person starts at Regular, on 🔊 Pads, with no question and no welcome. 🧸 Kids (ADR 0019) is reachable only through ⚙️ Settings → Level, so a grown-up has to know it is there.
- ADR 0004 had turned down tutorials, and ❓ Help said "no lessons or popups". Ben chose to change both for the first steps only.
- The level, the name, the picture and the color are per person, and siblings share one tablet.

## Decision

1. **Who's playing?** On a device's first open and for every new person (👋 Someone new, ➕ in 👥 People): three big picture cards, 🧸 Kids · Regular · Advanced. Each card is a pad, so the first tap makes a sound. Skipping keeps Regular. Choosing Kids is the grown-up's moment; leaving Kids still needs the sum.
2. **Pick your stage name.** Then the rest of the profile: a fun name (the Pick a name list, 🎲 for more), a picture and a color. Skipping keeps the ones the app gave.
3. **One-time tips.** Regular and Advanced: one short tip at a time, the first time a thing matters (a few pad taps → hold to loop; first visit to Beats → tap squares, then ▶︎ Play, or 💃 a groove). Each shows once per person, in the floating banner. ❓ Help offers to show them again.
4. **Hint dots.** A small dot on a control the person has never tapped (⌨️ Keys, 💃 Grooves, 🎚️ Mixer); the first tap clears it.
5. **🧸 Kids gets no words.** A 👆 hand pulses over the first pad until it is tapped; the mic wiggles until the first recording.
6. **Level-up nudge.** When a Regular person keeps reaching for what Advanced adds, an offer floats in the bottom bar where 🆕 update shows, and fades after a while.

## Options turned down

- **A tour of several screens up front.** Kids skip it and remember none of it.
- **Challenges or creative prompts** ("a beat with only animal sounds"). Ben: no.
- **A grown-up note about 📊 Share play data on first open.** Ben: leave it unmentioned.

## Consequences

- What has been seen and dismissed is kept per person (a setting, synced and in backups), so a tip never repeats on another device.
- Every new tip, dot and nudge sends a usage event only with an `events.toml` entry and a log-clean rule.
- Spoken prompts for 🧸 Kids stay open (Ben: "some of it should just be found by poking").
