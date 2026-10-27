# The backup format (1.2)

**Answer first.** A backup is one zip: `backup.json` plus the audio of every sound a person made. This page says what each field means, so a player with no JavaScript (v2, the Android app, [ADR 0001](adr/0001-web-prototype-then-native.md)) can read it. The code that writes and checks it is `web/backup.js`; the rules for loading one are [ADR 0011](adr/0011-backups-1-0-merge.md). Golden samples of 1.0, 1.1 and 1.2 are in `tests/fixtures/`.

## The file

| Entry | What it is |
|---|---|
| `backup.json` | UTF-8 JSON, at most 8 MB. Everything below. |
| `sounds/<id>.<ext>` | A sound as it was recorded or chosen (`webm`, `ogg`, `m4a`, `mp3`, `wav`; `audio` when unknown). Named by the clip's `file`. |
| `sounds/<id>.heard.wav` | **1.2.** The same sound as it plays: its voice, knobs, trim, edits and fade already applied. 16-bit PCM WAV, mono or stereo, at the sample rate the device plays at. Named by the clip's `heard`. |

The zip stores its entries uncompressed; deflated entries are read too. No ZIP64, no encryption. A backup unpacks to at most 300 MB and 5000 files; one sound is at most 80 MB.

## Versions

`app` is `"noodlepads"` (or `"noodle-pads"` before the 1.0 rename; read the same). `format` is `"1.<minor>"`. A reader takes any `1.x`: skip fields it does not know, and treat a field a backup lacks as its default. A minor version only adds fields and files; it never changes or removes one. A different major version is refused. A backup written before 1.0 (`format` is the number `1`, or `app` ends in `-soundboard`) is refused, and is not covered here.

| Format | Adds |
|---|---|
| 1.0 | The base below. |
| 1.1 | Groups of sounds (a clip's `group`, an order's `groups`), saved key layouts (`layouts`) and own voices (`voices`). |
| 1.2 | `heard` on each clip, and its WAV. |

Added later without a bump, and so optional: `touchLayouts`, and `tempos` on a song. A backup without them is whole.

## Top level

`{ app, format, exported, version, people, clips, overrides, orders, patterns, beats, settings, decks, takes, songs, songbook, prefs, layouts, voices, touchLayouts }`

`exported` is an ISO date and `version` the app's release; both are text for people to read. Every store is an array and may be missing or empty. A reader keeps only what it understands: a record of the wrong shape is dropped, and the app says so to the person.

**Ids.** `p-…` is a person, `user-…` an own sound, `beat-…` a saved beat, `song-…` a song, `take-…` a take, `layout-…` a key layout, `touch-…` a touch layout, `voice-…` an own voice, `g-…` a group. After the prefix: lowercase letters, digits and `-`, at most 48 characters. A reference to a missing record is not an error: the app shows it as deleted. **Times** are milliseconds since 1970 (`created`, `edited`, `saved`, `used`) unless a field says seconds.

**`changed`.** Most records may carry `changed`, the time of the last edit, used to settle a clash between two devices. An importer may ignore it.

**Sound ids** (`clipId`, `ids`, key and band sounds) name one of two things:

- An own sound: `user-…`, in `clips`.
- A preset from the app's `boards.json`: its kit id (`kick`), or a person's own copy of it, `<personId>-<kitId>` (`p-ab12-cd34-kick`). Kit ids may contain `-`, so split by looking for a kit id the person id can be followed by. Presets are not in a backup, only a person's edits of them (`overrides`). v2 carries `boards.json` and its audio.

## people

| Field | Meaning |
|---|---|
| `id` | `p-…` |
| `name` | Up to 20 characters. A fun name made by the app (never a real name). |
| `color` | `#RRGGBB`; white text is drawn on it. |
| `avatar` | One emoji. |
| `added` | `true` for a person made in the app. Only these are imported. |
| `created`, `edited` | When made; when the name, color or picture last changed (the newer wins). |
| `fun`, `solo`, `hidden` | The name came from the generator; the device's own first person; deleted from view (their sounds wait to be brought back). |

An empty first person who was never renamed (`solo`) is not worth importing.

## clips: a person's own sounds

