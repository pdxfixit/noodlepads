# Noodle Pads 🔊

A music studio anyone can pick up, starting as a soundboard, as a web app: tap a pad to play a sound, hold it to loop, record your own, add silly voices, make beats and songs. Plain HTML, CSS and ES modules, no build step and no dependencies.
Live and **public** at https://noodlepads.com/. Repo: `github.com/pdxfixit/noodlepads` (**public**: everything committed is world-readable), in `~/src/noodlepads`. Release 1.0 started this repo from one commit; what 1.0 has is in [CHANGELOG.md](CHANGELOG.md). This is **v1**, a web prototype; v2 is a native Android app ([ADR 0001](docs/adr/0001-web-prototype-then-native.md)).

This file is the contract: how to start, how to verify and ship, and the rules for working here. It stays short. Detail lives in the files it points to.

## Ownership and authority

**Claude agents manage this repo, with the owner's standing approval (2026-11-14) to decide repo upkeep without asking first.** Read [docs/agents/ownership.md](docs/agents/ownership.md) before you merge, land or delete anything. More agent instructions live in [docs/agents/](docs/agents/README.md).

## Mission

> Noodle Pads is a music studio anyone can pick up: kids, families, and grown-ups who love music but don't have the time for a pro studio. It starts as a soundboard: tap a pad, make a noise, annoy your family. Every next tool is one tap from what you are already playing with, so you learn by goofing around, never by lessons. Real depth (voices, beats, tunes, whole songs) is there when you reach for it. Goofing around counts as much as finishing a song.
>
> No ads. No required account. No social feed. No AI makes the music for you. What we measure is only to make the app better.

Every change serves this. Why, and the north star it steers: [ADR 0022](docs/adr/0022-north-star.md).

## TL;DR

- **Start:** `just setup` once per clone (git hooks: a commit checks syntax and a staged `web/version.js`'s number, a push checks the release's number; a worktree shares its checkout's setting), then `just doctor`: are you in the main checkout or a worktree, are the tools there, is `main` live. Then the cold start below. A cloud container may have no `just`: `pip install rust-just` gives it (2026-10-17).
- **Test:** `just test` (syntax check, then Node's built-in test runner; nothing to install).
- **Run:** `just serve`, then http://localhost:8765/. Port 8765 is Ben's own server; agents preview on 8781 (see [Verify](docs/agents/verify.md#verify)).
- **Ship:** a change to `web/` gets `just version` in the same commit ([Ship](docs/agents/ship.md#ship)). `just ship`, from the main checkout only. In a worktree, commit on your branch and report the commits; they are landed with `just land` ([docs/how-to.md](docs/how-to.md)). Every push to `main` is deployed by GitHub (`.github/workflows/deploy.yml`, [ADR 0025](docs/adr/0025-github-deploys.md)): tests, deploy, then the live cloud checks. Agents never deploy and hold no Cloudflare token; after a push, read the deploy run (`just ci-wait` waits for it and says how each run ended).
- **Every change fits every screen:** check 320, 375, 700, 900 and 1100 px wide, then the wide screens 1366, 1920, 2560 and 3440, with no sideways scroll. `just look --wide` does all nine in your own headless Chrome ([Verify](docs/agents/verify.md#verify)).
- **The full council reviews every change, however small, and can block it:** all 22 seats, every time, never a hand-picked few (Ben, 2026-11-18). When, how and what they return: [docs/council.md](docs/council.md) ([Council](docs/agents/council-use.md#council)).
- **"Reset <fun name>'s PIN":** Ben may ask this cold. Follow [docs/how-to.md](docs/how-to.md) "Reset a forgotten PIN": two commands, from Ben's Mac only. The tool picks a random PIN and shows it once, for Ben to pass on to the family; never 1234 (Ben, 2026-10-27).
- **Anything that comes in is untrusted:** backups, uploaded files and `boards.json` are checked and capped ([docs/guide.md](docs/guide.md) "Limits on what comes in").

## Cold start: read in this order

1. **This file.**
2. [docs/state.md](docs/state.md): where things stand now: what is live, work in flight or parked, what waits on Ben.
3. [docs/decisions.md](docs/decisions.md): every rule Ben has decided that is true today. Read the sections your task touches. It outranks every other doc.
4. [docs/questions.md](docs/questions.md): open questions. Look first for answers Ben typed in.
5. [TODO.md](TODO.md): the one to-do list. "Agents do" is approved agent work, in order; "Ben does" is what only Ben can do.
6. [docs/how-to.md](docs/how-to.md): step by step for your kind of task (a fix, a stored-format change, docs, landing, deploy and rollback, the cloud), then the doc it needs from the table below.
7. [docs/architecture/](docs/architecture/README.md): how the code is wired. Read the area your task touches before you search the code for "is there one shared X", "where does Y happen" or "what must I touch to change Z".

**Leave the next session a warm start.** A session may be a cloud session with only this repo: no chat history, no memory folder. Whatever the next agent needs must be in a file here. Update [docs/state.md](docs/state.md) in the same commit whenever what is live or in flight changes. If the chat taught you a standing rule, add it here, not only to a local memory.

## Agent docs: `docs/agents/<file>`

Read the file when its row fits your task. They hold what used to be in this file, unchanged. More on the folder: [docs/agents/README.md](docs/agents/README.md).

| File | Read it when |
|---|---|
| [docs/agents/ownership.md](docs/agents/ownership.md) | you are about to merge, land or delete a branch, a worktree or a remote branch |
| [docs/agents/file-map.md](docs/agents/file-map.md) | you need the doc for your task, or want to know what a folder or file holds |
| [docs/agents/verify.md](docs/agents/verify.md) | you finish a change and must test it, or check it in a browser (`just test`, `just look`, `just taps`, the live cloud checks) |
| [docs/agents/council-use.md](docs/agents/council-use.md) | a change needs the review council: who to convene, how to brief, what to do with a block |
| [docs/agents/ship.md](docs/agents/ship.md) | you ship or land a change, stamp the version, change the cloud schema, or clean up after an agent |
| [docs/agents/conventions.md](docs/agents/conventions.md) | you write code, UI, docs, tests or tooling, or record a decision |
| [docs/agents/working-with-owner.md](docs/agents/working-with-owner.md) | you write a report, are about to ask the owner something, or work while they are away |
| [docs/agents/privacy.md](docs/agents/privacy.md) | a change touches what the app stores, shows or sends, or the privacy disclosure |

## Privacy

**No kids' names anywhere in the repo** (Ben, 2026-10-11): not in code, tests, tools, file names, docs or commit messages. Write "a kid" or "the kids"; tests make up names (Pip, Juno, Toby, Wren). "Sandberg Family" is the most private detail allowed. `boards.json` lists no people. No test checks this; the rule is enough (Ben, 2026-10-28: "the kids' names are long out of the codebase"). Write no capitalized everyday word or product name that could be a first name. Before a real voice clip goes into `web/clips/`, remember it becomes public.
