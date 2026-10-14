# DJ mode: design

**Status:** built (2026-10-11), steps 1–8 of § 7. What the build changed from this design: the toolbar is a Pads | Beats | DJ switch (Ben's answer); the recording grid is a small read-only grid on the DJ screen; a Keyboard chooser (Auto, QWERTY, Dvorak; AZERTY and Colemak dropped 2026-10-11) labels keys; a held key loops only while the OS repeats it; the light show is a kid's idea. Written 2026-10-10 for `TODO.md` "Agents do" → DJ mode. It works within the rules in [decisions.md](../decisions.md) (Beat maker: the DJ mode rows) and [ADR 0004](../adr/0004-learn-music-by-doing.md). Open questions are at the end. A layout mockup (scratch, not in the repo) was checked at all five widths.

**In short.** DJ mode is a third screen next to Pads and Beats. It shows 30 sound keys, laid out like the three letter rows of a keyboard. On a laptop you press the real keys. On a phone you tap the same keys as big pads, one row at a time. Two kinds of recording:

| | **🎤 Freestyle** | **🥁 Into the beat** |
|---|---|---|
| What it keeps | Every hit at its exact time | Each hit as a pill in the beat on screen |
| Starts | At your first hit | After a one-bar count-in, on a "1" |
| What you see | Keys lighting, a timer | The beat's rows, pills filling as hits land |
| Saved as | A take (new store), autosaved with a fun name | Changes to the beat on screen |
| Afterwards | Takes list: ▶ Play, 🔊 Make it a sound | Beats screen, as usual |
| Undo | Deletes the take | Puts the beat back as it was |

---

## 1. What a kid sees and does

### Getting there

**Decided (Ben, 2026-10-10): DJ is parallel to Pads and Beats.** The toolbar is a three-way switch plus Stop all on every screen: `[🔊 Pads | 🥁 Beats | 🎛️ DJ]` · `Stop all`. Edit sounds leaves the toolbar and becomes a `✏️ Edit` button at the top of the Pads screen, beside "My sounds".

The app remembers the last screen (localStorage `screen`, replacing `beats`).

### On a phone (375 px)

1. A kid taps 🎛️ DJ in the toolbar.
2. He sees a row of 10 big pads (the middle keyboard row: drums by default) and three tabs above them to switch rows (🥁👏🔔, 😎🗣️🪙, 🎸🎹🎶: each tab shows its first three sounds).
3. He taps pads. They play at once. Holding one for 350 ms loops it, as on the Pads screen.
4. He picks **🥁 Into the beat** and taps **● Record**. The grid of his beat shows. Big numbers count **1 2 3 4** with clicks. Then the beat plays and the playhead moves.
5. He taps Kick on the first beat of each bar. Each pill lights where his tap landed, a bit late or early does not matter. The beat goes round again. He adds Snare on the next pass. Pills keep filling.
6. He taps **■ Stop**. A bar says "Added 9 hits to Wobbly Thunder. ↩️ Undo". He goes to 🥁 Beats to tidy pills by hand, or keeps playing.
7. He picks **🎤 Freestyle**, taps **● Record**. It says "Play something!" The take starts at his first tap. He jams, taps ■ Stop. A bar says "Saved “Turbo Hoedown” (0:14). ▶ Play · 🔊 Make it a sound · ↩️ Undo".

### On a laptop (1100 px)

1. Same way in. The screen shows a picture of a keyboard: three staggered rows of key caps, each with its letter, the sound's emoji and name, in the sound's color.
2. The kid presses `A S D F` and hears Kick, Snare, Hi-hat, Clap. The key cap goes down on screen as they press it.
3. Recording works as on the phone. The beat grid shows above the keyboard at full width, so he sees pills fill while his hands stay on the keys.
4. Space presses whatever button has focus. After he clicks ● Record, focus stays on it, so Space stops the take.

### Changing which sound is on a key

- **✏️ Edit keys** (on the DJ bar) opens a focused view of its own: Layouts above the keys, Sounds below (README "DJ"; ADR 0014). The rules are in `keyset.js`, the view in `dj-keys.js`.
- **↺ Reset keys** (in that view, two taps) puts every key back to the defaults.

### Defaults: works with zero setup

Keys are named by `KeyboardEvent.code`, so they stay in the same place on any layout. Each person gets this until they change a key:

| Row (codes) | Default sounds, left to right | Why |
|---|---|---|
| Top: `KeyQ`…`KeyP` | The person's own sounds (newest first), then fill with Voices: Let's go!, Oh yeah!, Drop the beat!, Nice!, Wow!… | Their own recordings are what they want to DJ with |
| Middle: `KeyA`…`Semicolon` | Kick, Snare, Hi-hat, Clap, Open hat, Low tom, High tom, Crash, Rim, Shaker | Home row is where fingers rest: drums |
| Bottom: `KeyZ`…`Slash` | Bass C, Bass F, Bass G, Bass A, C chord, Am chord, F chord, G chord, Scratch, Explosion | Bass and chords that fit together, plus two fun ones |

The middle row shows first on phones. A missing kit sound (hidden or renamed is fine; hidden is skipped) is replaced by the next sound in its group. The default is computed (`defaultDeck`), never stored, so a new recording joins the top row by itself.

---

## 2. Screen layout

The DJ screen, top to bottom: **DJ bar** (pinned below 900 px, like the Beats Play bar), **beat grid** (Into the beat only), **keys**, toolbar.

DJ bar contents:

| Control | Notes |
|---|---|
| `▶ Play` | Plays the beat on screen (the same beat and engine as Beats) |
| `🎤 Freestyle` / `🥁 Into the beat` | Two-button switch (`aria-pressed`), remembered in localStorage `dj-mode` |
| `● Record` | Becomes `■ Stop` while counting in or recording |
| `🐢` `100 BPM` `🐇` | Into the beat only: steps through `COMMON_BPMS`. Locked while recording |
| `⏲️ Click` | Into the beat only: a click on every beat while recording. Remembered in localStorage `dj-click` |
| `🎬 Takes` | Freestyle only: the list of takes. It takes the place of Tempo and Click, which Freestyle does not use |
| `✏️ Edit keys` | Opens the ✏️ Edit keys view |

The DJ bar is two lines at every width: `▶ Play · 🎤 Freestyle · 🥁 Into the beat`, then `● Record · 🐢 100 BPM 🐇 · ⏲️ Click` (or `● Record · 🎬 Takes` in Freestyle). Below 420 px, Click shows only its emoji. Below 360 px, Play shows only ▶ and the tempo drops "BPM" (each keeps a full `aria-label`). Measured in the mockup: 112 px tall, no sideways scroll at 320.

The beat grid here is a **still, read-only copy** of the beat: one emoji per row, then one line of small pills per bar. Pills are not tapped here, so they can be smaller than 44 px. They show on, loud and the "1" exactly as Beats does. "Edit in 🥁 Beats" sits under it.

### 320 px (small phone)

```
┌──────────────────────────────┐
│ Soundboard               ⚙️  │
│ [▶] [🎤 Freestyle][🥁 Into…] │  DJ bar, pinned, 112 px
│ [● Record] [🐢 100 🐇] [🔔]  │
├──────────────────────────────┤
│ 🥁 ●○○○●○○○●○○○●○○○          │  grid: 14 px pills,
│ 👏 ○○○○●○○○○○○○●○○○          │  scrolls if rows > 4
│ 🔔 ●○●○●○●○●○●○●○●○          │
│        bar ● ○               │  2+ bars: one bar shown,
├──────────────────────────────┤  flips on each "1"
│ [😎🗣️🎧][🥁🥁🔔][🎸🎸🎸] [✏️]│  row tabs + Change keys
│ [Kick][Snare][Hat][Clap][Open]│  2 × 5 pads, 53 px,
│ [LTom][HTom][Crash][Rim][Shkr]│  pinned above the toolbar
├──────────────────────────────┤
│ [🔊 Pads] [🥁 Beats] [Stop]   │
└──────────────────────────────┘
```

### 375 px (main target)

Same as 320, with "▶ Play" and "100 BPM" in full. Pads are 64 px.

Height check at 375 × 667 with 4 rows, measured in the mockup: the grid ends at 287 px and the pinned keys start at 385 px. It fits with room to spare. With 8 rows the grid scrolls between the pinned DJ bar and the pinned pads.

### 700 px (tablet)

```
┌───────────────────────────────────────────────────────┐
│ [▶ Play]  [🎤 Freestyle]  [🥁 Into the beat] [✏️ Keys] │
│ [● Record]   [🐢 100 BPM 🐇]   [⏲️ Click]              │
├───────────────────────────────────────────────────────┤
│ 🥁 ●○○○●○○○●○○○●○○○ ●○○○●○○○●○○○●○○○  (2 bars a line) │
│ 👏 ○○○○●○○○○○○○●○○○ ○○○○●○○○○○○○●○○○                 │
├───────────────────────────────────────────────────────┤
│ [Q ][W ][E ][R ][T ][Y ][U ][I ][O ][P ]   3 rows × 10 │
│ [A ][S ][D ][F ][G ][H ][J ][K ][L ][; ]   61 px keys  │
│ [Z ][X ][C ][V ][B ][N ][M ][, ][. ][/ ]   no tabs     │
└───────────────────────────────────────────────────────┘
```

From 560 px up, all three rows show, the tabs go, and ✏️ Change keys moves to the end of the DJ bar's first line. Letters show on key caps only when a keyboard is likely (below).

### 900 px and 1100 px (laptop)

```
┌──────────────────────────────────────────────────────────────────┐
│ [▶ Play]   [🎤 Freestyle] [🥁 Into the beat]   [✏️ Change keys]  │
│ [● Record]       [🐢 100 BPM 🐇]       [⏲️ Click]                 │
├──────────────────────────────────────────────────────────────────┤
│ 🥁 Kick   ●○○○●○○○●○○○●○○○ ●○○○●○○○●○○○●○○○      22 px pills    │
│ 👏 Clap   ○○○○●○○○○○○○●○○○ ○○○○●○○○○○○○●○○○                     │
├──────────────────────────────────────────────────────────────────┤
│ ╭Q──╮╭W──╮╭E──╮╭R──╮╭T──╮╭Y──╮╭U──╮╭I──╮╭O──╮╭P──╮              │
│ │😎 ││🗣️ ││🎧 │ …                                                │
│   ╭A──╮╭S──╮╭D──╮╭F──╮╭G──╮╭H──╮╭J──╮╭K──╮╭L──╮╭;──╮  staggered │
│   │🥁 ││🥁 ││🔔 ││👏 │ …  name under the emoji                  │
│      ╭Z──╮╭X──╮╭C──╮ …                                            │
└──────────────────────────────────────────────────────────────────┘
```

Keys measured 81 px at 900 and 88 px at 1100 (capped by `--max: 1040px`). The stagger is a left indent of 0.25 and 0.75 of a key on the middle and bottom rows, as on a real keyboard. Under 900 px the rows do not stagger, so they line up as a grid of pads.

### The key look: a periodic table

Ben, 2026-10-10: "for the keyboard visualization, I was thinking something like the periodic table". Each key is a square tile laid out like an element:

```
┌──────────────┐
│ A        🥁  │   top: the key's letter, big, like an element symbol; the emoji at right
│              │
│   Kick       │   the sound's name, small
│ drums        │   the family, tiny, like an element's group
└──────────────┘
```

- **Color by family**, as the periodic table colors groups: drums, bass and chords, voices, game and effects, and the person's own sounds each get one color, with a one-line legend under the keys. Family color comes from the kit group (`kitGroups`); own sounds use the person's color.
- On phones (one row of 10) the tile shows the emoji and name; the letter shows only when a keyboard is likely (below).
- The tiles keep the grid of the layouts above: a 3 × 10 table from 560 px, staggered rows from 900 px.

### Key labels

- **When to show letters:** when `(hover: hover) and (pointer: fine)` matches (the same test as `.pad-key` today), or once any mapped key has been pressed on this visit (a tablet with a keyboard).
- **Which letters:** `navigator.keyboard.getLayoutMap()` where it exists (Chrome, Edge). It gives the printed key for each code, so AZERTY shows `A Z E R T Y`.
- **Fallback** (Safari, Firefox, or if the call fails): US QWERTY labels from the code (`KeyQ` → Q, `Semicolon` → ;). Each real key press then corrects its own label from `e.key` (one printable character, no modifiers, not a dead key), kept in localStorage `dj-labels`. A French keyboard on Firefox shows Q on the top-left key until it is pressed once, then shows A from then on.

---

## 3. Recording

### States

| State | Freestyle | Into the beat | Record button | Exits |
|---|---|---|---|---|
| idle | keys play | keys play; grid shows the beat | `● Record` | Record |
| waiting | "Play something!"; timer at 0:00 | (none) | `■ Stop` | first hit → recording; Stop → idle, nothing saved |
| count-in | (none) | big **1 2 3 4** over the grid, clicks | `■ Stop` | the "1" → recording; Stop → idle |
| recording | red dot, timer, keys light | pills fill, playhead moves | `■ Stop` | Stop, Esc, Stop all, 3:00 limit → done |
| done | bar with ▶ Play · 🔊 Make it a sound · ↩️ Undo | bar with ↩️ Undo | `● Record` | next take, or leaving DJ, clears the bar |

While counting in or recording: the tempo, ← → (change person), Change keys and the mode switch are locked. A locked key press says why through the live region ("Stop recording to change person").

### Freestyle

- **Starts** at the first hit after Record, so a take has no silence at the front.
- **Records** every key or pad hit as `{t, clipId, kind: 'hit'}`. Holding a key to loop records `'loop'`, and the tap that stops the loop records `'stop'`. Loops already running before Record are not recorded.
- **With a beat playing** (▶ Play on): the take starts at the bar's "1" at or before the first hit. The beat's own hits are recorded too, as `kind: 'beat'`. A take then needs no copy of the beat: it replays and renders from its events alone. (Row Overlap is not kept; a replayed beat hit cuts the last one off.) See open question 2.
- **Ends** at Stop. With a beat, the end moves to the nearest bar "1" (at least one bar after the start), so a rendered take loops in time. Without a beat, it ends when the last sound finishes, at most 2 s after Stop.
- **Limits:** 3 minutes (it stops itself and says so), 10 000 events.
- **Saved** at once to the `takes` store, with a fun name (§ Names). No save button, so nothing is lost.
- **Shows up** in 🎬 Takes: a dialog like Saved beats. Each take: name, length, hit count, then `▶ Play`, `🔊 Make it a sound`, `Delete` (two taps). The name is a text field, so tapping it renames the take.
- **▶ Play** replays on the audio clock with the sequencer's 25 ms lookahead. The keys light as their sounds play, like a player piano. Beat events do not light keys. A sound that was deleted since is skipped, with a note: "2 sounds in this take are gone".
- **🔊 Make it a sound** renders the take offline (as Save as a sound does for beats), scales it to 0.9 peak, and adds it as a 🎛️ pad with `exact: true`. A name field comes first, filled in with a name (§ Names). At most 180 s, the existing voice cap.
- **Undo** (in the done bar) deletes the take just made.

### Into the beat

- **Records into** the beat on screen for this person: the one Beats shows. Recording makes it differ from its saved copy, so the existing "not saved" check covers it.
- **Count-in:** if the beat is stopped, Record plays one bar of clicks (higher on the "1"), then the beat starts and recording starts on its first "1". If the beat is already playing, recording starts on the next bar "1" that is at least half a bar away; the count shows the beats left, with clicks only if ⏲️ Click is on.
- **Click:** a short synthesized blip (an `OscillatorNode`, 1500 Hz on the "1", 1000 Hz on other beats, 30 ms). It is never recorded or rendered. If the beat has no pills on, the click turns on for that take, so there is always something to play to.
- **Passes:** the beat goes round and round, and every pass adds pills (overdub) until Stop. See open question 4.
- **Which row a hit goes to:** the first unmuted row with that sound. If only a muted row has it, that row is unmuted (the kid is playing it, so they want to hear it). If no row has it, a new row is added for it. At 8 rows (`MAX_ROWS`) the hit plays but is not recorded, and a note says "The beat holds 8 sounds. Remove a row in 🥁 Beats to add another."
- **Never turns a pill off,** and never changes a loud pill (`accents`) to normal. A new pill is on and not loud.
- **No double sound:** a hit snapped to a pill later in this pass would sound twice, once live and again when the pill plays a moment later. The sequencer skips that one pill play, once.
- **Undo:** Record takes a copy of the beat. After Stop, the done bar offers ↩️ Undo until the next take, a pill edit, or leaving DJ. Undo puts the copy back.

### Loud hits from DJ

Recorded pills are normal, not loud. There is no reliable way to sense a hard hit. Most phones report the same `pointer.pressure` for every touch, and keyboards have no force sensor. Timing tricks (a fast double tap means loud) would clash with the double-tap rule below. A loud pill already in the beat stays loud. A kid makes pills loud in Beats by tapping them, as today. A later, keyboard-only option is open question 3.

---

## 4. The forgiving snap rules

All pure, in a new `web/rhythm.js`, unit-tested without a browser.

### Hit time on the audio clock

```js
// e.timeStamp (ms, performance clock) → audio-clock seconds, earlier by the output latency.
hitTime(eventMs, stamp, latency) =
  stamp.contextTime + (eventMs - stamp.performanceTime) / 1000 - latency
```

- `stamp` is `ctx.getOutputTimestamp()`, read in the handler. Where it is missing, use `{contextTime: ctx.currentTime, performanceTime: performance.now()}`.
- `latency = min(0.2, (ctx.outputLatency || 0) + (ctx.baseLatency || 0))`. Kids play to what they hear, which comes out late by that much. Touch input lag is not known and is not guessed. The values go into the event log so they can be tuned later.

### `snapHits({hits, t0, step, total, from, rates})`

| Input | Meaning |
|---|---|
| `hits` | `[{t, row}]`: audio-clock seconds (from `hitTime`) and the row the sound goes to |
| `t0` | audio time of pill 0 of the beat (the sequencer's start) |
| `step` | seconds per pill at 1× (`60 / bpm / 4`) |
| `total` | pills in the whole beat (`bar × bars`) |
| `from` | audio time recording began (a bar's "1") |
| `rates` | per row, 1, 2 or ½ (advanced speed); missing means 1 |

Output: `[{row, step, n}]`, one per counted hit. `step` is the pill index. `n` is the pill count since `t0`, so `floor(n / total)` is the pass.

Rules, applied to each hit in time order:

1. **Nearest pill.** `dt = step / rate(row)`; `pos = (t - t0) / dt`; `n = ceil(pos - 0.5)`. A hit exactly half way goes to the **earlier** pill, because late taps are more common than early ones.
2. **Just before the "1" lands on the "1".** `nFrom = round((from - t0) / dt)`. If `n < nFrom` and `t >= from - 2 × step` (half a beat), then `n = nFrom`. If it is earlier than that, it is a count-in tap: it played, and it is not recorded.
3. **A quick double tap counts once.** If this row's last counted hit was less than `min(0.09, 0.6 × dt)` seconds ago, drop this one. (90 ms, or less at fast tempos so a real fast roll still counts.)
4. **One hit per pill per pass.** If this row already has a counted hit with the same `n`, drop this one.
5. **Wrap.** `step = ((n % total) + total) % total`. A hit just before the beat starts over lands on its "1", on the next pass.

`applySnaps(rows, snaps)` returns new rows with `steps[step] = true` for each snap. It never sets a pill off and never touches `accents`.

### Worked examples

100 BPM, 1 bar of 4/4: `step = 0.15`, `total = 16`, `t0 = from = 10.000`, all rows at 1×.

| # | Hit `t` | Row | `pos` | Result | Rule |
|---|---|---|---|---|---|
| 1 | 10.020 | kick | 0.13 | step 0 | 1 |
| 2 | 10.580 | kick | 3.87 | step 4 | 1 |
| 3 | 10.620 | kick | 4.13 | dropped | 3: 40 ms after #2 |
| 4 | 9.800 | snare | −1.33 | step 0 | 2: within 0.3 s before the "1" |
| 5 | 9.600 | snare | −2.67 | dropped (played, not recorded) | 2: count-in tap |
| 6 | 10.075 | hat | 0.50 | step 0 | 1: half way goes earlier |
| 7 | 10.550, then 10.660 | clap | 3.67, 4.40 | step 4, then dropped | 4: both are pill 4 (110 ms apart, not a bounce) |
| 8 | 12.370 | hat | 15.80 | step 0, `n = 16` (pass 2) | 5: just before the loop starts over |
| 9 | 10.300 | bass, rate 2 | 4.00 (`dt` 0.075) | step 4 | 1, with its own `dt` |

Tests also cover: 2 and 4 bars; 3/4 and 6/8 (`total` 12); 180 BPM (bounce window 50 ms); `from` later than `t0` (recording joined a playing beat at bar 2); an empty hit list; hits out of order (sorted first).

---

## 5. Data

Two new IndexedDB stores, one schema version. Settings stay in localStorage, as they are per-device conveniences.

| Store (`since: 7`) | Key | Record |
|---|---|---|
| `decks` | `personId` | `{personId, keys: {KeyA: '<person>-kick', KeyS: null, …}}`. Only keys the kid changed. `null` means No sound. A key not listed, or naming a sound that is gone, uses the default. |
| `takes` | `id` | `{id: 'take-…', personId, name, created, duration, events: [{t, clipId, kind}]}`. `t` in seconds from the take's start, rounded to 1 ms. `kind` is `hit`, `loop`, `stop` or `beat`. |

- `store.js`: add both to `SCHEMA` with `since: 7`. `upgradeStores` already creates only missing stores.
- `state.js`: `state.decks` (Map) and `state.takes` (array) in `readStorage`. `deletePerson` also deletes their deck and takes.
- Deleting a sound: decks fall back to the default for that key on read. Takes keep their events and skip the missing sound on replay.
- **Backups** (`backup.js`): `makeBackup` adds `decks` and `takes`. `BACKUP_FORMAT` stays 1: both are optional on read, like `settings`, and an older app ignores them. `readBackup` sanitizes:
  - `decks`: `knownPerson(personId)`; keys only from the 30 `KEY_CODES`; values a string up to 64 chars, or `null`. Cap 100 records.
  - `takes`: id matches `/^take-[a-z0-9-]{1,48}$/`; `knownPerson`; `name` via `title(…, 24)`, else a generated name; `duration` 0–180; `events` an array cut to 10 000, each `t` 0–180, `clipId` a string up to 64 chars, `kind` from the four. Events are sorted by `t`. Cap 500 records.
  - Malformed records count toward "N items couldn't be used", as now.
- **Settings:** none added. `dj-mode`, `dj-click`, `dj-labels` and `screen` are localStorage (`remember`/`recall`), wrapped in try/catch as today.
- An ADR is due when this is built: it adds stored formats and backup fields ("a stored or backup format" in AGENTS.md).

### Names

Every new thing gets a whimsical name offered up front, which the kid can change. `web/names.js` gets one more list and one more function. `pick()` and `combos()` stay as they are.

| New thing | Name function | Names in use (`taken`) | Where it is offered |
|---|---|---|---|
| Freestyle take | `takeName(taken)` (new) | this person's take names | Saved at once under it. The done bar says it; the Takes list lets the kid rename it |
| Take made into a sound | the take's name, or `soundName(taken)` if a sound on this board already has that name | labels of every sound on this board | Prefilled in the name field before 🔊 Make it a sound renders |
| Beat recorded into | (none: the beat keeps its name; Saved beats names it on save, as today) | | |

New list in `names.js`, for performances: 40 nouns, like the other lists. `names.test.mjs` adds `TAKE_NOUNS` to its checks (at least 40, no repeats, longest adjective + longest noun fits 24; "Electric Extravaganza" is 21).

```js
export const TAKE_NOUNS = [
  'Jam', 'Hoedown', 'Shindig', 'Boogie', 'Ruckus', 'Rumpus', 'Fiesta', 'Showdown', 'Encore', 'Remix',
  'Mixtape', 'Stomp', 'Romp', 'Groove', 'Shuffle', 'Rampage', 'Session', 'Hullabaloo', 'Freestyle', 'Wiggle',
  'Breakdown', 'Jamboree', 'Bonanza', 'Uproar', 'Hootenanny', 'Kerfuffle', 'Medley', 'Riot', 'Bop', 'Jive',
  'Rodeo', 'Carnival', 'Kaboodle', 'Blowout', 'Throwdown', 'Dance-off', 'Spectacle', 'Extravaganza', 'Mashup', 'Bash',
];
const TAKE_NAMES = combos(TAKE_NOUNS, MAX_LABEL);
export const takeName = (taken = [], random = Math.random) => pick(TAKE_NAMES, taken, MAX_LABEL, random);
```

That gives names like "Turbo Hoedown", "Soggy Kerfuffle", "Captain Jam": 2000 combinations before a number is added.

---

## 6. Accessibility and keyboard

### Keys on the DJ screen

| Key | Does | Notes |
|---|---|---|
| The 30 letter-area keys | Play that key's sound | DJ screen only. Not in a text field or dialog, not with Ctrl, Meta or Alt. `preventDefault`, which also stops Firefox's quick find on `/`. `e.repeat` is ignored |
| Hold a key 350 ms | Loops it, as holding a pad | Not in Into the beat (a held key counts as one hit there) |
| Shift + key | Same as the key | Kept free for loud hits later (question 3) |
| Esc | Stops recording and keeps the take; pressed again, stops everything | Today's "Esc stops everything", made safe for a take |
| ← → | Change person | Locked while counting in or recording |
| 1–9 | Nothing | They play pads on the Pads screen only. One meaning per screen |
| Space, Enter | Press the focused button | Unchanged. Record keeps focus, so Space stops a take |
| Tab | Moves through the DJ bar, the row tabs, then the keys | The 30 keys are one Tab stop, with arrow keys between them, like the pills |

In change mode, a key press selects that key and opens the chooser instead of playing.

### Screen readers

- The keys sit in a group with `role="application"` and `aria-label="DJ keys"`. Inside it, NVDA and JAWS pass letter keys to the page instead of using them to jump between headings.
- Each key is a button: `aria-label="A: Kick"`. In change mode: "A: Kick. Press to change its sound."
- Hits are not announced, as that would be noise. State changes are announced through the existing `#announce` live region: "Count-in", "Recording", "Stopped. Added 9 hits to Wobbly Thunder. Undo is available.", "Saved Turbo Hoedown, 14 seconds."
- The read-only grid is `aria-hidden`. Its text stand-in, updated after each take, reads "Wobbly Thunder: 3 sounds, 14 pills on". The full grid stays reachable in 🥁 Beats.
- The count-in numbers are big text (`aria-hidden`; the live region says "Count-in"). With `prefers-reduced-motion`, keys and numbers do not animate.
- New colors (the key caps' pressed state, the recording red on the DJ bar) go into the contrast suite.

---

## 7. Build plan

Each step is one commit, deployed. Every step keeps `just test` green and checks 320, 375, 700, 900 and 1100 px where something shows. About 13 h in all.

| # | Step | Time | Tests |
|---|---|---|---|
| 1 | `rhythm.js`: `hitTime`, `snapHits`, `applySnaps`, `KEY_ROWS`/`KEY_CODES`, `defaultDeck`, `fallbackLabel`, `countInBeats`. `names.js`: `TAKE_NOUNS`, `takeName` | 1.5 h | `rhythm.test.mjs`: every row in § 4's table, plus the extra cases listed. `defaultDeck` with own sounds, with none, with a hidden kit sound. `names.test.mjs`: `TAKE_NOUNS` joins the list checks; take names fit and never repeat |
| 2 | Data: `decks` and `takes` in `SCHEMA` v7, `state.js`, `deletePerson`, backup write and read | 1 h | `store.test.mjs`: v6 → v7 adds both stores, keeps the rest. `backup.test.mjs`: round trip; hostile takes (bad ids, 20 000 events, `t` 1e9, unknown `kind`, unknown key codes) are cut or dropped and counted; a backup without them loads |
| 3 | DJ screen shell: toolbar for three screens, remembered screen, deck from defaults and `decks`, phone row tabs, keyboard picture, play by key and touch, hold to loop, key labels (layout map, fallback, learned) | 2.5 h | `app.test.mjs` (fake DOM): toolbar per screen; a `KeyA` keydown on DJ plays Kick (audio stubbed); keys stand down in dialogs, inputs and with Ctrl; ← → still change person; 1–9 do nothing on DJ. By hand: the five widths, a real keyboard, a phone |
| 4 | Change keys: move the sound chooser out of `sequencer.js` into `chooser.js` (used by rows and keys), No sound, Reset keys | 1.5 h | Existing chooser tests move and still pass. New: choosing a sound stores only that key; Reset clears the deck record; a deleted sound's key falls back to default |
| 5 | Freestyle: state machine, recorder, autosave with `takeName`, done bar with Undo, Takes dialog (play, rename, delete), replay that lights keys | 2 h | Pure `takeFrom(events, stopAt, beatGrid)`: start at first hit or its bar "1", end rules, 3:00 and 10 000 caps. App test: Record → keys → Stop saves one take; Undo deletes it; Esc keeps it |
| 6 | Make it a sound: offline render shared with Save as a sound (`renderHits` in `sequencer.js`), name field | 1 h | Pure `planTake(take)`: loop events become repeats until stop or end; missing sounds skipped. App test: adds a 🎛️ pad with `exact: true` and the offered name |
| 7 | Into the beat: sequencer record API (start on a "1", skip-once, `applySnaps` live, add or unmute rows, 8-row note), count-in and click, read-only grid with bar flip under 700 px, tempo stepper, locks, Undo | 3 h | `countInBeats` per signature; skip-once; row choice (unmuted, muted, new, full). App test: Undo restores the beat exactly (`samePattern`). By hand: record on a phone at 80 and 140 BPM, and check it feels fair |
| 8 | Docs: README (DJ screen, keys, stores, backup fields), decisions rows from "(to build)" to built, ADR 0005 for the stored formats, `state.md` | 0.5 h | `docs.test.mjs` (links, ADR index) |

Steps 1 and 2 have no UI and can land first. Step 7 depends on 3. Steps 5 and 6 can come before or after 7.

---

## 8. Ben's answers (2026-10-10)

1. **DJ button:** DJ is a parallel screen; the toolbar is a Pads | Beats | DJ switch, and Edit moves onto the Pads screen.
2. **Beat in a freestyle take:** yes, its hits are recorded with the kid's.
3. **Loud hits from DJ recording:** not in v1.
4. **Into the beat:** keeps going round until Stop (overdub).
