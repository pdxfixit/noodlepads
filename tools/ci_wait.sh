#!/usr/bin/env bash
# Waits for GitHub Actions on one commit and says how each run ended: the test
# run, and the deploy run when the push deployed. Exits 1 if any run failed.
#   tools/ci_wait.sh [<commit>] [--timeout MIN]    default: main on GitHub, 60 min
# gh's --commit filter matches only a full SHA; a short one matches nothing and a
# hand-written wait loop then waits forever, so the commit is resolved in full here.
# A read that fails (network, rate limit) keeps the last answer and tries again:
# one reset connection once ended a 40-minute wait (2026-10-19). The default limit
# outlasts the deploy job's 20 minutes (tools/test_ci_wait.py checks).
set -euo pipefail

ref=origin/main timeout=60
while [ $# -gt 0 ]; do
  case "$1" in
    --timeout) timeout=${2:?--timeout needs minutes}; shift 2 ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "🛑 unknown flag $1 (just ci-wait --help)" >&2; exit 2 ;;
    *) ref=$1; shift ;;
  esac
done
command -v gh >/dev/null || { echo "🛑 gh is not installed: it reads the runs (cli.github.com)" >&2; exit 2; }
git fetch -q origin main
sha=$(git rev-parse --verify --quiet "$ref^{commit}") || { echo "🛑 no commit $ref here" >&2; exit 2; }

echo "⏳ waiting for GitHub Actions on ${sha:0:7} ($(git log -1 --format=%s "$sha" | cut -c1-60))"
end=$(( $(date +%s) + timeout * 60 ))
runs= misses=0
while :; do
  if next=$(gh run list --commit "$sha" --json workflowName,status,conclusion,databaseId \
    -q '.[] | "\(.workflowName)\t\(.status)\t\(.conclusion)\t\(.databaseId)"' 2>/dev/null); then
    runs=$next misses=0
  else
    misses=$((misses + 1))
    [ "$misses" = 3 ] && echo "⚠️ GitHub has not answered for a minute (network? rate limit?); still waiting" >&2
  fi
  # Done when the test run is there and nothing is still queued or running.
  if grep -q $'^test\t' <<<"$runs" && ! cut -f2 <<<"$runs" | grep -qv '^completed$'; then break; fi
  if [ "$(date +%s)" -ge "$end" ]; then echo "🛑 not finished after $timeout min:"; echo "${runs:-no runs yet}"; exit 1; fi
  sleep 20
done

bad=0
while IFS=$'\t' read -r name _ conclusion id; do
  if [ "$conclusion" = success ]; then echo "✅ $name"
  else echo "❌ $name: $conclusion (gh run view $id --log-failed)"; bad=1; fi
done <<<"$runs"
exit $bad
