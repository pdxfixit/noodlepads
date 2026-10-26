# 0022. Mission and north star: a music studio for kids and amateurs

**Status:** Accepted (2026-10-12; mission and amateurs added 2026-10-26)

## Context

Ben (2026-10-12) named the classic pattern-and-playlist music studios as what he is aiming for, and approved writing that down as the app's direction, without naming any brand. On 2026-10-26, setting up the council ([ADR 0034](0034-agent-council.md)), he widened who it is for and gave it a mission:

- "A music studio sized for kids, but I would expand that to be … amateurs … I like music production, but I don't have the time and energy for something like an Ableton. I need something very casual and passive and easy like this. So I want real depth. But I want it to be simply revealed as I'm prepared to do so."
- The soundboard is "a product of its own, but to me it's the beginning of how to make its way into music, because they're just individual sounds".
- Learning: "I don't really want to do coached education … if I'm goofing around with something and a brand new tool is right there in terms of a button and I can just start goofing around with it and suddenly I'm learning a new technique and I didn't even realize it, that's kind of the purpose."
- A good session: "hitting the buttons a little bit and annoying your family", goofing with the voices and filters, or "creating a really cool beat or a song".
- Never: ads, required accounts, socials, AI generating the music. Tracking is "anonymous only for like feature improvement". Paid "very, very, very unlikely", so "free" is not promised.
- Measurement: the cloud's player metrics stay per profile (ADR 0016), so the mission promises what measurement is for, not that it is anonymous (Ben, 2026-10-26, when the mission keeper and privacy seats blocked "anonymous").

## Decision

**The mission** (the text agents and the council work from is in [AGENTS.md](../../AGENTS.md#mission)):

> Noodle Pads is a music studio anyone can pick up: kids, families, and grown-ups who love music but don't have the time for a pro studio. It starts as a soundboard: tap a pad, make a noise, annoy your family. Every next tool is one tap from what you are already playing with, so you learn by goofing around, never by lessons. Real depth (voices, beats, tunes, whole songs) is there when you reach for it. Goofing around counts as much as finishing a song.
>
> No ads. No required account. No social feed. No AI makes the music for you. What we measure is only to make the app better.

**The north star:** Noodle Pads grows toward a music studio sized for kids and amateurs:

- **Make sounds** (Pads): record, chop and shape your own.
- **Build patterns** (Beats): rows of steps, a piano roll for tunes, a mixer.
- **Arrange them** (Song): a playlist of patterns on lanes that play together.
- **Play live** (Live): keys and takes.

Rules for every feature on the way:

1. Each studio idea gets a kid-sized version, never a full clone.
2. Phones first: one thing per screen, big targets, nothing scrolls sideways.
3. Anything can be undone, and nobody loses work by forgetting a step.
4. Depth hides behind levels (🧸 Kids, Regular, Advanced; ADR 0019), and the next step sits beside what you are using.
5. No automation clips, plug-ins or recording audio onto the timeline.

The app never names or imitates another product in its words or looks.

## Consequences

- A proposal that does not fit one of the four parts, breaks a rule above, or breaks a promise in the mission needs Ben's call first. The council's mission keeper checks every change against it.
- "Anyone" means any level of interest, not a literal age range: the design targets kids and grown-up amateurs, not the very old.
- A paid version is not ruled out, so no doc or screen promises "free".
