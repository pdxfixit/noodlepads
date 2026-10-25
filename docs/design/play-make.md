# Play and Make: two tabs instead of four

Status: Ben's answers in (2026-10-25); the mockup waits for his OK before building.
Mockup: a private artifact shown to Ben (screenshots of today's screens under the new bar and switch); the layout is described below.

## Why

Beats' rows, the 🎹 piano roll and 🎼 Song came to share one layout (heads on the left, time across, sideways scroll) on 2026-10-25. Ben: "a singular interface and somehow a distributed pair of interfaces". Of the two shifts offered (one zoomable timeline, or a Play/Make split), he chose the split: "make the two interfaces play and make."

## Ben's answers (2026-10-25)

| Question | Answer |
|---|---|
| How deep | Two tabs in the bottom bar, each with a two-way switch at the top. The screens themselves stay as they are. |
| Play | 🔊 Pads · 🎤 Live |
| Make | 🥁 Beats · 🎼 Song (the 🎹 piano roll opens from Beats, as now) |
| Recording keys into a beat | Stays in Make: 🥁 Beats with ⌨️ Keys and ● Record. |
| Names | 🎉 Play · 🛠️ Make |
| 🧸 Kids | Unchanged. |

## The layout in the mockup

- Bottom bar: 🎉 Play · 🛠️ Make, each with a small line under its name saying which side is open (Pads, Live, Beats, Song), then ⏹️ Stop all.
- The switch: a line under the header on a phone (full width, two halves); in the header's empty middle on a wide screen.

## Calls made without asking (in the mockup, for Ben to check)

- Each tab remembers its side on the device, as ⌨️ Keys is remembered.
- The switch scrolls away with the page; the slim bar at the top doesn't carry it.
- Tapping the tab already open flips its switch, as a shortcut.
- It replaces ADR 0017 (four peer tabs, no sub-switches): a new ADR, and decisions.md rows, when built.

## Build plan (after the OK)

1. The bar and the switch: two tabs, the switch per tab, remembered sides, the tab-again shortcut; the screens untouched. Wide screens: the switch in the header.
2. Everything that names the four tabs: ❓ Help, the welcome and tips (ADR 0028), the slim bar's room rules, the event log's `screen.view` (the screen names stay pads, beats, song, live), `just look` views.
3. Docs: the new ADR (superseding 0017), decisions.md, guide.md, README's short list.