| Field | Meaning |
|---|---|
| `id`, `personId` | `user-…`; the owner. |
| `label` | Up to 24 characters. |
| `emoji`, `color` | The pad's picture (up to 8 characters) and a palette name (`red orange yellow lime teal blue pink white`). |
| `file` | The audio entry as recorded. Required: a clip with no readable file is dropped. |
| `mime` | `audio/webm` and the like. |
| `heard` | **1.2.** The WAV entry as it plays. Optional: a sound that could not be rendered goes without, and together the heard copies stop at 120 MB. **Play this one when present**; play `file` with none of the recipe below when it is missing. |
| `created` | When made. |
| `group` | **1.1.** A group id from the person's order (below). |
| `root` | The sound's note, a MIDI number 0 to 127 (middle C is 60), when the app found it. Used to play a tune row on key. |
| `exact` | `true`: keep the sound's full length, silent end included, so it loops in time. |

The rest is the recipe the app played the sound with. **A reader of 1.2 does not need it**: `heard` is the result. It is kept so a copy of this app, or a later player that wants to edit a sound, can rebuild it from `file`.

| Field | Meaning |
|---|---|
| `voice`, `amount` | A voice by id (`normal loud chipmunk fast slow monster robot stadium walkie underwater alien clones stutter backwards`) and its one number. |
| `fx` | A longer chain of steps: `[{type, …}]`, up to 6, each a `voice` or a building block (pitch, stretch, tone, echo, room, crunch, wobble, ring, squash, fade…). |
| `tweaks` | The sound sheet's knobs, only those off normal: `pitch` (semitones, -24 to 24), `speed` (doublings, -4.3 to 3), `echo` 0 to 3, `volume` -2 to 2, `warble` 0 to 2, `tone` -2 to 2, `robot` 0 to 2, `crunch` 0 to 2, `stutter` 0 to 3, `backwards`, `special`. |
| `trim` | `{start, end}` seconds into `file`. |
| `edits` | `[{kind: reverse│silence│gain, start, end, amount?}]`, seconds into `file`, up to 16. |
| `fade` | `{in, out}` seconds. |
| `from` | `{id, how: chop│mix}`: made from another sound. |
| `synth` | How a ✨ made sound was built: `{tone, from, to, length, shape, pulses}`. The audio is in `file`. |

## overrides: a person's edits of a preset

