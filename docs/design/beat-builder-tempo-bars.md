# Beat Builder: tempo, growing bars and tap tempo (design)

**Status:** built as Option A (2026-10-11; Ben answered Q1–Q5 with the recommended A; small calls provisional in questions.md Q46). Written 2026-10-11 for `TODO.md` "Agents do" → "Beat Builder: change the tempo and add bars, from the click track". It works within [decisions.md](../decisions.md) (Beat maker and DJ rows), [ADR 0004](../adr/0004-learn-music-by-doing.md) and [dj-mode.md](dj-mode.md). The questions for Ben are in § 7.

**In short.** Ben asked for four things in Beat Builder: (a) tempo before recording, (b) tempo after recording, (c) bars that grow while recording, (d) tap tempo on the click track button. Two of them partly exist already. (a) is built: ⌄ 100 BPM ⌃ sits beside ● Record. (b) is true once you stop: a beat's hits are stored as pills, not seconds, so any tempo change keeps them in time. What is new is changing the tempo *while* the beat goes round, growing bars, and tap tempo. The recommended layout (Option A) adds **no new buttons**. It removes one: the click track's second tempo control, which duplicates the one by Record today. About 9 hours to build.

## 1. How the beat plays (plain words)

There is no mixer in the usual sense. A beat is a grid.

- Each **row** is one sound. Each **pill** in a row is one sixteenth of a beat, so a bar of 4/4 has 16 pills. A row stores which pills are on as a list of true/false (`row.steps`, `web/sequencer.js:78`), plus which are loud (`accents`).
- The **tempo** (`pattern.bpm`) only says how fast the playhead walks across the pills: one pill lasts `60 / bpm / 4` seconds (`stepSeconds`, `sequencer.js:114`). At 100 BPM a pill is 0.15 s.
- **Playing:** every 25 ms a timer looks 100 ms ahead and books each pill due in that window on the Web Audio clock, at its exact time (`schedule`, `sequencer.js:741`). Each row keeps its own clock (`{next, step}`). It re-reads the pill length on every step, so a tempo change while playing lands at once.
- **Mixing:** each booked hit starts the row's sound at that time, into the master output. A limiter there stops a pile-up from clipping. A row's earlier hit is faded out unless the row "rings". That is all the mixing there is.
- **Recording in Beat Builder:** a tap's time is read on the audio clock, minus the speaker delay. Then it is **snapped to the nearest pill** (`snapHits`, `web/rhythm.js:109`): late or early taps land on the closest pill, a quick double tap counts once, and a tap just before the "1" lands on the "1". The pill turns on in the beat (`addSnaps`, `sequencer.js:1942`). Hits are never stored in seconds.

So **hits live in beats, not seconds.** That is why (b) already works after Stop. It is also why the tempo is locked *during* recording: the snapping maths measures time from the moment the beat started (`t0`), assuming one tempo the whole way.

## 2. What Beat Builder shows today at 375 px

Checked with `just look builder-beat` at 320, 375 and 1100 px (no sideways scroll, no errors).

| # | What | Where | While recording |
|---|---|---|---|
| 1 | 🎤 Freestyle · 🥁 Beat Builder switch, above the panel | `web/index.html:138` | Locked (`web/dj.js:939`) |
| 2 | Name bar: 🥁 name ✏️, then 🆕 New · 📂 Open on their own line | `index.html:143` | Shown |
| 3 | `● Record` | `index.html:151` | Becomes `■ Stop` (`dj.js:408`) |
| 4 | Tempo: ⌄ 100 BPM ⌃ (a slider from 15 rem wide up, chevrons below that) | `index.html:153`, `.tempo-box` in `web/styles.css:1896` | Shown, **dimmed and locked** (`dj.js:891`, `dj.js:893`, `dj.js:917`) |
| 5 | Bars: `1 bar · 2 bars · 4 bars`, filling the second line | `index.html:160` | **Hidden** (`dj.js:896`) |
| 6 | Time signature (Advanced only), beside the bars | `index.html:165` | **Hidden** (`dj.js:898`) |
| 7 | The grid: per row ✕, emoji, then every pill of every bar on one line | `index.html:190`, `renderGrid` `dj.js:693` | ✕ invisible (room kept, `dj.js:720`); emoji locked (`dj.js:729`) |
| 8 | Count-in disc over the keys (1 2 3 4, GO!) | `index.html:191`, `dj.js:392` | Count-in only |
| 9 | Row tabs, then 2 × 5 key pads | `index.html:192`, `index.html:197` | Shown |
| 10 | Legend, ✏️ Edit keys | `index.html:210`, `index.html:206` | Shown |
| 11 | `⏲️ Click track`, bottom right, with **its own** ⌄ 100 BPM ⌃ to its left while on | `index.html:212`, `index.html:218` | Shown; the toggle works (`dj.js:948`) |

