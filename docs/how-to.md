# How to

Step by step for the common jobs, so a fresh session never has to guess. [AGENTS.md](../AGENTS.md) has the rules; this file has the order to apply them in. Start every session with `just doctor`: it says whether you are in the main checkout or a worktree, checks just, node, python and Chrome, and compares what is live with `main`.

## Where you run things

| You are in | You may | You may not |
|---|---|---|
| A worktree (`.claude/worktrees/agent-…`, or a branch of your own) | Edit, `just test`, `just prove`, `just look`, commit on your branch | `just ship`, `just land`, `just deploy`: they push the **main checkout's** files, so from a worktree they would ship the wrong copy. Report your commits; the session that started you lands them. |
| The main checkout (`~/src/noodlepads`, on `main`) | All of the above, plus `just ship`, `just land`, `just --yes deploy` | Switch branch: flarepress serves this folder's `web/` and `worker/` as they are on disk. |
| A cloud session (this repo only, no flarepress, no Chrome) | Edit, `just test`, commit, push a branch | Deploy, `just look`, the live checks. Say so in your report, and what is unchecked. |

## A bug fix in `web/`

1. **Find the module.** [layout.md](layout.md) lists every file; each module's opening comment says what it owns. `grep -rn` for the label the kid sees (it is in `index.html` or the module that draws it).
2. **Write the failing test first.** Put it in the test file for that module (`tests/<module>.test.mjs`, or the nearest by name). Pure logic is tested directly. Anything on screen starts the real app on the stand-in page: `installPage({ manifest: testManifest() })` from `tests/fake-dom.mjs` and `tests/test-board.mjs`, then `await import('../web/app.js')` and `await page.settle()` (see `tests/tooltips.test.mjs`). Other helpers: `tests/new-beat.mjs` (a beat with a row; `keysOn`/`keysOff`), `tests/song-ui.mjs` (the playlist), `tests/fake-idb.mjs` (a device with data already saved), `tests/helpers.mjs` (zips, audio buffers).
3. **Fix it.** Run one file with `node --test --test-force-exit tests/<file>`.
4. **Prove it:** `just prove tests/<file> web/<changed files…>` must say ✅ (fails without your change, passes with it).
5. **`just test`**, judged by its exit code. A test that times out once under the full run's load and passes alone three times is a flake: say so in your report, do not hide it.
6. **Look at it** if a kid would see it: `just look <screen or view>` (and `--wide` for layout), then read the screenshots. `just look --help` lists the views; the `VIEWS` table in `tools/look.mjs` says what each opens.
7. **Docs in the same commit:** [guide.md](guide.md) if behavior changed ([layout.md](layout.md) for a new file); docs/state.md if what is live changed; the ❓ Help line (`web/help.js`) if a control's label changed.
8. **Ship it** from the main checkout: `just ship "$msg" <files…>`, with the message in a `mktemp` file. From a worktree: commit on your branch and report the commits.

## Flaky tests

A test that fails under a full `just test` and passes alone is usually a fixed wait that a busy machine outruns.

`page.settle()` is not one (since 2026-10-13). It waits until the stand-in page has nothing in flight, then fails after 10 s naming what was still pending. In flight means: a fetch, a `crypto.subtle` call (a PIN hash), a one-shot timer due within 20 ms (an app step, a fake IndexedDB step), and any timer a stand-in (`tests/fake-*.mjs`) sets. Repeating work (intervals, and timers set inside an interval's tick) and the app's later timers (a hold, a fade, an Undo offer) do not count: wait for those yourself. The rule is written at "Work in flight" in `tests/fake-dom.mjs`. A new kind of off-thread work the app starts (a Worker, a decode) needs a line there, or settle() will not wait for it.

1. **Reproduce under load.** `just stress` (`tools/stress.sh`) runs the full suite 10 times with 6 cores kept busy and counts the failing runs (`just stress 20 8 tests/<file>` for one file). One file alone rarely fails; the full run's parallel processes are the load. Before 2026-10-12, 3 of 10 such runs failed. To make a suspected step slow on purpose, preload a wrapper: `node --import ./slow.mjs --test --test-force-exit tests/<file>` where `slow.mjs` delays that step (a hash, a zero-delay timer, a fake IndexedDB step) by 60 ms.
2. **Wait for the condition, never a longer time.** The app: `await (await import('../web/app.js')).ready` before the first tap (`tests/app-ready.test.mjs` checks every file). Then `page.settle()` after each action.
3. Fixed waits that are safe: waiting for one of the app's own timers (the sequencer's 25 ms tick, a hold) with a longer one set after it. Node fires timers in order of when they are due, however late.

