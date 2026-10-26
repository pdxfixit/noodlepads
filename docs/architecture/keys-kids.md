# ⌨️ Keys, 🎤 Live, 👆 touch layouts and 🧸 Kids

## In short

- **One keys panel, built once.** `dj.js createDJ` makes it (in `app.js start`). It is 🎤 Live in mode `'free'` and 🥁 Beats with ⌨️ Keys on in mode `'beat'`. `app.js showView` picks the mode with `dj.setMode`.
- **Two ways to play it, one hit path.** The 40 keys (⌨️) or a touch layout of bands (👆). A key and a tile both end in `dj.js hit`, which plays through `deps.tap` (= `pads.js tapPad` → `audio.play`), records into a take, makes a beat row and snaps into the beat.
- **The keys own no beat.** In mode `'beat'` every change to the open beat goes through `deps.seq` (the one `sequencer.js createSequencer` object). The keys view only draws its own small grid of it (`dj.js renderGrid`).
- **Pure rules sit apart:** `rhythm.js` (keys, snapping, takes), `keyset.js` (✏️ Layout for keys), `touch.js` (bands), `touch-grid.js` (the grid tree), `kids-logic.js` (Kids), `finger.js` (lift-to-play).
- **🧸 Kids is a module singleton** (`kids.js`, state at module level, wired by `initKids`). It shares the data, `audio.js`, the person's settings and a few helpers with the regular app. It has its own beat player, recorder, toy keys and tune snap, and none of the keys panel.
- **The kid's beat is the person's scratch beat** (ADR 0020). Kids writes it straight into `state.savedBeats`; the beat maker reads it again when a view shows (`sequencer.js show`), and leaving Kids shows the view again (`app.js applyKids` → `showView`).

## Files and who calls whom

| File | Made or called by | Calls | Owns |
|---|---|---|---|
| `dj.js` | `app.js start` (`createDJ({ el, deps })`) | `rhythm.js`, `touch.js`, `dj-keys.js createKeysEditor`, `dj-touch.js drawBands`/`createTouchEditor`, `finger.js fingerTaps`, `beat-row.js`, `row-volume.js`, `pill-select.js`, `overflow.js moreMenu`, `follow.js`, `share-render.js renderTake`, `deps.seq.*` | mode, input, layout, takes in progress, the beat recording, the click wish, 🔔 Let it ring, the grid |
| `rhythm.js` | `dj.js`, `dj-keys.js`, `keyset.js`, `audio.js` and `sequencer.js` (`ringOver`), `backup.js` (`cleanDeck`, `cleanTake`), `share-render.js` (`planTake`), `settings.js` (`LAYOUT_NAMES`) | `touch.js cleanTouch` | nothing (pure) |
| `dj-keys.js` | `dj.js` (once) | `keyset.js`, `rhythm.js`, `inst-picker.js`, `dialogs.js` | the ✏️ Layout (⌨️ Keys) dialog's picks, undo stack, drag |
| `keyset.js` | `dj-keys.js`, `backup.js` (`cleanLayout`) | `rhythm.js` | nothing (pure) |
| `dj-touch.js` | `dj.js` (`drawBands` every render; `createTouchEditor` once) | `touch.js`, `touch-grid.js`, `inst-picker.js`, `instruments.js` | the ✏️ Layout (👆 Pads) dialog's picker, undo stack, three drags |
| `touch.js` | `dj.js`, `dj-touch.js`, `rhythm.js`, `backup.js` | `touch-grid.js` | nothing (pure) |
| `touch-grid.js` | `touch.js`, `dj-touch.js` | none | nothing (pure) |
| `finger.js` | `dj.js`, `kids.js`, `pads.js` | none | one follower per caller |
| `kids.js` | `app.js` (`initKids`, `showKids`, `refreshKids`, `kidsPersonLeaving`, `kidsShowing`, `kidsBusy`, `askGrownUp`, `kidsKeydown`, `kidsKeyup`) | `audio.js`, `kids-logic.js`, `grown-up.js`, `scratch.js`, `settings.js`, `skins.js`, `tips.js`, `finger.js`, `meter.js levelOf`, `notes.js startsIn`, `sequencer.js` (`STEPS`, `noteRate`), `instruments.js` | the tab, the page, the recorder, the beat player, held toy keys, the tune recording |
| `kids-logic.js` | `kids.js`, `grown-up.js` (`makeSum`, `typeDigit`) | `sequencer.js` (`cleanRow`, `STEPS`, `multiplyRows`), `notes.js addNote`, `voices.js` (`chainFields`, `voiceStep`), `scratch.js SCRATCH_NAME`, `instruments.js versionFor` | nothing (pure) |
| `grown-up.js` | `kids.js askGrownUp`, `feedback.js` | `kids-logic.js`, `dialogs.js` | the one `#kids-sum` dialog and who asked it (`ask`) |

`dj.js` imports no `audio.js`. Every sound it makes goes through `deps`: `tap`, `loop`, `playOnce`, `stopClip`, `loadSound`, `isLooping`, `now`, `latency`, `sampleRate`.

## The keys panel (`dj.js`)

### One panel, two modes

`dj.js` keeps `mode`: `'free'` (🎤 Live) or `'beat'` (🥁 Beats with ⌨️ Keys). `app.js showView` calls `dj.setMode(name === 'live' ? 'free' : 'beat')` whenever the keys show. `dj.js showMode` then shows or hides the parts of each.

| | 🎤 Live (`'free'`) | Beats with ⌨️ Keys (`'beat'`) |
|---|---|---|
| Open beat | none: `seq.show('live')` sets `pattern` to null | the one open beat (ADR 0017), drawn in `#dj-grid` |
| ● Record | a take (`startRec` / `stopRec`) | into the beat (`startBeatRec` / `stopBeatRec`) |
| Takes button | shown | hidden |
| ⏲️ Click track | `#dj-click` on the control bar, after its own tempo `#dj-click-tempo` (slider `#dj-click-bpm`; on a phone the tempo key `#dj-click-key`) | `#dj-beat-click` on the control bar |
| Tempo | `seq.tempo()`: the sequencer's `LOOSE` tempo (100 BPM, never saved) | the open beat's, saved with it |
| 🔔 Let it ring | `#dj-overlap`, for the visit (`overlap`, never saved) | hidden; each row's own 🔔 decides |
| A key with no row | nothing | `showRow` adds its row (`seq.addRowFor`) |

### State `dj.js` owns