Two things to notice:

- **The tempo shows twice** at 375 px when the click track is on: once by Record, once by ⏲️. Both change the same number (`seq.setTempo`).
- At 375 × 667 the ⏲️ button sits below the keys, about 815 px down. It is out of sight until the kid scrolls.

## 3. How each of (a)–(d) works under the hood

### (a) Tempo before recording: built

The slider or chevrons call `seq.setTempo` (`dj.js:915`, `dj.js:928`). That changes the open beat's `bpm` and saves it. What is left:

- Remove the duplicate (§ 2): in Beat Builder the click track shows no tempo of its own.
- Optional: tap the number to type a tempo, as on Beats (`sequencer.js` `bpmOut` click). This is about 20 minutes, reusing `typedBpm`.

### (b) Tempo after recording: built after Stop; new while it goes round

- **After Stop:** works today. The pills don't move; they just play faster or slower. Loops on pads re-sync through `onTempo` (`web/app.js:365`).
- **While recording** (the beat keeps going round until Stop, so "after recording" may mean "after the first pass"): this needs two changes. Playback itself already copes.
  1. **Re-anchor the clock.** Snapping computes `pill = (t − t0) / pillLength`. After a tempo change that is wrong for every later tap. The fix: when the tempo changes while playing, move `t0` to where pill 0 *would* have started at the new tempo. Then `t0 + n × pillLength` points at the right time again. The anchor is the playing row clock's next pill: `t0 = clock.next − n_next × newPill`. `addSnaps`' "don't play it twice" times (`sequencer.js:1949`) use the same `t0`, so they come right too.
  2. **Snap each tap once.** Today every tap re-snaps *all* taps so far (`dj.js:683`). After a re-anchor, old taps would land on new pills and add stray hits. Instead, snap each tap once, as it arrives, and keep the double-tap and one-per-pill memory between taps (a small stateful `createSnapper()` in `rhythm.js`, same rules, same tests).
- The **count-in stays locked**: its clicks are already booked.
- **Quantization doesn't change.** A tap still lands on the nearest pill at the tempo playing when it was tapped.

### (c) Bars that grow while recording

Ben said earlier that bars can't change once recording starts, "presuming it can't be changed after that". It can. What it needs:

