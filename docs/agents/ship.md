# Ship and land

How a change reaches `main`: version stamp, `just ship`, the cloud database, `just land`, conflicts and cleaning up after agents. Moved out of [AGENTS.md](../../AGENTS.md) unchanged.

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
- Messages: `<type>: <summary>` (feat, fix, style, refactor, docs, chore, test), a bullet body at the level a user notices, the `Council:` trailer ([docs/council.md](../council.md)) and the `Co-Authored-By` trailer.
- **GitHub deploys every push to `main`** (`.github/workflows/deploy.yml`): `just test` and the release checks, then the `pdxfixit/flarepress` action stamps `web/version.json`, uploads, and waits until the live site serves the new version (the app shows it in its corner), then `just deploy-checks` (cloud-smoke, cloud-e2e and taps). After a push, read that run. A red run after the upload means the new version is already live: read the ❌ line, fix forward, or roll back (docs/deploy-cloudflare.md). `just deploy` is Ben's fallback from his Mac; agents never run it.
- Never force-push `main`.
- **A file another session is also editing in this checkout** (`git status` shows changes you did not make): `just ship` copies whole files, so it would ship that session's half-done work. Ship by the steps above instead, `git apply` only your hunks in the worktree (`git diff <file>` split on `^@@`), and leave its files alone. On 2026-10-16 `styles.css` held both an agent's sheet-warning hunk and the Add-rows hunk.

**The cloud database.** A schema change is a new `worker/migrations/NNN-*.sql` plus the full `worker/schema.sql`, in the same commit; `tests/migrations.test.mjs` checks the two agree. The deploy applies it before the upload (`just cloud-migrate --yes` in deploy.yml; Ben, 2026-10-26), so keep migrations additive: the old Worker runs on the new tables until the upload. A `DROP TABLE` in a migration is refused while D1 holds rows the telemetry mirror lacks (2026-10-16: 005 dropped 77 unharvested rows); CI has no mirror, so such a deploy stops and the drop is Ben's, after `just pull` (a TODO "Ben does" line). Agents never write to the live database. They may read it without asking (`just cloud-sql`, `just cloud-profiles`, Ben 2026-10-12). Problem reports and metrics reach the Mac only through the telemetry runner's mirror (`telemetry.py pull`; Ben, 2026-10-16). Two write exceptions: the deploy checks use the live API with their own throwaway profiles, and `just cloud-prune --smoke --yes` removes what a killed check left (only `p-smoke-…`/`p-e2e-…` profiles over 10 minutes old, and their share codes). Third: a PIN reset when Ben asks for it in his own words (docs/how-to.md "Reset a forgotten PIN"; Ben, 2026-10-26). Prune, a migration that drops rows, and the like are Ben's.

**Landing an agent's commits: `just land <sha>…`**, or `just land` with no sha from the agent's worktree (its branch's commits). It is flarepress's shared tool (`tools/land.sh` there, run from the flarepress checkout beside this one; settings in `land.conf` here; Ben, 2026-10-17: every flarepress app lands the same way). It pulls main from GitHub first (fast-forward only; it stops when main here has diverged, or when the pull would overwrite uncommitted edits), cherry-picks in a throwaway worktree, resolves the list files, tests, pushes, then moves main and updates this checkout's copies of the touched files; GitHub deploys. A conflict it can't resolve stops it with the worktree kept and says where: resolve it there, then `just land-continue <worktree>` finishes the same way. When another session holds uncommitted edits to the same files here, it stops; `just land --wait <sha>…` (in the background) waits up to an hour for them to be committed, then lands on top. Do not write your own wait loop: one in zsh passed its file list as one word and fired early (2026-10-16). Never finish a landing by hand: a hand-run finish left deleted files in this checkout (2026-10-13), and once left it stale (2026-10-12).

**An agent's new ADR or new `web/` file can clash with what landed meanwhile.** `just land` stops on either: `tests/docs.test.mjs` on two ADRs with one number (renumber the later one, and every "ADR NNNN" naming it), `tests/offline.test.mjs` on a `web/` file missing from `web/sw.js` (2026-10-16).

**TODO.md conflicts on landing** are routine (each agent deletes its own line while others add theirs): flarepress's `tools/resolve_todo.py` keeps main's lines and applies the commit's own deletions and additions. By hand, from the flarepress checkout's `tools/`, it also works for end-of-file appends in `styles.css`. Read the result before continuing. `docs/questions.md` has its own, `resolve_questions.py`, which keeps both sides' cards. The docs keep a paragraph on one line, so two edits to it clash as whole lines: `resolve_words.py` merges them word by word and leaves a clash on the same words. `just land` runs all three, by `land.conf`'s `resolve=`.

**Cleaning up after agents: `just archive-agent <agent-id>`**, only once the agent has finished (never a live one: a new worktree looks almost empty). It refuses a dirty worktree or a commit not on `main` (matched by patch, then by subject, since landings cherry-pick), tags the tip `archive/<branch>`, then removes the worktree and branch. By hand, cleanups chained after a failed step deleted branches twice (2026-10-11, 2026-10-12).
