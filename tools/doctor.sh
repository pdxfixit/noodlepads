#!/bin/sh
# `just doctor`: what a fresh session needs to know about this machine and
# this checkout before it starts, in one look. Read-only: it changes nothing,
# and the only network call is the live site's public version.json.
#
# ✅ ready · ⚠️ works, with a limit named · ❌ missing (exit 1)

bad=0
ok()   { printf '✅ %s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*"; }
fail() { printf '❌ %s\n' "$*"; bad=1; }

root=$(git rev-parse --show-toplevel 2>/dev/null) || { fail "not in a git checkout of this repo"; exit 1; }
cd "$root" || exit 1

# Where am I? ship and land move and push main from the main checkout, so
# they only make sense from there.
git_dir=$(cd "$(git rev-parse --git-dir)" && pwd)
common=$(cd "$(git rev-parse --git-common-dir)" && pwd)
main_checkout=$(dirname "$common")
branch=$(git branch --show-current)
if [ "$git_dir" = "$common" ]; then
  ok "main checkout ($root), on ${branch:-a detached HEAD}"
  [ "$branch" = main ] || warn "the main checkout is not on main: just ship and just land expect it to be"
else
  ok "a worktree on ${branch:-a detached HEAD}: commit here; the main session lands it (just land <sha>…) from $main_checkout"
fi
if git rev-parse -q --verify main > /dev/null; then
  behind=$(git rev-list --count HEAD..main)
  [ "$behind" = 0 ] || warn "$behind commit(s) on main are not in this checkout: git rebase main before you build on it"
fi
dirty=$(git status --porcelain | wc -l | tr -d ' ')
[ "$dirty" = 0 ] || warn "$dirty uncommitted file(s) here (git status)"

# Tools. Tests need node; tools need python3 3.8+; just look needs Node's own
# WebSocket (Node 22+) and Chrome.
command -v just > /dev/null && ok "just $(just --version | cut -d' ' -f2)" || fail "just is missing (brew install just)"
if command -v node > /dev/null; then
  if node -e 'process.exit(typeof WebSocket === "function" ? 0 : 1)'; then ok "node $(node --version)"
  else warn "node $(node --version) has no WebSocket: just test works, just look and the live checks need Node 22+"; fi
else fail "node is missing: just test needs it"; fi
if command -v python3 > /dev/null && python3 -c 'import sys; sys.exit(sys.version_info < (3, 8))'; then
  ok "python3 $(python3 -c 'import platform; print(platform.python_version())')"
else fail "python3 3.8 or newer is missing: the tools and just serve need it"; fi
# The same Chrome tools/chrome.mjs picks: $CHROME, the Mac's, or a cloud session's Chromium.
chrome=${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}
[ -n "${CHROME:-}" ] || [ -x "$chrome" ] || [ ! -x /opt/pw-browsers/chromium ] || chrome=/opt/pw-browsers/chromium
[ -x "$chrome" ] && ok "Chrome for just look and cloud-e2e" || warn "no Chrome at $chrome (set CHROME=…): just look and just cloud-e2e can't run"

# Deploying: GitHub deploys every push to main (ADR 0025). Ben's fallback,
# `just deploy`, needs a clone of the public flarepress; agents never deploy.
fp="${FLAREPRESS:-$HOME/src/flarepress}"
if [ -x "$fp/tools/wrangler.sh" ]; then
  ok "flarepress at $fp (Ben's fallback deploy, the harvest, cloud-db)"
elif [ -d "$fp/noodlepads.com" ]; then
  warn "$fp is the old private flarepress (archived): clone the public one there (TODO.md \"Ben does\")"
else
  warn "no flarepress at $fp: GitHub deploys; the harvest and cloud-db recipes need git clone https://github.com/pdxfixit/flarepress $fp"
fi
# Ben's own cloud settings live outside the repo (it is public): the
# Cloudflare ids in ~/.config/noodlepads/cloud.json, the logs token in the Keychain.
if cfg=$(python3 tools/cloud_config.py 2>&1); then ok "$cfg"
else warn "$cfg (just logs --sync needs it; the other recipes don't)"; fi
if command -v security > /dev/null; then
  if security find-generic-password -s noodlepads-logs > /dev/null 2>&1; then
    ok "Keychain has the read-only logs token (just logs --sync)"
  elif security find-generic-password -s noodle-pads-logs > /dev/null 2>&1; then
    warn "the logs token is under the old Keychain name noodle-pads-logs; it still works. Rename it once (just logs --sync prints the command)"
  else
    warn "no noodlepads-logs token in the Keychain: just logs reads the local archive only (TODO.md \"Ben does\")"
  fi
fi

# What is live, against main.
live=$(curl -fsS --max-time 5 https://noodlepads.com/version.json 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
want=$(git describe --tags --always --exclude 'archive/*' --exclude 'backup/*' main 2>/dev/null)
if [ -z "$live" ]; then warn "couldn't read https://noodlepads.com/version.json"
elif [ "$live" = "$want" ]; then ok "live: $live, which is main"
else warn "live: $live; main is $want (an undeployed commit, or a deploy in progress)"; fi

echo
echo "Cold start, in order: AGENTS.md, docs/state.md, docs/decisions.md (your sections), docs/questions.md, TODO.md, then docs/how-to.md for your task."
exit $bad
