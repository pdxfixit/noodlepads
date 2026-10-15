#!/bin/sh
# A Claude Code cloud session's setup: what this repo needs that the container
# lacks, so `just test`, `just look` and `just doctor` work there. Run by the
# environment's setup script (docs/how-to.md, "Where you run things"); safe to
# run again. Installs just, pinned to the version CI uses
# (.github/workflows/test.yml). Node 22+, python3 and Chromium come with the
# container; tools/chrome.mjs finds that Chromium by itself.
#
# Never deploys and never sets up wrangler: deploying goes through flarepress
# on Ben's Mac.
set -eu

JUST_VERSION=1.58.0
BIN=/usr/local/bin

if command -v just > /dev/null && [ "$(just --version | cut -d' ' -f2)" = "$JUST_VERSION" ]; then
  echo "✅ just $JUST_VERSION"
else
  mkdir -p "$BIN"
  curl -sSfL "https://github.com/casey/just/releases/download/$JUST_VERSION/just-$JUST_VERSION-x86_64-unknown-linux-musl.tar.gz" \
    | tar xz -C "$BIN" just
  echo "✅ installed $(just --version)"
fi

# Report, never fail, on the rest: a session without them can still edit and commit.
node -e 'process.exit(typeof WebSocket === "function" ? 0 : 1)' 2> /dev/null \
  && echo "✅ node $(node --version)" \
  || echo "⚠️  node 22+ missing: just test and just look need it"
[ -x /opt/pw-browsers/chromium ] \
  && echo "✅ Chromium for just look" \
  || echo "⚠️  no /opt/pw-browsers/chromium: just look needs CHROME=/path/to/chrome"
