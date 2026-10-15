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
#   tools/land.sh start <sha>…
#   tools/land.sh continue <worktree>
set -euo pipefail

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
            sed -i '' "1,/^$c\$/d" "$wt/.land/todo"
            echo "🛑 $c conflicts in: $(echo $left) (main unchanged)" >&2
            echo "   Resolve it in $wt (git -C $wt add …; GIT_EDITOR=true git -C $wt cherry-pick --continue)," >&2
            echo "   then: just land-continue $wt" >&2
            return 2 ;;
        esac
      done
      GIT_EDITOR=true git -C "$wt" cherry-pick --continue > /dev/null
    fi
    sed -i '' "1,/^$c\$/d" "$wt/.land/todo"
  done < <(cat "$wt/.land/todo")
}

# Tests, moves main from the recorded start, syncs this checkout, pushes (GitHub deploys).
finish() {
  local wt=$1 old touched f
  old=$(cat "$wt/.land/old")
  touched=$(cat "$wt/.land/touched")
  [ "$(git rev-parse main)" = "$old" ] || { echo "🛑 main moved since this landing began; land again" >&2; return 1; }
  (cd "$wt" && just test > /dev/null) || { echo "🛑 tests fail on the landed commits; main unchanged ($wt kept)" >&2; return 1; }
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
    old=$(git rev-parse main)
    # One commit at a time: given two, diff-tree compares them to each other.
    touched=$(for c in "$@"; do git diff-tree --no-commit-id --name-only -r "$c"; done | sort -u)
    # This checkout must hold nothing unsaved in those files: they are replaced.
    for f in $touched; do
      if [ -e "$f" ] && ! git diff --quiet "$old" -- "$f"; then echo "🛑 $f has uncommitted edits here; nothing landed" >&2; exit 1; fi
    done
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
  *) echo "usage: tools/land.sh start <sha>… | continue <worktree>" >&2; exit 2 ;;
esac
