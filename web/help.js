// Help: the ❓ button's picture reference of what each control does, one tab
// per part of the app. A place to look things up, never a lesson: nothing
// pops up on its own (ADR 0004). Each line pairs a small drawing of the
// control, in the app's own button styles, with one short sentence.
//
// The drawings use the real labels. tests/help.test.mjs checks that every
// label drawn here still appears in index.html or the code, so a renamed
// button shows up as a failing test, not as a help page that lies.

import { state } from './state.js';
import { VOICES } from './voices.js';
import { PIN_RESET_EMAIL } from './contact.js';
import { openDialog, setupDialog } from './dialogs.js';

// Picture pieces. `t` is a real label, checked by the test.
const tool = (t) => ({ k: 'tool', t });        // an outlined button (most buttons)
const lit = (t) => ({ k: 'lit', t });          // a button switched on
const add = (t) => ({ k: 'add', t });          // a dashed "add" button
const play = (t) => ({ k: 'play', t });        // the big yellow Play
const rec = (t) => ({ k: 'rec', t });          // ● Record (Live, and Beats with ⌨️ Keys)
const chip = (t) => ({ k: 'chip', t });        // a button in Settings
const toolbar = (t) => ({ k: 'toolbar', t });  // a toolbar button
const addPad = (t) => ({ k: 'addpad', t });    // the "+ New sound" pad
const mic = (t) => ({ k: 'mic', t });          // the sound sheet's red Record
const slider = (t, value) => ({ k: 'slider', t, value });
const seg = (...t) => ({ k: 'seg', t });       // a row of latching keys: 1 bar | 2 bars | 4 bars
const voice = (id) => ({ k: 'voice', id });    // a voice chip, drawn from VOICES
// Examples, not labels: a pad, a key, pills, a bit of text.
const pad = (emoji, name, color) => ({ k: 'pad', emoji, name, color });
const key = (letter, emoji, name) => ({ k: 'key', letter, emoji, name });
// Pills, one character each: "." off, "1" the bar's first (off), "x" on, "L" loud.
const pills = (s) => ({ k: 'pills', s });
const word = (t) => ({ k: 'word', t });
const eg = (t) => ({ k: 'eg', t });            // a button showing an example value, like ×2
const person = (letter, color) => ({ k: 'person', letter, color });   // the round whose-sounds button
const count = (n, color) => ({ k: 'count', n, color });              // ● Record's big count-in

