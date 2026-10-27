# More kinds of music: where it all goes

The design review of 2026-10-17. Ben's answers to the questions at the end are in docs/decisions.md (Sounds and voices, Beat maker); the work is in TODO.md "Agents do".

**Answer.** Add instruments as **who plays** the Notes, Chords and Bass, not as new groups of pads. Each group header gets one picker (🎹 Piano ▾). Notes stays 8 pads. Each new pad is still its own kit id, so beats, keys and bands keep what they were given, and nothing stored changes. Only one new preset group: 🪘 Hand drums. Grooves regroup into 7 style groups, and each card says where the groove comes from and who plays in it. Kids' toy keys become pentatonic, always on, with a round instrument button.

Two blockers first. **The size budget is already spent.** The kit is 4.49 of 5 MB, and 3.80 of 4 MB with Advanced off, and the service worker downloads all of it on install either way. **A rule clashes:** every kit sound has its own emoji (decisions.md, Beat maker).

## 1. Preset organisation

| Option | What the kid sees | Cost |
|---|---|---|
| A. New groups per instrument (🎹 Piano, 🎻 Strings…) | 17–18 folded headers; ~100 new pads; Kids gets ~12 more swipe pages | Cheap to build, bad on a phone. The chooser and 👆 "add a band" lists double. |
| B. A timbre switch on what is stored (the beat row says "Notes, as Flute") | 8 pads; flipping the switch changes old beats | A new row/key/band/take field, a backup change and an ADR. Old beats change sound under the kid. |
| **C. A picker as a view (pick)** | 8 pads per instrument; the picker swaps which 8 show | Kit ids like `piano-e` in boards.json, with no IndexedDB, backup or cloud change |

How C works:
- In boards.json a kit entry gains `inst` (piano), and may share another entry's `file` with a semitone `shift`. A chord can be `notes: [-3,0,4]`, rendered from the instrument's sample. Extra notes and chords then cost no bytes. Only 1–2 samples per instrument cost bytes.
- **Pads:** the group header shows the picker. On a phone a tap opens it, sorted by family. From 900 px the choices sit in one line instead (the give-way rule: more than 5 stops becomes a picker). Remembered per device, like the group folds (`kit-inst`, plus a line in startup-remembered).
- **Beats rows / sound chooser:** each section has the same picker. A row stores the exact id, as today.
- **🎹 Tune rows:** this is where instruments pay off most. The roll already plays one sound at any pitch, so a tune row's sound *is* its instrument. 🎹 Add a tune asks "Who plays it?", and the roll's top line can swap the instrument and keep every note.
- **⌨️ Keys / ✏️ Edit keys:** "a group onto a row" puts the picked instrument's notes on it. Add one ready-made layout per family (built: Keyboard, Mallet, String and Wind band).
- **👆 Bands:** a band's header gets the picker, and changing it rewrites the band's `sounds`. A band with no sounds listed means the group's default instrument, never all of them.
- **Group count:** 12 (Drums, 🪘 Hand drums, Hip hop, Notes, Chords, Bass | Game, Effects, Animals, Sci-fi, Voices, Silly). Under "Presets" they split into two labels, 🎵 Music and 🤪 Fun.
- **Instruments:** Notes gets Pluck, Piano, 🎮 Chip, Marimba, Steel drum, Kalimba, Guitar, Strings, Brass, Flute. Chords gets Synth, Piano, Guitar, Strings. Bass gets Synth, Upright, 808.

Build: ~5 h for the kit model and picker on five surfaces. Needs ADR 0030 (instruments are a view over the kit).

## 2. 💃 Grooves (39 → 50)

| Option | Cost |
|---|---|
| A. 2–3 new groups on top of 6 | ~30 min. "World" turns into a catch-all of 10. |
| **B. Regroup into 7 by style (pick)** | ~30 min. Groups hold 5–11 each. |
| C. Filters or "featured" | One more line of controls on a phone dialog, and a second way to find the same thing. |

B's groups:
- 💃 Dance: + Jersey club, amapiano, chiptune
- 🎤 Hip hop
- 🎸 Rock, pop & country: + K-pop, country/bluegrass
- 🙌 Soul & gospel: Motown, funk, second line, + R&B, gospel
- 🌴 Latin & Caribbean: + reggae, ska, soca
- 🌍 Drums of the world: afrobeat, maqsum, + Afrobeats, bhangra, taiko
- 🎷 Swing & odd times

**How a kid finds the instrument beats:** each card shows **who plays** as family-colored chips (🛢️ steel drum), in the same colors as the picker. It also gets a plain one-liner, "From Trinidad. Steel drums dance over a kick on every beat." 🆕 marks a groove until it is first played. The old "Kick, Snare… · 2 bars · 96 BPM" line goes to Advanced.

