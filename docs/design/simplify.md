# Deduplicate and simplify: a ranked survey

**Status:** proposal for Ben (2026-10-26). Nothing here is built. Ben asked: "where can we deduplicate in code or otherwise simplify refactor?"

**In short.** There are 23 places worth changing, in three groups. Eight are **safe now**: no behavior change, and tests already cover them (about 4½ hours). Fifteen **need care**: they touch a stored record, the cloud, the microphone, how a sound is made, or a big file split (about 16 hours). Eleven more are **not worth it**, with the reason for each. The first batch I recommend is five safe items, about 3¼ hours: one list of a person's stores, dead code out, exact copies made one, the beat maker's pure rules out of `sequencer.js`, and one writer for a person's saved lists. Together they remove about 250 lines, retire six lists kept in step by hand, and stop `backup.js`, `kids-logic.js` and the 🎧 listener from loading the 3,349-line beat maker.

The 🧸 Kids beat player is left out: a separate design covers it (row K below).

Every `file.js name` here was checked in the code on 2026-10-26. Sizes are lines removed or moved, counted from the code; estimates are an agent's minutes, tests and docs included. Bug fixes that the architecture mapping found are already in TODO.md ("Bugs found while mapping"); this survey does not repeat them.

**Council, per [council.md](../council.md).** "Two seats" means a refactor inside an agreed design: architect and test-qa. "Data seats" means architect, storage and sync, privacy and safety, security, and parent, on the plan and on the finished change. "All seats" means a change a kid would notice.

---

## The ranking

Ranked by value for cost within each group.

| # | Item | Removes or moves | Files | Council | Min |
|---|---|---|---|---|---|
| **Safe now** | | | | | |
| S1 | One list of a person's stores | 4 hand lists | 6 | storage and sync, architect | 20 |
| S2 | Dead code out | ~140 lines (80 app, 60 tests) | 12 | two seats | 30 |
| S3 | Exact copies made one | ~70 lines, 9 copies | 14 | two seats | 40 |
| S4 | One semitone rate, one latency sum | 9 sums to 2 | 7 | two seats | 20 |
| S5 | The beat maker's pure rules and the WAV encoder out of `sequencer.js` | 590 lines moved | ~32 | two seats | 75 |
| S6 | One writer for a person's saved lists | ~45 lines | 3 | storage and sync, architect | 30 |
| S7 | 🎼 Song's record rules into `playlist.js` | ~100 lines moved | 6 | two seats | 30 |
| S8 | Test and tool tidy | ~40 lines | 10 | developer experience, docs | 25 |
| **Needs care** | | | | | |
| C1 | One table of the stores in `state.js` | ~70 lines | 6 | data seats | 90 |
| C2 | One way to make an own sound | ~40 lines | 6 | data seats | 45 |
| C3 | One hold-or-drag press | ~50 lines | 4 | kids-ux, test-qa | 45 |
| C4 | One microphone recorder | ~50 lines | 4 | audio, browser, test-qa | 60 |
| C5 | Voice recipes written twice | ~30 lines | 3 | sound designer, audio engineer | 30 |
| C6 | The kept audio built once | ~12 lines | 2 | audio engineer, test-qa | 30 |
| C7 | One name length, counted one way | ~20 literals, 5 constants | 12 | data seats | 45 |
| C8 | The Worker reads kit ids from `boards.json` | a 150-id list | 3 | data seats, reliability | 30 |
| C9 | One module for the cloud's codes and PIN hash | ~25 lines | 5 | data seats | 45 |
| C10 | One reading of the User-Agent | ~20 lines | 3 | data seats | 30 |
| C11 | Stop storing `row.collapsed` | 1 field | 3 | data seats | 15 |
| C12 | One "quiet moment" check | ~10 lines | 3 | child psychologist, kids-ux | 30 |
| C13 | Split `sheet.js` | ~700 lines moved | 6 | architect, test-qa | 150 |
| C14 | Split `dj.js`: Live takes | ~265 lines moved | 5 | architect, test-qa | 90 |
| C15 | Split `sequencer.js`'s factory | ~880 lines moved | 6 | architect, test-qa | 210 |
| **Elsewhere** | | | | | |
| K | 🧸 Kids' beat player, 🎼 Song's clock, `hearBeat` | see `docs/design/one-beat-engine.md` | | | — |
| **Not worth it** | N1 to N11, below | | | | |

Totals: safe now 270 min, needs care 945 min, so about 20 hours for all 23.

**Recommended first batch** (195 min, one commit each, in this order): S1, S2, S3, S5, S6. See the end.

---

## Safe now

No behavior change. The tests named under "Guards" already cover the code; each item adds the test that proves it.

### S1. One list of a person's stores · 20 min