// The parts of Help: the toolbar's screens in toolbar order, then Settings.
// `screen` is the toolbar screen a part is for, so ❓ opens on it;
// tests/help.test.mjs checks every screen has one. Items marked `soon`
// describe features other work is adding; they stay hidden until that work
// lands and the mark is removed. `adv` items need the Advanced switch in
// Settings and say so.
export const HELP = [
  {
    id: 'pads', screen: 'pads', tab: '🔊 Pads', title: 'Pads',
    items: [
      { pic: [pad('😂', 'Laugh', '#FFD60A')], text: 'Tap a pad to play it. Tap it again to start it over. On a touch screen it plays as your finger lifts, so scrolling never plays one.' },
      { pic: [pad('🥁', 'Snare', '#4C8DFF'), word('👆 hold')], text: 'Hold a pad (or Shift-click it) to loop it. Hold more pads to stack loops. Tap one to stop it.' },
      { pic: [word('🔁'), pills('1.x.')], text: 'While a beat plays, a loop waits for the next 1, so it stays in time.' },
      { pic: [toolbar('Stop all')], text: 'Stops every sound and the beat.' },
      { pic: [slider('Pad size', '')], text: 'Pad size, at the top beside ✏️ Edit sounds: slide left for smaller pads (more on a line), right for bigger ones. All the way left is the smallest this screen shows; all the way right, the biggest. The pads change as you slide.' },
      { pic: [word('▾ 🥁 Drums')], text: 'Tap a group of presets to open or close it.' },
      { adv: true, pic: [pad('🍑', 'C♯ · D♭', '#1FC7B0')], text: 'Notes, Chords and Bass get the sharps and flats, in order between the others. C♯ and D♭ are two names for the same black key, between C and D.' },
      { pic: [person('C', '#7C3AED')], text: 'Whose sounds: the round picture (or letter) at the top right. Tap it to switch to someone else’s pads, or 👥 People to add someone.' },
      { pic: [tool('⬆️')], text: 'Once you scroll, the top shrinks to one slim line: the round picture, ❓ and ⚙️ move to the left, with ⬆️ to jump back to the top.' },
      { pic: [tool('✏️ Edit sounds'), lit('✅ Done')], text: 'Stays at the top as you scroll. Hold and drag a pad to move it (with a keyboard: Alt and ← →). ✅ Done goes back to playing.' },
      { pic: [word('✏️ 🗑️ 👁')], text: 'In Edit sounds, on a pad’s top right corner: ✏️ changes its name, picture, color and voice. 🗑️ deletes a sound you made (tap twice; Undo brings it back) or hides a preset; 👁 brings a hidden one back. A group with every pad hidden goes away, and comes back in Edit sounds.' },
      { pic: [word('✏️')], text: 'With a mouse, ✏️ shows on a pad as you point at it, any time: click it to change that sound.' },
      { pic: [word('◯ ✓'), tool('Clear')], text: 'In Edit sounds every pad has a circle at its top left. Tap the pad or its circle to select it: the circle fills with a tick. Clear lets go of them all.' },
      { pic: [tool('Select all'), word('☑️ Select its 6 sounds')], text: 'Once one is picked, Select all picks every sound you made. A group\'s ✏️ can pick just that group\'s sounds.' },
      { pic: [tool('Move to group'), tool('Color · picture'), tool('Voice'), tool('Share'), tool('Delete')], text: 'Then act on them all at once: put them in a group of yours (or a new one), give them one color or picture, one voice, one share code, or delete them (tap twice; Undo brings them back). Presets keep their own groups and can’t be shared.' },
      { pic: [word('▾ 📁 My group  ✏️')], text: 'Your own groups show under your sounds, like the presets’ groups. Tap one to open or close it. In Edit sounds, its ✏️ renames it, moves it up or down, or deletes it (its sounds stay). A group with no sounds goes away.' },
      { pic: [word('1 … 9  ←  →  Space')], text: 'On a keyboard: 1 to 9 play the first pads, ← → change whose sounds, Space (or Esc) stops everything.' },
      { pic: [word('💬 Tap a pad to play it.')], text: 'The line at the bottom of each screen says how to use it.' },
    ],
  },
  {
    id: 'sounds', tab: '🎙️ Sounds', title: 'Making a sound',
    items: [
      { pic: [addPad('New sound')], text: 'Make your own sound. It goes on your pads.' },
      { pic: [mic('Record')], text: 'Tap Record. It counts 3, 2, 1, then make your sound and tap Stop. It tells you if you are too loud or too quiet.' },
      { pic: [tool('Choose a file')], text: 'Or use a sound file you already have.' },
      { pic: [tool('✨ Make one')], text: 'Make a sound with no microphone: a laser, a boom, a coin.' },
      { pic: [voice('chipmunk'), voice('monster'), voice('slow')], text: 'Tap a voice (just its picture; hold it or Shift-click it to see its name) and watch the knobs move: a voice is the knobs set a certain way. Your recording stays as it was.' },
      { pic: [word('Chipmunk is: higher +9, faster 1.74×')], text: 'The line under the voices says which knobs make the voice you tapped.' },
      { pic: [voice('chipmunk'), word('+'), voice('stadium')], text: 'Tap a second voice to add its knobs on top. If both use the same knob, the last one you tapped wins. Tap a lit voice again to take it off.' },
      { pic: [tool('🎲 Surprise me')], text: 'Picks voices for you. Keep it if you like it.' },
      { pic: [word('✦')], text: 'Clones, Walkie-talkie and Monster have a ✦ special part no knob can make. It shows as a layer of its own, with ✕ to take it out.' },
      { pic: [slider('Deeper ↔ higher', '5 notes deeper')], text: 'Layers: one row per knob, top to bottom in the order they play. Deeper ↔ higher still sounds like you, just lower or higher. Slower ↔ faster, Warble, Softer ↔ louder and Echo are always there. Move one and it is your own voice.' },
      { pic: [tool('+ Add a layer')], text: 'Adds another knob: Backwards, Muffled ↔ Bright, Robot, Crunch or Stutter. ✕ takes it out (tap twice). A voice that uses one adds it for you, and the rows it moves glow.' },
      { pic: [tool('🔈'), tool('🔇')], text: '🔈 mutes a layer: it keeps its setting but doesn’t play. 🔇 brings it back.' },
      { pic: [tool('⭐ Save voice')], text: 'Keeps the knobs as your own voice, with a name and a picture. It shows after the voices, goes with you to every device, and is in your backups.' },
      { pic: [tool('My voices ▾')], text: 'All your own voices: tap one to use it, ✏️ to rename it, 🗑️ to delete it (tap twice). Your three newest also show as voices.' },
      { pic: [tool('↩️ Reset voice')], text: 'Puts every knob back in the middle: the sound as you recorded it.' },
      { pic: [tool('⤢ Turn into knobs')], text: 'A sound made with an older voice plays it just as before. Turn into knobs swaps it for knobs (close, not the same); ↩️ The old way brings it back.' },
      { pic: [slider('Speed', '6×')], text: 'An older voice has its setting: tap its name to see it. A setting with only a few choices shows them as keys; with no room for them, a slider.' },
      { pic: [tool('▶︎'), tool('■')], text: '▶︎ at the top left of the sheet plays the sound as it sounds now, every layer and change included; ■ stops it. Space does the same.' },
      { pic: [tool('👂 Plain')], text: 'Under the wave: plays it with no voice, so you can hear what the voice changes. Tap ▶︎ to hear the voice again. It wakes up once a voice or a layer is on.' },
      { pic: [word('Burp')], text: 'Its name is at the top of the sheet, over a dashed line: tap it to rename the sound.' },
      { pic: [word('▾ Layers')], text: 'Tap Voice or Layers to fold it away, and again to open it. ⭐ Save voice and ↩️ Reset voice stay where you can reach them.' },
      { pic: [play('Save sound')], text: 'Pick a picture and a color, then save it.' },
      { pic: [tool('Keep editing'), tool('Throw away')], text: 'Close the sheet after changing something (✕, a tap outside it, or Esc) and it asks first. Keep editing goes back to your sound; Throw away closes it and loses the changes. Save sound never asks.' },
      { pic: [tool('…')], text: 'The … at the end of any picture list opens All emoji: every emoji, in groups that open and shut with a tap on their name, with a search box. Type a word like frog or rocket, and the groups with a match open. The newest ones may show as empty boxes on an older phone.' },
      { adv: true, pic: [tool('+ Add a layer'), tool('⤢')], text: 'With Advanced on, + Add a layer also has steps, like echo or muffled. They play after the knobs; drag the dots at a step’s left to change their order. ⤢ opens a voice into its steps.' },
      { adv: true, pic: [tool('🎲 Surprise steps')], text: 'Makes a few steps for you to try.' },
      { adv: true, pic: [tool('⚙️ Advanced')], text: 'The switch at the bottom of Layers turns Advanced on or off, the same as in Settings.' },
      { adv: true, pic: [lit('🥁 On the beat')], text: 'On an Echo step: the echoes land in time with your beat. The keys pick how far apart, like 1/8 or 1/4.' },
      { adv: true, pic: [seg('Smooth', 'Buzzy', 'Hiss')], text: 'After ✨ Make one: tap a Tone, then slide where its pitch starts and ends and how long it lasts.' },
      { adv: true, pic: [tool('🎵 Find its note')], text: 'Hear which note a sound is, and Tune it, so it plays in tune in a tune row (🎹).' },
      { adv: true, pic: [tool('➕ Mix with another sound')], text: 'Layer two sounds into one new pad, like a boom under a clap.' },
      { adv: true, pic: [tool('✂️ Trim and edit'), lit('✂️ Ends')], text: 'Drag the handles to cut the quiet off the start or end. The sound gets shorter; ↩️ Undo puts it back.' },
      { adv: true, pic: [lit('📐 Fades')], text: 'Drag a handle in from an end to make the sound fade in or fade out.' },
      { adv: true, pic: [lit('👆 Select part'), tool('🔄 Backwards'), tool('🔇 Silence it')], text: 'Drag the handles around a part, then change just that part: backwards, silent, 🔊 Louder or 🔉 Quieter.' },
      { adv: true, pic: [tool('✂️ Keep only this')], text: 'Keeps just the part you picked. Your recording stays as it was, and ↩️ Undo steps back.' },
      { adv: true, pic: [tool('🧩 Chop into pads')], text: 'Finds where each sound starts. Drag, add or remove the marks, then 🧩 Make pads turns each piece into a new pad.' },
    ],
  },
  {
    id: 'beats', screen: 'beats', tab: '🥁 Beats', title: 'Beats',
    items: [
      { pic: [word('🥁 Scratch beat'), tool('💾 Keep')], text: 'Your scratch beat is open whenever nothing else is: play with it, load grooves into it, and nothing fills up 🗂️ My beats. 💾 Keep puts it in 🗂️ My beats with a fun name (a groove keeps its name too: “Sleepy Squid (Ska version)”), and the scratch starts empty again.' },
      { pic: [tool('🆕 New'), tool('🗂️ My beats')], text: '🆕 New stops the beat playing and opens a blank scratch beat, with no rows. Nothing goes in 🗂️ My beats until you 💾 Keep it, and a beat of yours stays there as it was. If your scratch beat had something in it, Undo brings it back. 🗂️ My beats (just 🗂️ on a phone) holds them all: open one, 📌 pin, ⧉ copy or 🗑️ delete.' },
      { pic: [word('🥁 Wobbly Thunder'), tool('✏️')], text: 'A beat in 🗂️ My beats saves itself. Tap its name or ✏️ to rename it.' },
      { pic: [word('1 Wobbly Thunder'), word('2 ⏳ Boom Bap')], text: 'Under the beat bar: 8 numbered spots for your beats, the open one lit. Pinned beats come first; the rest are the beats you used last, and tapping one never moves it. Tap one to open it. While a beat plays, the one you tap waits (⏳) and starts at the next bar, so the music never stops. They wait while you record.' },
      { pic: [tool('📌')], text: 'In 🗂️ My beats: pins a beat to the first spots under the beat bar, in the order you pin them (up to 8). Tap 📌 again to unpin it.' },
      { pic: [tool('⧉'), tool('🗑️')], text: 'In 🗂️ My beats: copy a beat, or delete it (it asks first).' },
      { pic: [chip('🔊 Make the open beat a sound')], text: 'In 🗂️ My beats: turns the beat into a pad.' },
      { pic: [tool('⬇️'), chip('📥 Load a beat file')], text: 'In 🗂️ My beats: ⬇️ saves a beat as a file to take to another phone or tablet; 📥 opens one. Only presets go with it.' },
      { pic: [play('▶ Play')], text: 'Plays the beat round and round. Pills only sound while it plays.' },
      { pic: [slider('', '120')], text: 'How fast. Tap the number to type one. On a small screen the slider turns into ⌄ ⌃.' },
      { pic: [tool('⏲️')], text: 'The click track: a tick on every beat while the beat plays, to keep time. It is never saved.' },
      { pic: [seg('1 bar', '2 bars', '4 bars')], text: 'How long the beat is.' },
      { pic: [tool('🎚️'), word('Mute'), word('Solo')], text: 'The 🎚️ Mixer, after the bars: a column for each row with a fader (slide it up for louder), Mute, Solo (only the solo rows play) and one effect, like 🏛️ Room or 🤖 Robot. The Master column at the end is the whole beat. On a phone, swipe sideways for more rows. Mute and Solo save with the beat; All on brings every row back.' },
      { adv: true, pic: [seg('4/4', '3/4', '6/8')], text: 'Time signature, beside the bars: how this beat counts. 4/4 is most songs; 3/4 is a waltz.' },
      { adv: true, pic: [seg('Straight', 'Swing', 'Shuffle')], text: 'Swing makes the beat bounce: every second pill plays a little late. Shuffle bounces most.' },
      { adv: true, pic: [word('4/4 ▾')], text: 'When the line runs out of room, these turn into pickers. Tap one to choose.' },
      { pic: [add('+ Add a row')], text: 'Opens the sounds. Tap as many as you like (each plays, and gets a number), then Add: a new row for each, in that order. The sound after your last row comes ticked, so Add straight away gives you the next one.' },
      { pic: [pills('.x.L')], text: 'Tap a pill to turn it on, tap again to turn it off. Hold it (or Shift-click it) for a loud hit (white ring); hold again for a normal one.' },
      { pic: [pills('1...')], text: 'The brighter pill with a dot is the 1: where each bar starts.' },
      { pic: [word('⠿ ▾ 🦶 … 🔔 🔊 🧹 ✕')], text: 'Each row starts with one line: its emoji at the left, and at its right ✕ removes it and 🧹 clears its pills (each asks first, in red: ✕? or 🧹?, so tap twice); ↩️ Undo brings a removed row back. Its pills fill the width below. Tap the row’s emoji to change its sound; tap a sound to hear it first.' },
      { pic: [tool('⋯')], text: 'On a narrow phone a row’s line has no room for every button, so 🔔, 🧹 and ✕ move into ⋯ at its end (the speaker stays). Tap ⋯ for 🔔 Overlap, 🧹 Clear and ✕ Remove: they work as on the line, and Clear and Remove still ask first.' },
      { pic: [tool('🔊'), word('🔉 🔈 🔇')], text: 'Each row’s speaker. Tap it to mute the row (🔇), and again to hear it. Hold it (or Shift-click it), or drag it, for a loudness slider, to mix one row quieter than another. The bar along its bottom shows how loud; lit yellow, it is muted. ↩️ Undo puts it back.' },
      { pic: [word('⠿ ▾')], text: '▾ folds a row down to its first line, and ▸ opens it again. Drag the grip ⠿ before it to move the row.' },
      { pic: [tool('💃 Grooves')], text: 'In the beat bar, before 🆕 New (just 💃 on a phone): about 30 ready-made beats, many with bass and chords, grouped by style. Tap a style to open it. ▶ beside a groove plays a few seconds of it first. Undo takes a groove back.' },
      { pic: [lit('📝 Into my scratch'), tool('➕ Add to this beat')], text: 'In Grooves: load one into your scratch beat (a beat in 🗂️ My beats stays as it is; a scratch with hits is replaced, and a line says so, with Undo), or add its hits to the beat you have open.' },
      { pic: [lit('🔔')], text: '🔔 Overlap, on each row’s line before its speaker. Lit, the row’s hits ring over each other (up to 8 at once); off, each hit cuts off the one before. It saves with the beat. On ⌨️ Keys’ rows too.' },
      { adv: true, pic: [seg('½×', '1×', '2×')], text: 'In a row’s sound picker: Speed ½× or 2× plays the row at half or double.' },
      { pic: [add('🎹 Add a tune')], text: 'A row that plays a tune: its sound at any note, as long as you like. It opens 🎹 the piano roll. The row shows where its notes start, with 🎹 on its emoji; tap the emoji or a pill to open the roll again.' },
      { pic: [lit('🎹 Tune')], text: 'In a row’s sound picker: turns any row into a tune row (its pills become notes), or back (it asks first if notes would lose their pitch).' },
      { pic: [word('C D E'), pills('.x..')], text: 'In the piano roll: the notes go up the side, the beat goes across. Tap a square for a note one pill long. Drag a note sideways to make it longer or shorter. Tap a note to take it out; ↩️ Undo puts it back. ✅ Done goes back to the beat.' },
      { pic: [tool('⌃'), tool('⌄'), tool('♯ All notes')], text: 'Two octaves show at a time: ⌃ ⌄ (or a swipe up or down) go higher or lower, and a number on them says how many notes are out of sight. At first only the white keys show, so every note fits; ♯ All notes shows the sharps and flats too.' },
      { pic: [play('▶ Play'), word('🥁 ·•·•')], text: 'In the piano roll, ▶ Play plays the whole beat with a line moving along. The strip on top shows where the other rows hit.' },
      { adv: true, pic: [lit('½ Half pills')], text: 'In the piano roll: the squares are half a pill, for notes that start or end between pills.' },
      { pic: [lit('⌨️ Keys')], text: 'In the beat bar, after 💃: shows the keys under your beat (just ⌨️ on a phone). Play a key and its sound gets a row, even when not recording; rows go in the order of the keys. Tap ⌨️ again for the rows on their own. This phone or tablet remembers it.' },
      { pic: [play('▶ Play'), rec('● Record')], text: 'With ⌨️ Keys on, ● Record joins the control bar. ▶ Play plays your beat round and round without recording; ● Record records onto it.' },
      { pic: [rec('● Record'), count(1, '#FF6B6B'), count(2, '#FFB347')], text: '● Record counts you in with big colored numbers, then GO! Your hits land as pills in the beat. It goes round until you tap Stop. After the count-in you can change the speed; the bars wait for Stop.' },
      { pic: [pills('x...x...'), word('┊ ┊')], text: 'Keep playing into the last bar and the beat grows: 1 → 2 → 4 bars, each new bar a copy to play over (the dashed bar shows there is room). Rest for a bar and it goes round instead. ↩️ Undo puts it back.' },
      { pic: [word('Shift + key')], text: 'While recording: a hit one pill earlier, for when you were a bit late.' },
      { pic: [tool('💃 Grooves'), tool('↩️ My beat')], text: 'With ⌨️ Keys on, a groove loads into your scratch beat, stopped, behind you. ▶ Play plays it round while you play the keys. ● Record adds your hits on top; 💾 Keep saves it, named after the groove. ↩️ My beat takes the groove back out: the beat you had open comes back.' },
      { pic: [word('🦶'), pills('.x.L'), word('🔊 🧹 ✕')], text: 'With ⌨️ Keys on, the rows work the same: tap a pill on or off, hold it (or Shift-click it) for a loud hit; ✕, 🧹 and the speaker as above. A full beat makes room by reusing an empty row. Tap a row\'s emoji to pick a new picture for that sound: its pad, its key and its rows all change. A picture another sound has asks first.' },
    ],
  },
  {
    id: 'song', screen: 'song', tab: '🎼 Song', title: 'Song',
    items: [
      { pic: [tool('🎼 Song')], text: '🎼 Song in the bar at the bottom: put your saved beats on lanes, and the lanes play together.' },
      { pic: [word('🎼 Scratch song'), tool('💾 Keep')], text: 'Your scratch song is open whenever nothing else is. 💾 Keep puts it in 🗂️ My songs with a fun name, and the scratch starts empty again. 🆕 New opens a blank scratch song (Undo brings back what was in it); a song of yours stays in 🗂️ My songs as it was.' },
      { pic: [word('🎼 Big Parade'), tool('✏️')], text: 'A song in 🗂️ My songs saves itself. Tap its name or ✏️ to rename it. In 🗂️ My songs, ⧉ copies a song and 🗑️ deletes it.' },
      { pic: [eg('Sleepy Squid'), word('→ a lane')], text: 'Pick a beat in the strip of your beats, then tap a spot on a lane: it goes there. Tap more spots for more. Only beats in 🗂️ My beats show: 💾 Keep a beat first.' },
      { pic: [eg('Sleepy Squid ×3'), word('⟷')], text: 'Tap a block to select it. Drag its ⟷ end to play it more or fewer times, or tap ➖ ➕. 🗑️ takes it off (tap twice). Blocks on one lane never overlap.' },
      { pic: [word('🥁 Drums'), word('🔊')], text: 'Each lane has a name and a picture: tap them to change them. Its speaker: tap to mute the lane, hold or drag for its loudness.' },
      { pic: [add('➕ Add a lane')], text: 'Up to 8 lanes. On a phone four show at once, and the rest scroll.' },
      { pic: [eg('100'), word('BPM')], text: 'The song’s tempo: every beat in it plays this fast, whatever its own tempo on Beats. The first beat you put in sets it.' },
      { pic: [play('▶ Play song'), word('▶ 5')], text: 'Plays every lane together, with a line showing where it is. Tap a bar number first to play from there.' },
      { pic: [tool('↩️ Undo')], text: 'Takes back the last change: a block put in, repeated or taken off, a lane added or renamed, the tempo.' },
      { pic: [word('← → Enter')], text: 'With a keyboard: Tab to a lane, ← → to a bar, Enter puts the picked beat there or selects the block. + and − repeat it; Delete takes it off.' },
      { pic: [tool('🔊 Save as a sound')], text: 'Turns the whole song into a pad, up to 3 minutes long.' },
    ],
  },
  {
    id: 'live', screen: 'live', tab: '🎤 Live', title: 'Live',
    items: [
      { pic: [key('1', '🍎', 'C'), key('A', '🦶', 'Kick'), key('S', '🥁', 'Snare')], text: 'Tap a key, or press it on a keyboard: the number row (1 to 0) and the three letter rows under it. Hold one (or Shift-click it) to keep it going.' },
      { pic: [seg('S', 'M', 'L')], text: 'Pad size, on a phone or tablet.' },
      { pic: [word('⚙️ ⌨️ Keyboard')], text: 'In ⚙️ Settings: pick your keyboard so the letters on the keys match yours.' },
      { pic: [tool('✏️ Edit keys')], text: 'Arrange the keys. Layouts on top load a whole keyboard; Sounds below go on one key at a time, or a group on a row. The same keys play on 🥁 Beats with ⌨️ Keys on.' },
      { pic: [word('⭐ My keys'), word('🥁 Beat lab')], text: 'Tap a layout to load it. Your own keys are kept as ⭐ My keys, so nothing is lost. ⭐ Save this layout names yours.' },
      { pic: [key('A', '🦶', 'Kick')], text: 'Tap sounds to pick them, then tap a key. Or drag (on a touch screen, hold first): onto a key, a key onto another to swap, or off the board to clear it. Tap a group twice to fill a row, or drag it onto one, the number row too. ✕ Unpick all lets go of the picks.' },
      { pic: [tool('↩️ Undo'), tool('↺ Reset keys')], text: 'Undo takes back the last change. Reset keys puts them all back how they started (tap twice).' },
      { pic: [tool('⏲️ Click track')], text: 'A tick on every beat to keep time. It is never recorded. It sits bottom right, left of 🔔 Overlap and ✏️ Edit keys, with its tempo slider beside it while it is on.' },
      { pic: [lit('🔔 Overlap')], text: 'Right of ⏲️ Click track. On, every key’s hits ring over each other instead of starting its sound again, and a take keeps them that way. Holding a key still loops it. Just for this visit: it is off again next time.' },
      { pic: [tool('⏲️ Click track'), word('👆 96')], text: 'Tap ⏲️ three times or more in time to set the speed: it says “keep tapping…”, then 👆 and the tempo. One or two taps just turn the click on or off.' },
      { pic: [rec('● Record')], text: 'Records what you play, exactly when you play it. It starts at your first hit.' },
      { pic: [tool('▶ Play'), tool('🔊 Make a sound'), tool('✏️ Rename'), tool('↩️ Undo')], text: 'After a take: play it, make it a pad, rename it, or undo it. Making a second pad asks “Make another?” first.' },
      { pic: [tool('🎬 Takes')], text: 'Everything you recorded. Play, rename or delete one, or make it a sound.' },
    ],
  },
  {
    id: 'settings', tab: '⚙️ Settings', title: 'Settings',
    items: [
      { pic: [word('⚙️')], text: 'Settings is the gear at the top.' },
      { pic: [word('▸ 🔗 Sharing   ▾ 💾 Backups')], text: 'Tap a heading to open or close it. This device remembers which are open. About, with the version and the Privacy policy, is always open at the bottom.' },
      { pic: [chip('👥 People')], text: 'Not in Settings: tap the round picture at the top right, on any screen, then 👥 People: one line per person, and ➕ Add a person. Tap someone for their profile: name, picture, color, cloud, PIN and Delete.' },
      { pic: [chip('🎲 Pick a name')], text: 'In someone’s profile: a dozen fun names, and a few special ones, to choose from. 🎲 More names shows another dozen; ✕ keeps the name you have. Nobody types a name.' },
      { pic: [word('🎨 Color'), chip('Picture')], text: 'In someone’s profile: tap a color, or Picture to choose an emoji. With a PIN, changing the name, picture or color asks for it once, until the page reloads.' },
      { pic: [word('🔊 27 · 🥁 4 · 🎼 1 · 🎬 1')], text: 'In 👥 People, under each name: how many sounds, beats, songs and takes they have on this device. Each kind keeps its emoji everywhere: 🔊 sounds, 🥁 beats, 🎼 songs, 🎬 takes.' },
      { pic: [chip('☁️ Cloud'), chip('🔄 Sync now')], text: 'Everyone goes to the cloud once they make something, and opens on any phone or tablet. In 👥 People, ☁️✓ by a name means in the cloud, 🔒 that they have a PIN. Their profile’s ☁️ Cloud shows more.' },
      { pic: [chip('☁️ Open from the cloud')], text: 'In 👥 People: puts someone from the cloud on this device, with everything of theirs. Changes on one device show on the others.' },
      { pic: [chip('🔒 Set a PIN')], text: 'In someone’s profile, once they are in the cloud: a 4-number PIN, asked each time they are opened and before their name, picture or color changes. Five wrong tries mean a 10-minute wait.' },
      { pic: [word('Remember on this device'), chip('🙈 Forget on this device')], text: 'On the PIN pad, Remember on this device opens them here without the PIN from then on. In their profile, Forget on this device asks for it every time again.' },
      { pic: [word(PIN_RESET_EMAIL)], text: `Forgot a PIN? A grown-up emails ${PIN_RESET_EMAIL} with the fun name, and it gets cleared.` },
      { pic: [chip('🔗 Share…')], text: 'In someone’s ☁️ Cloud: pick a sound, beat or song and get a code. Anyone who types it can play it, but never change yours.' },
      { pic: [chip('🚫 Unshare')], text: 'In 🔗 Share…, under Shared already: tap twice and that code stops working for everyone. Remixes others made stay theirs.' },
      { pic: [chip('🔗 Shared with me'), chip('🎛️ Remix')], text: 'In ⚙️ Settings → 🔗 Sharing: type a code to play what someone shared. 🎛️ Remix puts a copy on your board to change, and it stays yours. ✕ Remove (tap twice) takes it off your list.' },
      { pic: [chip('📴 Offline (this device only)'), chip('☁️ Put back in the cloud')], text: 'In someone’s ☁️ Cloud: keeps them on this device only and deletes their cloud copy (it asks twice, and wants the PIN). Put back in the cloud undoes it.' },
      { pic: [word('Privacy policy')], text: 'Beside the version, in ⚙️ Settings → About and at the foot of the page: exactly what the cloud keeps and who can see it. Everyone in the cloud is in a public list; a PIN is not security.' },
      { pic: [word('📊 Share play data')], text: 'In ⚙️ Settings → 📊 Data sharing: on unless you turn it off. Off sends nothing. What it shares is in the Privacy policy, beside the version.' },
      { pic: [chip('💾 Save a backup'), chip('📂 Load a backup')], text: 'One file with all your sounds, beats and settings. Above the buttons it says how many of each it holds. Load it on another phone or tablet: it adds what is new and keeps everything there.' },
      { pic: [chip('📥 Bring them in'), chip('💾 Save everything it left')], text: 'Only when an older copy of the app left sounds in this browser: Older sounds found on this device. Bring them in adds them here; Save everything it left keeps a copy of all of it in one file. The older sounds are never deleted.' },
      { pic: [seg('🧸 Kids', 'Regular', 'Advanced')], text: 'Level, each person their own. Advanced turns on the extra tools for beats and sounds, and the sharps and flats in the presets; Help marks them ⚙️ Advanced.' },
      { pic: [word('🧸 Kids')], text: 'For small kids: big picture pads (swipe for more, pinch to make them bigger or smaller), a mic to hold while you talk, a little beat of four drums and toy keys. Nothing to delete or edit, and no words to read.' },
      { pic: [tool('⚙️'), word('7 + 8 = ?')], text: 'In 🧸 Kids the gear asks a sum for a grown-up. The right answer opens Settings and the regular app until the page reloads. Choose 🧸 Kids again to hand it back.' },
      { pic: [word('⌨️ Keyboard')], text: 'Pick your keyboard so the letters on the keys match yours.' },
      { pic: [word('📮 Send problem reports')], text: 'In ⚙️ Settings → 📊 Data sharing, under 📊 Share play data. Ask a grown-up first. Off unless you turn it on; it helps find and fix problems. What a report holds is in the Privacy policy.' },
      { pic: [word('fd576a9 · 2026-10-11')], text: 'The version and date, at the bottom of every screen. Tap them to open Settings at About.' },
      { pic: [word('🆕 An update for Noodle Pads is ready.'), chip('Reload')], text: 'When a newer copy of the app is live, this floats at the bottom. Reload gets it; nothing you made is lost. ✕ hides it until the app checks again. It waits while you record, play or have a sound open.' },
    ],
  },
];

