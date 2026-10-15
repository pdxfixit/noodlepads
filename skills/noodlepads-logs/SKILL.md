---
name: noodlepads-logs
description: >
  Noodle Pads problem reports — once a day copies new uploads from the
  soundboard's D1 reports table (14 days) into the local SQLite archive kept
  forever (~/.local/state/noodlepads/logs.sqlite3); and once a week digests
  the week's errors and files each new kind of error as an "Agents do" line in
  the soundboard repo's TODO.md. Runs as a leg of the recurrent routine.
  Trigger on "sync the soundboard logs", "noodle logs", "any new soundboard
  errors", "run the noodlepads-logs leg", or recurrent's noodlepads-logs leg. Do NOT
  use for: reading or querying the archive by hand (`just logs` in
  ~/src/noodlepads does that), fixing the errors it finds (that is
  ordinary soundboard work from TODO.md), or anything in Cloudflare beyond
  reading D1 and its stats.
---

# noodlepads-logs 🍜

Noodle Pads (the soundboard at https://noodlepads.com/) can send
problem reports, if a device has the switch on. Its Worker keeps each one in
the site's D1 database for 14 days. This leg makes sure none expires unread:
`just logs --sync` copies them into a SQLite archive that is kept forever, and once a week the leg
turns new kinds of error into work for agents. Design: `~/src/noodlepads/docs/design/automatic-logs.md` § 6.

All the work is done by the repo's own tool, `just logs` (`tools/logs.py`).
This leg decides when, runs it, and records what happened. The player metrics
and Cloudflare's stats are not this leg's: the telemetry runner
(pdxfixit/telemetry) is the only harvester (Ben, 2026-10-15).

## Capability model

This leg's own. recurrent's autonomy envelope does not apply to it, and it
grants nothing beyond this table.

| May | Never |
|---|---|
| Write the archive (`just logs --sync`, `just logs --digest --mark`) | Change any code, test, doc or setting in the soundboard repo |
| Write its state, only through `gate.py done` | Edit any file but `TODO.md`, or any part of `TODO.md` but the lines `--file-new` adds |
| Add one "Agents do" line per **new kind of error** to the soundboard repo's `TODO.md`, with `just logs --digest --file-new TODO.md` | Commit anything but `TODO.md`; commit when nothing new was filed |
| Commit just `TODO.md`, push and deploy it, with `just ship` (the repo's rule: every commit to `main` is deployed) | Force-push, rebase, switch branches, or touch a worktree it did not make |
| Read D1 and Cloudflare's stats with the read-only token in the Keychain | Write, delete or configure anything in Cloudflare |

## A run

Work in the soundboard repo: `cd ~/src/noodlepads`. Use files, not pipes,
for every command whose exit status matters: a pipe's last command decides the
status, which can hide a failure.

### Phase 0 — the gate

```sh
python3 ~/src/skills/noodlepads-logs/gate.py
```

- exit 0 → print its one line and **stop**.
- exit 10 → the line names the due jobs (`sync`, `digest`, or both). Do only those, sync first.
- anything else → report the line as an error and stop.

### Phase 1 — sync (when due)

```sh
just logs --sync > "$TMPDIR/noodlepads-sync.txt" 2>&1; echo "exit $?"
```


- the last line reads `✅ synced N new upload(s) … newest <KEY>` → the reports are in. Record it,
  with its own problems (its ⚠️ and 🛑 lines, when the exit was not 0) as attention:
  `grep -E '^(⚠️|🛑)' "$TMPDIR/noodlepads-sync.txt" | python3 ~/src/skills/noodlepads-logs/gate.py done sync --status ok --newest <KEY> --attention -`
  (leave out `--newest` when the archive is still empty).
- anything else → the reports failed: record the failing line, and skip Phase 2 this run (a digest of a stale archive misleads):
  `tail -1 "$TMPDIR/noodlepads-sync.txt" | python3 ~/src/skills/noodlepads-logs/gate.py done sync --status error --attention -`

A sync is one transaction: a failure leaves the archive as it was, and the next
run copies everything still in D1. A missing token or unfilled config is a
failure too, never "no reports".

### Phase 2 — digest (when due)

1. **Read the digest**, without marking it:
   `just logs --digest > "$TMPDIR/noodlepads-digest.md" 2>&1; echo "exit $?"`.
   It ends with `## New kinds of problem` when there are any. Only lines saying
   `error` there get filed; notices stay in the digest.
2. **Nothing new to file** → mark it, record it, and stop. No commit.
   ```sh
   just logs --digest --mark > /dev/null
   python3 ~/src/skills/noodlepads-logs/gate.py done digest --status ok
   ```
3. **New errors**: check the checkout first. All three must hold, or do not
   file: record `done digest --status error` with one attention line,
   `N new kinds of error not filed: <which check failed>`, and stop. The digest
   stays due, so the next run tries again.
   - `git rev-parse --abbrev-ref HEAD` prints `main`
   - `git status --porcelain -- TODO.md` prints nothing
   - after `git fetch -q origin`, `git rev-list --count main..origin/main` prints `0`
4. **File them**: `just logs --digest --file-new TODO.md > "$TMPDIR/noodlepads-file.txt" 2>&1`.
   Its last line is `📝 filed N …`. If N is 0 (all were already in `TODO.md`), go to step 2.
5. **Ship just `TODO.md`.** Write the message to `$TMPDIR/noodlepads-logs-commit.txt`:
   ```
   docs: file N new kind(s) of problem-report error in TODO.md

   - <the error, as filed>   (one bullet per line added)

   Co-Authored-By: <your model> <noreply@anthropic.com>
   ```
   Then `just ship "$TMPDIR/noodlepads-logs-commit.txt" TODO.md > "$TMPDIR/noodlepads-ship.txt" 2>&1; echo "exit $?"`.
   `just ship` runs the tests, commits only `TODO.md` to `main` through a
   throwaway worktree, pushes, and deploys with `just --yes deploy`.
6. **Ship succeeded** → `just logs --digest --mark > /dev/null`, then
   `python3 ~/src/skills/noodlepads-logs/gate.py done digest --status ok`.
   **Ship failed** → put `TODO.md` back with `git checkout -- TODO.md` (it was
   clean in step 3, so this drops only this run's lines), then record
   `done digest --status error` with the attention line
   `N new kinds of error not filed: just ship failed: <its last line>`.

### Phase 3 — finish the leg

When recurrent launched this run, it wrote the leg's running marker. Finish the
leg, or recurrent treats it as stalled. Write the change list (§ Output) to
`$TMPDIR/noodlepads-logs-report.md` first:

```sh
python3 ~/src/skills/noodlepads-logs/gate.py attention > "$TMPDIR/noodlepads-logs-attention"
python3 ~/src/routines/recurrent/leg.py finish noodlepads-logs --status ok \
  --report "$TMPDIR/noodlepads-logs-report.md" --attention "$TMPDIR/noodlepads-logs-attention"
```

Use `partial` when one job failed and the other succeeded, `error` when nothing
succeeded. The result file is the contract; your chat output is not read. Run
by hand (no running marker), skip this phase and report in chat.

## State

`~/.local/state/skills/noodlepads-logs.state.json`, written only by `gate.py done`:
per job (`sync`, `digest`) the last run, its status, the last success, its
outstanding attention lines, and for `sync` the newest report key in the archive.
The archive keeps its own bookkeeping too (`meta` table: last sync, newest key,
last marked digest), which `just logs --digest` reads to know where to start.

## Output

A change list, past tense, one bold heading per job that did something:

```
**sync**
- Copied 14 new uploads from 3 devices (newest 2026-10-11T19:42:08.123Z_K7Q4-M2XD_0a1b2c3d).

**digest**
- 9 errors, 2 notices this week; 1 new kind filed in TODO.md and deployed (3f2a1bc).
```

Nothing done, nothing to say: an empty report is fine.

## Setup (once, by Ben)

Until `~/.config/noodlepads/cloud.json` holds real ids, the gate says
`NOTHING-DUE (not set up: …)` and the leg never runs. The steps are in the
repo's `docs/deploy-cloudflare.md`, "Problem reports".
