#!/usr/bin/env python3
"""The council's tripwire: `just council-tripwire [N]` (docs/council.md, "Guarding against drift").

Each commit names the seats that reviewed it in a `Council:` trailer, such as
`Council: privacy-safety ✅, kids-ux ✏️, audio-engineer ⛔→✅`. A seat whose
last N reviews (default 10) were all a plain ✅ has drifted or sits in the
wrong rounds: its prompt gets rewritten, or it is proposed for a merge, which
Ben approves. Anything but a plain ✅ (✏️, ⛔, ⛔→✅) is a finding and resets
the count.

Stdlib only. The rule is pure (`parse`, `streaks`); git is read in `main`, so
tools/test_council.py drives every case.

    python3 tools/council.py [N]
"""
import re
import subprocess
import sys

PASS = "✅"


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
            if seat in done:
                continue
            if verdict == PASS:
                count[seat] = count.get(seat, 0) + 1
            else:
                count.setdefault(seat, 0)
                done.add(seat)
    return count


def tripped(trailers, n):
    return sorted((s, c) for s, c in streaks(trailers).items() if c >= n)


def main(argv):
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
