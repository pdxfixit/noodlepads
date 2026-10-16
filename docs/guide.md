# How Noodle Pads works

The full guide to the app: every screen, what each control does, and how
what a kid makes is stored. The short version is the [README](../README.md);
the file map is [layout.md](layout.md). ❓ Help in the app says the same
things in one line per control.

- [Pads and the sound sheet](#pads-and-the-sound-sheet)
- [Wide screens](#wide-screens)
- [🧸 Kids](#-kids)
- [Help](#help) and [Settings](#settings)
- [How sounds are stored](#how-sounds-are-stored): the kit, Edit sounds, voices, the keys, Beats, Song, people, backups
- [Cloud profiles](#cloud-profiles) and [For grown-ups](#for-grown-ups)
- [Keyboard and screen readers](#keyboard-and-screen-readers)
- [Limits on what comes in](#limits-on-what-comes-in)
- [Versions and updates](#versions-and-updates)
## Pads and the sound sheet

A soundboard for kids: everyone gets a board of their own. Tap a
pad, hear the sound; hold it (or Shift-click it) and it keeps repeating (tap it again to stop), so several can loop at once. On a touch screen a pad sounds as the finger lifts, if it stayed put, so a scroll that starts on a pad never plays it (`finger.js`; 🧸 Kids pads too); a mouse plays on press. Record a one-liner ("GREAT!", "YOU LOSE!"), then make it
silly with a voice: Loud, Chipmunk, Fast, Slow, Monster, Robot, Stadium, Walkie-talkie,
Underwater, Alien, Clones, Stutter or Backwards. The sound sheet draws the
sound as a wave that lights up as it plays; tap 👂 **Plain** under it (beside
✂️ and 🧩 with Advanced) to hear it with no voice (tap again, or ▶︎, to stop; it
is faded while every knob is normal, when plain sounds the same); ▶︎ at the left of the
sheet's title plays it as it sounds now (■ stops it, Space too). **A voice is knob
settings**: tapping one (the chips are just pictures; hold one, or Shift-click it, for its name)
slides the knobs in **Layers** under it to where that voice puts them (the
rows it moves glow, and any knob off normal keeps a blue outline), and the line under the voices says so ("Chipmunk is:
higher +9, faster 1.74×"). Layers are one row per layer, top to bottom in the
order they play, like Beats' rows: an emoji, a name, keys or a slider, 🔈 to
mute it (it keeps its setting) and ✕ to take it out (two taps). Deeper ↔
higher, Slower ↔ faster, Warble, Softer ↔ louder and Echo are always there;
**+ Add a layer** adds ⏪ Backwards, Muffled ↔ Bright, Robot, Crunch or
Stutter (a voice that uses one adds it too), and with Advanced the kid's own
steps (echo, room, fade…), which play after the knobs and drag into order. A
⚙️ Advanced switch sits at the bottom of Layers.
A second voice adds its knobs on top (the last tap wins a knob both use), 🎲
**Surprise me** stacks one to three, and moving a knob makes it your own.
⭐ **Save voice** saves the knobs as a kid's own voice, with a name and/or
an emoji; they go with the person to every device (the cloud) and in backups,
and ⭐ My voices ▾ renames or deletes them.
↩️ **Reset voice** puts every knob back. Clones, Walkie-talkie and Monster carry
a ✦ special part no knob makes. A sound saved with an older voice plays it
exactly as before; ⤢ **Turn into knobs** is the kid's choice. The sound's
name is the sheet's title (tap it to rename), and Voice and Layers
fold under their headings. Closing the sheet (✕, a tap outside it, Esc, or
closing the tab) with unsaved changes, a sound not yet saved, or a recording
in progress asks first: **Keep editing** or **Throw away**. With Advanced on (Settings), ✂️ **Trim and edit** drags a sound's
start and end in (same pad, Undo works), drags fades in from either end, and
changes just a selected part (Backwards, Silence it, Louder, Quieter, Keep
only this). 🧩 **Chop into pads** cuts it where
each sound starts and makes each piece a new pad ("Baby Burp", "Burp Jr.").
The **pad size slider** at the top left of the pads makes them smoothly
smaller (more on a line) or bigger (fewer). Its ends are the smallest and
biggest pads this screen can show: as many 76 px pads as fill a line, and one
whole-width pad on a phone (400 px on a wide screen). It is kept as the
`padSize` setting: `auto` (the screen's own size) or 0 to 1, the share of the
way from smallest to biggest, so it means the same on every screen
(`pad-size.js`).

## Wide screens

or desktop, up to 2400 px of content (centered beyond that). From 1400 px a
screen with two parts shows them side by side: Beats with ⌨️ Keys its beat beside the keys,
❓ Help two columns, and the sound sheet the sound and how it looks beside
Voice and Layers. Limits keep it sensible: pads stop at 400 px, the
keys at 1500 px, and text at a readable line.

## 🧸 Kids

A person on the 🧸 Kids level (ADR 0019; `kids.js`, its pure parts in
`kids-logic.js`) sees four picture screens in place of the regular app, for a
five-year-old, with no words to read and nothing to delete, edit or share:

- **🔊 Pads**: big picture pads, the kid's own sounds first (newest first),
  then the kit. Swipe sideways for more pages (◀️ ▶️ with a mouse); pinch to
  make them bigger or smaller (2 to 4 across a phone, more per 560 px on a
  wider screen; remembered on the device, `kids-size`). A tap plays from the
  start; no holding or looping.
- **🎙️ Record**: hold the big mic, let go to stop (10 s at most; a tap under
  0.3 s or silence keeps nothing). It becomes a pad of the kid's own, saved
  as the sound sheet saves one, and plays. 🤖 Robot, 🐭 Tiny (Chipmunk) and
  👻 Spooky (Monster with Stadium's echo) light for the next recordings and
  change the last one at once; tap a lit one for Normal.
- **🥁 Beats**: four drums (kick, snare, hi-hat, clap) of eight squares, ▶️/⏹️,
  🐢 80 and 🏃 140 BPM (neither lit: 110). One beat per person: their
  scratch beat (ADR 0020), saved on every tap (a square is every other pill
  of a 16-pill bar), so the regular app's Beats opens it whenever nothing
  else is open. A kids beat from before (`beat-kids-…`) becomes the scratch,
  or a beat in 🗂️ My beats when the scratch already has hits.
  Across on a wide screen; down the screen on a phone.
- **🎹 Keys**: eight colored keys, C to high C, that play while held, several
  fingers at once (A S D F G H J K on a keyboard). Lying down like a
  xylophone on a phone.

⏹️ stops everything. The ⚙️ gear asks a grown-up sum (two numbers from 6 to
9, big number keys); right opens Settings and the regular app until the page
reloads, wrong goes quietly back. Choosing 🧸 Kids in Settings hands it back.
The tab is remembered on the device (`kids-tab`).

## Help

The ❓ button, beside ⚙️, opens Help: a picture reference with one tab each for
Pads, making a sound, Beats, 🎼 Song, 🎤 Live and Settings (every toolbar screen has
one; a test checks). It opens on the tab for the screen
you are on. Each line draws a control with its real label and says what it does
in one sentence; tools behind the Advanced switch are marked ⚙️ Advanced. It is
for looking things up, never a lesson: nothing pops up on its own. The content
is a table in `web/help.js`. `tests/help.test.mjs` fails when a label Help
draws no longer exists in the app, or when a key control on its `MUST_MENTION`
list is missing from Help, so rename both together. Lines marked `soon`
describe features still being built and stay hidden until their mark is removed.

## Settings

The ⚙️ button in the top corner (small, and away from the pads and toolbar so
it isn't pressed by accident) opens Settings: 🔗 Sharing (🔗 Shared with me), 💾 Backups, 🎚️ Level (🧸 Kids · Regular · Advanced, each person's own, ADR 0019; stored as `level` with `advancedBeats` beside it, true only for Advanced, so an older copy still reads Advanced right; Advanced shows the extra beat and sound tools: each beat row's sound picker gets Speed, beats get Swing, and each beat can have its own time signature), ⌨️ Keyboard, 📊 Data sharing (📊 Share play data and 📮 Send problem reports) and About. Every section but About folds under its heading (all closed at first; the device remembers which are open, in `localStorage` `settings-open`), with a chip saying its state where there is one (how many people, the level, the keyboard, which of play data and reports are on). About is always open: a line on what the app is, then the version and the Privacy policy, centered. The pad size (`padSize`, `auto` or 0 to 1; an older percent, 50 to 220, or S M L reads as the nearest place) is a setting too, though its slider sits on the Pads screen.
**📮 Send problem reports** (a checkbox in 📊 Data sharing, off by default, per device) sends the event log,
cleaned by `log-clean.js` so it holds no names and no audio, to the site's own
`/api/log` when the page is hidden and 10 s after an error (`log-send.js`; plan
in `docs/design/automatic-logs.md`). Settings are stored in IndexedDB `settings`
and included in backups, `sendLogs` too; the device code is in localStorage
`log-device` and never goes in a backup.

## How sounds are stored

- **Bundled clips** are files under `web/clips/`, listed in `web/boards.json`.
  It lists no people today, so every bundled sound is a preset (called the
  kit in the code and in boards.json): `web/clips/kit/` holds the presets on
  every board: 127 sounds in 10 groups (Drums, Notes, Chords, Bass, Game,
  Effects, Animals, Sci-fi, Voices, Silly), listed in boards.json `kitGroups`.
  All are generated (`just placeholders`), except the old app's eight starter
  sounds (airhorn, laser, boing…), kept as they were. Notes are a full octave
  of C major. A preset marked `"advanced": true` shows only with ⚙️ Advanced
  on (pads, the sound chooser, the keys): these are the 20 sharps and
  flats, labelled both ways ("C♯ · D♭"), the five in Notes and in Bass between
  the naturals, and ten chords for songs in G, D, F, B♭ and A after the first
  seven. A beat row, key or take that already uses one keeps playing it
  with Advanced off (`anyClip` in `board.js`). boards.json lists the presets once, as top-level `kit`; every board (people
  added in the app too) gets its own copy with ids like `<person>-kick`, so each
  board can hide, rename or reorder presets separately. The pads show two
  sections, the person's own sounds (with New sound) then Presets, and a pad only
  moves within its section. Preset groups open and close (Drums starts open; each device remembers in
  localStorage `kit-open`), on the pads and in the beat sound chooser alike.
- **Sounds made in the app** (recorded or uploaded) live in that browser's
  IndexedDB, so they stay on the device they were made on. Edit sounds →
  a sound's ✏️ → Download saves a copy.
- **✏️ Edit sounds** (`pads.js`, `bulk.js`): each pad shows ✏️ (its sheet) and
  🗑️ at its top right; 🗑️ deletes a sound made in the app (two taps, then
  Undo), hides a preset, and 👁 brings a hidden one back. Tapping pads selects
  them, as does the select circle at each pad's top left (always there in
  Edit sounds); every badge floats above the pad with a bold ring; a bar then
  offers 📁 Move to group, 🎨 Color · picture, 🪄 Voice, 🔗 Share (one code
  for them all) and 🗑️ Delete. With presets picked, Move and Share wait.
  The bar's Select all picks every sound the kid made (presets stay as they
  are), and a group's ✏️ has ☑️ Select its N sounds, so sharing them all is
  two taps.
  🪄 Voice has the sound sheet's voice chips and Layers rows (no 🔈): the knobs
  set there replace each chosen sound's knobs and old voices (its own steps stay).
  With a mouse, ✏️ also shows on a pad's hover while playing.
- **Groups of a kid's own sounds** ([ADR 0013](adr/0013-groups-of-own-sounds.md), `groups.js`):
  a sound made in the app may have `group: 'g-…'`, and the person's pad
  order record holds `groups: [{id, name}]` in their order (names up to 24).
  They show under My sounds like the presets' groups, then "Not in a group";
  a group with no sounds is not shown, and goes from the record at the next
  move or delete. Closed groups are remembered per device in localStorage
  `groups-closed`.
- **Voices never change the audio.** The original is kept and the voice is a
  setting, rendered when the clip loads, so any sound can switch voices later.
  Each render logs its voice, length and milliseconds to the event log, so a
  problem report shows how fast voices render on that device.
  Voices can be stacked ("Chipmunk, then Stadium"): a chain of more than one
  is stored as `fx: [{type: 'voice', voice, amount}, …]` (at most 6, cleaned by
  `cleanChain` in `voices.js`, backups included), and its first voice is also
  kept as `voice` and `amount`, so an older copy of the app plays that one. A
  sound with one voice is stored as before, with no `fx`.
  Knobs are `tweaks: {pitch, speed, echo, volume, warble, backwards, tone,
  robot, crunch, stutter, special, first, muted}`, only what moved from normal
  (cleaned by `cleanTweaks` in `tweaks.js`, backups included). A sound
  made by tapping voices stores only knob positions, never which voice. Knobs
  saved with `first` play before the chain; without it (every sound saved
  before knobs) after it, so old sounds sound the same
  ([ADR 0012](adr/0012-sound-tweaks.md)). `muted` lists the set knobs
  whose layer is muted (🔈): kept, not played; a muted step has `off: true`.
  An older app drops both and plays them. A kid's own voices (⭐ Keep as
  mine) are IndexedDB `voices`: `{id, personId, name, emoji, knobs, created,
  used}` (`voice-knobs.js`). They go with the person: synced to the cloud
  and kept in backups (format 1.1).
  A trim is a setting too: `trim: {start, end}`, seconds into the stored
  audio, played instead of the automatic quiet-ends trim and before every
  voice. The wave editor's changes are settings in the same seconds:
  `edits: [{kind: 'reverse' | 'silence' | 'gain', start, end, amount?}]`
  (at most 16, applied in order to the stored audio before the trim) and
  `fade: {in, out}`, seconds at the two ends of what the trim keeps. Both are
  cleaned in `cuts.js` and named in the render cache key. A chopped piece is a new sound with its own WAV, and
  `from: {id, how: 'chop'}` names the sound it came from. Steps other than
  voices (Advanced step rows in Layers: echo, room, Muffled ↔ Bright and the rest) are
  declared in `steps.js` with their numbers' ranges, e.g. `{type: 'echo',
  repeats: 3, gap: 0.25}`; live ones are Web Audio nodes a slider moves while
  the sound loops. Layers' rows come from `layerRows` in `tweaks.js` (the main
  five knobs, others set or added, a ✦ special part where it plays, then the
  steps; drawn by `shape.js`). A sound saved with old voices and knobs plays
  its knobs after its steps, so there the knob rows sit after them. The live loop includes the knobs
  (`livePlan`, `voices.js`).
  Renames, colors, voices and hides of bundled clips are stored the same way.
  A kit group (or the whole kit) with every sound hidden drops its heading,
  except in Edit sounds, where it shows dimmed with "9 hidden" so its sounds
  can be brought back.
- **✨ Make one** makes a sound with no microphone (`synth.js`): a starter
  (Laser, Boom, Tss, Clap, Siren, Coin, Wind, or 🎲) is a small recipe,
  `synth: {tone, from, to, length, shape, pulses}`, rendered to a WAV that is
  the clip's audio. The recipe is kept so Advanced's settings can remake it:
  Tone as three keys (Smooth, Buzzy, Hiss), then sliders for where the pitch
  starts and ends and how long it lasts.
- **🎵 Find its note** (Advanced, `pitch.js`) hears which note a sound is and
  stores it as `root` (a MIDI number, 60 is middle C) on the clip or kit edit.
  Tune is a Higher or lower at the end of its chain. A tune row (🎹) moves a
  sound with a `root` the nearest way to C (6 notes at most), so its notes play in tune.
- **➕ Mix with another sound** (Advanced, `mix.js`) layers two sounds, as each
  plays now, into a new pad: a WAV with `from: {id, how: 'mix'}` naming the
  sound it was made from, and a blended name ("Burp" and "Honk" make "Burponk").
- **Pad order** is boards.json order until someone moves a pad in Edit sounds
  (drag one, or Alt+← → from the keyboard), within its group. The new order is saved per person in IndexedDB too; sounds it doesn't
  name (added later) go at the end, and pads in a closed group keep their places.
- **The toolbar** has four tabs, 🔊 Pads · 🥁 Beats · 🎼 Song · 🎤 Live, then Stop all (⏹️ alone on a phone, so all five fit at 320 px). No screen has a sub-switch (ADR 0017).
- **The keys** (🎤 Live, and 🥁 Beats with ⌨️ Keys on): 40 sound keys laid out like a keyboard's number row (1 … 0) and its three letter rows, alternating like bricks on wide screens (the Q and Z rows half a key in; tiles like a periodic table), played by the real keys (by position, so any layout works; pick QWERTY or Dvorak in Settings → ⌨️ Keyboard for the labels; the digits are the same on both) or by tapping. By default the number row is a scale, C to high C, then Ding and Ta-da; the kid's own sounds stay on Q–P. On a phone the row tabs are four, the drums first; with no keyboard in sight the number row's pads come last. The number and letter keys play only while the keys are on screen (on 🔊 Pads, 1–9 play the first nine pads). ✏️ Edit keys opens a focused view for arranging them (below). Two ways to record:
  - **🎤 Live** keeps every hit as it was played, as a named take (🎬 Takes: play, rename, delete, 🔊 make it a sound). A take's ▶ Play turns into ■ Stop while it plays; a second 🔊 asks "Make another?". ⏲️ Click track sits in the footer, then 🔔 Overlap, then ✏️ Edit keys (on a phone the three share a line); Live has no open beat, so it ticks at 100 BPM, which its slider changes for the visit. 🔔 Overlap, on, lets every key's repeated hits ring over each other (up to 8, `audio.js` `ringing`) instead of restarting the sound; holding a key still loops it. It lasts for the visit: never saved, off after a reload. A take keeps it: a hit played with it on is stored with `ring: true` (only when true; an older copy drops it and restarts), and ▶ Play and 🔊 make a sound play the take as it was heard, each hit cut off by the next unless it rang (`rhythm.js` `planTake`). With ⌨️ Keys on Beats the keys always restart; 🔊 Pads always restart.
  - **🥁 Beats with ⌨️ Keys** (⌨️ in the beat bar, remembered on the device as `beat-keys`) shows the keys under the open beat and has ▶ Play (the beat round and round, recording nothing) and counts in one bar (a big colored number over the keys, then GO!), then plays the beat; hits snap forgivingly onto its pills, pass after pass, until Stop. ↩️ Undo puts the beat back. Tempo (tap the number to type one), ⏲️, bars and (Advanced) time signature sit on the control bar with ▶ Play and ● Record, as with Keys off; it is the only tempo there. After the count-in the tempo can change while recording, and a beat played into its last bar on the first pass grows (1 → 2 → 4 bars, the new bars a copy). Tap ⏲️ three times in time to set the tempo (Live and Keys). Its grid takes taps like Beats; each row's ✕ removes it and 🧹 clears it (two taps), with Undo. A beat holds 16 rows; when it is full, a new sound reuses a row with no hits.
  Changed keys and takes are in IndexedDB `decks` and `takes` (ADR 0005); the rules are in `rhythm.js`.
  - **✏️ Edit keys** is its own full-screen view, with no beat, take or mode controls. On top, **Layouts**: whole-keyboard arrangements, the kid's own ⭐ ones first, then four ready-made ones that lay out the presets (🥁 Beat lab, 🚀 Space band, 🐾 Zoo party, 🎹 Piano-ish). Tapping one loads it; the kid's hand-made keys are kept as ⭐ My keys first, so nothing is lost. ⭐ Save this layout names the keys (a typed name, up to 24 characters); the layout on the keys can be renamed or deleted (two taps). In the middle, the 40 keys (a tapped key plays). Below, **Sounds**, by group (🎤 My sounds, then the kit's groups): tap sounds to pick them, then tap a key, and they land from that key on; tap a group twice to fill the emptiest row. Or drag: sounds onto a key, a group onto a row, a key onto a key (swap), a key off the board (No sound); a drop on nothing flies back. On a touch screen a drag starts after a short hold, so a swipe still scrolls. Sounds in the way move to free keys, and the note says what didn't fit. ↩️ Undo, and ↺ Reset keys (two taps). A focused key clears with Delete; a keyboard's own letter keys work as taps. On phones the keyboard sticks under the title while the sounds scroll, ten keys across even at 320 px. Saved layouts are IndexedDB `layouts` and ⭐ My keys is the deck's `mine`; both sync and ride in backups (ADR 0014). A layout or ⭐ My keys saved before the number row loads with that row empty; the ready-made ones fill it. The rules are in `keyset.js`, the view in `dj-keys.js`.
- **Beats** (🥁 Beats in the toolbar): each person has one open beat, the same with ⌨️ Keys on or off (ADR 0008, ADR 0017). With nothing else open it is their **scratch beat** (ADR 0020, `web/scratch.js`): an ordinary `beats` record under the reserved id `beat-scratch-<person>`, never in 🗂️ My beats, the chips, a song's beats or Share, saved only once it changes, so it syncs and backs up like any beat. Its name bar says "Scratch beat" (or "Ska (scratch)" after a groove; the groove's name is what it is stored under) and has 💾 Keep where ✏️ is: Keep turns it into a beat of its own in 🗂️ My beats, named "<fun name> (<groove> version)" after a groove (`names.js` `keptName`, which shortens to fit 24 characters) or a fun name, which opens; the scratch starts empty again. The open beat saves itself as it changes (IndexedDB `patterns` holds each person's open beat, no record when the scratch is open, `beats` every beat; a `decks` record from an older copy may name the keys view's own open beat (from when it was a screen of its own) as `beatId`, which nothing reads and the deck drops when it next saves, so that beat stays in 🗂️ My beats). The beat bar renames it, starts afresh with 🆕 New (it stops the beat playing and opens the scratch blank: no rows, one bar, 100 BPM; nothing joins 🗂️ My beats, and a scratch with rows it empties is said in the Undo line, which brings it back with the beat open before; with Keys on that line is the keys' own), or 🗂️ My beats (just 🗂️ under 560 px) opens another (duplicate, ⬇️ save as a `.beat.json` file, delete, make it a sound; 📥 Load a beat file brings one in, kit sounds only); deleting the open beat opens the scratch. 💃 Grooves: 33 ready-made beats grouped by style, many with bass and chords; one loads into the scratch (📝 Into my scratch, the default) or adds its hits to the open beat (➕); a scratch with hits it replaces is said in the Undo line. With Keys on a groove loads stopped, ▶ Play loops it behind you, ● Record adds your hits, and ↩️ My beat undoes the load; ▶ beside each groove in the chooser plays one pass of it, at most 4 s. Under the beat bar, pattern chips fill 8 numbered spots: beats pinned with 📌 in 🗂️ My beats first, in the order pinned (a beat record's `pinned` time, kept in backups and the cloud, left out of copies and share codes; ADR 0021), then the beats used most recently (opened or changed: the library's `saved` stamp), shown oldest made first, so a tap never moves a chip; the open one is lit; a tap opens that beat, and while it plays the chip waits (⏳) for the next bar line, where the new beat takes over without a gap. They wait while ● Record records. 🎚️ after the bars opens the Mixer for the open beat: a column per row (a vertical fader for its loudness, Mute, Solo, one effect from the sound sheet's: Room, Hall, Echo on the beat, Muffled, Bright, Crunch, Warble, Robot, Louder) and a Master column (the whole beat's loudness and one effect; All on clears mutes and solos); on a phone the columns scroll sideways inside it. Solo, effects and the master save with the beat as `solo`, `fx` and the beat's `volume` and `fx`, left out at normal (ADR 0018); `web/mixer.js` builds the graph every hit plays through. ⌨️ Keys off and on share one beat panel: the same title bar (🥁 name ✏️ or 💾 · 💃 · ⌨️ · 🆕 · 🗂️), the same control bar (▶ Play, ● Record with Keys on, the tempo, ⏲️, then the bars, on one line from 601 px) and the same row parts, drawn by `web/beat-row.js` (emoji, pills, then 🔔 · 🔊 · 🧹 · ✕ at the right, each the same outlined square, `.icon-btn` in `styles.css`, lit yellow when on (🔔 on, 🔊 muted), red while asking, with 🔊's loudness as a bar along its bottom; tap the emoji to change a row's sound with Keys off, or its picture with Keys on). With Keys off each row starts with one header line, like a list item (⠿ grip · ▾ fold · emoji and the sound's name, cut short with …, at the left; 🔔 · 🔊 · 🧹 · ✕ at the right) and its pills fill the width below; a collapsed row is just that line. Every button on it stays 44 px: where the line is short of room (measured on the line itself, under about 360 px), 🔔 🧹 ✕ move into a ⋯ at its end, whose menu lists them as 🔔 Overlap, 🧹 Clear and ✕ Remove and taps the real button, so Overlap shows ✓ when on and Clear and Remove still ask first, with Undo (`web/overflow.js`, the helper for any line that runs out of room). With Keys on each row is one compact line: emoji · pills · tools. A tap on a pill switches it on or off; holding it (or Shift-click, Shift+Space) makes a loud hit (white ring, about 3.5 dB up). Before open beats joined the library, the beat on screen was saved per person
  in IndexedDB as `{name, bpm, rows: [{clipId, steps}]}`, where each row is a
  sound and 16 steps, one bar of 4/4 at a quarter beat a step. A row can use
  any person's sound; the chooser groups them by person, current board first.
- **🎼 Song** (🎼 Song in the toolbar, for everyone) is a playlist (ADR 0024): a song has its own tempo (60–180 BPM; ➖ ➕ by 5, or typed; the first beat put in sets it) and 4 lanes to start, up to 8 with ➕ Add a lane. Each lane has a name and picture (a fun default, 🥁 Drums, 🎸 Bass…; tap them for a sheet to rename it or pick from the picture chooser, with "…" for every emoji) and a speaker like a beat row's (tap mutes, hold or drag sets its loudness). Time runs across, in bars of 4/4 at the song's tempo, with bar numbers on top; the lanes scroll sideways inside their box, and on a phone (under 700 px) four lanes show at once and the rest scroll down. Above the lanes, a strip of the person's beats in 🗂️ My beats (the pattern chips' look): pick one, then tap a spot on a lane to put a **block** there, played once; it stays picked to put more. A block covers the bars its passes reach into (a 2-bar beat takes two; a 3/4 bar three quarters of one, rounded up), never overlaps another on its lane ("No room there"), and plays at the song's tempo, its passes back to back. Tap a block to select it: drag its ⟷ end, or ➖ ➕, to repeat it (up to where the next block starts), 🗑️ takes it off (asks first); ↩️ Undo takes back any change to blocks, lanes or tempo. With a keyboard, Tab to a lane, ← → to a bar, Enter puts the picked beat there or selects the block, + and − repeat it, Delete takes it off. ▶ Play song plays every lane together from bar 1, or from a bar number tapped in the ruler, with a playhead; blocks playing light up. 🔊 Save as a sound renders every unmuted lane, mixed, up to 3 minutes, to a new pad; a share's preview does the same. A block whose beat was deleted shows greyed and is skipped; should a beat grow so that a block runs into the next, the later block cuts it there. Songs are a list, like beats: with nothing else open the person's **scratch song** is (`song-scratch-<person>` in `songbook`, never listed; 💾 Keep makes it a song in 🗂️ My songs with a fun name, ADR 0020), the open song saves itself, and the song bar renames it, 🆕 New opens the scratch song blank (nothing joins 🗂️ My songs; a scratch with blocks it empties gets an Undo line under the lanes) or 🗂️ My songs opens another (duplicate, delete). IndexedDB `songs` holds each person's open song, `songbook` every song (ADR 0006, ADR 0007), as `{id, personId, name, tempo, lanes: [{name, emoji, muted, volume, blocks: [{beatId, bar, times}]}], slots}`; `slots` (every block in time order, at most 16, ×4 at most) is written for older copies, which play a song's beats one after another. A song from before the playlist has only slots: it opens as blocks on lane 1, back to back, at its first beat's tempo. The rules are in `playlist.js` (pure) and `song.js`.
  A beat is 1, 2 or 4 bars (`bars`, chosen next to Tempo, in the simple
  beat maker too): each row's pills run across every bar, shown as stacked
  blocks, and Save as a sound records the whole beat once. Pills in bars no
  longer shown are kept.
  **🎹 Tune rows and the piano roll** (ADR 0023, `web/notes.js` the rules,
  `web/roll.js` the screen): 🎹 Add a tune (beside + Add a row) makes a row of
  the kit's C note that plays notes, and any row becomes one with 🎹 Tune in its
  sound picker (off again asks first when notes would lose their pitch or
  length). A tune row stores `melody: true` and `tune: [{p, s, l}]`: the pitch
  in semitones above the sound's C (0 is the sound as itself, LOW −24 to HIGH
  36), the start and the length in pills (whole pills; halves with Advanced).
  Its `steps` light where notes start and its old per-pill `notes` (the nearest
  of the old five-note scale) are worked out from them, so the compact row
  previews the tune (starts lit, held pills half lit) and an older copy of the
  app plays it roughly; a row an older copy stored is read as notes a pill
  long. Each note plays the sound sped up or slowed down (a sampler) and fades
  at its end; a tune row's notes overlap, so it plays chords. The roll is a
  screen of its own, opened by the row's emoji or any of its pills (⌨️ Keys
  off or on): note names up the side (C rows brighter), the bars across; a tap
  on a square adds a note a pill long (heard when the beat is stopped), a
  sideways drag on a note stretches it, a tap on a note takes it out, ↩️ Undo
  steps back. The scale lock shows only C major's white keys (♯ All notes
  shows twelve); two octaves show at a time, moved by ⌃ ⌄ or a vertical swipe;
  a strip on top shows the other rows' hits, ▶ Play plays the beat with a
  playhead, ½ Half pills (Advanced) halves the squares, ✅ Done goes back.
  💃 Grooves load their bass rows as one tune row of Bass C (chords stay rows of pills).
  Every row has a speaker (`web/row-volume.js`): a tap mutes it (`muted`: its
  pills stay, it plays nothing, live or in Save as a sound), and a hold, drag or
  Shift-click shows a loudness slider beside it. The row's
  `volume` (0 to 1, left out at full; an older copy plays it full) scales every
  hit, live, in Save as a sound, songs and share previews, and a quieter row's
  pills draw fainter. ↑ ↓ on the speaker step it by 10 %; Undo takes back a run
  of changes. The keys view's grid has the same speaker, small. The beat maker is otherwise simple by default (4/4, no
  other row controls); ⚙️ Settings →
  Level → Advanced turns on each row's speed and each beat's time
  signature (4/4, 3/4, 5/4, 6/8, 7/8: a pill is always a sixteenth, BPM always
  counts quarter notes; rows keep 16 pills unless a longer bar used more).
  Each row also stores `rate` (½, 1 or 2: the row runs that much faster than
  the beat) and `ring`. (Per-row pill counts and BPM were tried and removed
  for simplicity on 2026-10-10; old values are ignored.) A row's sound still playing
  at its next hit fades out over 8 ms (a hard cut clicks) unless the row's
  🔔 Overlap is on (stored as `ring`; at every level, on the row's header line
  before its speaker, and on the keys view's rows), which lets up to 8 hits
  overlap (`rhythm.js` `ringOver`); a tune row's notes always overlap and it has no 🔔. A limiter on the master
  output keeps stacked sounds from clipping. Each play logs its hits, cut-offs,
  overlaps and limiter depth to the in-memory event log (`web/log.js`). Beats are
  open documents that save themselves into a per-person library (IndexedDB `beats`):
  the name bar has ✏️ rename, 🆕 New (a blank scratch) and 🗂️ My beats (open, ⧉ duplicate, 🗑️ delete, which
  asks first). **🔊 Make the open beat a sound** (in 🗂️ My beats) renders the whole beat, every bar, once, to a
  WAV and adds it as a 🥁 pad, stored like a recording with `exact: true` so it
  keeps its full length (no silence trimming) and loops on the beat.
- **A new device starts with one board, with a fun name and a picture.**
  boards.json lists no people, so whenever no one is on show (a new device, or
  storage that won't open) the app adds one person (`soloPerson` in
  `model.js`): a fun name ("Friendly Sloth", "Captain Cranberries") and a
  random picture, never "Me"; "My sounds" then the Presets. An older copy's "Me"
  gets a fun name when the app starts.
- **People from an older boards.json are kept.** It once listed people of its
  own, and a device stored only what it changed about them (their names were
  in the file). On every start, `adoptStoredPeople` (`state.js`, rules in
  `model.js` `adoptPeople`) turns each person id that stored data names, but
  that is in no boards.json and has no `added` record, into a person added in
  the app with the same id: the device's own name for them, else a fun name
  and a picture (🎲 rerolls it), and their color, else the next free one. One the device had
  deleted comes back deleted (under Bring back) if anything of theirs is still
  stored; a bare deleted record is removed. Older sounds found on this device
  do the same; backups (from 1.0 on) never hold such people.
- **Every person id is random** (`p-…`). Those older people's ids were the
  kids' names, so on start `reIdStoredPeople` (`state.js`, rules in
  `reid.js`) gives each one a new id, and everything that names the old one
  follows in one IndexedDB transaction: their sounds, kit edits and copy ids
  (`<id>-kick`), pad order, beats, keys and layouts, takes, songs, settings, the cloud
  link, the remembered person, the address. The old id is remembered on the
  device only (settings `renamedPeople`, never backed up or synced), so an
  old backup or older sounds found land on the same person. A profile in the cloud
  under an old plain id is not renamed: the device drops that link and puts the
  person up as new (Cloud profiles, below).
- **People** (the corner avatar → 👥 People; not in Settings): people added in the app (and any
  renames and recolors of people boards.json lists) live in IndexedDB
  `people`, with `avatar` (an emoji) and `fun: true` (a generated name).
  👥 People is a short list, one line per person: picture, name, counts and
  ☁️ state (🔒 with a PIN). Tapping a line opens their profile sheet
  (`#profile-dialog`, `people.js`): 🎲 Pick a name, the picture, every person
  color, ☁️ Cloud, 🔒 PIN (set, change, remove, 🙈 Forget on this device) and
  Delete. With a PIN on their cloud profile, changing the name, picture or
  color asks for it once per visit (until a reload; typing it to open them
  counts), checked like an open (`cloud.js` `pinGuards`, `checkPin`); without
  one, anyone can. It gates the sheet only: syncs apply as before.
  Nobody types a name: a tap on 🎲 opens Pick a name, a dozen fun names and the
  special names to choose from (🎲 More names deals another dozen); closing it keeps the name. Deleting someone who is in
  the cloud deletes them from this device only (📴 Offline deletes the cloud copy). Anyone can be deleted (two taps), with their recorded sounds,
  saved beats, beat on screen and pad order. A boards.json person can't leave
  that file, so deleting one keeps only a hidden record; the People dialog
  lists hidden people under "Deleted — bring back". The last person on show
  can't be deleted. Under each name, a row says how much that person has on
  this device, kinds with none left out: "🔊 27 · 🥁 4 · 🎼 1 · 🎬 1", or
  "nothing yet" (`personCounts` and `countsText` in `web/model.js`).
- **One emoji per kind** (`KIND_EMOJI` in `web/model.js`): 🔊 sounds,
  🥁 beats, 🎼 songs, 🎬 takes, ⭐ my voices, 👥 people, ✏️ sound edits,
  🎛️ key sets, 🔗 shares, ⌨️ key layouts. Every count or kind name uses it: People, the
  backup line, the notice after a load, 🔗 Share.
- **Backups** (⚙️ Settings → 💾 Save a backup / 📂 Load a backup). Above the
  buttons, worked out each time Settings opens, a line says what a backup
  would hold by kind ("A backup now holds 🔊 27 sounds · 🥁 4 beats · 🎼 1 song ·
  👥 2 people · 12 MB of audio"; kinds with none are left out); the notice after
  saving says it again with the file's size. The words come from
  `holdsWords` in `web/old-backup.js`, so the older-sounds section says them
  the same way. A backup is one zip with
  `backup.json` (people, sound records, edits, pad order, beats, saved beats,
  takes, songs, keys and key layouts, settings; a loaded setting is kept only if this copy of the
  app knows the key and the value) and `sounds/<id>.<ext>` for each sound made
  in the app. This is how sounds move between devices or addresses (each
  address has its own browser storage). `web/backup.js` checks every field of
  an imported file (`cleanBackup`, which older sounds found go through too);
  `web/zip.js` is the no-library zip code.
  - **Format 1.1** ([ADR 0011](adr/0011-backups-1-0-merge.md)): a backup
    says `app: 'noodlepads'` (`'noodle-pads'` before the 1.0 rename, still read), `format: '1.1'` (1.1 added groups, ADR 0013, and key layouts, ADR 0014), and any `1.x` loads. A backup
    from before Noodle Pads 1.0 (an app id ending in `-soundboard`, or
    `format: 1` as a number) still loads, through the same old-store
    conversions as older sounds found on this device, for the testing copies' backups. That
    path goes after launch.
  - **Older sounds found on this device** (⚙️ Settings, shown only when
    there are some; `web/leftover.js`): sounds an older copy of the app saved
    on the same address, under the database's old name (Ben's dev server at
    `localhost:8765`, say), found by their stores through
    `indexedDB.databases()` (the one with a `clips` store and an `overrides`
    or `people` store, so any old version). **📥 Bring them in** checks them
    with `cleanBackup` (at most 2 GB of sounds in all) plus the conversions
    only pre-1.0 data needs (`oldStores`, `readOldStores`: old `boards.json`
    people become added people; the old starter sounds are presets under the
    same ids, so a kid's edits of them come as preset edits, and the spoken
    name clips are left out, `web/starters.js`), merges them like a loaded
    backup, and says what came and, in plain words, what was left out and why
    (`leftOutNote`). Each record is saved on its own, so one the browser
    refuses never stops the rest; the notice names it. **💾 Save everything
    it left** saves everything this address saved except the app's own
    database (`web/old-backup.js`), as `noodlepads-everything-<date>.zip`:
    the older database as `backup.json` (format 1, every store raw) with
    every sound's audio byte for byte, which loads through 📂 Load a backup;
    every other database under `everything/<n>-<name>/<store>.json` (records
    raw, keys kept when the records don't hold them, any Blob byte for byte
    under `blobs/`); and `everything/localStorage.json`, which the loader
    ignores. The section says what there is by kind first. Nothing found is
    changed or deleted.
  - **Loading merges** (`web/merge.js`): people, sounds, saved beats, saved
    songs and takes are matched by id. The same record is skipped; a
    different one under an id already here is kept too, under a new id, with
    everything that names it pointed at the new id. A person both sides have
    keeps the newer rename (`edited`), else this device's. Pad orders, open
    beats, keys, open songs, kit edits and settings stay this device's. An
    empty default first person (`isDefaultPerson` in `model.js`) is never brought in,
    and this device's own goes once someone else arrives. Nothing here is
    deleted, and loading the same backup twice changes nothing. The notice
    says what came: "Added 3 sounds, 2 beats; 4 already here."

A clip in `boards.json` (in a person's `clips`, or in `kit` with a `group`):

```json
{ "id": "pip-airhorn", "label": "Airhorn", "emoji": "🎺", "color": "red",
  "file": "clips/pip/airhorn.wav", "voice": "robot" }
```

`color` is a name from the file's `palette`; `voice` is optional (one of the
ids in `web/voices.js`). `amount` is optional and only used by five voices,
which kids set with a slider (Loudness as ten keys, while they fit): `loud` (Loudness: 1–10, default 10, the loudest), `chipmunk` and `monster` (Pitch: 1.2–4 times
higher or lower, defaults 1.7 and 1.6) and `fast` and `slow` (Speed: 1.2–8
times faster, default 1.6; 1.5–20 times slower, default 6). A person is `{id, name, color, clips}`; their color is
the board's casing, so pick a deep one that white text reads on.

The palette was renamed on 2026-09-27 (`tomato` became `red`, and so on). Sounds
saved in a browser before then keep the old names, and `model.js` maps them to the
new ones (`OLD_COLOR_NAMES`).

## Cloud profiles

Everyone on a device goes to the cloud once they make something: one shared
list on noodlepads.com. Their sounds, beats, songs, takes, keys and layouts, kit edits
and settings then open on any phone or tablet, and changes on one device reach
the others. Design and free-plan budget: `docs/design/cloud-profiles.md`; why:
ADR 0002.

- **By themselves.** A person who has made something (a sound, beat, song,
  take or kit edit) goes to the cloud on the next sync. A typed name from
  before is swapped for a fun name first, so it never leaves the device. A
  person who has made nothing (a new device's empty first board) stays here.
  👥 People → ☁️ Open from the cloud puts someone from the list on this device.
- **📴 Offline (this device only)**, in a person's ☁️ Cloud: deletes their cloud
  copy (tap twice; the PIN if it has one) and keeps them out of the cloud.
  ☁️ Put back in the cloud undoes it. A person taken out of the cloud on
  another device goes Offline here too, rather than coming back by itself.
- **Names are made up.** Nobody types a person's name: `names.js` `funName`
  makes alliterative ones ("Admiral Avocado"), 🎲 picks another, and the
  round picture picks an emoji avatar: one from the short list, or any one
  from its … (every single emoji in `web/emoji-all.js`; no skin tones,
  country flags or joined sequences like families). A short list of special
  names (`SPECIAL_NAMES`: "Salacious Crumb") is never made at random; it is
  accepted everywhere a fun name is. The Worker refuses any other name, and
  any avatar that is not exactly one listed emoji.
- **The device is the working copy** (IndexedDB, offline first). A person in
  the cloud syncs on open, 20 s after the last change, on every focus and
  blur, and every 5 minutes while the page is shown and focused
  (`sync-timing.js`): a pull, a three-way merge, then a push
  (`cloud-sync.js`, `merge3.js`). Each record is merged against its copy
  from the last sync (IndexedDB `bases`): unchanged on one side takes the
  other; changed on both merges field by field (a beat pill by pill), the
  newer edit (`changed`) winning a setting both changed; where no merge is
  safe, both are kept. Deleted on one device and edited on another keeps the
  edit. A push never overwrites an edit it hasn't seen. Each device's link
  (its key, how far it has synced, what it sent) is IndexedDB `cloud`; it
  and `bases` are never in backups.
- **Settings travel with the person** (IndexedDB `prefs`, `settings.js`
  `scope: 'person'`): Advanced, the time signature, pad size. The
  keyboard, problem reports and the device code stay with the device.
- **PIN:** optional, 4 digits, in a person's profile sheet (once they are in
  the cloud). It is asked each time that person is opened, unless the PIN
  pad's "Remember on this device" was on; 🙈 Forget on this device asks every
  time again. It is also asked, once per visit, before their name, picture or
  color changes. 5 wrong tries mean a 10-minute wait.
- **🔗 Share…** (in a person's ☁️) gives a code like `ABCD-2345` for one sound,
  beat or song: a snapshot, read-only. Shared already lists that person's
  codes; 🚫 Unshare (two taps) ends one for everyone (the Worker deletes it,
  and audio nothing else uses). ⚙️ Settings → 🔗 Sharing → 🔗 Shared with me
  opens a code: ▶ Play, 🎛️ Remix (an editable copy on your board, named
  "<title> remix", that stays after an unshare), ✕ Remove (two taps) takes
  it off this device's list. An unshared code shows "No longer shared".
- **Ids are random.** A profile's id is its person's random id (`p-…`); the
  Worker makes, lists and syncs no other, and the app's API client refuses
  any other before sending. Nothing renames a profile: a device still linked
  to one under a plain id drops the link and puts the person up as new under
  their random id (none are left live). A share never says whose it was.
- **No cloud here** (the dev server, `just look`): the app says "The cloud
  isn't reachable from here" and everything else works. `tools/serve.py`
  answers `/api/cloud` with `{ok: false}`.

## For grown-ups

- **A forgotten PIN:** email the PIN-reset address with the profile's fun
  name. Ben clears it by hand (`just cloud-reset-pin <profile id>`); then each
  device opens the profile once with no PIN.
- **To delete a profile and everything in it:** 👥 People → tap them → ☁️ Cloud →
  📴 Offline (this device only) (tap twice; it asks for the PIN if it has
  one). What it shared stays shared.
- **What's private:** read [Privacy](../README.md#privacy) in the README. Everyone who makes something is
  in the public list unless set Offline.
- **Managing the database** (Ben): `just cloud-profiles` lists every profile;
  `just cloud-prune --days 180 --empty` shows idle and empty ones and loose
  sounds, `--yes` deletes them; `just cloud-migrate` brings the live schema up
  to date (`worker/migrations/`). Every deploy checks the live cloud with a
  throwaway profile of its own (`just cloud-smoke`, `just cloud-e2e`), made
  and deleted in seconds; `just cloud-prune --smoke` clears one a killed check
  left.
- **Player metrics** (Ben, ADR 0016), for people in the cloud only: each
  sync also sends the person's feature-use counts (`web/uses.js`: screens,
  tools, every dialog opened) and a summary of each finished visit
  (`web/visits.js`: seconds in view, screens, level, load time, the sound's
  delay, errors as file:line). D1 keeps them 14 days (a device's row 90).
  The telemetry runner (pdxfixit/telemetry) harvests them daily, with
  Cloudflare's stats for the site, and keeps them (ids a year at most).
  `just cloud-stats` reads only its mirror, as `telemetry.py pull` leaves it on
  the Mac (`~/.local/state/telemetry/telemetry.sqlite3`, read only; or
  `$TELEMETRY_DB`), lists what each player
  made, and shows per player: devices (type, browser, OS, width, app version,
  syncs, first and last seen), places (the country; nothing finer is kept),
  activity over the last 14 days (`--days N`) and by hour, feature-use counts
  and visits; then every visit's errors by where they came from. A player
  seen from more than one place is flagged ⚠️. Test profiles are left out.
  Deleting a profile deletes its metrics in D1, not in the runner's copy.
- **Usage events** (Ben, ADR 0026), in the shared telemetry standard:
  `web/telemetry.js` records one event at a time (screens, dialogs, every
  control tapped, beats, songs and takes started and finished, settings
  changed from and to, errors as file:line, load time); `web/track-page.js`
  says where each comes from. flarepress's shared client
  (`web/events-client.js`) batches them to `POST /api/events`, which stores
  each batch in the R2 bucket `noodlepads-telemetry` for the telemetry
  runner. Every device sends, in the cloud or not (Ben, question #425:
  "Yes, everyone"), with its own random code, never a profile.
  📊 Share play data, a checkbox in ⚙️ Settings → 📊 Data sharing (the `sendUsage` setting,
  on by default) turns all of it off, the player metrics above included.

## Keyboard and screen readers

Every control is a real button or field. On the board: Tab to a pad and Enter or
Space plays it; **Shift+Enter** (or Shift-click) keeps it repeating (Enter again stops it);
a key does the same. Shift does what a hold does wherever there is one: a
row's speaker opens its slider, a voice chip shows its recipe, 🎲 opens Pick a
name, a pill turns loud. 1–9
play the first nine pads on 🔊 Pads (where the keys show, the number row plays them), ← → change person, Space or Esc stops everything (Space
not while typing or on a focused button, which it presses; Shift+Space is a pill's loud hit). In Edit
sounds, Enter picks a pad up, Enter on another swaps them, Enter on the same
one again opens its editor. In the beat maker the 16 pills are one Tab stop;
arrow keys move between them and Space toggles one. Dialogs trap focus and hand
it back when they close. Changes with no visible text (a swap, a pick-up) are
spoken through a hidden live region.

The people row shows one tab per person while their names fit on a line. It
measures that (on load, on resize and when the web fonts arrive), and when the
names don't fit it shows one menu button instead: the current person in their
color, opening a list of everyone (arrow keys, Home, End and Esc work).

## Limits on what comes in

Backups, older sounds found on this device, uploaded files and `boards.json` are treated as untrusted. A backup
may unpack to at most 300 MB, hold at most 5000 files, `backup.json` at most
8 MB, each sound at most 80 MB (a 3-minute song saved as a sound is 35–69 MB),
older sounds found 2 GB in all, and record counts are capped; anything
malformed is dropped, and the notice says what and why ("Left out: 1 sound
whose file isn't a sound file"). A sound stored with no type or a video type
keeps its audio. A person's avatar must be exactly one emoji from the full
list (`web/emoji-check.js`), in a backup and at the Worker; a sound's picture
is at most 8 characters. A chosen sound
file must be under 10 MB and 120 seconds. Rendered voices are cut at 180 s.

## Versions and updates

The corner shows the release first (`RELEASE` in `web/util.js`, now 1.0; raise it with a CHANGELOG.md section), then the build. every deploy runs the stamp, which writes `web/version.json`
(`git describe --tags --always`, plus `-dirty` for uncommitted edits in `web/`
or `worker/`, and the time; gitignored). The app shows
it small in the bottom corner, so the live site says which commit it is; a
`-dirty` suffix means uncommitted edits were deployed. Without the file (the dev
server) it shows "dev copy". Tapping the version or date opens ⚙️ Settings
scrolled to the bottom, at About and the credits. A deploy that skips the stamp (wrangler run by hand)
leaves the previous version showing; flarepress warns when the stamp is old.

**🆕 An update for Noodle Pads is ready.** A page left open keeps the code it
loaded. The app asks `version.json` (`cache: 'no-store'`) when the page is
focused or shown again, at most once a minute, and every 10 minutes while it
shows. When the live version differs from the loaded one, a bar at the top
offers **Reload** and ✕ (hidden until the next check, 10 minutes later or on coming back). It floats over the bottom, above the toolbar, and does not fade.
It neither asks nor shows while a sound is recorded, a beat, song or take plays,
a pad loops, or any sheet or dialog is open (the sound sheet keeps its edits
until Save), and catches up after. Everything else is already saved in
IndexedDB, and cloud sync runs again on start, so Reload loses nothing. A dev
copy never asks (`web/update.js`).
