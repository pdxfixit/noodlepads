# Architecture

How the code is wired: which engines are shared, who calls whom, the record
shapes that cross modules, where one job is done twice, and what to touch to
change something. Read the area your task touches before you search the code.
[layout.md](../layout.md) is the file map (one line per file);
[guide.md](../guide.md) is what the app does. These files are the wiring
between them.

**Keep it true.** A change that adds, removes, merges or splits an engine, a
store, a scheduler, a record shape that crosses modules, a path off the
device or a module's job updates the area file in the same commit. So does a
fix to a seam listed here. If you searched the code for something these files
should have told you, add it. `tests/architecture.test.mjs` checks the files
against the code: every module in `web/` and `worker/` is named here, every
file and function cited still exists, and every claim marked ✅ holds. When it
fails, fix the doc as well as the test.

## The areas

| File | Covers |
|---|---|
| [sound.md](sound.md) | The one AudioContext and its output graph, `audio.js` state and caches, a tap to a sound, play/loop/ring/rate, loops in time with a beat, a sound's chain (cuts, steps, knobs, voices) and its render order, live preview vs render, the stretch worker, loudness, instruments, recording and capture, 🎧 From a song end to end |
| [beats-song.md](beats-song.md) | 🥁 The beat, row, note and beat-file records; the open beat, the library and the scratch; the scheduler (clocks, rates, bars, swing, click, latency); the mix bus; the shared "play a saved beat" path; Save as a sound; 💃 Grooves; tune rows and 🎹 the roll; 🎼 Song's record, clock and undo; every `deps` callback |
| [keys-kids.md](keys-kids.md) | ⌨️ Keys / 🎤 Live / 👆 touch layouts: the deck record, how a key finds its sound, the hit path, takes, ● Record into the beat, ✏️ Layout; 🧸 Kids: its screens, its own scheduler and recorder, the kid's beat, the grown-up gate, what it shares |
| [data.md](data.md) | Every IndexedDB store and record, the in-memory `state`, how writes happen, start-up order, presets vs own sounds, ids, people, pad order and groups, levels and settings, backups, `cleanBackup`, merging, Older sounds, deleting and Undo |
| [cloud.md](cloud.md) | Cloud profiles: keys, PINs, a sync end to end, record shapes, D1 tables, every `/api/` route and limit, shares; problem reports, usage events, metrics, feedback; the service worker, the update bar, the CSP, privacy text vs code |
| [shell.md](shell.md) | `app.js`: start-up from module load to first paint, the composition root, who is showing, screens and views, levels, the banner and announcer, all 33 dialogs, tooltips, ❓ Help, first steps (ADR 0028), skins, the backdrop, emoji pickers, the classes JS puts on the page, keyboard, a `styles.css` map |
| [tests-tools.md](tests-tools.md) | How a test starts the real app (`installPage`, `settle`), the stand-in page, IndexedDB and D1 and their limits, the whole-repo guards, every test file, the justfile, `just look`, the live checks, version stamping, CI and deploy |

Each area file ends with **Seams** (one job done twice, or in an odd home),
**Invariants and gotchas** (with the test that guards each), and **To change
X, touch …**.

## The shape

- **One page, one composition root ✅.** `web/index.html` loads `app.js`. It
  is the only module that calls the screens' factories and `init*`
  functions, and hands each its elements and `deps`. No module imports
  `app.js`. See shell.md "The composition root".
- **Factories with `deps`.** `createSequencer`, `createSong`, `createDJ`,
  `createTelemetry` return an object. `initKids`, `initCloud`, `initPads` and
  the other `init*` functions fill module-level state instead. To learn what
  a screen can reach, read its block in `app.js`.
- **Pure rules beside the DOM code.** Each screen's rules sit in a module
  with no DOM and no storage, so Node tests them: `model.js`, `notes.js`,
  `playlist.js`, `rhythm.js`, `keyset.js`, `touch.js`, `touch-grid.js`,
  `kids-logic.js`, `instruments.js`, `cloud-sync.js`, `merge3.js`,
  `synth.js`, `mix.js`, `pitch.js`, `listen.js`, `listen-dsp.js`. Several of
  them import nothing at all ✅.
- **The Worker imports from `web/` ✅** (`agent`, `device-meta`,
  `emoji-check`, `instruments`, `log-clean`, `model`, `names`, `reid`), so
  the rules both sides apply are written once.

## One or several?

The questions agents ask most. ✅ marks a claim `tests/architecture.test.mjs` checks.

