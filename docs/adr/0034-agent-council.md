# 0034. An agent council reviews every change, and can block it

**Status:** Accepted (2026-10-26)

## Context

Agents build nearly all of Noodle Pads, mostly on their own, and one agent's view of a change misses whole areas: a pun a pre-reader won't get (🎩 for the hi-hat), a preset far louder than the rest, a kid's recording playable by anyone with its link. Ben, 2026-10-26: "Implement an agent council for all future revisions and changes", with personalities from "a music educator to a child literacy or music advocate, a child psychologist, grown-up level stuff as well, UX, a staff enterprise architect", and more technical seats, "a completely full set of opinions".

## Decision

- **22 seats**, each a personality with one lens ([docs/council.md](../council.md) has the roster). The staff architect is a web-platform architect: enterprise patterns would fight the no-build rule.
- **They are an authority.** Ben: "They can absolutely block a feature or a deployment if they have to. Their intention is to drive the mission statement and their particular aspect." A block needs the mission or a red line plus evidence. A block against one of Ben's rules goes to Ben. A seat never forces a rollback, only an immediate fix forward.
- **Scaled by the change:** the full council on a new screen or control, at the mockup stage; the data seats on a stored format or the cloud; the seats it touches on a fix. They advise throughout development.
- **Results live in the work:** code, tests, docs, decisions and ADRs, plus one `Council:` trailer per commit. No council log. Ben: "that feels like an anti-pattern if it was just for them."
- **Drift guards:** a blind brief, an independent first round, evidence used but returned only as a pointer, a mandatory biggest risk, a model matched to the seat's weight, a tripwire on seats that only pass, spot checks by Ben.
- **Merges after Ben approves.** Seats that keep agreeing are proposed for a merge; none merges without his yes.
- **The first round is the app as it is now**, every seat, as wide as each can think.

## Options turned down

- **Advisory only.** Cheaper and quieter, but the lead agent could ignore what it found inconvenient.
- **Every seat on every change.** About 22 agents per one-line fix: minutes and a large token bill for nothing.
- **Returning every finding's evidence.** It costs tokens for something Ben rarely reads; it is there when he asks.
- **A chair seat that sums up the others.** A chair invites herding; the mission keeper has one lens like the rest.

## Consequences

- A big change costs more: a full round is 22 agents, minutes of wall-clock and a real token bill. A fix costs one or two seats, or none.
- Blocked work waits on its branch while the agent moves on, so a block never stalls the queue.
- Every seat is a model playing a role. It forces lenses that get skipped; it is not the expertise of a real psychologist or lawyer. A real expert still outranks a seat.