- **Storage.** `bars` must be 1, 2 or 4 (`BAR_CHOICES`, `sequencer.js:28`; `cleanPattern` turns anything else into 1, `sequencer.js:102`). A row holds up to 80 pills: 4 bars of the longest bar, 5/4 (`MAX_PILLS`, `sequencer.js:29`). Growing by doubling (1 → 2 → 4) needs no format change. Growing one bar at a time needs 3 bars allowed: `cleanPattern`, a Beats bars key, and an ADR (an older copy of the app reads a 3-bar beat as 1 bar, though its pills survive). Going past 4 bars also raises `MAX_PILLS`.
- **The wrap.** A row's clock wraps with `clock.step = (step + 1) % total`, booked 100 ms ahead (`sequencer.js:757`). Because it re-reads `total` every step, raising `bars` before the wrap is booked makes the playhead carry on into the new bar. The decision must therefore be made **one beat before the end** (0.33 s at 180 BPM, plenty of margin). A small hook in `schedule` asks Beat Builder "grow?" when the playhead enters the last beat of the beat.
- **Old hidden pills.** `setBars` keeps pills in bars that are no longer shown (`sequencer.js:1880`), so going from 4 bars back to 1 loses nothing. A grown bar must first clear those leftovers (or copy over them), or old hits would come back unasked.
- **Snapping.** `snapHits` wraps a tap's pill by `total` (`rhythm.js:126`). With `total` changing, the once-per-tap snapper from (b) is needed here too: it records each tap's pill with the `total` of that moment.
- **The click keeps counting.** The click is booked per beat, not per bar (`scheduleClicks`, `sequencer.js:716`), so it carries on across a new bar by itself.
- **Undo** already restores the copy taken at Record, bars included (`restore`, `sequencer.js:1957`).
- **When it grows** is a rule a kid has to feel. Recommended (Q3): **only on the first pass, while you keep playing.** If any tap landed in the last bar on this pass, a bar is added. If a whole last bar goes by with no tap, or the limit is reached, the beat goes round and overdubs as today. Said as a kid hears it: "Keep playing and the beat gets longer. Rest for a bar and it goes round."
- **What the kid sees:** the grid extends. While growing is still possible, a dashed empty bar (`┊+┊`) sits after the last bar. When a bar is added, it fills in as a real bar and the pills shift to make room. The status line says "Bar 2 · keeps growing to 4". At the limit the dashed bar goes.

### (d) Tap tempo on ⏲️

