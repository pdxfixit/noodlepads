# How Noodle Pads works

The full guide to the app: every screen, what each control does, and how
what a kid makes is stored. The short version is the [README](../README.md);
the file map is [layout.md](layout.md). ❓ Help in the app says the same
things in one line per control.

- [Pads and the sound sheet](#pads-and-the-sound-sheet)
- [Wide screens](#wide-screens)
- [🧸 Kids](#-kids)
- [🎧 From a song](#-from-a-song): a song's beat, heard live
- [Help](#help) and [Settings](#settings)
- [How sounds are stored](#how-sounds-are-stored): the kit, Edit sounds, voices, the keys, Beats, Song, people, backups
- [Cloud profiles](#cloud-profiles) and [For grown-ups](#for-grown-ups)
- [Keyboard and screen readers](#keyboard-and-screen-readers)
- [Limits on what comes in](#limits-on-what-comes-in)
- [Versions and updates](#versions-and-updates)
- [Installing it](#installing-it), and opening it with no network
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
only this). On the sheet itself, beside 👂 Plain and at every level, on a
sound a kid made (never a preset), 🔊 **Even it out** turns the whole sound up
or down until it seems as loud as the presets:
every sound already plays with the same loudest moment, but quiet talking with
one loud clap stays quiet, because the clap sets that peak. It measures how
loud a sound seems (`loudness.js`: BS.1770 K-weighting, the loudest 400 ms,
channels averaged) against `PRESET_LOUDNESS`, the median of the presets shown
with Advanced off as the app plays them (a test recomputes it from
`web/clips/kit/`), and adds one gain edit over the whole recording, up to 8×
either way, so it is kept, backed up and synced like Louder and an older copy
plays it the same. Like Louder it keeps the sound's own level, its peaks held
under full scale by the voices' soft ceiling. Within 1 dB already, the banner
says so and nothing is added; ↩️ Undo in the banner takes it back. Every
folding section on a light sheet or dialog (the sheet's Voice and Layers,
⚙️ Settings, 💃 Grooves, the "…" emoji list) is a bordered panel, and on 🔊
Pads each group sits with its pads inside a light outline (`.pad-fold`; an
outline takes no room, and the box takes the bed's own columns, so the pads keep them and the outline hugs its header at every width). 🧩 **Chop into pads** cuts it where
each sound starts and makes each piece a new pad ("Baby Burp", "Burp Jr.").
The **pad size slider** at the top left of the pads, on the panel's darker
top band with ✏️ Edit sounds at its right (as 🎤 Live's ● Record and 🎬
Takes), says "Size" where it has the room and makes them smoothly
smaller (more on a line) or bigger (fewer). Its ends are the smallest and
biggest pads this screen can show: as many 76 px pads as fill a line, and one
whole-width pad on a phone (400 px on a wide screen). It is kept as the
`padSize` setting, the person's own: `auto` (the screen's own size) or 0 to
1, the share of the way from smallest to biggest, so it means the same on
every screen (`pad-size.js`) and on 🧸 Kids, which shows the same size
between ends of its own.

**Pad skins** change how every pad looks, each person their own, at every
level (⚙️ Settings → 🎨 Look; the `padSkin` setting, `skins.js`): **Tiles**
(the plain look), **Slam buttons** (a round arcade dome on a dark plate, the
name on the plate under it; the ring round the dome fills as the sound plays,
and pressing sinks it), **Lit pads** (dark rubber with a rim in the pad's
color that lights up full color while pressed or playing), **Switch** (a lever
that flips down, with a light on, while the sound plays), **Spinner** (a dial
that turns once over the sound), **Jelly** (a blob that squishes and wobbles)
and **Googly eyes** (a tile whose eyes dart about while it plays). Every pad
takes it: Pads, the sound chooser, ❓ Help's small pads and 🧸 Kids' picture
pads (Slam there is just the dome). Held to loop, a pad stays pressed in every
skin. With reduced motion, Jelly, Googly eyes and Spinner hold still and glow
instead. `skins.js` puts the skin on the page's root as `data-skin`, and
`styles.css` ("Pad skins") draws each under the nearest `data-skin`, so 🎨
Look's samples show their own skin; a browser without CSS `@scope` shows Tiles.

## Wide screens

or desktop, up to 2400 px of content (centered beyond that). From 1400 px a
screen with two parts shows them side by side: ❓ Help two columns, and the sound sheet the sound and how it looks beside
Voice and Layers. Beats never splits: with ⌨️ Keys the beat's rows stay over the
keys, full width, for programming and dragging pills. Limits keep it sensible: pads stop at 400 px, the
keys at 1500 px, and text at a readable line.

## 🧸 Kids

A person on the 🧸 Kids level (ADR 0019; `kids.js`, its pure parts in
`kids-logic.js`) sees four picture screens in place of the regular app, for a
five-year-old, with no words to read and nothing to delete, edit or share:

- **🔊 Pads**: big picture pads, the kid's own sounds first (newest first),
  then only the presets whose picture shows the sound they make, funniest
  first (`kids-logic.js` `KIDS_PADS`, 69 of them: the animals, the silly
  ones, effects, game and sci-fi sounds, spoken callouts with a face or sign
  that says the word, then the drums that look like what they are). A 🍎 that
  plays a note, a 🌞 chord, a 🐘 bass note or a 🎩 hi-hat never shows: their
  pictures teach a grown-up something and a small kid the wrong thing (Ben,
  2026-10-22). A preset a grown-up hid in ✏️ Edit sounds stays hidden here
  too. Swipe sideways for more pages (◀️ ▶️ with a mouse). The top
  bar's slider, centered between 🎨 and ⚙️, makes them bigger or smaller,
  smoothly: the person's own `padSize`, the same one as Pads' slider, between
  Kids' own ends (four across a phone, four per 560 px wider, up to one pad
  filling the line; `auto` is three across). Pads are square at an exact size,
  as many as fit, the room left shared evenly (`kids-logic.js` `kidsPadPx`,
  `pageShape`). A pinch moves the same size, smoothly, and the slider follows;
  it is kept as the fingers lift. An older copy's `kids-size` in localStorage
  is ignored. A tap plays from the start; no holding or looping. The round button at the top left shows the
  person's pad skin; each tap moves to the next one (Tiles after Googly eyes)
  and keeps it, as ⚙️ Settings → 🎨 Look would.
- **🎙️ Record**: tap the big mic and it counts 3, 2, 1 on its face (a beep
  each), then listens until the next tap; or hold it and let go to stop
  (Ben, 2026-10-22: "both should be capable"). A press under 350 ms is a tap
  (`kids-logic.js` `pressKind`); the hold's first moments are thrown away and
  the count starts, on the microphone already asked for. A tap during the
  count calls it off. While it listens the ring fills over the 10 s it may
  run, and the mic swells and glows with how loud the voice is right now
  (`--kids-level`, from an analyser on the microphone; under reduced motion
  only the glow moves). A recording under 0.3 s or silence keeps nothing.
  It becomes a pad of the kid's own, saved as the sound sheet saves one, and
  plays. 🤖 Robot, 🐭 Tiny (Chipmunk) and
  👻 Spooky (Monster with Stadium's echo) light for the next recordings and
  change the last one at once; tap a lit one for Normal.
- **🥁 Beats**: four drums (kick, snare, hi-hat, clap) of eight squares, ▶️/⏹️,
  🐢 80 and 🏃 140 BPM (neither lit: 110). One beat per person: their
  scratch beat (ADR 0020), saved on every tap (a square is every other pill
  of a 16-pill bar), so the regular app's Beats opens it whenever nothing
  else is open. A kids beat from before (`beat-kids-…`) becomes the scratch,
  or a beat in 🗂️ My beats when the scratch already has hits.
  Across on a wide screen; down the screen on a phone.
- **🎹 Keys**: eight colored keys that play while held, several fingers at
  once (A S D F G H J K on a keyboard). They are pentatonic, always, so no
  note sounds wrong: C D E G A, then high C, high D, high E. A high key plays
  its low note's kit sound an octave up (twice as fast, as a tune row's note
  does; `kids-logic.js` `KIDS_KEYS`) and wears the same fruit a size
  smaller, with a small ✦. Lying down like a xylophone on a phone. The round
  button at the top left, like Pads' skin button, shows who plays them by
  its picture; each tap moves to the next of Pluck, Piano, Marimba, Steel
  drum and Kalimba (`KIDS_INSTRUMENTS`; round again), keeps it as the
  person's `instNotes`, so each key plays its note on that instrument
  (`keyKitId`), keeping its fruit, and plays a C on it so the change is
  heard. Every key wears the same picture small at its far end (the left end
  on a phone, the top on a wide screen), so the whole screen says who plays
  (Ben, 2026-10-22: the toggle must show "whatever the mode currently
  playing is"). Beside it, **●** records a tune (Ben, 2026-10-22: "there
  should be a record button… compose a little tune in here… save it and use
  it again in the grown up mode"): a tap counts 3, 2, 1 on its face at the
  beat's tempo (a beep each), then the kid's beat starts round from its
  first pill and goes round once through its bars while every key pressed
  lands as a note on the nearest pill, held keys as long as they were held
  (`kids-logic.js` "● Record": `pillAt`, `withTuneNote`). The beat grows to
  four bars for it (`withBars`, the drums' bar repeated; a square tapped on
  Beats lands in every bar, so the grid still shows one pattern), and the
  tune is one tune row (🎹, ADR 0023) of the scratch beat, on the C of the
  instrument playing, each key its note above it. The ring round ● fills as
  the beat goes round; it stops by itself as the beat comes round (or at the
  next tap, ⏹️, or leaving the screen), and the beat plays on with the tune:
  Kids' ▶️ plays it too, on the Beats screen and here. The first note of a
  new recording throws the old tune away, so a kid can do it over (an empty
  take changes nothing). A grown-up finds the tune row on 🥁 Beats and in 🎹
  the piano roll, and keeps the beat with 💾 Keep.

⏹️ stops everything. The ⚙️ gear asks a grown-up sum (two numbers from 6 to
9, big number keys; `grown-up.js`, which ⚙️ Settings → About → Feedback asks
too); right opens Settings and the regular app until the page reloads, wrong
goes quietly back. 🧸 Kids mode at the end of the corner menu (the round
button's), or 🧸 at the top of the regular app before ❓ and ⚙️ (from 600 px
wide: on a phone a fourth button wraps the title; it waits at the top, out of
the slim bar) hands it back; choosing 🧸 Kids in Settings does too. The same
🧸 shows Kids to a Regular or Advanced person for this visit, their level
unchanged, so a phone can be handed to a small kid; ⚙️ and the sum lead
out again (Ben, 2026-10-22: a way "to toggle in between kid mode and out
again"; `app.js` `kidsVisit`). The tab is remembered on the device
(`kids-tab`).

## A new person's first steps

ADR 0028. A new person learns the app by playing it; nothing blocks the first
sound.

**Who's playing?** A device's first person (the one the app makes on a fresh
device) and everyone added later (➕ in 👥 People, 👋 Someone new on the PIN
pad or on 👋 Who's playing now?) are asked once, in a dialog over the screen: three big picture cards,
each drawn as a pad in the person's pad skin. 🧸 Little noodler sets 🧸 Kids,
🎵 Tap and make beats Regular, 🎛️ Show me everything Advanced. No ages. A tap
plays a ready-made sound (Pop, Clap, the C chord), sets the level and moves
on; Skip keeps Regular and ends the welcome. Leaving 🧸 Kids still needs the
grown-up sum.

**Pick your stage name** follows in the same dialog: a big face on the
person's color with their name and 🎲, six fun names (dealt as 👥 People's
Pick a name deals them; 🎲 deals six more), a row of seven pictures ending in
… (the full picture chooser), the ten person colors, then Skip and ▶ Let's
play. Each tap changes them at once, through the profile sheet's own paths
(`people.js` `editLook`), so they sync, a PIN guards them and the name stays a
fun name; the screen takes the color as you tap. Skip puts back the name,
picture and color the app gave. 🧸 Kids gets Pick your picture: the pictures
and colors only, keeping the name it was given. Kids' screens come once this
step ends (switching to them closes every dialog).

**One-time tips** (Regular and Advanced, `web/tips.js`): one short line in
the banner over the top, the first time a thing matters, once per person:

| When | Tip |
|---|---|
| Three pad taps on 🔊 Pads | 👆 Hold a pad to make it loop. |
| The first visit to 🥁 Beats (⌨️ Keys off) with no hits | 👆 Tap squares, then ▶ Play. Or start from a 💃 groove. |
| The first visit to 🎼 Song | 🎼 Make a song from your beats: 💾 Keep one on 🥁 Beats, then tap it here and tap a lane. |
| The first visit to 🎤 Live | 🎤 Play the keys like an instrument. ● Record keeps a 🎬 take to play back. |
| The sound sheet's first opening | 🎭 Tap a voice to hear your sound change. Your recording stays as it was. |

At most one shows per screen visit; a tip never takes the place of a notice
or an Undo, never shows over a dialog (the sound sheet's own aside) and never
on 🧸 Kids. What a person has seen is the person setting `seen` (one sorted,
comma-separated list of ids, `web/firsts.js`): it syncs and rides in backups,
it is never logged, and a sync merges both devices' lists, so a tip never
repeats on another device. ❓ Help's 💡 Show tips again clears the tips (and
hint dots) for the person showing.
⚙️ Settings → About ends with one row of quiet links, Privacy policy · Send
feedback · Show the welcome again (two lines on a phone), then the version alone,
as isopix has. Show the welcome again: Settings closes, Who's playing? opens for the person showing, and
their tips and dots come back, as isopix's link does.

**Hint dots** (Regular and Advanced): a small red dot in the corner of ⌨️
Keys, 💃 Grooves and 🎚️ Mixer (every copy, ⌨️ Keys off and on) until this
person first taps each. They are the page's `data-hints`, drawn by
`styles.css` as a `::before` on the buttons: no text to read aloud, and the
buttons keep their size. They follow the same `seen` list (`dot-keys`,
`dot-grooves`, `dot-mixer`), so 💡 Show tips again brings them back.

**🧸 Kids gets no words.** A 👆 hand pulses over the first pad on Kids'
Pads until a pad is tapped, and the big mic wiggles now and then until the
first recording is kept (`kids.js`, `tips.js` `kidsHint`). Under reduced
motion both stay still (the hand still shows). Once per person: `kids-pad`
and `kids-mic` in `seen`, which 💡 Show tips again leaves alone.

**The level-up nudge** (Regular only, `web/nudge.js`): a reach for more is
opening 🎚️ Mixer, opening 🎹 a tune (the piano roll) or opening + Add a layer
in the sound sheet; each is kept with the visit's id in the person setting
`reaches` (the last eight). After three over at least two visits (a visit is a
page load), "🎛️ Want more knobs?" with Try Advanced and ✕ shows once, in the
bar where 🆕 update shows and in its look. A thin line along its foot runs
down, then after about 12 s it fades; a finger, the mouse or focus holds it.
Try Advanced sets the level and offers ↩️ Undo in the banner. ✕, a fade or Try
Advanced mean never again (`nudge` in `seen`). It waits while a dialog is open
or the update bar shows, and hides, unanswered, when an update comes. 🧸 Kids
never gets it (a kid can't read it; leaving Kids is the grown-up sum).

Only the two places that make a person from nothing mark them as new, in
memory (`web/welcome.js`). Anyone stored before, pulled from the cloud or
loaded from a backup is never asked, and a reload before it shows skips it.

For the tests and `just look`, the app's test hook `noodleFirstSteps = false`
(`web/firsts.js`) turns every first step off, so a fresh device there opens on
the app as before. The `welcome`, `welcome-stage` and `welcome-kids-stage` look
views turn them on, `tip-beats` shows a tip, `hint-dots` the dots, `kids-hand` the 👆 hand and `nudge` the level-up nudge.

## 🎧 From a song

A song's beat, heard live (`docs/design/beat-from-a-song.md`). A blue card at
the top of 💃 Grooves, 🎧 From a song with **Listen**, for Regular and
Advanced; 🧸 Kids never sees it, even with a grown-up let into the regular app
(its level hides it whenever Grooves opens). Under the card, "Or start from
one of these:" leads to the grooves. Listen closes Grooves and opens one sheet
(`web/listen-ui.js`; its pure parts are `web/listen-make.js`):

1. **What to listen to.** The ways this device can listen
   (`web/listen-input.js` `sources()`), as large choices: 🗂️ Another tab
   (Chrome or Edge on a computer), 🖥️ Everything on this computer (Windows),
   🎤 The microphone, 📁 A song file (through the browser's file picker,
   under 20 MB). A phone shows only 🎤 and 📁, with a line that another tab
   needs Chrome or Edge on a computer; a computer gets a line on the
   browser's own question (leave Also share tab audio ticked). Last: "The
   song stays on this device and is never saved. Only the beat is kept." If
   the browser says no, the reason shows over the choices.
2. **Listening** (a dark sheet): ● and the time (a file adds how far it has
   read), ■ Stop in red, the parts so far as chips in the order heard (A · 92
   BPM, B · 92 BPM, A again, then the playing one, yellow, "· listening…"),
   and the tempo, signature and swing. Then a row each for the kick, snare
   and hi-hat, its last 3 bars one per line (2 on a phone under 600 px), each
   labelled with its part and bar ("C · bar 22"; the bar alone on a phone):
   new bars come in at the bottom and the oldest roll off the top. A hit that
   fits the part is bright, a one-off dim, the step just heard has a white
   ring, steps not played yet are darker; the hats have their own teal. The
   oldest line fades a little (never so far that a faded fit looks like a
   one-off), and each beat is as wide as its steps (7/8's six wider than its fours). A
   tempo change shows a yellow line ("Sped up at bar 22. 92 → 120 BPM, so part
   C started there"). Before the tempo is found it says "Listening…" with the
   tempo settling ("About 96 BPM…"). The screen is drawn from the listener's
   `snapshot()` at most once an animation frame, only when new sound came,
   and changes only the cells that changed. At a tempo change the listener's
   bar count can step back by one and it has no bars while it finds the new
   tempo: the bars shown stay until the new part's come. Each row's closest
   sound is picked at ■ Stop (the hits' fingerprints come with `finish()`).
   Once it has heard something, only ✕ or ■ Stop ends it: a tap beside the
   sheet (coming back from the song's tab, say) or Esc would lose what it
   heard, so they do nothing.
3. **What I heard**, at ■ Stop (or when sharing stops in the browser, or the
   file ends): a sentence ("1:52 of music, in 3 parts. 4/4 at 92 BPM, then 120
   from 0:52. The hats swing a lot (Shuffle)."), a card per part with its
   letter, name, tempo, bars and how often heard, and ▶ (one pass, at most
   12 s, played as a groove's sample is), the sounds picked, then 🎼 Open it as
   a song (two or more parts), 🥁 Open part A and 🗑️ Throw away (asks first:
   the first tap turns it red, the second deletes everything it made).
   Closing the sheet keeps what it made. If no step of any part is on: "I
   couldn't hear a beat in that", a tip for the way it listened (louder,
   closer to the microphone, or check the browser's box shared the sound),
   🎧 Try again, and nothing is saved.

**What it makes, at ■ Stop.** Each part with hits becomes a beat in 🗂️ My
beats, named one fun name and the part's letter ("Zippy Noodle · A", a name
none of whose lettered names is taken, `names.js` `partNames`), with its
tempo, time signature, swing, bars and a row for each instrument that hits.
Each row gets the app's closest sound by fingerprint (`closestSound`) from
the drum-like sounds of Drums, Hip hop, Hand drums and Effects
(`ROW_SOUNDS`: a kick from Kick, Dusty kick, Boom, Taiko…), the kit's clips
decoded once a visit; the plain Kick, Snare or Hi-hat when a print is
missing. With two or more parts it also makes a 🎼 Song named with the fun
name alone: its parts' beats in song order on the first lane, each at its
first bar and repeated over its stretch (never into the next; bars as 🎼
Song counts them, 16 pills, so a 3/4 part leaves no silence), at the first
part's tempo, with a tempo mark where the tempo changed (ADR 0031). They are
saved as every beat and song is, so they sync, back up and show in the
chips and the song strip. Opening goes to 🎼 Song with the song open, or to
Beats with part A open.

**Nothing of the song is kept.** Frames go from the capture into the
listener and are dropped; only the hits and their timing are kept, and only
the beats are saved. Usage events: `noodlepads.listen_start` (its source)
and `noodlepads.listen_end` once (source, seconds, parts, tempo changes and
the outcome: `song` or `beat` for what it kept, opened or kept by closing,
`thrown`, or `cancelled` with nothing made). Problem reports log `listen`
entries (start, stop, made, and how it ended), never the song or a name.

For the tests and `just look`, `listenEnv` in `web/listen-ui.js` holds the
inputs, the listener, the animation frame and the kit's prints, so a made-up
capture and listener stand in: the `listen-card`, `listen-sources`,
`listen-phone`, `listen-finding`, `listen-live`, `listen-result` and
`listen-nothing` views show each state.

## Help

The ❓ button, beside ⚙️, opens Help: a picture reference with one tab each for
Pads, making a sound, Beats, 🎼 Song, 🎤 Live and Settings (every toolbar screen has
one; a test checks). It opens on the tab for the screen
you are on. Each line draws a control with its real label and says what it does
in one sentence; tools behind the Advanced switch are marked ⚙️ Advanced. It is
for looking things up, never a lesson: only a new person's first steps
(above) pop up on their own. The content
is a table in `web/help.js`. `tests/help.test.mjs` fails when a label Help
draws no longer exists in the app, or when a key control on its `MUST_MENTION`
list is missing from Help, so rename both together. Lines marked `soon`
describe features still being built and stay hidden until their mark is removed.

## Settings

The ⚙️ button in the top corner (small, and away from the pads and toolbar so
it isn't pressed by accident) opens Settings: 🔗 Sharing (🔗 Shared with me), 💾 Backups, 🎚️ Level (🧸 Kids · Regular · Advanced, each person's own, ADR 0019; stored as `level` with `advancedBeats` beside it, true only for Advanced, so an older copy still reads Advanced right; Advanced shows the extra beat and sound tools: each beat row's sound picker gets Speed, beats get Swing, and each beat can have its own time signature), 🎨 Look (the person's pad skin: a sample pad in each of the seven, the chosen one shown playing; arrow keys move the choice), 📊 Data sharing (📊 Share play data and 📮 Send problem reports) and About. Every section but About folds under its heading (all closed at first; the device remembers which are open, in `localStorage` `settings-open`), with a chip saying its state where there is one (how many people, the level, the look, which of play data and reports are on). About is always open: a line on what the app is, then the version, the Privacy policy and Feedback, centered.

**Feedback** (Ben, 2026-10-19; `web/feedback.js`): Send feedback, in About's row of links, asks the grown-up sum first, at every level, since kids use the app (`web/grown-up.js`, the same sum 🧸 Kids' ⚙️ asks; here a wrong answer says "That's not it. Here's another one." and asks a new sum). The right answer opens Send feedback, a small dialog centered on every width, phones too: one line (no names or contact details, nobody writes back, kept 90 days), a box of up to 2000 characters, Cancel and Send (✕ and Esc close it too, and focus goes back to Feedback). Send waits for something typed. It posts the text as typed to `POST /api/feedback` (text/plain, no cookies, an `X-Feedback` id kept for retries of the same text, `X-App-Version` the deployed commit or `dev`); 204 says "Thanks! Sent. 💌" and empties the box, anything else "Couldn't send. Please try again." and keeps it. Only noodlepads.com sends; a dev copy says so. A draft stays in the box until the page reloads (never stored). The Worker (flarepress's shared `handleFeedback`) stores it in the shared R2 bucket `app-suggestions` under `v1/noodlepads/<day>/<version>-<id>.txt`, with nothing of the sender, at most 10 messages a minute for the whole app; the telemetry runner's daily pull moves each to Ben's notes and drops it after 90 days. The text never goes into the event log, so problem reports and usage events never carry it. The pad size (`padSize`, `auto` or 0 to 1; an older percent, 50 to 220, or S M L reads as the nearest place) is a setting too, though its slider sits on the Pads screen.
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
  every board: 145 sounds in 12 groups, plus every instrument's own copy of Notes, Chords and Bass (220 more, below) (Drums, Hip hop, Hand drums, Notes, Chords, Bass, Game,
  Effects, Animals, Sci-fi, Voices, Silly), listed in boards.json `kitGroups`.
  All are generated (`just placeholders`), except the old app's eight starter
  sounds (airhorn, laser, boing…), kept as they were. Notes are a full octave
  of C major. A preset marked `"advanced": true` shows only with ⚙️ Advanced
  on (pads, the sound chooser, the keys): these are the 20 sharps and
  flats, labelled both ways ("C♯ · D♭"), the five in Notes and in Bass between
  the naturals, and ten chords for songs in G, D, F, B♭ and A after the first
  seven. A beat row, key or take that already uses one keeps playing it
  with Advanced off (`anyClip` in `board.js`). Every sound plays with the same loudest moment; a preset's `level` (dB, at most 0) turns it down after that, so every preset plays as loud as the middle of them all on a phone (`just preset-loudness --fix` works them out, at the note or chord each plays; `tools/test_preset_loudness.py` fails until boards.json has them; a level never turns one up, so the kicks and booms stay a little quieter), and the kicks, booms, 808s and bass notes carry their own overtones so a phone speaker plays them (`carry` in `tools/make_placeholders.py`). boards.json lists the presets once, as top-level `kit`; every board (people
  added in the app too) gets its own copy with ids like `<person>-kick`, so each
  board can hide, rename or reorder presets separately. The pads show two
  sections, the person's own sounds (with New sound) then Presets, and a pad only
  moves within its section. Preset groups open and close (Drums starts open; each device remembers in
  localStorage `kit-open`), on the pads and in the beat sound chooser alike.
- **🎹 Who plays** ([ADR 0030](adr/0030-instruments-who-plays.md), `instruments.js`,
  `inst-picker.js`): Notes, Chords and Bass can each be played by an
  instrument. Each group's header on 🔊 Pads has a button saying who plays it
  ("💧 Pluck ▾"); a tap opens the instruments by family (Keys, Mallets,
  Strings, Wind, each in its color), and a tap on one picks it, closes the
  list and opens the group. Notes: Pluck (its own sound), Piano, Organ, Chip,
  Marimba, Steel drum, Kalimba, Guitar, Strings, Brass, Flute. Chords: Synth
  (its own), Piano, Organ, Guitar, Strings. Bass: Synth (its own), 808,
  Upright. The pick is the person's (settings `instNotes`, `instChords`,
  `instBass`): synced and in backups. The same picker sits on Notes, Chords
  and Bass in the beat row's sound chooser and above an open group in ✏️ Edit
  keys (filling a row with the group puts the picked instrument's notes on
  it); every picker sets the same pick. 🎹 Add a tune asks "Who plays it?"
  (the Notes instruments, the pick ticked) and starts the tune row on that
  instrument's C. Two pickers also change what they sit on, keeping every
  note: the piano roll's, beside 🔊 Sound, swaps the tune row to the same
  note on another instrument (`instruments.js` `versionFor`, by `plays`), and
  a 👆 band of Notes, Chords or Bass in ✏️ Layout has one under its
  name that swaps every pad (↩️ Undo). The default keys and touch layout
  (nothing changed yet) always play the groups' own sounds (`board.js`
  `clipsFor` `ownSounds`): only the keys that differ from them are stored, so
  they never move under a kid. A ready-made layout loads on the picked
  instrument. Each instrument's notes are presets of
  their own, `piano-e` for `note-e`, `piano-am-chord` for `chord-am`, `808-c`
  for `bass-c`, wearing the same fruit, weather or animal, with the
  instrument's emoji as a small badge at the pad's top right. Wherever presets
  are listed (Pads, the beat sound chooser, ✏️ Layout's keys, 👆 + more) the picked
  instrument's show; a beat row, key, band or take keeps the exact preset it
  was given, so a new pick changes nothing already made. In boards.json such a
  preset has `inst`, `plays` (the group's own preset it matches) and a `file`
  that is one of the instrument's one or two recordings
  (`clips/kit/<inst>-<MIDI note>.wav`), moved by `shift` semitones or played as
  a `chord` of several notes at once: `audio.js` decodes the recording once and
  resamples it, as a tune row moves a sound, so extra notes and chords cost no
  bytes. `tools/kit_instruments.py` writes these entries; marimba, steel drum,
  kalimba, chip, guitar and 808 are generated (`make_placeholders.py`), piano,
  strings, brass, flute, organ and the upright bass are cut from CC0 libraries
  (`make_samples.py`, `web/clips/kit/LICENSE-samples.txt`).
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
- **The toolbar** has four tabs, 🔊 Pads · 🥁 Beats · 🎼 Song · 🎤 Live, then Stop all (⏹️ alone on a phone, so all five fit at 320 px). Stop all (or Space) stops every sound, the beat and the song, and turns ⏲️ Click track off on Beats and on 🎤 Live (and with ⌨️ Keys); each stays off, across visits, until its own ⏲️ is tapped. No screen has a sub-switch (ADR 0017).
- **The keys** (🎤 Live, and 🥁 Beats with ⌨️ Keys on): 40 sound keys laid out like a keyboard's number row (1 … 0) and its three letter rows, alternating like bricks on wide screens (the Q and Z rows half a key in; tiles like a periodic table), played by the real keys (by the letter typed, found on the picked keyboard's picture, so a keyboard that remaps in its own firmware lines up; a character not on it, like Shift+1's `!` or a Cyrillic letter, plays its key by position) or by tapping (on a touch screen a key plays when the finger lifts in place, so a scroll that starts on the keys stays silent; held still, it loops; `finger.js`). The keyboard is the Q / D keycaps (QWERTY, Dvorak), set in ✏️ Edit keys over its keys, at every width, beside S M L (the pads' size, on a screen with no mouse), while the keys show letters; it labels the keys (the digits are the same on both) and is the device's own setting (`djLayout`). Until one is picked, the browser's layout map decides where there is one (Chrome, Edge: Dvorak when the Q key prints `'`), else QWERTY. By default the number row is a scale, C to high C, then Ding and Ta-da; the kid's own sounds stay on Q–P. On a phone the row tabs are four, the drums first; with no keyboard in sight the number row's pads come last. The number and letter keys play only while the keys are on screen (on 🔊 Pads, 1–9 play the first nine pads). ✏️ Edit keys opens a focused view for arranging them (below). Two ways to record:
  - **🎤 Live** keeps every hit as it was played, as a named take (🎬 Takes: play, rename, delete, 🔊 make it a sound). A take's ▶ Play turns into ■ Stop while it plays; a second 🔊 asks "Make another?". ⏲️ Click track sits in the footer, then 🔔 Overlap, then ✏️ Edit keys (on a phone the three share a line); scrolled down, a twin of ✏️ Edit keys (✏️ Edit layout with 👆) rides at the right of the slim bar, as on Beats with ⌨️ Keys, while Live's own bar (● Record, 🎬 Takes) scrolls away; Live has no open beat, so it ticks at 100 BPM, which its slider changes for the visit. 🔔 Overlap, on, lets every key's repeated hits ring over each other (up to 8, `audio.js` `ringing`) instead of restarting the sound; holding a key still loops it. It lasts for the visit: never saved, off after a reload. A take keeps it: a hit played with it on is stored with `ring: true` (only when true; an older copy drops it and restarts), and ▶ Play and 🔊 make a sound play the take as it was heard, each hit cut off by the next unless it rang (`rhythm.js` `planTake`). With ⌨️ Keys on Beats the keys always restart; 🔊 Pads always restart.
  - **🥁 Beats with ⌨️ Keys** (⌨️ in the beat bar, remembered on the device as `beat-keys`) shows the keys under the open beat and has ▶ Play (the beat round and round, recording nothing) and counts in one bar (a big colored number over the keys, then GO!), then plays the beat; hits snap forgivingly onto its pills, pass after pass, until Stop. The playhead lights each pill as it is heard: the audio clock less the delay to the speaker (`outputLatency` + `baseLatency`, at most 0.2 s). ↩️ Undo puts the beat back. Tempo (tap the number to type one), ⏲️, bars and (Advanced) time signature sit on the control bar with ▶ Play and ● Record, as with Keys off; it is the only tempo there. After the count-in the tempo can change while recording, and a beat played into its last bar on the first pass grows (1 → 2 → 4 bars, the new bars a copy). Tap ⏲️ three times in time to set the tempo (Live and Keys). Its grid takes taps like Beats; each row's ✕ removes it and 🧹 clears it (two taps), with Undo. A beat holds 16 rows. While ● Record runs, a new sound takes the first row with no hits (from the top) before a new row is added; outside recording it gets a new row until the beat is full, then reuses a row with no hits. ↩️ Undo puts the rows back. As with Keys off, scrolled, the control bar collapses into the slim bar (▶, ●, ▾; see Keys off below). Scrolled down, ✏️ Layout also rides at the right of the slim bar at the top of the screen (the round button, ❓, ⚙️ and ⬆️ at its left), as ✏️ Edit sounds does on Pads, at every width, as just ✏️ (screen readers hear the whole name); on Beats the keys' foot has none: ✏️ Layout sits on the control bar instead, after 🎚️ (on a phone, where the bars' line is full, just ✏️ after ⏲️). 🎤 Live keeps ✏️ Layout at the foot of its keys. Every one opens the editor at once. 🎤 Live has the same twin.
  Changed keys and takes are in IndexedDB `decks` and `takes` (ADR 0005); the rules are in `rhythm.js`.
  - **✏️ Layout** with ⌨️ Keys is its own full-screen view, with no beat, take or mode controls. On top, **Layouts**: whole-keyboard arrangements, the kid's own ⭐ ones first, then four ready-made ones that lay out the presets (🥁 Beat lab, 🚀 Space band, 🐾 Zoo party, 🎹 Piano-ish). Tapping one loads it; the kid's hand-made keys are kept as ⭐ My keys first, so nothing is lost. ⭐ Save this layout names the keys (a typed name, up to 24 characters); the layout on the keys can be renamed or deleted (two taps). In the middle, the 40 keys (a tapped key plays). Below, **Sounds**, by group (🎤 My sounds, then the kit's groups): tap sounds to pick them, then tap a key, and they land from that key on; tap a group twice to fill the emptiest row. Or drag: sounds onto a key, a group onto a row, a key onto a key (swap), a key off the board (No sound); a drop on nothing flies back. On a touch screen a drag starts after a short hold, so a swipe still scrolls. Sounds in the way move to free keys, and the note says what didn't fit. ↩️ Undo, and ↺ Reset keys (two taps). A focused key clears with Delete; a keyboard's own letter keys work as taps. On phones the keyboard sticks under the title while the sounds scroll, ten keys across even at 320 px. Saved layouts are IndexedDB `layouts` and ⭐ My keys is the deck's `mine`; both sync and ride in backups (ADR 0014). A layout or ⭐ My keys saved before the number row loads with that row empty; the ready-made ones fill it. The rules are in `keyset.js`, the view in `dj-keys.js`.
  - **⌨️ Keys | 👆 Pads** (ADR 0029): from 700 px wide, the keys or the **touch layout**, remembered on the device (`localStorage` `dj-input`), picked in ✏️ Layout's title line on 🎤 Live and Beats alike. Both of its views have the switch; a tap on the other one swaps the view open for its own at once, and focus goes back to ✏️ Layout when it closes. Until it is picked, ⌨️ Keys. Under 700 px it is always 👆 Pads, with no switch (a phone has no keyboard to play). The touch layout is bands, top to bottom, each one group of sounds (a kit group like 🥁 Drums or 🎶 Chords, or 🎤 My sounds) under its name, its pads all one size: S, M or L, 5, 4 or 2 across on a phone; from 700 px as many as fit at that size, stretched to fill the line. A pad plays like a key: on the finger's lift, held still to loop, Shift-click or Enter with a mouse or keyboard; it goes into takes, 🔔 Overlap and the beat's rows the same way, and with 👆 the beat's rows follow the bands, band by band. Pads are colored by family, and the legend and the footer how-to follow. Until a kid changes it, the layout is 🎸 Band (Chords M, Drums L, Bass S) under the newest four of their own sounds; it is the same layout on Live and on Beats. A sound that is gone is left out of its band. The real keys still play the keys while 👆 shows.
  - **✏️ Layout** with 👆 Pads is the touch layout's own full-screen view (`dj-touch.js`). On top, **Layouts**: ⭐ My layout (the hand-made one, kept when another is loaded), the kid's own saved ones, then four ready-made ones (🎸 Band, 🥁 Drum kit, 🎹 Chords and bass, 🐾 Zoo band); ⭐ Save this layout names it (a typed name, never pre-filled), and the saved one showing can be renamed or deleted (two taps). Then the groups, top to bottom: ⠿ moves one (drag; a finger holds first so a swipe still scrolls; or ↑ ↓ on it), S M L sets its pads' size (5, 4 or 2 across on a phone): a smaller size fills the band's last line with the group's next sounds not on the board yet, so no hole is left, and a bigger one keeps every sound, wrapping (`touch.js` `resizeBand`). A tapped pad opens a picker under its band to swap its sound or 🗑️ Take it out; + more opens the same picker to add sounds, one at a time or + Add all N. The picker shows one group's sounds under a "Sounds from 🥁 Drums 17 ▾" button, the band's own group first, with how many are left; a tap on it lists every group (with its count) in place of the sounds, and a pick closes the list (Esc too). A sound already anywhere in the layout is never offered, in + more or a swap (the pad's own shows as picked); an instrument's note counts as the note it plays, so the piano's C is not offered beside the Notes' C (`offeredSounds`). A group with nothing left says every sound in it is on the board already. **+ Add a group** puts one at the bottom with its starting few not on the board yet (Drums: kick, snare, hi-hat, clap; Chords: C, Am, F, G; Notes: C to high C; Bass: C D E G A; others their first four; My sounds the newest four), topped up with the group's next free sounds, so a second Drums starts where the first ends; at most 8 groups. ↩️ Undo takes back each change. The live layout is the deck's `touch` and ⭐ My layout its `touchMine`; saved ones are IndexedDB `touchLayouts`; all sync and ride in backups (ADR 0029). The rules are in `touch.js`.
  - **Grids** (ADR 0032, `touch-grid.js`): in ✏️ Layout with 👆 Pads, under Layouts, ☰ Stacked (the bands above, the default) or a ready-made grid: Two and one, Four corners, Three across, Side by side, each a small picture of its blocks. A grid replaces the layout with its empty, dashed blocks (a hand-made layout is kept as ⭐ My layout first). A group goes into a block by a tap (the block tapped first, else the first empty one) or a drag (a finger holds first); dropped on a block that holds one, it takes its place. A block shows its band without ⠿ or S M L: the tile picker opens under the grid, ✕ empties the block (↩️ Undo). Between two parts of a split sits its **edge** (a bar, `role="separator"`): dragged (at once, a finger too) or moved with ← → (↑ ↓ for one lying flat), it gives one side twelfths of the other, each at least ⅙ (`setEdge`), showing both shares on it while it moves; only the two parts move on screen until it is let go, then one ↩️ Undo takes it back. A block's **⋯** (beside its ✕, or in an empty block's corner) opens a menu under the grid: ⇹ Split across and ⇳ Split down cut it in two (it keeps its group in the first half; the second is empty and takes focus), and Join with the one on its right (left, below, above) gives its room to its neighbour, its group going with it (↩️ Undo). A split the other way from its own nests a split in its place; a split left with one part is that part. A button that can't act waits and the menu says why: 8 blocks at most, 4 in a line, 3 splits deep, halves of ⅙ at least (`cannotSplit`). Playing, the grid fills the room under the bar (at least 320 px tall) and each block's pads take the columns that make them biggest (`bestColumns`, measured again when the screen changes size); an empty block stays as a faint dashed box. The grid is stored in the layout as `grid`, a tree of splits in twelfths, and its bands follow the blocks' reading order, so the beat's rows do too. ☰ Stacked puts every group back in a band of its own, in that order.
- **Beats** (🥁 Beats in the toolbar): each person has one open beat, the same with ⌨️ Keys on or off (ADR 0008, ADR 0017). With nothing else open it is their **scratch beat** (ADR 0020, `web/scratch.js`): an ordinary `beats` record under the reserved id `beat-scratch-<person>`, never in 🗂️ My beats, the chips, a song's beats or Share, saved only once it changes, so it syncs and backs up like any beat. Its name bar says "Scratch beat" (or "Ska (scratch)" after a groove; the groove's name is what it is stored under) and has 💾 Keep where ✏️ is: Keep turns it into a beat of its own in 🗂️ My beats, named "<fun name> (<groove> version)" after a groove (`names.js` `keptName`, which shortens to fit 24 characters) or a fun name, which opens; the scratch starts empty again. A name typed into the title keeps it the same way under that name (made unique, like a rename): at once if it has rows, else the title holds the name and the scratch keeps itself with its first row; 🆕 New, another beat or another person forgets the name (it is not stored). The open beat saves itself as it changes (IndexedDB `patterns` holds each person's open beat, no record when the scratch is open, `beats` every beat; a `decks` record from an older copy may name the keys view's own open beat (from when it was a screen of its own) as `beatId`, which nothing reads and the deck drops when it next saves, so that beat stays in 🗂️ My beats). The beat bar renames it, starts afresh with 🆕 New (it stops the beat playing and opens the scratch blank: no rows, one bar, 100 BPM; a scratch with hits, open or not, is kept first as 💾 Keep keeps it, a beat of its own in 🗂️ My beats named after its groove or with a fun name, and the banner says under what name; a scratch with no hits just empties), or 🗂️ My beats opens another (duplicate, ⬇️ save as a `.beat.json` file, delete, make it a sound; 📥 Load a beat file brings one in, kit sounds only); deleting the open beat opens the scratch. 💃 Grooves: 51 ready-made beats in 7 style groups, many with bass and chords, each card with a line on where it comes from or what to listen for (`about`; with Advanced, also its sounds, bars and tempo) and a chip for each instrument that plays it beyond the drums (🛢️ Steel drum, ⚡ Synth), white on its family's color as in the instrument picker; a groove's row can name an instrument's preset (Motown, Lo-fi and R&B play 🎹 Piano, Gospel ⛪ Organ, Reggae a 🎸 Guitar skank, Soca 🛢️ Steel drum, Chiptune 🎮 Chip), which plays whatever the person picked (ADR 0030); one loads into the scratch (📝 Into my scratch, the default) or adds its hits to the open beat (➕); a scratch with hits it replaces is said in the Undo banner. With Keys on a groove loads stopped, ▶ Play loops it behind you, ● Record adds your hits, and ↩️ My beat undoes the load; ▶ beside each groove in the chooser plays one pass of it, at most 4 s. Under the beat bar, pattern chips fill 8 numbered spots: beats pinned with 📌 in 🗂️ My beats first, in the order pinned (a beat record's `pinned` time, kept in backups and the cloud, left out of copies and share codes; ADR 0021), then the beats used most recently (opened or changed: the library's `saved` stamp), shown oldest made first, so a tap never moves a chip; the open one is lit; a tap opens that beat, and while it plays the chip waits (⏳) for the next bar line, where the new beat takes over without a gap. They wait while ● Record records. 🎚️ after the bars opens the Mixer for the open beat: a column per row (a vertical fader for its loudness, Mute, Solo, one effect from the sound sheet's: Room, Hall, Echo on the beat, Muffled, Bright, Crunch, Warble, Robot, Louder) and a Master column (the whole beat's loudness and one effect; All on clears mutes and solos); on a phone the columns scroll sideways inside it. Solo, effects and the master save with the beat as `solo`, `fx` and the beat's `volume` and `fx`, left out at normal (ADR 0018); `web/mixer.js` builds the graph every hit plays through. ⇆ after 🎚️ locks the pills (`sequencer.js` `setLock`; the picking is `web/pill-select.js`, its rules in `web/slide.js`), in whichever view shows, the rows or the ⌨️ Keys grid: nothing lights or unlights there and a hold makes nothing loud; a finger picks and drags as a mouse does (below): a tap or Space puts a lit pill in or out of the pick, a drag from an unlit pill draws a box, a drag from a lit one slides the pick. A bar at the foot of the screen says what is picked, with All (every lit pill), None and Invert (the lit ones not picked). A slide moves the picked pills along their own rows round the beat's end (`total` pills), carries loud hits, replaces what it lands on and empties where it left; it plays live, and Undo comes in the banner. ⇆ again unlocks, and so does leaving Beats. ⌨️ Keys off and on share one beat panel: the same title bar, the same control bar (▶ Play, ● Record with Keys on, the tempo, ⏲️, then the bars, on one line from 601 px) and the same row parts, drawn by `web/beat-row.js` (emoji, pills, then 🔔 · 🔊 · 🧹 · ✕ at the right, each the same outlined square, `.icon-btn` in `styles.css`, lit yellow when on (🔔 on, 🔊 muted), red while asking, with 🔊's loudness as a bar along its bottom; tap the emoji to change a row's sound with Keys off, or its picture with Keys on). With room the title bar is one line, every tool worded: 🥁 name, ✏️ or 💾 Keep · 💃 Grooves · ⌨️ Keys · 🆕 New · 🗂️ My beats. Where the five with their words no longer fit beside a name of 9em (measured on the bar by `fitLine`, `BEAT_BAR_STEPS` in `web/sequencer.js`; about 770 px of screen on the scratch beat, with 💾 Keep worded, and about 740 px with ✏️), 💃 Grooves, ⌨️ Keys and 🗂️ My beats move to a row of their own above the title, worded, in thirds, and the title line keeps ✏️ or 💾 and 🆕 beside the name, emoji alone (with no beat open, 🆕 New fills it, worded). On the narrowest phones that row trims its padding, then puts each word under its emoji. Every button stays 44 px. With Keys off each row starts with one header line, like a list item (⠿ grip · ▾ fold · emoji and the sound's name, cut short with …, at the left; 🔔 · 🔊 · 🧹 · ✕ at the right) and its pills fill the width below; a collapsed row is just that line. Drag ⠿ to move the row (or ↑ ↓ on it): near the top or bottom of the room between the stuck control bar and the toolbar the page scrolls, faster nearer the edge, so a row crosses a long beat in one drag (`web/edge-scroll.js`, which ⇆ Move's drags use too). Once the control bar (▶ Play, the tempo, ⏲️, the bars) reaches the top it collapses into the slim bar, at every width (`web/mini-deck.js`), at its right (clinging to ✏️ with Keys on), apart from the round button, ❓, ⚙️ and ⬆️ at its left: ▶ (■ while playing), ● Record with Keys on (■ while recording), ✏️ (Edit keys, with Keys on), and ▾ at the very right, which drops the whole bar down under the slim bar (▴ puts it away; scrolling back up to the bar does too). Each one taps the bar's own button. The slim bar never grows: where the left buttons would come within 16 px of these, measured, ⬆️ goes first, then ●, then ❓, then ✏️ (its twin on the bar is a ▾ away), then ⚙️ (`STEPS`). Every button on it stays 44 px: where the line is short of room (measured on the line itself, under about 360 px), 🔔 🧹 ✕ move into a ⋯ at its end, whose menu lists them as 🔔 Overlap, 🧹 Clear and ✕ Remove and taps the real button, so Overlap shows ✓ when on and Clear and Remove still ask first, with Undo (`web/overflow.js`, the helper for any line that runs out of room). With Keys on each row is one compact line: emoji · pills · tools. With a mouse, pills pick and drag like objects (`web/pill-select.js`, on the rows and the ⌨️ Keys grid alike): a click on a lit pill picks it (a yellow ring), Ctrl/Cmd-click adds or drops one, Shift-click adds the lit pills from the last click to it, a click on an unlit pill lights it and picks it, and a drag from an unlit pill draws a box that picks the lit pills in it (Ctrl/Cmd or Shift add); a drag from a lit pill slides the pick along its own rows, a pill at a time, its spacing kept (`slide.js` `slideRows`, as ⇆ Move); Delete or Backspace turns the pick off and a double-click one pill, each with Undo in the banner; Esc lets go. Tune rows (🎹) keep their piano roll, and ⇆ Move turns picking off. A tap on a pill (a finger, or Space) switches it on or off; holding it (or Shift+Space) makes a loud hit (white ring, about 3.5 dB up). Before open beats joined the library, the beat on screen was saved per person
  in IndexedDB as `{name, bpm, rows: [{clipId, steps}]}`, where each row is a
  sound and 16 steps, one bar of 4/4 at a quarter beat a step. A row can use
  any person's sound; the chooser groups them by person, current board first.
  + Add a row opens the same chooser for new rows: a tap ticks a sound (and
  plays it) or unticks it, each tick numbered in the order tapped, and Add N
  rows puts in a row for each, in that order, up to the beat's 16. The first
  unused sound after the last row's (in the chooser's order, going round)
  comes ticked, its group open, so one tap on Add adds the next one
  (`nextSound` in `sequencer.js`); an empty beat starts on the board's first.
- **🎼 Song** (🎼 Song in the toolbar, for everyone) is a playlist (ADR 0024): a song has its own tempo (60–180 BPM; ➖ ➕ by 5, or typed; the first beat put in sets it) and 4 lanes to start, up to 8 with ➕ Add a lane. Each lane has a name and picture (a fun default, 🥁 Drums, 🎸 Bass…; tap them for a sheet to rename it or pick from the picture chooser, with "…" for every emoji) and a speaker like a beat row's (tap mutes, hold or drag sets its loudness). Time runs across, in bars of 4/4 at the song's tempo, with bar numbers on top; the lanes scroll sideways inside their box, and on a phone (under 700 px) four lanes show at once and the rest scroll down. Above the lanes, a strip of the person's beats in 🗂️ My beats (the pattern chips' look): pick one, then tap a spot on a lane to put a **block** there, played once; it stays picked to put more. A block covers the bars its passes reach into (a 2-bar beat takes two; a 3/4 bar three quarters of one, rounded up), never overlaps another on its lane ("No room there"), and plays at the song's tempo, its passes back to back. Tap a block to select it: drag its ⟷ end, or ➖ ➕, to repeat it (up to where the next block starts), 🗑️ takes it off (asks first); ↩️ Undo takes back any change to blocks, lanes, tempo or tempo marks. **Tempo marks** (ADR 0031) change the tempo from a bar on ("from bar 17, 120 BPM"): every lane plays each bar at the tempo marked for it, so bar lines stay lined up, and a pass that runs across a mark speeds up or slows down where the bar does. Each mark shows for everyone as a small BPM chip above its bar, in a row over the bar numbers that appears once a song has a mark (read only without Advanced). With Advanced on, the deck's tempo is a button ("100 BPM · 2 changes") that opens 🎼 Tempo: the tempo from bar 1 (typed), each mark (tap to change it), and ＋ Tempo change, a bar (2 to 128; it starts at the bar ▶ plays from, else four bars after the last mark) and a BPM (60–180; it starts at the tempo playing there). A mark put on a bar that has one replaces it. A chip opens its mark straight away; ✓ Done or 🗑️ Remove closes the sheet again. 🗑️ Remove asks first (two taps) and the banner offers ↩️ Undo. ▶ from a bar, the playhead, 🔊 Save as a sound and a share's preview all follow the marks. With a keyboard, Tab to a lane, ← → to a bar, Enter puts the picked beat there or selects the block, + and − repeat it, Delete takes it off. ▶ Play song plays every lane together from bar 1, or from a bar number tapped in the ruler, with a playhead; blocks playing light up. 🔊 Save as a sound renders every unmuted lane, mixed, up to 3 minutes, to a new pad; a share's preview does the same. A block whose beat was deleted shows greyed and is skipped; should a beat grow so that a block runs into the next, the later block cuts it there. Songs are a list, like beats: with nothing else open the person's **scratch song** is (`song-scratch-<person>` in `songbook`, never listed; 💾 Keep makes it a song in 🗂️ My songs with a fun name, ADR 0020; a name typed into its title keeps it under that name, at once with blocks, else with its first block), the open song saves itself, and the song bar renames it, 🆕 New opens the scratch song blank (a scratch with blocks is kept first, a song of its own in 🗂️ My songs with a fun name, and the banner says so) or 🗂️ My songs opens another (duplicate, delete). IndexedDB `songs` holds each person's open song, `songbook` every song (ADR 0006, ADR 0007), as `{id, personId, name, tempo, tempos?, lanes: [{name, emoji, muted, volume, blocks: [{beatId, bar, times}]}], slots}`; `tempos` is `[{bar, bpm}]` (bars from 1, each 2 or later, in order, one per bar, at most 32; left out when there are none), merged mark by mark by bar in a sync (`merge3.js`), and an older copy plays the song at `tempo` throughout; `slots` (every block in time order, at most 16, ×4 at most) is written for older copies, which play a song's beats one after another. A song from before the playlist has only slots: it opens as blocks on lane 1, back to back, at its first beat's tempo. The rules are in `playlist.js` (pure) and `song.js`.
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
  💃 Grooves load their bass rows as one tune row of Bass C, or of the instrument's C (Lo-fi's 🎻 Upright; chords stay rows of pills).
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
  (`<id>-kick`), pad order, beats, keys, key and touch layouts, takes, songs, settings, the cloud
  link, the remembered person, the address. The old id is remembered on the
  device only (settings `renamedPeople`, never backed up or synced), so an
  old backup or older sounds found land on the same person. A profile in the cloud
  under an old plain id is not renamed: the device drops that link and puts the
  person up as new (Cloud profiles, below).
- **People** (the corner avatar → 👥 People; not in Settings): people added in the app (and any
  renames and recolors of people boards.json lists) live in IndexedDB
  `people`, with `avatar` (an emoji) and `fun: true` (a generated name).
  👥 People is a short list, one line per person: picture, name, counts and
  ☁️ state (🔒 with a PIN): ☁️✓ in the cloud (a PIN not typed yet on this
  visit included), ☁️ not yet, 📴 offline, ☁️⚠️ something to see to, which
  their profile sheet says after a ⚠️ in its ☁️ part (`cloud-ui.js` `warns`).
  The list follows a sync as it happens. Tapping a line opens their profile sheet
  (`#profile-dialog`, `people.js`): 🎲 Pick a name, the picture, every person
  color (eight, in two lines of four on a phone, one of eight from 601 px;
  chosen to stay apart for deuteranopia, `model.js` `PERSON_COLORS`; a
  person stored with one of the ten before 2026-10-19 takes the nearest as
  it is read, `OLD_PERSON_COLORS`), ☁️ In the cloud, 🔒 PIN and Delete.
  ☁️ In the cloud is a switch: on puts them in the cloud now, even with
  nothing made; off asks twice (and for the PIN), deletes the cloud copy and
  keeps them here only (📴 Offline); a tap anywhere else takes the first tap
  back. Under it, when they are in the cloud, 🔄 Sync now and 🔗 Share… (both
  ask for the PIN first on a visit that hasn't had it), and for everyone ⬇️
  Back up: one tap saves the file 🗂️ See all's ⬇️ Export a backup makes
  (`backup-ui.js` `savePersonBackup`). The 🔒 PIN part has a
  pill, 🔒 PIN on or 🔓 No PIN, and 🔒 shows by the name in the corner
  menu. 🔒 Set a PIN (which puts them in
  the cloud first if they aren't), or Change PIN and Remove PIN, which ask
  for the PIN they have now. A new PIN is typed twice; a second that doesn't
  match says so on the pad and asks again. What a button just did (✅ PIN
  set, ✅ PIN changed, 🔓 PIN removed) shows in the pill for 3 s, then it
  fades back (`cloud-ui.js` `drawPin`, `pinClick`). With a PIN on their cloud profile, changing the name, picture or
  color asks for it once per visit (until a reload; typing it to open them
  counts), checked like an open (`cloud.js` `pinGuards`, `checkPin`); without
  one, anyone can. It gates the sheet only: syncs apply as before.
  Nobody types a name: a tap on 🎲 opens Pick a name, a dozen fun names and the
  special names to choose from (🎲 More names deals another dozen); closing it keeps the name. Anyone can be deleted from this device (two taps), with their recorded sounds,
  saved beats, beat on screen, pad order and edits to preset pads (left
  behind, any of these made them a person again on the next start,
  `state.js` `adoptStoredPeople`); a sync of theirs still running ends first,
  or it would store them again (`cloud.js` `syncEnded`). A boards.json person can't leave
  that file, so deleting one keeps only a hidden record; the People dialog
  lists hidden people under "Deleted — bring back". The last person on show
  can't be deleted. For someone in the cloud the second tap deletes them here
  and the sheet stays, showing only Delete ("☁️ Tap again to delete their
  cloud copy"): a third tap deletes their cloud profile too (asking for the
  PIN if they have one; `cloud-ui.js` `deleteLeftCloud`), and ✕ keeps it for
  their other devices. When they were the one on show, nobody else comes on
  while the sheet waits (the next one's PIN pad would cover it); closing it
  brings the next person on. **👋 Who's playing now?** (`who-now.js`): when
  the person on show is deleted (Delete, or 🤷 I don't know the PIN), and at
  start when everyone has a PIN, the board starts over here (`app.js`
  `startOver`), hidden behind it: everyone left as the welcome's big pads, in
  their picture and color, 🔒 in the corner of anyone with a PIN, and 👋
  Someone new. A tap opens them, past their PIN; closing the PIN pad comes
  back. Only a pick closes it (no ✕, Esc or backdrop), and nothing behind it
  shows a board meanwhile: a sync or a redraw of people only redraws it. The
  only one left, with no PIN, just shows. Switching ☁️ In the cloud off deletes the cloud copy
  and keeps them here. Under each name, a row says how much that person has on
  this device, kinds with none left out: "🔊 27 · 🥁 4 · 🎼 1 · 🎬 1", or
  "nothing yet" (`personCounts` and `countsText` in `web/model.js`). It counts
  nine kinds: sounds, beats, songs, takes, ⭐ voices, ✏️ preset edits (a
  person's `overrides`), 🎛️ key sets (their `decks` record, once a key is
  changed), ⌨️ key layouts and 👆 touch layouts.
- **🗂️ See all** (Ben, 2026-10-24; `web/things.js`): the same count line at
  the top of a profile sheet is a button, "🔊 27 · 🥁 4 … See all ›"; for a
  person switched off the cloud (📴) it starts "📴 This device only:". Everyone
  else in the cloud has the same here and there, so it says no more. It opens a sheet over the profile, "Everything <name> has": a chip
  per kind (All, then the nine, each with its count, 0 included; they fill the
  width in as many lines as it takes), then the list (`personThings` in
  `web/model.js`, which `personCounts` counts, so a chip is always its list's
  length). Under All, each kind they have gets a heading and its three newest,
  then ＋ N more, which picks that kind's chip; a kind with none gets no
  heading, and its chip says "No beats yet". Each row: its picture, its name
  (a scratch beat or song reads "Scratch beat", or "Ska (scratch)"), and one
  fact: a sound's or voice's day made, a beat's bars and tempo, a song's lanes
  and tempo, a take's length, whether a preset edit changed or hid it, how
  many keys a key set changed, a layout's keys or groups. A tap plays it right
  there in its own audio slot (`see-all`), ■ while it plays, … while it
  renders (one fixed box, so the icon never moves): a sound or preset edit as its pad plays it; a beat twice round, a
  song or a 🎬 take as heard, each recorded first as a share's preview is
  (`share-render.js` `renderAudio`, at the device's rate); a ⭐ voice on their
  newest own sound, else (none, or it won't load) their first preset. A second tap, another row or ✕
  stops it. Key sets and layouts have no sound of their own: no ▶. It reads
  this device, which for a person in the cloud is the cloud's copy, at most a
  background sync behind (Cloud profiles, below). At its foot,
  **⬇️ Export a backup** (Ben, 2026-10-24) saves a backup of just that person
  (`backup.js` `personBackupLists`, `backup-ui.js` `savePersonBackup`):
  their person record, everything listed, their pad order, open beat and
  song, and their own settings (`prefs`), in the same format as 💾 Save a
  backup, named `noodlepads-<their fun name>-<date>.zip`; the device's
  settings stay out. 📂 Load a backup on any device asks whether to restore them or
  load it all into someone there (Backups, below). A beat row playing another person's own sound loses that row on a
  device that lacks that person. The sheet only shows, plays and exports;
  deleting stays in Edit sounds, 🗂️ My beats and 🗂️ My songs.
- **One emoji per kind** (`KIND_EMOJI` in `web/model.js`): 🔊 sounds,
  🥁 beats, 🎼 songs, 🎬 takes, ⭐ my voices, 👥 people, ✏️ sound edits,
  🎛️ key sets, 🔗 shares, ⌨️ key layouts, 👆 touch layouts. Every count or kind name uses it: People, the
  backup line, the notice after a load, 🔗 Share.
- **Backups** (⚙️ Settings → 💾 Save a backup / 📂 Load a backup). Above the
  buttons, worked out each time Settings opens, a line says what a backup
  would hold by kind ("A backup now holds 🔊 27 sounds · 🥁 4 beats · 🎼 1 song ·
  👥 2 people · 12 MB of audio"; kinds with none are left out); the notice after
  saving says it again with the file's size. The words come from
  `holdsWords` in `web/old-backup.js`, so the older-sounds section says them
  the same way. A backup is one zip with
  `backup.json` (people, sound records, edits, pad order, beats, saved beats,
  takes, songs, keys, key and touch layouts, settings; a loaded setting is kept only if this copy of the
  app knows the key and the value) and `sounds/<id>.<ext>` for each sound made
  in the app. This is how sounds move between devices or addresses (each
  address has its own browser storage). `web/backup.js` checks every field of
  an imported file (`cleanBackup`, which older sounds found go through too);
  `web/zip.js` is the no-library zip code.
  - **A one-person backup** (🗂️ See all's ⬇️ Export a backup, or any backup
    with exactly one person and nothing of anyone else's, `backup.js`
    `onePersonIn`) asks where it goes as it loads (Ben, 2026-10-24;
    `#load-who`, `backup-ui.js` `askWhere`): "Load <name>'s backup", what it
    holds, **♻️ Restore <name>** (as their own person, as any backup loads),
    then "Or load it all into someone here:", one button per person on this
    device (not the backup's own person). Loading into someone makes every
    thing theirs (`intoPerson`: every record that names the backup's person
    names them, an edit of their kit an edit of this person's, their scratch
    beat and song this person's, merged as any backup is), and leaves out the
    backup's person and their settings: nobody new is added, and this person
    keeps their name, look, level and settings. What they already have is
    skipped, so loading it twice adds nothing. ✕ loads nothing. A whole-device
    backup loads as before. The notice says "Loaded <name>'s backup into
    <person>".
  - **Format 1.1** ([ADR 0011](adr/0011-backups-1-0-merge.md)): a backup
    says `app: 'noodlepads'` (`'noodle-pads'` before the 1.0 rename, still read), `format: '1.1'` (1.1 added groups, ADR 0013, and key layouts, ADR 0014; touch layouts came later and additively, ADR 0029), and any `1.x` loads. A backup
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
list on noodlepads.com. Their sounds, beats, songs, takes, keys, key and touch layouts, kit edits
and settings then open on any phone or tablet, and changes on one device reach
the others. Design and free-plan budget: `docs/design/cloud-profiles.md`; why:
ADR 0002.

- **By themselves.** A person who has made something (a sound, beat, song,
  take or kit edit) goes to the cloud on the next sync. A typed name from
  before is swapped for a fun name first, so it never leaves the device. A
  person who has made nothing (a new device's empty first board) stays here
  until their ☁️ In the cloud is switched on.
  👥 People → ☁️ Open from the cloud puts someone from the list on this device.
- **📴 Offline (this device only)**: ☁️ In the cloud switched off in a
  person's profile deletes their cloud copy (tap twice; the PIN if it has
  one) and keeps them out of the cloud; switched on, they go back. A person
  taken out of the cloud on another device goes Offline here too, rather than
  coming back by itself.
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
  `scope: 'person'`): Advanced, the time signature, pad size, pad skin. The
  keyboard, problem reports and the device code stay with the device.
- **PIN:** optional, 4 digits, in a person's profile sheet (once they are in
  the cloud). It is asked each time that person is opened, on every device;
  no device keeps the key (it lives for the visit only, `cloud.js`
  `sessionKeys`), so a person with a PIN syncs only once it is typed.
  **Nothing of theirs is read or changed past it** (Ben, 2026-10-24), and
  once typed it holds until the page reloads (`cloud.js` `pinGuards`, the
  PIN typed on this visit): their profile opens only after it (so 🗂️ See
  all, ⬇️ Export a backup, Delete and the cloud tools are behind it;
  `people.js` `openProfileSheet`), 👥 People shows "🔒 PIN to see" in place of
  their counts, the sound chooser leaves out their own sounds
  (`app.js` `groupsForChooser`), and 💾 Save a backup and 📂 Load a backup
  ask for it before reading or adding to them, leaving them out when it isn't
  typed ("Left out <name>: their PIN wasn't typed."; a one-person backup for
  or into them loads nothing; `backup-ui.js` `pastPins`). A sync from
  another device still changes them: the gate is on this device's screens.
  It keeps kids out of each other's things; the browser's own storage on the
  device is not encrypted. 5 wrong tries mean a 10-minute wait.
- **A PIN new to this device:** a PIN set or changed on another device closes
  the profile on every device. The next sync here is refused (401); the
  public list says whether the profile has a PIN now (a reset: it opens again
  by itself, no PIN asked). If it has, the link says `newPin` and the person
  can't be opened until it is typed: the person showing goes behind the PIN
  pad at once. Its 🤷 I don't know the PIN (two taps) deletes them from this
  device with everything of theirs here (unsynced work too); the cloud copy
  stays (`cloud.js` `keyRefused`, `app.js` `dropLockedPerson`).
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
- **To delete a profile and everything in it:** 👥 People → tap them → tap
  Delete three times (the third deletes the cloud copy), or switch ☁️ In the
  cloud off (tap twice) to keep it on this device. Either asks for the PIN
  if it has one. What it
  shared stays shared.
- **What's private:** read [Privacy](../README.md#privacy) in the README. Everyone who makes something is
  in the public list unless their ☁️ In the cloud is switched off.
- **Managing the database** (Ben): `just cloud-profiles` lists every profile;
  `just cloud-prune --days 180 --empty` shows idle and empty ones and loose
  sounds, `--yes` deletes them; `just cloud-migrate` brings the live schema up
  to date (`worker/migrations/`). Every deploy checks the live cloud with a
  throwaway profile of its own (`just cloud-smoke`, `just cloud-e2e`), made
  and deleted in seconds; `just cloud-prune --smoke` clears one a killed check
  left.
- **Player metrics** (Ben, ADR 0016, narrowed by ADR 0027), for people in the
  cloud only: the cloud notes each device that uses a profile (type, browser,
  OS, screen width, app version, syncs, first and last seen) and each make,
  open, pull, push, share, PIN change and wrong PIN with the country it came
  from. D1 keeps events 14 days (a device's row 90). The telemetry runner
  (pdxfixit/telemetry) harvests them daily, with Cloudflare's stats for the
  site, and keeps them (ids a year at most). `just cloud-stats` reads only its
  mirror, as `telemetry.py pull` leaves it on the Mac
  (`~/.local/state/telemetry/telemetry.sqlite3`, read only; or
  `$TELEMETRY_DB`), lists what each player made, and shows per player: devices,
  places (the country; nothing finer is kept) and activity over the last 14
  days (`--days N`) and by hour. A player seen from more than one place is
  flagged ⚠️. Test profiles are left out. Deleting a profile deletes its
  metrics in D1, not in the runner's copy. The feature-use counts and visit
  summaries ADR 0016 once added are retired (ADR 0027): the usage events below
  cover them. Older copies of the app that still send them are answered and
  ignored until about 2026-11-16.
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
  Besides the screens, controls and the rest, each visit also sends how late a
  sound played (`perf.latency`) and how much was played (`noodlepads.play`:
  pads, keys, roll notes, song blocks and Kids pads, one count each; never
  which sound), as the page hides, and not when nothing was played. Each load
  also says the person's level (`noodlepads.level`: kids, regular or advanced)
  once, and `app.open` carries the browser's family (chrome, safari, firefox,
  edge, samsung, opera or other), never the full browser string.

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

Backups, older sounds found on this device, uploaded files and `boards.json` are treated as untrusted. Feedback is capped at 2000 characters in the box and 4096 bytes at the Worker (the app says when a message is too long to send). A backup
may unpack to at most 300 MB, hold at most 5000 files, `backup.json` at most
8 MB, each sound at most 80 MB (a 3-minute song saved as a sound is 35–69 MB),
older sounds found 2 GB in all, and record counts are capped; anything
malformed is dropped, and the notice says what and why ("Left out: 1 sound
whose file isn't a sound file"). A sound stored with no type or a video type
keeps its audio. A person's avatar must be exactly one emoji from the full
list (`web/emoji-check.js`), in a backup and at the Worker; a sound's picture
is at most 8 characters. A chosen sound
file must be under 10 MB and 120 seconds. Rendered voices are cut at 180 s.
A song file 🎧 From a song listens to must be under 20 MB (a 20-minute MP3; a long WAV is made an MP3 first), and
only its first 15 minutes are heard: it is decoded whole, in memory
(`web/listen-input.js`).

## Notices and Undo

Every one-line notice (a backup saved, a save that failed, a full beat) and
every ↩️ Undo after a change (a deleted sound on Pads, a removed or cleared
row, a groove loaded, 🆕 New keeping a scratch beat or song, a row's
loudness) shows in **one banner floating over the top of the screen**
(`ui.js` `showBanner`, the `#banner` element). It never takes room in the
page, so nothing under it moves; it sits over the sticky header, and over an
open dialog such as ⚙️ Settings (it is a popover in the top layer, and moves
inside the open dialog, which makes the rest of the page inert). One shows at
a time: the newest replaces it. It has ✕, and its yellow action when there
is one (↩️ Undo). It slides down as it comes and fades up as it goes (only
fades with reduced motion), after 10 s for a notice and 8–10 s for an Undo;
a finger, the mouse or focus on it holds it. When it goes with focus inside,
focus goes to a nearby control (+ Add a row, ➕ Add a lane, ● Record, ✏️ Edit
sounds). The same notice said again within a minute never pushes an Undo
away. Every notice is written to the event log. Two things stay where they
are: the take card after a take in 🎤 Live (▶ Play, 🔊 Make a sound, ✏️
Rename, ↩️ Undo) and the 🆕 update bar at the bottom.

## Versions and updates

The corner says when the build went live, in the device's own time zone ("Updated Oct 19, 9:27 PM", `util.js` `updatedText`); a tap opens ⚙️ Settings at About, whose version line adds the commit, a link to it on GitHub. Every deploy runs the stamp, which writes `web/version.json`
(gitignored): `version` is `v<release>-<short commit>` (`v1.0.215-4d5ef56`; the release is `RELEASE` in `web/version.js`, which `just version` bumps to the commit count with every change to `web/`, read through `site/site.conf` `release=`), plus `-dirty` for uncommitted edits in `web/`
or `worker/`; `commit` is the short commit; and the time. About shows the release (the label's X.Y.Z) and links `commit`; the footer shows neither, and the update check, telemetry and problem reports use the whole label. The app shows
it small in the bottom corner, so the live site says which commit it is; a
`-dirty` suffix means uncommitted edits were deployed. Without the file (the dev
server) it shows "dev copy". Tapping the version or date opens ⚙️ Settings
scrolled to the bottom, at About and the credits. A deploy that skips the stamp (wrangler run by hand)
leaves the previous version showing; flarepress warns when the stamp is old.

**🆕 An update for Noodle Pads is ready.** A page left open keeps the code it
loaded. The app asks `version.json` (`cache: 'no-store'`) when the page is
focused or shown again, at most once a minute, and every 10 minutes while it
shows. When the live version differs from the loaded one, a bar
offers **Reload** and ✕; on a phone (under 560 px) it says just "🆕 An update is ready." ✕ hides it until the next check, 10 minutes later or on coming back. It floats over the bottom, above the toolbar, and does not fade.
It neither asks nor shows while a sound is recorded, a beat, song or take plays,
a pad loops, or any sheet or dialog is open (the sound sheet keeps its edits
until Save), and catches up after. Everything else is already saved in
IndexedDB, and cloud sync runs again on start, so Reload loses nothing. A dev
copy never asks (`web/update.js`).

## Installing it

Noodle Pads installs like an app, from the browser's own menu; the app has
no install button.

- **Android (Chrome):** Chrome offers "Install app" (or menu ⋮ → Add to
  Home screen). It opens full screen, with its own icon.
- **iPhone and iPad (Safari):** Share → Add to Home Screen.

**With no network.** After one visit, the app opens with no network,
installed or not: the service worker (`web/sw.js`, registered by
`web/offline.js` once the page has loaded) keeps a copy of the whole app,
the ready-made sounds (about 5.5 MB of the 6 MB) and the fonts and
patterns included. Online it changes nothing: every file comes from the
network first, and the kept copy is used only when that fails, so a new
version shows on the next load as before. Each file that comes in refreshes
the kept copy, and a page load that finds a new `version.json` fetches the
whole app again in the background, so the copy offline is one version, not
a mix.

Offline, the corner names the version the device holds. The 🆕 update
check ignores that answer (the worker marks it `X-Noodle-Offline`), so it
never offers an update it cannot know about.

What still needs the network: ☁️ the cloud (syncing, PINs, 👥 the profile
list), 🔗 share codes, 📮 problem reports and 📊 play data. Sounds a kid
records are on the device already and play offline. `/api/` never goes
through the kept copy.
