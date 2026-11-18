#!/usr/bin/env python3
"""The council's tripwire: `just council-tripwire [N]` (docs/council.md, "Guarding against drift").

Each commit names the seats that reviewed it in a `Council:` trailer, such as
`Council: privacy-safety ✅, kids-ux ✏️, audio-engineer ⛔→✅, android ➖`. A seat whose
last N reviews (default 10) were all a plain ✅ has drifted or sits in the
wrong rounds: its prompt gets rewritten, or it is proposed for a merge, which
Ben approves. Anything but a plain ✅ (✏️, ⛔, ⛔→✅) is a finding and resets
the count. ➖ ("nothing here for my lens") neither counts nor resets: every
seat sits on every change (Ben, 2026-11-18), so a seat a change doesn't touch
is not drifting.

`just council-check [REV]` (`check`) names the seats in docs/council.md that a
commit's trailer leaves out, or a `none` trailer: every change gets them all.

Stdlib only. The rule is pure (`parse`, `streaks`); git is read in `main`, so
tools/test_council.py drives every case.

    python3 tools/council.py [N]
    python3 tools/council.py check [REV]
"""
import re
import subprocess
import sys

PASS = "✅"
NOT_MINE = "➖"   # the change has nothing for this seat's lens
ROSTER = re.compile(r"^\| [^|]+ \| `council-([a-z0-9-]+)` \| [^|]+ \| (?:opus|sonnet|haiku) \|$", re.M)


def parse(trailer):
    """One `Council:` value to [(seat, verdict)]; `none (fix)` names no seat."""
    out = []
    for part in trailer.split(","):
        m = re.match(r"\s*([a-z][a-z0-9-]*)\s+(\S+)\s*$", part)
        if m and m.group(1) != "none":
            out.append((m.group(1), m.group(2)))
    return out


def streaks(trailers):
    """Trailers newest first to {seat: plain passes in a row, from the newest}."""
    count, done = {}, set()
    for trailer in trailers:
        for seat, verdict in parse(trailer):
            if seat in done or verdict == NOT_MINE:
                continue
            if verdict == PASS:
                count[seat] = count.get(seat, 0) + 1
            else:
                count.setdefault(seat, 0)
                done.add(seat)
    return count


def tripped(trailers, n):
    return sorted((s, c) for s, c in streaks(trailers).items() if c >= n)


def roster(council_md):
    """The seats in docs/council.md's table, by their file names without `council-`."""
    return ROSTER.findall(council_md)


def missing(trailer, seats):
    """The seats a commit's trailer leaves out, in roster order. A `none` trailer leaves out all."""
    named = {seat for seat, _ in parse(trailer)}
    return [s for s in seats if s not in named]


def check(rev):
    out = subprocess.run(["git", "log", "-1", "--format=%(trailers:key=Council,valueonly,separator=%x2C)", rev],
                         capture_output=True, text=True, check=True).stdout.strip()
    with open("docs/council.md", encoding="utf-8") as f:
        seats = roster(f.read())
    if not out:
        print(f"❌ {rev}: git finds no Council: trailer. It must sit in the message's last paragraph,")
        print("   on the line right above Co-Authored-By, with no blank line between them.")
        return 1
    gone = missing(out, seats)
    if not gone:
        print(f"✅ {rev}: all {len(seats)} seats reviewed it")
        return 0
    print(f"❌ {rev}: the Council: trailer leaves out {len(gone)} of {len(seats)} seats: {', '.join(gone)}")
    print("   Every change gets the full council (docs/council.md, \"When it convenes\").")
    return 1


def main(argv):
    if len(argv) > 1 and argv[1] == "check":
        return check(argv[2] if len(argv) > 2 else "HEAD")
    n = int(argv[1]) if len(argv) > 1 else 10
    log = subprocess.run(["git", "log", "--format=%(trailers:key=Council,valueonly,separator=%x2C)%x00"],
                         capture_output=True, text=True, check=True).stdout
    trailers = [t.strip() for t in log.split("\0") if t.strip()]
    hits = tripped(trailers, n)
    if not hits:
        print(f"✅ no seat has {n} plain passes in a row ({len(trailers)} reviewed commits)")
        return 0
    for seat, c in hits:
        print(f"⚠️ council-{seat}: {c} plain passes in a row; rewrite its prompt or propose a merge (Ben approves)")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
