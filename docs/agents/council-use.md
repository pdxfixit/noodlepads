# Using the council

How an agent convenes the review council and what to do with its findings. The council itself (seats, rounds, authority) is in [docs/council.md](../council.md). Moved out of [AGENTS.md](../../AGENTS.md) unchanged.

## Council

22 review agents, each a personality with one lens, check every change against the mission and their own area ([docs/council.md](../council.md), [ADR 0034](../adr/0034-agent-council.md)). They are an authority: a seat's ⛔ block stops a feature or a deploy until the seat lifts it or Ben decides.

- **Convene all 22 seats on every change, however small** (Ben, 2026-11-18). A new screen, control, layout or stored format gets them on the plan or mockup too, before building. Never trim the round to the seats you think it touches. The table is in docs/council.md.
- **Brief them blind:** the change itself, never your reasoning or another seat's verdict. Run one round's seats in parallel.
- **A block against one of Ben's rules goes to Ben**: asked at once while he is in the chat, else a question card batched up front. Blocked work waits on its branch; move to the next TODO item.
- **Never a rollback:** a seat's finding on what is live is fixed forward, at once when the seat says it is urgent.
- **Run them in parallel:** a session runs at most 20 agents at once, so start 20 in one message and the last two as the first finish. One brief file for all (the change, the diff's path, screenshots), so every seat reads the same thing.
- **Results go into the work** (code, tests, docs, decisions, ADRs). No council log. Each commit carries a `Council:` trailer naming all 22 seats and their verdicts (➖ for nothing in a seat's lens); `just council-check` checks it.
- **A confident finding is built now, not listed.** Medium- or high-confidence findings are done straight away; low-confidence ones, a clash with `docs/decisions.md`, or a new screen or control go to Ben, and only his yes puts them in TODO.md.