`{ id, label?, emoji?, color?, hidden?, voice?, amount?, fx?, tweaks?, trim?, edits?, fade?, root? }`. `id` is a preset id as above (a person's copy of a kit sound, or a sound from `boards.json`). Only what changed is there. `hidden: true` means the person removed the pad. The voice fields have the same meaning as on a clip, but **a preset's edited sound is not rendered into the backup**: v2 applies `label`, `emoji`, `color` and `hidden`, and either its own voice or none for the rest.

## orders

`{ personId, ids, groups? }`. `ids` lists the sounds on the person's pads, in the order they sit. `groups` (1.1) is `[{id: "g-…", name}]`, the person's groups of own sounds (a clip's `group` names one).

## beats and patterns

`beats` are saved beats (`id` is `beat-…`). `patterns` holds each person's open beat, one per person, with no `id` of its own (it may carry the `id` of the saved beat it is).

Two beats per person have a reserved `id` and are hidden in the app, not listed in 🗂️ Beats: the scratch beat, `beat-scratch-<person id>` (ADR 0020), and the 🧸 Kids beat, `beat-kidsown-<person id>`, the 4×8 grid and ● tune of 🧸 Kids (Ben, 2026-10-27). Both are ordinary `beats` records with the fields below, backed up and synced like any other beat; a reader may show them as beats (the Kids beat is named `🧸 Kids beat`) or skip them. A copy of the app from before the Kids beat lists it as a beat and nothing else. A backup with none of them is as valid as ever; the format stays `1.x`.

| Field | Meaning |
|---|---|
| `personId`, `name` | Owner; up to 24 characters. |
| `bpm` | 60 to 180. **Quarter notes** per minute. |
| `signature` | `4/4 3/4 5/4 6/8 7/8`. A missing one is `4/4`. A beat saved before beats had their own signature is stamped with the one it was heard in when it is loaded (ADR 0035), so a backup from this app has one on nearly every beat. |
| `bars` | 1, 2 or 4. |
| `swing` | 0 to 50. See below. |
| `volume`, `fx` | The mixer's master: loudness 0 to 1, the gain itself (full when missing), and one effect id (`room hall echo muffled bright crunch warble robot louder`). The effects are the app's own; v2 may skip them. |
| `rows` | Up to 16, below. |
| `created`, `saved`, `pinned` | Saved beats only: when made and last saved; when pinned (only while pinned). |

**A pill** is a sixteenth note. A bar has the signature's pills in groups: 4/4 `[4,4,4,4]`, 3/4 `[4,4,4]`, 5/4 `[4,4,4,4,4]`, 6/8 `[6,6]`, 7/8 `[4,4,6]`. A pill lasts `60 / bpm / 4` seconds. A beat is `bars` bars long and then starts over; pill `i` of a row plays at `i × pill length`.

**A row:**

| Field | Meaning |
|---|---|
| `clipId` | The sound (an id as above), or `null`. |
| `steps` | Booleans, one per pill (at least 16). `true` plays the sound at that pill. A pill past the end of the list is off. |
| `accents` | Booleans like `steps`. A hit with its accent plays 1.5 times as loud. |
| `rate` | 1, 2 or 0.5: the row's pills last half as long (2) or twice as long (0.5), so a fast row goes round its pills more than once in a beat. **v1 honors it only for a person whose `level` is `advanced`**; otherwise every row runs at 1. |
| `muted`, `solo` | A muted row does not play. When any row is `solo`, only those play. |
| `volume` | 0 to 1 (up to 4 decimals), full when missing. It is the gain itself: the hit's gain is this times 1.5 for an accent. (The app's sliders show a dB-like position over it: gain = 10^(−40·(1−p)/20) for a position p from 0.05 to 1; v2 may show it as it likes.) |
| `fx` | One effect id for the row (as for the beat). |
| `ring` | `true`: a new hit of the sound lets earlier ones ring. Otherwise a new hit fades the row's earlier hits out as it starts. |
| `collapsed` | How the row was drawn in older copies (a slim row). Ignore it; copies from 2026-10-27 no longer write it. |
| `melody` | `true` for a tune row. Its notes are in `tune`; `steps` and `notes` are an older shorthand and may be ignored when `tune` is there. |
| `tune` | `[{p, s, l}]`: pitch `p` in semitones from the sound's C (-24 to 36; 0 plays the sound as it is), start `s` and length `l` in pills (halves allowed). A note plays the sound at speed `2^(p/12)` (so higher is shorter), moved by the sound's `root` so its C is a C, and fades out after `l` pills. Notes may overlap. |

**Swing.** In every group of four pills, pill 1 and pill 3 are late by `swing/100 × pill length`, and pill 2 (the "and" of the beat) by twice that. In a group of six (6/8, 7/8), pills 1, 3 and 5 are late by one. Pill 0 is never late. It applies at every level, to songs too.

## songs and songbook

`songbook` holds every saved song, `songs` each person's open song. The same shape:

| Field | Meaning |
|---|---|
| `id`, `personId`, `name` | `song-…`; the owner; up to 24 characters. |
| `tempo` | 60 to 180 BPM, from bar 1. |
| `tempos` | `[{bar, bpm}]`: from `bar` (counted from 1, so 2 or more) the song plays at `bpm`. Up to 32. Missing: one tempo. |
| `lanes` | 1 to 8 lanes: `{name, emoji, muted, volume, blocks}`. `volume` is the lane's gain, 0 to 1. |
| `blocks` | Per lane, in bar order: `{beatId, bar, times}`: the saved beat `beatId` starts at song bar `bar` (from 0) and plays `times` passes, one after another. |
| `slots` | `[{beatId, times}]`: the same thing flattened for older copies. Ignore when `lanes` is there. |
| `created`, `saved` | Saved songs only. |

**Song time.** A song bar is 16 pills long, at the song's tempo (a 3/4, 6/8, 5/4 or 7/8 beat's pass does not fill a bar exactly; the song as a whole ends on the bar line after its last pass, so it is a whole number of bars long). A beat plays at the song's tempo, not its own. A pass is as long as the beat's bars × its signature's pills, and is cut where the next block on the lane starts. Each lane plays through its own gain (`volume`, silent if `muted`).

