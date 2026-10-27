# 🥁 Beats and 🎼 Song

**In one paragraph.** `sequencer.js createSequencer` is the beat maker, and `beat-engine.js createBeatEngine` is the engine under it: the sounds loaded for scheduling (`ready`), one hit (`sound`), the mix graphs (`busFor`, `letGo`) and the "play a saved beat" path (`prepareBeats`, `soundHit`), with no screen, DOM or storage. `app.js` makes the one engine and hands it to the beat maker, `createSong` and `initKids` (`deps.engine`). Its `play(hooks)` is a loop on the audio clock: 🧸 Kids plays through it today; the loops of `sequencer.js` and `song.js` move onto it in steps 6 and 8 of [one-beat-engine.md](../design/one-beat-engine.md). The sounds it holds are read through `has`/`get`/`drop`/`keep(ids)`/`held`, never as a map. The beat maker's pure rules are in `beat.js` (a beat made safe, the hits it plans, swing, grooves as beats, beat files, tempo stops; imported by the backup gate, Kids' rules, the listener, Song and the share preview, so none of them loads the screen), and the WAV encoder in `wav.js`. The beat maker owns the open beat, its scheduler on the audio clock, the beat's mix bus, the sound chooser, 💃 Grooves, 🗂️ My beats, the pattern chips, the click, 🎚️ Mixer's wiring and 🎹 the roll's wiring. Everything else that plays a saved beat goes through three of its methods (`beatPlan`, `prepareBeats`, `soundHit`), which share the engine's `sound()` and `busFor()`. `song.js createSong` is 🎼 Song: its own record, its own 25 ms scheduler, and no sound code of its own (every hit is `seq.soundHit`). `playlist.js` and `notes.js` are the pure rules under them. 🧸 Kids plays its beat through the engine's `play` (`kids.js playBeat`), and ⌨️ Keys (`dj.js`) drives the sequencer through about 40 methods of its API.

## Who is built where

| Object | Made by | Made in | Lives |
|---|---|---|---|
| The beat engine (`engine`) | `beat-engine.js createBeatEngine({audio, clipById})` | `app.js start()`, before `seq` | the whole visit |
| The beat maker (`seq`) | `sequencer.js createSequencer(deps)` | `app.js makeSequencer`, once in `start()` | the whole visit |
| 🎼 Song (`song`) | `song.js createSong(deps)` | `app.js makeSong`, right after `seq` | the whole visit |
| 🎹 The piano roll | `roll.js createRoll(dialog, deps)` | inside `createSequencer`, when `el.roll` exists | the whole visit |
| 🎚️ Mixer sheet | `mixer.js createMixer({dialog, strips}, api)` | inside `createSequencer`, when `el.mixer` exists | the whole visit |
| Beats' pill picker | `pill-select.js createPillSelect(deps)` | inside `createSequencer` | the whole visit; ⌨️ Keys makes a second one in `dj.js` and registers it with `seq.addPicker` |
| Row speakers | `row-volume.js speakerControls(root, …)` | `createSequencer` (on `el.rows`), `createSong` (on `el.lanes`), `dj.js` | the whole visit |
| Row menus | `overflow.js moreMenu(root)` | `createSequencer` (on `el.rows`), `dj.js` | the whole visit |
| Beat bar fitting | `lines.js fitLine(bar, BEAT_BAR_STEPS)` | `createSequencer`, one per `.beat-bar` | the whole visit |
| The tucked play bar | `mini-deck.js initMiniDeck()` | `app.js start()` | the whole visit |
| A mix graph | `mixer.js buildMix(ctx, dest, p)` | `beat-engine.js busFor`, cached per destination and beat object | on the live context, until what played through it stops (`letGo`) or `mixKey` changes; then disposed after 6 s (`RING_MS`) |

`sequencer.js` and `song.js` never import `app.js`. `app.js` reaches them only through the returned objects; they reach the board only through `deps`.

## The beat record

One shape everywhere: the open beat in memory, a beat in 🗂️ My beats, the scratch, a groove made into a beat, a beat from 🎧 From a song. `beat.js cleanPattern(raw, personId, unsigned?)` makes any of them safe. Everything that brings a beat in uses it: `backup.js` (the `patterns` and `beats` lists), `listen-make.js`, `beatFromFile`, `grooveBeat`, and every read from the library.

### The beat

| Field | Meaning | Rule in `cleanPattern` |
|---|---|---|
| `id` | `beat-…`; a scratch is `beat-scratch-<person>` (`scratch.js scratchId`) | kept only if it matches `BEAT_ID`; else left out (the caller gives one) |
| `personId` | whose beat | always the `personId` argument, never `raw.personId` |
| `name` | up to 24 characters | sliced; `''` when missing |
| `bpm` | quarter notes a minute | rounded, 60–180, default 100 |
| `bars` | 1, 2 or 4 (`BAR_CHOICES`) | else 1 |
| `swing` | 0–50 (`MAX_SWING`): the off-beat eighths play late by `swing/100` of an eighth (the pills between move half as much) | clamped; plays at every level |
| `signature` | `'4/4' '3/4' '5/4' '6/8' '7/8'` (`SIGNATURES`) | **left out** when missing or unknown; see "Time signatures" |
| `swing` | 0–50 (`MAX_SWING`): every odd pill plays late by `swing/100` of a pill | clamped; plays only with Advanced |
| `signature` | `'4/4' '3/4' '5/4' '6/8' '7/8'` (`old-beats.js SIGNATURES`, re-exported by `sequencer.js`) | kept when known. When missing or unknown it is the third argument `unsigned` when that is a known signature (an old beat coming in, stamped), else **left out** and plays as 4/4; see "Time signatures" |
| `volume` | the 🎚️ master level, 0–1 | **left out** at full (ADR 0018) |
| `fx` | the master effect id (`mixer.js MIX_FX`) | **left out** when none |
| `rows` | up to 16 (`MAX_ROWS`), each `cleanRow` | sliced |

Library records add three fields that `cleanPattern` drops, so every write puts them back:

| Field | Written by | Read by |
|---|---|---|
| `created` | `sequencer.js save` (keeps the old one), `keepAside`, ⧉ duplicate, 📥 load, `listen-ui.js` | `chipBeats` (the order of the recent chips) |
| `saved` | `sequencer.js save` on every change and every open | `chipBeats` (which beats get the recent spots), `beatLibrary.list` and `songBook`-style sorting, `scratch.js newest` |
| `pinned` | 📌 in 🗂️ My beats (`togglePin`: the time it was pinned) | `isPinned`, `chipBeats`; `save` copies it forward, ⧉ deletes it |

### A row

`cleanPlainRow` then `cleanRow`:

| Field | Meaning | Notes |
|---|---|---|
| `clipId` | the row's sound, from any person's board (`<person>-<kit id>` for a preset) | 64 characters; `null` is "no sound" |
| `steps[]` | pills on | at least 16 (`STEPS`), at most 80 (`MAX_PILLS`). Kept longer than the beat: pills past `bars` stay stored and hidden, so 4 bars → 1 → 4 loses nothing |
| `accents[]` | loud hits (`ACCENT_GAIN` 1.5) | only where `steps` is on; always all false on a tune row |
| `rate` | 1, 2 or 0.5 (`ROW_RATES`) | heard only with Advanced (`playMode() === 'speed'`) |
| `ring` | 🔔 Let it ring: hits ring over each other, up to `rhythm.js MAX_RINGING` | every level |
| `muted` | the speaker's mute | |
| `solo` | 🎚️ Solo | **left out** unless true |
| `fx` | the row's 🎚️ effect id | **left out** when none |
| `volume` | the speaker's level 0–1 (`row-volume.js`) | **left out** at full |
| `collapsed` | an old "slim row" look | kept and cleaned, but nothing reads it any more |
| `melody` | a tune row (🎹, ADR 0023) | |
| `notes[]` | the old melody rows' note per pill (semitones from `MELODY_NOTES`) | for older copies of the app |
| `tune[]` | a tune row's notes, `{p, s, l}` (`notes.js`) | only on a tune row |

