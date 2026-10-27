#!/bin/sh
# Syntax-check every module: web/, worker/ and the Node tools. The first step
# of `just test` and of the pre-commit hook (.githooks/pre-commit), so a typo
# is refused before any test or commit. About 4 s. node --check takes one file
# at a time: given several, it checks only the first.
cd "$(dirname "$0")/.." || exit 1
for f in web/*.js worker/*.js tools/*.mjs; do
  [ -e "$f" ] || continue
  node --check "$f" || exit 1
done