// The tab that opens first: the screen you are on.
export function helpSectionFor(screen) {
  return HELP.find((s) => s.screen && s.screen === screen)?.id ?? 'pads';
}

// What a section shows: everything but the features still to come.
export const shownItems = (section) => section.items.filter((item) => !item.soon);

const el = {};

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function piece(p) {
  switch (p.k) {
    case 'tool': return make('span', 'seq-tool help-btn', p.t);
    case 'lit': return make('span', 'seq-tool help-btn help-lit', p.t);
    case 'add': return make('span', 'seq-add help-btn', p.t);
    case 'play': return make('span', 'seq-play help-btn', p.t);
    case 'rec': return make('span', 'dj-rec help-btn', p.t);
    case 'chip': return make('span', 'chip-dark help-btn', p.t);
    case 'eg': return make('span', 'seq-tool help-btn', p.t);
    case 'person': {
      const b = make('span', 'person-menu-btn help-person', p.letter);
      b.style.setProperty('--c', p.color);
      return b;
    }
    case 'count': {
      const b = make('span', 'help-count', String(p.n));
      b.style.setProperty('--count', p.color);
      return b;
    }
    case 'toolbar': return make('span', 'help-toolbar-btn', p.t);
    case 'mic': {
      const b = make('span', 'help-mic');
      b.append(make('span', 'help-mic-dot'), make('span', '', p.t));
      return b;
    }
    case 'addpad': {
      const b = make('span', 'pad pad-add pad-mini help-pad');
      b.append(make('span', 'pad-emoji', '+'), make('span', 'pad-label', p.t));
      return b;
    }
    case 'pad': {
      const b = make('span', 'pad pad-mini help-pad');
      b.style.setProperty('--pad', p.color);
      b.append(make('span', 'pad-emoji', p.emoji), make('span', 'pad-label', p.name));
      return b;
    }
    case 'key': {
      const b = make('span', 'help-key');
      b.append(make('b', '', p.letter), make('span', '', p.emoji), make('small', '', p.name));
      return b;
    }
    case 'voice': {
      const v = VOICES.find((x) => x.id === p.id);
      return make('span', 'help-voice', `${v.emoji} ${v.name}`);
    }
    case 'slider': {
      const b = make('span', 'help-slider');
      b.append(make('span', '', p.t), make('span', 'help-track'), make('span', '', p.value));
      return b;
    }
    case 'seg': {
      const b = make('span', 'seq-barsel help-seg');
      p.t.forEach((t, i) => b.append(make('span', i === 0 ? 'help-seg-on' : '', t)));
      return b;
    }
    case 'pills': {
      const b = make('span', 'help-pills');
      for (const c of p.s) b.append(make('span', `help-pill${{ 1: ' one', x: ' on', L: ' on loud' }[c] ?? ''}`));
      return b;
    }
    default: return make('span', 'help-word', p.t);
  }
}

