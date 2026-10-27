// Help: the ❓ button's picture reference of what each control does, one tab
// per part of the app. A place to look things up, never a lesson (ADR 0004);
// only a new person's first steps pop up on their own (ADR 0028). Each line pairs a small drawing of the
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
      { pic: [toolbar('🎉 Play'), toolbar('🛠️ Make')], text: 'The bar at the bottom has two sides. 🎉 Play is for playing: 🔊 Pads and 🎤 Live. 🛠️ Make is for making music: 🥁 Beats and 🎼 Song. The side you are on shows both of its screens; tap the other side to go back to the screen you last had there.' },
      { pic: [toolbar('Stop all')], text: 'Stops every sound and the beat, and turns ⏲️ Click track off.' },
      { pic: [slider('Pad size', '')], text: 'Pad size, at the top left of the pads, beside ✏️ Edit sounds: slide left for smaller pads (more on a line), right for bigger ones. All the way left is the smallest this screen shows; all the way right, the biggest. The pads change as you slide. The size is yours, and 🧸 Kids uses it too.' },
      { pic: [word('▾ 🥁 Drums')], text: 'Tap a group of presets to open or close it.' },
      { pic: [word('▾ 🎹 Notes'), word('💧 Pluck ▾')], text: 'Who plays: on Notes, Chords and Bass, the button beside the name says which instrument plays them. Tap it for the instruments, in families: Keys, Mallets, Strings and Wind. Pick one and the pads play it: each note keeps its fruit (a chord its weather, a bass note its animal), with a small picture of the instrument. Beats and keys you made keep the sound they had. Your pick goes with you to every device.' },
      { adv: true, pic: [pad('🍑', 'C♯ · D♭', '#1FC7B0')], text: 'Notes, Chords and Bass get the sharps and flats, in order between the others. C♯ and D♭ are two names for the same black key, between C and D.' },
      { pic: [person('C', '#7C3AED')], text: 'Whose sounds: the round picture (or letter) at the top right. Tap it to switch to someone else’s pads, or 👥 People to add someone.' },
      { pic: [tool('⬆️')], text: 'Once you scroll, the top shrinks to one slim line: the round picture, ❓ and ⚙️ move to the left, with ⬆️ to jump back to the top.' },
      { pic: [tool('✏️ Edit sounds'), lit('✅ Done')], text: 'Stays at the top as you scroll. Hold and drag a pad to move it (with a keyboard: Alt and ← →). ✅ Done goes back to playing.' },
      { pic: [word('✏️ 🗑️ 👁')], text: 'In Edit sounds, on a pad’s top right corner: ✏️ changes its name, picture, color and voice. 🗑️ deletes a sound you made (tap twice; Undo brings it back) or hides a preset; 👁 brings a hidden one back. A group with every pad hidden goes away, and comes back in Edit sounds.' },
      { pic: [word('✏️')], text: 'With a mouse, ✏️ shows on a pad as you point at it, any time: click it to change that sound.' },
      { pic: [word('◯ ✓'), tool('Clear')], text: 'In Edit sounds every pad has a circle at its top left. Tap the pad or its circle to select it: the circle fills with a tick. Clear lets go of them all.' },
      { pic: [tool('Select all'), word('☑️ Select its 6 sounds')], text: 'Once one is picked, Select all picks every sound you made. A group\'s ✏️ can pick just that group\'s sounds.' },
      { pic: [tool('Move to group'), tool('Color · picture'), tool('Voice'), tool('Share'), tool('Delete')], text: 'Then act on them all at once: put them in a group of yours (or a new one), give them one color or picture, one voice, one share code (their PIN first, if they have one), or delete them (tap twice; Undo brings them back). Presets keep their own groups and can’t be shared.' },
      { pic: [word('▾ 📁 Group  ✏️')], text: 'Your own groups show under your sounds, like the presets’ groups. Tap one to open or close it. In Edit sounds, its ✏️ renames it, moves it up or down, or deletes it (its sounds stay). A group with no sounds goes away.' },
      { pic: [word('1 … 9  ←  →  Space')], text: 'On a keyboard: 1 to 9 play the first pads, ← → change whose sounds, Space or Esc stops everything.' },
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
      { pic: [tool('Voices ▾')], text: 'All your own voices: tap one to use it, ✏️ to rename it, 🗑️ to delete it (tap twice). Your three newest also show as voices.' },
      { pic: [tool('↩️ Reset voice')], text: 'Puts every knob back in the middle: the sound as you recorded it.' },
      { pic: [tool('⤢ Turn into knobs')], text: 'A sound made with an older voice plays it just as before. Turn into knobs swaps it for knobs (close, not the same); ↩️ The old way brings it back.' },
      { pic: [slider('Speed', '6×')], text: 'An older voice has its setting: tap its name to see it. A setting with only a few choices shows them as keys; with no room for them, a slider.' },
      { pic: [tool('▶︎'), tool('■')], text: '▶︎ at the top left of the sheet plays the sound as it sounds now, every layer and change included; ■ stops it. Space does the same.' },
      { pic: [tool('👂 Plain')], text: 'Under the wave: plays it with no voice, so you can hear what the voice changes. Tap ▶︎ to hear the voice again. It wakes up once a voice or a layer is on.' },
      { pic: [tool('🔊 Even it out')], text: 'On a sound you made: turns all of it up or down until it seems as loud as the ready-made sounds, even a quiet one with one loud clap. ↩️ Undo takes it back.' },
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
    id: 'live', screen: 'live', tab: '🎤 Live', title: 'Live',
    items: [
      { pic: [key('1', '🍎', 'C'), key('A', '🦶', 'Kick'), key('S', '🥁', 'Snare')], text: 'Tap a key, or press it on a keyboard: the number row (1 to 0) and the three letter rows under it. Hold one (or Shift-click it) to keep it going.' },
      { pic: [seg('S', 'M', 'L')], text: 'In ✏️ Layout with ⌨️ Keys, on a tablet: the size of the keys you play.' },
      { pic: [seg('⌨️ Keys', '👆 Pads')], text: 'At the top of ✏️ Layout: play on the keys, laid out like a keyboard, or on 👆 big pads in groups, no keyboard needed. This device remembers which. A phone has only the pads.' },
      { pic: [key('', '🦶', 'Kick'), key('', '🥁', 'Snare')], text: 'With 👆 Pads: tap a pad to play it; hold one (or Shift-click it) to keep it going. Each group has its own band, its name on top, its pads all one size.' },
      { pic: [tool('✏️ Layout'), seg('⌨️ Keys', '👆 Pads')], text: 'With 👆 Pads, ✏️ Layout builds the bands. Each group is a band: ⠿ moves it (drag it, or ↑ ↓), S M L sizes its pads, ✕ takes it away (tap twice; ↩️ Undo brings it back). The Layouts and grids header folds those choices away, so the pills of + Add a group and your groups come up the screen. + Add a group puts one at the bottom, at most 8. + more adds sounds: the ▾ button picks which group’s sounds show, and a sound already on the board isn’t offered again. Tap a pad to swap its sound the same way, or 🗑️ Take it out. A smaller size fills the band’s line with more of its sounds.' },
      { pic: [word('Grids'), word('Two and one')], text: 'In ✏️ Layout with 👆 Pads, Grids turns the pads into blocks side by side, like a pad controller: pick Two and one, Four corners, Three across or Side by side, then tap a block and a group, or drag a group onto a block. Each block’s pads grow to fill it. ✕ empties a block. Drag the bar between two blocks to make one bigger, like a window’s edge (or tap the bar and press the arrow keys): it stops at halves, thirds and quarters, never smaller than a sixth. A block’s ⋯ cuts it in two (⇹ across or ⇳ down: it keeps its group, the new half is empty) or joins it to the block beside it. Stacked puts every group back in a band of its own.' },
      { pic: [word('⭐ Layout'), word('🎸 Band')], text: 'In ✏️ Layout, tap a layout to load it. The one you built is kept as ⭐ Layout, so nothing is lost. ⭐ Save this layout names yours. The same layout plays on 🥁 Beats with ⌨️ Keys on.' },
      { pic: [seg('Q', 'D')], text: 'In ✏️ Layout with ⌨️ Keys, while the keys show letters: Q for a QWERTY keyboard, D for Dvorak, so the letters on the keys match yours. This device remembers it; until you pick, it follows the keyboard the browser sees. The same on 🥁 Beats with ⌨️ Keys on.' },
      { pic: [tool('✏️ Layout')], text: 'How the keys or pads are laid out: on the bar at the top, with ● Record (just ✏️ on a phone). With ⌨️ Keys, layouts on top load a whole keyboard; Sounds below go on one key at a time, or a group on a row. Once you scroll down, ✏️ Layout also waits at the top right of the screen, as just ✏️. On 🥁 Beats with ⌨️ Keys on, where the same keys play, it is on the bar with ▶ Play, after 🎚️. On a phone, where there are only pads, it is just ✏️, after ⏲️.' },
      { pic: [word('⭐ Keys'), word('🥁 Beat lab')], text: 'Tap a layout to load it. Your own keys are kept as ⭐ Keys, so nothing is lost. ⭐ Save this layout names yours.' },
      { pic: [key('A', '🦶', 'Kick')], text: 'Tap sounds to pick them, then tap a key. Or drag (on a touch screen, hold first): onto a key, a key onto another to swap, or off the board to clear it. Tap a group twice to fill a row, or drag it onto one, the number row too. ✕ Unpick all lets go of the picks.' },
      { pic: [tool('✏️ Layout'), word('💧 Pluck ▾')], text: 'In ✏️ Layout with ⌨️ Keys, an open Notes, Chords or Bass group says who plays it, as on Pads: pick an instrument, then tap the group again to fill a row with its notes. Keys already on the board keep their sounds. With 👆 Pads, a band of Notes, Chords or Bass has the same button under its name: a pick plays every pad’s note on that instrument instead (↩️ Undo puts them back).' },
      { pic: [tool('↩️ Undo'), tool('↺ Reset keys')], text: 'Undo takes back the last change. Reset keys puts them all back how they started (tap twice).' },
      { pic: [tool('⏲️ Click track')], text: 'A tick on every beat to keep time. It is never recorded. It sits on the bar at the top, after ● Record and its tempo, as on 🥁 Beats. On a phone its tempo is the key with the number (100 ▾): tap to change it.' },
      { pic: [lit('🔔 Let it ring')], text: 'On the bar at the top, right of ⏲️ Click track (just 🔔 on a phone). On, every key’s hits ring over each other instead of starting its sound again, and a take keeps them that way. Holding a key still loops it. Just for this visit: it is off again next time.' },
      { pic: [tool('⏲️ Click track'), word('👆 96')], text: 'Tap ⏲️ three times or more in time to set the speed: it says “keep tapping…”, then 👆 and the tempo. One or two taps just turn the click on or off.' },
      { pic: [rec('● Record')], text: 'Records what you play, exactly when you play it. It starts at your first hit.' },
      { pic: [tool('▶ Play'), tool('🔊 Make a sound'), tool('✏️ Rename'), tool('↩️ Undo')], text: 'After a take: play it, make it a pad, rename it, or undo it (↩️ Undo in the banner brings it back). Making a second pad asks “Make another?” first.' },
      { pic: [tool('🎬 Takes')], text: 'Everything you recorded. Play, rename or delete one, or make it a sound.' },
    ],
  },
  {
    id: 'beats', screen: 'beats', tab: '🥁 Beats', title: 'Beats',
    items: [
      { pic: [word('🥁 Scratch beat'), tool('💾 Keep')], text: 'Your scratch beat is open whenever nothing else is: play with it, load grooves into it, and nothing fills up 🗂️ Beats. 💾 Keep puts it in 🗂️ Beats with a fun name (a groove keeps its name too: “Sleepy Squid (Ska version)”), and the scratch starts empty again. Or tap “Scratch beat” and type a name: it goes in 🗂️ Beats with that name, as soon as it has a row.' },
      { pic: [tool('🆕 New'), tool('🗂️ Beats')], text: '🆕 New (just 🆕, beside the beat’s name, on a phone) stops the beat playing and opens a blank scratch beat, with no rows. A beat of yours stays in 🗂️ Beats as it was. If your scratch beat had hits, New keeps it in 🗂️ Beats first, with a name, so nothing is lost. 🗂️ Beats holds them all: open one, 📌 pin, ⧉ copy or 🗑️ delete.' },
      { pic: [word('🥁 Wobbly Thunder'), tool('✏️')], text: 'A beat in 🗂️ Beats saves itself. Tap its name or ✏️ to rename it.' },
      { pic: [word('1 Wobbly Thunder'), word('2 ⏳ Boom Bap')], text: 'Under the beat bar: 8 numbered spots for your beats, the open one lit. Pinned beats come first; the rest are the beats you used last, and tapping one never moves it. Tap one to open it. While a beat plays, the one you tap waits (⏳) and starts at the next bar, so the music never stops. They wait while you record.' },
      { pic: [tool('📌')], text: 'In 🗂️ Beats: pins a beat to the first spots under the beat bar, in the order you pin them (up to 8). Tap 📌 again to unpin it.' },
      { pic: [tool('⧉'), tool('🗑️')], text: 'In 🗂️ Beats: copy a beat, or delete it (it asks first).' },
      { pic: [chip('🔊 Make the open beat a sound')], text: 'In 🗂️ Beats: turns the beat into a pad.' },
      { pic: [tool('⬇️'), chip('📥 Load a beat file')], text: 'In 🗂️ Beats: ⬇️ saves a beat as a file to take to another phone or tablet; 📥 opens one. Only presets go with it.' },
      { pic: [play('▶ Play')], text: 'Plays the beat round and round. Pills only sound while it plays.' },
      { pic: [play('▶'), tool('▾')], text: 'Scroll down and the bar with ▶ Play folds up into the slim line at the top: ▶ plays and stops, and ▾ drops the whole bar down for ● Record, the tempo, the bars and the rest. On a small screen ❓ (and on the smallest ⬆️) make room for them.' },
      { pic: [slider('', '120')], text: 'How fast. Tap the number to type one. On a small screen the slider turns into ⌄ ⌃.' },
      { pic: [eg('100 ▾')], text: 'On a phone the tempo is one key with its number: tap to change it. A row opens under the bar: 🐢 slow to 🐇 fast on the slider, and a tap on 🐢 or 🐇 nudges it to the next common tempo. While it is open the key says the number over BPM; tap it again to close it. Nothing is covered, so you can keep playing. It works the same on 🎤 Live and 🎼 Song.' },
      { pic: [tool('▶'), tool('●'), tool('🎬')], text: 'When a phone’s bar runs short of room, its buttons keep just their picture: ▶ is Play, ● is Record, 🎬 is Takes.' },
      { pic: [tool('⏲️')], text: 'The click track: a tick on every beat while the beat plays, to keep time. It is never saved.' },
      { pic: [seg('1 bar', '2 bars', '4 bars')], text: 'How long the beat is.' },
      { pic: [tool('🎚️'), word('Mute'), word('Solo')], text: 'The 🎚️ Mixer, after the bars: a column for each row with a fader (slide it up for louder), Mute, Solo (only the solo rows play) and one effect, like 🏛️ Room or 🤖 Robot. The Master column at the end is the whole beat. On a phone, swipe sideways for more rows. Mute and Solo save with the beat; All on brings every row back.' },
      { pic: [tool('⇆'), word('All'), word('None'), word('Invert')], text: '⇆, after the 🎚️ Mixer, locks the pills, so big changes are safe: no pill turns on or off. Tap lit pills (or drag across them) to pick them, then drag one to slide them all along, so a beat that starts late starts on the "1". What slides off one end comes round the other. All, None and Invert at the bottom pick for you. Tap ⇆ again to unlock.' },
      { adv: true, pic: [seg('4/4', '3/4', '6/8')], text: 'Time signature, beside the bars: how this beat counts. 4/4 is most songs; 3/4 is a waltz.' },
      { pic: [seg('Straight', 'Swing', 'Shuffle')], text: 'Swing makes the beat bounce: the off-beat hits (the "and" of each beat) play a little late. Shuffle bounces most. Some grooves, like Lo-fi and Boom bap, come with a little.' },
      { adv: true, pic: [word('4/4 ▾')], text: 'When the line runs out of room, these turn into pickers. Tap one to choose.' },
      { pic: [add('+ Add a row')], text: 'Opens the sounds. Tap as many as you like (each plays, and gets a number), then Add: a new row for each, in that order. The sound after your last row comes ticked, so Add straight away gives you the next one.' },
      { pic: [pills('.x.L')], text: 'Tap a pill to turn it on, tap again to turn it off. Hold it for a loud hit (white ring); hold again for a normal one.' },
      { pic: [pills('.xx.'), word('🖱️')], text: 'With a mouse, pills work like things in a drawing app: click a lit pill to pick it, Ctrl-click (⌘ on a Mac) to pick more, Shift-click for all the lit ones between, or drag across empty pills to draw a box round some. Drag a picked pill to slide them all along, the gaps kept. Delete or a double-click turns pills off, and Undo brings them back.' },
      { pic: [pills('1...')], text: 'The brighter pill with a dot is the 1: where each bar starts.' },
      { pic: [word('🦶 🔊')], text: 'Each row is one line: its emoji and speaker at the left (with the sound’s name and the grip ⠿ when there is room), its pills after them. The pills scroll sideways under the emojis, all the rows together, with the bar numbers on top. While the beat plays they follow it, a screen at a time; scroll them yourself and they stay where you put them until the next ▶ Play.' },
      { pic: [word('🦶'), word('🔄 🔔 🧹 ✕ ↑ ↓')], text: 'Tap a row’s emoji for its menu: 🔄 Change sound (tap a sound to hear it first), 🔔 Let it ring, 🧹 Clear its pills, ✕ Remove it, and ↑ ↓ to move it. Clear and Remove ask first, in red (🧹? or ✕?), so tap twice; ↩️ Undo brings a removed row back.' },
      { pic: [tool('🔊'), word('🔉 🔈 🔇')], text: 'Each row’s speaker. Tap it to mute the row (🔇), and again to hear it. Hold it (or Shift-click it), or drag it, for a loudness slider, to mix one row quieter than another. The bar along its bottom shows how loud; lit yellow, it is muted. ↩️ Undo puts it back.' },
      { pic: [word('⠿')], text: 'With room, drag a row’s grip ⠿ to move it; near the top or bottom of the screen the page scrolls along with it.' },
      { pic: [tool('💃 Grooves')], text: 'In the beat bar, before ⌨️ Keys (on a phone, in the row above the beat’s name, with ⌨️ Keys and 🗂️ Beats): about 50 ready-made beats, many with bass and chords, grouped by style. Tap a style to open it. ▶ beside a groove plays a few seconds of it first. Undo takes a groove back.' },
      { pic: [tool('🎧 Listen')], text: 'At the top of 💃 Grooves, 🎧 From a song: play a song (in another tab on a computer, or out loud near the microphone, or pick a song file) and its kick, snare and hi-hat appear as it plays, bar by bar. ■ Stop makes each part of the song a beat in 🗂️ Beats, with the closest sounds (how low or high each sounds now: a Kick you gave a voice may lose its row to another drum), and more than one part a 🎼 Song too. The song itself is never saved.' },
      { pic: [lit('📝 Into scratch'), tool('➕ Add to this beat')], text: 'In Grooves: load one into your scratch beat (a beat in 🗂️ Beats stays as it is; a scratch with hits is replaced, and a line says so, with Undo), or add its hits to the beat you have open.' },
      { pic: [lit('🔔')], text: '🔔 Let it ring, in each row’s menu. On (✓), the row’s hits ring over each other (up to 8 at once); off, each hit cuts off the one before. It saves with the beat. On ⌨️ Keys’ rows too.' },
      { adv: true, pic: [seg('½×', '1×', '2×')], text: 'In a row’s sound picker: Speed ½× or 2× plays the row at half or double.' },
      { pic: [add('🎹 Add a tune')], text: 'A row that plays a tune: its sound at any note, as long as you like. It opens 🎹 the piano roll. The row shows where its notes start, with 🎹 on its emoji; tap the emoji or a pill to open the roll again.' },
      { pic: [word('🎹 Who plays it?'), word('💧 Pluck ▾')], text: '🎹 Add a tune asks who plays it first: tap an instrument and the tune starts on its C. In the piano roll, the button beside 🔊 Sound says who plays the tune: pick another and every note stays where it was, played by the new one. In a row’s sound picker, Notes, Chords and Bass have the same button as on Pads. Every pick is yours, as on Pads; a row you made keeps its sound.' },
      { pic: [lit('🎹 Tune')], text: 'In a row’s sound picker: turns any row into a tune row (its pills become notes), or back (it asks first if notes would lose their pitch).' },
      { pic: [word('C D E'), pills('.x..')], text: 'In the piano roll: the notes go up the side, the beat goes across. Tap a square for a note one pill long. Drag a note sideways to make it longer or shorter. Tap a note to take it out; ↩️ Undo puts it back. ✅ Done goes back to the beat.' },
      { pic: [tool('⌃'), tool('⌄'), tool('♯ All notes')], text: 'Two octaves show at a time: ⌃ ⌄ (or a swipe up or down) go higher or lower, and a number on them says how many notes are out of sight. At first only the white keys show, so every note fits; ♯ All notes shows the sharps and flats too.' },
      { pic: [play('▶ Play'), word('🥁 ·•·•')], text: 'In the piano roll, ▶ Play plays the whole beat with a line moving along. The strip on top shows where the other rows hit.' },
      { adv: true, pic: [lit('½ Half pills')], text: 'In the piano roll: the squares are half a pill, for notes that start or end between pills.' },
      { pic: [lit('⌨️ Keys')], text: 'In the beat bar, after 💃 (on a phone, in the row above the beat’s name): shows the keys under your beat. Play a key and its sound gets a row, even when not recording; rows go in the order of the keys. Tap ⌨️ again for the rows on their own. This phone or tablet remembers it.' },
      { pic: [play('▶ Play'), rec('● Record')], text: 'With ⌨️ Keys on, ● Record joins the control bar. ▶ Play plays your beat round and round without recording; ● Record records onto it.' },
      { pic: [rec('● Record'), count(1, '#FF6B6B'), count(2, '#FFB347')], text: '● Record counts you in with big colored numbers, then GO! Your hits land as pills in the beat. It goes round until you tap Stop. After the count-in you can change the speed; the bars wait for Stop.' },
      { pic: [pills('x...x...'), word('┊ ┊')], text: 'Keep playing into the last bar and the beat grows: 1 → 2 → 4 bars, each new bar a copy to play over (the dashed bar shows there is room). Rest for a bar and it goes round instead. ↩️ Undo puts it back.' },
      { pic: [word('Shift + key')], text: 'While recording: a hit one pill earlier, for when you were a bit late.' },
      { pic: [tool('💃 Grooves'), tool('↩️ Beat')], text: 'With ⌨️ Keys on, a groove loads into your scratch beat, stopped, behind you. ▶ Play plays it round while you play the keys. ● Record adds your hits on top; 💾 Keep saves it, named after the groove. ↩️ Beat takes the groove back out: the beat you had open comes back.' },
      { pic: [word('🦶 🔊'), pills('.x.L')], text: 'With ⌨️ Keys on, the rows look and work the same: emoji and speaker at the left, pills scrolling sideways and following the beat, tap a pill on or off, hold it for a loud hit, and with a mouse pick and drag them. A full beat makes room by reusing an empty row. The emoji’s menu has 🖼️ Change picture (its pad, key and rows all change; a picture another sound has asks first), 🔔, 🧹 and ✕.' },
    ],
  },
  {
    id: 'song', screen: 'song', tab: '🎼 Song', title: 'Song',
    items: [
      { pic: [tool('🎼 Song')], text: '🎼 Song in the bar at the bottom: put your saved beats on lanes, and the lanes play together.' },
      { pic: [word('🎼 Scratch song'), tool('💾 Keep')], text: 'Your scratch song is open whenever nothing else is. 💾 Keep puts it in 🗂️ Songs with a fun name, and the scratch starts empty again. Or tap “Scratch song” and type a name: it goes in 🗂️ Songs with that name, as soon as it has a beat in it. 🆕 New opens a blank scratch song, keeping one with beats in it in 🗂️ Songs first; a song of yours stays in 🗂️ Songs as it was.' },
      { pic: [word('🎼 Big Parade'), tool('✏️')], text: 'A song in 🗂️ Songs saves itself. Tap its name or ✏️ to rename it. In 🗂️ Songs, ⧉ copies a song and 🗑️ deletes it.' },
      { pic: [eg('Sleepy Squid'), word('→ a lane')], text: 'Pick a beat in the strip of your beats, then tap a spot on a lane: it goes there. Tap more spots for more. Only beats in 🗂️ Beats show: 💾 Keep a beat first.' },
      { pic: [eg('Sleepy Squid ×3'), word('⟷')], text: 'Tap a block to select it. Drag its ⟷ end to play it more or fewer times, or tap ➖ ➕. 🗑️ takes it off (tap twice). Blocks on one lane never overlap.' },
      { pic: [word('🥁 Drums'), word('🔊')], text: 'Each lane has a name and a picture: tap them to change them. Its speaker: tap to mute the lane, hold or drag for its loudness.' },
      { pic: [add('➕ Add a lane')], text: 'Up to 8 lanes. On a phone four show at once, and the rest scroll.' },
      { pic: [eg('100'), word('BPM')], text: 'The song’s tempo: every beat in it plays this fast, whatever its own tempo on Beats. The first beat you put in sets it. On a phone it is the key beside ▶ Play song (100 ▾), as on Beats: tap it for 🐢 the slider 🐇. ➖ ➕ go to the next common tempo.' },
      { pic: [word('Bar'), eg('120')], text: 'A tempo change: from that bar on, every lane plays at the BPM on the chip above it in the bar numbers. Bars stay lined up across lanes.' },
      { adv: true, pic: [tool('100 BPM'), tool('＋ Tempo change')], text: 'With Advanced on, tap the song’s tempo to open 🎼 Tempo: type the tempo from bar 1, or ＋ Tempo change for a bar and a BPM. Tap a chip over the bar numbers (or a change in the list) to change it, or 🗑️ Remove it (tap twice; Undo brings it back).' },
      { pic: [play('▶ Play song'), word('▶ 5')], text: 'Plays every lane together, with a line showing where it is. Tap a bar number first to play from there.' },
      { pic: [tool('↩️ Undo')], text: 'Takes back the last change: a block put in, repeated or taken off, a lane added or renamed, the tempo or a tempo change.' },
      { pic: [word('← → Enter')], text: 'With a keyboard: Tab to a lane, ← → to a bar, Enter puts the picked beat there or selects the block. + and − repeat it; Delete takes it off.' },
      { pic: [tool('🔊 Save as a sound')], text: 'Turns the whole song into a pad, up to 3 minutes long.' },
    ],
  },
  {
    id: 'settings', tab: '⚙️ Settings', title: 'Settings',
    items: [
      { pic: [word('⚙️')], text: 'Settings is the gear at the top.' },
      { pic: [word('▸ 🔗 Sharing   ▾ 💾 Backups')], text: 'Tap a heading to open or close it. This device remembers which are open. About, with the version, the Privacy policy and Feedback, is always open at the bottom.' },
      { pic: [chip('👥 People')], text: 'Not in Settings: tap the round picture at the top right, on any screen, then 👥 People: one line per person, and ➕ Add a person. Tap someone for their profile: name, picture, color, cloud, PIN and Delete.' },
      { pic: [chip('🎲 Pick a name')], text: 'In someone’s profile: a dozen fun names, and a few special ones, to choose from. 🎲 More names shows another dozen; ✕ keeps the name you have. Nobody types a name.' },
      { pic: [word('🎨 Color'), chip('Picture')], text: 'In someone’s profile: tap a color, or Picture to choose an emoji. With a PIN, changing the name, picture or color asks for it once, until the page reloads.' },
      { pic: [word('🔊 27 · 🥁 4 · 🎼 1 · 🎬 1')], text: 'In 👥 People, under each name: how many sounds, beats, songs, takes, voices, preset edits and layouts they have on this device. Each kind keeps its emoji everywhere: 🔊 sounds, 🥁 beats, 🎼 songs, 🎬 takes, ⭐ voices, ✏️ preset edits, 🎛️ key sets, ⌨️ key layouts, 👆 touch layouts.' },
      { pic: [chip('See all ›')], text: 'In someone’s profile, the line of counts: tap it to see everything of theirs on this device, newest first, with a chip for each kind. Tap a sound, beat, song, take, voice or preset edit to hear it right there; tap it again to stop.' },
      { pic: [chip('⬇️ Export a backup')], text: 'At the foot of See all: one backup file of just that person, with everything of theirs. 📂 Load a backup in ⚙️ Settings puts them on any phone or tablet, adding to what is there.' },
      { pic: [chip('♻️ Restore'), word('Or load it all into someone here:')], text: 'Loading a backup of one person asks where it goes: ♻️ Restore brings them back as their own person; a name below puts all their things into that person instead, who keeps their own name and settings. ✕ loads nothing.' },
      { pic: [word('☁️ In the cloud'), chip('🔄 Sync now')], text: 'Nobody goes to the cloud by themselves. A grown-up puts someone there, so they open on any phone or tablet: in their profile, the ☁️ In the cloud switch asks a sum, then a PIN for them, typed twice. Switched off (tap twice, and the PIN), their latest comes here first, then their cloud copy is deleted, links they shared stop working, and they stay on this device only. In 👥 People, ☁️✓ by a name means in the cloud, 🔒 that they have a PIN, and ☁️⚠️ that something needs seeing to: their profile says what, under ☁️ In the cloud.' },
      { pic: [chip('☁️ Open from the cloud')], text: 'In 👥 People, beside ➕ Add a person, and in the welcome on a new device: puts someone from the cloud on this device, with everything of theirs. With a PIN, it is asked first. Changes on one device show on the others.' },
      { pic: [word('🔊 5 of 12'), chip('🔄 Try again')], text: 'While someone comes down from the cloud, the sheet waits with them: a spinner, then a bar that fills as their sounds arrive. Done, Play as them shows them on Pads, and ☁️ Open someone else goes back to the list. If nothing arrives for 20 seconds it stops: 🔄 Try again carries on from there, ✕ Don\'t bring them leaves them in the cloud.' },
      { pic: [word('🔒 PIN on')], text: 'In the profile of someone in the cloud: a 4-number PIN, asked each time they are opened, on every device, unless 🔑 this device remembers them. Nothing of theirs can be seen or changed without it: their profile, what they have, their sounds in the sound chooser, and backups. Typed once, it holds until the page reloads. The pill beside PIN says it is on; 🔒 by a name in the corner menu says so too. A wrong PIN says how many tries are left, and from the second wrong one to ask a grown-up. Five wrong tries mean a 10-minute wait: the pad then says a grown-up knows the PIN and when it opens again, and ⬅️ Back to Pads closes it.' },
      { pic: [chip('Change PIN'), chip('Remove PIN')], text: 'In the profile of someone in the cloud. Change PIN asks the PIN they have now, then a new one twice. Remove PIN takes them out of the cloud: tap it twice, then type the PIN. Their cloud copy is deleted and links they shared stop working; this device keeps everything.' },
      { pic: [chip('🔑 Remember'), chip('Not now')], text: 'After a PIN opens someone, this device can remember them: it opens them without the PIN until someone taps Forget this device. Sharing still asks it. Anyone using this device can open them. Not now stops asking on this device.' },
      { pic: [chip('🔑 Remember on this device'), chip('Forget this device')], text: 'In someone’s profile, once they have a PIN: Remember asks for the PIN, then skips it here until someone taps Forget this device, the PIN changes, or nobody opens them here for half a year. Forget this device asks a grown-up’s sum first, then the PIN is asked again from the next time they are opened. Lost this device? Change the PIN, and every device asks it again.' },
      { pic: [chip('🔑 Forget all 3 devices')], text: 'Beside Forget this device when more than this device remembers them (the number is how many). It asks a grown-up’s sum, then the PIN, and every device, this one too, asks the PIN again the next time they are opened. The PIN stays the same: a lost tablet is cut off without changing it.' },
      { pic: [chip('🗑️ Delete')], text: 'In someone’s profile, in the red box at the end: tap twice and they are deleted from this device, with everything of theirs here. A quick double tap only asks. Someone in the cloud then gets ☁️ Delete their cloud copy too, at the top of the box: tap it twice (and their PIN, if they have one); ☁️ Keep their cloud copy, where you tapped, or ✕ keeps it.' },
      { pic: [word("👋 Who's playing now?")], text: 'When nobody is playing (the one playing was just deleted, or everyone on this device has a PIN): tap your picture. 🔒 in its corner means your PIN comes next. 👋 Someone new adds a person.' },
      { pic: [chip("🤷 I don't know the PIN")], text: 'On the PIN pad, when someone got a new PIN on another device: tap twice and they are deleted from this device, with everything of theirs here. Their cloud copy stays.' },
      { pic: [word(PIN_RESET_EMAIL)], text: `Forgot a PIN? A grown-up emails ${PIN_RESET_EMAIL} with the fun name, and it gets cleared.` },
      { pic: [chip('⬇️ Back up')], text: 'In someone’s profile, under ☁️ In the cloud: one tap saves a backup file of just them, cloud or not. 📂 Load a backup in ⚙️ Settings puts them on any phone or tablet.' },
      { pic: [chip('🔗 Share…')], text: 'In someone’s profile, under ☁️ In the cloud: pick a sound, beat or song and get a code. Anyone who types it can play it, but never change yours. Someone with a PIN types it for every code, even on a device that remembers them.' },
      { pic: [chip('🚫 Unshare')], text: 'In 🔗 Share…, under Shared already: tap twice and that code stops working for everyone. Remixes others made stay theirs.' },
      { pic: [chip('🔗 Shared with me'), chip('🎛️ Remix')], text: 'In ⚙️ Settings → 🔗 Sharing: type a code to play what someone shared. 🎛️ Remix puts a copy on your board to change, and it stays yours. ✕ Remove (tap twice) takes it off your list.' },
      { pic: [word('Privacy policy')], text: 'Beside the version, in ⚙️ Settings → About: exactly what the cloud keeps and who can see it. Everyone in the cloud is in a public list; a PIN is not security.' },
      { pic: [word('Send feedback'), word('27 + 8 = ?')], text: 'At the bottom of ⚙️ Settings → About, with Privacy policy and Show the welcome again. A grown-up answers a sum first, then Send feedback opens: type an idea or a problem and tap Send. It goes to the people who make the app, as typed, and is kept 90 days. Please leave out names and contact details: nobody can write back.' },
      { pic: [word('📊 Share play data')], text: 'In ⚙️ Settings → 📊 Data sharing: on unless you turn it off. Off sends nothing. What it shares is in the Privacy policy, beside the version.' },
      { pic: [chip('💾 Save a backup'), chip('📂 Load a backup')], text: 'One file with all your sounds, beats and settings. Above the buttons it says how many of each it holds. Load it on another phone or tablet: it adds what is new and keeps everything there.' },
      { pic: [chip('📥 Bring them in'), chip('💾 Save everything it left')], text: 'Only when an older copy of the app left sounds in this browser: Older sounds found on this device. Bring them in adds them here; Save everything it left keeps a copy of all of it in one file. The older sounds are never deleted.' },
      { pic: [word("👋 Who's playing?")], text: 'A new person is asked once, by three picture pads: 🧸 Little noodler (Kids), 🎵 Tap and make beats (Regular) or 🎛️ Show me everything (Advanced). Skip keeps Regular; Level changes it later. On a new phone or tablet, ☁️ Open from the cloud beside Skip brings in someone who already plays on another one.' },
      { pic: [word('Pick your stage name'), tool('🎲'), play("▶ Let's play")], text: 'Then a fun name (🎲 for more), a picture and a color, each changed as you tap. Skip puts back the ones the app gave. 🧸 Kids picks only a picture and a color.' },
      { pic: [seg('🧸 Kids', 'Regular', 'Advanced')], text: 'Level, each person their own. Advanced turns on the extra tools for beats and sounds, and the sharps and flats in the presets; Help marks them ⚙️ Advanced.' },
      { pic: [chip('💡 Show tips again')], text: 'At the top of Help. A new person gets a short tip the first time something matters (how a pad loops, where to start on Beats…), each once. This brings them, and the dots on Keys, Grooves and Mixer, back.' },
      { pic: [word('Show the welcome again')], text: 'At the bottom of Settings → About, with Privacy policy and Send feedback. Opens Who\'s playing? for the person showing, and brings their tips and dots back, as if they were new.' },
      { pic: [word('🎨 Look')], text: 'How every pad looks, each person their own, at every level: Tiles, Slam buttons, Lit pads, Switch, Spinner, Jelly or Googly eyes. Tap one to choose it.' },
      { pic: [word('🧸 Kids')], text: 'For small kids: big picture pads, only sounds whose picture shows what they are (swipe for more; the slider at the top, or a pinch, makes them bigger or smaller, the same size as on Pads; 🎨 at the top left changes how they look), a mic (tap it: 3, 2, 1, then talk, and tap again to stop; or press and hold while you talk; 🚫 over it means the browser has no microphone, or it is not allowed one), a little beat of four drums and toy keys (the round button at their top left plays them on the next instrument: Pluck, Piano, Marimba, Steel drum, Kalimba; every key shows its picture; ● beside it records a tune: 3, 2, 1, then play along as the beat goes round once, and a grown-up keeps it on 🥁 Beats with 💾 Keep; recording again keeps the last tune in 🗂️ Beats). Nothing to delete or edit, and no words to read. With a keyboard, Enter or Space on a pad, a key or the mic is a tap.' },
      { pic: [tool('⚙️'), word('27 + 8 = ?')], text: 'In 🧸 Kids the gear asks a sum for a grown-up. The right answer opens Settings and the regular app until the page reloads; after three wrong answers in a row, each next try waits 30 seconds (⏳ counts down). 🧸 Kids mode in the corner menu (or 🧸 Kids in Settings) hands it back.' },
      { pic: [tool('🧸'), word('Kids mode')], text: '🧸 Kids mode in the corner menu (and 🧸 at the top, on a wide screen) shows Kids right now for whoever is playing, at any level: hand the phone to a small kid. The gear and a sum lead back out; the level stays what it was.' },
      { pic: [word('📮 Send problem reports')], text: 'In ⚙️ Settings → 📊 Data sharing, under 📊 Share play data. On unless you switch it off, and sends nothing while 📊 Share play data is off; it helps find and fix problems. 📋 beside this device\'s code copies it, to send with a problem you saw. What a report holds is in the Privacy policy.' },
      { pic: [word('fd576a9 · 2026-10-11')], text: 'The version and date, at the bottom of every screen. Tap them to open Settings at About.' },
      { pic: [word('🎛️ Want more knobs?'), chip('Try Advanced')], text: 'Once, for someone on Regular who keeps opening the Mixer, the piano roll or + Add a layer: it floats where the update shows and fades. Try Advanced switches the level (↩️ Undo puts it back); ✕ says no thanks.' },
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