| Variable | What it is | Kept where |
|---|---|---|
| `mode` | `'free'` or `'beat'` | memory |
| `input` | the kid's ⌨️ / 👆 pick | localStorage `dj-input` |
| `size` | S M L of the keys as pads | localStorage `dj-size` |
| `layout` | QWERTY or Dvorak, for letters and `keyFor` | setting `djLayout` (device scope), else `detected`, else `'qwerty'` |
| `keyboardSeen` | a key was pressed (or Q / D picked) this visit | memory |
| `row` | the row shown on a phone's row tabs | memory |
| `holds`, `held`, `fingers` | pointers and keys held, for hold-to-loop | memory |
| `rec`, `lastTake`, `replay`, `booked`, `replaying`, `replayRun` | a take being recorded, the last one, playback timers, the hits it booked | memory; takes in `state.takes` |
| `beatRec` | the recording into the beat | memory |
| `clickWanted` | the keys' ⏲️ | localStorage `dj-click` |
| `overlap` | 🔔 Let it ring on Live | memory only (off after a reload) |
| `rowAsked`, `picturing`, `levelUndo` | a row's ✕/🧹 waiting for its second tap, the picture chooser, a loudness Undo | memory |

### The deck record (IndexedDB `decks`, one per person)

`state.decks` maps a person id to it. `app.js` `deps.savedDeck` reads it and `deps.saveDeck(pid, keys, more)` writes it (it drops the old `beatId` and keeps every other field). `rhythm.js cleanDeck` cleans one from a backup or the cloud.

| Field | Meaning | Written by |
|---|---|---|
| `personId` | whose keys | `saveDeck` |
| `keys` | `{code: clipId \| null}`, **only the keys that differ from the defaults** (`keyset.js changedKeys`). `null` is No sound. | `dj-keys.js setKeys` → `saveKeys` |
| `mine` | ⭐ My keys: all 40 keys, kept when a layout replaced a hand-made board | `dj-keys.js loadLayout` → `saveMine` |
| `touch` | the 👆 touch layout `{bands, grid?}`; missing means the default | `dj-touch.js set` → `saveTouch` |
| `touchMine` | ⭐ My layout, the hand-made touch layout kept when a saved one replaced it | `dj-touch.js loadLayout`/`useShape` → `saveMine` |
| `beatId` | old Beat Builder's open beat (ADR 0008). Read by nothing; `cleanDeck` keeps it so old backups load; `saveDeck` drops it | nobody now |

`code` is a `KeyboardEvent.code` from `rhythm.js KEY_CODES`: `Digit1`…`Digit0`, `KeyQ`…`KeyP`, `KeyA`…`Semicolon`, `KeyZ`…`Slash` (`KEY_ROWS`, 4 rows of 10).

### How a key finds its sound

1. `dj.js baseDeck` builds the defaults with `rhythm.js defaultDeck(own, kit)`: the person's own sounds then voices on the top letter row, drums on the home row (`HOME_ROW`), bass and chords on the bottom row, a C-to-C scale on the number row. Advanced-only presets are never a default. It reads `clipsFor(pid, { ownSounds: true })`, so the defaults are the groups' own sounds whatever instrument is picked (ADR 0030).
2. `dj.js deck` lays the stored `keys` over the defaults. A changed key whose sound was deleted goes back to its default; a stored `null` stays No sound.
3. The defaults are never stored, so a new recording joins the top row by itself.

`deck()` is worked out afresh on every call (a key press asks more than once). Keep it cheap.

### The touch layout (`touch` and `touchMine`)

```
touch  {bands: [{group, size: 's'|'m'|'l', sounds: [clipId…]}], grid?}
grid   {dir: 'across'|'down', parts: [part…]}
part   {size: 1…12, band?: index}            a block (no band: empty)
     | {size: 1…12, dir, parts: [part…]}     a split inside it
```

