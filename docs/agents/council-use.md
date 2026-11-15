# Using the council

How an agent convenes the review council and what to do with its findings. The council itself (seats, rounds, authority) is in [docs/council.md](../council.md). Moved out of [AGENTS.md](../../AGENTS.md) unchanged.

## Council

22 review agents, each a personality with one lens, check every change against the mission and their own area ([docs/council.md](../council.md), [ADR 0034](../adr/0034-agent-council.md)). They are an authority: a seat's ⛔ block stops a feature or a deploy until the seat lifts it or Ben decides.

- **Convene them by the change:** all seats on a new screen, control or layout (at the mockup, before building); the data seats on a stored format or the cloud; the one or two a fix touches. The table is in docs/council.md.
- **Brief them blind:** the change itself, never your reasoning or another seat's verdict. Run one round's seats in parallel.
- **A block against one of Ben's rules goes to Ben**: asked at once while he is in the chat, else a question card batched up front. Blocked work waits on its branch; move to the next TODO item.
- **Never a rollback:** a seat's finding on what is live is fixed forward, at once when the seat says it is urgent.
- **Results go into the work** (code, tests, docs, decisions, ADRs). No council log. Each commit carries a `Council:` trailer naming the seats and their verdicts.
- **A confident finding is built now, not listed.** Medium- or high-confidence findings are done straight away; low-confidence ones, a clash with `docs/decisions.md`, or a new screen or control go to Ben, and only his yes puts them in TODO.md.