| | |
|---|---|
| Today | The stores that sync are written out four times: `cloud-sync.js CLOUD_KINDS`, `merge3.js STAMPED`, `worker/cloud.js KINDS`, and `reid.js PERSON_STORES` (the same list with `people` first). `merge.js` keeps a fifth, `STORES`, which is `store.js STORE_NAMES` without `cloud` and `bases`. `tests/cloud-sync.test.mjs KEYS` copies every key path from `store.js SCHEMA`. |
| Shape | `reid.js` (imports nothing; the Worker already imports it) exports `SYNCED = PERSON_STORES.filter((s) => s !== 'people')`. `CLOUD_KINDS`, `STAMPED` and the Worker's `KINDS` are made from it. `merge.js STORES` and the test's `KEYS` are made from `SCHEMA`. The orders are equal today, so nothing the cloud sees changes. |
| Size | 4 hand lists and 1 test list gone; 6 files (`reid.js`, `cloud-sync.js`, `merge3.js`, `merge.js`, `worker/cloud.js`, the test). |
| Risk | Cloud code changes shape, not values: the lists come out equal, item for item. No stored format, backup or kid-visible change. |
| Guards | Today: `tests/architecture.test.mjs` "the record kinds that sync are one list, kept three times in one order", `tests/cloud-sync.test.mjs`, `tests/worker-cloud.test.mjs`, `tests/merge.test.mjs`. Proof: the architecture test checks that no file but `reid.js` writes the list out (a regex for `'clips', 'overrides'`). |

### S2. Dead code out · 30 min

| | |
|---|---|
| Today | Code no screen calls, kept working by edits for nothing: `sequencer.js isUnsaved` (tests only); `overflow.js fitMore`, the `.more-tight` rules in `styles.css` and the `more-tight` check in `track-page.js` (no screen calls `fitMore`); `rhythm.js hitTime` (a fourth copy of the latency sum, S4), `applySnaps`, `countInBeats`; `kids-logic.js squareSeconds`; `touch-grid.js emptyBlock`, `swapBlocks`; four names `dj.js` returns that `app.js` never calls (`deck`, `touchNow`, `letGo`, `stopReplay`: they stay inside `dj.js`); `el.tryingStop`, which `app.js` passes to `createDJ` and `dj.js` never reads (it finds the button with `el.trying.querySelector('button')`); `state.beats`, written by `app.js setScreen` and read by nothing. |
| Shape | Delete them and the tests that test only them. `sequencer.js samePattern` is used only by tests (five files): it moves to `tests/helpers.mjs`, which takes one of the four hand-kept lists of beat fields (beats-song.md) out of `web/`. `rhythm.js snapHits` stays: it is the tests' way to drive the live `createSnapper`. |
| Size | About 80 lines in `web/`, 60 in tests; 12 files. |
| Risk | None a kid sees. `tools/look.mjs` and `look-cloud.mjs` call none of them (checked). `track-page.js`'s `more-tight` check never fires today, so usage events are unchanged. |
| Guards | `just test`, `tests/overflow.test.mjs`, `tests/rhythm.test.mjs`, `tests/touch-grid.test.mjs`, `tests/track-page.test.mjs`. Proof: a deletion has no failing test of its own; `just test` green and `just look --wide` with no new console error show nothing used it. |

### S3. Exact copies made one · 40 min

Each is a copy of code that already exists, so each becomes an import. One commit.

| Copy | Becomes |
|---|---|
| `cloud-sync.js canonical` is `merge3.js canon` line for line, each with its own `NOT_CONTENT` | `merge3.js` exports `canon` (`cloud-sync.js` already imports `merge3.js`) |
| A name with a number added: `sequencer.js uniqueName`, `song.js uniqueSongName`, `listen-make.js uniqueName` (same rule, three copies) | `names.js numbered(name, taken, max = MAX_LABEL)` |
| `old-backup.js extensionFor` copies `util.js extensionFor` (its comment says so) | `util.js extensionFor` takes `String(mime)` and is imported |
| `listen-make.js ROWS` equals `listen-dsp.js ROWS` (a test checks it) | `listen-make.js` imports it |
| `voice-knobs.js FAMILIES` is `voices.js SURPRISE`'s voice ids in the same order | `voices.js` exports the families; `voice-knobs.js` (which already imports `voices.js`) uses them |
| `backup-ui.js savePersonBackup` builds its own slug; `util.js slug` is the same with another fallback | `slug(text, fallback = 'sound')` |
| `worker/clean.js` writes `'https://noodlepads.com'` where `worker/http.js ORIGIN` exists | import `ORIGIN` |
| `backup.js` imports `util.js` twice | one import |
| The lookups for playing saved things: `app.js` builds `beatById`, `songById`, `clipById` for `initThings` and again for `initCloud`'s `renderShare` | one `savedLookups(personId)` in `app.js`; share previews also find an open song (unreachable today, by reading the code) |

