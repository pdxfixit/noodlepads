# Unified sound shaping: voices, Tweaks and Shape it as one idea

**Status:** Design 1 is built (ADR 0012); its Knobs and Shape it have since merged into one Layers section (Q42c). Below is the design as written 2026-10-11 for Ben's note of the same day:

> "i see now, how the tweaks are basically the same as some of the voice buttons. maybe those are presets of their own, and show kids how to use those presets (and can make their own) of the tweaks in the shape it layers. reconsider how to unify all these into an intuitive interface that teaches"

It works inside [ADR 0004](../adr/0004-learn-music-by-doing.md) (teach by doing; simple path always musical; depth one switch away), [ADR 0012](../adr/0012-sound-tweaks.md) (`tweaks` beside the chain) and the "Sounds and voices" and "Screens" rows of [decisions.md](../decisions.md). An interim change (Tweaks above Shape it) is in flight with another agent and does not change anything below.

**In short.** Today a sound has three editors for the same building blocks: the **Voice** keys (13 closed recipes), **Tweaks** (6 knobs that play after the voices) and **Shape it** (Advanced: the chain as cards). They overlap a lot, and in two places they undo or double each other. Three ways to make them one idea are below. The recommendation is **Design 1, "Voices are knob settings"**: a voice is a preset that *moves the knobs where you can see them*, a kid can save their own, and Advanced shows the same knobs as the first layers of the stack. Saved sounds keep exactly the data they have, so they keep sounding the same. Six questions for Ben close the doc.

---

## 1. Inventory: what each part really does today

### 1.1 How a sound plays now

`audio.js:269` renders every sound as `applyChain(original, chainOf(clip), clip.tweaks)` (`voices.js:227–249`):

1. The wave editor's trim, edits and fades, on the recording (before everything).
2. The **chain**, in order: voices and Shape it steps (`fx`, or the one `voice`/`amount`). After *each* step, `finish()` (`voices.js:648`) levels the peak to 0.9 and trims quiet ends.
3. The **tweaks**, as more steps after the chain (`tweakSteps`, `tweaks.js:92–107`): one stretch (speed and pitch together), tape pitch, reverse, wobble, squash, then echo/room last. Each also goes through `finish()`.
4. Quiet and Quietest: the finished sound turned down (`tweakGain`, `voices.js:242–243`).

Stored on a sound (`sheet.js:959–963`, `model.js:103–121`, `backup.js:260–263` and `286–289`): `voice`, `amount` (first voice, for older copies of the app), `fx` (the whole chain, when longer than one voice, max 6), `tweaks` (only what moved).

### 1.2 Every voice, what it really is, and what already says the same thing

"Shape it" means the `steps.js` kinds (`KINDS`, `steps.js:31–235`); "⤢ opens to" is `OPENED` (`voices.js:196–213`), which the code itself calls "close, not identical".

