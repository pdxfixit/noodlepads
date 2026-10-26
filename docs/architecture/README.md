# Architecture

How the parts of the app connect: which engines are shared, who calls whom,
and where each cross-cutting job lives. Read it before searching the code for
"is there one X or several". [layout.md](../layout.md) is the file map (one line
per file); [guide.md](../guide.md) is what the app does. This file is the wiring
between them.

**Keep it true.** A change that adds, removes, merges or splits an engine, a
store, a scheduler, a path into the cloud or a module's role updates this file
in the same commit. `tests/architecture.test.mjs` checks the claims marked ✅
against the code and fails, naming this file, when they drift.

## The shape

- **One page, one composition root.** `web/index.html` loads `app.js`, which
  imports almost every module, builds the big ones and hands each what it needs.
- **Factories with `deps`.** The big screens are made by a function that takes
  its elements and its collaborators: `createSequencer(deps)`,
  `createSong(deps)`, `createDJ({ el, deps })`, `initKids(deps)`,
  `initCloud(deps)`, `createTelemetry(deps)`. They never import `app.js`.
  To learn what a screen can reach, read its block in `app.js`
  (`makeSequencer`, `makeSong`, the `createDJ` and `initKids` calls).
- **Pure rules beside the DOM code.** A screen's rules sit in a module with no
  DOM and no storage, so Node tests them: `model.js` (board),
  `notes.js` (piano roll), `playlist.js` (song), `rhythm.js` and `keyset.js`
  (keys), `touch.js` and `touch-grid.js` (👆 layout), `kids-logic.js`,
  `instruments.js`, `cloud-sync.js`, `merge3.js`, `synth.js`, `mix.js`,
  `pitch.js`, `listen.js`. Many exports at the top of `sequencer.js` are pure
  too (`planHits`, `cleanPattern`, `encodeWav`).
- **Page-wide helpers.** `ui.js` (`$`, the banner `showNotice`, `announce`),
  `dialogs.js` (closing every `<dialog>` one way), `util.js`, `tooltips.js`.

## Sound

**One AudioContext ✅.** `audio.js` makes it (`audio.context()`, woken by
`audio.wake()` after a real tap). Everything that plays out loud goes into
`audio.master` → a hard limiter → `audio.analyser` → the speakers.
`meter.js` reads the analyser for the grilles and pad fills. 🎧 From a song
captures on the same context (`listen-ui.js` passes `audio.wake()`;
`listen-input.js` makes its own only when called without one ✅).

What `audio.js` owns:

| Job | Where |
|---|---|
| Decoding, trimming, caching a clip's audio | `audio.load`, `original`, `recording` (one decode per bundled file, shared by every note of an instrument) |
| Its voice chain, rendered and cached by recipe | `audio.load` → `voices.js applyChain` (an `OfflineAudioContext`); `audio.key(clip)` names the cached copy |
| One-shot, looping, stopping | `audio.play`, `start`, `loop`, `unloop`, `stop`, `stopAll` |
| Loops in time with a playing beat | `audio.loopInTime`, `syncLoops`, over `audio.grid` (set by `app.js` to `seq.grid()`) |
| One voice, and a click-free stop | `makeVoice(ctx, buffer, dest)`, `fadeStop` (exported, used by every scheduler) |

Who plays through what:

| Screen | Plays by | Timing |
|---|---|---|
| 🔊 Pads | `audio.play` / `audio.loop` / `loopInTime` | on tap |
| 🥁 Beats, ⌨️ Keys' beat, 🎹 roll's ▶ | `sequencer.js` (its `schedule` tick) | audio-clock lookahead |
| 🎤 Live keys and 👆 bands | `dj.js hit` → `deps.playOnce` → `audio.play`; ● Record writes into the beat through `seq` | on tap |
| 🎼 Song | its own tick in `song.js`, sounding each hit with `seq.soundHit` | audio-clock lookahead |
| 🗂️ My beats' ▶, 🗂️ See all, share previews | `seq.beatPlan` + `prepareBeats` + `soundHit` | lookahead / offline |
| 🧸 Kids' beat and ● tune | **its own** `playBeat` tick in `kids.js`, straight into `audio.master` | audio-clock lookahead |
| The sound sheet | `audio.start(…, { via })`: live `steps.js` nodes between the sound and its fader | on tap |

