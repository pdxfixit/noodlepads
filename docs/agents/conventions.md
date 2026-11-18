# Conventions

Rules for the code, screens, decisions and docs, writing and tooling. Moved out of [AGENTS.md](../../AGENTS.md) unchanged.

## Conventions

### The code

- **No build step and no dependencies.** Modules load as they are. Tools are stdlib Python or plain shell. One exception: `tools/look.mjs` (with the `chrome.mjs` and `look-cloud.mjs` it loads) is Node with no packages, because driving headless Chrome needs a WebSocket client and stdlib Python has none (Ben, 2026-10-11).
- **The CSP in `web/_headers` allows only what the page loads.** No inline script or style, and no outside origin but Cloudflare's Web Analytics beacon (Ben, 2026-10-20): the fonts are served from `web/fonts/`. Adding one means changing that line on purpose.
- **No regex lookbehind (`(?<!…)`, `(?<=…)`) in `web/`:** Safari before 16.4 can't parse one, and the whole app stops loading. `tests/no-lookbehind.test.mjs` checks.
- **A new file in `web/` goes in `web/sw.js`'s `SHELL`** (or in `NOT_LOADED` in `tests/offline.test.mjs`, with why), or the app opens without it offline. The test names the file.
- **Pure logic goes in its own testable function** (`model.js`, `sequencer.js` exports, `names.js`). The DOM code calls it.
- **Stored formats are kept by users.** A change to IndexedDB needs an upgrade in `store.js` (`SCHEMA`, `upgradeStores`). A backup from 1.0 on (format `1.x`) must still load in a newer copy of the app ([ADR 0011](../adr/0011-backups-1-0-merge.md)).
- **Every preset plays at the same loudness** (Ben, 2026-10-23: Computer chirped far louder than the rest). After any change to `web/clips/kit/` or the kit in `boards.json` (a new sound, `just placeholders`, `kit_instruments.py`), run `just preset-loudness --fix`; `tools/test_preset_loudness.py` fails until you do. Turning a WAV file up or down changes nothing: the app plays every sound at the same peak, then its `level` turns it down. A level cannot turn a sound up, so a new sound far under the middle (the tool lists the quietest) needs remaking, not a level. `FLOOR` (8.5 dB under) fails the test for any preset below it that `UNDER_THE_FLOOR` in `tools/test_preset_loudness.py` does not list with why; a synthesized sound is remade louder by driving it harder in its `tools/make_placeholders.py` recipe (`drive`). A preset Ben hears as still too loud gets a line in `BY_EAR` in `tools/preset_loudness.py` (dB under the middle), never a hand-edited `level`. A real-world preset (an animal, a drum, a siren) is a recording, made by `tools/make_samples.py` (`HITS`) and credited in `web/clips/kit/LICENSE-samples.txt`; `make_placeholders.py` never makes it.
- **An Esc that closes, empties or lets go of something calls `preventDefault`** (2026-10-26): Esc is Stop all on the page (`app.js bindEvents`), which stands down only for a key already used. `tests/space-stops.test.mjs` checks every `'Escape'` handler in `web/`.
- **Settings are declared in `settings.js`** with a default and the allowed values. Backups carry them.
- **Anything remembered in `localStorage` gets a line in `tests/startup-remembered.test.mjs`**, which starts the app with every remembered choice set. A remembered DJ mode once stopped the app starting (2026-10-11).
- **Every control gets a tooltip** (Ben, 2026-10-12): `web/tooltips.js` adds one from its `aria-label` or text, so give an icon-only control an `aria-label`; write a `title` only when the tooltip should say more.
- **A bar that runs out of room gives way in the app's one order** ([docs/design/give-way.md](../design/give-way.md); Ben, 2026-11-18): tight, compact, words, doubles (❓, ⬆️, ⚙️), fold; the main action and the person button never go. A new key takes its stage there, and the bar gets a check in `tests/give-way.test.mjs`.
- **A − or + that steps a value repeats while held** (`web/hold-repeat.js`; Ben, 2026-11-18): wire each new one with `holdRepeat(button)`; a screen that keeps ↩️ Undo or saves treats a hold as one change (`holdStage()`, the `holdend` event), as 🎼 Song and Beats' tempo do.
- **A new or renamed control gets its line in ❓ Help** (`web/help.js`). `tests/help.test.mjs` fails when Help draws a label the app no longer has. A feature still in flight can have its line written ahead, marked `soon` (hidden).
- **Destructive actions ask first:** the first tap turns the button red and asks ("Remove?"), and the second tap does it. Where a slip costs work, offer Undo too.
- Comments say what the code is for and why, in plain sentences, at the density of the file around them.

### Screens

Ben: *"Optimizing the user interface for a variety of screens is very important."*

- Phones are the main device. Design at 375 px first, then check 320 up to 1100, and the wide screens up to 3440 (`just look --wide`).
- Wide screens fill, then split (Ben): content fills up to 2400 px, centered beyond; from 1400 px a screen's two natural parts sit side by side, except Beats (its rows keep the full width). The rules are at the end of `styles.css` (Wide screens).
- Lines of controls fill the width on phones. Nothing scrolls sideways.
- Touch targets are at least 44 px.
- The `just test` contrast suite checks text on every color the app uses. Keep it green when you add a color.

### Decisions and docs

- **When Ben decides something, record it in [docs/decisions.md](../decisions.md) in the same commit**: one row, Rule and Why under 40 words.
- **A change to what the app collects or shows updates `docs/privacy-policy.md` in the same commit** (bump `updated:`; write the address as `{contact}`), then run `just policy` once it is on `main`: it hands the file to the privacy repo's own send script (tools/send.sh there), which copies it there and lands it (`--dry-run` stops before landing). The same in all four apps (Ben, 2026-10-27).
- **A replaced rule is deleted,** and the new rule takes its row. Do not add prose saying a rule changed.
- **A significant decision also gets an ADR** in [docs/adr/](../adr/README.md): anything that changes what the app is, a stored or backup format, the hosting, or is costly to undo.
- Never change a decision on your own. Recording Ben's answer, or fixing a row that does not match the code, is fine.
- **Keep [docs/architecture/](../architecture/README.md) true in the same commit** when you add, remove, merge or split an engine, a store, a scheduler, a record shape that crosses modules, a path off the device, or a module's job, or when you fix a seam it lists. `tests/architecture.test.mjs` checks its ✅ claims against the code. When that test fails, fix the doc as well as the test. Found something the doc lacks while you searched? Add it.
- Keep [docs/guide.md](../guide.md) true when behavior changes, [docs/layout.md](../layout.md) when a file is added, moved or removed, and README.md's short list when a whole part changes.

### Writing

- Answer first. Short sentences, plain words, tables for structured data.
- Say what a kid using the app would notice, then the reason.
- No "not X but Y" framing. Say what is true.

### Tooling

- Improve the tooling in every session, not only when asked. If a step was slow, repeated or easy to get wrong, fix it in `justfile` or `tools/` in its own commit. Propose bigger fixes with a time estimate. Say what each fix saves.
- `tools/` is stdlib Python or plain shell, except `look.mjs` and the two files it loads (Node, no packages; Ben, 2026-10-11). Do not add another Node tool or any npm package without asking. Node test helpers and reporters in `tests/` (such as `tests/file-end.mjs`) are test code, not tools (Ben, 2026-10-26).
- **Pay it forward.** Whatever cost you a search, a retry or a wrong turn, write down where the next agent will look first: this file, or the doc for that area.
