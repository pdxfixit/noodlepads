#!/usr/bin/env python3
"""The live site against this checkout: CI's daily live.yml, or `just live-check`.

Two rules, the same as isogrid's (fewer failure emails, never a missed outage):

- Down or broken is never excused. `/` and `/version.json` must answer 200, and
  `/api/cloud` must answer {"ok":true,...} (a read: it writes nothing). A miss is
  retried 3 times, 20 s apart, to ride out a blip, then fails.
- Behind main gets one hour. Every commit to main is deployed, so the live
  version names a commit; what matters is whether that commit's web/ and
  worker/ are main's. When they differ, a deploy may be in flight: if main
  last changed them under 60 minutes ago this passes with a notice; older, or a
  live version that is not a commit here, fails. A -dirty live version (deployed
  with uncommitted edits) always fails.

Stdlib only (Python 3.8+). The decision is pure (`decide`); the network, git and
the clock come in as arguments, so tools/test_live_check.py drives every case.

    python3 tools/live_check.py [URL]        (default https://noodlepads.com)
"""
import json
import os
import random
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["/", "/version.json", "/api/cloud"]
SHIPPED = ["web", "worker"]
GRACE_S = 60 * 60
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


def live_version(text):
    """The version in a version.json text, or None."""
    try:
        return json.loads(text).get("version")
    except (ValueError, AttributeError):
        return None


def commit_of(version):
    """The commit a git-describe version names: abc1234, v1-3-gabc1234, abc1234-dirty."""
    v = (version or "").replace("-dirty", "")
    return v.rsplit("-g", 1)[-1] if "-g" in v else v


def decide(pages, version, known, same, main_age_s, grace_s=GRACE_S):
    """-> (ok, lines, notice). Pure: every input is given.

    pages: {path: (status, text)}; version: the live version (or None);
    known: that commit exists here; same: its shipped paths equal main's;
    main_age_s: seconds since main last changed the shipped paths."""
    lines, ok, notice = [], True, None
    for path, (status, text) in pages.items():
        if page_ok(path, status, text):
            lines.append(f"✅ {path} {status}")
        else:
            what = "not ok" if status == 200 else f"answered {status or 'nothing'}"
            lines.append(f"❌ {path} {what} after {TRIES} retries: the site is down or broken")
            ok = False
    if not version:
        lines.append("❌ no live version (version.json unreadable)")
        return False, lines, notice
    if version.endswith("-dirty"):
        lines.append(f"❌ live {version} was deployed with uncommitted edits")
        ok = False
    if known and same:
        lines.append(f"✅ live {version} serves main's {', '.join(SHIPPED)}")
        return ok, lines, notice
    mins = int(main_age_s // 60)
    why = "differs from main's" if known else "is not a commit in this repo"
    if main_age_s < grace_s:
        notice = f"deploy in flight: live {version} {why} {'/'.join(SHIPPED)}, changed on main {mins} min ago"
        lines.append(f"⏳ {notice}")
    else:
        lines.append(f"❌ live {version} {why} {'/'.join(SHIPPED)}, changed on main {mins} min ago: "
                     "main moved on without a deploy, or the deploy did not land")
        ok = False
    return ok, lines, notice


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


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

    pages = check_pages(fetch, time.sleep)
    version = live_version(pages.get("/version.json", (0, ""))[1])
    sha = commit_of(version)
    known = bool(sha) and git("cat-file", "-e", f"{sha}^{{commit}}").returncode == 0
    same = known and git("diff", "--quiet", sha, "HEAD", "--", *SHIPPED).returncode == 0
    ct = git("log", "-1", "--format=%ct", "HEAD", "--", *SHIPPED).stdout.strip()
    age = time.time() - int(ct) if ct else float("inf")
    ok, lines, notice = decide(pages, version, known, same, age)
    print("\n".join(lines))
    if os.environ.get("GITHUB_ACTIONS") and notice:
        print(f"::notice::{notice}")
    if os.environ.get("GITHUB_ACTIONS") and not ok:
        print(f"::error::{[l for l in lines if l.startswith('❌')][0]}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