**A tune row writes three views of one thing.** `tune` is the truth. `cleanRow` rebuilds `steps` (on where a note starts) and `notes` (the nearest old scale note) from it with `notes.js legacy`, every time, so an older copy plays the tune roughly and the compact row, chips and thumbnails can draw it. A row stored by an older copy has no `tune`: `notes.js fromLegacy` reads its pills as one-pill notes. Code that edits a tune row must pass the result through `cleanRow` (the roll's `commit`, `addSnaps`, `putRows`/`paintRows`, `slideRows`' callers, `kids-logic.js`). Guard: `tests/tune-rows.test.mjs`, `tests/notes.test.mjs`.

### A note (`notes.js`)

`{p, s, l}`: `p` semitones over the sound's C (−24 to 36), `s` the start pill, `l` the length in pills. `s` and `l` are halves at most (½ Half pills is Advanced). Two notes of one pitch never overlap (`cleanNotes` cuts the earlier one); different pitches may (chords). At most 256 notes a row, 64 pills a note.

### A beat file (🗂️ My beats ⬇️ / 📥)

`beat.js beatToFile` / `beatFromFile`: `{format: 'noodlepads-beat', version: 1, name, bpm, bars, swing, rows, signature?, volume?, fx?}`. A row's `clipId` becomes `sound`, the kit id (`'kick'`); rows of a kid's own sounds are dropped and counted. Reading also accepts the old format name `noodle-pads-beat`, caps the text at 64 KB, and maps `sound` back to `<personId>-<kit id>`. The beat-level fields are listed by hand in `beatToFile`: a new beat field must be added there too. A beat file does **not** go through `backup.js` or `merge.js`. A file without a `signature` (made before beats had their own) is stamped on loading with the loader's settings (`settings.js unsignedSignature`, passed as `beatFromFile`'s fourth argument).

### Old beats are stamped

A beat saved before each beat had its own `signature` has none. It used to be read by a guess: the person's old setting `timeSignature` when Advanced was on, else 4/4. Ben (2026-10-27) had that answer written into each such beat once, so no code guesses and a clean import into v2 needs no Settings. `old-beats.js` (no imports; `store.js` uses it mid-upgrade) holds the rule: `unsignedAs(...layers)` takes settings objects, the person's first and the device's after, as `settings.js getSetting` reads them, and `stampBeats` stamps a list of stored records.

| Way in | Where it is stamped | Settings it reads |
|---|---|---|
| The database on this device | `store.js upgradeStores` (version 16, `STAMP_SINCE`) → `stampStored`, inside the upgrade's transaction: every record of `beats` and `patterns` without a signature | the beat's owner's `prefs`, then the device's `settings` |
| A backup (1.0 to 1.2), older sounds found, a cloud pull, a share remix | `backup.js cleanBackup`: `cleanPattern(…, unsignedFor(personId))` for `patterns` and `beats` | the document's own `prefs` and `settings`, then this device's (`backup-ui.js whatIsHere().settingsHere`) |
| A beat file | `beat.js beatFromFile` (the 📥 handler) | the loader's, `settings.js unsignedSignature` |

The owner's settings decide, not whoever is looking, so a beat sounds as it did for the person who made it. A beat made by current code with no signature is a new beat: 4/4. The backup format does not change (`signature` was already in it): a 1.x backup with an unsigned beat loads stamped. If the upgrade cannot read a store it leaves the beats as they were (the database must open), and they play as 4/4. After the upgrade each device syncs its stamped beats up like any edit. Why: [ADR 0035](../adr/0035-old-beats-stamped.md). Guard: `tests/stamp-signatures.test.mjs`, `tests/song-unsigned.test.mjs`.

## The open beat, the library and the scratch (ADR 0017, 0020)

**One open beat per person.** The sequencer holds it as `pattern`, and shows it in one of three views (`slot`): `'beats'` (Beats, ⌨️ Keys off), `'dj'` (Beats with ⌨️ Keys on) or `'live'` (🎤 Live, which shows no beat: `pattern` is `null` there and the click follows `LOOSE`, 100 BPM). `app.js beatView()` picks the view; `app.js showView` calls `seq.show(view)`. Changing view stops the beat.

**Three stores, one truth.**

| Where | What | Written by | Read by |
|---|---|---|---|
| `state.savedBeats` / IndexedDB `beats` (key `id`) | every beat, the scratch included | `app.js beatLibrary.put` (the sequencer's `deps.library`), `app.js adoptKidsBeat`, 🧸 Kids' `deps.saveBeat` (its own copy of `put`), `listen-ui.js` (through `deps.library`), backups, the cloud | `deps.library.list` (sequencer), `makeSong`'s `deps.beats`, `kids.js deps.beats`, `app.js` See all and shares |
| `state.patterns` / IndexedDB `patterns` (key `personId`) | which named beat is open (the whole beat is stored; only its `id` is used) | `deps.setOpen` from `sequencer.js save`, `openBeat`, `fromStore`, `show` | `sequencer.js fromStore` only |
| the sequencer's `doc` | `{pattern, seen}`: the open beat and the library record it was read from | `setPerson`, `show`, `save`, `openBeat`, `switchNow` | `show`: if the library record is no longer `seen` (a sync, a backup, a remix, 🧸 Kids' squares), the beat is read again |

The library is the truth. `patterns` only says which named beat is open; no record means the scratch is open. `fromStore` still handles a pre-ADR-0008 `patterns` record that holds a whole beat with no library copy: one with hits joins the library (`link`), an empty one is dropped.

