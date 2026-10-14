# 0022. North star: a kid-sized music studio

**Status:** Accepted (2026-10-12)

## Context

Ben (2026-10-12) named the classic pattern-and-playlist music studios as what he is aiming for, and approved writing that down as the app's direction, without naming any brand. Several pieces already follow it: pattern chips, the mixer, the four peer tabs (ADR 0017).

## Decision

Noodle Pads grows toward a music studio sized for kids:

- **Make sounds** (Pads): record, chop and shape your own.
- **Build patterns** (Beats): rows of steps, a piano roll for tunes, a mixer.
- **Arrange them** (Song): a playlist of patterns on lanes that play together.
- **Play live** (Live): keys and takes.

Rules for every feature on the way:

1. Each studio idea gets a kid-sized version, never a full clone.
2. Phones first: one thing per screen, big targets, nothing scrolls sideways.
3. Anything can be undone, and a kid never loses work by forgetting a step.
4. Depth hides behind levels (🧸 Kids, Regular, Advanced; ADR 0019).
5. No automation clips, plug-ins or recording audio onto the timeline.

The app never names or imitates another product in its words or looks.

## Consequences

- A proposal that does not fit one of the four parts, or breaks a rule above, needs Ben's call first.
- Next in line: the piano roll, then the playlist.
