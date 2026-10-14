# Sound design: making and shaping sounds, learned by doing

**Status:** design; Ben answered its questions (§7). Build plan steps 0 to 13 are built: render timings, the wave, Hold: before, voice chains, + Then add and 🎲, recording helpers, stretch in a Worker, the live steps engine, Shape it, ⤢ open a voice, ✨ Make one, 🎵 Find its note and Tune, ➕ Mix with, and chop names with chop and trim (`chop.js`, `cuts.js`, the `trim` and `from` fields), and the wave editor (fade handles and part edits: the `edits` and `fade` fields, §4). Echo's **🥁 On the beat** is built too: its gap becomes a note length (1/16 to 1/2) at the open beat's tempo, kept on the step. Rules in [decisions.md](../decisions.md) and [ADR 0004](../adr/0004-learn-music-by-doing.md) still win.

**In short.** The sound sheet grows the way the beat maker did. A 10-year-old still taps Record, then a voice, and it sounds good. New in simple mode: they **see** their sound as a wave, can **hear the before** at any time, can **stack** two or three voices, and can **make a sound from nothing** (a laser, a boom). Behind the Advanced switch, a 14-year-old finds what producers use: an effect chain they build step by step, sliders they hear change while they drag, each voice opened up into its parts, a sound's musical note, and two sounds mixed into one. The original recording is never changed.

