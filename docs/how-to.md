# How to

Step by step for the common jobs, so a fresh session never has to guess. [AGENTS.md](../AGENTS.md) has the rules; this file has the order to apply them in. Start every session with `just doctor`: it says whether you are in the main checkout or a worktree, checks just, node, python and Chrome, and compares what is live with `main`.

## Where you run things

| You are in | You may | You may not |
|---|---|---|
| A worktree (`.claude/worktrees/agent-…`, or a branch of your own) | Edit, `just test`, `just prove`, `just look`, commit on your branch | `just ship`, `just land`: they move and push `main` from the **main checkout**. Report your commits; the session that started you lands them. |
| The main checkout (`~/src/noodlepads`, on `main`) | All of the above, plus `just ship`, `just land` (GitHub deploys the push) | `just deploy`: Ben's fallback from his Mac; agents never deploy. |
| A cloud session | Edit, `just test`, `just prove`, `just look`, commit, push a branch | Deploy, the live checks (they need no token, but run them after GitHub's deploy). Say so in your report, and what is unchecked. |

**A cloud session's push to `main`, when `main` moved meanwhile:** commit first, then `git rebase origin/main`, then `just version` for the new count (it stamps for the *next* commit, so set PATCH to `git rev-list --count HEAD` and amend), test again, push. Never stash uncommitted work around a rebase: on 2026-10-24 a `git stash pop` conflicted in `web/version.js` inside a `|| { … }`, where `set -e` does not stop, and the commit after it held conflict markers (caught before the push).

## A bug fix in `web/`

1. **Find the module.** [layout.md](layout.md) lists every file; each module's opening comment says what it owns. `grep -rn` for the label the kid sees (it is in `index.html` or the module that draws it).
2. **Write the failing test first.** Put it in the test file for that module (`tests/<module>.test.mjs`, or the nearest by name). Pure logic is tested directly. Anything on screen starts the real app on the stand-in page: `installPage({ manifest: testManifest() })` from `tests/fake-dom.mjs` and `tests/test-board.mjs`, then `await import('../web/app.js')` and `await page.settle()` (see `tests/tooltips.test.mjs`). Other helpers: `tests/new-beat.mjs` (a beat with a row; `keysOn`/`keysOff`), `tests/song-ui.mjs` (the playlist), `tests/fake-idb.mjs` (a device with data already saved), `tests/helpers.mjs` (zips, audio buffers).
3. **Fix it.** Run one file with `node --test --test-force-exit tests/<file>`.
4. **Prove it:** `just prove tests/<file> web/<changed files…>` must say ✅ (fails without your change, passes with it).
5. **`just test`**, judged by its exit code. A test that times out once under the full run's load and passes alone three times is a flake: say so in your report, do not hide it.
6. **Look at it** if a kid would see it: `just look <screen or view>` (and `--wide` for layout), then read the screenshots. `just look --help` lists the views; the `VIEWS` table in `tools/look.mjs` says what each opens.
7. **`just version`**, and commit `web/version.js` with the change: every change to `web/` bumps the release (PATCH is the commit count). `just ship`, `just land` and CI refuse one without it.
8. **Docs in the same commit:** [guide.md](guide.md) if behavior changed ([layout.md](layout.md) for a new file); docs/state.md if what is live changed; the ❓ Help line (`web/help.js`) if a control's label changed.
9. **Convene the council:** the seats [council.md](council.md) "When it convenes" names for the change (a fix: the one or two seats it touches), briefed blind with the change itself. Fold what they find into the work, and add the `Council:` trailer above `Co-Authored-By` (`Council: none (fix)` when no seat reviewed it).
10. **Ship it** from the main checkout: `just ship "$msg" <files…>`, with the message in a `mktemp` file. From a worktree: commit on your branch and report the commits.

## Flaky tests

A test that fails under a full `just test` and passes alone is usually a fixed wait that a busy machine outruns.

`page.settle()` is not one (since 2026-10-13). It waits until the stand-in page has nothing in flight, then fails after 10 s naming what was still pending. In flight means: a fetch, a `crypto.subtle` call (a PIN hash), a one-shot timer due within 20 ms (an app step, a fake IndexedDB step), and any timer a stand-in (`tests/fake-*.mjs`) sets. Repeating work (intervals, and timers set inside an interval's tick) and the app's later timers (a hold, a fade, an Undo offer) do not count: wait for those yourself. The rule is written at "Work in flight" in `tests/fake-dom.mjs`. A new kind of off-thread work the app starts (a Worker, a decode) needs a line there, or settle() will not wait for it.

1. **Reproduce under load.** `just stress` (`tools/stress.sh`) runs the full suite 10 times with 6 cores kept busy and counts the failing runs (`just stress 20 8 tests/<file>` for one file). One file alone rarely fails; the full run's parallel processes are the load. Before 2026-10-12, 3 of 10 such runs failed. To make a suspected step slow on purpose, preload a wrapper: `node --import ./slow.mjs --test --test-force-exit tests/<file>` where `slow.mjs` delays that step (a hash, a zero-delay timer, a fake IndexedDB step) by 60 ms.
2. **Wait for the condition, never a longer time.** The app: `await (await import('../web/app.js')).ready` before the first tap (`tests/app-ready.test.mjs` checks every file). Then `page.settle()` after each action.
3. Fixed waits that are safe: waiting for one of the app's own timers (the sequencer's 25 ms tick, a hold) with a longer one set after it. Node fires timers in order of when they are due, however late.

## A new feature that touches what is stored

**Convene the council** first, the seats [council.md](council.md) "When it convenes" names: for a stored format or the cloud, architect, storage and sync, privacy and safety, security and parent, on the plan and again on the finished change; for anything a kid sees, all of them, at the mockup. The commit carries the `Council:` trailer above `Co-Authored-By`.

Work down this list; each line names the place and the test that catches a miss.

| If you add or change… | Change | Caught by |
|---|---|---|
| An IndexedDB store or index | `web/store.js` `SCHEMA` (a new `since`; `upgradeStores` brings old devices up), `web/state.js` (loading and saving it) | `tests/store.test.mjs` |
| A field on a stored record | The record's cleaner in `web/backup.js` (`cleanBackup` checks everything that comes in: backups, older sounds found, cloud pulls). Leave a default out of the record ("left out at normal"), as `volume` and `pinned` are | `tests/backup.test.mjs` |
| A new kind of record | `web/backup.js` (write, clean, `MAX_RECORDS`, the words in the notice), `web/merge.js` (`STORES`, counts), `web/merge3.js` (`STAMPED`, field rules), `web/cloud-sync.js` `CLOUD_KINDS` and `worker/cloud.js` `KINDS` (the same list), `web/reid.js` `PERSON_STORES`, `web/model.js` `KIND_EMOJI`, `web/state.js`, `web/cloud.js`, `web/backup-ui.js`. Commit `a5f2414` (key layouts) is a worked example | `tests/kinds.test.mjs`, `tests/cloud-sync.test.mjs`, `tests/merge.test.mjs` |
| The backup format | A newer app must still load every `1.x` backup (ADR 0011). A format change is an ADR | `tests/backup.test.mjs` |
| What the cloud stores or shows | `worker/` and, in the same commit, the disclosure in `web/privacy.js` | `tests/privacy.test.mjs` |
| A D1 table or column | A new `worker/migrations/NNN-*.sql` plus the full `worker/schema.sql`; the deploy applies it before the upload, so keep it additive (a drop of rows is Ben's: a "Ben does" line). The Worker should skip the new part while the table is missing (as `worker/metrics.js` does) | `tests/migrations.test.mjs` |
| A `logEvent` kind or field | A rule in `RULES`, `web/log-clean.js` (free text only through `text`) | `tests/log-clean.test.mjs` |
| A feature worth counting | Nothing to add for a screen, dialog or control: `web/track-page.js` already sends `screen.view`, `dialog.open` and `control.use` (ADR 0026). A thing made in one step is a `content.finish` kind in `contentOf`; play (pads, keys, notes, blocks) is counted with `countPlay` (`web/play-count.js`), and sent as `noodlepads.play`. A new event name or details key needs its `EVENTS` line in `web/telemetry.js` and the same in pdxfixit/telemetry `events.toml` (listed first; `tests/telemetry.test.mjs` checks the two agree when that repo sits beside this one) | `tests/track-page.test.mjs` |
| Something remembered in `localStorage` | A line in `tests/startup-remembered.test.mjs` | that test |
| A setting | `web/settings.js` (default and allowed values; backups carry it) | `tests/settings.test.mjs` |
| A control | Its line in ❓ Help (`web/help.js`), an `aria-label` if it is icon-only (the tooltip comes from it, `web/tooltips.js`), 44 px tall | `tests/help.test.mjs`, `tests/tooltips.test.mjs`, `just look` |

A stored-format change is significant: it gets an ADR ([adr/README.md](adr/README.md)).

## A docs-only change

| What changed | Where it goes |
|---|---|
| Ben decided a rule | One row in [decisions.md](decisions.md), Rule and Why under 40 words, in the right section. A replaced rule's row is rewritten, never annotated. |
| Ben decided something big (what the app is, a stored format, hosting, costly to undo) | An ADR as well, listed in [adr/README.md](adr/README.md) and linked from the row. A changed decision rewrites its ADR in place. |
| What is live or in flight | [state.md](state.md), present tense, lines replaced, never appended. |
| How the app behaves | [guide.md](guide.md); a new file goes in [layout.md](layout.md). [README.md](../README.md) is the short front page: change it only when a whole part, a requirement or a recipe changes. |
| A question that blocks work until Ben answers | A card in [questions.md](questions.md). Smaller calls are never carded or logged: make them and name them in your report. When Ben answers, record it in decisions.md and delete the card in the same commit. |
| A request from Ben | A line in [TODO.md](../TODO.md) "Agents do" at once; delete it when the work lands. |
| A standing rule for agents | AGENTS.md if it is short and every session needs it; else the doc for that area, linked from AGENTS.md. |

`tests/docs.test.mjs` checks every relative link and that every ADR is in the index. `tests/no-names.test.mjs` checks no kid's name is anywhere. Commit with `docs:` and a `Council:` trailer (developer experience and docs steward review tooling and docs, or `Council: none (docs)`); a docs-only commit still deploys (the site is unchanged, so `deploy-verify` just sees the new commit).

## Landing other agents' work

From the main checkout:

1. Check the agent has finished: its final report arrived, and `git -C <worktree> status --porcelain` is empty.
2. `git log --oneline main..<branch>` lists its commits. `just land <sha>…` (flarepress's shared tool; `land.conf` here) pulls `main` from GitHub first, cherry-picks them in order, resolves the files `land.conf`'s `resolve=` names (`TODO.md`, `docs/adr/README.md`, `docs/questions.md`, the docs' long lines), restamps `web/version.js` to the new commit count (`after_pick=`), tests (a `web/` change without its `just version` stops here), pushes, moves `main`, updates this checkout's copies and GitHub deploys. From the agent's worktree, `just land` with no sha lands that branch's commits. Uncommitted edits here to a file it touches stop it before anything starts; `just land --wait <sha>…`, run in the background, waits up to an hour for that session's commit, then lands on top of it. Any other conflict stops it with `main` unchanged and the worktree kept, named in its message: resolve there (`git -C <wt> add …`, then `GIT_EDITOR=true git -C <wt> cherry-pick --continue`) and run `just land-continue <wt>`, which picks the rest, tests, moves `main`, syncs this checkout (deleted files too), pushes and deploys. Never finish a landing by hand.
3. Clean up with `just archive-agent <agent-id>` once it is on `main`: it checks the worktree is clean and every commit landed, tags `archive/<branch>`, then removes the worktree and branch.

## Deploy, live checks and rollback

- **Deploy:** GitHub, on every push to `main` (`.github/workflows/deploy.yml`, [ADR 0025](adr/0025-github-deploys.md)): `just test`, the release checks (`tools/version_bumped.sh`, `bump_version.py --check`), the `pdxfixit/flarepress` action (check, gate, stamp `web/version.json` as `v<release>-<commit>`, upload, wait for the live version), then `just deploy-checks`. After `just ship` or `just land`, read the run on GitHub, then `just live`. Ben's fallback is `just deploy` from his Mac (same steps, Keychain token). Detail: [deploy-cloudflare.md](deploy-cloudflare.md).
- **Finger taps:** `just taps` (CI runs it on every push; the deploy checks run it on the live site): every finger tap on 🔊 Pads, 🎤 Live and 🧸 Kids must sound, on a fresh device, after 🛠️ Make and back, and after a freeze and thaw; a covered pad must be logged as a silent tap. It reads the page with no user gesture (`evaluate()` lends one, which would start the audio for it). Its freeze step leans on headless-only calls (`Page.setWebLifecycleState`, `Page.bringToFront`) on GitHub's unpinned Chrome: a red `taps` on a push that didn't touch taps is fixed forward in the check, never by reverting the push.
- **Live checks:** `just cloud-smoke` (the API) and `just cloud-e2e` (two devices syncing in headless Chrome); each uses and deletes a throwaway `p-smoke-…`/`p-e2e-…` profile. A killed run's leftovers: `just cloud-prune --smoke --yes`.
- **Roll back a bad deploy:** a revert pushed to `main`; GitHub deploys it like any push. Never across an IndexedDB version bump (a new `SCHEMA` line in `web/store.js`, which raises `DB_VERSION`: devices that upgraded cannot open their database with the older code), so fix forward then. In a worktree, `git revert --no-commit <sha>…`, `just version` if it touches `web/`, `just test`, commit, then `just land` it. Never force-push `main`, deploy an old checkout or run `just deploy` for it. A schema migration is not undone by a revert: the Worker must cope with the newer tables. The steps: [deploy-cloudflare.md](deploy-cloudflare.md) "Rollback".
- **Dry run:** `just deploy-plan` runs `just deploy-check`, then validates and lists files, sending nothing.
- **What is live:** `just live`: status, cache headers, the live version, and whether it is main's `web/` and `worker/`.

## Problem reports, metrics and the cloud database

Agents may read the live database without asking (`just cloud-sql`, `just cloud-profiles`). They never write to it, except the deploy checks, `just cloud-prune --smoke --yes`, and a PIN reset Ben asks for (below); every other write is Ben's.

| Job | Command | Notes |
|---|---|---|
| Bring it home | `python3 ~/src/telemetry/telemetry.py pull` | The telemetry runner (pdxfixit/telemetry) is the only harvester: daily, flarepress's `tools/harvest.py` on `site/`. `pull` copies its store to `~/.local/state/telemetry/telemetry.sqlite3`, this Mac's one mirror of every app's data (ids a year at most). Nothing in this repo copies from D1. |
| Read problem reports | `just logs`, `--errors`, `<device code>`, `--json <key>`, `--grep`, `--sql` | Reads `noodlepads__reports` in the mirror, read only, as the views `uploads` and `events` (`tools/logs.py`); safe for agents. Until `site/harvest.conf` names reports (`docs/state.md`, To do), it says ⏳ and exits 0. |
| Weekly digest | `just logs --digest [--file-new TODO.md] [--mark]` | The `noodlepads-logs` recurrent leg (`skills/noodlepads-logs/`) runs it weekly, filing new errors in TODO.md; `--mark` records the date in `~/.local/state/noodlepads/logs-digest.json`. |
| Player metrics | `just cloud-stats [--days N]` | Run `telemetry.py pull` first (pdxfixit/telemetry). Reports per player from its store, `~/.local/state/telemetry/telemetry.sqlite3` (read only; the `noodlepads__` tables, and nothing else; ADR 0016): devices, places and activity. App-wide use (screens, controls, dialogs, errors, speed, play) is in `noodlepads_events__daily_events` (ADR 0026). Ask anything else with `sqlite3 ~/.local/state/telemetry/telemetry.sqlite3` (tables `noodlepads__activity`, `__devices`, `__players`, `__cf_*`; `__uses` is empty and `__visits` does not exist: they were dropped from D1 before any harvest, ADR 0027). |
| Profiles | `just cloud-profiles`, `just cloud-prune [--days N] [--empty] [--yes]` | Prune is a dry run without `--yes`. |
| A forgotten PIN | `just cloud-reset-pin "<fun name>"` (then `--yes`) | A random PIN, shown once for Ben to pass on. See "Reset a forgotten PIN" below. |
| Schema | `just cloud-migrate [--yes]`; `just cloud-schema` (a new, empty database only) | The deploy runs it before every upload; by hand only for a drop. A migration that drops a table D1 holds rows of is refused until the telemetry mirror holds at least as many (`just pull noodlepads` in ~/src/telemetry first); `--allow-drop TABLE` drops them anyway (it cannot be undone). |
| Back up the database | `just cloud-backup [file]` | A whole-database `.sql` export (reads only), by default in `~/.local/state/noodlepads/backups/`; it refuses a path inside the repo. |
| Anything else | `just cloud-sql "…"`, `just cloud-db …` | Ben's. |

### Reset a forgotten PIN

Ben says something like "reset Captain Cranberries' PIN". A grown-up emailed the `forgot` address with the fun name. Do it, no questions, from **Ben's Mac** (the main checkout or a worktree): the write goes through `just cloud-db`, whose Cloudflare login is in the Mac's Keychain. A cloud session has no login: say so, and ask Ben to run the same two commands in a terminal on his Mac.

1. `just cloud-reset-pin "Captain Cranberries"`: finds the profile by its fun name (any case; or give the `p-…` id) and shows it, changing nothing.
   - "Close ones" (Ben said "Cranberry's"): pick the one meant, and run it again with its exact name or id.
   - Two profiles with that name: it lists both with their ids, the last active first. Ask Ben which, unless he said.
2. The same command with `--yes` on the end picks a random PIN, sets it and checks it took: "✅ Captain Cranberries's new PIN is 4821. Pass it on to the family: it is shown only this once."

The PIN is random (Python's `secrets`, 0000 to 9999), never an obvious one (1234, 0000, four of one digit, a straight run, 2580 and the like), and nobody picks it: the profile list is public, so a PIN everyone knows opens anyone's profile (Ben, 2026-10-27). It is shown once, on the screen, and written nowhere: the database gets only its hash. Ben passes it on to the family; an agent gives Ben the line as it is and keeps it out of every file, commit and message to anyone else. Every device's key is deleted: each device asks for the new PIN once ("They have a new PIN"), and a device that remembered them (🔑) asks too. Nothing to deploy.

### Retire the old Mac archives (once, on Ben's Mac)

Before 2026-10-16 this repo kept its own copies: `~/.local/state/noodlepads/logs.sqlite3` (problem reports, from `just logs --sync`) and `metrics.sqlite3` (the old harvest). Ben: "the telemetry tooling needs to take this over". These steps move both into the runner as history, then delete them. A Mac session or Ben runs them; a cloud session has neither file. About 10 minutes.

1. **Up to date:** `git -C ~/src/noodlepads pull` and `git -C ~/src/telemetry pull`.
2. **The runner names the reports' ids.** `~/src/telemetry/telemetry.toml` `[jobs.noodlepads.ids]` must have a `reports` line before any import, since a report's key and `device` hold its device code: `reports = { columns = ["key", "device"], time = "created", unit = "ms", drop = true }`. If it is missing, stop: an agent adds it in pdxfixit/telemetry first.
3. **Export both archives into one file**, outside the repo. It prints each table's row count; write them down:
   ```sh
   mkdir -p ~/.local/state/noodlepads/export
   just runner-export all ~/.local/state/noodlepads/logs.sqlite3 ~/.local/state/noodlepads/metrics.sqlite3 ~/.local/state/noodlepads/export/noodlepads.sqlite3
   ```
   The reports keep no raw User-Agent; the metrics keep no city, region, network, ASN, name or avatar. It ends `✅ … is in the harvest's shape`. A `❌` line stops here.
4. **Import once, dry run first, then for real.** `telemetry.py import` only starts a job's history: it refuses a job that already has a stored snapshot. So it must run **before the runner's `noodlepads` job is ever enabled** (`enabled = false` in `telemetry.toml` today), and only once: both archives are in the one file.
   ```sh
   python3 ~/src/telemetry/telemetry.py import noodlepads ~/.local/state/noodlepads/export/noodlepads.sqlite3
   python3 ~/src/telemetry/telemetry.py import noodlepads ~/.local/state/noodlepads/export/noodlepads.sqlite3 --apply
   ```
   If the job has already run, the import is refused; ask an agent before going on (the old archives stay until then).
5. **Verify:** `python3 ~/src/telemetry/telemetry.py pull`, then `python3 ~/src/telemetry/telemetry.py check`. Each count is at least step 3's (the runner may hold newer rows): `sqlite3 ~/.local/state/telemetry/telemetry.sqlite3 "SELECT 'reports', count(*) FROM noodlepads__reports UNION ALL SELECT 'activity', count(*) FROM noodlepads__activity UNION ALL SELECT 'visits', count(*) FROM noodlepads__visits UNION ALL SELECT 'devices', count(*) FROM noodlepads__devices UNION ALL SELECT 'uses', count(*) FROM noodlepads__uses UNION ALL SELECT 'players', count(*) FROM noodlepads__players"`. Then `just logs` lists reports and `just cloud-stats` reports players.
6. **Delete the old files**, only when step 5 matched: `rm ~/.local/state/noodlepads/logs.sqlite3 ~/.local/state/noodlepads/metrics.sqlite3` and `rm -r ~/.local/state/noodlepads/export`. `just doctor` stops naming them.

flarepress (public, `github.com/pdxfixit/flarepress`; on the Mac at `~/src/flarepress`) holds the deploy code; this repo's `site/` is its site folder. Deploy auth is a GitHub secret (this repo's own token) or Ben's Keychain. Never put a token or an ID in this repo.

## Working with Ben

- **Before a long build, ask every decision in one batch**, each question explaining itself (what, where it shows, what each option changes and costs). Then run without stopping; make the smaller calls and list them in your report.
- **A real judgement call** (layout, naming, what a control does): name the options, recommend one, ask. A change across several files: a numbered plan first.
- **Reports:** the answer or next action first, numbered steps, estimates in minutes, five items at most, the one next step Ben can take last. Call agents agents.
- **No kids' names**, anywhere in the repo; the site and every file under `web/` are public. See AGENTS.md "Privacy".
