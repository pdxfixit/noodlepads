# Architecture decision records

An ADR is a short file that says why one big decision was made. [decisions.md](../decisions.md) says **what** the rule is today, in one row. An ADR keeps the **why**: what forced the choice, what was picked, what was turned down, and what it costs.

## When to write one

Write an ADR, in the same commit as the work, when a decision Ben makes does any of these:

- changes what the app **is** (its platform, who it is for, how sounds or beats work);
- changes a stored format: IndexedDB, the backup zip, `boards.json`;
- changes the hosting or what the public can see;
- is costly to undo;
- changes an earlier ADR's decision (then rewrite that ADR instead).

A small rule (a label, a color, a layout) needs only its row in `decisions.md`.

## How

1. Copy the template below into `NNNN-short-name.md`, with the next number.
2. Keep it under about one page. Plain words, short sentences.
3. Add a row to the list below, and link it from the matching row in `decisions.md`.
4. An ADR states the decision as it stands. When Ben changes a decision, rewrite its ADR in place, with no "superseded" or "previously" (Ben, 2026-10-11: "we don't need historical ADR"). Git keeps the history.

## The ADRs

| # | Decision | Status |
|---|---|---|
| [0001](0001-web-prototype-then-native.md) | v1 is a web prototype; v2 is a native Android app | Accepted |
| [0002](0002-cloud-profiles-on-one-worker.md) | A public site on one Worker and one D1 database, with profiles in the cloud and the device as the working copy | Accepted |
| [0003](0003-shared-kit-copied-per-person.md) | One shared kit of sounds, copied into every person's board | Accepted |
| [0004](0004-learn-music-by-doing.md) | The app teaches music by doing: every action lands in time, and depth is one switch away | Accepted |
| [0005](0005-dj-mode-data.md) | DJ mode keeps changed keys and freestyle takes in two new stores, carried in backups | Accepted |
| [0006](0006-song-mode-data.md) | Song mode keeps one song per person in a new `songs` store, carried in backups | Replaced by 0007 |
| [0007](0007-songs-are-a-list.md) | Songs are a list, like beats: `songs` keeps each person's open song, `songbook` every song | Accepted |
| [0008](0008-own-open-document-per-screen.md) | One open beat and one open song per person, and either may be none | Accepted |
| [0009](0009-opt-in-problem-reports.md) | Opt-in problem reports: one route on the site, 14 days in D1, then the telemetry runner's mirror | Accepted |
| [0010](0010-move-to-noodlepads-com.md) | The app is at noodlepads.com, and the old address is retired | Accepted |
| [0011](0011-backups-1-0-merge.md) | Backups start over at format 1.0, and loading one merges | Accepted |
| [0012](0012-sound-tweaks.md) | A sound's knobs are stored as `tweaks`, and a voice is knob settings | Accepted |
| [0013](0013-groups-of-own-sounds.md) | Groups of a kid's own sounds live on the sound and on the pad order | Accepted |
| [0014](0014-dj-key-layouts.md) | Saved DJ key layouts are their own records (`layouts`), apart from the live keyboard (`decks`) | Accepted |
| [0015](0015-row-volume.md) | A beat row's loudness is stored as `volume`, left out at full | Accepted |
| [0016](0016-player-metrics.md) | Player metrics, for people in the cloud: devices, places (nothing of the IP), activity, feature use and visits, 14 days in D1, then the telemetry runner's mirror | Accepted (feature use and visits superseded by 0027) |
| [0017](0017-four-peer-tabs.md) | Four peer tabs, Pads · Beats · Song · Live; Beat Builder becomes Beats' ⌨️ Keys; one open beat | Accepted, built |
| [0018](0018-mixer-fields.md) | The 🎚️ Mixer's solo, effects and master are stored on the beat, left out at normal | Proposed |
| [0019](0019-kids-level.md) | Three levels per person, 🧸 Kids · Regular · Advanced; Kids is four big picture screens, left by a grown-up sum | Accepted, built |
| [0020](0020-scratch-documents.md) | A scratch beat and song per person, open by default; grooves load into it; 💾 Keep names it "<fun name> (<groove> version)" | Accepted, built |
| [0021](0021-beat-pins.md) | A 📌 pin is a time on the beat record, left out when not pinned | Proposed |
| [0022](0022-north-star.md) | North star: a kid-sized music studio (sounds, patterns, a playlist, live play), no brand named | Accepted |
| [0023](0023-piano-roll-notes.md) | A tune row stores notes (pitch, start, length) for 🎹 the piano roll; old melody rows are read as notes, and older copies still play them roughly | Accepted |
| [0024](0024-playlist-lanes.md) | Song is a playlist: up to 8 lanes of beat blocks at one song tempo; pick a beat, tap a spot | Accepted, built |
| [0025](0025-github-deploys.md) | GitHub deploys every push to main with this repo's own token; agents hold no Cloudflare credentials; the site folder and its ID placeholders live in this repo | Accepted |
| [0026](0026-telemetry-standard.md) | Usage events in the shared telemetry standard: one `track()` call, hooks per category, on by default with the `sendUsage` switch, which also gates the older metrics | Accepted |
| [0027](0027-retire-feature-counts-and-visits.md) | Retire the feature-use counts and visit summaries now the shared events are live; keep devices and activity | Accepted |
| [0028](0028-welcome-and-tips.md) | New people get a welcome (Who's playing?), a stage name and one-time tips; a level-up nudge | Accepted, to build |
| [0029](0029-touch-layouts.md) | 👆 Touch layouts: bands of sounds on the deck (`decks.touch`), named saves as their own records (`touchLayouts`) | Proposed |
| [0030](0030-instruments-who-plays.md) | 🎹 Instruments: who plays Notes, Chords and Bass, a view over the kit (`inst`, `plays`, `shift`, `chord` in boards.json; a person setting each) | Accepted, phase 1 built |

## Template

```markdown
# NNNN. <The decision, as a short sentence>

- **Status:** Proposed | Accepted | Replaced by NNNN
- **Date:** YYYY-MM-DD
- **Decided by:** Ben, YYYY-MM-DD: "<his deciding words>"

**In short.** One or two sentences: the decision and its main cost.

## Context

What forced a choice. Facts, with file names.

## Decision

What was picked, specifically enough to build from.

## Options turned down

Each one, and why not.

## Consequences

What gets easier, what gets harder, and what would make us revisit this.
```