**The shared "play a saved beat" path** is three methods on the sequencer:
`beatPlan(raw)` (every hit of one pass), `prepareBeats(patterns)` (load their
sounds) and `soundHit(ctx, dest, …)` (one hit through the beat's mixer bus).
Song (live and Save as a sound), share previews and My beats' ▶ use it, so a
beat sounds the same everywhere. Use it for any new place that plays a beat.

**Schedulers on the audio clock ✅:** three, each a 25 ms `setInterval` that
books hits a little ahead: `sequencer.js` (the beat, and the click alone),
`song.js`, `kids.js`. Kids' is a separate copy: it ignores row loudness,
mute, solo and the 🎚️ Mixer, and plays only the drum squares and the tune row.
A timing fix in one scheduler does not reach the others.

**The mixer** is per beat: `sequencer.js busFor(ctx, dest, pattern)` builds a
bus (`buildMix`: each row's level, mute, solo and effect, then the master)
for any destination, live or offline. Effects are `steps.js` kinds that run
live; `mixer.js` draws the strips.

**A sound's chain:** `voices.js` (the voices and the render, in an
`OfflineAudioContext`), `steps.js` (each building block, live or rendered,
one `build()` for both), `stretch.js` in `stretch-worker.js` (Fast and Slow),
`tweaks.js` and `voice-knobs.js` (Knobs, voices as knob settings), `cuts.js`
(trim, edits, fades as data). The original audio is never changed.

**Offline renders ✅** (`OfflineAudioContext`): `voices.js` (every voiced
clip), `sequencer.js bounce` (a beat → a sound), `song.js` (a song → a
sound), `share-render.js` (share previews). The WAV encoder they share is
`encodeWav` in `sequencer.js`.

**The microphone ✅:** two recorders, each its own `getUserMedia` +
`MediaRecorder`: the sound sheet's (`sheet.js`) and 🧸 Kids' (`kids.js`).
🎧 From a song captures through an AudioWorklet (`listen-input.js`,
`listen-worklet.js`), not a recorder.

## Data

```
boards.json (the kit) ─┐
IndexedDB (store.js) ──┴─► state.js (memory; persist) ─► model.js (pure rules) ─► board.js (lookups) ─► screens
                              ▲                                                    
           backup.js / merge.js / cloud-sync.js (everything that comes in)
```

- **`store.js`** owns the IndexedDB database `noodle-pads`: the list of
  stores, `SCHEMA`, `upgradeStores`. A new store or field starts here.
- **`state.js`** holds what is in memory (`state`) and writes it
  (`persist(store, value)`). Every stored change goes through it, so a
  failed write is reported one way.
- **`model.js`** is the board's rules (people, clip order, edits, presets);
  **`board.js`** binds them to `state` (`clipsFor`, `currentPerson`, `people`).
- **Settings:** `settings.js` declares every one (`SETTINGS`: default,
  allowed values, `scope` person or device). Read with `getSetting`, change
  with `setSetting`, react with `onSetting`. A person's travel in `prefs`.
- **Anything that comes in** (a backup, a cloud pull, a beat file) is cleaned
  by `backup.js` (`cleanBackup`) and merged by `merge.js`; cloud records merge
  three ways first (`merge3.js`). One gate, so the limits hold everywhere.
- **The cloud:** `cloud.js` (binds to the device's storage, when to sync) →
  `cloud-sync.js` (the rules, run on injected storage and API) →
  `cloud-api.js` (the routes) → `worker/index.js` → `worker/cloud.js` (D1).
  The board never waits on it.
- **Ids:** a kit sound on a board is `<personId>-<kit id>`; recorded sounds
  are `newId` ids in `clips`. `reid.js` renames an old plain person id
  everywhere.

## Screens

- `app.js` `SCREENS` is the bottom bar's four: `pads`, `beats`, `song`,
  `live`; `setScreen(name)` switches. 🎉 Play is Pads and Live, 🛠️ Make is
  Beats and Song.
- **One keys panel, two places:** `dj.js` is 🎤 Live (`setMode('free')`) and
  🥁 Beats with ⌨️ Keys on (`setMode('beat')`). Beats with Keys off is
  `sequencer.js`'s rows. Both show the one open beat.
- **🧸 Kids** (`kids.js`) is its own set of screens over the same people,
  sounds and beats. It shares data and `audio.js`, not the regular screens'
  code (see its scheduler and recorder above).
- **Sheets:** the sound sheet (`sheet.js`, with `wave.js`, `chop.js`,
  `shape.js`), people (`people.js`), backups (`backup-ui.js`), settings
  (`settings-ui.js`), cloud (`cloud-ui.js`). Edit sounds is `pads.js` +
  `bulk.js`.
- **A new person's first steps:** `firsts.js` (the switch tests use),
  `welcome.js`, `tips.js`, `nudge.js` (ADR 0028).

## What leaves the device

| What | Written by | Cleaned by | Sent by | Lands in |
|---|---|---|---|---|
| Problem report (opt-in) | `logEvent` (`log.js`) | `log-clean.js` `RULES`; `worker/clean.js` | `log-send.js` | `/api/log` → `worker/reports.js` → D1 |
| Usage events | `track` (`telemetry.js`, `EVENTS`); `track-page.js`, `play-count.js` | `telemetry.js cleanDetails` | `events-client.js` (vendored) | `/api/events` → `worker/events-worker.js` → R2 |
| Device metrics | `device-meta.js` header on cloud calls | — | `cloud-api.js` | `worker/metrics.js` → D1 |
| Cloud profiles, shares | `cloud.js` | `backup.js cleanBackup`; the Worker's own checks | `cloud-api.js` | `worker/cloud.js` → D1 |

`worker/index.js` routes `/api/` by path; every other path is the static site.

## Known seams

Places where one job is done twice or lives in an odd home. Before
fixing a bug in one, check the others.

- Two beat schedulers that play beats differently: `sequencer.js` and `kids.js` (Song's tick
  reuses the sequencer's `soundHit`, so it is not a third copy of the sound).
- Two microphone recorders: `sheet.js` and `kids.js`.
- `encodeWav` and `normalize` live in `sequencer.js`, but the sheet, chop,
  keys, song and share previews import them for their own WAVs.
