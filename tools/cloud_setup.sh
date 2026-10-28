#!/usr/bin/env bash
# Cloud session setup (claude.ai/code), so an agent there can test, look and
# land as on Ben's Mac. Cloud sessions never deploy: GitHub does, with this
# repo's own token (.github/workflows/deploy.yml). Idempotent and quick when
# already done; it never fails the session. The same script as Isopix's
# (Ben, 2026-10-28: the two apps work alike).
#
# Run it from the cloud environment's setup script:
#   f=/home/user/noodlepads/tools/cloud_setup.sh; [ -f "$f" ] && bash "$f" || true
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
JUST_VERSION=1.58.0
say() { echo "☁️  $*"; }

# just (stdlib-only Python wheel; pip reaches PyPI on the default network level)
if ! command -v just >/dev/null || [ "$(just --version 2>/dev/null)" != "just $JUST_VERSION" ]; then
  pip install -q "rust-just==$JUST_VERSION" >/dev/null 2>&1 && say "just $JUST_VERSION installed" || say "⚠️ could not install just"
fi

# This clone: the commit and push hooks (.githooks).
if [ -e "$ROOT/.git" ] && command -v just >/dev/null; then
  (cd "$ROOT" && just setup >/dev/null 2>&1) && say "git: commit and push hooks on"
fi

# Cloud clones can be shallow: `just version` counts every commit.
if [ "$(git -C "$ROOT" rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  git -C "$ROOT" fetch -q --unshallow 2>/dev/null && say "git: full history fetched (just version counts commits)" || say "⚠️ could not fetch the full history: run 'git fetch --unshallow' before 'just version'"
fi

# A Cloudflare token here would let any agent change every site in the
# account: deploys need none in a session.
[ -z "${CLOUDFLARE_API_TOKEN:-}" ] || say "⚠️ CLOUDFLARE_API_TOKEN is set in this environment: remove it (cloud environment settings); GitHub deploys"
exit 0
