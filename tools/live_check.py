#!/usr/bin/env python3
"""The live site is up and working: CI's daily live.yml, or `just live-check`.

One rule: down or broken is never excused. `/` and `/version.json` must answer
200, and `/api/cloud` must answer {"ok":true,...} (a read: it writes nothing). A
miss is retried 3 times, 20 s apart, to ride out a blip, then fails. Which
commit is live is not checked: deploy.yml deploys every push to main, and a
failed deploy is already a red run there.

Stdlib only (Python 3.8+). The decision is pure (`decide`); the network and the
clock come in as arguments, so tools/test_live_check.py drives every case.

    python3 tools/live_check.py [URL]        (default https://noodlepads.com)
"""
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

PAGES = ["/", "/version.json", "/api/cloud"]
TRIES = 3
WAIT_S = 20


def page_ok(path, status, text):
    """A page answered as it should: 200, and /api/cloud says ok."""
    if status != 200:
        return False
    if path == "/api/cloud":
        try:
            return json.loads(text).get("ok") is True
        except (ValueError, AttributeError):
            return False
    return True


def check_pages(fetch, sleep, pages=PAGES, tries=TRIES, wait=WAIT_S):
    """{page: (status, text)}. fetch(path) -> (status, text); retries the misses."""
    out = {}
    for attempt in range(tries + 1):
        todo = [p for p in pages if p not in out or not page_ok(p, *out[p])]
        if not todo:
            break
        if attempt:
            sleep(wait)
        for p in todo:
            out[p] = fetch(p)
    return out


def decide(pages):
    """-> (ok, lines). Pure: pages is {path: (status, text)}."""
    lines, ok = [], True
    for path, (status, text) in pages.items():
        if page_ok(path, status, text):
            lines.append(f"✅ {path} {status}")
        else:
            what = "not ok" if status == 200 else f"answered {status or 'nothing'}"
            lines.append(f"❌ {path} {what} after {TRIES} retries: the site is down or broken")
            ok = False
    return ok, lines


def main():
    url = (sys.argv[1] if len(sys.argv) > 1 else "https://noodlepads.com").rstrip("/")

    def fetch(path):
        req = urllib.request.Request(f"{url}{path}?ci={random.randrange(1 << 30)}", headers={"User-Agent": "noodle-pads-live-check"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, ""
        except Exception:
            return 0, ""

    ok, lines = decide(check_pages(fetch, time.sleep))
    print("\n".join(lines))
    if os.environ.get("GITHUB_ACTIONS") and not ok:
        print(f"::error::{[l for l in lines if l.startswith('❌')][0]}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
