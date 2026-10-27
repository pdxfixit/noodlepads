#!/bin/sh
# Syntax-check every module and tool: web/, worker/ and the Node tools
# (node --check), the Python tools (parsed, never run; no __pycache__ left) and
# the shell tools and git hooks (bash -n). The first step of `just test` and of
# the pre-commit hook (.githooks/pre-commit), so a typo is refused before any
# test or commit. About 4 s. node --check takes one file at a time: given
# several, it checks only the first.
cd "$(dirname "$0")/.." || exit 1
for f in web/*.js worker/*.js tools/*.mjs; do
  [ -e "$f" ] || continue
  node --check "$f" || exit 1
done
for f in tools/*.sh .githooks/*; do
  [ -e "$f" ] || continue
  bash -n "$f" || exit 1
done
for f in tools/*.py skills/*/*.py; do
  [ -e "$f" ] || continue
  python3 -c 'import ast, sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])' "$f" || exit 1
done