function renderSection(section) {
  const box = make('section', 'help-sec');
  box.id = `help-${section.id}`;
  box.dataset.help = section.id;
  box.setAttribute('aria-label', section.title);
  const list = make('ul', 'help-list');
  for (const item of shownItems(section)) {
    const li = make('li', 'help-item');
    const pic = make('div', 'help-pic');
    // The drawings are pictures of buttons, not buttons: screen readers get the sentence.
    pic.setAttribute('aria-hidden', 'true');
    pic.append(...item.pic.map(piece));
    const text = make('p', 'help-text');
    if (item.adv) text.append(make('span', 'help-adv', '⚙️ Advanced'));
    text.append(make('span', '', item.text));
    li.append(pic, text);
    list.append(li);
  }
  box.append(list);
  return box;
}

// Shows one tab's section and presses its tab.
export function showHelp(id) {
  for (const b of el.tabs.querySelectorAll('[data-help]')) b.setAttribute('aria-pressed', String(b.dataset.help === id));
  for (const s of el.body.querySelectorAll('.help-sec')) s.hidden = s.dataset.help !== id;
  el.dialog.scrollTop = 0;
}

export function initHelp() {
  Object.assign(el, {
    open: document.querySelector('#help-open'),
    dialog: document.querySelector('#help'),
    tabs: document.querySelector('#help-tabs'),
    body: document.querySelector('#help-body'),
  });
  setupDialog(el.dialog);
  el.tabs.replaceChildren(...HELP.map((s) => {
    // "🔊 Pads": the emoji in its own span, so a phone can stack it over the word.
    const [emoji, ...words] = s.tab.split(' ');
    const b = make('button', 'help-tab');
    const icon = make('span', '', emoji);
    icon.setAttribute('aria-hidden', 'true');
    b.append(icon, make('b', '', words.join(' ')));
    b.type = 'button';
    b.dataset.help = s.id;
    b.setAttribute('aria-pressed', 'false');
    return b;
  }));
  el.body.replaceChildren(...HELP.map(renderSection));
  el.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-help]');
    if (b) showHelp(b.dataset.help);
  });
  el.open.addEventListener('click', () => {
    showHelp(helpSectionFor(state.screen));
    openDialog(el.dialog);
  });
}
