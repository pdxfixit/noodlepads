#!/usr/bin/env python3
"""Make the recorded instruments' clips in web/clips/kit/ from CC0 sample
libraries (ADR 0030): VSCO 2 CE (github.com/sgossner/VSCO-2-CE) and VCSL
(github.com/sgossner/VCSL), both CC0 1.0.

`python3 -I tools/make_samples.py SOURCE_DIR` reads the few files named in
SAMPLES below from SOURCE_DIR (a folder holding `vsco/` and `vcsl/`, the two
libraries' trees as they are on GitHub, only those files checked out) and
writes each one as the kit's clips are: mono, 22050 Hz, 16-bit, the quiet
start cut off, a fixed length, faded out, peak at 85%. The libraries are not
in this repo; web/clips/kit/LICENSE-samples.txt names what came from where.

The downloads are someone else's files: keep them in a folder of their own,
outside web/, and run this with `python3 -I` so nothing in that folder can
load as code. It only reads them as data.

Stdlib only. tests/instruments.test.mjs hears each clip's note (pitch.js)
and checks it is the MIDI note given here, as boards.json's `root` says.
"""
import math
import struct
import wave
import sys
from array import array
from pathlib import Path

RATE = 22050
KIT_OUT = Path(__file__).resolve().parent.parent / "web" / "clips" / "kit"

# Each clip: (file name, library, path in it, MIDI note, seconds kept, seconds
# of fade at the end). VSCO names its octaves one lower than MIDI's C4 = 60
# (its "C3" is middle C), and so does VCSL's pipe organ (its "D#3" plays
# MIDI 63); the piano's file numbers are key numbers (MappingChart.txt).
SAMPLES = [
    ("piano-61", "vsco", "Keys/Upright Piano/Player_dyn2_rr1_020.wav", 61, 1.8, 0.5),
    ("piano-69", "vsco", "Keys/Upright Piano/Player_dyn2_rr1_024.wav", 69, 1.8, 0.5),
    ("strings-62", "vsco", "Strings/Violin Section/susVib/VlnEns_susVib_D3_v2.wav", 62, 1.5, 0.35),
    ("strings-69", "vsco", "Strings/Violin Section/susVib/VlnEns_susVib_A3_v2.wav", 69, 1.5, 0.35),
    ("brass-67", "vsco", "Brass/Trumpet/sus/Sum_SHTrumpet_sus_G3_v1_rr1.wav", 67, 1.3, 0.3),
    ("flute-64", "vsco", "Woodwinds/Flute/susvib/LDFlute_susvib_E3_v1_1.wav", 64, 1.3, 0.3),
    ("organ-63", "vcsl", "Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet/NT5_Man3Quiet_D#3_rr1.wav", 63, 1.4, 0.3),
    ("upright-40", "vsco", "Strings/Solo Contrabass/Pizz/BKCtbss_Pizz_E1_v3_rr1.wav", 40, 1.2, 0.4),
]


def read_wav(path):
    """(rate, mono samples -1..1) of a PCM WAV, 16 or 24 bit, any channels."""
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError(f"{path.name} is not a WAV file")
    pos, fmt, frames = 12, None, None
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b"fmt ":
            tag, channels, rate, _, _, bits = struct.unpack("<HHIIHH", body[:16])
            if tag not in (1, 0xFFFE) or bits not in (16, 24):
                raise ValueError(f"{path.name}: PCM 16 or 24 bit only")
            fmt = (channels, rate, bits)
        elif cid == b"data":
            frames = body
        pos += 8 + size + (size & 1)
    if not fmt or frames is None:
        raise ValueError(f"{path.name} has no fmt or data")
    channels, rate, bits = fmt
    width = bits // 8
    count = len(frames) // (width * channels)
    if bits == 16:
        pcm = array("h", frames[:count * channels * 2])
        if sys.byteorder == "big":
            pcm.byteswap()
        values = [v / 32768 for v in pcm]
    else:
        values = []
        for i in range(0, count * channels * 3, 3):
            v = frames[i] | frames[i + 1] << 8 | frames[i + 2] << 16
            values.append((v - (1 << 24) if v & 0x800000 else v) / 8388608)
    return rate, [sum(values[i:i + channels]) / channels for i in range(0, len(values), channels)]


