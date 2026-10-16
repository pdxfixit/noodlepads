# Noodle Pads 🔊

A family soundboard web app: tap a pad to play a sound, hold it to loop, record your own, add silly voices, and make beats. Plain HTML, CSS and ES modules, no build step and no dependencies.
Live and **public** at https://noodlepads.com/. Repo: `github.com/pdxfixit/noodlepads` (**public**: everything committed is world-readable), in `~/src/noodlepads`. Release 1.0 started this repo from one commit; what 1.0 has is in [CHANGELOG.md](CHANGELOG.md). This is **v1**, a web prototype; v2 is a native Android app ([ADR 0001](docs/adr/0001-web-prototype-then-native.md)).

This file is the contract: how to start, how to verify and ship, and the rules for working here. It stays short. Detail lives in the files it points to.

## TL;DR

- **Start:** `just doctor`: are you in the main checkout or a worktree, are the tools there, is `main` live. Then the cold start below.
- **Test:** `just test` (syntax check, then Node's built-in test runner; nothing to install).
- **Run:** `just serve`, then http://localhost:8765/. Port 8765 is Ben's own server; agents preview on 8781 (see [Verify](#verify)).
- **Ship:** `just ship`, from the main checkout only. In a worktree, commit on your branch and report the commits; they are landed with `just land` ([docs/how-to.md](docs/how-to.md)). Every push to `main` is deployed by GitHub (`.github/workflows/deploy.yml`, [ADR 0025](docs/adr/0025-github-deploys.md)): tests, the migration guard, deploy, then the live cloud checks. Agents never deploy and hold no Cloudflare token; after a push, read the deploy run.
- **Every change fits every screen:** check 320, 375, 700, 900 and 1100 px wide, then the wide screens 1366, 1920, 2560 and 3440, with no sideways scroll. `just look --wide` does all nine in your own headless Chrome ([Verify](#verify)).
- **Anything that comes in is untrusted:** backups, uploaded files and `boards.json` are checked and capped ([docs/guide.md](docs/guide.md) "Limits on what comes in").

## Cold start: read in this order

1. **This file.**
2. [docs/state.md](docs/state.md): where things stand now: what is live, work in flight or parked, what waits on Ben.
3. [docs/decisions.md](docs/decisions.md): every rule Ben has decided that is true today. Read the sections your task touches. It outranks every other doc.
4. [docs/questions.md](docs/questions.md): open questions. Look first for answers Ben typed in.
5. [TODO.md](TODO.md): the one to-do list. "Agents do" is approved agent work, in order; "Ben does" is what only Ben can do.
6. [docs/how-to.md](docs/how-to.md): step by step for your kind of task (a fix, a stored-format change, docs, landing, deploy and rollback, the cloud), then the doc it needs from the table below.

**Leave the next session a warm start.** A session may be a cloud session with only this repo: no chat history, no memory folder. Whatever the next agent needs must be in a file here. Update [docs/state.md](docs/state.md) in the same commit whenever what is live or in flight changes. If the chat taught you a standing rule, add it here, not only to a local memory.

## Where things are

| File | What it holds |
|---|---|
| [README.md](README.md) | The public front page: what it is, the live link, screenshots, run and test it, every `just` recipe ("Running it yourself"), the privacy statement. |
| [docs/guide.md](docs/guide.md) | How the app works: every screen, how things are stored, cloud profiles, keyboard use, limits on what comes in. |
| [docs/layout.md](docs/layout.md) | The file map: one line per file in `web/`, `worker/` and `tools/`. |
| [docs/state.md](docs/state.md) | Where things stand now. Present tense only. |
| [docs/decisions.md](docs/decisions.md) | Current rules, by topic: Rule · Why · Since. |
| [docs/adr/](docs/adr/README.md) | Why the biggest decisions were made. |
| [docs/questions.md](docs/questions.md) | Open questions for Ben, one card each. |
| [docs/how-to.md](docs/how-to.md) | Step by step: where to run what, a bug fix, a stored-format change (every place to touch), docs, landing, deploy and rollback, logs, metrics, cloud admin. |
| [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) | Hosting: flarepress, the Worker, headers, rollback. |
| [CHANGELOG.md](CHANGELOG.md) | What each release has, for kids and parents. |
| [TODO.md](TODO.md) | The one to-do list: "Agents do" (approved work, in order, then work offered but not approved) and "Ben does" (tries, decisions, recordings). |
| `web/` | The app. Each module opens with a comment saying what it owns. |
| `tests/` | `node --test` suites. `fake-dom.mjs` builds the page from `index.html` so `app.test.mjs` runs the real app. |
| `tools/` | One line each in [docs/layout.md](docs/layout.md): `doctor.sh` (`just doctor`), `serve.py` (dev server, sends the live headers), `look.mjs` (`just look`, and the live checks), `land.sh` (`just land`, `land-continue`), `resolve_todo.py`/`resolve_questions.py` (its conflict resolvers), `cloud_admin.py` and `logs.py` (the cloud database and problem reports). `just --list` says what every recipe does. |

## Verify

1. **`just test`** must be green. To run one file, use `node --test --test-force-exit <file>`: a test that starts the app never exits without the flag, and looks hung. Every change ships with a test that fails without it. Prove that with `just prove <test file> <changed files…>`: it runs the test against the committed copies, then puts yours back (a `tools/test_*.py` too, under unittest). Where something cannot be tested here (sound, the microphone, IndexedDB, layout), say so. Judge it by the exit code, never by grepping for ✖: a syntax error stops it at `node --check` before any test runs, so a grep finds nothing and looks green (2026-10-11). GitHub runs `just test` on every push (`.github/workflows/test.yml`); after a push, read the run (`gh run list --limit 3`) and fix a red one first.
2. **Look at it in a browser** for anything a user sees. The tests have no browser.
   - **`just look [pads|beats|keys-on|song|live] [--js CODE]`** does the width check in your own headless Chrome, on its own server and port, so it never touches another agent's tab. At **320, 375, 700, 900 and 1100** px (`--wide` adds **1366, 1920, 2560 and 3440**) it reports sideways scroll (page or open sheet), console errors, CSP blocks and buttons under 44 px tall, saves a full-page screenshot of each, and exits 1 on any failure. `--js` runs first, to open a sheet or a mode (`just look beats --js 'document.querySelector("#seq-grooves").click()'`). A longer script goes in a file: `--js-file PATH` (top-level `await` works; no shell quoting). Named views open common sheets for you: `just look sheet-edit` is a pad's sound sheet; `edit-groups`, `edit-chosen` and `bulk-move` show ✏️ Edit sounds with six made-up sounds of a kid's own in groups (a look device has none); `just look --help` lists every view. Check there before writing `--js`. The page's pattern is random per load; `--bg dots` (or `all`, one shot each, or `none`) fixes it. A `console.log` in `--js` prints under the table (📝), so measure positions there instead of reading them off a screenshot. A long page's full-page shot is too tall to read at a phone width: `--scroll-to SELECTOR` takes an 800 px window with that element near the top, at every width (`just look beat-groove --scroll-to '.seq-row[data-row="1"]'`). `just look` cannot hover, so the ✏️ shown on hover while playing is checked only by tests.
   - The stand-in page (`tests/fake-dom.mjs`) knows simple selectors and lists of them; it does not know `[attr$=…]` (it silently matches the wrong element). Find such elements in the test with `.find()`. Nor does it give `textContent` for spans nested on one line of `index.html` (a toolbar tab reads `''`): check such labels against the page source.
   - ⌨️ Keys is remembered per device, and the widths of a look run share `localStorage`: a view on Beats says `keys: true` (the `builder-*` views, `keys-on`) or not, and `just look` sets it before the view's script. In a test, `keysOn(page)` / `keysOff(page)` (`tests/new-beat.mjs`); turn it off before the test ends.
   - Then read the screenshots it prints: nothing overlaps, and lines of buttons fill the width or sit deliberately. The script cannot judge that.
   - Each run is a fresh device: one board with a random fun name and picture, and no recorded sounds. The widths of one run share `localStorage`, so make `--js` set a state, not toggle one: a `.click()` that opened preset groups at 320 closed them again at 375 (2026-10-11). Open a group only if `aria-expanded` is not `"true"`.
   - Use the shared browser pane only for what needs a real click or sound. There, start the `soundboard-pr` config from `.claude/launch.json` (port 8781); `soundboard` (port 8765) is Ben's.
3. **Audio needs a real tap.** A script's `click()` cannot start the AudioContext until the page has had a real user gesture. Press Play with a real click first, then drive the rest from script.
4. **Parallel agents share the browser pane.** Always pass your own `tabId` to every browser call; a call without one acts on the fronted tab, which another agent may be using (on 2026-10-11 one agent's navigate took over another's tab mid-check). A background tab is hidden, so `ResizeObserver` and `requestAnimationFrame` may not run there: re-measure after a resize instead of trusting a resize handler fired.
5. **The browser tool's `key` action clicks the page first.** That click can land on a button (it once pressed Play a second time). Send keys with `dispatchEvent(new KeyboardEvent(...))` instead.
6. **The live cloud: `just cloud-smoke` and `just cloud-e2e`** (about 4 s each; every deploy runs both). Smoke is the API round trip from Node; e2e is two devices syncing in headless Chrome on noodlepads.com. Each makes one throwaway profile (`p-smoke-…`, `p-e2e-…`) and deletes it in a `finally`. They test what is live, so run them after a deploy, not to check a change before it ships. A ❌ in e2e prints what each device asked `/api/` and its cloud log.

## Ship

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
- Messages: `<type>: <summary>` (feat, fix, style, refactor, docs, chore, test), a bullet body at the level a user notices, and the `Co-Authored-By` trailer.
- **GitHub deploys every push to `main`** (`.github/workflows/deploy.yml`): `just test`, `just deploy-migrated` (stops while a migration is not applied: migrating is Ben's), then the `pdxfixit/flarepress` action stamps `web/version.json`, uploads, and waits until the live site serves the new version (the app shows it in its corner), then `just deploy-checks` (cloud-smoke and cloud-e2e). After a push, read that run. A red run after the upload means the new version is already live: read the ❌ line, fix forward, or roll back (docs/deploy-cloudflare.md). `just deploy` is Ben's fallback from his Mac; agents never run it.
- Never force-push `main`.

**The cloud database.** A schema change is a new `worker/migrations/NNN-*.sql` plus the full `worker/schema.sql`, in the same commit; `tests/migrations.test.mjs` checks the two agree. Ben applies it with `just cloud-migrate --yes` right before the deploy that needs it (add that to TODO "Ben does"). Agents never write to the live database. They may read it without asking (`just cloud-sql`, `just cloud-profiles`, Ben 2026-10-12). Problem reports and metrics reach the Mac only through the telemetry runner's mirror (`telemetry.py pull`; Ben, 2026-10-16). Two write exceptions: the deploy checks use the live API with their own throwaway profiles, and `just cloud-prune --smoke --yes` removes what a killed check left (only `p-smoke-…`/`p-e2e-…` profiles over 10 minutes old, and their share codes). Migrate, prune, reset PIN and the like are Ben's.

**Landing an agent's commits: `just land <sha>…`.** It cherry-picks them onto main in a throwaway worktree, resolves TODO.md, tests, moves main, updates this checkout's copies of the touched files and pushes; GitHub deploys. A conflict it can't resolve stops it with the worktree kept and says where: resolve it there, then `just land-continue <worktree>` finishes the same way (`tools/land.sh`). Never finish a landing by hand: a hand-run finish left deleted files in this checkout (2026-10-13), and once left it stale (2026-10-12).

**TODO.md conflicts on landing** are routine (each agent deletes its own line while others add theirs): `python3 tools/resolve_todo.py TODO.md` keeps main's lines and applies the commit's own deletions and additions. It also works for end-of-file appends in `styles.css`. Read the result before continuing. `docs/questions.md` has its own: `python3 tools/resolve_questions.py docs/questions.md` keeps both sides' cards; `just land` runs both.

**Cleaning up after agents: `just archive-agent <agent-id>`**, only once the agent has finished (never a live one: a new worktree looks almost empty). It refuses a dirty worktree or a commit not on `main` (matched by patch, then by subject, since landings cherry-pick), tags the tip `archive/<branch>`, then removes the worktree and branch. By hand, cleanups chained after a failed step deleted branches twice (2026-10-11, 2026-10-12).

## Conventions

### The code

- **No build step and no dependencies.** Modules load as they are. Tools are stdlib Python or plain shell. One exception: `tools/look.mjs` (with the `chrome.mjs` and `look-cloud.mjs` it loads) is Node with no packages, because driving headless Chrome needs a WebSocket client and stdlib Python has none (Ben, 2026-10-11).
- **The CSP in `web/_headers` allows only what the page loads.** No inline script or style, and no outside origin: the fonts are served from `web/fonts/`. Adding one means changing that line on purpose.
- **Pure logic goes in its own testable function** (`model.js`, `sequencer.js` exports, `names.js`). The DOM code calls it.
- **Stored formats are kept by users.** A change to IndexedDB needs an upgrade in `store.js` (`SCHEMA`, `upgradeStores`). A backup from 1.0 on (format `1.x`) must still load in a newer copy of the app ([ADR 0011](docs/adr/0011-backups-1-0-merge.md)).
- **Settings are declared in `settings.js`** with a default and the allowed values. Backups carry them.
- **Anything remembered in `localStorage` gets a line in `tests/startup-remembered.test.mjs`**, which starts the app with every remembered choice set. A remembered DJ mode once stopped the app starting (2026-10-11).
- **Every control gets a tooltip** (Ben, 2026-10-12): `web/tooltips.js` adds one from its `aria-label` or text, so give an icon-only control an `aria-label`; write a `title` only when the tooltip should say more.
- **A new or renamed control gets its line in ❓ Help** (`web/help.js`). `tests/help.test.mjs` fails when Help draws a label the app no longer has. A feature still in flight can have its line written ahead, marked `soon` (hidden).
- **Destructive actions ask first:** the first tap turns the button red and asks ("Remove?"), and the second tap does it. Where a slip costs work, offer Undo too.
- Comments say what the code is for and why, in plain sentences, at the density of the file around them.

### Screens

Ben: *"Optimizing the user interface for a variety of screens is very important."*

- Phones are the main device. Design at 375 px first, then check 320 up to 1100, and the wide screens up to 3440 (`just look --wide`).
- Wide screens fill, then split (Ben): content fills up to 2400 px, centered beyond; from 1400 px a screen's two natural parts sit side by side. The rules are at the end of `styles.css` (Wide screens).
- Lines of controls fill the width on phones. Nothing scrolls sideways.
- Touch targets are at least 44 px.
- The `just test` contrast suite checks text on every color the app uses. Keep it green when you add a color.

### Decisions and docs

- **When Ben decides something, record it in [docs/decisions.md](docs/decisions.md) in the same commit**: one row, Rule and Why under 40 words.
- **A replaced rule is deleted,** and the new rule takes its row. Do not add prose saying a rule changed.
- **A significant decision also gets an ADR** in [docs/adr/](docs/adr/README.md): anything that changes what the app is, a stored or backup format, the hosting, or is costly to undo.
- Never change a decision on your own. Recording Ben's answer, or fixing a row that does not match the code, is fine.
- Keep [docs/guide.md](docs/guide.md) true when behavior changes, [docs/layout.md](docs/layout.md) when a file is added, moved or removed, and README.md's short list when a whole part changes.

### Writing

- Answer first. Short sentences, plain words, tables for structured data.
- Say what a kid using the app would notice, then the reason.
- No "not X but Y" framing. Say what is true.

### Tooling

- Improve the tooling in every session, not only when asked. If a step was slow, repeated or easy to get wrong, fix it in `justfile` or `tools/` in its own commit. Propose bigger fixes with a time estimate. Say what each fix saves.
- `tools/` is stdlib Python or plain shell, except `look.mjs` and the two files it loads (Node, no packages; Ben, 2026-10-11). Do not add another Node tool or any npm package without asking.
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
- **Before a long build, ask every decision up front, in one batch** (Ben, 2026-10-10: "ask questions up front so that you're able to run autonomously longer"). Then run; make the smaller calls yourself and name them in your report, without logging them anywhere (Ben, 2026-10-12: "no need for them to be logged").
- Every question explains itself: what the thing is, where it shows, and what each option changes and costs.
- Ben often answers mid-task. Fold the answer in and say how.

**Doing the work**
- **Delegate independent work to background agents** in their own worktrees (Ben prefers it: he keeps talking while work runs). Brief each with what to read and what not to touch, then land their commits with `just land` from the main checkout and archive their branches.
- **Record every request the moment it arrives:** a line in [TODO.md](TODO.md) "Agents do", or in [docs/state.md](docs/state.md) "In flight" if you start at once. A request said only in chat is lost when the session ends. Delete the line when the work lands.
- When your task is done, work down "Agents do", quickest first, one commit each.
- Commit and push to `main` without asking; GitHub deploys every push. Ben asked for a deploy after every commit.
- Make obvious non-breaking fixes (dead code, a stale comment, a missing label) rather than listing them. Propose instead when it changes what a kid sees.

**Working while Ben is away**
- Do not stop to ask. Pick the option closest to [docs/decisions.md](docs/decisions.md), name the call in your report, and keep going. [docs/questions.md](docs/questions.md) is only for questions that need Ben's answer before work can go on.
- Keep [TODO.md](TODO.md) fresh in the same commit: tick Ben's items that are done, delete moot ones, and add new things only Ben can do under "Ben does".

## Privacy

The site is public. Anyone can load every file under `web/` (at noodlepads.com). Sounds recorded in the app stay in the browser that made them until their person is put in the cloud ([ADR 0002](docs/adr/0002-cloud-profiles-on-one-worker.md)); then they are stored in D1 and anyone with a sound's link can play it, and the profile list is public. They also leave in a backup someone saves. The disclosure in `web/privacy.js` must stay true: change it in the same commit as any change to what the cloud stores or shows.

**No kids' names anywhere in the repo** (Ben, 2026-10-11): not in code, tests, tools, file names or docs. Write "a kid" or "the kids"; tests make up names (Pip, Juno, Toby, Wren). "Sandberg Family" is the most private detail allowed. `boards.json` lists no people. `tests/no-names.test.mjs` checks every tracked file; the old address is known in code only by a hash. Before a real voice clip goes into `web/clips/`, remember it becomes public.

📮 Problem reports (off by default, per device) send the event log to `/api/log`, cleaned by `web/log-clean.js`: no audio, no names. A new `logEvent` kind or field sends nothing until it has a rule in `RULES` there, and `tests/log-clean.test.mjs` fails until it does. Never add a free-text field without `text` (redaction).
