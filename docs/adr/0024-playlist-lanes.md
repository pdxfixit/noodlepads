# 0024. Song is a playlist: lanes of beat blocks at one song tempo

**Status:** Accepted (2026-10-12), built (2026-10-12)

## Context

Song was one lane of slots, each a saved beat played ×1 to ×4 at its own tempo (ADR 0006, 0007). The north star (ADR 0022) has a playlist: patterns placed on lanes that play together. Ben decided (2026-10-12): Song leaves Advanced (done, ADR 0017); at most 4 lanes on a phone and 8 on wider screens; one song tempo; time runs across; pick a beat, then tap a spot; each lane has mute, volume and a name/emoji.

## Decision

- A song has a **tempo** of its own and up to 8 **lanes** (4 shown on a phone). Each lane has a name and emoji, a mute and a volume.
- A lane holds **blocks**: a beat placed at a bar, repeated a whole number of times. Blocks on one lane don't overlap; blocks on different lanes play together.
- Every block plays at the **song's tempo**. A beat keeps its own tempo on Beats.
- Time runs **across**; the lanes scroll sideways inside their area on a phone, with a playhead.
- To place one: **pick a beat** from a strip of your beats above the lanes, then **tap a spot** on a lane. Tap a block to select it: drag its end to repeat it, 🗑️ to remove it, with Undo.
- The scratch song (ADR 0020) works the same way.
- Old songs convert on load: their slots, in order, become blocks on lane 1; the song tempo is the first slot's beat's tempo.

## Consequences

- A stored-format change for songs, everywhere they travel (IndexedDB, backups 1.x, share codes, the cloud); older copies see a song they can't play fully.
- Save as a sound and share previews render lanes mixed.

## As built

- **Stored shape.** A song record (IndexedDB `songs` and `songbook`, backups, the cloud, share codes) is `{id, personId, name, tempo, lanes: [{name, emoji, muted, volume, blocks: [{beatId, bar, times}]}], slots}`. `tempo` is 60–180; 1 to 8 lanes; a lane holds at most 64 blocks, one per starting bar; `times` is 1–64; a block reaches at most bar 128. `cleanSong` (`web/song.js`) and `web/playlist.js` clean it.
- **No upgrade step.** No IndexedDB version change, no backup format change (still 1.1), no new cloud kind, no Worker change, no migration. A record from before (slots only) is converted whenever it is read: in a backup by the backup's own beats, in the app when the song opens. It is stored in the new shape at its next change.
- **Old songs:** slots in order become blocks on lane 1, each starting where the one before ends; the song tempo is the first slot's beat's tempo (100 when that beat is gone).
- **Time.** A song bar is one 4/4 bar at the song's tempo. A beat plays as it loops on Beats, pass after pass with no gap; its block covers the whole bars its passes reach into, so a 3/4 beat once covers a bar and rests a quarter. A beat made longer later can make a block run into the next one: the later block cuts it there.
- **Older copies of the app** read only `slots`, which every save writes: every block in time order (lane order within a bar), at most 16, each at most ×4. An older copy plays a song's beats one after another, each at its own tempo, and ignores lanes and tempo. If an older copy changes a song, it saves slots alone; the lanes are lost and the song reopens as one lane. The update notice asks those copies to reload.
- **Three-way merge** (`web/merge3.js`): lanes merge by place; a lane's name, picture, mute and volume take the newer edit when both sides change one; its blocks merge by starting bar, so blocks added on both devices both stay. `slots` is made again from the merged lanes.
- **Placing:** a strip of 🗂️ My beats above the lanes (the pattern chips' look); pick one, then tap a bar; it stays picked. A spot inside a block selects it. A beat that would run into the next block is refused ("No room there"). The first block in an empty song sets the song's tempo to that beat's.
- **Editing:** a selected block shows a ⟷ grip at its end (drag: one ↩️ Undo step for the whole drag) and a bar under the lanes with ➖ ➕, 🗑️ (asks first) and ✕. ↩️ Undo (40 steps, for the open song only) covers blocks, lanes, names, pictures and tempo; mute and volume do not, as on a beat row's speaker. Keyboard: Tab to a lane, ← → Home End move a cursor, Enter or Space taps the bar; on a block + − and Delete; Esc lets go.
- **Lanes:** a song starts with 4 lanes (🥁 Drums, 🎸 Bass, 🎹 Keys, 🎤 Voice); ➕ Add a lane adds up to 8 (✨ Sparkle, 🔔 Bells, 👏 Claps, 🎺 Horns). Lanes are not removed. Under 700 px four lanes show and the box scrolls down for the rest; each lane head shows its picture over its name. Wider, every lane shows. A lane's name and picture change in a small sheet (the picture chooser, with "…" for every emoji).
- **Playing:** from bar 1, or from a bar number tapped in the ruler (it is lit ▶; tapping it while playing restarts there). Each lane plays through a gain of its own, so mute and volume act live. Save as a sound and share previews render the unmuted lanes mixed, Save as a sound up to 3 minutes.
- **Tempo:** ➖ ➕ step by 5; the number can be typed.
- Smaller calls, made by the agent: the names of the lanes past 4, the ±5 tempo step, 64 repeats and 128 bars as limits, lanes not removable, the first beat setting the tempo, the play-from-bar ruler, Undo's reach.