A song from before 1.0's playlist (no `lanes`, only `slots`) is read as lane 1: its slots one after another, from bar 0.

## takes

A take is a performance on 🎤 Live: `{id, personId, name, created, duration, events}`. `duration` is seconds (up to 180). `events` is `[{t, clipId, kind, ring?}]` in time order, `t` in seconds from the start, to a millisecond.

| `kind` | Meaning |
|---|---|
| `hit` | The sound plays once from `t`. It cuts the same sound's earlier hits still sounding, unless `ring` is `true`, when it rings over them (up to 8 at once). |
| `loop` | The sound plays again and again, back to back, from `t`. |
| `stop` | Ends that sound's loop at `t`. |
| `beat` | A hit of the beat that was playing under the take. |

A loop that is never stopped ends at `duration`.

## decks, layouts, touchLayouts, voices

- **decks** (the keyboard now): `{personId, keys, mine?, touch?, touchMine?}`. `keys` maps a keyboard code (`KeyA`, `Digit1`, `Semicolon`, `Comma`…, 40 keys) to a sound id, or `null` for none. `mine` is the same, the person's own keyboard kept aside. `touch` and `touchMine` are touch layouts (below).
- **layouts** (1.1): saved keyboards: `{id, personId, name, created, keys}` with `keys` as above.
- **touchLayouts**: saved touch layouts: `{id, personId, name, created, bands, grid?}`. A band is `{group, size, sounds}` (`size` is `s`, `m` or `l`, how many pads fit across; up to 8 bands of 40 sounds), a row of pads; `grid` places the bands. Pads are the person's, so v2 may lay them out its own way and read only `sounds`.
- **voices** (own voices): `{id, personId, name, emoji, knobs, created, used, edited?}`. `knobs` has the `tweaks` fields above. A voice is a name for a set of knob positions; sounds already carry their result in `heard`.

## settings and prefs

- **settings**: `[{key, value}]`, the device's: `djLayout` (keyboard map), `sendLogs`, `sendUsage` (switches, both `true` or `false`). A device setting stays with the device; v2 does not need them.
- **prefs**: `[{personId, values, changed?}]`, a person's own. `values` may hold `level` (`kids`, `regular`, `advanced`), `advancedBeats` (`true` exactly when the level is advanced), `timeSignature` (the choice before each beat had its own; read only to stamp an old beat), `padSize`, `padSkin`, `instNotes`, `instChords`, `instBass`, `holdToLoop` (milliseconds a hold lasts before a pad or key keeps looping: 350, 500, 750, 1000 or 1500; 350 when missing), `tapToLoop` (`true` when 🔁 Loop is on: a tap starts or stops a loop with no hold; `false` when missing), `kidsPadSize`, `kidsPadSkin`, `kidsInstNotes` (🧸 Kids' own copies of the first, second and fourth: the same values), `seen`, `reaches`. A value that is not allowed is dropped.

## What a reader should do

1. Open the zip, read `backup.json`, refuse another major version.
2. For each person with `added: true`, make a person. Everything else names its owner by `personId`.
3. For each clip, take `heard` if the entry is there, else `file`. Keep `label`, `emoji`, `color`, `group`, `root`, `exact`.
4. Beats, songs and takes then play from their ids with the rules above. A sound id that is neither in `clips` nor in v2's own presets is a deleted sound: leave that row quiet.
5. Load by id and add: a record the device already has is skipped, so loading twice changes nothing (ADR 0011).

## What the writer promises

- A new field is optional and a reader that does not know it can skip it (a minor version).
- A field is never removed or given a new meaning inside `1.x`.
- Everything is cleaned on the way in: ids, colors, numbers in range, lists cut to their caps (`web/backup.js` `MAX_RECORDS`: 100 people, 2000 clips, 1000 beats, 1000 songs, 500 takes…). Treat a backup as untrusted.
