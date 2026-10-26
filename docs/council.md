# The council

The council is 22 review agents, each a personality with one lens, who review every change against [the mission](../AGENTS.md#mission) and their own area. They are an authority: a seat can block a feature or a deploy. Why it exists and what it costs: [ADR 0034](adr/0034-agent-council.md). Each seat is defined in `.claude/agents/council-<seat>.md`; `tests/council.test.mjs` checks that the files and the roster below agree.

## The seats

Opus seats carry the most risk, so they get the strongest model. The others run on Sonnet; the mix also keeps every seat from sharing one model's blind spots.

| Seat | File | Lens | Model |
|---|---|---|---|
| Mission keeper | `council-mission-keeper` | Does this belong at all? Scope creep, the promises, the north star | opus |
| Children's privacy and online safety | `council-privacy-safety` | What a kid's data, voice and name can reach; COPPA and age-appropriate design | opus |
| Child development psychologist | `council-child-psychologist` | Frustration, attention, fine motor, overstimulation, reward loops that turn into dark patterns | opus |
| Staff web-platform architect | `council-architect` | Module boundaries, stored formats, no build step, the v2 path | opus |
| Security engineer | `council-security` | Untrusted input, the CSP, share links, PINs, the public repo | opus |
| Storage and sync engineer | `council-storage-sync` | IndexedDB, D1, offline sync conflicts, backups that still load, never losing work | opus |
| Early-childhood music educator | `council-music-educator` | Does using it teach how music works, without a lesson? | sonnet |
| Early-literacy and pre-reader specialist | `council-pre-reader` | Can someone who can't read get through it by pictures alone? | sonnet |
| Accessibility and inclusive design | `council-accessibility` | Motor, vision, hearing, neurodivergent players, screen readers, reduced motion, cheap phones | sonnet |
| Kids' mobile interaction designer | `council-kids-ux` | One thing per screen, thumb reach, 44 px targets, every width | sonnet |
| Time-poor amateur | `council-amateur` | Loves music, no time for a pro studio, doesn't know the words: is the next step right there? | sonnet |
| Skeptical parent | `council-parent` | Setup cost, grown-up gates, screen time, trust, "what did my kid just do, and can I undo it" | sonnet |
| Working music producer | `council-producer` | Do the skills carry over to a real studio? Groove, feel, arrangement | sonnet |
| Sound designer | `council-sound-designer` | How it actually sounds: presets, voices, loudness, timbre | sonnet |
| Audio engineer (Web Audio on phones) | `council-audio-engineer` | Latency, clipping, timing, the audio clock, Safari and Android quirks | sonnet |
| Performance engineer | `council-performance` | Slow phones, frame budget, memory, load size | sonnet |
| Browser and offline compatibility | `council-browser-compat` | iOS Safari, Firefox and Chrome on Android, the service worker, offline | sonnet |
| Reliability engineer | `council-reliability` | Deploy, live checks, roll forward, what breaks for people already using it | sonnet |
| Test and QA engineer | `council-test-qa` | A test that fails without the change; what can't be tested here, said out loud | sonnet |
| Android engineer (v2) | `council-android` | Will this v1 decision port to native Kotlin, or trap v2? | sonnet |
| Developer experience | `council-devex` | `just`, `tools/`, how agents work here; slow or easy-to-get-wrong steps | sonnet |
| Docs steward | `council-docs` | Are the docs true, plain and current with this change? | sonnet |

## When it convenes

| Change | Seats | When |
|---|---|---|
| A new screen, control, layout or kid-facing behavior | All of them | On the mockup or plan, before building; then the seats it touches on the finished change |
| A stored format, backup, the cloud or what the public sees | Architect, storage and sync, privacy and safety, security, parent | On the plan; again on the finished change |
| A fix or restyle inside an agreed design | The one or two seats it touches, or none | On the finished change |
| Tooling and docs only | Developer experience, docs steward | On the finished change |

Seats advise throughout: a seat asked at the plan stage may say what it wants to see again on the finished change. Ben can convene any seat on anything.

## How a round runs

1. **Blind brief.** The lead agent gives each seat the change itself (the plan, mockup, diff, screenshots, the files touched), never its own reasoning, its preferred answer or another seat's verdict. A seat reads the mission and `docs/decisions.md` for itself.
2. **Independent first round.** Every seat in the round runs in parallel, in its own agent, with no view of the others.
3. **Second round, only on a conflict.** Where two seats ask for opposite things, those two see each other's findings once and answer. The lead agent then picks the option closest to the mission and `docs/decisions.md`. A block stands until the seat that made it lifts it or Ben decides.
4. **Questions go to Ben as they come up.** While he is in the chat, ask each one at once, most important first, and act on the answer. Before a run he won't watch, batch them up front (a card each in [questions.md](questions.md)) so autonomous work can keep going. Blocked work waits on its branch; the agent moves on to the next TODO item.

## What a seat returns

Short, because nobody reads the long version. Evidence is used, not shown: each finding carries one pointer (a file and line, a screenshot name, a test), and the seat explains only when asked.

```
Verdict: ✅ pass | ✏️ changes | ⛔ block
Biggest risk: one line, always, even on a pass
Block: (only with ⛔) the mission line or red line it breaks · pointer
Changes: one line each · pointer
Beyond this change: ideas and problems outside the change, one line each
Questions for Ben: one line each, only what the seat cannot decide
```

## Its authority

- **A block needs the mission or a red line in the seat's area, plus evidence.** Anything weaker is a change asked for, which the lead agent makes or answers.
- **A block stops the feature or the deploy.** The work is not landed until the block is lifted.
- **A block against one of Ben's rules** in `docs/decisions.md` goes to Ben (asked at once, or a question card); he upholds or overrules it. The council never changes a decision.
- **Never a rollback.** A problem found in what is live gets an immediate fix forward. A seat may call it urgent: then it goes ahead of everything else in TODO "Agents do".

## Where the results go

Into the work itself: the code, its tests, the docs, `docs/decisions.md` rows Ben approves, and an ADR's "Council" note where the decision is big enough for an ADR. There is no council log. A finding that would become new work is put to Ben first, as a question in the chat (or a card when he is away); only a yes puts it in TODO.md. A finding fixed inside the change needs no ask. Otherwise the list only grows.

Each commit says which seats reviewed it, in one trailer line above `Co-Authored-By`:

```
Council: privacy-safety ✅, kids-ux ✏️, audio-engineer ⛔→✅
```

A change no seat reviewed says `Council: none (fix)` or `Council: none (docs)`.

## Guarding against drift

Every seat is the same kind of model wearing a different hat, so seats tend to agree with each other and with the lead agent. The guards:

- **The blind brief and the independent first round** (above): no seat sees another's answer, or the lead's, before it gives its own.
- **Evidence or it doesn't count.** A finding without a pointer is dropped. "Nothing to change" says what was checked.
- **A mandatory biggest risk**, even on a pass.
- **A model matched to the seat's weight** (the roster's Model column).
- **The tripwire.** `just council-tripwire` reads the `Council:` trailers in git and names any seat with 10 ✅ in a row. A seat that only ever passes is either in the wrong rounds or has drifted: its prompt is rewritten, or it is proposed for a merge.
- **Spot checks.** Ben may ask for any seat's full answer, evidence included, on any round.
- **Merges need Ben.** Any seat or agent may propose merging two seats that keep agreeing (the tripwire's list and their trailers are the evidence). Two seats merge only after Ben approves; then this roster, the agent files and `tests/council.test.mjs` change in one commit.

## Running a round

An agent convenes a seat by starting an agent with that seat's file as its brief (in Claude Code, the `council-<seat>` agent type; elsewhere, the file's text as the prompt), plus the change. Run the seats of one round in parallel, in one message. A Claude Code session runs at most 20 agents at once (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`), so a full round starts the last two when the first finish. In a first round over the whole app, keep `just look` to the screen-facing seats, a run or two each: every run starts its own headless Chrome on one machine.
