# One beat engine for Beats, ⌨️ Keys, 🧸 Kids and 🎼 Song

Status: plan, revised after the council's first round (2026-10-26: child-psychologist ⛔, 19 seats ✏️, amateur and pre-reader ✅), and brought up to main on 2026-10-27. Ben approved the build. Steps 0–4 are on main (no behavior change in any of them); steps 5a (🧸 Kids on the engine, today's sound) and 5b (Ben's sound changes) are done on branch `engine-5`. A spike proves the seam (see "The spike"); it is not for landing as it is.

**What main changed since the plan was written** (2026-10-26/27): 🎷 Swing is for every level and swings the eighths (`swingNow()` has no Advanced test); Kids' drums are kick, snare, shaker, clap (`KIDS_DRUMS`); a beat's time signature is stamped (`old-beats.js`, ADR 0035), so nothing guesses it from Settings and `sigOf()` is the beat's own; the scratch re-read on leaving Kids is on main (7405e2c).

**The answer.** Pull the player out of `createSequencer` into one beat engine: the sounds it has loaded, one hit, the beat's mix, a pure rule for which hits are due, and a thin tick that books them on the audio clock. No screen in it. Beats, ⌨️ Keys and 🧸 Kids each play through it, Kids with hooks that keep out what Kids leaves out. 🎼 Song and the groove samples then book their planned hits through the same tick. Three schedulers become one. A beat then sounds the same everywhere: its own bars, its swing, a tune's found note and its loud hits; Kids leaves out only the 🎚️ Mixer and row speed. About 13½ hours in 10 steps, each green on its own; steps 6–9 wait behind the council's round-1 fixes that kids would notice.

## What is decided (2026-10-26)

| On the shared engine, 🧸 Kids… | Who | Why |
|---|---|---|
| plays a tune's sound at its found note (🎵 Find its note, the sound's `root`) | Ben: "Fix wrong notes only" | today Kids plays such a tune off key |
| plays a loud pill loud: the full `ACCENT_GAIN` (1.5), into the output's limiter | Ben (the option he chose named accents); the lead: full, with a test | a grown-up's loud pill is part of the beat |
| plays the beat's swing | Ben: "I definitely want things consistent" | a beat sounds the same everywhere |
| plays a grown-up's 3/4, 6/8 or 7/8 beat in its own bars | the lead | the same beat, the same bars |
| lights a square when its pill is heard (`outputDelay`); iOS reports no `outputLatency`, so there it gains little | the lead | the light keeps with the sound on Bluetooth |
| books 0.2 s ahead (`lookahead` hook) | the audio-engineer, 2026-10-27 | a late hit on a slow phone matters more than 0.1 s of delay |
| keeps each row's volume and the beat's Master volume, as a plain gain | Ben, 2026-10-27 | a quiet row stays quiet; no effects, mute, solo or mixer screen |
| plays a tune row's notes only, even when its sound is also a drum's | the lead | a tune is a tune |
| stays free of the 🎚️ Mixer's effects, mute and solo, and row speed | Ben | Kids has none of those controls; row and Master volume are kept (above) |
| has no 🎵 Find its note of its own | the lead | out of this build |

Rules v2 inherits (bars, which rows play, every hit rings, no mixer, a note is a rate change) go in docs/decisions.md and keys-kids.md in step 5, not only here. decisions.md's "One beat engine" row stays "(to build)" until step 5 lands.

## The council's block, and how it is met

child-psychologist ⛔ "overstimulation with no way to calm it": a double ▶ while the sounds load started two runs; ⏹ stopped one, the other played on.

- The engine hands back the run **before** it loads (`play` is not async; `run.ready` resolves later). Kids claims it at once: ▶ shows ⏹ on the first tap, a second tap is ⏹, and ⏹ while the sounds load calls the start off (`ready` → false, nothing booked).
- Test (`tests/kids-engine.test.mjs`): three taps during a slow load leave one run ticking; ⏹ then books nothing more.

