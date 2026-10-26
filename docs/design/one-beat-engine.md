# One beat engine for Beats, ⌨️ Keys, 🧸 Kids and 🎼 Song

Status: plan, for Ben's OK. A spike proves the seam (`spike:` commits on this branch, not to be landed as they are).

**The answer.** Pull the player out of `createSequencer` into one beat engine: the sounds it has loaded, one hit, the beat's mix and a loop on the audio clock, with no screen in it. Beats, ⌨️ Keys and 🧸 Kids each play through it, Kids with hooks that keep out what Kids leaves out. 🎼 Song and the groove samples then book their planned hits through the same loop. Three schedulers become one. A kid hears two changes, both decided by Ben: a tune plays its found note, and a loud hit is loud. Everything else Kids does stays as it is. About 9½ hours of work in 8 steps, each green on its own.

## What Ben decided (2026-10-26)

Ben: "Fix wrong notes only."

| On the shared engine, 🧸 Kids… | Why |
|---|---|
| plays a tune's sound at its found note (🎵 Find its note, the sound's `root`), as Beats does | today Kids plays such a tune off key |
| plays a loud hit loud (`ACCENT_GAIN`), as Beats does | a grown-up's loud pill is part of the beat |
| stays free of the 🎚️ Mixer (row level, mute, solo, effects, master), swing and row speed | Kids has none of those controls; hooks keep them out |

Everything else stays as Kids plays it today, through hooks (the table below). No question waits on Ben. One idea is offered, not asked: light the squares when they are heard (see "Offered").

## What Kids does today, against the engine

`kids.js playBeat` against `sequencer.js schedule` / `sound`. "Hook" means the engine does it Beats' way unless Kids' hook says otherwise.

