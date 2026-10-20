#!/usr/bin/env python3
"""Bump the release in web/version.js (`just version`). Ported from Isopix.

The release is semver, MAJOR.MINOR.PATCH, and PATCH is the number of commits
in the tree once the release is committed: `git rev-list --count HEAD` + 1,
since the bump goes in the same commit as the change (in a merge, both sides'
count + 1). It only ever goes up. The deploy labels version.json from it
(site/site.conf release=): v<release>-<short commit>.

    python3 tools/bump_version.py           bump PATCH and print old -> new
    python3 tools/bump_version.py minor     MINOR + 1 (major: MAJOR + 1, MINOR 0)
    python3 tools/bump_version.py --show    print the current release only
    python3 tools/bump_version.py --check   exit 1 unless the release's PATCH is
                                            the commit count of the commit that
                                            set it (CI, just ship; full history)
    python3 tools/bump_version.py --restamp when HEAD set web/version.js, make its
                                            PATCH HEAD's own commit count (just
                                            land runs it after each pick: a
                                            landing on a newer main moves the count)
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "web" / "version.js"
PATTERN = re.compile(r"export const RELEASE = '([^']+)';")
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def line(stamp):
    return f"export const RELEASE = '{stamp}';"


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=True).stdout.strip()


def commits(rev="HEAD"):
    """Commits in the tree at rev; 0 before the first commit."""
    try:
        return int(git("rev-list", "--count", rev))
    except subprocess.CalledProcessError:
        return 0


def bumped(old, part, count):
    """The next release after old. Pure. A release that is not semver ("1.0") starts at 1.0."""
    m = SEMVER.match(old)
    major, minor = (int(m.group(1)), int(m.group(2))) if m else (1, 0)
    if part == "major":
        major, minor = major + 1, 0
    elif part == "minor":
        minor += 1
    return f"{major}.{minor}.{count + 1}"


def goes_down(old, new):
    """Why new is below old, or None. Pure. A release only ever goes up:
    a lower PATCH means the commit count is wrong (a shallow clone counts
    only the commits it fetched)."""
    a, b = SEMVER.match(old), SEMVER.match(new)
    if not a or not b:
        return None
    if tuple(map(int, b.groups())) >= tuple(map(int, a.groups())):  # equal: bumped twice before committing
        return None
    return (f"{new} is below {old}: the commit count looks wrong. "
            f"In a shallow clone run 'git fetch --unshallow' first.")


def restamped(stamp, count):
    """The release with PATCH set to count, or None when it already is (or is not semver). Pure."""
    m = SEMVER.match(stamp)
    if not m or int(m.group(3)) == count:
        return None
    return f"{m.group(1)}.{m.group(2)}.{count}"


def check_problem(stamp, count):
    """Why a committed release is wrong for the commit that set it, or None. Pure."""
    m = SEMVER.match(stamp)
    if m and int(m.group(3)) == count:
        return None
    return (f"web/version.js says {stamp}, but its commit is commit {count}: PATCH must be {count}. "
            f"Run 'just version' before committing a change to web/.")


def merging():
    return subprocess.run(["git", "-C", str(ROOT), "rev-parse", "-q", "--verify", "MERGE_HEAD"],
                          capture_output=True).returncode == 0


def behind():
    """Commits behind the one about to be made: HEAD's, or in a merge both sides'
    (a merge of main brings main's commits into the count)."""
    return int(git("rev-list", "--count", "HEAD", "MERGE_HEAD")) if merging() else commits()


def refuse_shallow(then=""):
    if git("rev-parse", "--is-shallow-repository") == "true":
        sys.exit(f"🛑 this clone is shallow, so its commit count is wrong: run 'git fetch --unshallow'{then}")


def stamp_of(text):
    m = PATTERN.search(text)
    if not m:
        sys.exit(f"❌ no \"export const RELEASE = '…';\" line in {FILE}")
    return m


def check():
    refuse_shallow()
    last = git("log", "-1", "--format=%H", "--", "web/version.js")
    if not last:
        sys.exit("🛑 web/version.js has never been committed")
    stamp = stamp_of(git("show", f"{last}:web/version.js")).group(1)
    problem = check_problem(stamp, commits(last))
    if problem:
        sys.exit(f"🛑 {problem} (commit {last[:7]})")
    print(f"✅ web/version.js {stamp}: PATCH is the commit count of {last[:7]}")


def restamp():
    if "web/version.js" not in git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n"):
        return  # this commit does not set the release
    refuse_shallow()
    text = FILE.read_text()
    m = stamp_of(text)
    new = restamped(m.group(1), commits())
    if new:
        FILE.write_text(text.replace(m.group(0), line(new)))
        print(f"🏷️  {m.group(1)} -> {new}  (web/version.js: this commit is commit {commits()} on main)")


def main():
    args = sys.argv[1:]
    if "--check" in args:
        return check()
    if "--restamp" in args:
        return restamp()
    text = FILE.read_text()
    m = stamp_of(text)
    old = m.group(1)
    if "--show" in args:
        print(old)
        return
    part = args[0] if args else "patch"
    if part not in ("patch", "minor", "major"):
        sys.exit(f"❌ unknown part {part!r}: patch, minor or major")
    refuse_shallow(", then 'just version'")
    new = bumped(old, part, behind())
    problem = goes_down(old, new)
    if problem:
        sys.exit(f"🛑 {problem}")
    FILE.write_text(text.replace(m.group(0), line(new)))
    print(f"🏷️  {old} -> {new}  (web/version.js; commit it with the change)")


if __name__ == "__main__":
    main()