Build: ~5 h for 11 grooves, blurbs and chips. No stored change.

## 3. 🧸 Kids pentatonic

| Option | Cost |
|---|---|
| **A. Toy keys always pentatonic: C D E G A, high C D E (pick)** | ~30 min. High notes are a shift of the same clip, so no new kit ids. |
| B. A grown-up switch in Settings | A setting a 5-year-old never sees, for a choice no kid needs. |

A high note wears the same fruit a size smaller, with ✦: the same note, higher. Add a round **instrument button** at Keys' top left, like the skin button on Pads: Pluck → Piano → Marimba → Steel drum → Kalimba. No words. ~45 min. A small ADR 0019 note.

## 4. What shows at which level

| | 🧸 Kids | Regular | Advanced |
|---|---|---|---|
| Hand drums | as pads | ✓ | ✓ |
| Instrument picker | round button on Keys | ✓ all instruments, natural notes | + sharps and flats for every instrument (free in bytes) |
| Chords per instrument | — | the 7 | + the 10 |
| Groove cards | — | blurb + who plays | + bars · BPM · rows |
| Roll instrument swap | — | ✓ | ✓ |

Regular doesn't drown: the pads showing don't grow in number. One control is new.

## 5. Teaching without screens

- **The fruit is the note:** 🍎 is C on every instrument, so "a C is a C, whoever plays it" is learned by tapping. The instrument shows as a badge.
- **Families as color and order:** Keys, Hit it (mallets), Strings, Blow it (wind). The picker, the groove chips and the keys' periodic-table colors all use the same colors.
- **The same tune, a new instrument** in the roll teaches what timbre is, without the word.
- **Groove blurbs:** where it comes from and what to listen for. No music words with Advanced off (ADR 0004).
- **❓ Help:** one line per control, written when the control lands (or marked `soon`). No lessons.

## 6. Pushback

1. **Budget.** About 0.9 MB of new audio (piano 2 zones, strings 2, brass, flute, upright bass, 11 hand-drum hits, mallets, chip) brings the kit to ~5.4 MB, ~4.7 shown. See Q1.
2. **One sample stretched an octave sounds chipmunky.** Piano and strings need 2 zones each. Mallets, guitar (a plucked-string synth) and chip are generated and stretch cleanly.
3. **Tabla and dhol from a stdlib synth will sound thin.** Taiko, djembe and the mallets synthesize well. Tabla's bending "ge" is hard. Try it, and drop it rather than ship a bad imitation. Amapiano needs a **log drum**, which is not on the list. Add it (easy).
4. **K-pop and chiptune are mostly sound, not rhythm.** Chiptune only works with the 🎮 Chip instrument, so add it. K-pop will sound like dance-pop. Keep it, but don't expect it to sound distinct.
5. **Gospel and R&B want an organ or electric piano.** Piano alone gets close. Add an organ only if a CC0 sample fits.
6. **Order of work:** build instruments before new grooves. Then re-voice a few existing grooves (Motown 🎹, Lo-fi 🎹, Reggae 🎸): that is cheaper than new grooves and they get better. 39 grooves are still "not yet listened to on a phone".
7. **Samples:** VSCO 2 CE and VCSL are likely CC0. Check before downloading.

## Cost and order

| Step | Minutes |
|---|---|
| Kit model (`inst`, shared file + shift, rendered chords), tests, ADR 0030 | 150 |
| Picker: Pads, chooser, Add a tune + roll, Edit keys, 👆 bands, Help lines | 180 |
| Generated: mallets, chip, guitar, hand drums, log drum | 150 |
| Samples: license, trim, 2 zones, size test | 150 |
| Grooves: regroup, re-voice 3, 11 new, blurbs, chips | 300 |
| Kids: pentatonic + instrument button | 75 |

About 17 h. No IndexedDB, backup or D1 change. boards.json gains fields. A decisions.md row changes (emoji) and one is added (budget).

## Questions for Ben

1. **Budget:** A. raise to 6 MB / 5 MB shown (pick: ~1 MB more, once, on first visit). B. Cache the new instruments only on first use (smaller install; offline lacks unplayed ones). C. Shorten fun sounds to make room.
2. **Emoji rule:** A. each note keeps its fruit on every instrument, with an instrument badge (pick). B. Unique emoji per sound: ~200 more pictures, and the octave lesson is lost.
3. **Instrument choice remembered:** A. per device, like the folds (pick). B. per person, synced.
4. **Grooves:** A. regroup into 7 (pick). B. add groups on top.
5. **Kids pentatonic:** A. always on (pick). B. a grown-up switch.
6. **Order:** A. instruments, then re-voice, then new grooves (pick). B. grooves first, using only synth sounds.