## What Kids does today, against the engine

`kids.js playBeat` (main, f385504) against `sequencer.js schedule` / `sound`.

| | Kids today | The engine (Beats) | On the engine, Kids… |
|---|---|---|---|
| Rows played | the first row of each drum, the first tune row | every audible row | **same**, hook `rows` (`kids-logic.js kidsPlayedRows`); a tune row on a drum's sound is the tune |
| Pills a bar | always 16 | the beat's signature | **changes**: its own bars (lead) |
| Swing | none | `swingDelay` on the eighths, at every level | **changes**: its swing (Ben) |
| Row speed | none | `'speed'` with Advanced (`playMode()`) | **same**, `mode: 'plain'` |
| Mute, solo, effects | none: straight into `audio.master` | `audible`, `busFor` | **same**, `mixer: false` |
| Row volume, Master volume | none | `hitGain`, the mix's master gain | **changes**: a plain gain, `hitGain × masterLevel` (Ben, 2026-10-27) |
| Loud hits | full, like any hit | `ACCENT_GAIN` | **changes**: loud (Ben) |
| A tune note's pitch | `noteRate(p)` | `+ rootShift(root)` | **changes**: its found note (Ben) |
| A hit over the last | never cut | cut unless 🔔 or a tune row | **same**, `ring: () => true` (at most `MAX_RINGING`, 8, a row; Kids had no cap) |
| A stall | late hits dropped (`tooLate`, 20 ms) | the same | **same**: hits only; the clocks, squares and ● go on |
| Booked ahead | 0.12 s | 0.1 s | **changes**: `lookahead: 0.2` |
| First pill | 60 ms after load, or `from` | 50 ms | **same**, `startIn: 0.06`, `from` |
| A row's sound not loaded yet | loaded then | never, until the next ▶ | same as Kids |
| A sound changed or deleted while away | its old sound (cached by clip id) | the same seam | **changes**: as it is now, or silent |
| Squares lit | when booked | — | **changes**: when heard (lead) |
| ● stops as it comes round | counter wraps | — | **same**, `onPass(at)` |
| Count-in | 3 beeps | one bar of blips | same: Kids keeps its beeps and passes `from` |
| A hidden drum | still plays | silent (`anyClip`) | same, hook `clip` |
| A double ▶ while loading | two runs (the block) | — | **fixed**: one run |

## The seam

### The engine

`createBeatEngine({ audio, clipById })`, made once in `app.js` and handed to `createSequencer`, `initKids` and (step 8) `createSong`. No DOM, no storage, no screen state.

| Part | What it is | From |
|---|---|---|
| `ready`, `prepare(clip)` | sounds loaded for the beat maker's own play, `soundHit` and `prepareBeats` (until steps 6 and 8) | `createSequencer` |
| `sound(…, {clipOf, ring, level})` | one hit: gain, rate and found note, length, cut-offs | `createSequencer sound` |
| `busFor(ctx, dest, beat)` | the beat's mix graph | `createSequencer busFor` |
| `prepareBeats`, `soundHit` | the "play a saved beat" path (Song, `share-render.js`, previews) | `createSequencer` |
| `hitsDue(beat, {clocks, pass}, until, opts)` (exported, pure) | the hits, pills and passes due before `until`, and the clocks moved on; refuses a pill length that is not finite and above 0, skips a row with no pills | `schedule`, `kids.js playBeat` |
| `play(hooks)` → `{t0, ready, stop(), stats}` | the run: a 25 ms tick asks `hitsDue`, drops a late hit (`audio.js tooLate`), finds each row's sound again (`clip`) and keeps it by `audio.key(clip)`, books it; `audio.wake()` is its first statement | the same |