| Voice | What it really does (`RECIPES`, `voices.js:423–569`) | Same as a Tweak? | Same as Shape it steps? | Missing to express it exactly |
|---|---|---|---|---|
| 🙂 Normal | A copy; no trim (`:425`) | All tweaks at normal | none | nothing |
| 📢 Loud (1–10) | Gain → compressor (thr −6…−36 dB, ratio 1…20) → gain → tanh shaper (`:438`) | ≈ Softer ↔ louder at Loud/Loudest, which is 📢 Louder everywhere at 0.35/0.75 (`tweaks.js:86`) | ≈ Louder everywhere `amount = level/10` | the shaper (crunch) and the curve differ |
| 🐿️ Chipmunk (1.2–4×) | Tape speed up: higher **and** shorter (`:457`) | Deeper ↔ higher **+** Slower ↔ faster together (pitch +9, speed 1.7× ≈ Chipmunk 1.7). Out of range above ≈2× (tweak pitch ±12, speed ½×–2×) | Higher or lower, Keep length off — exact, except notes round to whole semitones | ranges, and whole-note rounding |
| ⏩ Fast (1.2–8×) | Time stretch, pitch kept (`:465`) | Slower ↔ faster, up to 2× only | Faster or slower — **exact** | tweak range past 2× |
| 🐢 Slow (1.5–20×) | Time stretch, pitch kept (`:470`) | Slower ↔ faster, down to ½× only | Faster or slower — **exact** | tweak range past ½× |
| 👹 Monster (1.2–4×) | Tape slow + bass shelf +9 dB at 220 Hz + tanh drive 1.6 (`:475`) | Deeper + slower, no bass or crunch | Higher or lower (tape) + 🔥 Crunch 0.2; no bass step | a bass boost; Crunch is not the same drive |
| 🤖 Robot | Ring mod 48 Hz + a short comb (6.5 ms, 0.55 fb) (`:484`) | none | 🤖 Robot (ring) 48 — no comb | the comb |
| 🏟️ Stadium | Echo 0.26 s fb 0.42 low-passed + noise-convolver hall (`:496`) | ≈ Echo at "Echo" (echo 3 × 0.25 s + room 0.25) or "Hall" | Make it echo 3/0.26 + Room size 0.6 | different echo filter and hall |
| 📻 Walkie-talkie | Static burst, band-pass 650–2600 Hz, heavy drive, roger beep, static (`:509`) | none | Muffled ↔ Bright 0.45 + Crunch 0.7 | the static and the beep |
| 🫧 Underwater | Low-pass 520 Hz swept by an LFO + vibrato 4.5 Hz (`:532`) | Warble ≈ the vibrato only | Muffled ↔ Bright −0.75 + Wobble 4.5/0.6 | the swept filter |
| 👽 Alien | Tape 1.22× + vibrato 9 Hz + ring 190 Hz mixed with dry (`:540`) | Higher (+3) + a little faster + Warble | Higher or lower 3 + Wobble 9 + Robot 190 | ring mixed with dry (Robot step is all ring) |
| 👯 Clones | Three tapes at 0.74×, 1×, 1.38×, staggered (`:551`) | none | none (⤢ hidden: three at once is not a chain) | a "copies" step |
| 🔁 Stutter | First chunk 3× then whole (`:559`) | none | 🔂 Stutter 3 — **exact** | nothing |
| 🔄 Backwards | Reversed (`:560`) | ⏪ Backwards — **exact, same code** | 🔄 Backwards — **exact** | nothing |

### 1.3 Every Tweak, and the Shape it steps it is made of

From `tweaks.js:21–113`:

| Tweak | Range / keys | Made of (Shape it step) | Same as a voice |
|---|---|---|---|
| 🎚️ Deeper ↔ higher | −12…+12 notes, slider | ⏩ Faster or slower (stretch, by 1/rate) then 🎚️ Higher or lower, Keep length off (tape) | Chipmunk/Monster without the length change |
| ⏩ Slower ↔ faster | −1…+1 doublings (½×–2×), slider | ⏩ Faster or slower (merged into the same one stretch as pitch) | Fast / Slow, smaller range |
| ⏪ Backwards | switch | 🔄 Backwards | 🔄 Backwards voice, identical |
| 🏛️ Echo | 4 keys: Off · Room · Hall · Echo | 🏛️ Room size 0.2 / 0.55, or 🔁 Make it echo 3 × 0.25 s + Room 0.25 | ≈ Stadium |
| 🔊 Softer ↔ louder | 5 keys: Quietest…Loudest | Loud/Loudest: 📢 Louder everywhere 0.35/0.75. Quiet/Quietest: a gain on the finished sound (no step can do it: every step is levelled) | ≈ Loud |
| 〰️ Warble | 3 keys: Off · A little · Lots | 🌊 Wobble 5.5 Hz, depth 0.25/0.6 | the wobble inside Underwater and Alien |

### 1.4 Where the three overlap, clash or double up today