**The scratch beat** (`scratch.js`). A normal `beats` record with the reserved id `beat-scratch-<person>`, never listed (`isHiddenBeat`) in 🗂️ My beats, the chips, a song's strip, or shares. Before its first change it does not exist (`scratchPattern` makes an empty one with `signature: '4/4'`). Its `name` is `SCRATCH_NAME` (`'Scratch'`), or a groove's name when a groove was loaded into it; `scratch.js grooveOf` finds the groove by that name (or a renamed groove's old one, `was`: "Motown" is Detroit soul), and `scratchLabel` shows "Ska (scratch)". 🧸 Kids' old `beat-kids-…` beats become the scratch (`scratch.js adoptKidsBeats`, run by `app.js adoptKidsBeat` every time a person shows).

**Lifecycle of the open beat.**

| Action | Function | What happens |
|---|---|---|
| A person shows | `seq.setPerson(id)` from `app.js showPerson` | stops, reads `fromStore`, draws. The same person again while playing (a sync, a backup) sets `readAgain` and carries on; the read happens at `stop()` |
| A view shows | `seq.show(which)` | re-reads the library copy if it changed; a deleted beat opens the scratch |
| Any edit | `save()` | `library.put` with `created`/`saved`/`pinned`, `doc` updated, `setOpen(person, pattern)` (or `null` for the scratch). Clears `loaded` (the "groove just loaded" line) |
| 🆕 New | `newScratch` | stops; a scratch with hits is kept first (`keepAside`, a fun name or `keptName`); the scratch record is removed; an empty scratch opens |
| 💾 Keep | `keep` | the scratch gets a new `beat-…` id and a name (typed, `keptName`, or `beatName`), is saved, and the scratch record is removed. Waits while ⌨️ Keys records (`chipsLocked`) |
| A name typed on the scratch | `nameScratch` | keeps at once if it has rows; else `wantedName` waits, and `save` keeps it (in a microtask) once a row exists; `lockChips(false)` also keeps it |
| A chip, 🗂️ My beats, 📥, Undo | `openBeat(next, {resume})` | stops, opens, saves, `onBeatChange`; plays again if it was playing and `resume` |
| 🗑️ in 🗂️ My beats | `closeEverywhere(id)` | the scratch opens if that beat was open |
| 🎧 From a song's 🥁 Open part A | `seq.openSaved(id)` | `openBeat` stopped |

## The scheduler

### Clocks and timers

| Timer | Owner | Period | What it books |
|---|---|---|---|
| `timer` | `sequencer.js play` → `schedule` | 25 ms (`TICK_MS`) | every hit due before `currentTime + 0.1` (`LOOKAHEAD`), and the click; a hit already more than 20 ms past (`audio.js tooLate`, after a stall) is dropped, its pill still counted |
| `aloneTimer` | `seq.metronome(on)` | 25 ms | the click alone while the beat is stopped (⌨️ Keys / 🎤 Live's ⏲️) |
| `raf` | `sequencer.js follow` | every frame | the playhead: pills heard so far |
| `askTimer` | `arm` | 3 s (`ARM_MS`) | a Clear? or Remove? forgets its first tap |
| `sample.timer` | `hearBeat` | one `setTimeout` | ends a groove sample |
| Song's `timer` | `song.js play` → `tick` | 25 ms | the next planned events before `currentTime + 0.1` |
| Song's `raf` | `song.js follow` | every frame | the playhead line and the lit blocks |
| The engine's `run.timer` | `beat-engine.js play` (🧸 Kids' beat) | 25 ms (its own `TICK_MS`) | what `beat.js hitsDue` says is due before `currentTime + lookahead` (Kids: 0.12 s), dropping a hit already past; the squares, ● 's pass |

`play()` waits for every row's sound (`refresh` → `audio.load`, into the `ready` map); a `stop()` meanwhile (a song or sample begins, the screen changes) makes it stand down (`playAsk`, `tests/beat-ready.test.mjs`). Then it sets `t0 = currentTime + 0.05` (plus one bar with a count-in).

### Per-row clocks

Each row has `clocks[i] = {next, step}`: when its next pill sounds and which pill. `schedule` loops each row while `clock.next < until`, reading `stepSeconds(pattern, row, playMode())` on every pill, so a tempo or rate change lands at once. Per-row arrays kept in step with `pattern.rows`:

| Array | Holds | Spliced by |
|---|---|---|
| `clocks` | `{next, step}` | `moveRow`, `removeRow`, `undoRemove` (inserts `undefined`), `switchNow`, `play` |
| `voices` | the row's sounding voices `{src, gain, end, lift, level}` | same |
| `shown` | the pill each row's playhead is on | same |
| `queue` | booked `{row, step, time}`, for the playhead | remapped by `moveRow`, `removeRow`, `undoRemove` |
| `pills` | `pills[row][step]`, the buttons | `render` |
| `litPills` | the `.now` pill per row | `showSteps` |

A row with no clock (added while playing, or put back by Undo) gets one from `joinClock`: it copies a row already playing at the same speed, so it lands on the same pill; with none, it counts from `t0`.

### Rates, bars and signatures

- **Rates.** `playMode()` is `'speed'` with Advanced, else `'plain'`. In `'speed'` a row's pill is `base / row.rate`. Every row plays all `total()` pills (`countOf`), so a 2× row goes round twice per pass of the beat.
- **Bars.** `total() = bar() × pattern.bars`. Pills past `total()` are stored but hidden (`p.hidden = s >= count`) and never played.
- **Time signatures.** `sigOf()` is the beat's `signature`; a beat with none plays as the old person setting `timeSignature` when Advanced is on, else 4/4. `groups()` is `SIGNATURES[sig]` (the beat groups in pills), `bar()` their sum. Choosing a signature needs Advanced (`el.shape.hidden = !advanced`); playing one does not. Pills always last a sixteenth; BPM always counts quarter notes.
- **Swing.** `swingDelay(step, dt, swing, groups)` delays the "and" pill of each 4-pill beat by `swing/100` of an eighth and its odd pills by half that (a 6-pill group of 6/8 or 7/8 moves only its odd pills); `groups` is the signature's. A groove may carry `swing` (Lo-fi, Boom bap, Dusty), which `grooveBeat` copies to the beat. Only the sound and the playhead move; the clock does not. `swingNow()` is the beat's swing at every level (Regular and Advanced see the keys; a beat saved with swing plays it for everyone). A tune row's half-pill notes are not swung. The UI offers 0, 33 and 50 (`SWING_KEYS`); other stored values play as stored.
- **Time signatures.** `sigOf()` is the beat's `signature`, 4/4 when it has none. A beat saved before each beat had its own was read by a guess (the person's old setting `timeSignature` with Advanced on, else 4/4); that answer is now written into the beat once, and nothing guesses ("Old beats are stamped" below). `groups()` is `SIGNATURES[sig]` (the beat groups in pills), `bar()` their sum. Choosing a signature needs Advanced (`el.shape.hidden = !advanced`); playing one does not. Pills always last a sixteenth; BPM always counts quarter notes.
- **Swing.** `swingDelay(step, dt, swing)` delays odd pills by `swing/100` of a pill. Only the sound and the playhead move; the clock does not. `swingNow()` is 0 without Advanced. A tune row's half-pill notes are not swung. The UI offers 0, 33 and 50 (`SWING_KEYS`); other stored values play as stored.
- **Tempo while playing.** `retime(oldBpm)` maps every not-yet-booked time with `retimeAt(anchor, old, new)`: `t0`, `clickNext`, every `clocks[i].next`, live-hit `skips`, and a `queued` chip switch. So `t0 + n × pill` stays pill n's time, and ⌨️ Keys' snapping stays right. The slider applies it on `input`, saves and calls `onTempo` on `change`.

### What one hit does (`sound`)

`beat-engine.js sound(ctx, dest, list, row, loaded, time, loud, note, len, opts)` (`opts`: `clipOf`, `ring`, `level`, for a player with no mixer, 🧸 Kids):