## A new feature that touches what is stored

Work down this list; each line names the place and the test that catches a miss.

| If you add or change… | Change | Caught by |
|---|---|---|
| An IndexedDB store or index | `web/store.js` `SCHEMA` (a new `since`; `upgradeStores` brings old devices up), `web/state.js` (loading and saving it) | `tests/store.test.mjs` |
| A field on a stored record | The record's cleaner in `web/backup.js` (`cleanBackup` checks everything that comes in: backups, older sounds found, cloud pulls). Leave a default out of the record ("left out at normal"), as `volume` and `pinned` are | `tests/backup.test.mjs` |
| A new kind of record | `web/backup.js` (write, clean, `MAX_RECORDS`, the words in the notice), `web/merge.js` (`STORES`, counts), `web/merge3.js` (`STAMPED`, field rules), `web/cloud-sync.js` `CLOUD_KINDS` and `worker/cloud.js` `KINDS` (the same list), `web/reid.js` `PERSON_STORES`, `web/model.js` `KIND_EMOJI`, `web/state.js`, `web/cloud.js`, `web/backup-ui.js`. Commit `a5f2414` (key layouts) is a worked example | `tests/kinds.test.mjs`, `tests/cloud-sync.test.mjs`, `tests/merge.test.mjs` |
| The backup format | A newer app must still load every `1.x` backup (ADR 0011). A format change is an ADR | `tests/backup.test.mjs` |
| What the cloud stores or shows | `worker/` and, in the same commit, the disclosure in `web/privacy.js` | `tests/privacy.test.mjs` |
| A D1 table or column | A new `worker/migrations/NNN-*.sql` plus the full `worker/schema.sql`; a "Ben does" line in TODO.md to run `just cloud-migrate --yes` before the deploy that needs it. The Worker should skip the new part while the table is missing (as `worker/metrics.js` does) | `tests/migrations.test.mjs` |
| A `logEvent` kind or field | A rule in `RULES`, `web/log-clean.js` (free text only through `text`) | `tests/log-clean.test.mjs` |
| A feature worth counting | A name at the end of `USES` in `web/uses.js` (never remove one: older copies still send it), counted with `countUse` | `tests/uses.test.mjs` |
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

`tests/docs.test.mjs` checks every relative link and that every ADR is in the index. `tests/no-names.test.mjs` checks no kid's name is anywhere. Commit with `docs:`; a docs-only commit still deploys (the site is unchanged, so `deploy-verify` just sees the new commit).

## Landing other agents' work

From the main checkout:

1. Check the agent has finished: its final report arrived, and `git -C <worktree> status --porcelain` is empty.
2. `git log --oneline main..<branch>` lists its commits. `just land <sha>…` cherry-picks them in order, resolves `TODO.md` and `docs/adr/README.md` (`tools/resolve_todo.py`) and `docs/questions.md` (`tools/resolve_questions.py`), tests, moves `main`, updates this checkout's copies, pushes and deploys. Any other conflict stops it with `main` unchanged and the worktree kept, named in its message: resolve there (`git -C <wt> add …`, then `GIT_EDITOR=true git -C <wt> cherry-pick --continue`) and run `just land-continue <wt>`, which picks the rest, tests, moves `main`, syncs this checkout (deleted files too), pushes and deploys. Never finish a landing by hand.
3. Clean up with `just archive-agent <agent-id>` once it is on `main`: it checks the worktree is clean and every commit landed, tags `archive/<branch>`, then removes the worktree and branch.