- A band is one group (a kit group id, or `touch.js MINE` = 🎤 My sounds) with one tile size: S, M, L are 5, 4, 2 across on a phone (`SIZES`). At most `MAX_BANDS` (8) bands, `MAX_BAND_SOUNDS` (40) each.
- `grid` (ADR 0032) places the bands in blocks side by side. `band` is an index into `bands`. Sizes are twelfths of their split (`UNITS`), each part at least `MIN_PART` (2). At most 4 parts a split, 3 deep, 8 blocks.
- **With a grid, `bands` are kept in the blocks' reading order** (`touch-grid.js settle`). A band no block holds is dropped. The beat's rows follow that order.
- With a grid, a band's `size` is kept but unused: `touch-grid.js bestColumns` picks the columns from the block's measured size (`dj-touch.js fitPads`, a `ResizeObserver`).
- No `touch` stored means the default: `touch.js defaultTouch` (🎸 Band, under the person's newest own sounds). `dj.js touchNow` works it out each time, so new sounds show.
- An older copy that knows no grid still plays the bands, stacked.

### Saved layouts and ready-made ones

| | ⌨️ Keys | 👆 Pads |
|---|---|---|
| Saved record | IndexedDB `layouts`: `{id: 'layout-…', personId, name ≤24, created, keys: all 40}` | IndexedDB `touchLayouts`: `{id: 'touch-…', personId, name ≤24, created, bands, grid?}` |
| Cleaned by | `keyset.js cleanLayout` | `touch.js cleanTouchLayout` |
| Ready-made (code, never stored) | `keyset.js READY_LAYOUTS` (kit ids), made the person's by `readyKeys` | `touch.js READY_TOUCH`, made the person's by `readyTouch`; grids `touch-grid.js READY_GRIDS` |
| Kept on replace | `keyset.js keepAsMine` → deck `mine` | `touch.js keepAsMine` → deck `touchMine` |
| Store helpers in `app.js` | `deps.layouts` / `saveLayout` / `deleteLayout` | `deps.touchLayouts` / `saveTouchLayout` / `deleteTouchLayout` |

`dj.js` hands the touch editor `layouts: deps.touchLayouts`, so inside `dj-touch.js` `deps.layouts` means touch layouts. Inside `dj-keys.js` (which gets `...deps`) it means key layouts.

### Keyboard, mouse and finger

| Question | Answer | Where |
|---|---|---|
| Keys or bands? | Under 700 px wide: always 👆. Else the kid's pick (`dj-input`), else ⌨️ | `dj.js inputNow`, `narrow` |
| Letters on the keys? | A key pressed this visit, or a mouse (`(hover: hover) and (pointer: fine)`) | `dj.js keyboardish` |
| Keys as a keyboard or as pads? | `pads-mode` (one row at a time, row tabs, S M L) when not `keyboardish` | `dj.js render` |
| Which key a press is | the character typed, found in the picked layout's picture; else `e.code` | `rhythm.js keyFor` |
| Which layout | `djLayout` setting, else `navigator.keyboard.getLayoutMap()` (`rhythm.js detectLayout`), else QWERTY | `dj.js layoutNow`, `readLayout` |
| A finger or a mouse | `finger.js isFinger` (touch or pen): plays on the lift, if it stayed within `TAP_SLOP`; held still `HOLD_TO_LOOP_MS` (350 ms) it plays and loops. A mouse plays on press; held 350 ms it loops | `dj.js listen`, `pointerDown` |
| Enter or Space on a focused key | a `click` with `detail 0` plays it; Shift loops it | `dj.js listen` |

The footer's how-to (`app.js showHint`, `screenHint`) uses the same `pointer: fine` test and `dj.touching()` to say "key" or "pad".

### From a key or a tile to a sound

1. **A real key:** `document` `keydown` (`app.js bindEvents`) → `dj.keydown(e)` → `rhythm.js keyFor` → `dj.js play(code, { earlier: e.shiftKey })` → `deck()[code]` → `hit(id)`. A key held down loops only when the OS's repeat presses prove it is still down past 350 ms (`held`). Lifting ⌘, Ctrl, Alt or OS forgets every hold (`letGo`).
2. **A key or tile tapped:** `pointerdown` on `#dj-keys [data-code]` or `#dj-touch [data-clip]` → finger: `fingers.down` (lift plays); mouse: `pointerDown` → `playTarget` → `play(code)` or `playTile(clipId)` → `hit(id)`.
3. **`dj.js hit(id, { earlier })`:**
   1. `deps.clipById(id)` (`board.js anyClip`).
   2. `deps.tap(clip, { ring, kind: 'keys' })` = `pads.js tapPad`: a looping sound stops (returns true); else `audio.play(clip, { ring })` and `countPlay('keys')`, so a key's play counts once, as a key. `ring` is 🔔 Overlap on Live only.
   3. `record(...)`: into a take, if one records (kind `'hit'` or `'stop'`).
   4. `showRow(clip)`: in mode `'beat'`, a sound with no row gets one (`seq.addRowFor`). Not while a groove plays without recording.
   5. `intoBeat(clip, earlier)`: while recording into the beat, snap the hit (below).
4. `light(code)` (a ripple over nearby keys) or `lightTiles(clipId)`.

**Holding:** `loopIt(clip)` → `deps.loop` = `audio.loop`, which waits for the next bar (`audio.loopInTime`) when a beat plays (`audio.grid` = `seq.grid`). A take records it as `'loop'`. Shift-click loops at once (`shiftPlay`).

**Glow:** `audio.on.looping` is set by `pads.js initPads`, which calls the `onLooping` hook `app.js` passes in → `dj.looping(id, on)`. `meter.onLevel` → `dj.level` (the panel's glow). `seq` `onHit` and `song` `onHit` → `dj.flashClip(clipId, ms)`: keys with that sound light in time, and a running take records it as `'beat'`.

### Takes (🎤 Live)

**Record.** ● → `startRec`: `rec = {started: false, events: []}`, a 250 ms timer for the status line and the 180 s cap. The take starts at the first non-`'beat'` event. Each event is `{at, clipId, kind, ring?}` on the audio clock (`deps.now()` = `audio.context().currentTime`, no latency moved). ■ → `stopRec` → `rhythm.js takeFrom(events, now)`. A screen change, 🧸 Kids (`dj.leave`) a change of person (`dj.personLeft`) or the page hidden (`visibilitychange`: the phone locked, another app) stops it too, keeping the take, as Esc does.

**Stored record** (IndexedDB `takes`, `state.takes`; cleaned by `rhythm.js cleanTake`):

| Field | Meaning |
|---|---|
| `id` | `take-…` (`TAKE_ID`) |
| `personId` | whose |
| `name` | ≤24 chars; `names.js takeName` |
| `created` | ms |
| `duration` | seconds, ≤ `MAX_TAKE_SECONDS` (180) |
| `events` | ≤ `MAX_TAKE_EVENTS` (10 000), each `{t, clipId, kind: 'hit'\|'loop'\|'stop'\|'beat', ring?}`, `t` seconds from the first hit, to 1 ms; `ring: true` only on a hit played with 🔔 Let it ring |

**Play back.** `dj.js playTake` loads every sound of the take (`deps.loadSound`), then books the take as it was heard, `rhythm.js planTake` (each hit, a loop's passes up to its stop or the take's end, a hit cut where the next cut it: what 🔊 Make a sound renders), on the audio clock at once, `t0 + at` (`t0` is `REPLAY_LEAD`, 50 ms, from now), each through `deps.bookPlay` = `audio.book`, a voice of its own outside `audio.playing` (`booked`). So a pad tapped meanwhile and the take never take each other's place. Only the keys' lighting and the end run on `setTimeout`. `stopReplay` clears the timers and cuts every booked voice (`deps.cutVoice`, so a play still to come never sounds); a take stopped while loading books nothing (`replayRun`). ⏹️ Stop all and 🧸 Kids call `stopReplay`, since `audio.stopAll` cannot reach booked voices outside `audio.playing`. A take's ▶ shows ■ Stop while it plays (`showPlaying`); its pads show no progress. Test: `tests/take-replay.test.mjs`.

**Make a sound.** `dj.js makeSound` → `share-render.js renderTake` (offline, `rhythm.js planTake`: hits cut their sound's earlier hits unless `ring`; loops repeat until stopped) → `sequencer.js encodeWav` → `deps.addSound` = `app.js addMadeSound` (🎛️). A second press on the same take asks "Make another?" (`askThenMake`, `ARM_MS`).

**Where takes show:** the take card `#dj-done` (rename, ▶, 🔊, ↩️ Undo deletes the take, ✕; `app.js` fades it after 10 s), the Takes dialog `#takes`, 🗂️ See all (`things.js`), cloud share previews (`share-render.js`).

### ● Record into the beat (`beatRec`)

Only in mode `'beat'`, with a beat open.

**Start** (`dj.js startBeatRec`):
1. `copy = seq.snapshot()` (for Undo). `startedBeat = !seq.playing()`.
2. `growing = startedBeat && bars < 4`; `seq.setGrow(growNow)`.
3. `seq.metronome(false)`; `seq.setClick(clickWanted)` (the keys' ⏲️ overrides Beats' own).
4. If Record started the beat: `seq.play({ countIn: true })` (one bar of blips, always), then `from = seq.beatClock().t0`. Else `from = seq.grid().next` (the next bar's "1").
5. `snap = rhythm.js createSnapper(from)`; `showRec` every 40 ms (the big count-in, `rhythm.js countAt`).

**A hit** (`dj.js intoBeat`): ignored before `from − 2 pills`. `seq.rowFor(clipId, beatRec.rows)` (its row, unmuted; else an empty row not used in this recording; else a new row; −1 when the beat is full). Time `now − deps.latency() − (Shift ? one pill : 0)`. `snap(hit, seq.beatClock())` → `{row, step, n}` or null. `seq.addSnaps([k], { skipAfter: now + 0.1, draw })` lights the pill, saves, and books a skip so the beat does not play that pill again this pass. A pill on a tune row also gets a note at pitch 0. `showHit` lights it in place; else `renderGrid`.

**The forgiving snap** (`rhythm.js createSnapper`), in time order:
1. nearest pill; exactly half way goes earlier;
2. a hit up to two pills before recording began lands on its "1"; earlier ones are count-in taps;
3. a double tap under min(90 ms, 0.6 pill) counts once;
4. one hit per pill per pass (`seen`);
5. a hit just before the loop starts over lands on the next pass's "1".

Each tap is snapped once, on the clock of its moment (`{t0, step, total, rates}`), so a tempo change (`sequencer.js retime`) or a beat that grows never moves a placed hit.

**Growing** ("keep playing and the beat gets longer"): `sequencer.js scheduleClicks` asks `growHook()` (= `dj.js growNow`) as the last beat of the beat is booked. A hit in the last bar on this pass (`lastBar`) doubles it, 1 → 2 → 4 bars (`sequencer.js grow`, `multiplyRows`). Hits still landing in the old bars are copied into the new ones (`beatRec.mirror`). A pass with no hit in the last bar stops growing for good.

**Stop** (`dj.js stopBeatRec(why)`): ● again (`'button'`), Esc (`'escape'`), a screen change, ⌨️ Keys off or Kids (`'leave'`), or the beat stopped from outside (`'stopped'`, via `seq` `onStop` → `dj.beatStopped`). It clears the grow hook, hands the click back (`setClick(null)`), stops the beat only if Record started it or a groove was playing, then offers ↩️ Undo (`showBanner`, 10 s) that calls `seq.restore(copy)`, only while the person it was offered to still shows (`offerBeatUndo`).

While recording: `seq.lockChips(true)`, bars and time signature hide, ▶ Play is disabled, a row's menu waits, `app.js setKeys` and ⇆ refuse.

### The click track and tap tempo

- Two ⏲️ wishes exist: the keys' (`dj.js clickWanted`, `dj-click`) and Beats' (`sequencer.js clickWanted`, `beat-click`). `seq.setClick(on)` overrides Beats' while the keys record or play; `setClick(null)` hands it back.
- With the beat stopped and the keys on screen, `dj.js tick` → `seq.metronome(clickWanted && onScreen)`: the sequencer's own `setInterval` ticks the click alone (`scheduleClicks`). `onScreen` comes from `dj.shown`, called by `app.js showView`, and with `false` as 🧸 Kids shows (`applyKids`).
- Tap tempo (`dj.js clickTapped`): a third tap within `TAP_GAP_MAX` (1.5 s) of the last → `rhythm.js tapTempo(taps, groups[0], { common: COMMON_BPMS })` → `seq.setTempo`; with the beat stopped, `seq.clickAt(now + one beat)`. Not during the count-in.
- ⏹️ Stop all (`app.js stopEverything`) calls both `seq.clickOff` and `dj.clickOff`, and `dj.stopReplay` (a take playing back).

### The keys view's grid (`dj.js renderGrid`)

A second drawing of the open beat, under the keys. Rows are in keyboard order (`rhythm.js keyboardOrder`) or band order (`touch.js touchOrder`); each line's `data-row` is the row's index in the beat. It reuses `beat-row.js rowParts`/`rowSpeaker`/`rowEmoji`/`twinRows`, `row-volume.js speakerControls`, `overflow.js moreMenu` and `pill-select.js createPillSelect` (registered with `seq.addPicker`, so ⇆ picks there too). Taps call `seq.cyclePill`; a hold `seq.cyclePill(r, s, true)` (loud); ✕ and 🧹 ask twice and offer Undo via `seq.snapshot`/`seq.restore`. The playhead is `dj.steps(shown)`, from `seq` `onSteps`, lighting only the pills that change.

### ✏️ Layout: two editors

`dj.js openEditor` opens `dj-keys.js` (⌨️) or `dj-touch.js` (👆) by `touching()`. The ⌨️ / 👆 switch (`#ke-input`, `#te-input`) sits inside both dialogs and swaps the open one.

| | `dj-keys.js createKeysEditor` | `dj-touch.js createTouchEditor` |
|---|---|---|
| Reads | `deps.keys()` (`dj.deck`), `deps.base()` (`dj.baseDeck`) | `deps.touch()` (`dj.touchNow`), `deps.sounds()` (`touch.js soundsOf`) |
| Writes | `saveKeys(changedKeys(full, base))` → deck `keys` | `saveTouch(cleanTouch(next))` → deck `touch` |
| Moves | tap picks then a key, drag a sound/group/key (`placeSounds`, `loadRow`, `swapKeys`, `clearKey`) | + Add a group, + more, swap a tile, ⠿ move a band, S M L, ✕; with a grid: tap or drag a group onto a block (`fillBlock`), drag an edge (`setEdge`), ⋯ split or join |
| Undo | in-memory stack, 30, cleared on open | the same |
| Instruments (ADR 0030) | `inst-picker.js` on an open Notes/Chords/Bass group | per band (`swapBand`, `instruments.js versionFor`) |
| On close | `deps.closed` → `dj.render` | the same |

Saving the layout in mode `'beat'` also redraws the grid, since rows follow the keys or bands.

### What the keys use of the sequencer (`deps.seq`)

Every one of these is in `sequencer.js createSequencer`'s returned object.

| Job | Methods |
|---|---|
| The open beat | `beat`, `snapshot`, `restore`, `saveBeat`, `onScratch`, `trying`, `putTrialAway` |
| Playing | `play({ countIn })`, `stop`, `playing`, `grid`, `beatClock` |
| Recording | `rowFor`, `addRowFor`, `addSnaps`, `setGrow`, `lockChips` |
| Click and tempo | `metronome`, `setClick`, `clickAt`, `tempo`, `setTempo`, `signature`, `setBars`, `setSignature`, `advanced` |
| Rows | `cyclePill`, `dropRow`, `clearRow`, `toggleRing`, `ringTool`, `levelState`, `levelOf`, `setLevel`, `putLevel`, `toggleMute` |
| Pick and slide | `putRows`, `paintRows`, `locked`, `lockChanged`, `addPicker` |

And back the other way, `app.js makeSequencer` wires `onHit` → `dj.flashClip`, `onSteps` → `dj.steps`, `onBeatChange` → `dj.renderGrid`, `onTempo` → `dj.showSetup`, `onStop` → `dj.beatStopped` (each only while `keysShow()`, except `onStop`).

### `app.js` wiring for the keys

| Name | What it does |
|---|---|
| `keysOn` | ⌨️ Keys on Beats; localStorage `beat-keys` |
| `keysShow()` | the keys are on screen: Live, or Beats with `keysOn` |
| `beatView()` | the sequencer's slot: `'live'`, `'dj'` or `'beats'` |
| `setScreen(name)` | `dj.leave()` when the keys were showing; stops the beat leaving Beats; `showView` |
| `showView()` | `seq.show(beatView())`, `dj.setMode`, hides `#seq` or `#dj`, `dj.render` + `dj.renderGrid`, `dj.shown(keys && !kidsShowing())` |
| `setKeys(on)` | refuses while `dj.recording()`; `dj.leave()`; `beat-keys`; `showView` |
| `startScreen` | an old `'dj'` screen becomes Live, or Beats with Keys when `dj-mode` was `'beat'` |
| `keydown` | stands down for modifiers and an open dialog; Kids first (`kidsKeydown`); not in a text field; then `dj.keydown` while `keysShow()`; Esc → `dj.escape()` before stopping everything |
| `keyup` | `kidsKeyup` while Kids shows, else `dj.keyup` while `keysShow()` (no dialog check) |
| `update.js` busy | `dj.busy()` (recording or a take playing back) and `kidsBusy()` |

`dj.personLeft` runs on a person change before it happens (`showPerson`, `startOver`); `dj.render` is also called on a person change (`showPerson`), `advancedBeats` and each instrument setting (`PLAYED`), and a new picture (`setClipEmoji`).

## 🧸 Kids (`kids.js`)

### Screens

Four tabs (`kids-logic.js KIDS_TABS`): 🔊 Pads, 🎙️ Record, 🥁 Beats, 🎹 Keys. Plus ⏹️ (`stopAll`: sounds, the beat, ●, held keys, and a mic recording, kept without playing: `stopRecording({ quiet: true })`; then `deps.stopAll` = `app.js stopEverything({ keepClicks: true })`: the whole app quiet, the grown-up's saved ⏲️ choices kept), and ⚙️ (the regular `#settings-open`, gated). The tab is remembered on the device (`kids-tab`).

| Tab | Draws | Plays by |
|---|---|---|
| Pads | `renderPads`: `kids-logic.js kidsPadOrder` (own sounds newest first, the board's other own sounds, then `KIDS_PADS` presets), cut into pages (`pageShape`, `pagesOf`) | `audio.play(clip)` every tap: no hold, no loop, no `tapPad`. Finger on the lift (`finger.js`), mouse on press. A pinch or the slider sets `padSize`; the 🎨 button sets `padSkin` |
| Record | the mic, three voices (`KIDS_VOICES`), the last sound | its own recorder (below) |
| Beats | `renderBeat`: four drums (`KIDS_DRUMS`) × eight squares, 🐢 / 🏃 | its own scheduler `playBeat` (below) |
| Keys | eight toy keys (`KIDS_KEYS`), the instrument button, ● | `audio.play(clip, { rate, id })` while held; `audio.stop(id)` on lift |

### Entering and leaving

`app.js applyKids` decides: Kids shows when `kidsVisit || (level === 'kids' && !grownUp)`. It runs on start, on `showPerson`, on `onSetting('level')`, from `enterKids` (🧸 `#kids-open`, or `[data-kids-open]` in the person menu), from Settings' 🧸 Kids (`onKids`), and from the right sum (`deps.grownUp`).

- **In:** ends Edit sounds, `dj.leave()` and `dj.shown(false)` (the keys' ⏲️ stops ticking), `seq.stop()`, `song.stop()`, `audio.stopAll()`, `dj.stopReplay()`, closes every open dialog, `body.kids`, `kids.js showKids(true)`, usage screen `'kids'`.
- **Out:** `showKids(false)` stops the tune, the beat, the recorder and held keys, and closes its sum (`closeSum('kids')`); then `showView` (the beat maker reads the kid's squares again) and `refitLines`.
- `grownUp` (a grown-up let out a Kids-level person) and `kidsVisit` (a Regular or Advanced person visiting) last until reload. The level never changes by the sum (questions.md Q63).
- A person change calls `kidsPersonLeaving` first (`showPerson`, `startOver`): the mic stops and keeps the recording as the first kid's pad, a tune recording lands its held keys in their beat, and `lastId` is forgotten (a deleted kid's are dropped). Then `refreshKids` (stops the beat, redraws).

### The grown-up gate (`grown-up.js`)

One dialog `#kids-sum`, wired on first use. `askSum({ right, wrong, stay, owner })` shows a number 12–39 plus one 6–9 (`kids-logic.js makeSum`: the answer always has two digits, 18–48, its first digit no clue); digits go through `typeDigit`. After three wrong answers in a row (`wrongs`, whoever asked, until the page reloads) each next try waits 30 s (`sumWait`, `SUM_WAIT`): the keys dim and ⏳ counts down (`showWait`); a right answer ends it. Kids asks with `owner: 'kids'` and no `stay`: a wrong answer wiggles and closes. `feedback.js` asks with `stay: true` at every level. `closeSum(owner)` closes only the asker's sum. Behind it: `settings-ui.js initSettingsUI({ gate })`, where `app.js` passes `gate: () => kidsShowing() && askGrownUp()`.

### Its recorder, beside the sound sheet's

| | `kids.js` | `sheet.js` |
|---|---|---|
| Start | tap: 3, 2, 1 (`KIDS_COUNT`, a beep each into `audio.master`), then listen until the next tap; hold: listen at once, the lift stops it (`pressKind`, `TAP_MS` 350) | tap: 3, 2, 1 (`COUNT_IN`), then listen until Stop |
| Limit | `MAX_RECORD_SECONDS` 10 (its own copy) | `MAX_RECORD_SECONDS` 10 (its own copy) |
| MIME list | `audio/webm;codecs=opus`, `audio/mp4`, `audio/webm`, `audio/ogg` | the same list, written again |
| Meter | `meter.js levelOf` → `--kids-level` | `levelOf` → the grille, plus Too loud |
| Rejects | under 0.3 s (`MIN_RECORD_SECONDS`) or silent (`audio.js trimBounds`): a wiggle | silent: a sentence; too long |
| Saves | a new clip `{id: newId('user'), personId, label, emoji: pictureFor, color, ...kidsVoiceFields(voice), blob, mime, created}` via `deps.saveClip` (`state.userClips` + `persist('clips')`) | the sheet's own save, with trim, edits, knobs |
| Voice | 🤖 🐭 👻 change the last sound at once (`tapVoice`, `audio.dropRendered`) | the sheet's voices |

### The kid's beat: a regular beat, read and written by Kids

It is the person's scratch beat (`scratch.js scratchId`, `beat-scratch-<pid>`), found with `scratchOf`. `app.js adoptKidsBeat` turns an older Kids beat (`beat-kids-…`) into it.

| Field | Kids makes it | A regular beat |
|---|---|---|
| `name` | `SCRATCH_NAME` | any |
| `bpm` | 80, 110 or 140 (`KIDS_TEMPOS`, `tempoAfter`) | 60–180 |
| `bars` | 1; 4 once a tune is recorded (`TUNE_BARS`, `withBars`) | 1, 2, 4 |
| `signature` | none (the sequencer reads it as 4/4) | `SIGNATURES` |
| `rows` | one per drum, `cleanRow({clipId, steps})`; square *i* is pill 2*i* of each 16-pill bar, set in every bar (`withSquare`) | any rows |
| tune | one `melody` row on the instrument's C, `tune: [{p, s, l}]` (`withTuneNote`) | tune rows (ADR 0023) |

Kids writes it with `deps.saveBeat` (`state.savedBeats` + `persist('beats')`). It never goes through `sequencer.js save`. A new beat is not saved until a square, a tempo or a tune changes it.

### Its own scheduler, beside `sequencer.js`

`kids.js playBeat` is a 25 ms `setInterval` booking 0.12 s ahead, straight into `audio.master` with `audio.js makeVoice`; a hit already past (`audio.js tooLate`, after a stall) is dropped, as Beats' are. It reads `kidsBeat()` from `state` on every tick, so a square or a note lands while it plays.

| | `sequencer.js schedule` | `kids.js playBeat` |
|---|---|---|
| Rows played | every row that is `audible` (mute, solo, level) | the first row of each of the four drums, and the first tune row |
| Pills a bar | `barSteps(signature)` | always `STEPS` (16) |
| Loudness | `hitGain` (row level, `ACCENT_GAIN` for loud) | full |
| 🎚️ Mixer and effects | `busFor` | none |
| Swing, row speed | `swingDelay`, `stepSeconds` | none |
| A hit over the last | `ringOver` (cut unless the row rings) | never cut |
| Tune note pitch | `noteRate(note + rootShift(root))` | `noteRate(p)` (no root) |
| Count-in | `play({ countIn })`: one bar of blips | ● only: 3 beeps (`TUNE_COUNT`), `beep(at)` |
| Playhead | `stepsHeard` with `outputDelay` | `setTimeout` per square, no latency |
| `onHit` to the keys, meter | yes | `audio.on.started()` once |

### The toy keys and ● tune

- `KIDS_KEYS`: C D E G A, then high C D E (pentatonic). A high key plays its low note at `keyRate` (2×) under its own play id (`keyPlayId`, `<clipId>+12`), so both can sound.
- The instrument button cycles `KIDS_INSTRUMENTS` and writes the person's `instNotes`, the same setting 🎹 Who plays on Notes keeps. `keyClip` finds `keyKitId(k, inst)` among `clips({ includeHidden: true, allPresets: true })`.
- Keyboard: `kidsKeydown` maps `e.key` a s d f g h j k (not `rhythm.js keyFor`); Esc or Space stops all; ← → turn pages. On a focused button Enter's repeats are taken (`initKids`, on `#kids`), so a held Enter clicks once. `.kids :focus-visible` is a dark band and a white ring.
- ● (`startTune`): grows the beat to 4 bars, books 3 beeps on the audio clock, then `playBeat({ from: t0, onPass })`; the recording stops as the beat comes round once (`onPass`), at the next ● tap, ⏹️, a tab change, or leaving. A key held during it lands on lift (`landNote`): `kids-logic.js pillAt` (nearest pill, no latency moved), length the pills held (1–16), `withTuneNote` (the first note of a new recording starts the tune again, after `keepOldTune` puts the beat with the tune it replaces in 🗂️ My beats: `kids-logic.js keptTune`, a fun name from `names.js beatName`).

### What Kids shares with the regular app

| Shared | How |
|---|---|
| People, sounds | `deps.clips` = `board.js clipsFor(state.personId, opts)` |
| Beats | the scratch beat in `state.savedBeats` |
| Settings (person scope) | `padSize` (with 🔊 Pads), `padSkin` (with ⚙️ 🎨 Look), `instNotes` (with 🎹 Who plays), `seen` (`tips.js kidsHint`, `markSeen`) |
| Sound | `audio.js` (`play`, `stop`, `stopAll`, `load`, `decode`, `wake`, `master`, `makeVoice`, `fadeStop`, `trimBounds`, `dropRendered`) |
| Helpers | `finger.js`, `grown-up.js`, `names.js soundName`, `log.js`, `play-count.js` (`'kids'`), `skins.js` |
| Pure beat rules | `sequencer.js` (`STEPS`, `noteRate`, `cleanRow`, `multiplyRows`), `notes.js` (`addNote`, `startsIn`), `voices.js`, `instruments.js` |

It shares none of `dj.js`, `pads.js`, `sheet.js`, `song.js` or the sequencer's object.

## Concepts that span files

### The open beat, seen from the keys

One open beat per person (ADR 0017), owned by `sequencer.js` (`pattern`, `doc`, `slot`). `app.js beatView` names the slot: `'beats'`, `'dj'` (a groove opens stopped) or `'live'` (none). `sequencer.js show` re-reads it from the library whenever a view shows, so a change made elsewhere (🧸 Kids' squares, a sync) appears then. Changing `slot` stops the beat.

### The scratch beat = the kid's beat

`scratch.js` ids (`beat-scratch-<pid>`). Written by `sequencer.js save` (regular app) and `kids.js` `deps.saveBeat` (Kids). `sequencer.js show` re-reads it when `scratchSaved() !== doc.seen`. 💾 Keep (`sequencer.js keep`) and 🆕 New (`newScratch`) make a fresh one.

### 🔔 Let it ring: one rule, three players

`rhythm.js ringOver` decides which earlier hits a new hit cuts. Users: `audio.js start` (Live keys, `ring`), `sequencer.js sound` (a row's `ring`; tune rows always ring), `rhythm.js planTake` (a take rendered). Kids' player does not use it.

### Hold to loop, tap to stop

`HOLD_TO_LOOP_MS` (350) in `dj.js`; the pads' own hold in `pads.js`; Kids has no loops. A tap on a looping sound stops it (`pads.js tapPad`), and a take records that as `'stop'`; held on, it stays stopped (`dj.js pointerDown`, `keydown`, and `finger.js`'s `hold: false`).

### Lift to play (`finger.js`)

`fingerTaps` is used by `pads.js`, `dj.js` and `kids.js` (Pads). Kids' toy keys do not use it: they play on press and slide.

### Count-ins

Three: `sequencer.js play({ countIn })` blips (● Record into the beat, shown by `rhythm.js countAt`); `kids.js count` (the mic, `KIDS_COUNT`); `kids.js startTune` (3 beeps, `TUNE_COUNT`). The sound sheet has a fourth (`sheet.js COUNT_IN`).

### Instruments (ADR 0030)

Defaults on the keys and the default touch layout use the groups' own sounds (`clipsFor(…, { ownSounds: true })`). Editors show the picked instrument's sounds. Kids' toy keys follow `instNotes`. `app.js` redraws the keys on each `PLAYED` setting.

### Undo

| Where | Kind |
|---|---|
| ● Record into the beat, a row removed or cleared, a pill slide, a loudness drag | `ui.js showBanner` with ↩️ Undo → `seq.restore(copy)` or `seq.putLevel` (`dj.js offerBeatUndo`, `showBeatLine`) |
| A take | the take card's ↩️ Undo deletes it |
| ✏️ Layout (both) | an in-memory stack of 30, per opening |
| A groove tried | ↩️ My beat → `seq.putTrialAway` |
| Kids | none |

### Busy (the update bar waits)

`dj.busy()` (a take or beat recording, a take playing back) and `kids.js kidsBusy()` (beat playing, recorder, tune) feed `app.js initUpdate`'s `busy`.

### Latency

Worked out in four places: `sequencer.js outputDelay`; `app.js` `deps.latency` for the keys (the same sum, written again); `app.js startUsage` (in ms, uncapped); `rhythm.js hitTime` (unused by the app).

### Names that collide

"👆 Pads" is the touch layout; "🔊 Pads" is the screen; Kids' "Pads" tab is a third. "Layout" means a key layout, a touch layout, a keyboard layout (QWERTY/Dvorak, `djLayout`), or a grid shape.

## Seams

| Seam | What a fix in one place misses |
|---|---|
| Two beat players: `sequencer.js schedule` and `kids.js playBeat` | Kids ignores mute, solo, level, accents, mixer, swing, row speed, signature, `ringOver` and a tune sound's `root`. A grown-up's 3/4 or Advanced change to the scratch plays differently in Kids. |
| Two snap rules: `rhythm.js createSnapper` (keys) and `kids-logic.js pillAt` (Kids' tune) | Kids has no latency shift, no double-tap filter, no one-hit-per-pill, no tempo-change safety. |
| Two recorders: `sheet.js` and `kids.js` | MIME list, 10 s cap and the 3-2-1 count are copied, not shared. |
| Two keyboard mappings: `rhythm.js keyFor` (layout-aware) and `kids.js kidsKeydown` (`e.key` letters) | Kids' keys follow neither Dvorak nor the `djLayout` pick. |
| The beat drawn twice: `sequencer.js render` (Beats' rows) and `dj.js renderGrid` (the keys' grid) | A pill's look or a row control must change in both (they share `beat-row.js`, `row-volume.js`, `pill-select.js`). |
| Two ✏️ Layout editors: `dj-keys.js` and `dj-touch.js` | Save line, rename, delete-asks-twice, undo stack, drag-with-hold (`DRAG_PX`, `HOLD_MS`, `SLOP_PX`) are written twice. |
| Two ⏲️ wishes: `dj-click` and `beat-click`, joined by `seq.setClick` | A click change must keep the override rule. `stop-clicks.test.mjs` guards Stop all. |
| `keyset.js keepAsMine` and `touch.js keepAsMine` | The same idea, two modules. |
| Loop glow goes through `pads.js` | `audio.on.looping` is owned by `pads.js initPads`, which forwards to `dj.looping` through a hook `app.js` passes in. |
| Latency in four places (above) | A change to one leaves the others. |
| Dead exports kept for tests | `rhythm.js hitTime`, `applySnaps`, `countInBeats`, `snapHits`; `kids-logic.js squareSeconds`; `touch-grid.js emptyBlock`, `swapBlocks`. The app uses none of them. |
| Kids writes the scratch behind the beat maker's back | `sequencer.js` re-reads only in `show()`, so every way out of Kids must end in `showView` (`applyKids` does). |
| Deletes skip `persist` | `app.js` `deleteTake`, `deleteLayout`, `deleteTouchLayout` call `db.remove` and only log a failure; `beatLibrary.remove` shows a notice. `adoptKidsBeat` writes with `db.batch`. |

## Invariants and gotchas

| Rule | Guarded by |
|---|---|
| A deck stores only keys that differ from `defaultDeck`; the defaults must not move when an instrument is picked (hence `ownSounds: true`) | `keyset.test.mjs` (changedKeys), `inst-everywhere.test.mjs` |
| `defaultDeck` never uses an Advanced-only preset | `rhythm.test.mjs` |
| A touch layout with a grid keeps `bands` in block reading order (`settle`); every edit returns a settled layout | `touch-grid.test.mjs` |
| Every `touch.js` and `keyset.js` change returns a new object and never changes its input | `touch.test.mjs`, `keyset.test.mjs` |
| A hit is snapped once, on the clock of its moment | `beat-builder.test.mjs`, `rhythm.test.mjs` |
| `stopBeatRec` clears `beatRec` before `seq.stop()`, since stopping calls `dj.beatStopped` | `beat-rec-stop.test.mjs` |
| A beat stopped from outside ends the recording | `beat-rec-stop.test.mjs` |
| While recording, a new sound takes an empty row first, never one already used this recording | `rec-empty-rows.test.mjs` |
| `showRec` runs every 40 ms and writes only what changed (`putText`, `putAttr`): rewriting labels re-ran tooltips and held the playhead up | `keys-playhead.test.mjs` |
| A finger plays on the lift; a scroll or cancel plays nothing | `finger.test.mjs`, `touch-play.test.mjs` |
| Every element `app.js` hands `createDJ` is read, and every method `dj.js` returns is called | `dj-wiring.test.mjs` |
| A key's or a 👆 tile's play counts once for usage, as `'keys'` (`tapPad`'s `kind`); a Shift loop counts its one play; a tap that stops a loop counts nothing (a pad's Shift loop, `pads.js`, counts nothing at all) | `play-count-app.test.mjs` |
| A take ends, kept, when the keys leave the screen or Kids shows (`dj.leave`), or the page is hidden | `live-take-leave.test.mjs`, `take-hidden.test.mjs` |
| ⏹️ Stop all and 🧸 Kids stop a take playing back, its hits still to come too | `take-stop-all.test.mjs` |
| A change of person leaves nothing of the first person's live (`dj.personLeft`, from `app.js showPerson` and `startOver`, before the person changes): a take or a recording into the beat ends as theirs. Deleting the kid on show lets go at the grown-up's tap (`people.js deleteHere` → `app.js letGoOf`, before its awaits), keeping nothing of theirs; a take playing back stops, the take card and the beat's ↩️ Undo go; a take taken out whose ↩️ Undo banner is still up (`takenOut`) goes back quietly as theirs before its banner goes (for a deleted kid it stays gone) | `keys-person-change.test.mjs`, `keys-person-deleted.test.mjs`, `take-out-person.test.mjs` |
| The keys' ⏲️ never ticks over 🧸 Kids; out of Kids it ticks again | `kids-click-off.test.mjs` |
| A held key loops only on OS repeat past 350 ms; a press that stopped a loop never loops it again, held by key, mouse or finger; lifting a modifier forgets all holds | `keys-stop-hold.test.mjs` (repeats and the mouse; the modifier: no test found) |
| Every remembered key (`dj-input`, `dj-size`, `dj-click`, `beat-keys`, `kids-tab`) starts the app safely | `startup-remembered.test.mjs` |
| A take's `ring` is stored only when true, only on a hit | `overlap.test.mjs`, `rhythm.test.mjs` |
| Leaving Kids shows the beat maker again, so it holds the kid's squares, never an older copy to save over them | `kids-scratch-back.test.mjs` |
| A Kids recording is kept as the kid's who was recording (never for a kid deleted meanwhile: `deps.isPerson`, and `letGoOf` drops one listening), named, pictured and colored among their sounds, even if the person changes before it is kept (`listen` → `keep(…, { pid })`); a tune recording lands in their beat (`tuneRec.pid`); nothing of theirs shows for the next kid | `kids-mic-person.test.mjs`, `kids-person-change.test.mjs`, `kids-person-deleted.test.mjs` |
| Nothing of the grown-up app sounds in Kids (the keys' ⏲️, a take playing back, the beat, the song, a loop), on the way in and at start-up; Kids' ⏹️ quiets the whole app and keeps the grown-up's ⏲️ choices (one tick already booked as Kids shows, up to 0.1 s, still sounds) | `kids-quiet.test.mjs`, `kids-quiet-start.test.mjs` |
| A held Enter on a Kids button clicks it once; a finger's tap and its click play a pad once | `kids-keyboard-repeat.test.mjs` |
| Kids' square *i* is pill 2*i* of a 16-pill bar, in every bar | `kids.test.mjs` |
| Kids' keys mean `instNotes` changes for the whole person | `kids.test.mjs` (🎹 instrument button) |
| `kids-logic.js` stays importable in Node; it imports `sequencer.js`, so that module must stay importable too | every Kids unit test |
| `kidsHint` shows only at level Kids: a Regular person on a 🧸 visit gets no 👆 hand or mic wiggle | `kids-hints.test.mjs` ("Regular and Advanced never get the hand") |
| The page's keydown stands down behind any open dialog, so the grown-up sum gets no toy-key presses | no test found |

More gotchas:
- `seq.tempo()` on Live is `LOOSE`, never saved; tap tempo there does not touch any beat.
- `dj.js deck()` is called many times per key press; it runs `clipsFor` each time.
- The keys editor gets `...deps`, so `deps.layouts` there is key layouts; the touch editor's `deps.layouts` is touch layouts.
- `fake-dom.mjs` has no layout: `fitPads` and Kids' `boxSize` fall back to fixed sizes in tests.

## To change X, touch …

| Change | Touch |
|---|---|
| A default key | `rhythm.js` `NUMBER_ROW`/`HOME_ROW`/`BOTTOM_ROW`/`VOICE_FILL`; `rhythm.test.mjs`. Stored decks keep only changed keys, so existing kids' keys move too. |
| A new field on the deck | `rhythm.js cleanDeck`, `app.js` `deps.saveDeck` (keeps fields), `merge.js` `keepMine('decks')` (clip ids renamed), `store.js` comment, `state.js` comment, `backup.js` notes. |
| A new take event kind | `rhythm.js TAKE_KINDS`, `takeFrom`, `planTake`, `cleanTake`; `dj.js playTake`; `merge.js` (takes' clip ids). |
| A ready-made key layout | `keyset.js READY_LAYOUTS` (kit ids, 4 × 10); `keyset.test.mjs` checks every id is real. |
| A ready-made touch layout or grid | `touch.js READY_TOUCH` / `STARTERS`; `touch-grid.js READY_GRIDS`. |
| The snap | `rhythm.js createSnapper` (and `snapHits` for tests); `beat-builder.test.mjs`, `rhythm.test.mjs`. Kids' tune snap is `kids-logic.js pillAt`, separate. |
| How the beat grows | `dj.js growNow` (when), `sequencer.js scheduleClicks`/`grow` (how). |
| A new control on the keys panel | `index.html`, the `el` map in `app.js start`'s `createDJ` call, `dj.js`, `help.js` line, `tooltips.js` via `aria-label`. |
| A new sequencer feature the keys must follow | `sequencer.js` returned object, `dj.js renderGrid`/`intoBeat`, and Beats' own `render`. Check whether Kids should follow too (`kids.js playBeat`). |
| How a beat plays everywhere | `sequencer.js` (Beats, keys, Song, previews) **and** `kids.js playBeat`. |
| A Kids tab or screen | `kids-logic.js KIDS_TABS`, `kids.js setTab`/`render`/`initKids`, `index.html` `[data-kids-view]`. |
| The grown-up sum | `grown-up.js`, `kids-logic.js makeSum`; two askers (`kids.js`, `feedback.js`). |
| Who sees Kids | `app.js applyKids`, `enterKids`, `grownUp`/`kidsVisit`; `settings.js` `level`. |
| A recorder fix | `kids.js` (`listen`, `keep`) and `sheet.js` (`startRecording`, `acceptAudio`). |

## ✅ Checked by tests

The claims above marked as checked are tests in `tests/architecture.test.mjs`. When one fails, change this file and the test in the same commit as the code.
