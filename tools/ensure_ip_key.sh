#!/usr/bin/env bash
# Gives the Worker its IP_HASH_KEY secret when it has none: tools/ensure_ip_key.sh <wrangler.sh> <site>
# The new-profile cap per address (worker/cloud.js ipCounterName) keys its
# counts with it. Made here from random bytes and put by wrangler from stdin,
# so nobody holds it: not a GitHub secret, not the chat, not a file. Left alone
# when there already is one, because a new key would start the day's counts
# again (no address is ever stored; the key only scrambles it).
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: ensure_ip_key.sh <wrangler.sh> <site>" >&2; exit 2; }
WRANGLER=$1; SITE=$2
# Read into a variable first: `grep -q` leaving early would break the pipe and fail the check.
listed=$("$WRANGLER" "$SITE" secret list --format json 2>/dev/null || true)
if printf '%s' "$listed" | grep -q '"IP_HASH_KEY"'; then
  echo "IP_HASH_KEY is already in the Worker."
  exit 0
fi
openssl rand -hex 32 | "$WRANGLER" "$SITE" secret put IP_HASH_KEY
echo "IP_HASH_KEY put into the Worker."
