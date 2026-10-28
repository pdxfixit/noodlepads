#!/bin/sh
# The Node half of `just test`: every test file under Node's own runner, with
# the spec reporter as on GitHub. Arguments go to node --test (test files;
# none means all of them). The exit code is node's.
#
# Each file ends by itself when its tests are done: tests/file-end.mjs is
# preloaded into every file (--import), stops what the stand-in page started
# (tests/fake-dom.mjs), and fails a file that is still alive 10 s later,
# naming it and what holds it. So there is no --test-force-exit, which cut a
# parallel run's last reports (2026-10-19), and no second reporter to find
# what it cut (it was tests/unended-reporter.mjs until 2026-10-28).
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
exec node --test --test-reporter=spec --import "$here/tests/file-end.mjs" "$@"
