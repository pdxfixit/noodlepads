#!/usr/bin/env bash
# Exit 1 when web/ changed after the last commit that bumped web/version.js,
# so a change to the app cannot reach main with an old release in the
# deploy's label (site/site.conf release=). Ported from Isopix. CI,
# just ship and just land (land.conf test=) run it. Run `just version` to fix.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(git rev-parse --is-shallow-repository)" = false ] || { echo "🛑 this clone is shallow: run 'git fetch --unshallow'" >&2; exit 1; }
last=$(git log -1 --format=%H -- web/version.js)
[ -n "$last" ] || { echo "🛑 web/version.js has never been committed" >&2; exit 1; }
changed=$(git diff --name-only "$last" HEAD -- web ':!web/version.js')
if [ -n "$changed" ]; then
  echo "🛑 web/ changed since web/version.js was bumped in $(git rev-parse --short "$last"):" >&2
  echo "$changed" | sed 's/^/   /' >&2
  echo "   Run 'just version' and commit web/version.js with the change." >&2
  exit 1
fi
echo "✅ web/version.js was bumped after the last change to web/"