def halve(samples):
    """Every second sample after a low-pass at a quarter of the rate (a 63-tap
    windowed sinc), so nothing above the new Nyquist folds back."""
    taps = 63
    mid = taps // 2
    h = []
    for k in range(taps):
        x = k - mid
        sinc = 0.5 if x == 0 else math.sin(math.pi * x / 2) / (math.pi * x)
        h.append(sinc * (0.42 - 0.5 * math.cos(2 * math.pi * k / (taps - 1)) + 0.08 * math.cos(4 * math.pi * k / (taps - 1))))
    norm = sum(h)
    h = [v / norm for v in h]
    n = len(samples)
    out = []
    for i in range(0, n, 2):
        acc = 0.0
        for k in range(taps):
            j = i + k - mid
            if 0 <= j < n:
                acc += h[k] * samples[j]
        out.append(acc)
    return out


def resample(samples, rate):
    if rate == RATE:
        return samples
    if rate == 2 * RATE:
        return halve(samples)
    if rate == 48000:   # to 44100 by linear steps, then halved
        step = rate / (2 * RATE)
        samples = [samples[int(p)] + (samples[min(int(p) + 1, len(samples) - 1)] - samples[int(p)]) * (p - int(p))
                   for p in (i * step for i in range(int(len(samples) / step)))]
        return halve(samples)
    raise ValueError(f"no resampling from {rate} Hz")


def cut(samples, seconds, release):
    """From just before the sound starts, `seconds` long, faded in over 3 ms
    and out over `release` seconds (a curve, as a note dies away)."""
    peak = max(abs(s) for s in samples) or 1.0
    start = next(i for i, s in enumerate(samples) if abs(s) > peak * 0.02)
    start = max(0, start - int(0.004 * RATE))
    out = samples[start:start + int(seconds * RATE)]
    fade_in = int(0.003 * RATE)
    for i in range(min(fade_in, len(out))):
        out[i] *= i / fade_in
    tail = int(release * RATE)
    for i in range(min(tail, len(out))):
        out[-1 - i] *= (i / tail) ** 2
    return out


def lift(samples, db, release=0.01):
    """`samples` `db` louder under the same peak: a limiter holds the
    loudest moments where they were, so the body of a hit comes up. A real
    drum is one sharp spike and a short body, and the app plays every sound
    at the same peak, so without this a recorded snare plays about 8 dB
    under a made one. The gain falls 2 ms ahead of each spike (no click) and
    comes back over `release` seconds."""
    if db <= 0:
        return samples
    from collections import deque
    ceiling = max(abs(s) for s in samples) or 1.0
    up = 10 ** (db / 20)
    x = [s * up for s in samples]
    n, ahead = len(x), max(1, int(0.002 * RATE))
    need = [min(1.0, ceiling / abs(v)) if v else 1.0 for v in x]
    # The least gain needed within `ahead` samples either side (a running minimum).
    low, q = [1.0] * n, deque()
    for i in range(n + ahead):
        if i < n:
            while q and need[q[-1]] >= need[i]:
                q.pop()
            q.append(i)
        j = i - ahead
        if j >= 0:
            while q[0] < j - ahead:
                q.popleft()
            low[j] = need[q[0]]
    back = 1 / (release * RATE)
    g, prev = [0.0] * n, 1.0
    for i in range(n):
        prev = min(low[i], prev + (1 - prev) * back)
        g[i] = prev
    # Smoothed over `ahead` samples, so the gain never steps.
    out, run, half = [], 0.0, ahead // 2
    for i in range(n + half):
        if i < n:
            run += g[i]
        if i - ahead >= 0:
            run -= g[i - ahead]
        j = i - half
        if j >= 0:
            out.append(x[j] * run / min(ahead, i + 1))
    return out


def write_wav(path, samples):
    peak = max(abs(s) for s in samples) or 1.0
    pcm = array("h", (int(max(-1.0, min(1.0, s * 0.85 / peak)) * 32767) for s in samples))
    if sys.byteorder == "big":
        pcm.byteswap()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


def main(args):
    if not args:
        sys.exit("usage: make_samples.py SOURCE_DIR [clip …]")
    source, names = Path(args[0]), set(args[1:])
    for name, library, rel, midi, seconds, release in SAMPLES:
        if names and name not in names:
            continue
        rate, mono = read_wav(source / library / rel)
        # Only the part kept (and a little either side) is resampled: the
        # recordings run 10 to 20 seconds.
        peak = max(abs(s) for s in mono) or 1.0
        start = next(i for i, s in enumerate(mono) if abs(s) > peak * 0.02)
        mono = mono[max(0, start - int(0.02 * rate)):start + int((seconds + 0.1) * rate)]
        clip = cut(resample(mono, rate), seconds, release)
        write_wav(KIT_OUT / (name + ".wav"), clip)
        print(f"🎻 kit/{name}.wav  {len(clip) / RATE:.2f} s, MIDI {midi}")


if __name__ == "__main__":
    main(sys.argv[1:])
