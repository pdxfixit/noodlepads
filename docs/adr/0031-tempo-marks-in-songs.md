# 0031. Tempo marks in songs

**Status:** Accepted (2026-10-18), built (2026-10-18)

## Context

A 🎼 Song had one tempo (ADR 0024): every block, on every lane, played at it. Music changes tempo, and 🎧 From a song (`docs/design/beat-from-a-song.md`) finds a new part wherever the song it hears speeds up or slows down, so the song it makes needs more than one tempo. Ben chose (2026-10-18) marks on the timeline ("from bar 17, 120 BPM") over each block keeping its own beat's tempo: with marks every lane follows the same tempo, so bars stay lined up. Everyone hears and sees marks; only Advanced changes them.

## Decision

- A song keeps its own `tempo`: the tempo from bar 1. It may also hold **tempo marks**, `tempos: [{bar, bpm}]`: from that bar on, the whole song plays at that BPM, until the next mark.
- Bars are counted from 1, as the ruler shows them, so a mark's bar is 2 or later (bar 1 is the song's `tempo`). Marks are in bar order, one per bar, each BPM in the song tempo range (60–180). Absent or empty means one tempo, as before.
- Every lane plays each bar at the tempo marked for it. A pass of a beat that runs across a mark (a 3/4 beat's pass, say) speeds up or slows down where the bar does. A held note stretches with the bars it covers.
- Marks show as BPM chips above their bars in the ruler, for everyone. With Advanced, tapping the song's tempo opens a sheet with ＋ Tempo change (a bar and a BPM), and a chip taps to change or remove its mark (remove asks first, then offers Undo).

## Options turned down

- **Each block at its own beat's tempo.** Lanes would drift apart: a 90 BPM block under a 120 BPM block shares no bar lines. Ben turned it down.
- **A ramp between two marks** (a gradual change). Left for later; marks are steps.
- **A mark as a block on a lane of its own.** It would take a lane and need its own drag rules; a chip over the ruler is simpler and shows on every screen width.

## Consequences

- One clock (`songClock` in `web/playlist.js`) turns a position in pills into seconds and back, so playing, ▶ from a bar, the playhead, 🔊 Save as a sound and a share's preview all agree.
- A stored-format change, small: one optional field. An older copy reads a song with marks and plays it at its first tempo throughout; nothing breaks. If an older copy edits such a song, it saves it without its marks, and a sync carries that.
- 🎧 From a song can write its parts in order as one song, with a mark wherever the tempo changed.

## As built

- **Stored shape.** A song record (IndexedDB `songs` and `songbook`, backups, the cloud, share codes) gains `tempos: [{bar, bpm}]`, left out when there are none, so a song with no marks is stored exactly as before and a sync sees no change. `cleanTempos(raw, song)` (`web/playlist.js`) cleans it everywhere a song comes in (`cleanSong` in `web/song.js`: loading, backups, the cloud's pull, a share's preview): a bar is a whole number from 2 to 128, a BPM is rounded and kept only in 60–180; a second mark at a bar is dropped; at most 32 marks. A bad mark is dropped, never moved. A song from before the playlist (slots, no lanes) has no bars, so no marks.
- **No upgrade step.** No IndexedDB version change (records are stored as they are, keyed by id or person, and a missing field means no marks), no backup format change (still 1.x; a 1.0 or 1.1 backup loads as before, ADR 0011), no new cloud kind, no Worker change, no migration.
- **Older copies.** Copies since ADR 0024 read `tempo` and `lanes` and ignore `tempos`: they play the song at bar 1's tempo. Older copies still read `slots`, as before.
- **Three-way merge** (`web/merge3.js`): marks merge mark by mark, keyed by bar, like a lane's blocks: a mark added on each device both stay, one removed on one side and untouched on the other goes, and one both changed takes the newer edit. None left is no field.
- **Share codes** carry the song record as it is, marks and all (`web/cloud-sync.js`); the preview plans the song with them.
- **Timing.** `songClock(song)` gives each bar its tempo and start; positions are pills from the song's start (16 a bar). Beats are planned once at bar 1's tempo and each hit is placed by its pill on that clock (`playParts`, `playEvents`). With no marks the arithmetic is the one tempo's, as before. `tempoAt(song, bar)` says the tempo playing in a bar.
- **The screen.** The chips sit in a row over the bar numbers that shows only once a song has a mark (`.song-marks`, 44 px tall so a chip is a full tap; the pill inside is small). Without Advanced a chip is plain text with a tooltip. With Advanced the deck's typed tempo becomes a button ("100 BPM · 2 changes") that opens 🎼 Tempo: the tempo from bar 1, typed; each mark, a tap to change it; ＋ Tempo change. A new mark starts at the bar ▶ plays from, else four bars after the last mark, at the tempo playing there. A mark put on a bar that already has one replaces it. Every change is a step of the song's ↩️ Undo; 🗑️ Remove asks first and the banner offers ↩️ Undo.
- Smaller calls, made by the agent: 32 marks at most; marks on bars past the song's end are kept (the song may grow), and the bars drawn reach the last mark; the starting bar of a new mark; a chip opening its mark straight away, and Done closing the sheet when it did; redundant marks (the same BPM as the tempo before) are kept, so ➖ ➕ passing through a mark's BPM never removes it.
