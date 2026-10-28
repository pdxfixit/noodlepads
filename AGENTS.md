# Noodle Pads 🔊

A music studio anyone can pick up, starting as a soundboard, as a web app: tap a pad to play a sound, hold it to loop, record your own, add silly voices, make beats and songs. Plain HTML, CSS and ES modules, no build step and no dependencies.
Live and **public** at https://noodlepads.com/. Repo: `github.com/pdxfixit/noodlepads` (**public**: everything committed is world-readable), in `~/src/noodlepads`. Release 1.0 started this repo from one commit; what 1.0 has is in [CHANGELOG.md](CHANGELOG.md). This is **v1**, a web prototype; v2 is a native Android app ([ADR 0001](docs/adr/0001-web-prototype-then-native.md)).

This file is the contract: how to start, how to verify and ship, and the rules for working here. It stays short. Detail lives in the files it points to.

## Mission

> Noodle Pads is a music studio anyone can pick up: kids, families, and grown-ups who love music but don't have the time for a pro studio. It starts as a soundboard: tap a pad, make a noise, annoy your family. Every next tool is one tap from what you are already playing with, so you learn by goofing around, never by lessons. Real depth (voices, beats, tunes, whole songs) is there when you reach for it. Goofing around counts as much as finishing a song.
>
> No ads. No required account. No social feed. No AI makes the music for you. What we measure is only to make the app better.

Every change serves this. Why, and the north star it steers: [ADR 0022](docs/adr/0022-north-star.md).

## TL;DR