1. `audio.js makeVoice(ctx, buffer, dest)`; its gain is `hitGain(row, loud)` = (1.5 if loud) × the row's level. `voice.lift` is kept, so a level change can reach a hit still ringing (`applyLevel`).
2. A tune row's note plays faster or slower (`noteRate(note + rootShift(clip.root))`, so a sound whose note 🎵 Find its note found plays its C as a C). A plain row plays at rate 1.
3. `len > 0` (a note's length) fades it out there (`fadeStop`).
4. `rhythm.js ringOver(list, time, ring || row.ring || melody)` decides which earlier voices of the row are cut at `time` with a short fade; Let-it-ring rows and tune rows keep up to `MAX_RINGING`.

`hit(i, time, …)` is the live caller: it sends the voice to `busFor(ctx, audio.master, pattern).input(i)`, tells `deps.onHit(clipId, ms)`, and counts `stats` (logged at `stop`).

### The click and the count-in

- `blip(at, one)`: an oscillator straight into `audio.master` (1500 Hz on the "1", 1000 Hz otherwise). It never goes through the mix, so `bounce` never renders it.
- `scheduleClicks(on, until)` keeps `clickNext`/`clickBeat` on the beat's groups whether the click is heard or not, so turning it on lands on time. After a stall it skips missed ticks along the grid while playing, or restarts while stopped.
- Who decides if it sounds: `clickOn = clickOverride ?? clickWanted`. `clickWanted` is Beats' ⏲️ (`el.click`, remembered in localStorage `beat-click`). ⌨️ Keys sets `clickOverride` with `seq.setClick(on)` while it records or plays, and hands it back with `setClick(null)`. `seq.clickOff()` (⏹️ Stop all) turns `clickWanted` off and remembers it.
- `seq.clickAt(at)` moves the next tick while stopped (⌨️ Keys' tap tempo).
- **Count-in:** `play({countIn: true})` books one bar of blips from `t0`, then starts the beat after them. Only ⌨️ Keys' ● Record asks for it (`dj.js`).
- **Growing while recording:** `seq.setGrow(fn)` sets `growHook`. As the click books the last beat of a pass, `fn()` is asked; true doubles `bars` (1 → 2 → 4) with `multiplyRows`. Only `dj.js` sets it.

### The playhead and output latency

`follow()` runs every frame: `stepsHeard(queue, shown, currentTime, outputDelay(ctx))` moves each row's playhead only once its pill has **come out of the speaker** (`outputDelay` = `outputLatency + baseLatency`, at most 0.2 s). Then `showSteps` (only the pills that change), `drawPlayhead` (one bar when rows line up, else a short bar per row), `keepInSight` (follow.js), `roll.step(shown)`, and `deps.onSteps(shown)` (⌨️ Keys' grid).

Latency is worked out in two places with the same sum: `beat.js outputDelay` (Beats, and 🎼 Song's line and lit blocks through `song.js heardAt`) and `app.js`'s `deps.latency` for `dj.js`. 🧸 Kids' squares do not take it off at all.

### Switching beats on the bar line (pattern chips)

`chipBeats(beats)`: pinned beats first (in pin order), then the most recently `saved`, shown oldest-`created` first, 8 spots (`MAX_CHIPS`). A chip tap while stopped opens the beat. While playing, `pickChip` sets `queued = {id, at: nextBarLine()}` and loads its sounds. `schedule` books nothing at or past `queued.at`; when the lookahead reaches it, `switchNow` swaps `pattern` on the same clock (`t0 = at`, fresh `clocks`, `voices`, `shown`), moves the old voices to `ringing` so they ring out, saves, and calls `onBeatChange` and `onTempo`. `stop()` drops a waiting switch. ⌨️ Keys locks the chips while recording (`lockChips`).

### Live hits recorded into the beat (for ⌨️ Keys)

`beatClock()` gives `{t0, step, total, rates}` for snapping. `rowFor` / `addRowFor` find or make the row for a sound (`rowSlot` reuses an empty row; while recording, before adding one). `addSnaps(snaps, {skipAfter, draw})` turns pills on (never off), adds a one-pill note on a tune row, and pushes `skips` so the beat does not play again a pill the kid just played live. `snapshot()` / `restore(copy)` are ⌨️ Keys' own Undo.

## The mix bus (ADR 0015, 0018)

**What decides if and how loud a row plays:**

| Control | Stored on | Applied where |
|---|---|---|
| Row level | `row.volume` | per voice: `hitGain` in `sound()`; a change while playing ramps the ringing voices (`applyLevel`) |
| Mute | `row.muted` | `audible(row, p)`: the row's hits are never booked (`schedule`, `planHits`) |
| Solo | `row.solo` | `audible` → `mixer.js silencedBySolo`: only soloed rows are booked |
| Row effect | `row.fx` | the mix graph: the row's own input runs through it |
| Master level | `pattern.volume` | the graph's `master` gain, set on every `busFor` call (ramped live, set offline) |
| Master effect | `pattern.fx` | the graph: every row through it before `master` |

So the graph from `mixer.js buildMix` holds only the effects and the master level. Level, mute and solo are handled in the sequencer.

**`beat-engine.js busFor(ctx, dest, p)`** keeps one graph per destination and beat object (`WeakMap(dest → WeakMap(beat → graph))`), rebuilt when `mixer.js mixKey(p)` changes (the master and row effect ids, and `bpm`, which 🔁 Echo needs). Effects are `steps.js` kinds built live (`buildLive`); 〰️ Warble and 🤖 Robot start oscillators, which `dispose()` stops. If building fails, the bus falls back to the destination itself.

**Letting go of live graphs.** `liveMixes` lists every graph on the live context. `letGo(which)` forgets the ones it picks and disposes them after 6 s (`RING_MS`), once their tails have rung; the next hit builds a fresh one. It runs on every `stop()` (the graphs into `audio.master`, except a groove sample's), on a chip switch (the old beat's), at the end of a sample (`stopSample`), after a 🎹 note preview with the beat stopped (`endPreviews`: when the roll closes, or `RING_MS` after the last note), and in 🎼 Song as each lane plays its last block of a beat (`song.js tick`, `mixEnds` → `seq.endMix([laneGain], pattern)`) and when the song stops (`seq.endMix(laneGains)`). Offline renders are never listed. Guard: `tests/mix-let-go.test.mjs`.

**The 🎚️ Mixer sheet** (`mixer.js createMixer`) only draws and listens. Every change goes back through the sequencer (`setLevel`, `toggleMute`, `toggleSolo`, `setRowFx`, `setMaster`, `setMasterFx`, `allOn`), each of which saves and redraws (`mixChanged` also calls `onBeatChange`). It is opened by any `[data-mixer]` button (Beats and ⌨️ Keys).

## The shared "play a saved beat" path

Three methods at the end of `createSequencer`:

| Method | Does | Notes |
|---|---|---|
| `beatPlan(raw)` | `cleanPattern`, then `planHits` for one pass: `{pattern, seconds, hits: [{row, step, time, loud, note, len}]}` | uses **this device's** Advanced: `playMode()` and `oldSignature` for a beat with no signature (`barOf`) |
| `prepareBeats(patterns)` | loads every row's sound into `ready`, afresh (a voice may have changed) | never empties `ready` (`refresh`), so a beat or song playing keeps its sounds; a sound that is gone (`deps.clipById` finds none) is taken out, and one that fails to load this time keeps the copy it had |
| `soundHit(ctx, dest, list, p, i, time, loud, note, len)` | `sound()` through `busFor(ctx, dest, p).input(i)` | false when the sound is not in `ready` |

Who uses what:

| Caller | Plans with | Sounds with | Booking |
|---|---|---|---|
| Beats ▶ (live) | per-row clocks in `schedule` | `hit` → `sound` + `busFor` | lookahead |
| Beats 🔊 Save as a sound (`bounce`) | `planHits` on the open beat | `sound` + `busFor` on an `OfflineAudioContext` | offline |
| 🎹 roll's note preview (`previewNote`) | — | `sound` + `busFor` | at once |
| 💃 Grooves' ▶ sample, 🎧 From a song's ▶ part (`hearBeat`) | `beatPlan` | `soundHit` into `audio.master` | **every hit of the pass booked at once** (≤ 4 s, or 12 s for 🎧) |
| 🎼 Song ▶ | `song.js planSong` → `beatPlan` | `soundHit` into a lane gain | lookahead (song tick) |
| 🎼 Song 🔊 Save as a sound | `planSong` | `song.js soundSong` → `soundHit` | offline |
| Share previews (`cloud.js shareItem` → `renderShare`) and 🗂️ See all (`things.js` → `deps.render`) | `share-render.js renderAudio` → `beatPlan` / `planSong` | `soundHit` | offline |

The beat sounds the same in all of them because they share `sound()`, `busFor()` and `planHits()`. A new place that plays a beat should use `beatPlan` + `prepareBeats` + `soundHit`, and should stop the live beat first, so one thing plays at a time.

**One thing plays at a time.** `seq.play` and `hearBeat` call `deps.onPlay` (`app.js`: `song.stop()`); `song.play` calls `seq.stop()`; `hearBeat` stops the beat. `app.js stopEverything` (⏹️, Space) stops all three and both clicks. Leaving Beats or Song stops it (`app.js setScreen`), and so does 🧸 Kids showing (`applyKids`).

## Save as a sound

| | Beats (`sequencer.js saveAsSound` → `bounce`) | Song (`song.js saveAsSound`) |
|---|---|---|
| Length | one pass, `total() × baseStep()`, no tail | the planned song, muted lanes left out; refused over 180 s (`MAX_SONG_SECONDS`) |
| Context | `OfflineAudioContext(2, …, live sampleRate)` | the same |
| Name | `deps.remixName(beat name)`: "Wobbly Thunder (🌀 Wonky Remix)" | `deps.soundLabel(song name)`: its own name, or a remix if a pad has it |
| After | `normalize` (peak to 0.9), `encodeWav`, `deps.addClip({label, blob})` → `app.js addMadeSound` with 🥁 | same, with 🎼 |
| Where it shows | 🗂️ My beats' note line (`el.libNote`) | the banner (`note`) |

A share preview (`share-render.js`) is mono at 22,050 Hz, a beat played twice (`BEAT_PASSES`), with a 1 s tail.

## 💃 Grooves and trying a groove (ADR 0004, 0020)

- **The data.** `grooves.js GROOVES` (51 grooves) and `GROOVE_GROUPS` (7 styles). A groove is `{id, name, emoji, group, bpm, about, signature?, rows: [[kit id, 'x..X']]}`. `x` a hit, `X` a loud hit, a space only splits bars. `tests/grooves.test.mjs` checks shapes and sounds.
- **Into a beat.** `grooveBeat(groove, personId, hasClip)`: each row plays `<person>-<kit id>`; rows of sounds the board lacks are left out. Bass rows (`bass-a`, `upright-f`…, `bassNote`) become **one** tune row on that instrument's C, at each note (`notes.js lineOf`), where the first bass row was. Chord rows stay plain rows. `grooveShape` gives its signature, bar and bars.
- **The card.** `grooveCard`: its thumbnail, `about`, the 🎻 "who plays" chips (`groovePlayers`, leaving out the default 💧 Pluck and ⚡ Synth), and with Advanced its sounds, bars and tempo.
- **Loading** (`pickGroove` → `loadGroove`). Into the scratch, which opens; the scratch keeps its id and takes the groove's name. With ⌨️ Keys on it opens stopped; on Beats a playing beat carries on with it. `loaded = {before, scratchBefore, groove, replaced}` remembers how to undo it. Keys off: the banner's ↩️ Undo (`offerUndo`). Keys on: `seq.trying()` makes `dj.js` show its line, whose ↩️ My beat is `seq.putTrialAway()`. Both end in `undoLoad`. Any `save()` clears `loaded`.
- **➕ Add to this beat** (`grooveAdds`, Keys off only): `mergeGroove` lays the groove's pills over the open beat's rows (same sound and kind → same row; a tune's notes join where none starts), turning nothing off, with Undo (`{before, pattern, groove, added}`). While the beat plays, the new rows' sounds load (`prepare`) and the rows join from their next pill, as every row-adding path does (`tests/beat-sounds-kept.test.mjs`).
- **▶ sample** (`playSample` → `hearBeat`): see the table above. Closing the dialog, picking a groove, or another ▶ ends it.
- `deps.onGroovesOpen` lets `app.js showCard` show 🎧 From a song's card for this person's level.

## Tune rows and 🎹 the piano roll (ADR 0023, 0030)

- A row becomes a tune row from the chooser's 🎹 Tune (`el.chooserMelody`), or from 🎹 Add a tune (`addTune`, after `#tune-who` asks who plays it). Turning a tune off asks first if any note has another pitch or length.
- A tap on a tune row's pill or emoji opens the roll (`openRoll`) instead of lighting a pill. Pill picking (`pill-select.js`) leaves tune rows out.
- **The roll's deps** (filled in `createSequencer`): `beat`, `row(i)`, `total`, `groups`, `advanced`, `commit(i, tune)` (`cleanRow`, `save`, `render`, `onBeatChange`), `preview` (`previewNote`), `playing`, `togglePlay` (clicks `el.djPlay` in ⌨️ Keys, else `el.play`), `openSound` (the chooser), `clipById`, `colorOf`, `placed` (`countPlay('notes')`), `instrument` (`rowInstrument`) and `swapInstrument` (moves the row to another instrument's copy of the same note, and keeps it as the person's pick through `inst-picker.js pickInstrument`).
- The roll keeps its own ↩️ Undo (`history`, 30 steps, per visit). A drag commits on every move with `{quiet: true}` (an argument the sequencer's `commit` ignores) and pushes one Undo step on release.
- `roll.refresh()` from `render` closes the roll when its row is gone or is no longer a tune.

## 🎼 Song (ADR 0024, 0031)

### The song record

`song.js cleanSong(raw, nameFor, beatOf)`:

| Field | Meaning |
|---|---|
| `id` | `song-…` (`SONG_ID`); the scratch is `song-scratch-<person>` |
| `personId` | whose |
| `name` | up to 24 characters; `nameFor()` when empty |
| `tempo` | 60–180, the song's own tempo from bar 1 |
| `tempos` | tempo marks `[{bar, bpm}]`, bar 2 to 128, at most 32; **left out** when none (`playlist.js cleanTempos`) |
| `lanes` | 1–8 (`MAX_LANES`, 4 to start): `{name (16 chars), emoji, muted, volume (always stored), blocks}` |
| `lanes[].blocks` | up to 64 a lane: `{beatId, bar (from 0), times (1–64)}`, one per bar, in bar order |
| `slots` | for older copies: `playlist.js legacySlots` (16 blocks in time order, ×4 at most). `song.js save` rewrites it every time |
| `created`, `saved` | on `songbook` records only (`save`, ⧉, keep) |

A song from before lanes (only `slots`) becomes lane 1's blocks, back to back, at its first beat's tempo (`slotsToLanes`). A block whose beat is gone keeps one bar a pass, shows "Deleted beat", and is skipped.

### Where songs are kept

| Where | Key | Written by | Read by |
|---|---|---|---|
| `state.songbook` / IndexedDB `songbook` | `id` | `app.js songBook.put/remove` (`deps.songs`) | `deps.songs.list`; `app.js` See all and shares |
| `state.songs` / IndexedDB `songs` | `personId` | `deps.save` (the open song, a named one), `deps.close` (deletes it: the scratch is open) | `deps.load` in `song.js setPerson` |

### The song's clock

- **Time is in song bars:** one bar of 4/4, 16 pills (`BAR_STEPS`), at the tempo of that bar. A beat plays at the **song's** tempo (`planSong` overrides each beat's `bpm` with `song.tempo`), pass after pass. A 2-bar beat takes 2 song bars a pass; a 3/4 beat takes ¾ of one (`beatSteps`). A beat with no signature is 4/4 (`barSteps` of nothing), here and in `sequencer.js barOf`; a beat from before signatures is stamped ("Old beats are stamped"), so its block length no longer follows anyone's settings.
- `playlist.js songClock(song)`: `barStart`, `at(pill)`, `barAt(seconds)` and `tempoOf(bar)` with the marks; the plain arithmetic when there are none.
- `playParts(lanes, stepsOf, clock)`: every pass of every block, cut where the next block on its lane starts.
- `playEvents(parts, plans, {from, skipLanes, clock})`: every hit of the song in time order. With marks, a hit is placed by its pill on the clock, and a held note's length follows the bars.
- `song.js planSong(song, beatOf, seq, {from, skipMuted})` puts these together, planning each beat once with `seq.beatPlan`.

### Playing

`song.js play`: `seq.stop()`, plan from `startBar` (a bar tapped in the ruler), `seq.prepareBeats`, one `GainNode` a lane (`laneGainsFor`: its volume, 0 when muted) into `audio.master`, `t0 = currentTime + 0.1`, then `tick` every 25 ms books events before `currentTime + 0.1` with `seq.soundHit`, keyed `lane:beatId:row` for cutting. A lane's speaker changes its gain live (`liveLevel`). It stops itself 0.2 s after its end is heard (`heardAt`). `follow` lights blocks (`playingAt`) and moves the line, both at the time heard (`heardAt`: the clock less `outputDelay`, `tests/song-playhead.test.mjs`), and the song stops once its end is heard; `outputLatency` is reported by Chrome and Firefox (Android too); Safari reports only `baseLatency` (about 10 to 20 ms), which `outputDelay` adds, so there the line moves by that much and no more; `deps.onHit` is wired but only acts while ⌨️ Keys shows, which it never does on the Song screen.

### Editing and undo

- Pick a beat in the strip (`deps.beats`: the person's beats minus the scratch), then tap a lane bar (`tapSpot` → `placeBlock`); the first block sets an empty song's tempo from its beat. Drag a selected block's ⟷ end, or ➖ ➕, for repeats (`setTimes`, `timesForEnd`, `maxTimes`); 🗑️ asks first.
- Every edit goes through `edit(change)`, which pushes a snapshot `{tempo, tempos, lanes}` (40 steps, `MAX_UNDO`) and saves. Lane mute and volume are **not** undo steps, and `undoStep` keeps them as they are now (lanes are only added at the end, so a lane keeps its index; `tests/song-undo-mute.test.mjs`). Most edits stop playback first.
- 🎼 Tempo sheet (Advanced): marks are added, changed and removed there (`putTempo`, `removeTempo`); everyone hears and sees them.
- The scratch song, 🆕 New, 💾 Keep and a typed name work as for beats (`newScratch`, `keep`, `nameScratch`, `wantedName`), with `uniqueSongName` and `deps.songName`.

## Concepts that span files

### "Advanced" for beats

The person setting `advancedBeats` (true only at the Advanced level; `settings.js`). Read three ways: the sequencer caches it (`onSetting('advancedBeats')` → `render`); `song.js advanced()` reads `getSetting` each time and re-renders on change; the roll asks `deps.advanced()`. It turns on: row rates (`playMode`), choosing a signature, the old `timeSignature` fallback, ½ Half pills in the roll, groove card details, the chooser's speed keys, and 🎼 Tempo marks editing. Because `beatPlan` reads it, **a song or a share preview plays a beat by the level of the person playing it**, not the one who made it.

### Undo, five kinds

| Undo | Where | Holds |
|---|---|---|
| Beats' banner Undo | `sequencer.js offerUndo` / `undoRemove`, shown by `ui.js showBanner` (8 s) | one of: a removed row `{row, at, pattern}`; a level `{level: {at, before}}`; a pill drag or delete `{copy, text}`; a groove added `{before, added}`; a groove loaded `{before, scratchBefore, …}`. Forgotten when `pattern` changes (`render`) |
| ⌨️ Keys' own Undo | `dj.js`, through `seq.snapshot()` / `seq.restore()` / `seq.putLevel()` | a copy of the beat |
| ↩️ My beat | `seq.putTrialAway` → `undoLoad` | a groove just loaded |
| 🎹 roll's ↩️ | `roll.js history` | the tune before each change |
| 🎼 Song's ↩️ | `song.js undoSteps` (and a banner for a removed tempo mark) | `{tempo, tempos, lanes}` |

### Identity of the beat object

Several things are keyed by the `pattern` **object**, not its id: `undo.pattern`, `levelBefore.pattern`, the picker's `beat` (`pill-select.js keep`), and the `busFor` cache. Code that replaces `pattern` with a fresh `cleanPattern(...)` (opening, switching, `restore`) forgets them all, on purpose. Code that edits rows in place (`putRows`, `paintRows`, `setLevel`) keeps them.

### ⇆ Lock and picking pills

`pill-select.js` (rules in `slide.js`): a mouse picks and drags lit pills at any time; a finger only while ⇆ is on (`locked`). One picker per view (`pickers`: Beats' rows, and ⌨️ Keys' grid via `seq.addPicker`); `shownPicker()` finds the one on screen for the lock bar's All · None · Invert (`el.moveBar`). A drag paints only the pills that changed (`paintRows`) and draws everything on drop (`putRows`); a slide or delete offers Undo through `undoable`. `app.js` wires ⇆ (`[data-move-open]` → `seq.toggleLock`) and unlocks on leaving Beats (`seq.endLock`).

### Dragging a row past the screen's edge

`edge-scroll.js edgeScroller` scrolls the page while a row's grip ⠿ is dragged near the top or bottom of the room between the beat's stuck control bar and the toolbar, faster nearer the edge (`edgeSpeed`, `EDGE` 64 px, `EDGE_MAX` 1200 px a second). Only `sequencer.js` uses it (`rowScroll`); the order is saved on release.

### Playhead following

`follow.js follower(box)` + `keepInView`: Beats' rows (`rowFollow`), 🎹 the roll (`gridFollow`) and ⌨️ Keys' grid turn a page when the playhead leaves the view, until the kid scrolls. 🎼 Song also uses `follower` but works out its own page turn from `offsetLeft` in `song.js follow`.

### Lines that give way

`lines.js fitLine` (the beat bar: `fit-split`, `fit-tight`, `fit-stack`), `overflow.js moreMenu` (a row's menu from its emoji; `beat-row.js rowParts` marks its buttons with `data-more-word`), and `mini-deck.js` (▶ and ▾ in the slim top bar once the deck scrolls under it; it clicks `#seq-play` or `#dj-play` and copies their state with a `MutationObserver`).

### Names

`names.js`, passed in by `app.js`: `beatName` (a new kept beat), `keptName` ("Sleepy Squid (Ska version)"), `remixName` (Save as a sound), `songName`, `partNames` (🎧 From a song). The sequencer's `uniqueName` and `song.js uniqueSongName` number a typed name that is taken.

## Every callback

### `createSequencer(deps)`, filled by `app.js makeSequencer`

| deps | Filled with | Called when |
|---|---|---|
| `el` | the Beats, chooser, library, grooves, mixer, roll elements | — |
| `audio`, `meter` | `audio.js audio`, `meter.js meter` | `meter.run()` on every `schedule` |
| `clips()` | `clipsFor(state.personId)` | `nextSound`, `addTune` |
| `groups()` | `app.js groupsForChooser` (`{id, groupId, name, plain, color, clips, collapsible}`) | chooser, `render`, `rowInstrument` |
| `clipById(id)` | `anyClip` (any board) | everywhere |
| `colorOf(clip)` | `padColor(clip.color)` | rows, chips, thumbnails, mixer, roll |
| `makePad(clip)` | `app.js makePad` | chooser pads |
| `makeAddPad` | passed, **never read** | — |
| `isGroupOpen`, `toggleGroup` | the pads screen's open groups | chooser headers |
| `ready()` | `!!currentPerson()` | `onSetting` handlers skip drawing mid-restore |
| `opened(personId)`, `setOpen(personId, pattern|null)` | `state.patterns` + IndexedDB `patterns` | `fromStore`, `save`, `openBeat`, `show` |
| `library` | `app.js beatLibrary {list, put, remove}` | everywhere |
| `kitIds()` | the kit's ids | beat files |
| `beatName`, `keptName`, `remixName` | `names.js` | keep, New, Save as a sound |
| `addClip({label, blob})` | `addMadeSound({emoji: '🥁', …})` | Save as a sound |
| `announce(text)` | `app.js announce` | many |
| `onTempo()` | `audio.syncLoops()`; `dj.showSetup()` while ⌨️ Keys shows | `setTempo`, slider `change`, `play`, `switchNow` |
| `onHit(clipId, ms)` | `dj.flashClip` while ⌨️ Keys shows | every live hit |
| `onSteps(shown)` | `dj.steps` while ⌨️ Keys shows | the playhead moved |
| `onBeatChange()` | `dj.renderGrid()` while ⌨️ Keys shows; `song.render()` | keep, switch, open, mix, roll, grooves, name |
| `onPlay()` | `song.stop()` | `play`, `hearBeat` |
| `onStop()` | `dj.beatStopped()` (ends a recording) | every `stop()` that was playing |
| `onGroovesOpen()` | `app.js showCard` | 💃 Grooves opens |
| `onShape()` | **not passed** by `app.js` | every `render` |

Outside `deps`, the sequencer is read through `audio.grid = () => seq.grid()` (pads that loop in time, `audio.js loop` / `syncLoops`) and `sheet.js setBeatTempo(() => seq.beat()?.bpm)` (Echo's 🥁 On the beat).

### The sequencer's API, and who calls it

| Caller | Methods |
|---|---|
| `app.js` | `setPerson`, `show`, `stop`, `playing`, `render`, `beat`, `grid`, `clickOff`, `toggleLock`, `endLock` |
| `dj.js` (⌨️ Keys) | `play`, `stop`, `playing`, `beat`, `tempo`, `setTempo`, `setBars`, `setSignature`, `signature`, `advanced`, `grid`, `beatClock`, `metronome`, `clickAt`, `setClick`, `setGrow`, `rowFor`, `addRowFor`, `addSnaps`, `snapshot`, `restore`, `cyclePill`, `clearRow`, `dropRow`, `toggleRing`, `ringTool`, `levelOf`, `levelState`, `setLevel`, `putLevel`, `toggleMute`, `trying`, `putTrialAway`, `onScratch`, `lockChips`, `locked`, `lockChanged`, `addPicker`, `putRows`, `paintRows`, `saveBeat` |
| `song.js` | `stop`, `beatPlan`, `prepareBeats`, `soundHit`, `endMix` |
| `share-render.js` | `beatPlan`, `prepareBeats`, `soundHit` (the last two are the engine's, handed out by `seq`; `share-render.js` renders the public share preview and 🗂️ See all offline through them) |
| `listen-ui.js` | `hearBeat`, `stopHearing`, `openSaved` |
| nobody (grep of `web/` and `tests/`) | `keep`, `openLibrary`, `openMixer`, `toggleSolo`, `setFx`, `setMaster`, `setMasterFx`, `openRoll`, `rollRow`, `sampling`, `queuedBeat`, `thumbnail` |

### `createSong(deps)`, filled by `app.js makeSong`

| deps | Filled with |
|---|---|
| `engine` | the one beat engine; Song does not call it yet (it books through `seq.soundHit`) |
| `el`, `audio`, `meter`, `seq` | the Song elements; the shared audio and meter; the sequencer (`stop`, `beatPlan`, `prepareBeats`, `soundHit`, `endMix`) |
| `beats(personId)` | `state.savedBeats` of that person minus hidden beats, newest `saved` first |
| `load`, `save`, `close` | `state.songs` + IndexedDB `songs` (the open song) |
| `songs` | `app.js songBook {list, put, remove}` |
| `songName`, `soundLabel` | `names.js songName`; the song's name or a remix of it |
| `addClip` | `addMadeSound({emoji: '🎼', …})` |
| `beatColor(beat)` | its first row's sound's color |
| `announce`, `onHit` | as for the sequencer |

`song.js` returns `setPerson`, `render`, `play`, `stop`, `playing`, `song`, `openSaved`. `app.js` also re-renders the song when 🗂️ My beats closes (`#library` `close`).

## Seams

| Seam | What a fix in one place misses |
|---|---|
| **Four beat loops.** `sequencer.js schedule` (live), `song.js tick`, `beat-engine.js play` (🧸 Kids), and `hearBeat` (all at once). Kids' looks 0.2 s ahead; the others 0.1 s | Kids plays in the beat's own bars, with its accents, swing and a tune row's `rootShift` (`hitsDue`, `sound`); it leaves out rates, mute, solo and the 🎚️ Mixer's effects for good (row and Master volume are kept as a plain gain). A timing fix in `schedule` or `tick` does not reach the others until steps 6 and 8 |
| **`TICK_MS` and `LOOKAHEAD`** are separate constants in `beat-engine.js`, `sequencer.js` and `song.js` (`tests/architecture.test.mjs` checks all three agree) | change one, the beat and the song drift apart in feel; step 8 makes them one pair |
| **Output latency** is summed in `beat.js outputDelay` and again in `app.js`'s `deps.latency` for `dj.js` | a change to the cap (0.2 s) or the sum must be made twice; Kids ignores latency |
| **The beat id pattern** `/^beat-[a-z0-9-]{1,48}$/` is written in `beat.js BEAT_ID`, `playlist.js BEAT_REF`, `backup.js` (a local `BEAT_ID`) and inline in `rhythm.js` | only `playlist.js` vs `sequencer.js` is tested (`tests/playlist.test.mjs`) |
| **Listing a person's beats** happens three ways: `sequencer.js library()` (via `beatLibrary.list`, minus hidden), `makeSong`'s `deps.beats` (its own filter and sort), `kids.js`'s `deps.beats` | a new hidden kind of beat must be filtered in each |
| **Saving a beat record** has two writers in `app.js`: `beatLibrary.put` and Kids' `deps.saveBeat` (the same code) | a change to how beats persist (a stamp, a hook) must be made in both |
| **Scratch flows are written twice**: beats (`newScratch`, `keepAside`, `keep`, `nameScratch`, `uniqueName`) and songs (`newScratch`, `keep`, `nameScratch`, `uniqueSongName`) | a rule change (what counts as empty, the banner text, naming) must be made in both |
| **Beat-level fields are listed by hand** in `cleanPattern`, `samePattern`, `beatToFile` and `mixKey` | a new field cleaned but not added to `beatToFile` is lost in a beat file; `samePattern` already ignores `signature` |
| **Two `buildMix` functions**: `mixer.js buildMix` (the beat's graph) and `sheet.js buildMix` (➕ Mix with another sound) | same name, unrelated jobs |
| **The roll's `commit(i, tune, {quiet})`**: `roll.js` passes a third argument the sequencer ignores | a drag re-renders the whole Beats screen on every move |
| **Page turning**: `follow.js keepInView/pageTurn` for Beats, the roll and ⌨️ Keys; `song.js follow` has its own sum | a change to how far a page turns must be made twice |
| **Dead code kept in step**: `isUnsaved` and `samePattern` are used only by tests; `row.collapsed` is cleaned and stored but never read; `overflow.js fitMore` and the `more-tight` class are used by no screen or stylesheet | edits keep them working for nothing |

## Invariants and gotchas

| Rule | Why | Guard |
|---|---|---|
| New beat, row and song fields are **left out at their default** (`volume`, `solo`, `fx`, `tempos`, `signature`) | an older copy plays them as before (ADR 0011, 0018, 0031) | `tests/mixer.test.mjs`, `tests/row-volume.test.mjs`, `tests/tempo-marks.test.mjs` |
| A tune row always goes through `cleanRow` after an edit | its `steps` and `notes` must follow `tune` for older copies and previews | `tests/tune-rows.test.mjs` |
| `song.save` rewrites `slots` with `legacySlots` | older copies read only `slots` | `tests/playlist.test.mjs`, `tests/merge3.test.mjs` |
| Per-row arrays (`clocks`, `voices`, `shown`, `queue`, `pills`) follow every row insert, move and remove while playing | the playhead and hit cutting go to the wrong row | none found that moves rows while playing |
| `schedule` reads `stepSeconds` on every pill; `retime` moves `t0`, `clickNext`, clocks, `skips` and `queued` together | a tempo change mid-beat keeps hits and ⌨️ Keys snapping on their pills | `tests/beat-builder.test.mjs` (`retimeAt`) |
| A hit is lit only once heard (`stepsHeard` with `outputDelay`) | the playhead must match the sound a kid hears | `tests/keys-playhead.test.mjs` |
| `save()` after every change to `pattern` | the library is the truth; `show()` re-reads it and would undo an unsaved change | many app tests |
| The scratch's id is made from the person's id | two devices make the same record, and the cloud merges it | `tests/scratch.test.mjs` |
| `cleanPattern` sets `personId` from its argument | a beat moved between people must not keep the old owner | `tests/sequencer.test.mjs` (only for a missing `raw`) |
| Stopping the beat ends a ⌨️ Keys recording (`onStop`) | anything that calls `seq.stop()` (a screen change, a sync, 🆕 New) ends the take | `tests/beat-rec-stop.test.mjs` |
| `ready` is never emptied: `play` and `prepareBeats` load afresh over it (`refresh`). `play` then keeps only the open beat's sounds, unless a `prepareBeats` caller may still be booking (`preparing`) | a beat or song playing reads it while 🗂️ See all or a share renders another beat; a sound deleted or replaced (forgotten by `audio.forget` or `dropRendered`) must not stay decoded here all visit; any other sound `audio.js` keeps decoded anyway (`rendered`, `originals`), so letting go of it here saves nothing | `tests/beat-sounds-kept.test.mjs`; `tests/beat-ready.test.mjs` reads `ready` through `seq.held()`, reached by the tests' hook `globalThis.noodleTestSeq` (`app.js start`) |
| `song.js beatSteps` and `sequencer.js barOf` read a missing `signature` the same way (4/4) | a pass's length in a song must match its plan, or each pass leaves a gap | `tests/song.test.mjs`, `tests/song-unsigned.test.mjs` (a beat that came in through a backup) |
| Every way an old beat comes in stamps it (`old-beats.js`) | a missing signature is 4/4 now; an old 3/4 beat that came in unstamped would change what a kid hears | `tests/stamp-signatures.test.mjs` |
| A song plays every beat at the song's tempo | a beat's own `bpm` is ignored in a song | `tests/song.test.mjs` |
| Pills past `total()` stay stored | going back to more bars loses nothing | none found |
| The click goes straight to `audio.master` | it is never in a render or a preview | none |
| A `--js` look or a test that toggles Advanced re-renders the beat through `onSetting` | the stand-in page draws only when `deps.ready()` is true | — |

## To change X, touch …

| Change | Touch |
|---|---|
| A new field on a beat row | `beat.js cleanPlainRow` (left out at default), `samePattern`, `multiplyRows` and `slide.js slideRows` if it is per pill; `pill-select.js turnOff` if per pill; `kids-logic.js` (uses `cleanRow`); docs/guide.md. Beat files carry row fields as they are. Add a backup round-trip test (ADR 0011) |
| A new field on the beat | `cleanPattern`, `samePattern`, `beatToFile` (the list is by hand), `mixKey` if it changes the sound graph, `listen-make.js` if 🎧 should set it, `grooveBeat` if grooves have it; `backup.js` gets it through `cleanPattern` |
| A new 🎚️ effect | `mixer.js MIX_FX` (only `steps.js` kinds that run live); stored ids are checked by `cleanFx`; `tests/mixer.test.mjs` |
| A new time signature | `beat.js SIGNATURES`; `settings.js timeSignature` values; the `[data-sig]` buttons in `index.html` (Beats and ⌨️ Keys); `song.js beatSteps` follows by itself; check `listen.js` and grooves |
| Scheduler timing (lookahead, tick) | `sequencer.js` `TICK_MS`/`LOOKAHEAD`, `song.js` and `beat-engine.js` the same (Kids passes its `lookahead` 0.2 s), and `hearBeat` (books at once); how late a hit may be booked is `audio.js LATE_SECONDS`, shared by all three (`tests/late-hits.test.mjs`) |
| How a hit sounds everywhere | `beat-engine.js sound`, `hitGain`, `noteRate`, `rhythm.js ringOver`, `busFor`, `mixer.js buildMix`; `beat-engine.js play` for 🧸 Kids (the same `sound`, with `mixer: false`) |
| A new place that plays a saved beat | `seq.beatPlan` + `seq.prepareBeats` + `seq.soundHit`; stop the live beat first; call `deps.onPlay`-style stops so one thing plays |
| A new groove | `grooves.js GROOVES` (a kit id that exists in `boards.json`; bass rows of one instrument); `tests/grooves.test.mjs` |
| A new song or lane field | `playlist.js cleanLane`/`cleanBlock`, `song.js cleanSong`, `legacySlots` if older copies should see it, `listen-make.js` (builds songs), `cloud-sync.js` / `merge.js` `mapSongBeats` if it names beats; the snapshot in `song.js snapshot` if it should undo |
| A new callback from the beat maker | a `deps.onX?.()` call in `sequencer.js`, its line in `app.js makeSequencer`, and the deps comment above `createSequencer` |
| A new control on a beat row | `beat-row.js rowParts` (used by Beats and `dj.js`), `movable` so it can go in the menu, the click handler in `sequencer.js` and in `dj.js`, ❓ Help (`help.js`) |

## ✅ Checked by tests

The claims above marked as checked are tests in `tests/architecture.test.mjs`. When one fails, change this file and the test in the same commit as the code.
