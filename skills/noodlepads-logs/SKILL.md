---
name: noodlepads-logs
description: >
  Noodle Pads problem reports — once a week digests the week's errors from
  the telemetry runner's mirror (`just logs --digest`, table
  noodlepads__reports) and files each new kind of error as an "Agents do"
  line in the soundboard repo's TODO.md. It copies nothing: the telemetry
  runner brings the reports to this Mac. Runs as a leg of the recurrent
  routine. Trigger on "noodle logs", "any new soundboard errors", "run the
  noodlepads-logs leg", or recurrent's noodlepads-logs leg. Do NOT use for:
  reading or querying reports by hand (`just logs` in ~/src/noodlepads does
  that), fixing the errors it finds (ordinary soundboard work from TODO.md),
  pulling the mirror (`telemetry.py pull`), or anything in Cloudflare.
---

# noodlepads-logs 🍜

Noodle Pads (the soundboard at https://noodlepads.com/) can send problem
reports, if a device has the switch on. Its Worker keeps each one in the site's
D1 database for 14 days. The telemetry runner (pdxfixit/telemetry) copies them
out, and `telemetry.py pull` brings them to this Mac's mirror,
`~/.local/state/telemetry/telemetry.sqlite3` (Ben, 2026-10-16: "the telemetry
tooling needs to take this over"). Once a week this leg turns new kinds of
error there into work for agents. Design: `~/src/noodlepads/docs/design/automatic-logs.md` § 6.

All the work is done by the repo's own tool, `just logs` (`tools/logs.py`),
which only reads the mirror. This leg decides when, runs it, and records what
happened.

## Capability model

This leg's own. recurrent's autonomy envelope does not apply to it, and it
grants nothing beyond this table.

| May | Never |
|---|---|
| Record the last digest (`just logs --digest --mark` writes `~/.local/state/noodlepads/logs-digest.json`) | Change any code, test, doc or setting in the soundboard repo |
| Write its state, only through `gate.py done` | Edit any file but `TODO.md`, or any part of `TODO.md` but the lines `--file-new` adds |
| Add one "Agents do" line per **new kind of error** to the soundboard repo's `TODO.md`, with `just logs --digest --file-new TODO.md` | Commit anything but `TODO.md`; commit when nothing new was filed |
| Commit just `TODO.md` and push it, with `just ship` (GitHub deploys every push to `main`) | Force-push, rebase, switch branches, or touch a worktree it did not make |
| Read the mirror | Write the mirror, or anything in Cloudflare |

## A run

Work in the soundboard repo: `cd ~/src/noodlepads`. Use files, not pipes,
for every command whose exit status matters: a pipe's last command decides the
status, which can hide a failure.

### Phase 0 — the gate

```sh
python3 ~/src/skills/noodlepads-logs/gate.py
```

- exit 0 → print its one line and **stop**.
- exit 10 → the digest is due: go on.
- anything else → report the line as an error and stop.

### Phase 1 — the digest

A line starting `⏳` means the mirror has no reports table yet (the harvest
names reports from a date in the repo's `docs/state.md`): mark nothing, record
`done digest --status ok`, and stop. A line starting `🛑` is an error: record
`done digest --status error` with that line as attention, and stop.

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
   throwaway worktree and pushes; GitHub deploys the push.
6. **Ship succeeded** → `just logs --digest --mark > /dev/null`, then
   `python3 ~/src/skills/noodlepads-logs/gate.py done digest --status ok`.
   **Ship failed** → put `TODO.md` back with `git checkout -- TODO.md` (it was
   clean in step 3, so this drops only this run's lines), then record
   `done digest --status error` with the attention line
   `N new kinds of error not filed: just ship failed: <its last line>`.

### Phase 2 — finish the leg

When recurrent launched this run, it wrote the leg's running marker. Finish the
leg, or recurrent treats it as stalled. Write the change list (§ Output) to
`$TMPDIR/noodlepads-logs-report.md` first:

```sh
python3 ~/src/skills/noodlepads-logs/gate.py attention > "$TMPDIR/noodlepads-logs-attention"
python3 ~/src/routines/recurrent/leg.py finish noodlepads-logs --status ok \
  --report "$TMPDIR/noodlepads-logs-report.md" --attention "$TMPDIR/noodlepads-logs-attention"
```

Use `error` when the digest failed. The result file is the contract; your chat output is not read. Run
by hand (no running marker), skip this phase and report in chat.

## State

`~/.local/state/skills/noodlepads-logs.state.json`, written only by `gate.py done`:
for the digest, the last run, its status, the last success and its outstanding
attention lines. `just logs --digest` reads where to start from
`~/.local/state/noodlepads/logs-digest.json`, which `--mark` writes.

## Output

A change list, past tense:

```
**digest**
- 9 errors, 2 notices this week; 1 new kind filed in TODO.md and deployed (3f2a1bc).
```

Nothing done, nothing to say: an empty report is fine.

## Setup (once, by Ben)

Until the telemetry mirror is on this Mac (`python3 ~/src/telemetry/telemetry.py pull`),
the gate says `NOTHING-DUE (not set up: …)` and the leg never runs.
