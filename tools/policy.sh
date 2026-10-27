#!/usr/bin/env bash
# policy.sh (just policy): copy docs/privacy-policy.md into the privacy site's repo and land it there.
#
#   just policy [--no-land]     (POLICY_NO_LAND=1 is the same: a dry run)
#
# The decided pattern (Ben, 2026-10-27): each app keeps its policy beside its code, and the agent that
# changes it copies it into pdxfixit/privacy in the same task. No CI link, no token, no automatic pull.
# Run it once the change is on this repo's main. It:
#   1. refuses when docs/privacy-policy.md has uncommitted changes (the copy must match a commit);
#   2. finds the privacy checkout: $PRIVACY, else ../privacy beside this repo, else a clone in
#      ${XDG_CACHE_HOME:-~/.cache}/privacy; pulls its main (fast-forward only);
#   3. in a throwaway worktree of the privacy repo (its own checkout is never switched or dirtied),
#      runs `just take noodlepads docs/privacy-policy.md` with TAKE_SHA set to this repo's HEAD;
#   4. runs `just land` there (flarepress's shared tool: pulls main, tests, pushes; GitHub deploys), then
#      removes the worktree. With --no-land it shows the commit that would land and removes the worktree.
# A landing that fails keeps the worktree and says where it is.
#
# Same name and behaviour in all four apps (noodlepads, isopix, arrowrama, orbit); only APP differs.
set -euo pipefail

APP=noodlepads
FILE=docs/privacy-policy.md
REPO_URL=https://github.com/pdxfixit/privacy

die() { echo "policy: $*" >&2; exit 1; }

dry=${POLICY_NO_LAND:-}
for a in "$@"; do
  case "$a" in
    --no-land) dry=1 ;;
    *) die "unknown argument '$a' (usage: just policy [--no-land])" ;;
  esac
done

root=$(git rev-parse --show-toplevel 2>/dev/null) || die "not in a git repo"
cd "$root"
[ -f "$FILE" ] || die "$FILE is missing"
[ -z "$(git status --porcelain --untracked-files=all -- "$FILE")" ] \
  || die "$FILE has uncommitted changes; commit it first (the copy in the privacy repo must match a commit here)"
sha=$(git rev-parse HEAD)

# The sha goes into the privacy repo's history, so it should be one that is public. A dry run does not mind.
if [ -z "$dry" ]; then
  git fetch -q origin main 2>/dev/null || true
  git merge-base --is-ancestor "$sha" origin/main 2>/dev/null \
    || die "HEAD ${sha:0:7} is not on origin/main yet; land it first (just land), then run this from main"
fi

# The privacy checkout: $PRIVACY, else beside the main checkout (as flarepress's land is found), else a cache clone.
if [ -n "${PRIVACY:-}" ]; then
  p=$PRIVACY
  [ -e "$p/.git" ] || die "PRIVACY=$p is not a git checkout"
else
  common=$(git rev-parse --path-format=absolute --git-common-dir)
  p=$(dirname "$(dirname "$common")")/privacy
  if [ ! -e "$p/.git" ]; then
    p=${XDG_CACHE_HOME:-$HOME/.cache}/privacy
    [ -e "$p/.git" ] || git clone -q "$REPO_URL" "$p" || die "could not clone $REPO_URL to $p"
  fi
fi

# Pull its main, fast-forward only. Its own checkout moves only when it is clean and on main.
base=main
if git -C "$p" fetch -q origin main 2>/dev/null; then
  base=origin/main
  if [ "$(git -C "$p" symbolic-ref -q --short HEAD || true)" = main ] && [ -z "$(git -C "$p" status --porcelain --untracked-files=no)" ]; then
    git -C "$p" merge -q --ff-only origin/main || die "$p: main has diverged from GitHub's; sort that out there first"
    base=main
  fi
else
  echo "policy: could not reach GitHub; using the privacy repo's main as it is" >&2
fi
git -C "$p" rev-parse -q --verify "$base" > /dev/null || die "$p has no $base"

wt=$(mktemp -d "${TMPDIR:-/tmp}/policy-privacy.XXXXXX")
branch="policy-$APP-${sha:0:7}"
cleanup() { git -C "$p" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"; git -C "$p" branch -q -D "$branch" 2>/dev/null || true; }
git -C "$p" worktree add -q -b "$branch" "$wt" "$base" \
  || { rm -rf "$wt"; die "could not make a worktree of $p (is branch $branch left from an earlier run? git -C $p branch -D $branch)"; }
[ -e "$wt/tools/take.sh" ] || { cleanup; die "$p's $base has no tools/take.sh yet; the privacy repo's change must land first"; }

if ! (cd "$wt" && TAKE_SHA=$sha just take "$APP" "$root/$FILE"); then
  cleanup
  die "just take stopped (it said why above); nothing was committed"
fi
if [ "$(git -C "$wt" rev-list --count "$base..HEAD")" = 0 ]; then
  cleanup
  echo "policy: the privacy site already has this policy; nothing to land."
  exit 0
fi

if [ -n "$dry" ]; then
  echo "policy: dry run, would land:"
  git -C "$wt" show --stat --format='%h %s' HEAD
  cleanup
  echo "policy: dry run done; nothing landed, scratch worktree removed."
  exit 0
fi

if (cd "$wt" && just land); then
  cleanup
  echo "policy: landed in the privacy repo; GitHub deploys privacy.pdxfixit.com/$APP/. Read its deploy run."
else
  echo "policy: just land stopped in $wt (branch $branch). Fix it there and run 'just land-continue $wt' from it, or remove it with: git -C $p worktree remove --force $wt" >&2
  exit 1
fi
