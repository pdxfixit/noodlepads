#!/bin/sh
# The Node half of `just test`: every test file under Node's own runner, with
# the spec reporter as on GitHub, and beside it tests/unended-reporter.mjs,
# which lists the files a cut run left a test unreported in.
#
# --test-force-exit (the app's test files never end by themselves) can cut a
# parallel run's last reports, on Node 22 and 26 alike (2026-10-19): the spec
# reporter then prints that test as "▶ name" and the run can still exit 0.
# Until 2026-10-26 that was only said, and `just test`, and the deploy that
# trusts its exit code, passed. Now each such file runs again alone and its
# exit code counts. A "▶" with no file named fails: nothing says which to rerun.
# Arguments go to node --test (test files; none means all of them).
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/noodle-node-tests.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
{
  node --test --test-force-exit \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter="$here/tests/unended-reporter.mjs" --test-reporter-destination="$tmp/cut" "$@"
  echo $? > "$tmp/rc"
} 2>&1 | tee "$tmp/log"
rc=$(cat "$tmp/rc")
if grep -q '^▶ ' "$tmp/log" || [ -s "$tmp/cut" ]; then
  echo "⚠️ started, but its end was never reported (--test-force-exit cut the run short):"
  grep '^▶ ' "$tmp/log"
  if [ ! -s "$tmp/cut" ]; then
    echo "✖ no file was named for these: run the suite again (node --test --test-force-exit --test-reporter=spec <file> runs one)"
    rc=1
  else
    while IFS= read -r file; do
      name=${file#"$here/"}
      if node --test --test-force-exit --test-reporter=spec "$file" > "$tmp/alone" 2>&1; then
        echo "↻ $name, run alone, passes"
      else
        cat "$tmp/alone"
        echo "✖ $name fails when run alone"
        rc=1
      fi
    done < "$tmp/cut"
  fi
fi
exit "$rc"
