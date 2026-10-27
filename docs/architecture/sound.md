# Sound: the audio engine and a sound's chain

**Answer first.** There is one realtime `AudioContext`, made lazily by
`audio.js audio.context()`. Everything a kid hears goes into `audio.master`,
then one hard limiter, then one analyser (the grilles read it), then the
speakers. A sound is never changed on disk: what a pad plays is rendered from
the stored recording on load, through a pipeline of plain data kept on the
clip (cuts → chain → knobs → level), and cached in memory by a key built from
that data. Live screens play cached renders; the sound sheet alone plays some
steps live through Web Audio nodes while a slider moves. 🎧 From a song is a
separate, pure pipeline (capture → worklet frames → DSP hits → listener →
beats and a song) that only ends in the app's normal beat and song saving.

| Layer | Files | Pure? | Who calls it |
|---|---|---|---|
| Output and playing | `audio.js` | no (Web Audio) | `app.js`, `pads.js`, `sheet.js`, `chop.js`, `bulk.js`, `things.js`, `kids.js`, `wave.js`, `meter.js`; `sequencer.js` and `song.js` through `deps.audio` |
| Grille and pad fill | `meter.js` | no (rAF) | `app.js` sets its hooks; `audio.on.started`, `sequencer.js`, `song.js` start it |
| The render | `voices.js` | no (OfflineAudioContext, Worker) | `audio.js load`, `sheet.js`, `bulk.js`, `things.js` |
| Building blocks | `steps.js` | yes (builds nodes on any ctx it is given) | `voices.js`, `tweaks.js`, `mixer.js`, `sheet.js`, `shape.js` |
| Pitch-keeping stretch | `stretch.js`, `stretch-worker.js` | yes | `voices.js timeStretch` only |
| Knobs | `tweaks.js` | yes | `voices.js`, `sheet.js`, `shape.js`, `bulk.js`, `voice-knobs.js`, `backup.js`, `model.js` |
| Voices as knobs, own voices | `voice-knobs.js` | yes | `sheet.js` |
| Trim, edits, fades, onsets | `cuts.js` | yes | `audio.js`, `chop.js`, `backup.js`, `model.js` |
| Even it out | `loudness.js` | yes | `chop.js`, `voices.js` (softLimit), `wav.js normalize` (`peakOf`) |
| The WAV file | `wav.js` (`encodeWav`, `normalize`) | yes, no DOM, storage or audio ✅ | `sheet.js`, `chop.js`, `dj.js`, `song.js`, `share-render.js`, `sequencer.js` |
| Mix, Find its note, Make one | `mix.js`, `pitch.js`, `synth.js` | yes | `sheet.js`; `pitch.js rootShift` also by `sequencer.js` |
| Sheet drawing | `wave.js`, `chop.js`, `shape.js` | no (DOM) | `sheet.js` |
| Instruments | `instruments.js`, `inst-picker.js` | `instruments.js` yes, no imports | `audio.js`, `model.js`, `board.js`, `settings.js`, `beat.js`, `sequencer.js`, `dj-*.js`, `kids*.js`, `worker/clean.js` |
| 🎧 From a song | `listen-input.js`, `listen-worklet.js`, `listen-dsp.js`, `listen.js`, `listen-make.js`, `listen-ui.js` | all but `listen-ui.js` and the capture half of `listen-input.js` | `app.js initListen`; `app.js` passes `showCard` to the sequencer as `deps.onGroovesOpen` |

## The AudioContext and the output graph

`audio.js audio.context()` makes the context on first call (`latencyHint:
'interactive'`), first setting `navigator.audioSession.type = 'playback'`
where the browser has it (iOS Safari would otherwise play nothing with the
ringer switch off), and wires the output once:

```
every live sound ─► audio.master (Gain 1) ─► audio.limiter (DynamicsCompressor:
threshold -2 dB, knee 0, ratio 20, attack 2 ms, release 150 ms) ─► audio.analyser
(fftSize 512) ─► ctx.destination
```

- `audio.wake()` calls `context()` and `revive()`. `app.js bindEvents` calls
  it on every `pointerdown` and `keydown` (capture), so the first tap plays at
  once, and so does the first tap after the phone stopped the sound. `audio.play`
  and `audio.start` call `wake()` themselves.
- `audio.revive()` `resume()`s a context that exists and is neither running
  nor closed; it never makes one. It runs on the context's `statechange`
  (while the page shows: a call, a locked screen, iOS `'interrupted'`), and
  on `visibilitychange` to visible and `pageshow` (`app.js bindEvents`). A
  suspended context's clock stands still, so a beat picks up where it was;
  should the clock have run on, the schedulers drop the hits they missed
  (`tooLate`, below) and carry on in time (Tests: `tests/audio.test.mjs`, `tests/audio-wake.test.mjs`).
- `audio.decode(arrayBuffer)` is `decodeAudioData` on this context. So every
  decoded clip is at the context's sample rate, whatever the file's.
- Who connects to `audio.master` directly, outside `audio.playing`:
  `beat-engine.js` (each beat's mix bus, built by `busFor`; and `play`'s voices for
  🧸 Kids, straight into the master), `sequencer.js` (`blip`, the
  click), `song.js` (`laneGainsFor(ctx, audio.master, …)`), `kids.js`
  (the ● count-in `beep`). `audio.stopAll()` does not reach
  any of these; each screen stops its own (`app.js stopEverything` calls
  `audio.stopAll`, `seq.stop`, `song.stop`, the clicks off).
- The 🎧 worklet node connects straight to `ctx.destination`
  (`listen-input.js startCapture`). It writes no output; the connection only
  keeps the browser running it.
- The recorders (`sheet.js listen`, `kids.js`) make a `MediaStreamSource` →
  their own `AnalyserNode` on this context for their level ring. Neither
  connects to the speakers.
- `sequencer.js follow` reads `audio.limiter.reduction` each frame into the
  play's `stats.limiterDb` (logged when the beat stops).

Other contexts:

| Context | Where | Why |
|---|---|---|
| Realtime, its own | `listen-input.js startCapture` | only when called with no `context`; the app always passes `audio.wake()` |
| `OfflineAudioContext` | `voices.js offline` | each render step that uses nodes |
| `OfflineAudioContext` | `sequencer.js bounce` | 💾 Save as a sound |
| `OfflineAudioContext` | `song.js` | a song saved as a sound |
| `OfflineAudioContext` | `share-render.js offline` | share previews, takes made into sounds |
| `OfflineAudioContext` (as `new Off(`) | `listen-input.js decodeFile` | decoding a song file at 44.1 kHz; nothing is rendered |
| `Worker` | `voices.js stretcher` | the Fast/Slow stretch (`stretch-worker.js`) |
| `AudioWorklet` | `listen-input.js` adds `listen-worklet.js` | 🎧 frames |

## `audio.js`: the state it owns and who reads it

