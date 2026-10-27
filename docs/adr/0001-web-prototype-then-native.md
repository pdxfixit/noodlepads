# 0001. v1 is a web prototype; v2 is a native Android app

- **Status:** Accepted
- **Date:** 2026-09-27; imports added 2026-10-26
- **Decided by:** Ben, 2026-09-27

**In short.** Build the soundboard first as a plain web page, to learn what the kids actually use. Then build the lasting app natively in Kotlin + Compose. Only `boards.json` and the sound files carry over; the web code is thrown away.

## Context

- The kids (10 to 15) want their own sounds, silly voices and beats. Nobody knew yet which of those they would use.
- Ben's other apps (Arrow-Rama, Orbit) are Kotlin + Compose, with tooling for his devices already built.
- A web page needs no install and no store review. Every family member can open a link, and a change is live in a minute.

## Decision

- **v1** is `web/`: plain HTML, CSS and ES modules, with no build step and no dependencies. It is deployed on one Worker with one D1 database ([ADR 0002](0002-cloud-profiles-on-one-worker.md)).
- **v2** is a native Kotlin + Compose Android app, the same stack as Arrow-Rama and Orbit, not a wrapped web page.
- What carries over: the `boards.json` format and the clip files. v2 has its own stored formats and starts fresh.
- **v2 imports v1 backups** (format 1.x), so the players already on v1 bring their sounds, beats and songs across (Ben, 2026-10-26). From format 1.2, a v1 backup also carries each own sound **as heard** (rendered with its voice, knobs, trim, edits and fade: `sounds/<id>.heard.wav` beside the original), so v2 imports sounds without a voice engine of its own. The format is written out in [docs/formats.md](../formats.md). Whether v2 has voices for new sounds is still open (`TODO.md`).

## Options turned down

- **Native from the start.** Slower to try ideas; every change needs an install on each device.
- **Wrap v1 as the app** (a WebView or PWA). Web Audio latency and microphone rules differ on each phone, and it would not share the family's Android tooling.

## Consequences

- v1 code can stay simple and has no back-compat promise beyond what users store: their IndexedDB data and backups must keep loading.
- Lessons for v2 are collected in `TODO.md` ("List what to change from v1").
- Revisit if v1 turns out good enough that v2 is not worth building.
