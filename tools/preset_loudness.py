#!/usr/bin/env python3
"""How loud each shown preset seems as the app plays it on a phone, against
the middle of them all (`just preset-loudness`).

The app scales every sound so its loudest moment is the same (web/voices.js
`finish`), so a file's own level says nothing about how loud it plays. This
measures each preset the way it is heard: raised to the app's peak, with what
a phone speaker cannot play (under about 180 Hz) taken off and a gentle lift
above 1.5 kHz, as ears hear it, over its loudest 400 ms. A preset's
`level` in web/boards.json (dB, never above 0) turns it down after that
(Ben, 2026-10-17: fix the few that are clearly off).

Stdlib only. Prints the quietest and loudest, in dB from the middle.
"""
import array
import json
import math
import statistics
import sys
import wave
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"
PEAK = 0.9        # what voices.js finish() scales every sound to
PHONE_HZ = 180    # a phone speaker plays little under this
WINDOW = 0.4      # seconds: the loudest stretch of a tap


def _highpass(x, rate, hz):
    a = math.exp(-2 * math.pi * hz / rate)
    for _ in range(2):
        out, prev, y = [], 0.0, 0.0
        for v in x:
            y = a * (y + v - prev)
            prev = v
            out.append(y)
        x = out
    return x


def _lift(x, rate, hz=1500, amount=0.58):
    """About +4 dB above `hz`: ears hear the upper middle loudest."""
    a = math.exp(-2 * math.pi * hz / rate)
    out, prev, y = [], 0.0, 0.0
    for v in x:
        y = a * (y + v - prev)
        prev = v
        out.append(v + amount * y)
    return out


def heard(samples, rate, level_db=0.0):
    """How loud `samples` seem as the app plays them on a phone, in dB."""
    peak = max((abs(v) for v in samples), default=0.0) or 1.0
    gain = PEAK / peak * 10 ** (level_db / 20)
    y = _lift(_highpass([v * gain for v in samples], rate, PHONE_HZ), rate)
    win = max(1, int(WINDOW * rate))
    if len(y) <= win:
        best = sum(v * v for v in y) / max(1, len(y))
    else:
        best = max(sum(v * v for v in y[i:i + win]) / win for i in range(0, len(y) - win + 1, win // 4))
    return 10 * math.log10(best + 1e-12)


def read(path):
    with wave.open(str(path)) as w:
        pcm = array.array("h", w.readframes(w.getnframes()))
        if sys.byteorder == "big":
            pcm.byteswap()
        return [v / 32768 for v in pcm], w.getframerate()


def table():
    """[(dB from the middle, kit id, group)] for every preset shown with
    Advanced off, one per file (an instrument's notes share a recording)."""
    kit = json.loads((WEB / "boards.json").read_text())["kit"]
    shown = {}
    for k in kit:
        if not k.get("advanced") and not k.get("inst"):
            shown.setdefault(k["file"], k)
    rows = []
    for file, k in shown.items():
        samples, rate = read(WEB / file)
        rows.append((heard(samples, rate, k.get("level", 0.0)), k["id"], k["group"]))
    middle = statistics.median(r[0] for r in rows)
    return sorted((round(d - middle, 1), i, g) for d, i, g in rows)


if __name__ == "__main__":
    rows = table()
    for row in rows[:8] + [None] + rows[-8:]:
        print("  …" if row is None else f"{row[0]:+6.1f} dB  {row[1]} ({row[2]})")
