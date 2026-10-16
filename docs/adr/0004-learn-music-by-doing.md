# 0004. The app teaches music by doing: every action lands in time, and depth is one switch away

- **Status:** Accepted
- **Date:** 2026-10-10
- **Decided by:** Ben, 2026-10-10: "not so much about teaching explicitly, it's about teaching implicitly the idea that just the action of working with these things builds repetitive muscle and awareness of music sequencing", and "I want it all tbh. This is a growing educational toolkit"

**In short.** The soundboard grows into a toolkit for learning sampling and looping, the way a producer would teach their own kids: by doing, not by lessons. The simple path always sounds musical. The tools producers use sit behind Advanced beats, for when a kid is ready.

## Context

- The kids are about 10 to 15. They already record sounds, loop pads and make beats.
- Skills like timing, bars, groove and dynamics come from repetition: hearing what works, again and again.
- Explicit lessons (words like "quantize" or "velocity", tutorials) turn play into school.

## Decision

Three rules for every feature:

1. **The simple path is always musical.** Things snap to the beat, defaults sound good, and nothing a kid does in simple mode can sound broken.
2. **Show, don't name.** Labels say what happens ("Loops wait for the beat"). The music words stay out of simple mode.
3. **Depth is one switch away.** Advanced beats (Settings) reveals the producer tools. It is never in the way.

The toolkit, in build order (`TODO.md` "Agents do"):

| # | Feature | What it teaches |
|---|---|---|
| 1 | A stronger "1" at the start of every bar | Bars and downbeats |
| 2 | Loops start on the beat while a beat plays | Loops line up on the "1" |
| 3 | Starter grooves | Classic patterns, by copying and changing them |
| 4 | Loud and soft hits | Dynamics |
| 5 | Tap pads in time to record into the grid, with a count-in and a click | Timing, finger drumming |
| 6 | Swing (advanced) | Groove feel |
| 7 | Melody rows (advanced) | Notes and melody |
| 8 | Chop and trim a recording (advanced) | Sampling |
| 9 | Song mode: chain beats (advanced) | Arrangement |

Saving a beat as a sound (resampling) already exists.

## Options turned down

- **A lessons mode.** Ben wants learning through use, not instruction. The first steps have a welcome and one-time tips ([ADR 0028](0028-welcome-and-tips.md)).
- **Producer tools in the main view.** They would crowd out a 10-year-old.

## Consequences

- Every new feature asks: does the simple path still sound good, and is the depth hidden until wanted?
- Stored beats grow new fields (accents, swing, notes, song chains). Each needs `cleanPattern` support, and old beats and backups must keep loading.