The click stays in `sequencer.js` (Beats' `beforeRows` hook in step 6).

### The hooks

| Hook | Default | Beats (step 6) | 🧸 Kids |
|---|---|---|---|
| `beat()` | (needed) | the open `pattern` | the stored scratch (`kidsBeat`), each tick |
| `clip(id)` | `clipById` | default | any sound of the board, hidden ones too; null when gone |
| `from` / `startIn` | now + 0.05 | count-in end | ● count end / 0.06 |
| `go()` | — | the beat still open | Kids showing |
| `lookahead` | 0.1 | default | 0.2 |
| `mode()` | `'plain'` | `playMode()` | `'plain'` |
| `swing(beat)` | 0 | `swingNow()` | the beat's swing, 0–50 |
| `ring(row)` | the row's 🔔 | default | always |
| `rows(beat)` | every row; also which sounds ▶ waits for | default | `kidsPlayedRows` |
| `mixer` | on | on | `false` |
| `onPill(pill, at)` | — | — | a square, lit at `at + outputDelay` |
| `onPass(at)` | — | — | ● stops |
| `onHit(clipId, at)` | — | keys flash | — |
| `onStop()` (step 9) | — | `seq.stop` | `stopBeat` |
| Beats only (step 6): `limit()`, `skip(row, at, dt)`, `beforeRows(until)`, `afterTick()`, `onSteps(shown)` | — | the chip switch, live hits not played twice, the click and growing, `switchNow`, the playhead | — |

`run.stats` counts hits booked, dropped as late, and silent (a sound gone or still loading). Kids logs them once on stop (`kids` `{stopped, hits, late, silent}`, a `log-clean.js` rule, tested).

## What a kid hears and sees differently

| Stays the same | Changes |
|---|---|
| The four drums and the tune; a grown-up's extra rows stay silent | A tune on a sound whose note was found plays in tune |
| Muted rows still sound; no effects; no row speed | A loud pill plays loud; a row's volume and the Master volume are kept |
| Hits ring over each other | A swung beat swings |
| ● counts 3 beeps and stops as it comes round | A 3/4 beat plays in 3/4 (Kids' grid still shows 8 squares over 16 pills: the squares a 3/4 bar has light, the rest never) |
| A beat made in Kids: the same 60 hits at the same times, to the bit (`tests/kids-same-hits.test.mjs`) | Squares light as their pill is heard |
| | A recording deleted on another screen is silent; a changed voice plays as it is now |

A beat made in Kids has no loud pills, no swing, 4/4 bars and its tune on a kit C, so it sounds exactly as before. Only a beat a grown-up changed on 🥁 Beats sounds different. Kids shows no picture for a loud pill (guide.md says so in step 5).

## How Song fits

🎼 Song plans a song once (`planSong` → `seq.beatPlan`) and books the list on its own tick through `seq.soundHit`. 💃 Grooves' ▶ and 🎧's ▶ part (`hearBeat`) book a whole pass at once. `share-render.js` (the public share preview, 🗂️ See all) renders through `beatPlan`, `prepareBeats`, `soundHit` offline.

- **Step 8:** `play` takes a source. A loop source is `hitsDue` (Beats, Kids); a list source is a planned list (Song, `hearBeat`). Both share the tick, the lookahead, the late-hit rule, the voices, `stop`, `onHit` and the stats. `song.js` keeps its planning, its lane gains and its playhead. S7 of [simplify.md](simplify.md) (Song's record rules into `playlist.js`) goes in this step.
- `TICK_MS` and `LOOKAHEAD` become one pair, in the engine.
- Song's playhead still ignores output latency, as today.

## Risks

| Risk | What could go wrong | Mitigation |
|---|---|---|
| A stall | the timers sleep while the clock runs on | main's rule (10b38d1): a hit more than 20 ms late is dropped (`tooLate`), in the loop and the list source; the clocks, `onPill` and `onPass` go on. Today's Kids already drops late hits; −0.05 s is only the click's rule. `tests/late-hits.test.mjs` (Kids, Beats, Song) and a stall test in `kids-engine.test.mjs` |
| Out-of-date sounds | `ready` is keyed by clip id: a sound's old voice, trim or root, or a deleted recording, could play | a run keeps its sounds by `audio.key(clip)` and finds each row's sound again every tick (`clip`); a gone sound is silent. Tests: a voice changed between two ▶, a deleted recording. Beats and Song get the same in steps 6 and 8 |
| A sound that never loads | ▶ waited for every row | only the rows `rows(beat)` plays are waited for; test: a silent extra row that never loads |
| A beat not cleaned | `bpm: -1` gave a negative pill and a loop for ever; a row with no `steps` threw | `hitsDue` refuses a pill length that is not finite and above 0, and skips a row with no pills; test |
| iOS | audio starts only inside the tap | `audio.wake()` is `play`'s first statement, before anything waits; test |
| Per-row clocks | a row joining mid-play must land on the grid; on the first tick every row starts at `t0` | `hitsDue` joins a row from the clocks as they came in; tests |
| Timing on a slow phone | the tick under load | Kids books 0.2 s ahead. Steps 5, 6 and 8 each run `just look <view> --cpu 4 --height 680` (Kids' beat view is new in step 5) and put the `long-animation-frame` numbers in the commit |
| Memory | a hit's gain stays connected after it ends | `src.onended` disconnects it; test. Voice lists stay at 8 a row (`ringOver`); `stop()` fades and drops them |
| Memory | `busFor` keeps a graph per beat object, disposed only when rebuilt for the same object | Kids builds none (`mixer: false`). Step 7 prunes (below) |
| `ready` is shared | `prepareBeats` (Song, previews) clears it | Kids' runs keep their own sounds; Beats and Song move off it in steps 6 and 8 |
| Two runs | a second ▶ or another screen | the run is claimed before it loads (the block); step 9 gives one owner |
| The scratch shared with Beats | leaving Kids, Beats held a stale scratch | on main since 7405e2c (`applyKids` → `showView`, `tests/kids-scratch-back.test.mjs`). Step 0 found it covered and skipped |
| A sync while Kids plays | a reordered row list moves rows under their clocks | as today; step 6's row methods cover Beats |
| A grown-up's 3/4 beat in Kids | it now plays in its own bars, but `kids-logic.js` (`withSquare`, `withBars`, `pillAt`) and the ring round ● still count 16-pill bars | step 5a moves them to the beat's bars (`barSteps`), with a test of a square and a ● note on a 3/4 beat |
| Safari | — | no new Web Audio call; Kids builds no graph |

## Build plan

Each step is one commit (two where it says), green on its own (`just test`), its docs in the same commit. Each equivalence test lands first as its own `test:` commit, green on the old code; new behavior goes through `just prove`.

| # | Step | Min | Tests | Seats |
|---|---|---|---|---|
| 0 | **The scratch re-read on leaving Kids:** already on main (7405e2c, `tests/kids-scratch-back.test.mjs`); skipped | 0 | `tests/kids-scratch-back.test.mjs` | storage-sync |
| 1 | **S5 of [simplify.md](simplify.md):** the pure beat rules into `web/beat.js`, `encodeWav`/`normalize` into `web/wav.js`; `kids-logic.js`, `share-render.js` and the other importers take them from there. Both files in `sw.js` SHELL and layout.md. One push, no dynamic imports | 75 | the suite; `architecture.test.mjs`; `offline.test.mjs` | architect, browser-compat |
| 2 | `test:` **`share-render.js renderAudio`** of a beat and a song: every hit and time, as a JSON fixture | 30 | green on the old code | test-qa |
| 3 | **The engine file, no player yet:** `web/beat-engine.js` (sw.js, layout.md); `app.js` makes it and hands it to `createSequencer`, `initKids`, `createSong`; `share-render.js` named in the architecture table | 45 | the suite; step 2's fixture; `architecture.test.mjs` (only `beat-engine.js` imports `buildMix`) | architect, audio-engineer |
| 4 | `test:` **Kids' same hits** (`tests/kids-same-hits.test.mjs`, `tests/fixtures/kids-beat-hits.json`); and a live check: `just deploy-checks`' taps press ▶ on Kids, Beats and Song and expect a voice booked | 40 | green on the old code; `just taps` on the live site | test-qa, reliability |
| 5a | **Kids on the engine:** `hitsDue`, `play`, Kids' hooks keeping today's sound (for this commit only, a full `level` and no root); the block fixed; late hits, own sounds by `audio.key`, rows-only loading, guards, `wake`, gains let go, stats logged; squares when heard; own bars. Its docs: keys-kids.md, beats-song.md, sound.md, README "Three ✅ → Two ✅", state.md | 120 | `tests/kids-engine.test.mjs`; step 4's test; `kids.test.mjs`; `late-hits.test.mjs`; plus: ● from `from` to `onPass` through kids.js; squares `.now` move per pair of pills and clear on stop; `onPill`'s squares match the hits booked at that `at`; a long drum at a fast tempo reaches the 8-ring cap; `just look kids-beats --cpu 4 --height 680` | all 22 on the plan; then audio-engineer, sound-designer, child-psychologist |
| 5b | **Ben's sound changes, their own small commit:** the found note, the full `ACCENT_GAIN` (the limiter test), the beat's swing. Its docs: guide.md (a beat made on Beats sounds the same in Kids: in tune, its loud hits, its swing; no loud picture; extra rows silent), the CHANGELOG line, decisions.md's rules for v2 | 30 | `just prove` on a found-note sound, a loud pill and a swung beat through kids.js | audio-engineer, sound-designer, child-psychologist |
| — | **Steps 6–9 wait** behind the council's round-1 fixes that kids would notice | | | |
| 6a | `test:` Beats' hits (a plain 1-bar 4/4 beat; a 2-bar swung 3/4 with a 2× row), then **Beats' loop on the engine:** `hitsDue` plus a Beats booking tick; the run owns `clocks`, `voices`, `shown`, `queue`; the click stays in `sequencer.js`. Fix forward: put `schedule` back, the run's arrays kept | 120 | the Beats fixture; `beat-builder`, `keys-playhead`, `beat-rec-stop`, `row-tempo`, `stop-clicks`, `overlap`, `mixer`, `row-volume`, `late-hits`; `just look beats --cpu 4 --height 680` | audio-engineer, test-qa, reliability |
| 6b | **Row edits and the chip switch on the run:** `moveRow`, `removeRow`, `insertRow`; `retime`, `grid`, `beatClock`, `joinClock`, `switchNow` read it. Fix forward: the splices back in `sequencer.js` | 90 | rows moved and removed while playing keep their clocks and voices (no test today); `beat-chips`, `beat-builder` | audio-engineer, test-qa, reliability |
| 7 | **One mix graph per beat id, pruned:** a graph of a beat the run no longer plays is disposed on stop and on delete, once the last voice through it has ended (not a fixed 6 s, so an 🔁 Echo tail is not chopped). A beat with no id (a groove sample, a share preview, `hearBeat`) is keyed by its run; at most 8 graphs live | 60 | `mixer.test.mjs`: one graph per id; live graphs after a delete; an Echo tail rings out | audio-engineer, performance |
| 8 | `test:` Song's events, then **Song and `hearBeat` on the list source;** one `TICK_MS`/`LOOKAHEAD`; S7; `share-render.js` keeps its offline path through the engine's `soundHit` | 105 | the Song fixture; `song.test.mjs`, `song-ui`, `tempo-marks`, `grooves`, `late-hits`; `just look song --cpu 4 --height 680` | audio-engineer, test-qa, reliability |
| 9 | **One thing plays at a time, one owner: the engine.** A run taken over is stopped through its owner (`onStop` → `seq.stop`, Kids' `stopBeat`, `song.stop`), so Beats' read-back of a sync (`readAgain`), ⌨️ Keys' recording end and Kids' `playing` all still run. `audio.js stopAll` stays for pads and keys | 45 | a sync lands while Beats plays, Song ▶ takes over, Beats shows the synced beat and a pill tapped keeps it; `space-stops`, `stop-clicks` | reliability, storage-sync |
| 10 | **Docs sweep for steps 6–9** | 30 | `docs.test.mjs`, `architecture.test.mjs` | docs |

About 790–810 minutes (13½ hours; steps 0–5b are 340–360 of them), plus council rounds (the whole round on step 5's plan; the named seats on each finished step, about 15 minutes each).

## What docs/architecture/, the docs and the test must change

| File | Change, and the step |
|---|---|
| `README.md` | Beat scheduler: **Three ✅** → **Two ✅** (5a) → **One ✅** (8). Mixer: Kids plays with `mixer: false` (5a). "Way to stop everything": the engine owns runs (9). Seams: "Two beat players" (5a) and "Players outside `audio.playing`" (9) |
| `beats-song.md` | the engine as its own object, and `share-render.js` (the public share preview, 🗂️ See all) rendering through its `soundHit` (3); clocks table, Kids' and Song's timers (5a, 8); seams "Four beat schedulers", `TICK_MS`/`LOOKAHEAD`, mix-graph disposal (7), `ready` shared (6, 8); "To change" names `beat-engine.js` |
| `keys-kids.md` | "Its own scheduler" becomes "On the beat engine": the hooks and the rules above (5a); "What Kids shares" gains the engine; the Beats row; the seams "Two beat players" and "a tune sound's `root` ignored" (5b); 🔔 Overlap: Kids uses `ringOver` |
| `sound.md` | "all three" schedulers and the `playBeat` lines (5a); the hit path at `beat-engine.js sound` (3); the WAV encoder at `wav.js` (1) |
| `tests-tools.md` | the new tests and `tests/fixtures/` (2, 4, 5a) |
| `docs/guide.md` | Kids' beat (5b) |
| `docs/decisions.md` | "One beat engine" leaves "(to build)" (5a); the rules for v2 (5b) |
| `tests/architecture.test.mjs` | schedulers → `['beat-engine.js', 'song.js']` (5a), then `['beat-engine.js']` (8); one tick and lookahead (8); Kids plays through `deps.engine.play`, has no `setInterval` or `makeVoice`, imports only `beat.js` rules (5a, 1); `buildMix` only in `beat-engine.js` (3); `ringOver` users (5a); the WAV encoder in `wav.js` (1) |

## The spike

Branch `worktree-agent-ac57bc065bf6a7a2f`. The first spike is `52fee03`, kept by the tag `spike/one-beat-engine-1`; `just archive-agent` will tag the branch tip `archive/worktree-agent-ac57bc065bf6a7a2f`. Not for landing: the engine sits inside `sequencer.js` (step 3 moves it), Ben's changes are not split out (5b), and the docs are not changed.

- `test:` `tests/kids-same-hits.test.mjs` and `tests/fixtures/kids-beat-hits.json`: a beat made in Kids (four bars, 13 squares, a tune with a held, a half-pill and a last-pill note) books its 60 hits at the old player's times. It imports only what the old code has, and passes on main's player (f385504) and on the engine. The clock moves 25 ms at a time and the tick is called by hand.
- `spike:` `sequencer.js createBeatEngine` and `hitsDue`; `app.js` makes the engine; `kids.js playBeat` claims its run at once and passes Kids' hooks; `kids-logic.js kidsPlayedRows`; `log-clean.js` Kids' stop fields. `tests/kids-engine.test.mjs` (14 tests): `hitsDue` (own bars and swing, an uncleaned beat, rows and mixer); the run (pills, passes, a row joining, a stall, a changed and a deleted sound, rows-only loading, `wake` first, a stop while loading, gains let go); Kids' rows and Ben's calls; the block through kids.js; a found note and a loud pill through kids.js into the limiter; the stop log.

Not tested here: how it sounds, the limiter's hold on a pile of loud hits, iOS's tap rule itself, and timing on a slow phone. They need a browser (`just look --cpu 4`) and a real device.