| # | What happens | Where | What a kid notices |
|---|---|---|---|
| 1 | 🔄 Backwards voice **and** ⏪ Backwards tweak reverse twice: the sound plays forwards. | `voices.js:560`, `tweaks.js:102` | "Backwards stopped working" |
| 2 | Loud voice then Loudest tweak compress twice; Loud then Quietest squashes it flat and turns it down. | `voices.js:438`, `tweaks.js:104`, `:112` | Crunchier, or loud-but-quiet |
| 3 | Stadium then Echo tweak: two echoes and two rooms. Shape it's own echo/room plus the Echo tweak: the same. | `voices.js:496`, `tweaks.js:105` | Mush |
| 4 | Chipmunk then Deeper: tape up, then pitch back down with length kept, which is Fast by a longer road (and two stretches' worth of artefacts). Slow then Slower stretches twice. | `tweaks.js:96–101` | It works, but nothing explains why |
| 5 | Tweaks are invisible in Shape it. An Advanced kid sees a chain of cards that is not the whole sound: the tweaks play after it, unseen. | ADR 0012 "Options turned down"; `shape.js:68` | Cards don't add up to what plays |
| 6 | Shape it's live loop plays **without** the tweaks while a slider is held; letting go renders with them. | `sheet.js:684–687` | The sound jumps on release |
| 7 | In Advanced, the simple chain line and the voice's amount slider hide; the same voice's amount moves to its Shape it card. Two editors for one value, one shown at a time. | `sheet.js:163–169`, `:573` | Slider "moves" between modes |
| 8 | Emoji collide across the three: 🔁 is Stutter (voice) **and** Make it echo (step); 🎚️ is Deeper ↔ higher **and** Higher or lower; ⏩ is Fast, Slower ↔ faster and Faster or slower; 📢 is Loud and Louder everywhere; 🔄 Backwards (voice, step) vs ⏪ (tweak); 🏛️ is Echo (tweak) and Room size. | `voices.js:11–28`, `steps.js:33–231`, `tweaks.js:25–42` | The pictures don't teach which thing is which |
| 9 | Every step is levelled to peak 0.9 after it runs (`finish`), so a voice split into steps (⤢) never sounds *exactly* like the voice, even with perfect numbers. | `voices.js:239`, `:648` | ⤢ changes the sound a little |
| 10 | Tune (Advanced) is a tape Higher or lower at the end of the chain, and Deeper ↔ higher is another pitch after it; Find its note adds both. | `sheet.js:236–248` | Two pitch controls on one sheet |

The order is fixed: **trim/fades → chain (voices and steps) → tweaks → softer gain**. Nothing double-applies by accident inside one part; the clashes all come from the same idea living in two parts.

---

## 2. Three unified designs

Shared ground for all three:

- **Saved sounds keep their stored fields untouched** (`voice`, `amount`, `fx`, `tweaks`), and the render path for them stays, so they sound the same on every device, in backups 1.x and in cloud records. Nothing is converted on load. A sound changes shape only when a kid edits it.
- Rules kept: ≤ 5 stops → keys, more → slider (`lines.js`); 44 px targets; designed at 375 px first; a kid's own preset names are free text (24 chars, like sound names), never pre-filled with a kid's name.
- "Preset" below means a named voice. Kids keep seeing the word **Voice**; "preset" is the code word (it already means the shared sounds to kids, decisions.md row 63, so the sheet should not use it).

### Design 1 — "Voices are knob settings" (recommended)

**What a kid learns:** *a voice is just the knobs set a certain way.* Tap 🐿️ Chipmunk and you watch Deeper ↔ higher slide up and Slower ↔ faster slide right, and hear it. So Chipmunk **is** higher-and-faster. Nudge a knob and it is your own voice; tap ⭐ to keep it.

**How it works**

- The Tweaks grow into **Knobs** (one list, `tweaks.js`), enough to express almost every voice: the six today, ranges widened (pitch ±24 notes, speed ¹⁄₂₀× to 8× on a log slider), plus four new ones made from existing steps: **🧣 Muffled ↔ Bright** (5 keys), **🤖 Robot** (Off · Robot · Metal), **🔥 Crunch** (Off · A little · Lots), **🔂 Stutter** (Off · 2 · 3 · 4). Ten knobs, fixed order, each a fixed slot (so nothing can double up: there is one echo, one pitch, one backwards).
- **Voices become presets** = a set of knob positions, *only the knobs that voice cares about*. Chipmunk = {pitch +9, speed 1.7×}; Stadium = {echo: Echo}; Underwater = {tone: Muffled, warble: Lots}; Alien = {pitch +3, speed 1.2×, warble: Lots, robot: Metal}; Backwards = {backwards}.
- **Stacking without a chain:** tapping a second voice adds its knobs on top. Chipmunk then Stadium = both sets; Chipmunk then Monster = Monster's pitch wins (the last tap wins a knob both use). The chain line ("+ Then add") goes; the knobs *are* the stack. Clash #1–#4 above become impossible.
- The voice chip stays lit while the knobs match it, and turns into **✏️ Your own · ⭐ Keep** once any knob moves.
- **My voices** (⭐): a name, an emoji, the knob positions. They show as chips after the built-in ones.

**375 px, simple mode**

```
┌─────────────────────────────────────┐
│ Voice                               │
│ [🙂 Normal ][🐿️ Chipmunk][👹 Monster]│
│ [🤖 Robot  ][🏟️ Stadium ][🫧 Under..]│
│ [👽 Alien  ][📻 Walkie  ][👯 Clones ]│
│ [⭐ Squeaky][⭐ Boom box][🎲 Surprise]│  ← my voices, then 🎲
│                                     │
│ Knobs              🐿️ Chipmunk is:  │  ← names what's lit
│ 🎚️ Deeper ↔ higher ───────●── +9   │  ← slid there on tap
│ ⏩ Slower ↔ faster ──────●─── 1.7× │
│ 🏛️ Echo  [Off][Room][Hall][Echo]    │
│ 🔊 [Quietest][Quiet][Normal][Loud]… │
│ ⏪ Backwards        ▸ More knobs (4) │  ← warble, tone, robot,
│                                     │     crunch, stutter
│ [↩️ Back to normal] [⭐ Keep as mine]│
└─────────────────────────────────────┘
```

- Tapping a voice animates each knob it uses from where it was (about 300 ms), and a knob it uses glows the voice's color for a second. The motion is the lesson. (Reduced motion: the glow only.)
- **More knobs** opens on its own when a voice uses one of them (Underwater opens it to show Muffled and Warble). Whether the fold exists at all is question 3.
- ⭐ **Keep as mine** asks for a name (placeholder: a fun name from `names.js`, not a person) and an emoji, then adds the chip. Long-press (or ✕ in ✏️ Edit sounds style) removes one, asking first.

**Advanced (Shape it)**: the knobs show as the **first layers of the stack**, pinned, in their fixed order, one card each with the same slider or keys (only the knobs not at normal, plus "+ Show all knobs"). Below them, the free Shape it steps as today (drag, ⤢, + Add a step), still max 6. So "a voice is layers" is literal in Advanced, and the cards add up to what plays (fixes #5). The live loop includes the knob layers that are live (#6).

```
│ Shape it                            │
│ 🔒 Knobs (always first)             │
│ ┌ 🎚️ Deeper ↔ higher  ──●── +9  ┐  │
│ ┌ ⏩ Slower ↔ faster  ──●─ 1.7× ┐  │
│ Your steps                          │
│ ┌ ≡ 🔁 Make it echo          ✕ ┐  │
│ │   Echoes ──●── 3              │  │
│ [ + Add a step ]        [ 🎲 ]      │
```

Order question: today tweaks play *after* the chain. With knobs shown first, the render order should flip to **knobs → free steps** so the picture is true. That changes the sound of any saved sound that has both `fx` and `tweaks` (ADR 0012 shipped today, so very few). Option: keep them after for stored sounds with both (a flag), flip for new ones. Logged as a build risk, not a question.

**Old sounds and voices** (the migration)

- Stored `voice`/`amount`/`fx` keep playing through the chain path, exactly. Opening such a sound shows its voice as a **classic chip** above the knobs: "🐿️ Chipmunk (the old recipe) · ⤢ Turn into knobs". Turning it into knobs is the kid's choice (Hold: before and ↩️ Undo cover the small change).
- Stored `tweaks` are already knob positions: they load as they are. The schema grows (new keys `tone`, `robot`, `crunch`, `stutter`; wider ranges). `cleanTweaks` in an *older* app drops keys it doesn't know and clamps wider values to its own range: an older copy plays new knob settings partly. Same as ADR 0012's stance today.
- Voices without a knob equivalent: 👯 Clones (needs a "copies" knob), 📻 Walkie's static and beep, 👹 Monster's bass shelf, 🤖 Robot's comb, 📢 Loud's drive. Either they become knobs or presets that also carry one "special" layer (question 5). The built-in Chipmunk made from knobs sounds *close* to today's (whole-note pitch, a ~3 % stretch left over at 1.7×), not identical (question 2).
- My voices: a new IndexedDB store `voices` ({id, personId, name, emoji, knobs}), `SCHEMA` bump in `store.js`; a `voices` kind in `CLOUD_KINDS` (`cloud-sync.js:13`) and in backups. Backup format **1.1** (additive: a 1.0 app reports "N things this version doesn't have", `backup.js:365`, and loads the rest). A sound stores only its knob positions, never a reference to a preset, so deleting a preset changes no sound and a shared sound needs no preset.

**Costs and risks**

- Ten knobs is a long panel at 375 px; the fold or a smaller set is the fix (question 3).
- Built-in voices are re-made, so they sound a little different from today. Saved sounds don't change.
- Wider speed range on one slider: ¹⁄₂₀×…8× needs a log slider with a sticky "normal" in the middle (the tempo slider's pull, decisions.md row 168, is a model).

**Estimate: about 22 hours.** Knobs list, ranges, 4 new knobs from existing steps, tests (3 h) · presets as knob sets, stacking rule, tests that each preset's knobs are in range (2 h) · sheet: chips set knobs with animation, lit/edited state, More knobs fold, Keep as mine (5 h) · classic chip and ⤢ Turn into knobs (2 h) · `voices` store, schema, backup 1.1, cloud kind, tests (5 h) · Advanced pinned knob layers, live loop with knobs, render order (3 h) · Help lines, README, ADR 0013, decisions rows, `just look` at five widths (2 h).

### Design 2 — "One stack of layers"

**What a kid learns:** *a sound is a stack of layers, top to bottom; a voice is a stack somebody saved.* Every voice opens to its real layers, and you can save your own stack.

**How it works**

- Tweaks stop being a separate thing: every knob is a layer in the one chain (`fx`). Simple mode shows the stack as a short list, one line per layer with its one main control; Advanced shows the full cards.
- Each built-in voice becomes an exact list of layers. To be exact it needs new step kinds (bass shelf, comb, static/beep, copies, a softer "level" step) **and** a way to run several steps without `finish()` levelling between them (a "group" layer), or every voice sounds slightly different once opened (#9).
- Tapping a voice *replaces* the stack (or appends: question 6). My voices save the whole stack.

**375 px, simple mode**

```
│ Voice                               │
│ [🙂 Normal ][🐿️ Chipmunk][👹 Monster]│
│  …                     [🎲 Surprise]│
│                                     │
│ What's in it (top plays first)      │
│ 🎚️ Higher       ───────●── +9    ✕ │
│ ⏩ Faster       ──────●─── 1.7×  ✕ │
│ 🏛️ Echo  [Room][Hall][Echo]      ✕ │
│ [ + Add: deeper · echo · louder… ]  │
│ [⭐ Keep as mine]                    │
```

**Old sounds:** stored `voice` steps keep rendering through `RECIPES` as a closed layer ("🐿️ Chipmunk ⤢"). Stored `tweaks` can be moved into `fx` exactly, because `tweakSteps` already *is* a list of steps (plus the new level step for Quiet), but only when the sound is next saved; on load the old field still plays. An older app reading the new `fx` drops only the new kinds (`cleanChain` filters unknown types, `voices.js:85–94`), so it plays these sounds *better* than it plays `tweaks` today. `MAX_CHAIN` must grow (tweaks alone can add 7 steps) from 6 to about 12.

**Costs and risks:** the biggest change; simple mode gets a list editor, which ADR 0004 warns against; more steps means more offline renders per sound (each with its own `finish`), slower on phones; ADR 0012's "Options turned down" is reversed. Exact recipes can't be checked by `node --test` (no Web Audio), only by ear.

**Estimate: about 30 hours.** New step kinds and the group layer (6 h) · exact recipe lists, `MAX_CHAIN`, migration on save, tests (5 h) · simple stack editor at 5 widths (7 h) · My voices store, backup, cloud (5 h) · Shape it changes and live loop (4 h) · docs, ADR, Help (3 h).

### Design 3 — "Tidy the rows, peek inside"

**What a kid learns:** *the plain changes are knobs; a voice is a character, and you can peek at how it's made.* Least change.

**How it works**

- Voices that are only a knob leave the Voice row: 🔄 Backwards, ⏩ Fast, 🐢 Slow and 📢 Loud (the knobs do them, with wider ranges). Stored sounds with them still play. The Voice row keeps the characters: Chipmunk, Monster, Robot, Stadium, Walkie, Underwater, Alien, Clones, Stutter.
- A lit voice shows **👀 How it's made**: a one-line sentence of its layers ("higher and faster together") and, in Advanced, ⤢ as today.
- ⭐ **Keep as mine** saves {voices chain, tweaks} as a named chip.
- Advanced: Shape it shows the tweaks as a read-only "then the Knobs" card at the end, tap to jump to them (fixes #5's surprise, not the double-ups).

**Costs and risks:** fixes #1 and the duplicate rows, but Chipmunk + Deeper and Stadium + Echo still double up, and the teaching ("a voice is knobs") is told, not shown. Cheapest.

**Estimate: about 11 hours.** Rows and ranges (2 h) · How it's made sentences (2 h) · Keep as mine with store, backup, cloud (5 h) · Shape it card, docs (2 h).

### Side by side

| | 1. Voices are knob settings | 2. One stack of layers | 3. Tidy the rows |
|---|---|---|---|
| What a kid sees on a tap | Knobs slide to the voice | The stack fills with layers | The voice lights; a sentence |
| Double-ups possible | No (one slot per knob) | Yes, but visible | Yes |
| Simple mode grows by | A fold of 4 knobs | A list editor | Nothing |
| Saved sounds | Untouched; classic chip | Untouched; migrate on save | Untouched |
| Built-in voices sound | Close to today | Exact (after new kinds) | Exactly today |
| Storage change | `tweaks` keys + `voices` store | Bigger `fx`, new kinds + `voices` store | `voices` store |
| Estimate | ~22 h | ~30 h | ~11 h |

---

## 3. Recommendation

**Design 1.** Reasons:

1. It is Ben's sentence built: voices *are* presets of the tweaks, a kid sees them set the knobs, and can make their own.
2. It teaches by watching, not reading (ADR 0004 rule 2): the knobs move, nothing is named.
3. It removes the clashes by construction (one slot per knob), instead of explaining them.
4. Simple mode stays a row of chips and a few knobs; Advanced turns the same knobs into the top of the layer stack, so the picture in Advanced is the whole sound for the first time.
5. Storage is additive: saved sounds, backups 1.x and cloud records play exactly as before.

Build it in two halves so something lands each day: (a) knobs grow, voices set knobs, ⭐ Keep as mine on this device (≈ 12 h); (b) the `voices` store syncs and backs up, and Advanced shows the knob layers (≈ 10 h). Sharing a voice by share code can come later; the record is small and the share path (`cloud.js:378`) takes new kinds.

## 4. Questions for Ben (one batch)

1. **Which design?** (a) Voices are knob settings *(recommended)* · (b) One stack of layers · (c) Tidy the rows, peek inside
2. **May the built-in voices sound a little different once they are made from knobs?** Saved sounds never change. (a) Yes, close is fine *(recommended)* · (b) No: keep each exact, as a special layer the knobs sit on top of
3. **How many knobs in simple mode?** (a) The 5 main ones, the rest under "More knobs", which opens by itself when a voice uses one *(recommended)* · (b) All 10, always · (c) Only the knobs the lit voice uses, plus a "+ knob" key
4. **Where do a kid's own voices live?** (a) With the person: synced to every device and in backups *(recommended)* · (b) Shared by the whole family, so anyone can use anyone's · (c) This device only
5. **Clones, Walkie's beep and Monster's boom have no knob. What happens to them?** (a) They stay as special voices beside the knob voices *(recommended)* · (b) They become knobs (a 👯 Copies knob; Walkie and Monster get a "special" layer) · (c) They go; saved sounds keep them
6. **Tapping a second voice:** (a) adds its knobs on top; the last tap wins a knob both use *(recommended)* · (b) replaces the first voice · (c) keep "+ Then add" as now
