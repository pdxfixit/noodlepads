# 🎧 From a song: a song's beat, heard live

The design talk of 2026-10-17 and 18. Ben's answers are in docs/decisions.md (Beat maker, Hosting and data, Screens); the work is in TODO.md. Mockups (Ben said yes, 2026-10-18): https://claude.ai/artifact/Ch7TMF33fLxhyRPYaDPkZ7, the screens described in words below.

**Answer.** A person plays a song (Spotify's web player in another tab is the main case) and Noodle Pads listens. While it plays, kick, snare and hi-hat appear as rolling bars. At ■ Stop, what it heard becomes beats: one per part of the song, a part that comes back reused, and a 🎼 Song with tempo marks when there is more than one part. Everything runs in the browser. The song is never saved; only the beats are. Regular and Advanced only, never 🧸 Kids.

## What it can listen to

A web page cannot get audio from a Spotify or YouTube link: neither hands a page its sound. Spotify's Web API stopped giving new apps audio analysis and previews in late 2024.

| Source | Where it works | How |
|---|---|---|
| 🗂️ Another tab **(main)** | Chrome and Edge on a computer | `getDisplayMedia({audio: true})`; the person picks the tab and leaves "Also share tab audio" ticked. Drop the video track at once. |
| 🖥️ Everything on this computer | Chrome and Edge on Windows (macOS only on recent versions: check) | The same call, sharing the whole screen with system audio. Notifications get in too. |
| 🎤 The microphone | Everywhere, phones too | `getUserMedia`, as recording a sound does. The song plays out loud nearby. |
| 📁 A song file | Everywhere | `decodeAudioData`, then the same listener at faster than real time. |

A phone shows only 🎤 and 📁, with a line saying another tab needs Chrome or Edge on a computer.

**Unproven, and it decides the main case:** that Chrome hands over Spotify's tab audio, which is copy protected. Tab recorders work on it, so likely yes. The first step of the build checks it before anything else.

## How listening works

Pure functions in their own module, fed the audio a frame at a time by an AudioWorklet (a new `web/` file, so it goes in `web/sw.js` `SHELL`). No library: onset detection and beat tracking are classic signal processing.

1. **Hits.** Split the sound into bands: low (kick), mid with noise (snare), high (hats). A sudden rise in a band's energy is a hit.
2. **Tempo and bar lines.** Find the beat from how hits repeat (the first 2–4 bars, shown as "listening" and a settling tempo). Follow it as it drifts; a hit is placed by beat, never by second, so a live drummer's drift is fine. Half or double speed is the common miss.
3. **The grid.** Each hit snaps to a sixteenth, as ⌨️ Keys does. Meter: the best fit of the five signatures (4/4, 3/4, 5/4, 6/8, 7/8), less sure than the tempo.
4. **Parts.** A part ends when the tempo changes (new bars stop lining up for about a bar; the bars in between are dropped) or the pattern changes (2 bars in a row don't match the part so far; one odd bar is a fill). A new part is compared with every earlier one, so a chorus that comes back reuses its beat.
5. **The beat of a part.** Its bars vote: a hit that comes back bar after bar stays; a one-off goes.
6. **Sounds.** Each row gets the app's closest sound by its sound's shape, from every group (Drums, Hip hop, Hand drums, Effects): Dusty kick for a dusty kick.
7. **Swing.** How late the off-beats land picks Straight, Swing or Shuffle (Advanced's three keys).

Only the hits and their timing are kept, never the audio, so it can listen to a whole song.

Tests: synthesize audio in the test (clicks and noise bursts at known times, a tempo change, a fill, a swung hat) and check the module gets the pattern, tempo, parts and swing back.

## The screens

| Screen | What it shows |
|---|---|
| 💃 Grooves | A blue card at the top: 🎧 From a song, a line on what it does, and Listen. The groove groups follow under "Or start from one of these". |
| 1 · What to listen to | The four sources as large choices (the phone has two), then a line on the browser's own question ("leave Also share tab audio ticked") and "The song stays on this device and is never saved. Only the beat is kept." |
| 2 · Listening | ● and the time, ■ Stop (red). The parts so far as chips (A · 92 BPM, B, A again, C · 120 BPM · listening…), and the current tempo, signature and swing. Then a row per instrument, its name and the sound picked ("Dusty kick (closest)"), with its **last 3 bars, one per line (2 on a phone)**: new bars come in at the bottom and the oldest roll off the top. Each line says its part and bar ("C · bar 22"). A hit that fits the part's pattern is bright, a one-off dim, the step just heard has a white ring, steps not yet played are darker. A tempo change shows a yellow line ("Sped up at bar 22. 92 → 120 BPM, so part C started there"). On a phone the pills are small (nothing is tapped while it listens). |
| 3 · What I heard | A sentence ("1:52 of music, in 3 parts. 4/4 at 92 BPM, then 120 from 1:12. The hats swing a little (Shuffle)."), a card per part with ▶ (tempo, bars, how often heard), the sounds picked, then 🎼 Open it as a song, 🥁 Open part A and 🗑️ Throw away. Beats are named with one fun name and the part's letter ("Zippy Noodle · A"); a tab never says the song's title. |

**The beat bar on a phone** (separate from the listener, can go first): 💃 Grooves, ⌨️ Keys and 🗂️ My beats move to a row of their own above the title, with their words; the title line keeps 💾 Keep and 🆕 New beside it. Today three of the five lose their words.

## 🎼 Song: tempo marks

Today a song has one tempo. Ben chose marks on the timeline ("from bar 17, 120 BPM") over each block keeping its beat's tempo: every lane follows the mark, so bars stay lined up. The listener's song is its parts in order, with a mark wherever the tempo changed. A gradual change as a ramp between two marks can come later.

It changes how songs are stored, so it needs an ADR: an older copy plays the song at its first tempo, a 1.x backup still loads (ADR 0011), and the cloud's merge and share previews follow the marks. `playlist.js` (pure) and `song.js`. A way to add and move marks by hand in 🎼 Song comes with it. Useful on its own, so it can ship before the listener.

## Left for later

- Triplet rows and polyrhythm (Ben: "solid deferral"). Triplets change how every beat is stored, and a detector would mistake swung hip hop for triplets.
- A fourth row for another hit that repeats (a horn stab, a scratch, a cowbell): about a day, short distinct hits only.
- Melody, chords or the sample over the top.
- Playing along with the song live (Ben: not the point).

## Order and size

| Step | Days |
|---|---|
| 1. The check: a small dev page showing a level meter of a shared tab's audio, for Ben to try on Spotify (2 min), and the listener's first pass on a handful of songs | ½ |
| 2. The phone beat bar | ½ |
| 3. Tempo marks in 🎼 Song, with its ADR | 2–3 |
| 4. The listener: hits, tempo, meter, grid, a new part on a tempo change | 5–6 |
| 5. Parts by pattern, reused when they come back, made into a song | 1–1.5 |
| 6. Closest sounds and swing | 1 |
| 7. The screens, with rolling bars | ½ (in 4–6) |

About 10½–12 days in all. Each step lands on its own.

Every step also: `docs/guide.md`, a ❓ Help line (`web/help.js`), `just look` views for the new sheets, `web/_headers`' Permissions-Policy gets `display-capture=(self)` on purpose, a `logEvent` kind gets its rule in `web/log-clean.js` and any new usage event its line in the telemetry repo's `events.toml`, and `web/privacy.js` says the song is never saved or sent.
