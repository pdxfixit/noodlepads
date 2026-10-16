#!/usr/bin/env bash
# Lands agents' commits on main (just land): cherry-picks them in a throwaway
# worktree, resolves the lists every agent appends to, tests the result,
# moves main, brings this checkout's copies of the touched files up to date
# (deleting the ones the commits deleted) and pushes; GitHub deploys the push.
#
# A conflict it can't resolve stops it with the worktree kept: resolve it
# there (git add, git cherry-pick --continue), then `just land-continue <dir>`
# finishes the same way. By hand, a finished landing once left deleted files
# behind in this checkout (2026-10-13).
#
# With --wait it first waits for another session to commit its edits to the
# files the commits touch (LAND_WAIT_SECONDS, default an hour; LAND_WAIT_POLL,
# default 10 s), instead of stopping. A hand-written wait loop once passed
# that file list as one word in zsh and landed early (2026-10-16).
#
#   tools/land.sh start [--wait] <sha>…
#   tools/land.sh continue <worktree>
set -euo pipefail

# The files among $@ with uncommitted edits in this checkout, one a line.
held() {
  local f
  for f in "$@"; do
    if [ -e "$f" ] && ! git diff --quiet HEAD -- "$f"; then echo "$f"; fi
  done
}

# Waits until held() is empty, saying which files it waits on whenever they change.
wait_free() {
  local limit=${LAND_WAIT_SECONDS:-3600} poll=${LAND_WAIT_POLL:-10} start now busy last=
  start=$(date +%s)
  while busy=$(held "$@"); [ -n "$busy" ]; do
    if [ "$busy" != "$last" ]; then echo "⏳ waiting for uncommitted edits here: $(echo $busy)"; last=$busy; fi
    now=$(date +%s)
    if [ $((now - start)) -ge "$limit" ]; then echo "🛑 still uncommitted after ${limit}s: $(echo $busy); nothing landed" >&2; return 1; fi
    sleep "$poll"
  done
  [ -z "$last" ] || echo "✅ committed; landing on $(git log --oneline -1 main)"
}

# Removes the lines of a todo file up to and including commit $2. Portable:
# GNU sed (Linux, cloud sessions) and BSD sed (macOS) disagree on in-place
# editing, and the BSD form stopped every landing on Linux (2026-10-16).
drop_done() {
  local file=$1 c=$2 rest
  rest=$(sed "1,/^$c\$/d" "$file")
  printf '%s\n' "$rest" > "$file"
}

# Picks the commits listed in the worktree's state file that are not picked yet.
pick_rest() {
  local wt=$1 c left f
  while read -r c; do
    [ -n "$c" ] || continue
    if ! git -C "$wt" cherry-pick "$c" > /dev/null 2>&1; then
      left=$(git -C "$wt" diff --name-only --diff-filter=U)
      for f in $left; do
        case "$f" in
          TODO.md|docs/adr/README.md) python3 tools/resolve_todo.py "$wt/$f"; git -C "$wt" add "$f" ;;
          docs/questions.md) python3 tools/resolve_questions.py "$wt/$f" || return 1; git -C "$wt" add "$f" ;;
          *)
            # Keep the worktree and what is left to pick, for land-continue.
            drop_done "$wt/.land/todo" "$c"
            echo "🛑 $c conflicts in: $(echo $left) (main unchanged)" >&2
            echo "   Resolve it in $wt (git -C $wt add …; GIT_EDITOR=true git -C $wt cherry-pick --continue)," >&2
            echo "   then: just land-continue $wt" >&2
            return 2 ;;
        esac
      done
      GIT_EDITOR=true git -C "$wt" cherry-pick --continue > /dev/null
    fi
    drop_done "$wt/.land/todo" "$c"
  done < <(cat "$wt/.land/todo")
}

# Tests, moves main from the recorded start, syncs this checkout, pushes (GitHub deploys).
finish() {
  local wt=$1 old touched f
  old=$(cat "$wt/.land/old")
  touched=$(cat "$wt/.land/touched")
  [ "$(git rev-parse main)" = "$old" ] || { echo "🛑 main moved since this landing began; land again" >&2; return 1; }
  (cd "$wt" && just test-quiet) || { echo "🛑 tests fail on the landed commits; main unchanged ($wt kept)" >&2; return 1; }
  git update-ref refs/heads/main "$(git -C "$wt" rev-parse HEAD)" "$old"
  git reset -q
  for f in $touched; do
    if git ls-files --error-unmatch "$f" > /dev/null 2>&1; then git checkout -- "$f"; else rm -f "$f"; fi
  done
  git worktree remove --force "$wt"
  git status --short
  git push -q origin main
  git log --oneline "$old..main" | cat
  echo "🚀 pushed: GitHub deploys it (.github/workflows/deploy.yml); read that run, then just live"
}

case "${1:-}" in
  start)
    shift
    wait=0
    if [ "${1:-}" = --wait ]; then wait=1; shift; fi
    [ $# -gt 0 ] || { echo "usage: tools/land.sh start [--wait] <sha>…" >&2; exit 2; }
    # One commit at a time: given two, diff-tree compares them to each other.
    touched=$(for c in "$@"; do git diff-tree --no-commit-id --name-only -r "$c"; done | sort -u)
    # This checkout must hold nothing unsaved in those files: they are replaced.
    # Another session may be editing them: --wait waits for its commit.
    if [ $wait -eq 1 ]; then
      wait_free $touched || exit 1
    else
      busy=$(held $touched)
      if [ -n "$busy" ]; then echo "🛑 uncommitted edits here in: $(echo $busy); nothing landed (just land --wait waits for them)" >&2; exit 1; fi
    fi
    # Read only now: what landed while it waited is the base.
    old=$(git rev-parse main)
    wt=.worktrees/land-$(date +%s)-$$
    git worktree add -q --detach "$wt" main
    mkdir "$wt/.land"
    echo "$old" > "$wt/.land/old"
    echo "$touched" > "$wt/.land/touched"
    printf '%s\n' "$@" > "$wt/.land/todo"
    # .land/ is this script's notes, never committed.
    echo ".land/" >> "$(git -C "$wt" rev-parse --git-path info/exclude)"
    set +e; pick_rest "$wt"; rc=$?; set -e
    if [ $rc -eq 2 ]; then exit 1; fi
    if [ $rc -ne 0 ]; then git -C "$wt" cherry-pick --abort 2>/dev/null || true; git worktree remove --force "$wt"; exit 1; fi
    finish "$wt"
    ;;
  continue)
    wt=${2:?usage: tools/land.sh continue <worktree>}
    [ -d "$wt/.land" ] || { echo "🛑 $wt is not a stopped landing" >&2; exit 1; }
    if [ -n "$(git -C "$wt" diff --name-only --diff-filter=U)" ] || git -C "$wt" rev-parse -q --verify CHERRY_PICK_HEAD > /dev/null; then
      echo "🛑 finish the cherry-pick in $wt first (git add …; GIT_EDITOR=true git -C $wt cherry-pick --continue)" >&2; exit 1
    fi
    set +e; pick_rest "$wt"; rc=$?; set -e
    [ $rc -eq 0 ] || exit 1
    finish "$wt"
    ;;
  *) echo "usage: tools/land.sh start [--wait] <sha>… | continue <worktree>" >&2; exit 2 ;;
esac