| Field | What | Written by | Read by |
|---|---|---|---|
| `ctx`, `master`, `limiter`, `analyser` | the output graph | `context()` | everyone above; `meter.js` (analyser); `log-send.js`, `things.js`, `wave.js` read `ctx` |
| `playing` | Map id → `{src, gain, t0, duration, loop, clip}`: what plays through `start`/`loopInTime` | `start`, `loopInTime`, `stop`, the `onended` handlers | `meter.js run` (progress of each), `wave.js follow`, `sheet.js sheetPlaying`, `things.js`, `app.js` (any loop?) |
| `ringing` | Map id → earlier hits still ringing under 🔔 Let it ring | `start` with `ring` | `stop`, `stopAll` |
| `pending` | Map id → a loop asked for while its sound loads (`loadForLoop`) | `loop`, `loopInTime` | `stop` and `stopAll` take it back, so it never starts; `isLooping` counts it, so a tap on the pad stops it (`tests/audio.test.mjs`) |
| `originals` | Map clip id → Promise<AudioBuffer>: the kept audio (cuts applied) | `original`, `keepOriginal` (`sheet.js saveSheet`, `makeMix`), `forget` | `load`, `bulk.js`, `things.js` (`audio.original`) |
| `originalTrims` | Map clip id → the `cutKey` the original was made with | `original`, `keepOriginal`, `forget` | `original` |
| `recordings` | Map file → Promise<AudioBuffer>: one decode of a bundled file shared by an instrument's presets | `recording` | `decoded` |
| `rendered` | Map `audio.key(clip)` → Promise<{buffer, duration}> | `load`, `dropRendered`, `forget` | `load` |
| `broken`, `brokenAt`, `wanted` | Set of clip ids that failed; when each last failed; the key last asked for per id | `load`'s catch, `load`, `mend`, `forget` | `pads.js` (draws `.broken`), `load` (warm-ups skip a broken id; a tap retries after `BROKEN_RETRY_MS`) |
| `on` | `{started, progress, looping, broken}` hooks | `app.js` (`started` → `meter.run`), `pads.js initPads` (`progress` → `setProgress`, `looping`, `broken`) | `start`, `loopInTime`, `stop`, `load`, `kids.js` calls `audio.on.started()` |
| `grid` | `() => {next, beat}` or null | `app.js`: `audio.grid = () => seq.grid()` | `loop`, `syncLoops` |

The ids in `audio.playing` are a shared namespace:

| Id | Who |
|---|---|
| a clip id | pads, 🎤 Live keys and 👆 bands (through `pads.js tapPad`), 🧸 Kids' pads, beat-row choosers' preview (`sequencer.js` `audio.play(clip)`) |
| `<clipId>+<up>` | 🧸 Kids' high keys (`kids-logic.js keyPlayId`), so a key and its octave sound at once |
| `'preview'` | the sound sheet's voiced preview and live loop (`sheet.js`), ✂️ parts (`chop.js playPart`), 🪄 Voice for many (`bulk.js`). One slot: each stops the other |
| `'preview-original'` | the sheet's 👂 Plain (`sheet.js playPlain`) |
| `'see-all'` | 🗂️ See all's row ▶ (`things.js PLAY_ID`) |
| `'share-preview'` | 🔗 Shared with me's ▶ Play (`cloud-ui.js playPreview`, levelled to peak 0.9; the last `KEEP_SHARE_PREVIEWS` (4) decoded previews kept) |

`meter.js run` calls `setProgress(id, …)` for every entry; `pads.js
setProgress` ignores ids that are not a pad.

## From a tap to a sound

1. `pads.js` pointer handlers: a tap calls `tapPad(clip, {ring})`; a hold of
   `HOLD_TO_LOOP_MS` (or Shift) calls `audio.loop(clip)`. 🎤 Live and 👆 bands
   reach the same `tapPad` through `dj.js hit` → `deps.tap` (with Live's 🔔
   Let it ring as `ring`), and loops through `deps.loop` → `audio.loop`.
2. `tapPad`: a looping pad stops (`audio.stop`), else `audio.play(clip, {ring})`
   and `play-count.js countPlay(kind)` (`'pads'`, or `'keys'` from `dj.js hit`). A pad's loop started with no tap first (a finger held, Shift) counts once too (`startLoop`).
3. `audio.play`: `wake()`, then `await load(clip)`. A failed load shows a
   notice (`ui.js showNotice`) and returns.
4. `audio.load(clip)`: key `audio.key(clip)`; on a miss,
   `original(clip)` → `voices.js applyChain(buffer, chainOf(clip), clip.tweaks,
   clip.level)`. A failure is logged, added to `broken`, and `on.broken(id)`
   marks the pad.
5. `audio.original(clip)`: on a miss (or a new `cutKey`), `decoded(clip)` →
   `keptAudio(buffer, clip)`.
6. `audio.decoded(clip)`:
   - an instrument's preset (`inst`, or a voicing: `instruments.js voicingOf`
     is `chord` or a non-zero `shift`): `recording(file)` (one fetch and
     decode per file), then `instruments.js voice()` on each channel into a
     new buffer, or a plain copy for a preset that plays its file unmoved;
   - any other bundled clip: `fetch(clip.file)` and `decode`;
   - an own sound: `clip.blob.arrayBuffer()` and `decode`.
7. `audio.start(id, loaded, {loop, clip, ring, rate})`: a new
   `makeVoice(ctx, buffer, master)` (a source through its own gain). Every
   source is set to loop over `[0, duration]`; a scheduled `stop` decides how
   long it plays: one pass (`duration / rate`) or `MAX_LOOP_SECONDS` (600).
   `on.looping`, `on.started` fire. `onended` clears the entry and resets the
   pad's progress.
8. `meter.js run` (started by `on.started`) redraws the grille, the pad fills
   and 🎤 Live's glow (`meter.onLevel` → `dj.level`) each animation frame,
   until nothing plays and the level falls under 0.02.

Warming: `app.js setPerson` calls `audio.load` for every clip of the person
shown; changing an instrument setting (`instNotes`…) loads that group's
presets again. So most taps hit the `rendered` cache.

## Caches and when they are invalidated

| Cache | Key | Made by | Dropped by | Not in the key (safe only because…) |
|---|---|---|---|---|
| `audio.recordings` | bundled file path | `recording` | a failed fetch deletes its entry; never otherwise | the file never changes during a visit |
| `audio.originals` | clip id, checked against `originalTrims` = `cuts.js cutKey(clip)` | `original` (lazily remade when `cutKey` changes), `keepOriginal` | `forget(id)` | the blob and `file`: a replaced recording must call `forget` (`sheet.js`, `bulk.js`, `backup-ui.js`, `cloud.js`, `people.js` do) |
| `audio.rendered` | `audio.key(clip)` = `` `${id}:${recipeKey(clip)}${cutKey(clip)}` `` | `load` | `dropRendered(id, keep)` (every key of the id but `keep`), `forget(id)`, a failed load (its own key, and the kept audio it used) | `level`, `shift`, `chord`, `exact`, the blob: fixed per id, or `forget` is called |
| `sheet.js sheet.previews` | `recipeKey({fx, tweaks})`, `head:…` for the live head, `plain` for 👂 Plain | `previewOf` (from `rendered`, `liveHead`, `plainSound`, Find its note) | the oldest past `KEEP_PREVIEWS` (6 tries) and, apart, `KEEP_HEADS` (2 `head:` keys); the one asked for now always stays; `resetPreviews()` when the sound, trim or recording changes, and on open | the trim: the whole map is of one trim |
| `beat-engine.js ready` (behind `has`/`get`/`drop`/`keep`/`held`) | clip id → loaded | `prepare` (on play, per row) | `prepareBeats` reloads it (it is never emptied) | a voice change: `prepare` re-reads `audio.load` each play |
| a `beat-engine.js play` run's sounds | `audio.key(clip)` → loaded | the run, each tick (`clip` hook) | the run's `stop()` | nothing: a changed voice or trim is a new key, a deleted sound is not found (🧸 Kids) |
| `listen-ui.js prints` | `audio.key(clip)` of `` `${personId}-${kit}` `` → fingerprint | `printFor` | never (one per sound as it plays, per visit) | the blob: a kit sound's file never changes |
| `wave.js` `cache` | the buffer drawn and the column count | `draw` | `clear`, a new buffer | — |