| | Kids today | The engine (Beats) | On the engine, Kids… |
|---|---|---|---|
| Rows played | the first row of each of the four drums, and the first tune row | every row | **same**, hook `rows` (`kids-logic.js kidsPlayedRows`) |
| Pills a bar | always 16 | the beat's signature | **same**, hook `bar: () => STEPS` |
| Row speed | none | `stepSeconds` in `'speed'` with Advanced | **same**, hook `mode: 'plain'` |
| Swing | none | `swingDelay` with Advanced | **same**, no `swing` hook (0) |
| Row level, mute, solo | ignored: every row full | `hitGain`, `audible` | **same**, hook `mixer: false` |
| 🎚️ effects, master level | none: straight into `audio.master` | `busFor` → `mixer.js buildMix` | **same**, hook `mixer: false` |
| Loud hits | full, like any hit | 1.5 × (`ACCENT_GAIN`) | **changes**: loud (Ben) |
| A tune note's pitch | `noteRate(p)` | `noteRate(p + rootShift(root))` | **changes**: its found note (Ben) |
| A hit over the last | never cut | cut with a short fade unless 🔔 or a tune row | **same**, hook `ring: () => true` (up to `MAX_RINGING`, 8, at once a row; Kids never capped them, but a beat of short drums rarely stacks 8) |
| A tune note's length, half-pill notes | `len`, `n.s − p` | the same sums (`pillHits`) | same |
| When the first pill sounds | 60 ms after the sounds load, or `from` after ● counts | 50 ms | **same**, hooks `startIn: 0.06`, `from` |
| Booked how far ahead | 0.12 s | 0.1 s (`LOOKAHEAD`) | 0.1 s: the hits land at the same times; they are booked 20 ms later (Risks) |
| The clock | one counter for every row | one clock per row | same times to the bit in plain mode (the test) |
| A row's sound not loaded (● makes the tune row while it plays) | loaded then, plays once it is | never: `hit` returns early until the next ▶ | same as Kids: the engine loads it then |
| Squares lit | a `setTimeout` per square at its booked time | the playhead at the heard time (`stepsHeard`, `outputDelay`) | **same**, hook `onPill(pill, at)` |
| ● stops as it comes round | `onPass(at)` when the counter wraps | none (⌨️ Keys' `growHook` counts on the click) | **same**, hook `onPass(at)` |
| Count-in | 3 beeps, `kids.js beep` | one bar of blips (`play({countIn})`) | same: Kids keeps its own beeps and passes `from` |
| Tempo while playing (🐢 🏃) | the next pill at the new spacing | the same, read every pill | same |
| A hidden drum | still plays (`includeHidden`) | silent (`anyClip` skips hidden) | same, hook `clip` |

## The seam

### The engine

`createBeatEngine({ audio, clipById })`, made once by `createSequencer` and handed out as `seq.engine` (app.js passes it to `initKids`). No DOM, no storage, no screen state.

| Part | What it is | Moved from |
|---|---|---|
| `ready`, `prepare(clip)` | sounds loaded for scheduling | `createSequencer` |
| `sound(ctx, dest, list, row, loaded, time, loud, note, len, {clipOf, ring, level})` | one hit: gain, rate and found note, length, cut-offs | `createSequencer sound` |
| `busFor(ctx, dest, beat)` | the beat's mix graph, cached | `createSequencer busFor` |
| `prepareBeats`, `soundHit` | the "play a saved beat" path (Song, previews) | `createSequencer` |
| `play(hooks)` → `{t0, stop()}` | the loop: a 25 ms tick books every hit before `currentTime + 0.1`, a clock per row, and one more on the beat's plain grid for the hooks | `createSequencer schedule` and `kids.js playBeat` |

### The hooks

| Hook | Default | Beats (step 4) | 🧸 Kids |
|---|---|---|---|
| `beat()` | (needed) | the open `pattern` | the stored scratch (`kidsBeat`), read each tick |
| `clip(id)` | `clipById` | default | any sound of the board, hidden ones too |
| `from` / `startIn` | now + 0.05 | count-in end / default | ● count end / 0.06 |
| `go()` | — | the beat still open | `!playing && showing` |
| `mode()` | `'plain'` | `playMode()` | `'plain'` |
| `bar(beat)` | the signature's pills | `bar()` | 16 |
| `swing(beat)` | 0 | `swingNow()` | — |
| `ring(row)` | the row's 🔔 | default | always |
| `rows(beat)` | every row | default | `kidsPlayedRows` |
| `mixer` | on | on | `false` |
| `onPill(pill, at)` | — | — | light a square |
| `onPass(at)` | — | — | ● stops |
| `onHit(clipId, at)` | — | keys flash, stats | — |
| Beats only (step 4): `limit()`, `skip(row, at, dt)`, `beforeRows(until)`, `afterTick()`, `onSteps(shown)` | — | the chip switch at the bar line, live hits not played twice, the click and growing, `switchNow`, the playhead | — |

Kids leaves out `onSteps`, `limit`, `skip`, the click, `retime`, `grid`, `beatClock` and stats. Beats' per-row arrays (`clocks`, `voices`, `shown`, `queue`) move into the run, with `moveRow`, `removeRow`, `insertRow` on it for the edits that splice them today.

## What a kid hears differently

| Stays the same, through a hook | Changes (Ben, 2026-10-26) |
|---|---|
| The four drums and the tune, nothing a grown-up added | A tune on a sound whose note was found plays in tune |
| Every hit at full level, muted or not; no effects | A loud pill a grown-up made plays loud |
| 16 pills a bar, straight, every row on the beat | |
| Hits ring over each other | |
| Squares light when booked; ● counts 3 beeps and stops as it comes round | |
| The same hit times, to the bit (`tests/kids-engine.test.mjs`) | |

A beat a kid made in Kids has no loud pills and its tune is on a kit C, so it sounds exactly as before. Only a beat a grown-up changed on 🥁 Beats can sound different. Both changes are kid-facing: the council's whole round (docs/council.md) reviews the plan before step 3 and the finished change after.

## How Song fits

🎼 Song plans a song once (`planSong` → `seq.beatPlan` per beat) and books the planned list on its own 25 ms tick, through `seq.soundHit`. 💃 Grooves' ▶ and 🎧's ▶ part (`hearBeat`) book a whole pass at once.

- **Step 6:** `engine.play` takes a source. A loop source is today's per-row clocks (Beats, Kids). A list source is a planned list of `{time, row, beat, loud, note, len, key}` (Song, `hearBeat`). Both share the tick, the lookahead, the voices, `stop` and `onHit`. `song.js` keeps its planning, its lane gains (the `dest` of each event) and its playhead.
- `TICK_MS` and `LOOKAHEAD` are then one pair, in the engine. The seam "separate constants in sequencer.js and song.js" goes.
- Song's playhead still ignores output latency, as today: a fix for later, not part of this.

## Risks

| Risk | What could go wrong | Mitigation |
|---|---|---|
| Timing | Kids books 0.1 s ahead, not 0.12 s: a main thread stalled 75–95 ms loses a hit it kept before | Beats has run at 0.1 s since 1.0. Step 3 checks Kids with `just look kids-beats --cpu 4` and `long-animation-frame` entries |
| The audio clock | `from` in the past (a slow load after ● counts) books the first pills late, in a pile: Kids does this today too | the engine may drop pills already past `now − 0.05` (as `scheduleClicks` does): step 4, with a test |
| Per-row clocks | a row new mid-play joins a row at its speed; on the first tick every row must start at `t0` (the spike's first try skipped pill 0 on rows 2–5) | the spike starts every clock at `t0`; `tests/kids-engine.test.mjs` |
| Safari | `src.start(time, 0, duration)`, `setTargetAtTime` on the master, a GainNode per voice: Beats uses them all today on iOS | no new Web Audio call. Kids with `mixer: false` builds no graph at all |
| Memory | `busFor` keeps a graph per beat object and disposes one only when rebuilt for the same object; Kids replaces its beat on every square | Kids skips the mixer (`mixer: false`), so it builds no graph. Step 5 keys the cache by beat id and disposes a replaced graph (also the Warble/Robot oscillator seam), for Beats and Song |
| Memory | the run's voice lists grow with ringing hits | `ringOver` keeps at most 8 a row; `stop()` fades and drops them |
| `ready` is shared | `prepareBeats` (Song, previews) clears it; Beats' ▶ clears it | the engine loads a missing sound on the next hit instead of going quiet (Beats' seam too); one run at a time (step 7) |
| The scratch shared with Beats | Kids writes the scratch behind the sequencer's back; leaving Kids calls no `seq.show()`, so Beats may hold a stale scratch (an existing seam) | unchanged by this. Offered: `applyKids` calls `seq.show(beatView())` on the way out, with a test |
| A sync while Kids plays | a reordered row list moves rows under their clocks | as today (Kids' rows only append). Step 4's `moveRow`/`removeRow` cover Beats |
| Kids' beat unclean | the engine expects cleaned rows (`accents`, `tune`, `rate`) | every writer cleans: `kids-logic.js` (`cleanRow`), `sequencer.js save`, `backup.js`/cloud (`cleanPattern`) |

## Build plan

Each step is one commit, green on its own (`just test`), its docs in the same commit.

| # | Step | Minutes | Tests that prove it |
|---|---|---|---|
| 1 | **S5 of [simplify.md](simplify.md):** the pure beat rules out of `sequencer.js` into `web/beat.js` (`cleanRow`, `cleanPattern`, `planHits`, `pillHits`, `stepSeconds`, `swingDelay`, `audible`, `hitGain`, `noteRate`, `multiplyRows`, the constants…) and `encodeWav`/`normalize` into `web/wav.js`. `kids-logic.js` then imports `beat.js`, not the beat maker. `web/sw.js` SHELL, layout.md | 60 | the whole suite; `architecture.test.mjs` (the WAV encoder lives in `wav.js`; `kids-logic.js` imports no DOM module); `offline.test.mjs` |
| 2 | **The engine, no player yet:** `web/beat-engine.js createBeatEngine` with `ready`, `prepare`, `sound`, `busFor`, `soundHit`, `prepareBeats`; `createSequencer` uses it; `seq.engine` | 45 | the suite; `architecture.test.mjs`: only `beat-engine.js` imports `buildMix`; `ringOver` users; `soundHit` path |
| 3 | **Kids on the engine:** `engine.play(hooks)`; `kids.js playBeat` passes Kids' hooks; `kidsPlayedRows`; Ben's two changes. Council: the whole round on the plan first | 90 | `tests/kids-engine.test.mjs` (the same hits at the same times, passing on the old player too; onPill, onPass, a row added while playing; the found note and loud hits, no mixer, Kids' rows only); `tests/kids.test.mjs` (● tune) |
| 4 | **Beats on the engine:** `schedule` becomes `engine.play` with Beats' hooks; the run owns `clocks`, `voices`, `shown`, `queue` with `moveRow`/`removeRow`/`insertRow`; `retime`, `grid`, `beatClock`, `joinClock` read the run | 180 | a new equivalence test for Beats (hits and times of a 2-bar, swung, 3/4 beat with a 2× row, on the old code and the new); a row moved and one removed while playing keep their clocks (no test today); `beat-builder`, `beat-chips`, `keys-playhead`, `beat-rec-stop`, `row-tempo`, `stop-clicks`, `overlap`, `mixer`, `row-volume` |
| 5 | **One mix graph per beat id**, a replaced one disposed after 6 s | 45 | `tests/mixer.test.mjs`: a beat re-cleaned keeps its graph; a changed effect disposes the old one (fake timers) |
| 6 | **Song and `hearBeat` on the engine's list source;** one `TICK_MS`/`LOOKAHEAD` | 90 | a Song equivalence test (every event at the same time and lane, before and after); `song.test.mjs`, `song-ui`, `tempo-marks`, `grooves` |
| 7 | **One thing plays at a time, in the engine:** `play` stops the run before it; the `onPlay` / `seq.stop()` / `song.stop()` chain where it is now redundant | 30 | `space-stops`, `stop-clicks`, and a test that Song ▶ stops Beats and Kids ▶ stops a groove sample |
| 8 | **Docs sweep:** guide.md (Kids' tune in tune, loud pills), decisions.md's row for Ben's answer, architecture (below), CHANGELOG line | 30 | `docs.test.mjs`, `architecture.test.mjs` |

About 570 minutes (9½ hours), plus two council rounds of about 30 minutes each (step 3's plan and finished change). Steps 1–3 stand alone: if the build stops there, Kids is on the engine and Ben's two fixes are live.

## What docs/architecture/ and its test must change

| File | Change |
|---|---|
| `README.md` "One or several?" | Beat scheduler: **Three ✅** → **Two ✅** after step 3 (the engine; Song), **One ✅** after step 6 (`beat-engine.js`, a loop source and a list source). Mixer: drop "🧸 Kids bypasses it", say Kids plays with `mixer: false`. Seams: drop "Two beat players"; "Players outside `audio.playing`" loses Kids' beat as a separate player |
| `beats-song.md` | "In one paragraph": the engine as its own object. Clocks table: Kids' `run.timer` and Song's `timer` rows go (step 3, step 6). Seams: "Four beat schedulers", "`TICK_MS` and `LOOKAHEAD`", the mix-graph disposal seam (step 5) and "The `ready` cache is shared" are rewritten or go. "To change": scheduler timing and "how a hit sounds everywhere" name only `beat-engine.js` |
| `keys-kids.md` | "Its own scheduler, beside `sequencer.js`" becomes "On the beat engine": the hooks table above. "What Kids shares" gains the engine (`deps.engine`). Seams: "Two beat players" goes. "🔔 Overlap: one rule, three players": Kids now uses `ringOver` (ringing). Count-ins and Latency stay. "To change: how a beat plays everywhere" names the engine only |
| `sound.md` | the hit path and render order point at `beat-engine.js sound`; WAV encoder at `wav.js` (step 1) |
| `tests-tools.md` | `tests/kids-engine.test.mjs` |
| `tests/architecture.test.mjs` | "schedulers on the audio clock" → `['beat-engine.js', 'song.js']`, then `['beat-engine.js']` (the click's `aloneTimer` moves with the click in step 4); "Beats and Song share one tick and lookahead" → one constant in the engine; "Kids takes only STEPS and noteRate" → Kids plays through `deps.engine.play`, has no `setInterval` or `makeVoice`, imports only `beat.js` rules; "the mix bus is built only by" → `beat-engine.js`; `ringOver` users; "the WAV encoder" → `wav.js` |

## The spike

On this branch, as `spike:` commits. Not for landing: the engine sits inside `sequencer.js` (step 2 moves it), and the docs above are not yet changed.

- `sequencer.js createBeatEngine`: `ready`, `prepare`, `sound`, `busFor`, `prepareBeats`, `soundHit` moved out of `createSequencer`, which now uses them from the engine; `play(hooks)` is the loop. `seq.engine` hands it out.
- `kids.js playBeat`: no `setInterval`, no `makeVoice`; it calls `deps.engine.play` with Kids' hooks. `kids-logic.js kidsPlayedRows`.
- `app.js` passes `engine: seq.engine` to `initKids`.
- `tests/kids-engine.test.mjs`: (1) the kid's beat (four bars, 13 squares, a tune with a held, a half-pill and a last-pill note) books its 60 hits at exactly the times Kids' old player booked them, and goes round again; this test was written and passed on the old player first, then on the engine. (2) The engine alone: `onPill` on every pill, `onPass` with when the next pass starts, a row added while playing loads its sound and joins on the grid, `stop` fades. (3) Ben's call: a found note and a loud hit play as on Beats; a muted, quiet row sounds full, straight into the output; only Kids' rows play.
- `tests/architecture.test.mjs`: the schedulers are `sequencer.js` and `song.js`; Kids plays through `deps.engine.play`.

Not tested here: how it sounds, and timing on a slow phone. Both need a browser (`just look --cpu 4`) and a real device.

## Offered, not asked

- **Squares lit when heard.** Today a square lights when its pill is booked, not when it comes out of the speaker: on Bluetooth the light runs ahead of the sound by up to 0.2 s. The engine can tell Kids the heard pill instead (`onSteps`, as Beats' playhead). A kid-facing change: Ben's yes and a council round first.
- **Leaving Kids re-reads the scratch on Beats** (`seq.show`), closing the stale-scratch seam. A fix, about 20 minutes with its test.