- **Start:** `just setup` once per clone (git hooks: a commit checks syntax and a staged `web/version.js`'s number, a push checks the release's number; a worktree shares its checkout's setting), then `just doctor`: are you in the main checkout or a worktree, are the tools there, is `main` live. Then the cold start below. A cloud container may have no `just`: `pip install rust-just` gives it (2026-10-17).
- **Test:** `just test` (syntax check, then Node's built-in test runner; nothing to install).
- **Run:** `just serve`, then http://localhost:8765/. Port 8765 is Ben's own server; agents preview on 8781 (see [Verify](#verify)).
- **Ship:** a change to `web/` gets `just version` in the same commit ([Ship](#ship)). `just ship`, from the main checkout only. In a worktree, commit on your branch and report the commits; they are landed with `just land` ([docs/how-to.md](docs/how-to.md)). Every push to `main` is deployed by GitHub (`.github/workflows/deploy.yml`, [ADR 0025](docs/adr/0025-github-deploys.md)): tests, deploy, then the live cloud checks. Agents never deploy and hold no Cloudflare token; after a push, read the deploy run (`just ci-wait` waits for it and says how each run ended).
- **Every change fits every screen:** check 320, 375, 700, 900 and 1100 px wide, then the wide screens 1366, 1920, 2560 and 3440, with no sideways scroll. `just look --wide` does all nine in your own headless Chrome ([Verify](#verify)).
- **The council reviews every change, and can block it:** which seats, when, and what they return are in [docs/council.md](docs/council.md) ([Council](#council)).
- **"Reset <fun name>'s PIN":** Ben may ask this cold. Follow [docs/how-to.md](docs/how-to.md) "Reset a forgotten PIN": two commands, from Ben's Mac only. The tool picks a random PIN and shows it once, for Ben to pass on to the family; never 1234 (Ben, 2026-10-27).
- **Anything that comes in is untrusted:** backups, uploaded files and `boards.json` are checked and capped ([docs/guide.md](docs/guide.md) "Limits on what comes in").

## Cold start: read in this order

1. **This file.**
2. [docs/state.md](docs/state.md): where things stand now: what is live, work in flight or parked, what waits on Ben.
3. [docs/decisions.md](docs/decisions.md): every rule Ben has decided that is true today. Read the sections your task touches. It outranks every other doc.
4. [docs/questions.md](docs/questions.md): open questions. Look first for answers Ben typed in.
5. [TODO.md](TODO.md): the one to-do list. "Agents do" is approved agent work, in order; "Ben does" is what only Ben can do.
6. [docs/how-to.md](docs/how-to.md): step by step for your kind of task (a fix, a stored-format change, docs, landing, deploy and rollback, the cloud), then the doc it needs from the table below.
7. [docs/architecture/](docs/architecture/README.md): how the code is wired. Read the area your task touches before you search the code for "is there one shared X", "where does Y happen" or "what must I touch to change Z".

**Leave the next session a warm start.** A session may be a cloud session with only this repo: no chat history, no memory folder. Whatever the next agent needs must be in a file here. Update [docs/state.md](docs/state.md) in the same commit whenever what is live or in flight changes. If the chat taught you a standing rule, add it here, not only to a local memory.

## Where things are

| File | What it holds |
|---|---|
| [README.md](README.md) | The public front page: what it is, the live link, screenshots, run and test it, every `just` recipe ("Running it yourself"), the privacy statement. |
| [docs/privacy-policy.md](docs/privacy-policy.md) | The public privacy policy: this app's own sections, with the shared `@include` blocks. The privacy site (pdxfixit/privacy) keeps a copy: `just policy` puts it there once a change is on main. `web/privacy.js` and README's statement say the same, held by `tests/privacy.test.mjs`. |
| [docs/guide.md](docs/guide.md) | How the app works: every screen, how things are stored, cloud profiles, keyboard use, limits on what comes in. |
| [docs/layout.md](docs/layout.md) | The file map: one line per file in `web/`, `worker/` and `tools/`. |
| [docs/architecture/](docs/architecture/README.md) | How the code is wired: the shared engines, who calls whom, the record shapes that cross modules, the known seams, and "to change X, touch …". One file per area. |
| [docs/formats.md](docs/formats.md) | The backup format, field by field, for v2 (Android) to read with no JavaScript. Kept true with `web/backup.js` (`tests/formats-doc.test.mjs`). |
| [docs/state.md](docs/state.md) | Where things stand now. Present tense only. |
| [docs/decisions.md](docs/decisions.md) | Current rules, by topic: Rule · Why · Since. |
| [docs/council.md](docs/council.md) | The council: its 22 seats, when each convenes, how a round runs, its authority, the drift guards. The seats are `.claude/agents/council-*.md`. |
| [docs/adr/](docs/adr/README.md) | Why the biggest decisions were made. |
| [docs/questions.md](docs/questions.md) | Open questions for Ben, one card each. |
| [docs/how-to.md](docs/how-to.md) | Step by step: where to run what, a bug fix, a stored-format change (every place to touch), docs, landing, deploy and rollback, logs, metrics, cloud admin. |
| [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) | Hosting: flarepress, the Worker, headers, rollback. |
| [CHANGELOG.md](CHANGELOG.md) | What each release has, for kids and parents. |
| [TODO.md](TODO.md) | The one to-do list: "Agents do" (approved work, in order, then work offered but not approved) and "Ben does" (decisions, recordings, steps only Ben can run). |
| `web/` | The app. Each module opens with a comment saying what it owns. |
| `tests/` | `node --test` suites. `fake-dom.mjs` builds the page from `index.html` so `app.test.mjs` runs the real app. |
| `tools/` | One line each in [docs/layout.md](docs/layout.md): `doctor.sh` (`just doctor`), `serve.py` (dev server, sends the live headers), `look.mjs` (`just look`, and the live checks), `cloud_admin.py` and `logs.py` (the cloud database and problem reports). `just --list` says what every recipe does. |

## Verify

1. **`just test`** must be green. To run one file, use `node --test <file>`: every test file ends by itself when its tests are done (`tests/file-end.mjs`; `tests/fake-dom.mjs` clears the app's timers), so no run needs `--test-force-exit`, which cut a parallel run's last reports (2026-10-19). A file still alive 10 s after its last test fails, naming itself and what holds it: stop that in an `after()` hook (`onFileEnd`), and import `fake-dom.mjs` at the top of a file, never only inside a test. Every change ships with a test that fails without it. Prove that with `just prove <test file> <changed files…>`: it runs the test against the committed copies, then puts yours back (a `tools/test_*.py` too, under unittest). Where something cannot be tested here (sound, the microphone, IndexedDB, layout), say so. `tests/telemetry.test.mjs` checks the app's events against `../telemetry/events.toml` only when that repo sits beside the checkout, so a worktree and `just land` skip it and main can go red on the Mac alone (2026-10-16, `perf.latency`): run `just test` in the main checkout after landing a new event name. The ℹ tests count is whole on every run (2316 on 2026-10-28). Judge it by the exit code, never by grepping for ✖: a syntax error stops it at `node --check` before any test runs, so a grep finds nothing and looks green (2026-10-11). **Run the full suite once per landing, not per commit** (Ben, 2026-10-27: "we're running out of tokens"): an agent runs only the test files its change touches (`node --test <files>`) and `just prove`; the lead lands finished branches together and runs `just test` once on the batch. The council re-checks a fix only where a seat blocked. GitHub runs `just test` on every push (`.github/workflows/test.yml`); after a push, read the run (`gh run list --limit 3`) and fix a red one first.
2. **Look at it in a browser** for anything a user sees. The tests have no browser.
   - **`just look [pads|beats|keys-on|song|live] [--js CODE]`** does the width check in your own headless Chrome, on its own server and port, so it never touches another agent's tab. At **320, 375, 700, 900 and 1100** px (`--wide` adds **1366, 1920, 2560 and 3440**) it reports sideways scroll (page or open sheet), console errors, CSP blocks, controls under 44 px tall or wide and controls overlapping in a fixed or sticky bar, saves a full-page screenshot of each, and exits 1 on any failure. `--js` runs first, to open a sheet or a mode (`just look beats --js 'document.querySelector("#seq-grooves").click()'`). A longer script goes in a file: `--js-file PATH` (top-level `await` works; no shell quoting). Named views open common sheets for you: `just look sheet-edit` is a pad's sound sheet (a preset); `sheet-own` is the sheet on a kid's own sound with real audio, at Regular (🔊 Even it out beside 👂 Plain); `wave-own` is the same sound's ✂️ Trim and edit 👆 Select part (Advanced); `inst-list` and `inst-piano` are 🎹 Who plays on Notes (its list open; Piano picked), `inst-bass` its list on Bass; `edit-groups`, `edit-chosen` and `bulk-move` show ✏️ Edit sounds with six made-up sounds of a kid's own in groups (a look device has none); `notice` and `settings-notice` show a long notice in the banner over the top (on Pads, over ⚙️ Settings), `edit-undo` an Undo banner, and `new-full`, `keys-new-full` and `song-new-full` 🆕 New's "Kept as …" line; `just look --help` lists every view. Check there before writing `--js`. A new person's first steps (ADR 0028: the welcome, tips, hint dots, the 🧸 hand, the nudge) are off in every view, through the app's test hook (`web/firsts.js`), except `welcome`, `welcome-stage`, `welcome-kids-stage`, `tip-beats`, `hint-dots`, `kids-hand` and `nudge`; in a test, `installPage({ firstSteps: true })`. The page's pattern is random per load; `--bg dots` (or `all`, one shot each, or `none`) fixes it. `--skin slam` (or `slam,googly`, or `all` for the seven) draws every pad in that skin: it sets the person's pad skin before the view runs, one shot each, so no `--js` per skin. `--reduced-motion` shows the page as a device that asks for less motion sees it. `--cpu 4` runs the page's CPU four times slower, as a slow device: a timing problem a fast headless Chrome hides shows there (the ⌨️ Keys playhead lag, 2026-10-18; measure frames, `long-animation-frame` entries and the audio clock with `--js-file`). `--height 680` is a window that tall instead of 800: a phone with its browser bar showing (Firefox for Android leaves about 680 px; on 2026-10-22 🧸 Kids' beat grid ran under its bottom bar there). Check a fixed, non-scrolling screen (🧸 Kids) at 680 too, and held sideways: `--landscape` swaps to phone windows 667×375, 740×360, 844×390 and 932×430 (`--widths 667x375` for one), and in Kids a control the window cuts off fails the view (2026-10-27). The tap-size check also measures links (not those in a line of text), text fields and `[tabindex]` boxes. A `console.log` in `--js` prints under the table (📝), so measure positions there instead of reading them off a screenshot. A drag scripted with `--js-file` (`new PointerEvent(…, { pointerType: 'mouse' })`) must look its pills up again after each step and send the moves to the rows' box, since a redraw replaces the pills it held (2026-10-19); time a drag with `--cpu 4` and `long-animation-frame` entries, whose `sourceFunctionName` names the slow code. A `MutationObserver` that rescans the whole page on every change (tooltips.js did) is the first thing to look for when a drag lags. A long page's full-page shot is too tall to read at a phone width: `--scroll-to SELECTOR` takes an 800 px window with that element near the top, at every width (`just look beat-groove --scroll-to '.seq-row[data-row="1"]'`). `just look` cannot hover, so the ✏️ shown on hover while playing is checked only by tests. A full-page shot draws the floating banner (and other fixed or top-layer parts) where the page was scrolled to, so its top can be cut off in the picture: measure it with `--js` (`getBoundingClientRect`, `elementFromPoint`) before calling it broken.
   - The stand-in page (`tests/fake-dom.mjs`) knows simple selectors and lists of them; it does not know `[attr$=…]` (it silently matches the wrong element). Find such elements in the test with `.find()`. Nor does it give `textContent` for spans nested on one line of `index.html` (a toolbar tab reads `''`): check such labels against the page source. Its dialogs fire `close` at once, where a browser fires it as a task of its own, after whatever ran next: code that closes a dialog and opens it again at once (the PIN pad's "Once more") saw its late `close` end the new ask, unseen in tests (2026-10-19). Test such a flow with that dialog's `close` patched to dispatch in a `setTimeout` (`tests/profile-sheet.test.mjs`), or with `just look --js-file`. Its `style` keeps what `setProperty` set in `style.props` (`getPropertyValue` reads it back); it has no layout, so a test gives an element a `clientWidth` (`Object.defineProperty(el, 'clientWidth', { get: () => 300 })`, as `tests/lines.test.mjs` and `tests/beat-bar.test.mjs` do); `textContent` is a plain field, not its children's text. `settle()` never waits for a `setInterval`, so a stand-in must keep the state an interval reads: a fake `audio.start` that skipped `audio.playing` let the sheet's 150 ms play watch end 👂 Plain on a slow run (2026-10-16). Compare its elements with `assert.ok(a === b)`, never `assert.equal`: a failing `equal` prints the whole stand-in page, runs out of memory and dies by SIGKILL with no test reported (2026-10-18).
   - ⌨️ Keys is remembered per device, and the widths of a look run share `localStorage`: a view on Beats says `keys: true` (the `builder-*` views, `keys-on`) or not, and `just look` sets it before the view's script. In a test, `keysOn(page)` / `keysOff(page)` (`tests/new-beat.mjs`); turn it off before the test ends.
   - Then read the screenshots it prints: nothing overlaps, and lines of buttons fill the width or sit deliberately. The script cannot judge that.
   - Each run is a fresh device: one board with a random fun name and picture, and no recorded sounds. The widths of one run share `localStorage`, so make `--js` set a state, not toggle one: a `.click()` that opened preset groups at 320 closed them again at 375 (2026-10-11). Open a group only if `aria-expanded` is not `"true"`.
   - Use the shared browser pane only for what needs a real click or sound. There, start the `soundboard-pr` config from `.claude/launch.json` (port 8781); `soundboard` (port 8765) is Ben's.
3. **Audio needs a real tap.** A script's `click()` cannot start the AudioContext until the page has had a real user gesture. Press Play with a real click first, then drive the rest from script.
4. **Parallel agents share the browser pane.** Always pass your own `tabId` to every browser call; a call without one acts on the fronted tab, which another agent may be using (on 2026-10-11 one agent's navigate took over another's tab mid-check). A background tab is hidden, so `ResizeObserver` and `requestAnimationFrame` may not run there: re-measure after a resize instead of trusting a resize handler fired.
5. **The browser tool's `key` action clicks the page first.** That click can land on a button (it once pressed Play a second time). Send keys with `dispatchEvent(new KeyboardEvent(...))` instead.
6. **A finger's taps: `just taps`** (about 20 s; CI runs it on every push, the deploy checks on the live site). A phone in headless Chrome taps 🔊 Pads, 🎤 Live and 🧸 Kids, fresh, after 🛠️ Make and back, and after a freeze and thaw; each must sound. A change to how a tap plays runs it. Headless Chrome leaves a thawed page hidden, and a hidden page's audio never resumes: bring it to the front (2026-10-26).
7. **The live cloud: `just cloud-smoke` and `just cloud-e2e`** (about 4 s each; every deploy runs both). Smoke is the API round trip from Node; e2e is two devices syncing in headless Chrome on noodlepads.com. Each makes one throwaway profile (`p-smoke-…`, `p-e2e-…`) and deletes it in a `finally`. They prove who they are with `CHECKS_KEY` from the environment (deploy.yml passes the GitHub secret; on Ben's Mac, `cloud.json`'s `"checksKey"`, which `just deploy` requires before it uploads); once the Worker holds it, a run without it is refused (400 `id`). They test what is live, so run them after a deploy, not to check a change before it ships. A ❌ in e2e prints what each device asked `/api/` and its cloud log.

## Council

22 review agents, each a personality with one lens, check every change against the mission and their own area ([docs/council.md](docs/council.md), [ADR 0034](docs/adr/0034-agent-council.md)). They are an authority: a seat's ⛔ block stops a feature or a deploy until the seat lifts it or Ben decides.

- **Convene them by the change:** all seats on a new screen, control or layout (at the mockup, before building); the data seats on a stored format or the cloud; the one or two a fix touches. The table is in docs/council.md.
- **Brief them blind:** the change itself, never your reasoning or another seat's verdict. Run one round's seats in parallel.
- **A block against one of Ben's rules goes to Ben**: asked at once while he is in the chat, else a question card batched up front. Blocked work waits on its branch; move to the next TODO item.
- **Never a rollback:** a seat's finding on what is live is fixed forward, at once when the seat says it is urgent.
- **Results go into the work** (code, tests, docs, decisions, ADRs). No council log. Each commit carries a `Council:` trailer naming the seats and their verdicts.
- **A confident finding is built now, not listed.** Medium- or high-confidence findings are done straight away; low-confidence ones, a clash with `docs/decisions.md`, or a new screen or control go to Ben, and only his yes puts them in TODO.md.

## Ship

**A change to `web/` runs `just version` first and ships `web/version.js` with it:** the release (`1.0.<commit count>`) labels the deploy's `version.json` (`v1.0.215-4d5ef56`) and shows in About. `just ship`, `just land` (which restamps PATCH on a newer main) and CI refuse a `web/` change without it. It counts the commit about to be made, so run it before `git commit`, never with your commit already in `HEAD` (after a rebase, `git reset --soft HEAD~1`, then restamp and commit): run after, it counts your commit twice, and every push after it fails the version check (2026-10-26, `a83f8e9`).

**`just ship <message-file> <files…>`** does all of this in one go: tests, a throwaway worktree, commit and push, stopping at the first failure. GitHub deploys the push. Use it. What it does, for reference:

Commit straight to `main` through a throwaway worktree, so the main checkout never switches branch:

```
OLD=$(git rev-parse main); WT=.worktrees/main-$(date +%s)-$$
git worktree add -q --detach "$WT" main
# copy the changed files into $WT, then:
git -C "$WT" add -A && git -C "$WT" commit -q -F <message-file>
git update-ref refs/heads/main "$(git -C "$WT" rev-parse HEAD)" "$OLD"
git reset -q && git worktree remove "$WT" && git push -q origin main
```

- **Run it under `set -e`, with the file list in an array.** In zsh, `$FILES` does not split into words. On 2026-10-10 a commit silently failed that way and the deploy still ran.
- Write the message to a file made with `mktemp` and pass `-F`. Parallel agents share a scratchpad, and on 2026-10-11 one agent's fixed-name message file overwrote another's. A heredoc once lost a subject line (`b07fee1`; fixed by rewriting history on 2026-10-11, backup tag `backup/main-before-msgfix`).
- Messages: `<type>: <summary>` (feat, fix, style, refactor, docs, chore, test), a bullet body at the level a user notices, the `Council:` trailer ([docs/council.md](docs/council.md)) and the `Co-Authored-By` trailer.
- **GitHub deploys every push to `main`** (`.github/workflows/deploy.yml`): `just test` and the release checks, then the `pdxfixit/flarepress` action stamps `web/version.json`, uploads, and waits until the live site serves the new version (the app shows it in its corner), then `just deploy-checks` (cloud-smoke, cloud-e2e and taps). After a push, read that run. A red run after the upload means the new version is already live: read the ❌ line, fix forward, or roll back (docs/deploy-cloudflare.md). `just deploy` is Ben's fallback from his Mac; agents never run it.
- Never force-push `main`.
- **A file another session is also editing in this checkout** (`git status` shows changes you did not make): `just ship` copies whole files, so it would ship that session's half-done work. Ship by the steps above instead, `git apply` only your hunks in the worktree (`git diff <file>` split on `^@@`), and leave its files alone. On 2026-10-16 `styles.css` held both an agent's sheet-warning hunk and the Add-rows hunk.

**The cloud database.** A schema change is a new `worker/migrations/NNN-*.sql` plus the full `worker/schema.sql`, in the same commit; `tests/migrations.test.mjs` checks the two agree. The deploy applies it before the upload (`just cloud-migrate --yes` in deploy.yml; Ben, 2026-10-26), so keep migrations additive: the old Worker runs on the new tables until the upload. A `DROP TABLE` in a migration is refused while D1 holds rows the telemetry mirror lacks (2026-10-16: 005 dropped 77 unharvested rows); CI has no mirror, so such a deploy stops and the drop is Ben's, after `just pull` (a TODO "Ben does" line). Agents never write to the live database. They may read it without asking (`just cloud-sql`, `just cloud-profiles`, Ben 2026-10-12). Problem reports and metrics reach the Mac only through the telemetry runner's mirror (`telemetry.py pull`; Ben, 2026-10-16). Two write exceptions: the deploy checks use the live API with their own throwaway profiles, and `just cloud-prune --smoke --yes` removes what a killed check left (only `p-smoke-…`/`p-e2e-…` profiles over 10 minutes old, and their share codes). Third: a PIN reset when Ben asks for it in his own words (docs/how-to.md "Reset a forgotten PIN"; Ben, 2026-10-26). Prune, a migration that drops rows, and the like are Ben's.

**Landing an agent's commits: `just land <sha>…`**, or `just land` with no sha from the agent's worktree (its branch's commits). It is flarepress's shared tool (`tools/land.sh` there, run from the flarepress checkout beside this one; settings in `land.conf` here; Ben, 2026-10-17: every flarepress app lands the same way). It pulls main from GitHub first (fast-forward only; it stops when main here has diverged, or when the pull would overwrite uncommitted edits), cherry-picks in a throwaway worktree, resolves the list files, tests, pushes, then moves main and updates this checkout's copies of the touched files; GitHub deploys. A conflict it can't resolve stops it with the worktree kept and says where: resolve it there, then `just land-continue <worktree>` finishes the same way. When another session holds uncommitted edits to the same files here, it stops; `just land --wait <sha>…` (in the background) waits up to an hour for them to be committed, then lands on top. Do not write your own wait loop: one in zsh passed its file list as one word and fired early (2026-10-16). Never finish a landing by hand: a hand-run finish left deleted files in this checkout (2026-10-13), and once left it stale (2026-10-12).

**An agent's new ADR or new `web/` file can clash with what landed meanwhile.** `just land` stops on either: `tests/docs.test.mjs` on two ADRs with one number (renumber the later one, and every "ADR NNNN" naming it), `tests/offline.test.mjs` on a `web/` file missing from `web/sw.js` (2026-10-16).

**TODO.md conflicts on landing** are routine (each agent deletes its own line while others add theirs): flarepress's `tools/resolve_todo.py` keeps main's lines and applies the commit's own deletions and additions. By hand, from the flarepress checkout's `tools/`, it also works for end-of-file appends in `styles.css`. Read the result before continuing. `docs/questions.md` has its own, `resolve_questions.py`, which keeps both sides' cards. The docs keep a paragraph on one line, so two edits to it clash as whole lines: `resolve_words.py` merges them word by word and leaves a clash on the same words. `just land` runs all three, by `land.conf`'s `resolve=`.

**Cleaning up after agents: `just archive-agent <agent-id>`**, only once the agent has finished (never a live one: a new worktree looks almost empty). It refuses a dirty worktree or a commit not on `main` (matched by patch, then by subject, since landings cherry-pick), tags the tip `archive/<branch>`, then removes the worktree and branch. By hand, cleanups chained after a failed step deleted branches twice (2026-10-11, 2026-10-12).

## Conventions

### The code

- **No build step and no dependencies.** Modules load as they are. Tools are stdlib Python or plain shell. One exception: `tools/look.mjs` (with the `chrome.mjs` and `look-cloud.mjs` it loads) is Node with no packages, because driving headless Chrome needs a WebSocket client and stdlib Python has none (Ben, 2026-10-11).
- **The CSP in `web/_headers` allows only what the page loads.** No inline script or style, and no outside origin but Cloudflare's Web Analytics beacon (Ben, 2026-10-20): the fonts are served from `web/fonts/`. Adding one means changing that line on purpose.
- **No regex lookbehind (`(?<!…)`, `(?<=…)`) in `web/`:** Safari before 16.4 can't parse one, and the whole app stops loading. `tests/no-lookbehind.test.mjs` checks.
- **A new file in `web/` goes in `web/sw.js`'s `SHELL`** (or in `NOT_LOADED` in `tests/offline.test.mjs`, with why), or the app opens without it offline. The test names the file.
- **Pure logic goes in its own testable function** (`model.js`, `sequencer.js` exports, `names.js`). The DOM code calls it.
- **Stored formats are kept by users.** A change to IndexedDB needs an upgrade in `store.js` (`SCHEMA`, `upgradeStores`). A backup from 1.0 on (format `1.x`) must still load in a newer copy of the app ([ADR 0011](docs/adr/0011-backups-1-0-merge.md)).
- **Every preset plays at the same loudness** (Ben, 2026-10-23: Computer chirped far louder than the rest). After any change to `web/clips/kit/` or the kit in `boards.json` (a new sound, `just placeholders`, `kit_instruments.py`), run `just preset-loudness --fix`; `tools/test_preset_loudness.py` fails until you do. Turning a WAV file up or down changes nothing: the app plays every sound at the same peak, then its `level` turns it down. A level cannot turn a sound up, so a new sound far under the middle (the tool lists the quietest) needs remaking, not a level. `FLOOR` (8.5 dB under) fails the test for any preset below it that `UNDER_THE_FLOOR` in `tools/test_preset_loudness.py` does not list with why; a synthesized sound is remade louder by driving it harder in its `tools/make_placeholders.py` recipe (`drive`). A preset Ben hears as still too loud gets a line in `BY_EAR` in `tools/preset_loudness.py` (dB under the middle), never a hand-edited `level`. A real-world preset (an animal, a drum, a siren) is a recording, made by `tools/make_samples.py` (`HITS`) and credited in `web/clips/kit/LICENSE-samples.txt`; `make_placeholders.py` never makes it.
- **An Esc that closes, empties or lets go of something calls `preventDefault`** (2026-10-26): Esc is Stop all on the page (`app.js bindEvents`), which stands down only for a key already used. `tests/space-stops.test.mjs` checks every `'Escape'` handler in `web/`.
- **Settings are declared in `settings.js`** with a default and the allowed values. Backups carry them.
- **Anything remembered in `localStorage` gets a line in `tests/startup-remembered.test.mjs`**, which starts the app with every remembered choice set. A remembered DJ mode once stopped the app starting (2026-10-11).
- **Every control gets a tooltip** (Ben, 2026-10-12): `web/tooltips.js` adds one from its `aria-label` or text, so give an icon-only control an `aria-label`; write a `title` only when the tooltip should say more.
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

- **When Ben decides something, record it in [docs/decisions.md](docs/decisions.md) in the same commit**: one row, Rule and Why under 40 words.
- **A change to what the app collects or shows updates `docs/privacy-policy.md` in the same commit** (bump `updated:`; write the address as `{contact}`), then run `just policy` once it is on `main`: it hands the file to the privacy repo's own send script (tools/send.sh there), which copies it there and lands it (`--dry-run` stops before landing). The same in all four apps (Ben, 2026-10-27).
- **A replaced rule is deleted,** and the new rule takes its row. Do not add prose saying a rule changed.
- **A significant decision also gets an ADR** in [docs/adr/](docs/adr/README.md): anything that changes what the app is, a stored or backup format, the hosting, or is costly to undo.
- Never change a decision on your own. Recording Ben's answer, or fixing a row that does not match the code, is fine.
- **Keep [docs/architecture/](docs/architecture/README.md) true in the same commit** when you add, remove, merge or split an engine, a store, a scheduler, a record shape that crosses modules, a path off the device, or a module's job, or when you fix a seam it lists. `tests/architecture.test.mjs` checks its ✅ claims against the code. When that test fails, fix the doc as well as the test. Found something the doc lacks while you searched? Add it.
- Keep [docs/guide.md](docs/guide.md) true when behavior changes, [docs/layout.md](docs/layout.md) when a file is added, moved or removed, and README.md's short list when a whole part changes.

### Writing

- Answer first. Short sentences, plain words, tables for structured data.
- Say what a kid using the app would notice, then the reason.
- No "not X but Y" framing. Say what is true.

### Tooling

- Improve the tooling in every session, not only when asked. If a step was slow, repeated or easy to get wrong, fix it in `justfile` or `tools/` in its own commit. Propose bigger fixes with a time estimate. Say what each fix saves.
- `tools/` is stdlib Python or plain shell, except `look.mjs` and the two files it loads (Node, no packages; Ben, 2026-10-11). Do not add another Node tool or any npm package without asking. Node test helpers and reporters in `tests/` (such as `tests/file-end.mjs`) are test code, not tools (Ben, 2026-10-26).
- **Pay it forward.** Whatever cost you a search, a retry or a wrong turn, write down where the next agent will look first: this file, or the doc for that area.

## Working with Ben

**Answers and reports**
- Lead with the answer or the next action. Number multi-step work, give estimates in minutes, keep lists to 5 items, and end with the one next step Ben can take.
- Verify before you assert: check the file, the test output, the live `version.json`. Say "likely cause" until a cause is proven.
- Call agents agents, never people.
- State errors plainly: the cause and the fix.

**Questions**
- For a real judgement call (layout, naming, what a control does), name the options, recommend one, and ask. For a change across several files, give a numbered plan and wait for Ben's OK.
- **Mockups first for a new screen, a new layout or a moved control** (Ben, 2026-10-12): show them (an HTML widget or `just look` screenshots of a draft) and get his OK before building. Fixes and restyles inside an agreed design don't need one.
- **While Ben is in the chat, ask each question as it comes up**, one at a time, and act on the answer (Ben, 2026-10-26: "so that we can solve them instead of a whole bunch at once"). **Before a long build he won't watch, ask every decision up front, in one batch** (Ben, 2026-10-10: "ask questions up front so that you're able to run autonomously longer"). Then run; make the smaller calls yourself and name them in your report, without logging them anywhere (Ben, 2026-10-12: "no need for them to be logged").
- Every question explains itself: what the thing is, where it shows, and what each option changes and costs.
- Ben often answers mid-task. Fold the answer in and say how.

**Doing the work**
- **Use the cheapest model that does the job** (Ben, 2026-10-27): Haiku for searches, docs and small reviews; Sonnet for code and council seats; the strongest model only for design or a hard bug. Pass `model` when starting an agent.
- **Delegate independent work to background agents** in their own worktrees (Ben prefers it: he keeps talking while work runs). Brief each with what to read and what not to touch, then land their commits with `just land` from the main checkout and archive their branches.
- **Record every request the moment it arrives:** a line in [TODO.md](TODO.md) "Agents do", or in [docs/state.md](docs/state.md) "In flight" if you start at once. A request said only in chat is lost when the session ends. Delete the line when the work lands.
- When your task is done, work down "Agents do", quickest first, one commit each.
- Commit and push to `main` without asking; GitHub deploys every push. Ben asked for a deploy after every commit.
- **A cloud session told to work on a `claude/…` branch pushes to `main` too** (Ben, 2026-10-19: "merge to main going forward too"). This line is his explicit permission. Push the branch, then, once `just test` is green, fast-forward `main` to it (`git fetch origin main`, rebase onto it if `main` moved, test again, `git push origin HEAD:main`). Never force-push. Then read the deploy run.
- **Medium- or high-confidence work goes ahead without asking** (Ben, 2026-10-26): fixes, a council seat's asked-for changes and its "beyond this change" findings. Ask only on low confidence, a clash with `docs/decisions.md`, or a new screen or control (mockup first). Name the calls you made in your report.
- Make obvious non-breaking fixes (dead code, a stale comment, a missing label) rather than listing them. Propose instead when it changes what a kid sees.

**Working while Ben is away**
- Do not stop to ask. Pick the option closest to [docs/decisions.md](docs/decisions.md), name the call in your report, and keep going. [docs/questions.md](docs/questions.md) is only for questions that need Ben's answer before work can go on.
- Keep [TODO.md](TODO.md) fresh in the same commit: delete Ben's items that are done (never tick them: Ben, 2026-10-26) and moot ones, and add new things only Ben can do under "Ben does".
- **Wrangler first, Ben last** (Ben, 2026-10-26): before asking Ben to do anything in Cloudflare, do it with wrangler through the deploy: a binding, rate limiter, Worker secret, route or cron in `site/wrangler.toml`, or a `wrangler` step in `.github/workflows/deploy.yml` (it holds the token; agents never do). Ask Ben only for what wrangler can't reach: the token's own permissions, zone WAF rules, GitHub secrets. Say why when you ask.
- **Keep human-run tests to a minimum** (Ben, 2026-10-16): verify it yourself with tests, `just look` and the live checks. Add no device tries to "Ben does"; what only a person can judge (sound, real touch) stays as "not yet tried on a phone" in [docs/state.md](docs/state.md), and Ben reports tries as he goes.

## Privacy

The site is public. Anyone can load every file under `web/` (at noodlepads.com). Sounds recorded in the app stay in the browser that made them until their person is put in the cloud ([ADR 0002](docs/adr/0002-cloud-profiles-on-one-worker.md)); then they are stored in D1 and anyone with a sound's link can play it, and the profile list is public. They also leave in a backup someone saves. The disclosure in `web/privacy.js` must stay true: change it in the same commit as any change to what the cloud stores or shows, and change `docs/privacy-policy.md` and README's copy with it (`tests/privacy.test.mjs` fails until the three agree). Bump the policy's `updated:` date when its words change. The test `tests/privacy.test.mjs` keeps the policy well formed (front matter, a real date, no address, the `@include` lines); set `PRIVACY=/path` to check its `@include` lines against the privacy checkout.

**No kids' names anywhere in the repo** (Ben, 2026-10-11): not in code, tests, tools, file names, docs or commit messages. Write "a kid" or "the kids"; tests make up names (Pip, Juno, Toby, Wren). "Sandberg Family" is the most private detail allowed. `boards.json` lists no people. No test checks this; the rule is enough (Ben, 2026-10-28: "the kids' names are long out of the codebase"). Write no capitalized everyday word or product name that could be a first name. Before a real voice clip goes into `web/clips/`, remember it becomes public.

📮 Problem reports (on by default since 2026-10-26, per device; one switched off stays off) send the event log to `/api/log`, cleaned by `web/log-clean.js`: no audio, no names. A new `logEvent` kind or field sends nothing until it has a rule in `RULES` there, and `tests/log-clean.test.mjs` fails until it does. Never add a free-text field without `text` (redaction).