`voices.js recipeKey` keeps old keys stable on purpose: a one-voice clip keys
as `voice:amount` (`'normal:null'` for plain), steps add `>`-joined
`stepKey`s, knobs add `tweaksKey` (`''` for none), and `cuts.js cutKey` adds
`@start-end`, `~e…` edits and `/in-out` fade (`''` for none). Tests:
`tests/voices.test.mjs` ("an old clip … keeps the render key"),
`tests/tweaks.test.mjs` ("the render cache key: unchanged with no tweaks"),
`tests/wave-edits.test.mjs` ("keys: … a clip with none gives """).

After a save, `sheet.js saveSheet` hands the sheet's own decoded original to
`audio.keepOriginal`, drops every other render of the clip
(`dropRendered(saved.id, audio.key(saved))`) and warms the new one
(`audio.load`). `bulk.js` does the same per changed clip. `kids.js tapVoice`
calls `audio.dropRendered(last.id)` (all of them) after a voice change.

## Play, loop, ring, rate

| Call | What | Callers |
|---|---|---|
| `audio.play(clip, {loop, ring, rate, id})` | load, then `start` | pads, DJ (via `tapPad`, `deps.playOnce` for previews), Kids, sequencer chooser preview, `app.js` |
| `audio.start(id, loaded, {loop, clip, via, ring, rate})` | play an already-loaded `{buffer, duration}` | `play`; the sheet, chop, bulk, things with their own buffers |
| `audio.book(loaded, at, end)` | one play booked ahead on the audio clock, outside `playing` (nothing that reads or replaces a pad's sound touches it), faded at `end`; returns the voice | `dj.js playTake` via `deps.bookPlay` |
| `audio.loop(clip)` | turn a playing sound into a loop (push its stop to 600 s), or start one once loaded (`loadForLoop`: not if stopped meanwhile); while a beat plays, `loopInTime` instead | pads hold, DJ `deps.loop` |
| `audio.unloop(id)` | finish the current pass, then stop | `sheet.js endLive` |
| `audio.stop(id)` | `fadeStop` it and its ringing hits now, and take back a loop of it still loading (`start` uses `cut`, which leaves that loop) | pads, sheet, chop, bulk, Kids keys, things |
| `audio.stopAll()` | stop every id in `playing` and `ringing` | `app.js` (Esc, `stopEverything`, entering 🧸 Kids), `sheet.js`, `kids.js` |

- **Ring (🔔 Let it ring).** With `ring`, a hit of the same id that is still
  sounding (and not looping) moves to `audio.ringing` and rings on;
  `rhythm.js ringOver` cuts the oldest past `MAX_RINGING` (8). Without it the
  earlier hit is cut with `fadeStop`. The beat maker uses the same
  `ringOver` per row (`beat-engine.js sound`), Kids' beat too.
- **Rate.** `rate` sets `playbackRate`; a pass lasts `duration / rate`.
  🧸 Kids' keys use it (`kids-logic.js keyRate`, 2 is an octave up).
- **`fadeStop(voice, at)`** ramps the voice's gain from `voice.level ?? 1` to
  0 over `FADE_SECONDS` (8 ms), then stops it. Exported with `makeVoice` and
  used by `beat-engine.js`, `sequencer.js`, `song.js`, `share-render.js`.

## Loops in time with a beat

- `app.js` sets `audio.grid = () => seq.grid()`. `sequencer.js grid` returns
  the audio-clock time of the next bar's "1" (at least 20 ms away) and the
  length of a beat, or null when the beat is stopped.
- `audio.loop` with a grid calls `loopInTime(clip, grid)`: once loaded (and not
  stopped meanwhile), on the beat's place read again then, the sound is padded
  with silence to `loopBeats(duration, beat) × beat` seconds (`padTo`: 1, 2,
  4, 8 or 16 beats, else whole bars of 4, at most 128 beats; 2% slack), set to
  loop, started at `grid.next`. What played before fades at that moment.
- `audio.syncLoops()` restarts every looping entry with a `clip` on the grid.
  `app.js` calls it from the sequencer's `deps.onTempo`, which fires when a
  beat starts (before its first schedule), on a tempo change and on a BPM
  typed.
- A loop started this way keeps its padded period after the beat stops.
- Test: `tests/audio.test.mjs` ("a looping pad repeats over a whole number
  of beats…").

## A sound's chain: the stored shapes

### The clip fields that change how it sounds

| Field | Where it comes from | Meaning | Cleaned by |
|---|---|---|---|
| `file` | boards.json | a preset's audio | `model.js validateManifest` |
| `blob`, `mime` | recording, upload, ✨, ➕, 🧩, a beat or take made into a sound | an own sound's audio, stored whole | `backup.js cleanBackup` (size cap, mime) |
| `shift` / `chord` | boards.json, written by `tools/kit_instruments.py` | semitones the preset moves its file by: one note, or 1–6 notes at once (each ±12) | `instruments.js instrumentProblem` |
| `inst`, `plays` | boards.json | which instrument, and which of the group's own presets it plays | `instrumentProblem`, `model.js validateManifest` |
| `level` | boards.json, written by `tools/preset_loudness.py --fix` | dB (−24 to 0) the finished preset is turned down | `model.js validateManifest`; `voices.js presetGain` ignores anything else |
| `exact` | `app.js addMadeSound` (a beat or a take made into a sound) | keep its full length, silent tail included, so it loops in time | `backup.js` (`true` or dropped) |
| `trim` | ✂️ Ends, Keep only this | `{start, end}` seconds into the stored audio | `cuts.js cleanTrim` |
| `edits` | 👆 Select part, 🔊 Even it out | up to 16 `{kind: 'reverse'|'silence'|'gain', start, end, amount?}` | `cuts.js cleanEdits` |
| `fade` | 📐 Fades | `{in, out}` seconds at the ends of what the trim keeps | `cuts.js cleanFade` |
| `voice`, `amount` | the first voice of the chain (what an older app plays) | one of `voices.js VOICES` and its amount | `backup.js voiceId`, `voices.js amountFor` |
| `fx` | the whole chain when it is more than one plain voice | up to `MAX_CHAIN` (6) steps | `voices.js cleanChain` (via `backup.js fxChain`, `model.js`) |
| `tweaks` | the sheet's knobs | only knobs off normal, plus `special`, `first`, `muted` | `tweaks.js cleanTweaks` |
| `root` | 🎵 Find its note | MIDI note; a tune row moves the sound by `pitch.js rootShift(root)` | `backup.js rootNote` |
| `synth` | ✨ Make one | the recipe, so its sliders can move again | `synth.js cleanSynth` |
| `from` | 🧩 chop, ➕ mix | `{id, how}` | `cuts.js cleanFrom` |

A preset's edits (voice, amount, fx, tweaks, trim, edits, fade, root) live in
the `overrides` store and are spread over the kit entry by
`model.js clipsForPerson`. `level`, `shift`, `chord`, `inst` and `file` come
only from boards.json; an override cannot carry them (`backup.js` lists the
override fields).

### A step

A chain is an array of steps. A step is `{type, …numbers, …flags, off?}`:

- `{type: 'voice', voice, amount?}`: a classic voice, rendered by
  `voices.js RECIPES[voice]`.
- A `steps.js KINDS` entry by id, each number clamped and rounded by
  `steps.js cleanStep`:

| Kind | Live? | Numbers / flags | Rendered by |
|---|---|---|---|
| `pitch` Higher or lower | no | `notes` −24…24, `keep` | `voices.js STEP_RENDERS.pitch` (tape; `keep`: stretch then tape) |
| `stretch` Faster or slower | no | `speed` 0.05…8 (log) | `STEP_RENDERS.stretch` → `timeStretch` |
| `tone` Muffled ↔ Bright | yes | `tone` −1…1 | its `build` (lowpass + highpass) |
| `echo` Make it echo | yes | `repeats`, `gap`; with `beat`: `note`, `bpm` (the gap follows) | its `build` (delay with feedback and a dulling lowpass) |
| `room` Room size | yes | `size` | its `build` (convolver on a noise tail; a new size cross-fades) |
| `crunch` | yes | `amount` | its `build` (waveshaper) |
| `wobble` | yes | `speed`, `depth` | its `build` (LFO on a delay) |
| `ring` Robot | yes | `metal` 20…600 (log) | its `build` (ring modulation) |
| `squash` Louder everywhere | yes | `amount` | its `build` (compressor + makeup) |
| `fade` Fade in / out | no | `in`, `out` (parts of its length) | `STEP_RENDERS.fade` |
| `reverse` Backwards | no | — | `RECIPES.backwards` |
| `repeat` Stutter | no | `times` | `voices.js stutter` |
| `special` (from knobs only) | no | `special`: clones, boom, walkie | `voices.js SPECIAL_RENDERS` |

`off: true` (🔇 on its layer) keeps a step stored but unplayed
(`voices.js playingChain`).

### Knobs (`tweaks`)

`tweaks.js TWEAKS` is ten fixed slots: pitch, speed, echo, volume, warble
(the five main), backwards, tone, robot, crunch, stutter. A slot holds one
value, so nothing doubles up. `tweakSteps(raw)` turns them into steps in a
fixed order: one `stretch` (speed and pitch together), `pitch` (tape), `repeat`,
`reverse`, an early ✦ special, `tone`, `ring`, `crunch`, a late ✦ special,
`wobble`, `squash`, then the echo's `room`/`echo` last. Softer is the one
knob that is not a step: `tweakGain` (1, 0.5, 0.25) scales the finished sound.
`first: true` puts the knobs before the chain (every new sound); without it
they play after (sounds saved before knobs, which keep sounding the same).
`muted` lists knob slots that are set but silent.

### Voices as knobs (`voice-knobs.js`)

A voice chip is a set of knob positions (`MADE`, `PRESETS`). Tapping chips
stacks them (`stackAll`): the sheet stores only `tweaks`, never `voice`.
Old sounds keep their classic voice steps (rendered by `RECIPES`) until ⤢ Turn
into knobs (`chainToKnobs`). A kid's own voice (⭐ Save voice) is stored in
the IndexedDB `voices` store as `{id, personId, name, emoji, knobs, created,
used, edited?}`, cleaned by `cleanMyVoice`; `knobs` is a `tweaks` value
without `first` or `muted`.

### The render order

`audio.js keptAudio` then `voices.js applyChain`:

1. **Cuts, on the stored audio** (`keptAudio`): `cuts.js applyEdits` on a
   copy; cut to `keptRange` (the trim; all of it for an `exact` sound; else
   `trimBounds`, the quiet ends found on the recording as stored, to the millisecond); `applyFade`.
   With a gain edit, `cuts.js levelForGain` scales by the *unedited* part's
   peak and marks the buffer `keepLevel`.
2. **The plan** (`voices.js renderPlan`): the playing chain (muted steps out,
   else Normal), knobs' steps before or after it (`first`), Normal dropped
   beside knobs.
3. **Each step** (`renderStep`), then `finish`: peak 0.9 (or, for
   `keepLevel` audio, `loudness.js softLimit` with no scaling); silent ends
   off (quiet is under `FINISH_QUIET`, 0.8% of the peak) with a 150 ms
   fade-out, except after Normal, which keeps length.
4. **Gain**: `tweakGain(tweaks) × presetGain(level)` multiplied in.
5. A render that is not plain Normal is logged: `logEvent('render', …)`.
6. Back in `audio.load`: an `exact` sound in plain Normal reports its whole
   buffer length as its `duration`.

## Live preview vs render

The rule (`steps.js` header): one `build()` makes both the live nodes and the
offline render of a live kind, so what a kid hears while dragging is what is
saved.

- `steps.js splitChain` splits a chain into `head` (rendered) and `tail` (the
  run of live steps at the end). `voices.js livePlan` adds the knobs: knobs
  with `first` render in the head; knobs after the chain join the tail only
  if each is live (`isLive`), else `livePlan` returns null and the sheet
  renders when the slider is let go.
- `sheet.js startLive` renders the head through `applyChain` (`liveHead`,
  started after each full render `previewVoice` asks for (the sheet opening,
  a knob, a step, a trim), so a first drag waits for nothing and never races
  the render the kid is waiting to hear; cached in `sheet.previews` under `head:…`; with nothing before the live steps, the
  sound in Normal: peak 0.9 and the preset `level`, as the saved render
  starts), pads it with room for the tail to ring (`padTo`, up to 6 s), and
  calls `audio.start('preview', …, {loop: true, via})`. `via` builds the tail
  with `steps.js buildLive` between the source and its fader, plus a gain for
  Quiet/Quietest.
- `sheet.js moveLive` calls the built tail's `set(i, step)`; `steps.js
  param` glides the AudioParam over about 20 ms. `endLive` calls
  `audio.unloop('preview')` and renders the whole sound again.
- Everything else the sheet plays is a full render: `sheet.js rendered()`
  (`applyChain` on `sheet.original`, cached by `recipeKey`). `previewVoice`
  plays a render only while it is still the sound as it is now
  (`nowRendered`), so a slow render of an earlier tap never plays over a
  later one.
- 👂 Plain plays `sheet.js plainSound()` as `'preview-original'`: the kept
  audio in Normal (`applyChain` with no steps or knobs: peak 0.9, then the
  preset `level`), cached in `sheet.previews` as `plain`, so Plain against ▶︎
  compares the voice, not the volume (docs/decisions.md).
- The 🎚️ Mixer runs `steps.js` live kinds too: `mixer.js fxSteps` →
  `buildLive` on each row and on the master of a beat's bus, live or offline.

## The stretch worker

- `voices.js timeStretch(buffer, speed)` is the only caller. It sends copies of
  the channels (the original stays cached) to the one `stretcher` worker,
  started on first use as a module worker from `stretch-worker.js`.
- Message in `{id, channels, rate, speed, maxSeconds}`, out `{id, channels}`
  or `{id, error}`; buffers are transferred both ways; `stretcher.jobs` maps
  ids to promises.
- A worker error marks `stretcher.broken` and fails every waiting job; every
  later stretch runs `stretch.js stretchChannels` on the page. Same result
  either way (`tests/stretch.test.mjs`).
- `MAX_RENDER_SECONDS` (180) caps the output.
- Who stretches: Fast, Slow (classic voices), the `stretch` kind, `pitch` with
  `keep`, and the speed and pitch knobs (one `stretch` step).

## Loudness and level

The chain of gains from a file to the speaker:

| Stage | Where | What |
|---|---|---|
| Instrument voicing | `instruments.js voice` | a moved note or chord brought back to the recording's own peak |
| Gain edits | `cuts.js levelForGain` | 0.9 over the unedited peak; `keepLevel` set |
| Each render step | `voices.js finish` | peak 0.9, or `softLimit` for `keepLevel` audio |
| Quiet / Quietest | `tweaks.js tweakGain` | ×0.5, ×0.25 |
| Preset level | `voices.js presetGain(clip.level)` | 10^(dB/20), dB in −24…0 |
| A beat's hit | `beat-engine.js sound` | `hitGain(row, loud)`; an accent is `ACCENT_GAIN` 1.5 |
| A beat's mix | `mixer.js buildMix` via `beat-engine.js busFor` | row levels, mute, solo, effects, master level |
| Output | `audio.limiter` | holds a pile-up under full scale |
| Offline renders | `wav.js normalize` | peak 0.9 (bounce, song, share previews) |

- **Preset levels.** `tools/preset_loudness.py` measures every preset as a
  phone plays it (it re-implements `instruments.js voice` and the 0.9 peak in
  Python) and `--fix` writes boards.json `level`.
  `tools/test_preset_loudness.py` fails until the levels match.
- **🔊 Even it out** (`chop.js evenOut`) targets `loudness.js
  PRESET_LOUDNESS` (−14.3 LUFS, BS.1770 momentary max) and adds one gain edit
  over the whole recording (`evenGain`, at most 8×). `tests/loudness.test.mjs`
  recomputes `PRESET_LOUDNESS` from `web/clips/kit/` with each `level`.
  Shown only on own sounds (`chop.js own`).
- **Recording tips.** `audio.js levelsOf` and `levelVerdict` (`TOO_LOUD`
  0.98) give the sheet's after-recording line.
- **The meter.** `meter.js levelOf(analyser)` is RMS × 4.5, decaying by 0.86
  a frame.

## Instruments: views over the kit

ADR 0030. An instrument is never a group of pads. Each instrument's notes are
presets of their own in boards.json (`piano-e`, `piano-am-chord`, `808-c`),
in the same group (`notes`, `chords`, `bass`) as the group's own presets, with
`inst`, `plays`, and `shift` or `chord`.

| Job | Where |
|---|---|
| The list, families, default per group, the setting per group | `instruments.js INSTRUMENTS`, `FAMILIES`, `PLAYED` (`instNotes`, `instChords`, `instBass`) |
| The setting's allowed values | `settings.js` from `instrumentIds` |
| Which presets show for the person | `model.js clipsForPerson` → `showsFor(clip, picks)`; `board.js instrumentPicks` builds `picks` from settings; lookups pass `allPresets` and see every instrument |
| The same note on another instrument | `versionFor(ownId, group, inst)`, `instrumentKitId`, `ownIdOf` (sequencer's tune row, 👆 bands, 🧸 Kids' keys) |
| The sound | `audio.js decoded` → `recording(file)` + `voice(samples, voicingOf(clip))`: Catmull-Rom resampling of one recording, summed for a chord, back to the recording's peak |
| The picker | `inst-picker.js pickerButton`, `pickerList`, `pickInstrument` (writes the setting); screens handle the taps |
| The Worker's kit ids | `worker/clean.js` imports `kitIdsOf` |
| The checks on boards.json | `instrumentProblem`, `model.js validateManifest` |

What was made keeps its preset: a beat row, key or band stores the exact
clip id, so a new pick changes only what the group shows. `app.js` reloads
the group's presets when a pick changes.

## Making sounds: recording and other capture paths

| Path | Capture | Becomes | Stored as |
|---|---|---|---|
| Sound sheet 🎤 Record (`sheet.js startRecording`) | `getUserMedia(RAW_MIC)` (`audio.js`: echo cancelling, noise suppression and auto-gain off) → `MediaRecorder` (webm/opus, mp4, webm, ogg); count-in 3-2-1 | `acceptAudio`: `audio.decode`, cap `MAX_CLIP_SECONDS` (120), `trimBounds` silent check, `sheet.original` = the trimmed slice, `chop.js recorded(buffer)` | `clips` with `blob` (the whole recording) |
| Sound sheet file chooser | the file | `acceptAudio` | same |
| 🧸 Kids' mic (`kids.js`) | its own `getUserMedia(RAW_MIC)` + `MediaRecorder`, count-in `beep`s | `keep`: decode, silent check, `kidsVoiceFields(voice)` (classic voice steps from `kids-logic.js KIDS_VOICES`) | `deps.saveClip` → `persist('clips')` |
| ✨ Make one (`sheet.js`) | `synth.js renderSynth` (mono, 44.1 kHz, peak 0.9) | `encodeWav`; `sheet.original` = `keptAudio` of it (quiet ends off) | `blob` + `synth` |
| ➕ Mix (`sheet.js`) | both sounds rendered as they play now, `mix.js mixSounds` | `encodeWav`; `keepOriginal` of its `keptAudio` | `blob` + `from: {how: 'mix'}` |
| 🧩 Chop (`chop.js makePads`) | the voiced sound, cut at marks | `encodeWav` per piece | new `clips` with `from: {how: 'chop'}` |
| 💾 Save as a sound (`sequencer.js bounce`), a song, a take (`dj.js` via `share-render.js renderTake`) | offline renders | `encodeWav` | `app.js addMadeSound`: `exact: true` |
| 🎧 From a song | see below | beats and a song, never audio | `beats`, `songbook` |

The voices are baked into 🧩, ➕ and the offline renders; every other own
sound keeps its voice as data.

## 🎧 From a song, end to end

```
listen-ui.js listenTo(kind) ─► listen-input.js startCapture(kind, {context: audio.wake(), onFrames, onEnd})
   getDisplayMedia / getUserMedia (captureRequest: no echo cancelling, no noise suppression)
   ─► MediaStreamSource ─► AudioWorkletNode 'listen-frames' (listen-worklet.js ListenFrames)
        mixToMono + FrameBatcher(FRAME = 2048) ─► port.postMessage(frame, [buffer])
listen-ui.js listenToFile(file) ─► listen-input.js readFile: 20 MB cap, decode at 44.1 kHz,
   first 15 minutes, mixToMono + FrameBatcher, a setTimeout(0) breath every 32 frames
        │ onFrames(Float32Array, sampleRate)
        ▼
listen-ui.js framesFor ─► session.listener ??= listen.js createListener({sampleRate}); listener.feed(frames)
        │ feed: slices of 4096 samples ─► listen-dsp.js createHitFinder.push ─► hits {t, row, w, alone, print}
        │       then step(horizon): seek tempo · choose meter · settle bars · check lost
        ▼
listen-ui.js loop (requestAnimationFrame via listenEnv.frame, only when `dirty`) ─► snapshot() ─► draw/paint
        │ ■ Stop / sharing ended / file end
        ▼
listener.finish() ─► {seconds, parts[{id, bpm, signature, swing, bars, steps, prints}], order, tempos}
        ▼
listen-ui.js makeAll: printFor(kit) = fingerprint(audio.load(person's kit copy) channel 0)
   ─► listen-make.js pickSounds (closestSound over ROW_SOUNDS) ─► makeBeats ─► makeSong
   ─► deps.library.put(beat) (app.js beatLibrary → persist('beats')), deps.songs.put(song) (songBook → persist('songbook'))
   ─► deps.refresh() (seq.render, song.render)
        ▼
What I heard: ▶ deps.seq.hearBeat · 🎼 deps.song.openSaved · 🥁 deps.seq.openSaved · 🗑️ throwAway (library.remove, songs.remove)
```

- **Inputs.** `listen-input.js sources(nav)` offers `tab` (Chromium on a
  computer), `screen` (also Windows), `mic` (where `getUserMedia` exists), and
  `file` always. Errors reject with one sentence from `captureError`.
- **Frames.** 2048 mono samples (about 43 ms at 48 kHz), transferred. The
  worklet module is added once per context (`workletIn` WeakSet). `stop()`
  posts `'stop'`, disconnects, stops the tracks, closes an own context only.
- **Hits** (`listen-dsp.js`): a 23 ms FFT every quarter window (about 5.8 ms);
  16 log bands; the rise per band split into kick/snare/hat by non-negative
  least squares on three learned shapes; peaks against each row's recent
  level; each hit gets a fingerprint of its first 150 ms. Only hits and a
  number per frame (`env`) are kept, never audio.
- **The listener** (`listen.js`): its opening comment is the contract.
  Tempo after 3 s of hits, a guess every 0.5 s, locked when two agree within
  2.5%; the grid line refits through recent hits; the time signature from 64
  sixteenths; a bar settles 1.5 bars after it ends; hits off the grid for a
  bar end the segment (a tempo change). BPM is kept inside
  `beat.js tempoStops()`, steps per bar follow `beat.js barSteps`,
  and a part's beat is at most `MAX_PILLS`.
- **The live screen** draws at most once an animation frame, and only the
  cells whose class changed (`listen-ui.js paint`).
- **Made records.** A beat is `beat.js cleanPattern({name, bpm, bars,
  signature, swing, rows: [{clipId, steps}]}, personId)` plus `id`
  (`newId('beat')`), `created`, `saved`. A row's `clipId` is
  `` `${personId}-${kit}` ``, or the row's plain sound when the board lacks
  that clip. A song (two or more parts) is `{id, personId, name, tempo,
  tempos?, lanes, slots, created, saved}` built with `playlist.js` helpers;
  its bars convert from the part's signature to 16-pill song bars
  (`listen-make.js songBar`).
- **Telemetry and log.** `track('noodlepads.listen_start')`,
  `track('noodlepads.listen_end', {source, seconds, parts, tempo_changes,
  outcome})` once per session (`listen-ui.js end`); `logEvent('listen', …)`.
- **Test hook.** `listen-ui.js listenEnv` swaps the inputs, the listener, the
  frame clock and the kit prints; tests and `just look` use it.
- **Kids.** `showCard` hides the card when the person's `level` setting is
  `kids`, and again on `onSetting('level')`.

## Concepts

### The one context and the audio clock

`audio.context().currentTime` is the clock every scheduler books on
(`sequencer.js`, `song.js` and `beat-engine.js play`, which 🧸 Kids plays through; each a 25 ms `setInterval` with
lookahead). Each drops a hit whose moment passed more than `LATE_SECONDS`
(20 ms) ago (`audio.js tooLate`): after a stall, or a clock that ran on
while the timers slept, the beat goes on in time with no burst of missed
hits (`tests/late-hits.test.mjs`). Pads read it for `t0`; `meter.js` and `wave.js` turn it into
progress each frame; `dj.js` stamps takes with it (`deps.now`) less the
output latency (`deps.latency`, capped at 0.2 s). 🎧 shares the context, so
the capture's sample rate is the app's.

### "A voice": two meanings

- A **playing voice** is `audio.js makeVoice`'s `{src, gain}` (plus `level`,
  `lift`, `end` added by the schedulers).
- A **silly voice** is a `voices.js VOICES` entry (Chipmunk…), a chain step
  `{type: 'voice'}`, or (in the sheet today) a set of knobs from
  `voice-knobs.js PRESETS`.

### "Level": five meanings

| Name | Where | Means |
|---|---|---|
| the `level` setting | `settings.js`; read by `listen-ui.js showCard`, Kids | the person's level: Kids, Regular, Advanced |
| `clip.level` | boards.json | a preset's dB turn-down |
| `voice.level` | `beat-engine.js sound`, read by `audio.js fadeStop` | the hit's gain to fade from |
| `meter.js levelOf`, `meter.level` | the grille | RMS of the output |
| `listen-input.js levelOf` | 🎧 | a frame in dB, 0…1 |

Row loudness in the beat maker is `row-volume.js rowLevel` (another).

### "Ring": two meanings

🔔 Let it ring (`ring` on a beat row, Live's `ring` option, `audio.ringing`,
`rhythm.js ringOver`) versus the `ring` step kind (Robot's ring modulation)
and the `robot` knob.

### Presets vs own sounds in the chain

| | Preset (kit) | Own sound |
|---|---|---|
| Audio | `file` (shared `recordings` for an instrument's presets) | `blob` |
| Moves to a note | `shift` / `chord` before anything else | never |
| Turned down by `level` | yes | no |
| 🔊 Even it out | hidden | shown |
| Edits stored in | `overrides` (by `<person>-<kit id>`) | the clip in `clips` |
| Deleted | hidden instead | `audio.forget` + delete |

### Advanced

`getSetting('advancedBeats')` shows ✂️ Trim and edit, 🧩 Chop (`chop.js
shown`), Shape it's steps in the Layers (`sheet.js advanced`), and the
Advanced-only presets (`board.js clipsFor`). Regular people still get the
knobs and 🔊 Even it out.

### Peak 0.9, the house level

Every made or rendered sound is scaled so its loudest sample is 0.9:
`voices.js finish`, `cuts.js levelForGain`, `wav.js normalize`,
`mix.js mixSounds`, `synth.js renderSynth`, and the measure in `chop.js
evenOut`. `loudness.js softLimit` bends above 0.9. `tools/preset_loudness.py
PEAK` and `loudness.js PRESET_LOUDNESS` assume it.

### The semitone rate

2^(n/12) is computed in `instruments.js rateOf`, `beat.js noteRate`,
`kids-logic.js keyRate`, `voices.js STEP_RENDERS.pitch`, `tweaks.js
tweakSteps`, and Python's `tools/preset_loudness.py voiced`. The live paths
use `playbackRate`; the presets resample in JavaScript (`instruments.js
voice`).

### Exact sounds

A beat, song or take made into a sound (`exact: true`), and a ➕ mix of two
such sounds (`sheet.js makeMix`), keeps its silent tail
and full length: `keptRange` keeps all of it, `keptAudio` returns it as is,
`load` reports the buffer length in Normal, and `chop.js rangeOf` starts from
all of it. Any voice still trims its ends.

### Layers: muted and first

🔇 on a layer is `off: true` on a step and `tweaks.muted` on a knob. Both are
stored and left out by `playingChain` / `playingTweaks`. A muted step drops
out of the render key (`recipeKey` keys only `playingChain`); muted knobs add
`m…` to `tweaksKey`. `first` decides whether knobs
play before or after the steps; `sheet.js` sets it for new sounds.

### Echo 🥁 On the beat

`steps.js` echo with `beat: true` stores `note` and `bpm`; `derive` turns them
into `gap`. `sheet.js` reads the tempo from `setBeatTempo`, which `app.js`
wires to `seq.beat()?.bpm`. The tempo is fixed on the step when the switch is
turned on.

### Broken sounds

`audio.load`'s failure adds the id to `audio.broken` and calls
`on.broken(id, true)` → `pads.js` adds `.broken`. `audio.play` shows the
notice. The failed render and kept audio are not cached. A warm-up (any
`load` without `retry`) leaves a broken id alone; a tap (`audio.play`,
`loadForLoop`: `load(clip, {retry: true})`) tries it again, at most once every
`BROKEN_RETRY_MS` (3 s). Only a load of the key last asked for (`wanted`, the
sound as its pad has it now) mends it: the id leaves `broken` and
`on.broken(id, false)` takes the stripes off. `forget(id)` (new audio) clears
it too. A file that is not there (a 404) or will not decode stays broken
until a reload brings a fixed one: each tap tries and fails again. Tests:
`tests/audio.test.mjs` ("a broken sound: warm-ups skip it…", "…mended only
by a load of its current version").

## Seams

| Seam | Where | What a fix in one place misses |
|---|---|---|
| The kept audio is built three times | `audio.js keptAudio`, `chop.js rebuild`, `chop.js evenOut` (all three take their range from `keptRange`: the automatic trim to the millisecond; `sheet.js acceptAudio` and `makeSound` use `keptAudio` itself) | a change to the cut order (edits → trim → fade → levelForGain) in `keptAudio` leaves the trim editor drawing and playing something else |
| Two fades | `cuts.js applyFade` (seconds, before voices) and `voices.js STEP_RENDERS.fade` (shares of the length, a step) | the same min-of-ramps loop is written twice |
| Walkie and Monster written twice | `voices.js RECIPES.walkie` vs `SPECIAL_RENDERS.walkie`; `RECIPES.monster` vs `SPECIAL_RENDERS.boom` | a fix to the static burst or the bass shelf reaches old sounds or knob sounds, not both |
| Two noise tails | `voices.js noiseBuffer` and `steps.js roomTail` | same formula; `noiseBuffer` uses the context's channel count, `roomTail` always 2 |
| Two 🎲 families | `voices.js SURPRISE` (used by `surpriseShape`) and `voice-knobs.js FAMILIES` (`surpriseVoices`) | a new voice must be added to both |
| A voice is listed four times | `voices.js VOICES` + `RECIPES`, `voices.js OPENED`, `voice-knobs.js MADE`, `log-clean.js VOICE_IDS` | a new voice needs a recipe, an opened form, its knobs and its report id (the last is guarded: `tests/log-clean.test.mjs` checks the lists against `VOICES` and `KINDS`) |
| Step kinds listed twice | `steps.js KINDS` and `log-clean.js STEP_KINDS` | a render of a new kind is blanked in problem reports until it is added (guarded by the same test) |
| Two loudness measures | `tools/preset_loudness.py` (phone speaker: high-pass 180 Hz, lift above 1.5 kHz) for `level`; `loudness.js` (BS.1770) for `PRESET_LOUDNESS` and Even it out | presets are evened by one ear, kids' sounds to the other |
| `instruments.js voice` in Python | `tools/preset_loudness.py voiced` | a change to the resampling changes loudness the tool no longer models |
| Instrument id naming | `instruments.js instrumentKitId` and `tools/kit_instruments.py` | must name presets the same way |
| The semitone rate in six places | see Concepts | — |
| Kids voices are classic | `kids-logic.js KIDS_VOICES` stores `voice`/`fx` steps; the sheet now stores knobs | a change to how knobs sound never reaches 🧸 Kids' voices |
| A live tail changes the peak | `sheet.js startLive`: the head is evened out (peak 0.9, the preset `level`), then the live tail (Echo, Room, Tone, Muffled…) plays through nodes; the saved render re-evens after every step (`applyChain` → `finish`) | untrimmed, a sound whose echoes pile on it played louder while dragging than once let go: a held 220 Hz note peaked at 1.81 against the render's 0.9 with Echo 3 × 0.25 s (+6 dB), and 2.96 with 8 echoes (+10.4 dB), where the output limiter (−2 dB, 20:1, not a brickwall) held it near full scale and turned down everything else on the master (a playing beat) by up to about 10 dB. Now the loop is turned down by `steps.js liveTrim`: what its echoes could add in step with a sound that long (1 when none comes back while it plays), set again as a slider moves; both cases peak within 1.5 dB of the render. A sound that is not a steady note (a voice) is trimmed as much, so it may play a little softer while dragging. Room, Tone and Louder everywhere get no trim (`tests/live-peak.test.mjs`) |
| Louder everywhere plays louder live | `steps.js squash` (`Louder everywhere`, the Loud and Loudest knobs): a compressor, then makeup gain up to ×5 (+14 dB) at amount 1; live it plays at that gain, while the saved render evens it out to peak 0.9 | dragging its slider (or a live loop with Loud on) is louder than letting go, and the limiter holds it as for Echo; unmeasured here, for an ear |
| `listen.js` and `listen-make.js` import `beat.js` | for `SIGNATURES`, `barSteps`, `tempoStops`, `MAX_PILLS`, `cleanPattern` | `beat.js` imports `mixer.js`, `row-volume.js`, `model.js` and `instruments.js` for its rules, so the "pure" listener still loads those (not the beat maker screen) |
| `ROWS` twice | `listen-dsp.js ROWS` and `listen-make.js ROWS` | kept equal by hand |
| Name clashes | `KINDS` (`steps.js` vs `listen-input.js`), `FAMILIES` (`instruments.js` vs `voice-knobs.js`), `levelOf` (`meter.js`, `listen-input.js`, the sequencer's) | a wrong import still runs |
| Bare players outside `audio.playing` | the engine's runs (`kids.js` beat), `kids.js` beeps, sequencer click | `audio.stopAll` does not stop them |

## Invariants and gotchas

| Rule | Why | Guard |
|---|---|---|
| The stored recording is never changed: trims, edits, fades, voices, knobs and voicings are data applied on render | a kid can undo anything; an older app still plays it | `tests/wave-edits.test.mjs`, `tests/instruments.test.mjs` ("the recording itself is never changed") |
| Old render keys stay byte-identical (`voice:amount`, `''` for no knobs or cuts) | keys name caches; tests pin them | `tests/voices.test.mjs`, `tests/tweaks.test.mjs`, `tests/wave-edits.test.mjs` |
| A sound saved before knobs plays exactly the steps it did | "keeps sounding the same" | `tests/voice-knobs.test.mjs` ("render plan equality") |
| A knob saved before More knobs keys and plays as before | old sounds | `tests/tweaks.test.mjs` |
| `recordings` buffers are never written | every note of an instrument reads them | `tests/instruments.test.mjs` |
| `RECIPES.normal` returns a copy | `finish` scales in place and the original is cached | none named |
| A replaced recording calls `audio.forget(id)` | the caches key by id and do not see the blob | none |
| A live kind has a `build`; a render-only kind has a `STEP_RENDERS` entry (or `renderLive` is used) | `renderStep` falls back to `renderLive`, which needs `build` | `tests/steps.test.mjs` ("every step renders through applyChain") |
| `levelForGain` audio is marked `keepLevel` and not re-levelled | a louder part must stay louder | `tests/wave-edits.test.mjs` |
| `PRESET_LOUDNESS` matches the kit | Even it out's target | `tests/loudness.test.mjs` |
| boards.json `level` matches `tools/preset_loudness.py` | every preset as loud | `tools/test_preset_loudness.py` |
| A `web/` worker or worklet file is in `sw.js SHELL` | offline | `tests/offline.test.mjs` (both are listed today) |
| The worklet file imports nothing and registers only in an AudioWorkletGlobalScope | `addModule` loads it as is; Node and the page import it too | `tests/listen-input.test.mjs` |
| The song's audio never leaves the listener | privacy | the design; only hits and prints are kept |
| A one-shot is a looping source with a scheduled stop | `loop()` can extend it without restarting | `tests/audio.test.mjs` ("a live preview…") |
| Loops stop after `MAX_LOOP_SECONDS` (10 minutes) | a forgotten loop ends | none |
| The sheet's `'preview'` slot is shared with chop and bulk | `start` stops whatever holds the id | none |
| A render is capped at 180 s, a mix at 30 s, a sheet sound at 120 s, a song file at 20 MB / 15 min | memory | `tests/stretch.test.mjs`, `tests/mix.test.mjs`, `tests/listen-input.test.mjs` |
| In tests, audio cannot be heard; `audio.decode` and `fetch` are stubbed | no browser | `just look` and a real device for sound |

## To change X, touch …

| Change | Touch |
|---|---|
| A new classic voice | `voices.js VOICES` + `RECIPES` (+ `OPENED`, `SURPRISE`), `voice-knobs.js MADE` (+ `FAMILIES`), `log-clean.js VOICE_IDS`, `help.js`, `tests/voices.test.mjs` |
| A new building block (step kind) | `steps.js KINDS` (live: `build`, `tail`; else a `voices.js STEP_RENDERS` entry), `log-clean.js STEP_KINDS`, `voices.js SHAPE_SURPRISE` if 🎲 should pick it, `tests/steps.test.mjs`; `mixer.js` only if it should be a mixer effect |
| A new knob | `tweaks.js TWEAKS` (a new `short` letter), `tweakSteps` (its place in the order), `LAYER_ORDER`, `ADDED_AT`; `voice-knobs.js MADE` if a voice uses it; `shape.js` draws it from `TWEAKS`; keep old `tweaksKey`s unchanged |
| A new cut (edit kind) | `cuts.js EDIT_KINDS`, `cleanEdit`, `applyEdits`, `editsKey`; `chop.js editPart` and its buttons in `index.html`; `help.js` |
| The order cuts apply in | `audio.js keptAudio` and `chop.js rebuild` and `chop.js evenOut` together |
| The house peak (0.9) | `voices.js finish`, `cuts.js levelForGain`, `wav.js normalize`, `mix.js`, `synth.js`, `chop.js evenOut`, `loudness.js softLimit`, `tools/preset_loudness.py PEAK`; then `just preset-loudness --fix` and `PRESET_LOUDNESS` |
| A new preset, or a kit WAV | `web/clips/kit/`, boards.json, then `just preset-loudness --fix`; an instrument note: `tools/kit_instruments.py` |
| A new instrument | `instruments.js INSTRUMENTS` (and `FAMILIES`), its recordings (`tools/make_samples.py` or `make_placeholders.py`), `tools/kit_instruments.py`, `just preset-loudness --fix`; `settings.js` takes the ids from `instrumentIds` |
| Who plays a group by default | `instruments.js PLAYED` |
| What decoding a clip means | `audio.js decoded` (and `recording` for an instrument's presets) |
| What invalidates a render | `audio.js key` = `voices.js recipeKey` + `cuts.js cutKey`; any new field that changes the sound must enter one of them, or every place that changes it must call `audio.forget` |
| The limiter | `audio.js context`; `sequencer.js follow` reads `reduction` |
| Pads looping in time | `audio.js loopBeats`, `loopInTime`, `syncLoops`; `sequencer.js grid`; `app.js` `deps.onTempo` |
| The stretch | `stretch.js stretchChannels` (worker and page share it); the message shape in `voices.js stretcher` and `stretch-worker.js handle` |
| A new way to listen (🎧) | `listen-input.js KINDS`, `sources`, `captureRequest`, `captureError`; `listen-ui.js SOURCE_LOOK`, `WAITING`, `NOTHING_TIP` |
| Which kit sounds a 🎧 row may pick | `listen-make.js ROW_SOUNDS` (first is the fallback) |
| The listener's contract | `listen.js` opening comment, then `listen-make.js` and `listen-ui.js` |
| A new `logEvent` kind from sound code | `log-clean.js RULES` first (`tests/log-clean.test.mjs`) |

## ✅ Checked by tests

The claims above marked as checked are tests in `tests/architecture.test.mjs`. When one fails, change this file and the test in the same commit as the code.