| | |
|---|---|
| Size | About 70 lines; 14 files. |
| Risk | None: each pair is the same code. `canon` must give the same text, or every record looks changed to the sync: the test below pins it. |
| Guards | `tests/cloud-sync.test.mjs`, `tests/merge3.test.mjs`, `tests/song.test.mjs`, `tests/listen.test.mjs`, `tests/backup.test.mjs`, `tests/architecture.test.mjs` (ROWS). Proof: a test that `hashOf` of a fixed record is the same string before and after; `tests/names.test.mjs` cases for `numbered` at 23, 24 and 30 characters. |

### S4. One semitone rate, one latency sum · 20 min

| | |
|---|---|
| Today | `2 ** (n / 12)` is written in `instruments.js rateOf`, `sequencer.js noteRate`, `kids-logic.js keyRate`, `tweaks.js` and `voices.js STEP_RENDERS` (`pitch.js`'s note-to-Hz sum is a different sum). The output latency is summed in `sequencer.js outputDelay`, in `app.js` for `createDJ`'s `latency`, in `app.js startUsage` (uncapped, in ms, for usage events), and in `rhythm.js hitTime` (dead, S2). |
| Shape | `noteRate` is `rateOf` re-exported; the others import `rateOf` (`instruments.js` imports nothing, so the pure modules stay pure). `outputDelay` moves to `audio.js` beside the context; `app.js` passes it to `createDJ`; usage events keep the uncapped figure through `outputDelay(ctx, { cap: Infinity })`. |
| Size | 5 semitone sums to 1, 4 latency sums to 1; 7 files. |
| Risk | None: same numbers. |
| Guards | `tests/architecture.test.mjs` "the semitone rate agrees", `tests/keys-playhead.test.mjs`, `tests/instruments.test.mjs`. Proof: the architecture test checks that a power of 2 over 12 is written in `instruments.js` and `pitch.js` only, and `outputLatency` is read in `audio.js` only (with `log-send.js`'s report of `baseLatency`). |

### S5. The beat maker's pure rules and the WAV encoder out of `sequencer.js` · 75 min

| | |
|---|---|
| Today | `sequencer.js` is 3,349 lines: 550 lines of pure rules (`cleanPattern`, `cleanRow`, `planHits`, `SIGNATURES`, `barSteps`, `beatToFile`, `beatFromFile`, `mergeGroove`, `tempoStops`, `BEAT_ID`, `noteRate`…), then `createSequencer`. Ten modules import only the pure part or the WAV code, so they load the whole screen and its imports: `backup.js` (the gate for what comes in), `kids-logic.js` (pure rules), `listen.js` and `listen-make.js` (the "pure" listener, a seam in sound.md), `dj.js`, `kids.js`, `song.js`, `share-render.js`, `sheet.js`, `chop.js`. `encodeWav` and `normalize` live there too, so a sound module depends on the beat maker for its WAV (sound.md). The beat id pattern is written four times: `sequencer.js BEAT_ID`, `playlist.js BEAT_REF`, a local `BEAT_ID` in `backup.js`, and inline in `rhythm.js`. |
| Shape | `web/beat.js`: the pure rules, as they are, plus the one `BEAT_ID` (`playlist.js`, `backup.js` and `rhythm.js` import it). `web/wav.js`: `encodeWav` and `normalize` (using `loudness.js peakOf`). `sequencer.js pillHolds` and its `HOLD_MS` are a press helper (Beats' rows and the keys' grid), so they go to `finger.js` instead. Callers import from these. `sequencer.js` keeps only `createSequencer`. |
| Size | About 590 lines moved; `sequencer.js` to about 2,750. Files: the 10 importers, `sequencer.js`, `playlist.js`, `rhythm.js`, about 18 test files (an import line each), `sw.js SHELL`, `docs/layout.md`, `docs/architecture/` (sound.md, beats-song.md, keys-kids.md). |
| Risk | A missed import fails at module load, which every app test catches. Two new files must go in `sw.js SHELL` (`tests/offline.test.mjs` names them). No stored format, cloud or kid-visible change. |
| Guards | `tests/sequencer.test.mjs`, `row-tempo`, `grooves`, `mixer`, `row-volume`, `tune-rows`, `beat-edit`, `kids.test.mjs`, `tests/offline.test.mjs`, `tests/architecture.test.mjs` ("Kids takes only STEPS and noteRate from the beat maker", "the WAV encoder"). Proof: two architecture checks, "`beat.js` and `wav.js` have no DOM, storage or audio" and "`backup.js`, `kids-logic.js`, `listen.js` and `listen-make.js` do not import `sequencer.js`". |

### S6. One writer for a person's saved lists · 30 min

| | |
|---|---|
| Today | `app.js` writes five list stores with the same code: `beatLibrary` and `songBook` (list, put, remove), Kids' `saveBeat` (a copy of `beatLibrary.put`), and `createDJ`'s `saveTake`/`deleteTake`, `saveLayout`/`deleteLayout`, `saveTouchLayout`/`deleteTouchLayout`. Each replaces the record in `state` and calls `persist` or `db.remove`. A failed delete shows a notice for beats and songs, and only a console line for takes and layouts (shell.md, keys-kids.md). |
| Shape | `state.js shelf(field, store, { what, notice })` returns `{ list(personId), put(record), remove(id) }`. The five use it; Kids' `saveBeat` is `beatLibrary.put`. Each keeps its failure handling as today (`notice` on or off), so nothing changes on screen; making the notices equal is a separate one-line call for Ben. |
| Size | About 45 lines out of `app.js`; 3 files. |
| Risk | The beat and song writes clone the record (`structuredClone`) and the others don't; the shelf keeps that per store. No stored format change. |
| Guards | `tests/app.test.mjs`, `tests/kids.test.mjs`, `tests/dj-grooves.test.mjs`, `tests/touch-edit.test.mjs`, `tests/fake-idb.mjs failCommit`. Proof: a test in `tests/state.test.mjs` (new) that `put` then `remove` leaves `state` and the store equal for each of the five, and that a failed commit keeps the record in memory. |

### S7. 🎼 Song's record rules into `playlist.js` · 30 min

| | |
|---|---|
| Today | `backup.js` imports `cleanSong` and `SONG_ID`, and `share-render.js` imports `cleanSong`, `planSong`, `soundSong`, from `song.js`, the 1,310-line screen. Its pure part is about 100 lines at the top (`beatSteps`, `cleanSong`, `linkSong`, `uniqueSongName`, `planSong`, `soundSong`). `playlist.js` is already Song's pure module. |
| Shape | Those move to `playlist.js` (`uniqueSongName` goes to `names.js numbered`, S3). After S5 and S7, the backup gate loads neither screen. |
| Size | About 100 lines moved; 6 files and 3 tests. |
| Risk | None a kid sees. Best done before the one beat engine (row K) reshapes `song.js`, or folded into it. |
| Guards | `tests/song.test.mjs`, `tests/playlist.test.mjs`, `tests/backup.test.mjs`. Proof: an architecture check that `backup.js` and `share-render.js` import neither `song.js` nor `sequencer.js`. |

### S8. Test and tool tidy · 25 min

| | |
|---|---|
| Today | Test helpers copied between files: `typePin` (6 files), `on(...steps)` (7), `makeBeat` (2), `sheetOf` (3). `tools/make_samples.py write_wav` copies `tools/make_placeholders.py write_wav` (only the fade differs; `make_samples.py` already imports from it). `.github/workflows/test.yml` and `deploy.yml` both pin Node 26.11.1 (tests-tools.md). `web/privacy.js` is in `sw.js SHELL` though the page never loads it (only README and `tests/privacy.test.mjs` read it). |
| Shape | The helpers go in `tests/helpers.mjs`. `write_wav(path, samples, faded=True)` in one place. A `.node-version` file read by both workflows (`node-version-file`). `privacy.js` moves to `NOT_LOADED` in `tests/offline.test.mjs`, with why. Also fix cloud.md's "privacy policy link" seam: `tests/privacy.test.mjs` already checks the link in About against `PRIVACY_URL`. |
| Size | About 40 lines; 10 files. |
| Risk | The clips must stay byte for byte (`tools/test_make_placeholders.py` checks). |
| Guards | `just test`, the tool tests. Proof: `tools/test_make_samples.py` byte check on one clip. |

---

## Needs care

Each touches something a test here cannot fully check (a stored record, the cloud, the microphone, how a sound sounds, real touch), or is a big move. Each still ships with a failing-first test where one can be written; what can't be tested here is said.

### C1. One table of the stores in `state.js` · 90 min

| | |
|---|---|
| Today | The stores are written out by hand in about ten places (data.md seam 1). Four of them are in memory code: `state.js readStorage` (a positional destructuring: a new store must sit in the same place as in `SCHEMA`), `state.js deletePerson` (14 hand lines that delete, 14 that forget), and four `storedLists` builders: `state.js storedLists`, `people.js storedLists`, `backup-ui.js storedLists`, `cloud.js storedLists`, which differ only in whether they carry `settings` and how they map `prefs`. |
| Shape | One table in `state.js`: store name → `state` field and shape (a list, a map by id, a map by person). `readStorage`, `storedLists({ settings, prefs })` and `deletePerson` are loops over it. The other three builders call `storedLists`. |
| Size | About 70 lines; 6 files. |
| Risk | `deletePerson` is the delete path: a store it misses outlives its person, and `adoptStoredPeople` brings them back. No stored format change, but it is what deleting a kid's things does: data seats, privacy and parent included. |
| Guards | `tests/architecture.test.mjs` (the stores), `tests/backup.test.mjs`, `tests/cloud-sync.test.mjs`, `tests/delete-*.test.mjs`, `tests/startup-remembered.test.mjs`. Proof: a test that loops over `STORE_NAMES` and finds no record of a deleted person in any store, and one that every builder's keys equal `STORE_NAMES` without `cloud` and `bases`. |

### C2. One way to make an own sound · 45 min

| | |
|---|---|
| Today | An own sound's record is built by hand in five places (data.md seam 6): `sheet.js saveSheet`, `sheet.js makeMix`, `chop.js makePads`, `app.js addMadeSound`, and `kids.js keep` (saved through `initKids`' `saveClip`). Each sets `id`, `personId`, `voice: 'normal'`, `mime`, `created` its own way, then pushes and persists. A new required field must be added to all five and to `backup.js cleanBackup`. |
| Shape | `model.js newClip(fields)` (pure: the defaults in one place) and `board.js addClip(clip)` (push, `persist`, redraw). The five call them; each keeps its own extras (`from`, `exact`, `synth`, the chop's `created` offset). |
| Size | About 40 lines; 6 files. |
| Risk | The `clips` record is a stored format: it must come out key for key the same. Data seats on the plan. |
| Guards | `tests/sound-sheet.test.mjs`, `tests/chop.test.mjs`, `tests/kids.test.mjs`, `tests/app.test.mjs`, `tests/architecture.test.mjs` ("own sounds added to memory" names the files that push). Proof: a test that makes one sound by each of the five paths and compares each record's keys with what `cleanBackup` keeps. |

### C3. One hold-or-drag press · 45 min

| | |
|---|---|
| Today | The same press handling (a mouse drags after `DRAG_PX`; a finger held `HOLD_MS` drags; a finger moving past `SLOP_PX` first is a scroll; up, cancel, `touchmove` and `contextmenu` handlers) is written three times: `dj-keys.js` once and `dj-touch.js` twice (bands and the grid's carry), with the same three constants defined in both files. `pads.js` has its own (`DRAG_SLOP`, `TOUCH_HOLD_MS`). |
| Shape | `finger.js holdToDrag(box, { match, start, move, end, holdMs, dragPx, slopPx })`, beside `fingerTaps`. Each caller keeps its own numbers, so the feel is unchanged. |
| Size | About 50 lines; 4 files. |
| Risk | How a drag feels in ✏️ Layout and Edit sounds. The stand-in page fires pointer events but has no real finger; not yet tried on a phone after the change. |
| Guards | `tests/touch-edit.test.mjs`, `tests/touch-grid-edit.test.mjs`, `tests/app.test.mjs` drags, `tests/finger.test.mjs`. Proof: `finger.test.mjs` cases for a mouse drag, a held finger, a finger that scrolls and a cancel; a `just look --js-file` drag on ✏️ Layout at 375 px. |

### C4. One microphone recorder · 60 min

| | |
|---|---|
| Today | `sheet.js` and `kids.js` each write `canRecord`, the MIME list (`audio/webm;codecs=opus`, `audio/mp4`, …), `new MediaRecorder` with its fallback, the chunks, `onstop` with a discard flag, the analyser for the meter, and the 10 s cap. The constants are copied too: `sheet.js MAX_RECORD_SECONDS` and `kids-logic.js MAX_RECORD_SECONDS` (both 10), `sheet.js COUNT_IN` and `kids-logic.js KIDS_COUNT` (both 3 at 700 ms). |
| Shape | `web/mic.js`: `canRecord()`, `startRecorder(stream, { onBlob })` returning `{ stop({ discard }) }`, `meterFor(stream)`, and the cap and count. Each screen keeps its own buttons, words and count-in. |
| Size | About 50 lines; 4 files, plus `sw.js SHELL`. |
| Risk | Recording on iOS Safari and Firefox for Android: the microphone cannot be tested here, so this stays "not yet tried on a phone" in state.md. No behavior change intended. |
| Guards | `tests/recording.test.mjs`, `tests/kids.test.mjs` (a fake `MediaRecorder`), `tests/sound-sheet.test.mjs`, `tests/architecture.test.mjs` ("two recorders" becomes one). Proof: `tests/mic.test.mjs` with a fake `MediaRecorder`: the MIME pick, discard, and the cap's stop. |

### C5. Voice recipes written twice · 30 min

| | |
|---|---|
| Today | In `voices.js`, `RECIPES.walkie` and `SPECIAL_RENDERS.walkie` share the static bursts and roger beep line for line; `RECIPES.monster` and `SPECIAL_RENDERS.boom` share the bass shelf and drive. `voices.js noiseBuffer` and `steps.js roomTail` are the same noise (sound.md). The fade's ramp loop is in `cuts.js applyFade` and `voices.js STEP_RENDERS.fade`. |
| Shape | One `walkieAround(ctx, buffer, chain)` and one `boomChain(ctx)` in `voices.js`; `steps.js` exports the noise with a channel count; `cuts.js` exports the ramp (`cuts.js` imports nothing, so it stays pure). |
| Size | About 30 lines; 3 files. |
| Risk | How old voiced sounds and knob sounds sound. The noise is random, so a byte compare is impossible; the stand-in `OfflineAudioContext` in `tests/helpers.mjs` can compare the node graph. |
| Guards | `tests/voices.test.mjs`, `tests/layers.test.mjs`, `tests/cuts.test.mjs`. Proof: a test that each recipe builds the same graph (node types, parameters, start times) before and after. Ears: Ben's, as he goes. |

### C6. The kept audio built once · 30 min

| | |
|---|---|
| Today | Edits → trim → fade → `levelForGain` is done in `audio.js keptAudio`, `chop.js rebuild` and `chop.js evenOut` (sound.md). A change to the order in one leaves the trim editor drawing and playing something else. |
| Shape | `audio.js keptParts(full, { range, edits, fade })` returns the edited, kept and levelled buffers; the three use it. |
| Size | About 12 lines; 2 files. |
| Risk | What ✂️ Trim plays against what the pad plays. |
| Guards | `tests/chop.test.mjs`, `tests/wave-edits.test.mjs`, `tests/loudness.test.mjs`. Proof: a test that the pad's buffer and the trim editor's kept buffer are equal sample for sample, for a sound with edits, a gain and a fade. |

### C7. One name length, counted one way · 45 min

| | |
|---|---|
| Today | "A name is at most 24" is written about 20 times: five constants (`names.js MAX_LABEL`, `groups.js MAX_GROUP_NAME`, `keyset.js MAX_LAYOUT_NAME`, `touch.js MAX_TOUCH_NAME`, `voice-knobs.js MY_VOICE_NAME`) and literal `24`s in `sequencer.js`, `song.js`, `dj.js`, `sheet.js`, `backup.js title`, `rhythm.js` and `cloud-sync.js`. Two ways of counting: most use `slice(0, 24)` (UTF-16 units), `keyset.js layoutName` and `touch.js touchName` count characters. A name with an emoji at the 24th unit is likely cut in half (not checked in a browser). |
| Shape | `names.js MAX_NAME` and `cutName(text)`, by characters; every cleaner and field uses them. |
| Size | About 20 literals and 4 constants; 12 files. |
| Risk | What is stored, and what the backup gate and the cloud accept: a name the app makes must pass `backup.js cleanBackup`. Data seats. |
| Guards | `tests/backup.test.mjs` caps, `tests/names.test.mjs`. Proof: a 24-emoji name survives save, backup and load unchanged, and no cleaner ever leaves half an emoji. |

### C8. The Worker reads kit ids from `boards.json` · 30 min

| | |
|---|---|
| Today | `worker/clean.js KIT_IDS` lists about 150 kit ids by hand; a test keeps it equal to `boards.json`, so every new preset means editing it. |
| Shape | `import boards from '../web/boards.json' with { type: 'json' }` in `worker/clean.js`. Wrangler bundles JSON; Node reads it with the same attribute. |
| Size | A 150-id list; 3 files. |
| Risk | The deploy: the Worker grows by `boards.json` (66 KB). Check the bundle size and the live checks after the deploy. Data seats and reliability. |
| Guards | `tests/worker-clean.test.mjs`, the deploy's `just deploy-checks`. Proof: the existing equality test becomes "the Worker's ids are the kit's", and `cloud-smoke` sends a report with a kit id. |

### C9. One module for the cloud's codes and PIN hash · 45 min

| | |
|---|---|
| Today | `web/cloud.js pinHash`/`PIN_ROUNDS` and `worker/pin.js hashSecret`/`ROUNDS` are the same PBKDF2; `hex` is in `web/cloud.js` and `worker/http.js`; `CODE_CHARS` is in `log-send.js` and `worker/pin.js`; share codes are checked by `web/cloud.js plainCode` with `/^[A-Z2-9]{8}$/` (lets I and O through) and by `worker/pin.js plainCode` with `isShareCode` (cloud.md). |
| Shape | `web/codes.js` (pure): `CODE_CHARS`, `plainCode`, `isShareCode`, `hex`, `hashSecret`. Both sides import it; the Worker's list of `web/` imports grows by one. |
| Size | About 25 lines; 5 files. |
| Risk | Security code, and a grown-up who types I or O in a share code now gets the device's message before asking the cloud. Same rounds and algorithm, so stored PIN hashes still check. Data seats, security first. |
| Guards | `tests/architecture.test.mjs` ("only web/cloud.js and worker/pin.js run PBKDF2", "what the Worker imports from web/"), `tests/worker-cloud.test.mjs`, `tests/cloud-ui.test.mjs`. Proof: a test that the device and the Worker accept exactly the same codes over the whole alphabet, and that a PIN hashed on one side checks on the other. |

### C10. One reading of the User-Agent · 30 min

| | |
|---|---|
| Today | `agent.js parseAgent` (problem reports, metrics) and `track-page.js browserOf` with `track-page.js environment`'s own `os` (usage events) check in a different order and case, and only `browserOf` knows Opera Touch (`OPT/`); the iPad test differs too (cloud.md). |
| Shape | `browserOf` and `environment` use `parseAgent`, lower-cased for the events; `parseAgent` learns `OPT/`. |
| Size | About 20 lines; 3 files. |
| Risk | Some usage-event values shift (Chromium is `chrome` in the events, as in reports). This is what leaves the device: data seats. |
| Guards | `tests/agent.test.mjs`, `tests/track-page.test.mjs`. Proof: a table of real User-Agent strings giving the same families in both. |

### C11. Stop storing `row.collapsed` · 15 min

| | |
|---|---|
| Today | `sequencer.js cleanPlainRow` cleans and stores `collapsed` on every row, and nothing reads it (beats-song.md). Three tests in `tests/app.test.mjs` filter out `.collapsed` rows that never exist. |
| Shape | `cleanRow` stops writing it. Old rows keep it until they save again. |
| Size | 1 field; 3 files. |
| Risk | A stored record shape: a beat saved after the change lacks the field, so its cloud hash changes on that save (as any edit does). Older copies of the app read a missing field as `false`. Data seats. |
| Guards | `tests/row-tempo.test.mjs`, `tests/backup.test.mjs`. Proof: an old row with `collapsed: true` cleans without it and plays the same. |

### C12. One "quiet moment" check · 30 min

| | |
|---|---|
| Today | `app.js` passes `busy` (recording, a dialog, the beat, the song…) to `initUpdate`; `nudge.js quiet` checks only dialogs and the update bar, each on its own 2 s poll (shell.md). |
| Shape | One `quiet()` in `app.js`, handed to both. |
| Size | About 10 lines; 3 files. |
| Risk | 🎛️ Want more knobs? would wait while a beat plays or a kid records: a kid notices when it shows. Child psychologist and kids-ux. |
| Guards | `tests/nudge.test.mjs`, `tests/update.test.mjs`. Proof: the nudge waits while the beat plays. |

### C13. Split `sheet.js` · 150 min

| | |
|---|---|
| Today | 1,994 lines with clear parts: voices as knob settings (~500 lines, `voiceFor` to `renderLayerRows`), 🎵 Find its note and Tune (~60), ➕ Mix (~100), ✨ Make one (~110), Layers (~300), recording (~160), save and delete (~100). All share module-level `sheet`, `el` and `recording`. |
| Shape | `sheet-voices.js` (voices and ⭐ My voices) and `sheet-make.js` (➕ Mix and ✨ Make one), each taking the shared sheet from a small `sheet-state.js`; recording goes to `mic.js` (C4). `sheet.js` keeps opening, the wave, Layers, save. |
| Size | About 700 lines moved; `sheet.js` to about 1,250; 6 files, `sw.js SHELL`, layout.md, sound.md. |
| Risk | Module-level state shared across files, and an import cycle to avoid (`sheet.js` ↔ `sheet-voices.js`). No behavior change. Do C4 first. |
| Guards | `tests/sound-sheet.test.mjs` (1,202 lines), `tests/layers.test.mjs`, `tests/voice-knobs.test.mjs`, `just look sheet-edit`, `sheet-own`, `wave-own`. Proof: an architecture check that `sheet-voices.js` and `sheet-make.js` import nothing from `sheet.js`. |

### C14. Split `dj.js`: Live takes · 90 min

| | |
|---|---|
| Today | 1,636 lines. Live's takes (recording whatever is played, replay, rename, delete, make into a sound: ~265 lines from "Live: record whatever is played") sit inside `createDJ` beside the keys and Beats with ⌨️ Keys. |
| Shape | `dj-takes.js createTakes(ctx)`, called by `createDJ` with what it needs. |
| Size | About 265 lines moved; 5 files. |
| Risk | Closures over `createDJ`'s state; replay is on the audio clock since the council round's fix (2026-10-26, `audio.book`), so move it as is. |
| Guards | `tests/app.test.mjs` Live, `tests/rhythm.test.mjs` (`planTake`), `just look live`. Proof: an architecture check that only `dj.js` calls `createTakes`. |

### C15. Split `sequencer.js`'s factory · 210 min

| | |
|---|---|
| Today | After S5, `createSequencer` is still about 2,750 lines: the sound chooser (~340, from "What the chooser is choosing for"), 💃 Grooves (~290, from "Starter grooves"), 🗂️ My beats (~250, from `renderLibrary`), recording into the beat (~180), plus playback, drawing and events. |
| Shape | `beat-chooser.js`, `beat-grooves.js` and `beat-library.js`, each a `create…(ctx)` the factory calls with `pattern`, `openBeat`, `save` and `render`. |
| Size | About 880 lines moved; 6 files. |
| Risk | Heavy coupling: the parts share many closures. Do it after the one beat engine (row K), which reshapes playback in the same file. |
| Guards | `tests/grooves.test.mjs`, `tests/beat-chips.test.mjs`, `tests/dj-grooves.test.mjs`, `tests/app.test.mjs`, `just look beats --wide`. Proof: an architecture check that each part is created only by `sequencer.js`. |

---

## Elsewhere

| | Item | Where |
|---|---|---|
| K | 🧸 Kids' second beat player (`kids.js playBeat`), and with it 🎼 Song's own clock (`song.js tick`, its own `TICK_MS` and `LOOKAHEAD`) and `hearBeat` | `docs/design/one-beat-engine.md` (Ben, 2026-10-26: "one beat engine… optional hooks for the kids' side"). Kids' own snap rule (`kids-logic.js pillAt`) and key letters (`kids.js kidsKeydown`) change what a kid feels, so they wait for that design too. |

---

## Not worth it

| # | Item | Why not |
|---|---|---|
| N1 | Merge `dj-keys.js` and `dj-touch.js` | Different models: 40 keys against bands in a grid. C3 takes the real copy (the press); their save lines, renames and Undo differ in the details. |
| N2 | One `keepAsMine` (`keyset.js keepAsMine`, `touch.js keepAsMine`) | One line each, over different shapes; a shared one would take two functions to say less. |
| N3 | One `clamp` (five) and one peak loop (ten) | The pure modules import nothing on purpose (`tests/architecture.test.mjs`); a one-line loop costs less than breaking that. `wav.js normalize` (S5) does use `loudness.js peakOf`. |
| N4 | Fold the inline IndexedDB stand-ins into `tests/fake-idb.mjs` | They drive an open request by hand (blocked, a version change, a failing open), which `fake-idb.mjs` doesn't model; merging adds hooks for three tests. |
| N5 | The copies in `events-client.js` and `worker/events-worker.js` (`readCapped`, `randomId`, `bytes`) | Vendored from flarepress, never edited here. |
| N6 | `tests/voice-knobs.test.mjs`'s copy of ADR 0012's `tweakSteps` | A frozen reference on purpose: stored voices must keep sounding as they shipped. |
| N7 | Make `sw.js SHELL` or `sw.js KIT` from a list at run time | No build step; `tests/offline.test.mjs` names any missing file. Reading `boards.json` at install would make the offline copy depend on it. |
| N8 | Rename the clashing names (`KINDS`, `FAMILIES`, `levelOf`, `buildMix`) | Churn across about 15 files and their tests; a wrong import fails a test today. `sheet.js buildMix` is private, so its clash is harmless. |
| N9 | Split `app.js` (1,125 lines) | It is the composition root; shell.md maps its blocks. S6, C1 and C2 already move its store code to `state.js`. |
| N10 | One scratch flow for beats and songs (`newScratch`, `keep`, `nameScratch` in `sequencer.js` and `song.js`) | After S3 only the words differ ("My beats", "add a sound" against "My songs", "add a beat"); a shared one needs a word table for about 30 lines. Revisit after row K. |
| N11 | Merge the two justfile guards (`tests/justfile.test.mjs`, `tools/test_justfile.py`) | They check different files (the docs name every recipe; README lists exactly the recipes); merging saves a file, not a list to keep. |

---

## Recommended first batch

Five safe items, one commit each, about 195 minutes, in this order (each makes the next smaller):

1. **S1. One list of a person's stores** (20 min): four hand lists gone; the cloud sends the same.
2. **S2. Dead code out** (30 min): about 140 lines gone, and one of the four hand lists of beat fields leaves `web/`.
3. **S3. Exact copies made one** (40 min): nine copies, each an import.
4. **S5. The beat maker's pure rules and the WAV encoder out of `sequencer.js`** (75 min): the backup gate, Kids' rules and the 🎧 listener stop loading the beat maker; the beat id pattern is written once.
5. **S6. One writer for a person's saved lists** (30 min): five copies of the store-writer pattern become one.

Council: architect and test-qa on each finished change; storage and sync too on S1 and S6. None changes what a kid sees, a stored format or what the cloud receives.

Next step for Ben: say which items to build (the first batch, all of "safe now", or a list), and whether C1 to C15 should wait for the one beat engine.
