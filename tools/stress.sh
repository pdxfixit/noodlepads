#!/bin/sh
# just stress [runs] [busy] [test files…]: runs the Node tests `runs` times
# (default 10) with `busy` cores kept busy (default 6), to catch a test that
# fails only under a loaded full `just test`. With no files, the whole suite.
# Each failing run's output is kept; the last line counts the failures.
set -u
runs=${1:-10}
busy=${2:-6}
[ $# -gt 0 ] && shift
[ $# -gt 0 ] && shift
out=$(mktemp -d "${TMPDIR:-/tmp}/noodle-stress.XXXXXX")
pids=""
i=0
while [ "$i" -lt "$busy" ]; do
  node -e 'for (;;) {}' &
  pids="$pids $!"
  i=$((i + 1))
done
trap 'kill $pids 2>/dev/null' EXIT INT TERM
fails=0
n=1
while [ "$n" -le "$runs" ]; do
  if node --test --test-force-exit "$@" > "$out/run$n.txt" 2>&1; then
    rm -f "$out/run$n.txt"
    echo "run $n/$runs ✅"
  else
    fails=$((fails + 1))
    echo "run $n/$runs ❌"
    grep -E '^✖ |test\.mjs:[0-9]+:[0-9]+\)$' "$out/run$n.txt" | grep -v 'failing tests' | sort -u | head -6 | sed 's/^/    /'
  fi
  n=$((n + 1))
done
if [ "$fails" -eq 0 ]; then
  rmdir "$out"
  echo "0 of $runs runs failed with $busy cores busy."
else
  echo "$fails of $runs runs failed with $busy cores busy. Their output: $out"
  exit 1
fi