| Is there one…? | Answer | Read |
|---|---|---|
| AudioContext | **One ✅**, `audio.js audio.context()`. Everything audible goes `audio.master` → limiter → analyser → speakers. 🎧 From a song captures on the same one. | sound.md |
| Beat scheduler | **Three ✅**, each a 25 ms tick on the audio clock: `sequencer.js` (the beat, the click), `song.js` (same tick and lookahead ✅; sounds each hit with `seq.soundHit`), and `kids.js playBeat`, a separate copy that ignores row levels, mute, solo, the mixer, accents, swing, signatures and row speed. | beats-song.md, keys-kids.md |
| Path from a tap to a sound | Pads, 🎤 Live keys and 👆 bands all go through `pads.js tapPad` → `audio.play` (the keys reach it by `deps.tap`; they never import `audio.js` ✅). 🧸 Kids calls `audio.play` itself. The sound sheet, chop and bulk use `audio.start` on their own buffers. | sound.md, keys-kids.md |
| Way to play a saved beat | **One shared path ✅**: `seq.beatPlan` + `prepareBeats` + `soundHit`, used by 🎼 Song, share previews, 🗂️ See all, 💃 Grooves' ▶ and 🎧's ▶ part. Beats' own play, bounce and the roll's preview call the inner `sound()` + `busFor()`. | beats-song.md |
| Mixer | **One per beat ✅**: `sequencer.js busFor` builds `mixer.js buildMix` (each row's effect and the master) for any destination, live or offline. A row's level is applied per hit; mute and solo stop hits being booked. 🧸 Kids bypasses it. | beats-song.md |
| Offline renderer | **Four ✅**: `voices.js` (every voiced clip), `sequencer.js bounce`, `song.js` (Save as a sound), `share-render.js` (previews, See all, takes). `listen-input.js` makes one only to decode a song file. | sound.md |
| WAV encoder | **One ✅**, `sequencer.js encodeWav`, imported by the sheet, chop, keys, song and share previews. | sound.md |
| Microphone recorder | **Two ✅**: `sheet.js` and `kids.js`, each its own `getUserMedia` + `MediaRecorder`. 🎧 captures through an AudioWorklet ✅. | sound.md, keys-kids.md |
| Way to stop everything | **No.** `audio.stopAll` stops only what is in `audio.playing`; the beat, the song, 🧸 Kids' beat, the click and share previews each stop themselves (`app.js stopEverything` calls several). | sound.md, shell.md |
| Database | **One**, `noodle-pads`, opened by `store.js` (and `old-backup.js` reads the old one ✅). | data.md |
| Write path | **Mostly** `state.js persist`; `app.js`, `backup-ui.js storeLoaded` and `cloud.js` also write with `db` directly. | data.md |
| List of stores | **No**: about ten hand-kept lists follow `store.js SCHEMA`. The person's, backup's and cloud's lists are checked ✅. | data.md |
| Gate for what comes in | Backups and cloud pulls: `backup.js cleanBackup` (then `merge.js`; cloud records merge three ways first, `merge3.js`). A beat file: `sequencer.js beatFromFile` → `cleanPattern`. | data.md, cloud.md |
| Settings registry | **One**, `settings.js SETTINGS` (each with a scope and its allowed values ✅); `getSetting`, `setSetting`, `onSetting`. | data.md |
| Dialog opener | **One ✅**, `dialogs.js openDialog` (the only `showModal`); `onDialogOpen` feeds tips, the nudge and telemetry. | shell.md |
| Banner | **One ✅**, `ui.js showBanner` (`showNotice` and Undo go through it), and one screen-reader announcer. | shell.md |
| Way off the device | Four: cloud profiles (`cloud-api.js`), problem reports (`log-send.js`), usage events (`events-client.js`, used only by `telemetry.js` ✅, into `worker/events-worker.js`), feedback (`feedback.js`). Only these name `/api` ✅. | cloud.md |
| Test page | **One**, `tests/fake-dom.mjs installPage`; every test that starts the app uses it. | tests-tools.md |

## Seams across areas

The biggest ones. Each area file lists its own in full.

- **Two beat players:** `sequencer.js` and `kids.js`. A timing or sound fix
  in one does not reach the other.
- **Two recorders:** `sheet.js` and `kids.js`.
- **Sound helpers in the beat maker:** `encodeWav`, `normalize` and
  `noteRate` live in `sequencer.js`. The semitone rate is worked out in six
  places (`instruments.js rateOf` and `noteRate` are checked to agree ✅).
- **The kept audio is built three times:** `audio.js keptAudio`,
  `chop.js rebuild`, `chop.js evenOut`.
- **Hand-kept lists:** the stores (data.md), the cloud record kinds ✅
  (`cloud-sync.js CLOUD_KINDS`, `merge3.js STAMPED`, `worker/cloud.js KINDS`),
  voices and step kinds in `log-clean.js`, limits written on both sides of
  the cloud ✅.
- **Players outside `audio.playing`:** the beat, the song, Kids' beat, the
  click, `cloud-ui.js` share previews. `audio.stopAll` misses them.
- **The look tools call into the page by name:** `tools/look.mjs` and
  `look-cloud.mjs` use web exports, `state` fields and ids as strings, and no
  test checks them (tests-tools.md).