- **Gesture, with no conflict with today's toggle:** one tap toggles the click as now, and so do two taps (off, then on again). A **third tap in a row**, each less than 1.5 s after the last, makes it a tempo tap. The tempo is set from the taps, and the click ends **on** at the new tempo. Every later tap in the run refines it.
- **The maths** (pure, `tapTempo(times, groupPills)` in `rhythm.js`): take the last up to 5 taps. Use the median gap. Start again after a gap over 1.5 s. Ignore gaps under 0.25 s. `bpm = 15 × groupPills / gap`, so a tap is one click: a quarter note in 4/4, 3/4 and 5/4, and a dotted quarter in 6/8. Clamp the result to 60–180 BPM. Recommended: snap it to a common tempo (`COMMON_BPMS`) when within 2 BPM, as the slider pulls toward them (decisions.md row "The tempo slider pulls…"). Provisional, not asked.
- **Feedback:** during a run the button reads `👆 96` and the tempo number by Record changes on each tap. The click's next tick lines up with the last tap plus one gap, so it carries on in the kid's own time.
- **While recording:** tap tempo works only if Q1 allows tempo changes while recording. Otherwise the button just toggles.
- **How a kid finds it:**
  1. The footer how-to for Beat Builder: "Tap ⏲️ in time to set the speed."
  2. A ❓ Help line (`web/help.js:151`).
  3. The button's label: "Click track. Tap it in time to set the tempo."
  4. A hint: when the click is toggled twice inside 1.5 s, the button shows "keep tapping…" for a moment.

  No popup ([ADR 0004](../adr/0004-learn-music-by-doing.md): show, don't name).
- The same gesture works in Freestyle, where the click track also sets the open Beat Builder beat's tempo.

## 4. Two layouts at 375 px

Both reuse the existing tempo box (`.tempo-box`: slider, then ⌄ ⌃ chevrons when short of room) and `lines.js` for what gives way. Neither adds a new button.

### Option A: tempo stays by Record; ⏲️ gains tap (recommended)

Ready (beat stopped):

```
┌ 375 ──────────────────────────────────┐
│ [🎤 Freestyle]     [🥁 Beat Builder]  │
│┌─────────────────────────────────────┐│
││ 🥁 Mighty Lasagna              [✏️] ││  name bar (as today)
││ [🆕 New]            [📂 Open]       ││
│├─────────────────────────────────────┤│
││ [● Record]      [⌄]  100  [⌃]       ││  tempo (as today)
││                      BPM            ││
││ [ 1 bar ][ 2 bars ][ 4 bars ]       ││  bars (as today)
│├═════════════════════════════════════┤│
││ ✕🦶 ▮▯▯▯▮▯▯▯▮▯▯▯▮▯▯▯                ││  grid
││ [🗣️😎🎧] [🦶🥁🎩] [🐘🐋🐻]            ││
││ [Kick][Snare][Hat][Clap][Open]      ││  keys
││ [LTom][HTom][Crash][Rim][Shkr]      ││
││ ● voices ● drums ● tunes ● effects  ││
││ [        ✏️ Edit keys          ]    ││
││                   [⏲️ Click track]  ││  tap 3× in time → tempo;
│└─────────────────────────────────────┘│  no second tempo here
```

Recording, growing:

```
││ [■ Stop]        [⌄]  100  [⌃]       ││  live if Q1 = A, else dimmed
││ Bar 2 · keeps growing to 4          ││  status takes the bars' line
│├═════════════════════════════════════┤│
││ 🦶 ▮▯▯▯▮▯▯▯▮▯▯▯▮▯▯▯│▮▯▯▯▮▯▯▯▯▯▯▯▯▯▯▯┊+┊││  bar 2 filling; ┊+┊ = room to grow
││ 👏 ▯▯▯▯▮▯▯▯▯▯▯▯▮▯▯▯│▯▯▯▯▮▯▯▯▯▯▯▯▯▯▯▯┊ ┊││
```

- **Changes:** in Beat Builder the click track's own tempo goes (Freestyle keeps it). Tap tempo on ⏲️. While recording, the bars' line shows the growth status (`dj-status` moves there). The grid shows the dashed bar. The tempo stays live while recording if Q1 allows it.
- **For:** nothing moves; the duplicate tempo goes; it keeps the decision "tempo − / + beside ● Record".
- **Against:** ⏲️ is below the keys, out of sight on a short phone. A kid tapping it sees the tempo change by its label (`👆 96`), not the number by Record.

### Option B: tempo and ⏲️ together on the deck

```
││ [● Record]      [⌄]  100  [⌃]       ││
││                      BPM            ││
││ [1 bar][2 bars][4 bars]      [⏲️]   ││  ⏲️ joins the bars' line
│├═════════════════════════════════════┤│
││ ...grid, keys...                    ││
││ ● voices ● drums ● tunes ● effects  ││
││ [        ✏️ Edit keys          ]    ││  the bottom ⏲️ row is gone
```

Freestyle, same place: `[● Record] … [🎬 Takes]`, then `[⌄ 100 ⌃]` (room kept while the click is off) `[⏲️]`.

- **Changes:** ⏲️ moves from the bottom right to the deck in both DJ modes, at the end of the bars' line (Freestyle: its own line). This replaces the decision "in DJ mode it sits at the bottom right, opposite the key colors". The bottom loses a line.
- **For:** "from the click track", as Ben put it: the tap button sits right under the number it changes, at the top, always in view. The panel is one line shorter on phones.
- **Against:** it reverses a decision made today. Freestyle's deck grows a line. About 1.5 h more.

### Narrow (320 px) and wide (1100, 1920 px)

| Width | Option A | Option B |
|---|---|---|
| 320 | As 375. The tempo is already chevrons. The grid's bars go to about 2 px pills at 4 bars, so the dashed bar is dropped below 360 px; the status line still says "Bar 2". | Bars' line: `lines.js` steps go `1 2 4 bars` (short labels, as today), then ⏲️ shows its emoji only (it is emoji only already on Beats). ⏲️ keeps 44 px. |
| 1100 | One deck line: `[● Record] [──●── 100 BPM] [1 bar · 2 bars · 4 bars]`. ⏲️ bottom right, with no slider beside it in Beat Builder. Grid pills about 14 px at 4 bars. | `[● Record] [──●── 100 BPM] [1 · 2 · 4 bars] [⏲️ Click track]` on one line. Nothing at the bottom right but the legend and ✏️ Edit keys. |
| 1920 | From 1400 px Beat Builder splits: the deck and grid on one side, the keys on the other (`styles.css`, Q25). The grid gets its own column, so 4 bars of pills are about 12 px and the dashed bar reads clearly. Otherwise as 1100. | As Option A, with ⏲️ at the end of the deck line. |

## 5. Recommendation

**Option A.** It covers all four requests with no new buttons, and it removes the duplicated tempo. Each piece is useful alone, so they can land one commit at a time:

1. Remove the duplicate tempo, and add tap tempo. These are the quickest and most visible.
2. The once-per-tap snapper. It is pure and tested, and both later steps need it.
3. Tempo live while recording (if Q1 = A).
4. Growing bars.

If Ben wants "from the click track" to mean the click and the tempo sit together, take Option B. It is the same build plus about 1.5 h.

## 6. Build estimate

| Item | What | Hours |
|---|---|---|
| (a) | Beat Builder drops the click track's own tempo; tap the number to type a tempo; Help and footer lines | 0.75 |
| (d) | `tapTempo()` plus tests; the ⏲️ gesture, its `👆 96` label and the click lining up with the taps; the "keep tapping…" hint; Help and footer | 2 |
| shared | `createSnapper()` in `rhythm.js` (each tap snapped once, same rules), with the § 4 examples of dj-mode.md as tests; Beat Builder switched to it | 1.5 |
| (b) | Re-anchor `t0` on a tempo change while playing; unlock the tempo while recording (not during the count-in); a test that a tap after a change lands on the right pill | 1.5 |
| (c) | Grow-ahead hook in `schedule`; clear left-over hidden pills; growth rule; dashed bar and status; Undo check; `just look` at all widths | 3.5 |
| | **Option A total** | **≈ 9.25** |
| | Option B extra: move ⏲️ in both modes, `lines.js` steps, decisions and Help updated | +1.5 |
| | Q2 = B or C (3 bars, or up to 8): `cleanPattern`, Beats bars keys, `MAX_PILLS`, ADR | +1.5 |

Things that cannot be tested here and need a hand check on a phone: whether growing feels fair at 80 and 140 BPM, and whether tap tempo lands where a kid expects.

## 7. Questions for Ben

Recommended answer first.

**Q1. Can the tempo change while Beat Builder is recording?**
- **A. Yes, once the count-in is over.** Hits already in stay in their pills, and new taps land at the new speed. Tap tempo works mid-take too. (+1.5 h)
- B. No, as today: the tempo changes after ■ Stop.

**Q2. When a beat grows, what is added?**
- **A. It doubles, 1 → 2 → 4 bars, and the new bars start as a copy of what is there** (like a looper's "multiply"). The groove keeps playing while you add to it. No format change.
- B. One empty bar at a time, up to 4 (so 3 bars becomes possible; a format change).
- C. One empty bar at a time, up to 8 (a bigger format change; a crowded grid on phones).

**Q3. When does it grow?**
- **A. First pass only, while you keep playing.** A tap in the last bar adds a bar; a bar with no taps makes it go round and overdub, as today.
- B. Only when the kid picks a new `➕` key on the bars' line before Record (one more key, ≤ 5 in all).
- C. On any pass where a tap lands in the last bar. Overdubbing a 1-bar beat would then always grow it.

**Q4. The tap tempo gesture on ⏲️?**
- **A. Three or more quick taps in time.** One or two taps toggle as now; the third sets the tempo and leaves the click on.
- B. Hold ⏲️ to start "tap the beat", then tap.
- C. A separate `👆 Tap` key beside the tempo (new chrome).

**Q5. Where do the tempo and ⏲️ sit?**
- **A. Option A:** the tempo stays by Record; ⏲️ stays bottom right and loses its own tempo in Beat Builder.
- B. Option B: ⏲️ moves up onto the deck in both DJ modes, beside the tempo (replaces today's "bottom right" decision).