## Deploy, live checks and rollback

- **Deploy:** `just --yes deploy`, from the main checkout, after every commit to `main` (`just ship` and `just land` do it). It runs `just deploy-check` (refuses uncommitted edits in `web/` or `worker/`, a commit off `main` or not pushed, and failing tests), stamps `web/version.json`, pushes through flarepress, waits for the live version (`just deploy-verify`), then runs the live checks (`just deploy-checks`). Detail: [deploy-cloudflare.md](deploy-cloudflare.md).
- **Live checks:** `just cloud-smoke` (the API) and `just cloud-e2e` (two devices syncing in headless Chrome); each uses and deletes a throwaway `p-smoke-…`/`p-e2e-…` profile. A killed run's leftovers: `just cloud-prune --smoke --yes`.
- **Roll back a bad deploy:** the live site is always a commit on `main`, so roll back by reverting: in the main checkout, `git revert --no-edit <sha>…`, `just test`, `git push origin main`, `just --yes deploy`; `just rollback` prints those steps for the previous release. Never force-push `main` or deploy an old checkout. A schema migration is not undone by a revert: the Worker must cope with the newer tables.
- **Dry run:** `just deploy-plan` runs `just deploy-check`, then validates and lists files, sending nothing.
- **What is live:** `just live`: status, cache headers, the live version, and whether it is main's `web/` and `worker/`.

## Problem reports, metrics and the cloud database

Agents may read the live database without asking (`just cloud-stats`, `just logs --sync`). They never write to it, except the deploy checks and `just cloud-prune --smoke --yes`; every other write is Ben's.

| Job | Command | Notes |
|---|---|---|
| Read problem reports | `just logs`, `--errors`, `<device code>`, `--json <key>`, `--grep`, `--sql` | Reads the local archive `~/.local/state/noodlepads/logs.sqlite3` (`tools/logs.py`); safe for agents. |
| Bring new reports in | `just logs --sync` | Reads D1 with the read-only Keychain token. The `noodlepads-logs` recurrent leg (`skills/noodlepads-logs/`) runs it daily and `--digest` weekly, filing new errors in TODO.md. |
| Player metrics | `just cloud-stats [--days N]` | Reads D1 through flarepress (ADR 0016); archives into `metrics.sqlite3`. |
| Profiles | `just cloud-profiles`, `just cloud-prune [--days N] [--empty] [--yes]` | Prune is a dry run without `--yes`. |
| A forgotten PIN | `just cloud-reset-pin <id>` | From an email to [old address removed]; it asks before it changes anything. |
| Schema | `just cloud-migrate [--yes]`; `just cloud-schema` (a new, empty database only) | Ben runs migrate right before the deploy that needs it. |
| Back up the database | `just cloud-backup [file]` | A whole-database `.sql` export (reads only), by default in `~/.local/state/noodlepads/backups/`; it refuses a path inside the repo. |
| Anything else | `just cloud-sql "…"`, `just cloud-db …` | Ben's. |

flarepress (`~/src/flarepress`, its own AGENTS.md) owns the domains and deploy auth. Never set up wrangler here.

## Working with Ben

- **Before a long build, ask every decision in one batch**, each question explaining itself (what, where it shows, what each option changes and costs). Then run without stopping; make the smaller calls and list them in your report.
- **A real judgement call** (layout, naming, what a control does): name the options, recommend one, ask. A change across several files: a numbered plan first.
- **Reports:** the answer or next action first, numbered steps, estimates in minutes, five items at most, the one next step Ben can take last. Call agents agents.
- **No kids' names**, anywhere in the repo; the site and every file under `web/` are public. See AGENTS.md "Privacy".
