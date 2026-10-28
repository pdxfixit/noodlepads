#!/usr/bin/env python3
"""How loud each preset seems as the app plays it on a phone, against the
middle of them all, and the boards.json `level` that evens it out
(`just preset-loudness`, `just preset-loudness --fix`).

The app scales every sound so its loudest moment is the same (web/voices.js
`finish`), so a file's own level says nothing about how loud it plays, and
turning a WAV file up or down changes nothing. This measures each preset
the way it is heard: moved to its note or chord as web/instruments.js
`voice` does, raised to the app's peak, with what a phone speaker cannot
play (under about 180 Hz) taken off and a gentle lift above 1.5 kHz, as
ears hear it, over its loudest 400 ms. A preset's `level` in
web/boards.json (dB, never above 0) turns it down after that.

Every preset plays as loud as the middle (Ben, 2026-10-23: "make sure that
the sound level is the same"): `--fix` gives each one more than EVEN dB
over the middle the `level` that brings it there, and takes it away from
one that no longer needs it. A level cannot turn a sound up, so the few
under the middle stay as they are (the kicks and booms: most of what they
play is too low for a phone speaker). tools/test_preset_loudness.py fails
until boards.json has the levels this works out.

Stdlib only. Prints the quietest and loudest, in dB from the middle.
"""
import array
import signal
import json
import math
import statistics
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit_instruments import with_kit  # noqa: E402

WEB = Path(__file__).resolve().parent.parent / "web"
BOARDS = WEB / "boards.json"
PEAK = 0.9        # what voices.js finish() scales every sound to
PHONE_HZ = 180    # a phone speaker plays little under this
WINDOW = 0.4      # seconds: the loudest stretch of a tap
EVEN = 1.0        # dB over the middle that still counts as even (web/loudness.js EVEN_ENOUGH)
STEP = 0.5        # levels are written to the nearest half dB

# Presets Ben hears as too loud even at the middle, and how many dB under it
# each plays. The measure underrates pure tones where ears are keenest
# (2 to 4 kHz): Computer's bleeps are sine waves at 1.8 to 3.4 kHz.
BY_EAR = {
    "computer": -10,   # Ben, 2026-10-24: "just too loud… should be a lot quieter"
}


# The quietest a preset may play, in dB from the middle (2026-10-28). `--fix`
# cannot turn a sound up, so a sound under this is remade (tools/make_placeholders.py).
# Chosen from the spread: after heartbeat, boom, kick-dusty, dhol and vinyl were
# remade, the quietest recordings are upright-c at -8.1 and kick at -8.0, so
# -8.5 leaves them and catches anything below. BY_EAR presets are turned down on
# purpose and are exempt.
FLOOR = -8.5


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


def voiced(samples, semitones):
    """`samples` played at each of `semitones` at once and summed, as
    web/instruments.js `voice` moves a recording to a note or a chord (the
    peak does not matter: heard() raises it to the app's)."""
    rates = [2 ** (s / 12) for s in semitones]
    n = len(samples)
    out = [0.0] * max(1, *(int((n - 1) / r) for r in rates))
    at = lambda i: samples[i] if 0 <= i < n else 0.0  # noqa: E731
    for r in rates:
        for j in range(int((n - 1) / r)):
            p = j * r
            i = int(p)
            f = p - i
            a, b, c, d = at(i - 1), samples[i], at(i + 1), at(i + 2)
            out[j] += b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)))
    return out


def voicing(k):
    """The semitones a preset moves its file by, or None (instruments.js voicingOf)."""
    if k.get("chord"):
        return tuple(k["chord"])
    if k.get("shift"):
        return (k["shift"],)
    return None


def read(path):
    with wave.open(str(path)) as w:
        pcm = array.array("h", w.readframes(w.getnframes()))
        if sys.byteorder == "big":
            pcm.byteswap()
        return [v / 32768 for v in pcm], w.getframerate()


def kit():
    return json.loads(BOARDS.read_text(encoding="utf-8"))["kit"]


def measure(presets=None):
    """[(dB from the middle as it plays now, dB from the middle with no
    level, preset)] for every preset. The middle is the median of the
    presets shown with Advanced off, one per file, with no level: the
    yardstick web/loudness.js PRESET_LOUDNESS is too."""
    presets = presets if presets is not None else kit()
    files, raw = {}, {}
    for k in presets:
        key = (k["file"], voicing(k))
        if key not in raw:
            if k["file"] not in files:
                files[k["file"]] = read(WEB / k["file"])
            samples, rate = files[k["file"]]
            raw[key] = heard(voiced(samples, key[1]) if key[1] else samples, rate)
    shown = {k["file"]: raw[(k["file"], None)] for k in presets if not k.get("advanced") and not k.get("inst")}
    middle = statistics.median(shown.values())
    return [(raw[(k["file"], voicing(k))] - middle + k.get("level", 0.0), raw[(k["file"], voicing(k))] - middle, k)
            for k in presets]


def levels(rows):
    """{id: level} every preset should have: enough to bring one more than
    EVEN dB over the middle down to it, to the nearest STEP, then its BY_EAR
    turn-down below the middle."""
    want = {}
    for _, over, k in rows:
        v = (-round(over / STEP) * STEP if over > EVEN else 0) + BY_EAR.get(k["id"], 0)
        if v:
            want[k["id"]] = max(-24, v)
    return {i: int(v) if v == int(v) else v for i, v in want.items()}


def fixed(text, rows):
    """boards.json's text with every preset's `level` set as levels() says."""
    want = levels(rows)
    presets = json.loads(text)["kit"]
    for k in presets:
        k.pop("level", None)
        if k["id"] in want:
            k["level"] = want[k["id"]]
    return with_kit(text, presets)


def main(argv):
    rows = measure()
    if "--fix" in argv:
        text = BOARDS.read_text(encoding="utf-8")
        new = fixed(text, rows)
        if new != text:
            BOARDS.write_text(new, encoding="utf-8")
        print(f"🔊 web/boards.json: {len(levels(rows))} presets have a level" if new != text else "🔊 web/boards.json already even")
        rows = measure()
    rows.sort(key=lambda r: r[0])
    for row in rows[:8] + [None] + rows[-8:]:
        print("  …" if row is None else f"{row[0]:+6.1f} dB  {row[2]['id']} ({row[2]['group']})")
    loud = [r for r in rows if r[0] > EVEN + STEP / 2]
    if loud:
        print(f"⚠️  {len(loud)} presets are over the middle: run `just preset-loudness --fix`")
        return 1
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)   # `| head` ends it quietly
    sys.exit(main(sys.argv[1:]))