Contents: [1 Learning arc](#1-the-learning-arc) · [2 Toolkit](#2-the-toolkit-ranked) · [3 Screens](#3-screens) · [4 Data](#4-data-and-storage) · [5 Phones](#5-performance-on-phones) · [6 Build plan](#6-build-plan) · [7 Answers](#7-bens-answers-2026-10-10)

---

## 1. The learning arc

A producer teaching their kid does not explain filters. They hand over a knob and say "turn it". The arc below is what a kid does, in the order they find it. Each step is visible only once the one before it makes sense.

| Stage | What the kid does | What they come to know, without the words |
|---|---|---|
| 1. First go (10 yrs) | Record "hello", tap Chipmunk. Hear it. | A sound can be changed after it is made. |
| 2. Looking | Watch the wave light up as it plays. Notice the flat part before they spoke. | Sound has a shape; loud is tall, quiet is flat; silence takes time. |
| 3. Comparing | Hold **Before** to hear the plain recording, let go for the voice. | Listening back and forth is how you judge a change (A/B). |
| 4. Stacking | Chipmunk, **then** Stadium. Then swap the order. | Effects chain, and order matters (echo then fast is not fast then echo). |
| 5. Accidents | Tap 🎲 until something weird and good comes up. Keep it. | Happy accidents are a real way to make sounds. |
| 6. From nothing | ✨ Make one → Laser, Boom, Tss. | Drum sounds are made, not found: a boom is a falling tone, a hi-hat is a short hiss. |
| 7. Opening the box (12+, Advanced) | Open Stadium and find it is "Echo + Big room". Change the room. | Presets are just chains of simple parts. |
| 8. Shaping by ear (Advanced) | Drag **Muffled ↔ Bright** and hear it move live. Add a fade-in so a sound swells. | Filters, envelopes, space: the core of sound design. |
| 9. Musical sounds (Advanced) | **Find its note**: "your burp is a G". Use it in a melody row. | Every pitched sound has a note; tuning makes sounds fit a tune. |
| 10. Building kits (Advanced) | Mix a boom with a clap into one new hit. Chop a sentence into pads. | Layering and sampling: how producers make their own drum kits. |

**How the UI reveals it.** Simple mode adds three small things to today's sheet (the wave, Before, Then add / 🎲) and one new way to start (✨ Make one). Everything from stage 7 on sits behind the Advanced switch (one switch: [answers](#7-bens-answers-2026-10-10)). No tutorials: the labels say what happens ("Make it echo", "Muffled ↔ Bright", "Fade in").

---

## 2. The toolkit, ranked

Ranked by learning value per hour of build. "Simple" means everyone sees it; "Advanced" means only with the switch on. Hours are for one agent, including tests and the 5-width browser check.

| # | Tool | What the kid does | What they hear / see | What it teaches | Where | Build |
|---|---|---|---|---|---|---|
| 1 | **The wave** | Nothing: it is just there, above the voices | Their sound drawn as a wave; a line sweeps across while it plays; it redraws when the voice changes | Sound has a shape and a length; effects change the shape (Slow stretches it, Stadium adds a tail) | Simple | 1.5 h |
| 2 | **Before** (hold to hear) | Hold the button | The plain recording; let go → the voiced one | A/B listening | Simple | 0.5 h |
| 3 | **Then add** (stack up to 3 voices) | After picking a voice, tap **+ Then add** and pick another | "Chipmunk → Stadium"; the wave shows both | Chains, and that order changes the result | Simple | 2.5 h |
| 4 | **🎲 Surprise me** | Tap it | A random stack of 1 to 3 voices, from ranges that sound good | Exploring; keeping a happy accident | Simple | 0.5 h |
| 5 | **Recording helpers** | Tap Record | A 3-2-1 count before it listens; the grille goes red if it is too loud; after: "That was very quiet — move closer" | Mic technique: distance, level | Simple | 1 h |
| 6 | **✨ Make one** (sounds from nothing) | Pick a starter: Laser, Boom, Tss, Clap, Siren, Coin, Wind; or 🎲 | A new sound with no microphone | Where drum and game sounds come from | Starters simple; knobs advanced | 4 h |
| 7 | **Live sliders** | Drag a slider | The sound loops and changes **while** they drag | Cause and effect, by ear, in real time | Both (every slider that can be live) | 3 h |
| 8 | **Shape it** (the step editor) | Add steps from a palette, drag to reorder, remove | A list of steps, each with an emoji, a name and one or two sliders | Effect chains; each building block on its own | Advanced | 4 h UI + 3 h steps |
| 9 | **Open a voice** | Tap ⤢ on a voice in the chain | Stadium becomes "🔁 Echo + 🏛️ Big room", now editable | Presets are recipes | Advanced | 2 h |
| 10 | **Find its note** | Tap it | "Sounds like G". A **Tune** slider moves it by notes | Pitch and tuning; makes melody rows play in tune | Advanced | 2 h |
| 11 | **Mix with another sound** | Pick a second pad, slide where it starts, set the balance | One new pad made of both | Layering | Advanced | 3 h |

The steps in **Shape it** (#8). Each says what happens; the producer word is only in this table, for us.

| Step | Label a kid sees | Sliders | Producer term | Live while dragging? |
|---|---|---|---|---|
| Higher / Lower | 🎚️ Higher or lower | How much (in notes when Advanced); Keep length on/off | Pitch shift (tape, or stretch + resample) | No (renders; provisional, `questions.md` Q4) |
| Faster / Slower | ⏩ Faster or slower, same voice | How much | Time stretch (WSOLA, already built) | No (renders) |
| Muffled ↔ Bright | 🧣 Muffled ↔ Bright | One slider, centre is plain | Low-pass / high-pass filter | Yes |
| Echo | 🔁 Make it echo | How many echoes; How far apart (with **On the beat** when a beat is set) | Delay, feedback, tempo sync | Yes |
| Room | 🏛️ Room size | Small room → cave | Reverb (convolver with generated tail) | Yes |
| Crunch | 🔥 Crunch | How much | Distortion | Yes |
| Wobble | 🌊 Wobble | How fast; How much | Vibrato / tremolo | Yes |
| Robot | 🤖 Robot | How metal | Ring modulation | Yes |
| Squash | 📢 Louder everywhere | How much | Compression (the Loud voice) | Yes |
| Fade | 📐 Fade in / fade out | Fade in, Fade out (sliders; handles on the wave later) | Envelope (attack, release) | No (renders in milliseconds; Q4) |
| Backwards | 🔄 Backwards | none | Reverse (echo then backwards is the classic "reverse echo") | No (renders) |
| Stutter | 🔂 Stutter | How many repeats | Retrigger | No (renders) |

**Turned down, with reasons.**

| Idea | Why not |
|---|---|
| Hearing your voice through effects while you speak | Phone speakers feed back into the mic, and Android adds 100 ms or more of delay. It would sound broken, which breaks rule 1 of ADR 0004. |
| A frequency picture (spectrum) | Little to learn per hour for a 10-year-old; Muffled ↔ Bright teaches the same by ear. Revisit later. |
| "Grab what's playing" (record the app's own output) | Already covered: beats have **Save as a sound**, and DJ mode takes become sounds. A third way is duplication. |
| Drawing a free-hand envelope | Fiddly at 375 px with a finger. Two fade handles teach the idea. |
| Its own trim/chop tool | Chop and trim is already planned (TODO "Agents do"). Sound design builds the shared **wave** once (#1), and chop/trim uses it. |

---

## 3. Screens

The simple path stays as it is today: Record → tap a voice → Save. New things sit between the capture box and the voices, and take one line each.

### 375 px, simple mode (new sound, after recording)

```
┌─────────────────────────────────────┐
│ New sound for Pip                ✕  │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ (●) Record   ::::::::::: grille │ │
│ │ Got it: 1.8 seconds. Try a voice│ │
│ │ [ Play it ] [ Choose a file ]   │ │
│ │ [ ✨ Make one ]                 │ │
│ └─────────────────────────────────┘ │
│  ▁▂▅▇▆▃▂▁▁▃▆▇▅▂▁   ← the wave        │
│      │  (line sweeps while playing) │
│ [ 👂 Hold: before ]                 │
│                                     │
│ Voice                               │
│ [🙂 Normal ][📢 Loud    ][🐿️ Chipmunk]│
│ [⏩ Fast   ][🐢 Slow    ][👹 Monster ]│
│  … (as today)                       │
│ Pitch ────────●──────  1.7× higher  │
│ Chipmunk → [ + Then add ] [ 🎲 ]     │
│                                     │
│ Name   [ Wobbly Kazoo           ]   │
│ Picture  …   Color  …               │
│            [ Save sound ]           │
└─────────────────────────────────────┘
```

- **Then add** shows the chain as words: `Chipmunk → Stadium ✕`. Each name is a 44 px chip; tapping a chip selects it, so the voice grid and slider edit that link. ✕ removes it. Three links at most in simple mode.
- **Hold: before** fills the width under the wave on phones.

### 375 px, Advanced on

Below the voice grid, a **Shape it** section replaces the "Then add" line:

```
│ Shape it                            │
│ ┌ ≡ 🐿️ Chipmunk          ⤢   ✕ ┐  │
│ │   Pitch ────●──── 3 notes up  │  │
│ └───────────────────────────────┘  │
│ ┌ ≡ 🧣 Muffled ↔ Bright       ✕ ┐  │
│ │   ───────────●─  brighter      │  │
│ └───────────────────────────────┘  │
│ ┌ ≡ 🔁 Make it echo           ✕ ┐  │
│ │   Echoes ──●──── 3             │  │
│ │   Apart  ────●── [On the beat] │  │
│ └───────────────────────────────┘  │
│ [ + Add a step ]        [ 🎲 ]      │
│ [ 🎵 Find its note ] [ ➕ Mix with…]│
```

- ≡ is a drag grip, the same as beat rows. ⤢ opens a voice into its steps.
- **+ Add a step** opens a sheet of the steps from §2 (two columns of 52 px buttons, like voices).
- The wave shows the fade handles when a Fade step exists, and trim handles from chop/trim.

### 1100 px

The sheet widens from 560 px to about 960 px when Advanced is on, in two columns. Simple mode keeps 560 px.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Edit "Wobbly Kazoo"                                                   ✕  │
├───────────────────────────────────┬──────────────────────────────────────┤
│ ▁▂▅▇▆▃▂▁▁▃▆▇▅▂▁▁▂▃▅▇▅▃▁   (wave)   │ Shape it                             │
│ [👂 Hold: before]                 │ ≡ 🐿️ Chipmunk   ●── 3 notes up  ⤢ ✕ │
│                                   │ ≡ 🧣 Muffled ↔ Bright  ──●─        ✕ │
│ Voice                             │ ≡ 🔁 Make it echo  3 · on the beat ✕ │
│ [🙂][📢][🐿️][⏩][🐢][👹][🤖]…    │ [+ Add a step]  [🎲]                 │
│                                   │ [🎵 Find its note: G] [➕ Mix with…] │
│ Name … Picture … Color …          │                                      │
├───────────────────────────────────┴──────────────────────────────────────┤
│ Delete sound   Download                                   [ Save sound ] │
└──────────────────────────────────────────────────────────────────────────┘
```

Under 900 px it is one column, as at 375.

### ✨ Make one

A third way into a new sound, beside Record and Choose a file. It opens a small panel in the capture box:

```
│ [🔫 Laser][💥 Boom][🫧 Tss][👏 Clap]│
│ [🚨 Siren][🪙 Coin][🌬️ Wind][🎲]    │
```

Tapping one plays it and makes it the sound, exactly as a recording would be. With Advanced on, four sliders appear: **Tone** (smooth / buzzy / hiss), **Starts at** and **Ends at** (pitch, so a slide down is a boom and up is a laser), **Length**.

### Naming

Every new sound gets a made-up name, offered in the Name field up front (as the placeholder, as `sheet.js` now does); typing replaces it. New functions in `web/names.js`, pure, taking the names in use, never repeating, 24 characters at most:

| New sound | Name pattern | Example |
|---|---|---|
| Recorded or chosen file | `soundName` (exists) | Wobbly Kazoo |
| Made with ✨ | Adjective + a word for that starter | Cosmic Zapper (Laser), Mighty Kaboom (Boom) |
| Chop of "Burp" (chop/trim) | A small-thing word with the parent's name | Baby Burp, Burp Jr., Mini Burp, Teeny Burp, Burp Crumb |
| Mix of "Burp" and "Honk" | A blend: start of one, end of the other | Burponk, Honkurp |
| Saved copy of a sound (if added) | Parent + a remix word | Burp Remix, Burp Deluxe, Turbo Burp |

I recommend the family-style names for chops ("Baby Burp") over numbers ("Burp 1"). They are funnier and they still show where the chop came from, which is the sampling lesson. When the parent's name is too long to fit, the function uses its last word ("Wobbly Kazoo" → "Baby Kazoo"); if nothing fits, it falls back to `soundName`. Blends that come out under 3 letters or over 24 fall back the same way.

---

## 4. Data and storage

**No new IndexedDB store and no schema bump.** New, optional fields on the records that already exist: user clips (`clips` store) and kit edits (`overrides` store). Every field is optional, so old records load unchanged.

| Field | Shape | Meaning |
|---|---|---|
| `voice`, `amount` | as today | The first voice. Kept for every clip, so an older copy of the app (and v2) still plays something close. |
| `fx` | array, at most 6 (3 in simple mode) | The chain. Each step is `{type, ...numbers}`, for example `{type: 'voice', voice: 'chipmunk', amount: 1.7}` or `{type: 'echo', repeats: 3, gap: 0.25}`. Absent means the chain is `[voice]`. |
| `trim` | `{start, end}` seconds into the stored audio | Where the sound starts and ends. Absent means the automatic trim used today. |
| `root` | whole number 0-127 | The note found by Find its note (MIDI number). Melody rows pitch from it. |
| `synth` | `{tone, from, to, length}` | How a ✨ sound was made, so its sliders can be moved again. The rendered WAV is still the clip's `blob`. |
| `from` | `{id, how: 'chop' \| 'mix'}` | Optional: which sound this one came from, for naming and "Made from Burp". |
| `edits` | array, at most 16, of `{kind: 'reverse' \| 'silence' \| 'gain', start, end, amount?}` | The wave editor's changes to parts, seconds into the stored audio (as `trim`), applied in order before the trim. Producer words: reverse, mute, clip gain. |
| `fade` | `{in, out}` seconds | Fade in and fade out (an envelope's attack and release) at the two ends of what the trim keeps, before the voices. |

Rules that keep it non-destructive and compatible:

1. **The blob is never rewritten.** Trim, fades and effects are settings; the sound is rendered from the original every time, as voices are today.
2. **One chain of one voice is saved the old way:** `voice` and `amount`, no `fx`. Most clips never get the new field.
3. **Step types are declared** in a `STEPS` list in `voices.js` (id, name, emoji, each number's min, max and default), the same way `VOICES` declares amount ranges. A `cleanChain()` keeps known types, clamps every number, and drops the rest. Both the app and `readBackup` use it.
4. **The render cache key** becomes `${id}:${recipeKey(clip)}`, where `recipeKey` is a short string of the cleaned chain and trim. Today's key (`id:voice:amount`) is what it produces for an old clip.
5. **Backups:** the format stays 1. `readBackup` cleans `fx`, `trim`, `root`, `synth` and `from` like other fields. An older copy of the app drops fields it does not know and plays the first voice, which is the right fallback. `backup.test.mjs` gets a round trip with every new field, and a test that junk values are dropped.
6. **Mix and chop make new clips** with their own WAV blob (as **Save as a sound** does for beats), so deleting the source never breaks them and backups need nothing new.

---

## 5. Performance on phones

**What I measured.** The pitch-keeping stretch (Fast and Slow, `timeStretch` in `voices.js`) in Node on this Mac (Apple M3 Pro), 48 kHz mono:

| Clip | Speed | Time |
|---|---|---|
| 3 s | 1.6× faster | 26 ms |
| 3 s | 6× slower (Slow default) | 260 ms |
| 10 s | 6× slower | 831 ms |
| 10 s | 20× slower (Slow max) | 2.5 s |

**Not measured:** a phone. My estimate is 3 to 5 times slower on a mid-range Android phone, so a 10 s clip at 20× slower could take about 8 to 12 s. That is the one render worth fixing. The node-graph effects (filters, echo, room, crunch) render through `OfflineAudioContext`, which runs in the browser's own audio code, and should be well under a second for a 10 s clip. Step 0 of the build plan adds timings to the event log so Ben's phone gives real numbers.

**Strategy.**

1. **Trim first.** Every render starts from the trimmed original, and the voiced result is trimmed again (existing behavior), so a stretched sound carries no long quiet start or tail.
2. **Stretch in a Worker.** `timeStretch` is plain JavaScript on arrays, so it can run in a same-origin `Worker` file. The page stays smooth while it works. The CSP already allows it (`script-src 'self'` covers workers). About 1 h.
3. **Live preview splits the chain.** Steps are of two kinds: *live* (built from Web Audio nodes: filters, echo, room, crunch, wobble, robot, squash, fade, tape pitch) and *render* (stretch, backwards, stutter, and the existing voice recipes). For preview, everything up to the last render step is rendered once and cached; the rest plays live on a loop through real nodes. Dragging a live slider moves an `AudioParam` (smoothed over 20 ms), so the change is heard at once. Dragging a render slider shows "…" and renders when let go, as today.
4. **One builder, two contexts.** Each live step is a function `build(ctx, input, settings)` that works on any `BaseAudioContext`. The same code makes the live preview and the saved render, so what you hear while dragging is what gets saved (apart from the final loudness matching, which `finish()` does after).
5. **Memory.** Each preview keeps at most the cached prefix plus the last render. `dropRendered` already clears tries when the sheet saves.

---

## 6. Build plan

Small steps, one commit each, each deployable. Hours include tests and the browser check at 320, 375, 700, 900 and 1100 px. Audio output and layout cannot be tested in Node; each step says what is checked by hand.

| # | Step | Tests (Node) | Checked by hand | Build |
|---|---|---|---|---|
| 0 | Render timings in the event log (`log.js`): voice, length, ms | log entry shape | Read the numbers from Ben's phone report | 0.5 h |
| 1 | **The wave**: draw the rendered sound on a `<canvas>` with a playhead. A pure `peaks(buffer, columns)` in `audio.js` | `peaks` on the fake AudioBuffer: length, max, silence is flat | Looks right; widths; light and dark | 1.5 h |
| 2 | **Before** (hold to hear) | app test: pointerdown plays `preview-original`, pointerup stops | Sounds right on a phone | 0.5 h |
| 3 | **Chain data**: `STEPS`, `cleanChain`, `recipeKey`, render a chain of voices; save as `voice`/`amount` when one | clean/clamp/drop; key matches today's for old clips; backup round trip | Old clips sound the same | 2 h |
| 4 | **Then add** + **🎲** in simple mode | app test: add, remove, cap at 3; surprise picks from the good list | Stacks sound good; widths | 1 h |
| 5 | **Recording helpers**: 3-2-1, too-loud red, too-quiet message (reuse DJ mode's count-in if built first) | `levelVerdict(peak, rms)` pure | Real mic on a phone | 1 h |
| 6 | **Stretch in a Worker** | stretch output identical in and out of the worker (pure function) | Page stays smooth during Slow 20× | 1 h |
| 7 | **Live steps + live preview** (split chain, `build(ctx, …)`) | `splitChain` pure; every step's ranges sane | Drag a slider, hear it move | 3 h |
| 8 | **Shape it** editor (Advanced): add, reorder by grip, remove; render steps (backwards, stutter, faster/slower) | app test: Advanced shows it, simple hides it; reorder changes order | Widths, 44 px targets | 4 h |
| 9 | **Open a voice** (⤢): voice → its steps | each voice maps to known steps | Opened voice sounds close to the voice | 2 h |
| 10 | **✨ Make one**: starters, then Advanced sliders; `synth` field; `synthName` | synth recipe clean/clamp; names fit 24 | Each starter sounds good on a phone speaker | 4 h |
| 11 | **Find its note** + Tune; `root` for melody rows | pitch finder on generated tones (A440 → 69) | A real hum gives a sensible note | 2 h |
| 12 | **Mix with another sound**: new clip, `mixName` | blend names; offsets clamp | Two sounds line up | 3 h |
| 13 | Names for chops (`chopName`), with chop/trim (built) | never repeats; fits 24; falls back | — | 0.5 h |

About 26 hours in all. Steps 1 to 4 (about 5 h) give the simple-mode win on their own. Step 1 should land before chop/trim, which then uses the wave.

### Silence, trim and chop

**Existing behavior (being built now):** silence is trimmed from the original when it loads, and again from every voiced render, so Slow or Monster never leaves a long quiet start or tail. Sound design relies on that and adds no button for it.

**No separate "Trim tighter" button.** With the render trimmed too, a button would help only one case: a noisy recording (a fan, traffic, phone hiss), where the background sits above the trim line and survives both trims. Two places handle that better:

1. **The trim line itself.** If noisy clips still carry ends, set the line from the recording's own noise floor instead of a fixed number: measure 10 ms slices, call the quietest 10% the floor, and count a slice as sound when it is at least 4 times the floor (about 12 dB) and above 5% of the peak. A pure `quietBounds(buffer)` in `audio.js`, testable on generated noise plus a tone, invisible to kids. About 1 h, only if recordings from Ben's phone show it is needed.
2. **The trim handles from chop/trim (Advanced).** They sit on the same wave (step 1) and set `trim: {start, end}` on the clip. The trimmed-off ends show grey. Trim runs before every voice, so Slow and Fast also render less.

Chop makes new pads, as decided. Trim changes the same pad ([answers](#7-bens-answers-2026-10-10)).

**As built (Advanced):** ✂️ Trim and edit shows the whole stored recording with a handle at each end (the ✂️ Ends view); it opens where the automatic trim cut. 📐 Fades puts a handle inside each end: drag it in to fade in (attack) or out (release). 👆 Select part puts two handles around a part, starting on the middle third, then 🔄 Backwards (reverse), 🔇 Silence it (mute), 🔊 Louder / 🔉 Quieter (clip gain, ×2 or ×½ a tap, taps on one part adding up) or ✂️ Keep only this (sets the trim to the part). Each change blends in over 5 ms at the part's edges so it never clicks, and is heard with half a second either side. Undo steps back through every trim, fade and edit since the sheet opened. The wave draws the edited sound, so a silenced part goes flat and a louder one grows. 🧩 Chop into pads cuts the sound *as it sounds now* (through its voices), marking each start found by `onsets()` (a rise well above the recording's own noise floor after a dip, or a sharp jump while something still rings); each piece is saved as a WAV in the Normal voice ([provisional](../questions.md)).

---

## 7. Ben's answers (2026-10-10)

1. **One switch,** renamed "Advanced", stored as `advancedBeats`.
2. **Simple mode stacks** up to 3 voices, with 🎲.
3. **Trim shortens the same pad** (original kept, Undo works); chop makes new pads.
4. **✨ Make one is in.**
