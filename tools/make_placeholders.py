#!/usr/bin/env python3
"""Make the synthesized clips of the presets (the shared kit) in web/clips/kit/.

`python3 tools/make_placeholders.py` makes them all; with names
(`make_placeholders.py moo quack`) it makes only those, so adding a preset
never touches the others. The airhorn, laser and the rest of the old
starter sounds are not made here: they are the old app's clips, kept as
they were.

Stdlib only (Python 3.8+). The sound effects are synthesized; the spoken
callouts (the kit's "Let's go!" and the rest) use macOS `say` and are
skipped without it. Output is deterministic, so rerunning it only changes
files if this script changed. web/boards.json lists the kit.
"""
import math
import random
import shutil
import subprocess
import sys
import wave
from array import array
from pathlib import Path

RATE = 22050
CLIPS = Path(__file__).resolve().parent.parent / "web" / "clips"
KIT_OUT = CLIPS / "kit"


def silence(seconds):
    return [0.0] * int(seconds * RATE)


def fade(samples, seconds=0.005):
    """Short linear fade at both ends so no clip starts or stops with a click."""
    n = min(int(seconds * RATE), len(samples) // 2)
    for i in range(n):
        g = i / n
        samples[i] *= g
        samples[-1 - i] *= g
    return samples


def mix(*tracks):
    out = [0.0] * max(len(t) for t in tracks)
    for t in tracks:
        for i, s in enumerate(t):
            out[i] += s
    return out


def at(seconds, samples):
    return silence(seconds) + samples


def osc(freq_at, seconds, shape="sine", amp_at=lambda t: 1.0):
    """Oscillator whose frequency and amplitude are functions of time."""
    out, phase = [], 0.0
    for i in range(int(seconds * RATE)):
        t = i / RATE
        phase = (phase + freq_at(t) / RATE) % 1.0
        if shape == "sine":
            s = math.sin(2 * math.pi * phase)
        elif shape == "saw":
            s = 2 * phase - 1
        elif shape == "square":
            s = math.tanh(4 * math.sin(2 * math.pi * phase))
        else:  # triangle
            s = 4 * abs(phase - 0.5) - 1
        out.append(s * amp_at(t))
    return out


def noise(seconds, amp_at, seed, highpass=True):
    rng = random.Random(seed)
    out, prev = [], 0.0
    for i in range(int(seconds * RATE)):
        x = rng.uniform(-1, 1)
        s = x - prev if highpass else x
        prev = x
        out.append(s * amp_at(i / RATE))
    return out


def lowpass(samples, a):
    y, out = 0.0, []
    for x in samples:
        y += a * (x - y)
        out.append(y)
    return out


def adsr(attack, release, length):
    def amp(t):
        if t < attack:
            return t / attack
        if t > length - release:
            return max(0.0, (length - t) / release)
        return 1.0
    return amp


# ── The kit, on every board: drums, notes and game sounds for making beats ─

def bright(samples):
    """Keeps the hiss: noise minus its own low end, for cymbals and hats."""
    return [a - b for a, b in zip(samples, lowpass(samples, 0.25))]


def kick():
    body = osc(lambda t: 45 + 110 * math.exp(-28 * t), 0.45, "sine", lambda t: math.exp(-6.5 * t))
    click = noise(0.012, lambda t: 0.6 * math.exp(-300 * t), seed=11)
    return mix(body, click)


def snare():
    tone = osc(lambda t: 185, 0.25, "triangle", lambda t: 0.6 * math.exp(-22 * t))
    rattle = noise(0.28, lambda t: math.exp(-13 * t), seed=12)
    return mix(tone, rattle)


def hihat():
    return bright(noise(0.08, lambda t: math.exp(-50 * t), seed=13))


def open_hat():
    return bright(noise(0.5, lambda t: math.exp(-6 * t), seed=14))


def clap():
    bursts = [at(d, noise(0.03, lambda t: math.exp(-110 * t), seed=15 + i)) for i, d in enumerate((0, 0.011, 0.023))]
    tail = at(0.03, noise(0.25, lambda t: 0.6 * math.exp(-16 * t), seed=19))
    return lowpass(mix(*bursts, tail), 0.5)


def tom(f0, f1):
    return lambda: osc(lambda t: f1 + (f0 - f1) * math.exp(-10 * t), 0.4, "sine", lambda t: math.exp(-8 * t))


def crash():
    return bright(noise(1.6, lambda t: math.exp(-2.3 * t), seed=20))


def cowbell():
    return lowpass(mix(osc(lambda t: 545, 0.3, "square", lambda t: math.exp(-11 * t)),
                       osc(lambda t: 815, 0.3, "square", lambda t: 0.8 * math.exp(-11 * t))), 0.4)


def shaker():
    return bright(noise(0.14, lambda t: min(t / 0.03, 1) * math.exp(-28 * max(0, t - 0.03)), seed=21))


def pluck(freq):
    return lambda: lowpass(osc(lambda t: freq, 0.7, "saw", lambda t: math.exp(-4.5 * t)), 0.22)


def bass(freq):
    return lambda: lowpass(osc(lambda t: freq, 0.8, "square", adsr(0.01, 0.3, 0.8)), 0.07)


def coin():
    return (osc(lambda t: 988, 0.07, "square", lambda t: 0.8)
            + osc(lambda t: 1319, 0.4, "square", lambda t: 0.8 * math.exp(-7 * t)))


def power_up():
    out = []
    for f in (523, 659, 784, 1047, 1319, 1568, 2093):
        out += osc(lambda t, f=f: f, 0.055, "square", lambda t: 0.7)
    return out + osc(lambda t: 2093, 0.25, "square", lambda t: 0.7 * math.exp(-9 * t))


def jump():
    return osc(lambda t: 300 + 2400 * t, 0.25, "square", lambda t: 0.8 * (1 - t / 0.25))


def explosion():
    rumble = lowpass(noise(1.5, lambda t: math.exp(-2.8 * t), seed=22, highpass=False), 0.06)
    thump = osc(lambda t: 40 + 60 * math.exp(-8 * t), 0.6, "sine", lambda t: math.exp(-5 * t))
    return mix(rumble, thump)


def siren():
    return osc(lambda t: 650 + 250 * math.sin(2 * math.pi * 1.4 * t), 2.0, "triangle", adsr(0.05, 0.2, 2.0))


def whoosh():
    return lowpass(noise(0.7, lambda t: math.sin(math.pi * t / 0.7) ** 2, seed=23), 0.12)


def pop():
    return osc(lambda t: 220 + 600 * math.exp(-45 * t), 0.09, "sine", lambda t: math.exp(-30 * t))


def zap():
    return osc(lambda t: 120 + 1600 * math.exp(-11 * t), 0.32, "saw", lambda t: math.exp(-7 * t))


def alarm():
    out = []
    for i in range(8):
        f = 880 if i % 2 == 0 else 660
        out += osc(lambda t, f=f: f, 0.15, "square", lambda t: 0.7)
    return out


def ding():
    return mix(osc(lambda t: 1318.5, 1.5, "sine", lambda t: math.exp(-3 * t)),
               osc(lambda t: 2637, 1.5, "sine", lambda t: 0.3 * math.exp(-5 * t)))


def buzzer():
    return lowpass(mix(osc(lambda t: 110, 0.7, "saw", adsr(0.01, 0.05, 0.7)),
                       osc(lambda t: 116.5, 0.7, "saw", adsr(0.01, 0.05, 0.7))), 0.3)


def heartbeat():
    thump = lambda: osc(lambda t: 55 + 25 * math.exp(-20 * t), 0.18, "sine", lambda t: math.exp(-18 * t))
    return mix(thump(), at(0.24, thump()), silence(0.9))


def countdown():
    beep = lambda f, length: osc(lambda t: f, length, "square", adsr(0.005, 0.03, length))
    return mix(beep(660, 0.12), at(0.6, beep(660, 0.12)), at(1.2, beep(660, 0.12)), at(1.8, beep(1320, 0.45)))


def scratch():
    swipe = osc(lambda t: 260 + 220 * math.sin(2 * math.pi * 7 * t), 0.5, "saw", lambda t: abs(math.sin(2 * math.pi * 3.5 * t)))
    hiss = noise(0.5, lambda t: 0.4 * abs(math.sin(2 * math.pi * 3.5 * t)), seed=24)
    return lowpass(mix(swipe, hiss), 0.3)


# ── More kit: drums, chords, game and silly sounds ──────────────────────────

def rim():
    click = noise(0.02, lambda t: math.exp(-200 * t), seed=30)
    knock = osc(lambda t: 1700, 0.06, "triangle", lambda t: 0.6 * math.exp(-60 * t))
    return mix(click, knock)


def snap():
    return lowpass(bright(noise(0.07, lambda t: math.exp(-70 * t), seed=31)), 0.6)


def tambourine():
    jingles = [at(d, bright(noise(0.12, lambda t: 0.7 * math.exp(-22 * t), seed=32 + i))) for i, d in enumerate((0, 0.012, 0.026))]
    return mix(*jingles)


def ride():
    bell = osc(lambda t: 2400, 1.2, "sine", lambda t: 0.25 * math.exp(-3 * t))
    wash = bright(noise(1.2, lambda t: 0.5 * math.exp(-2.6 * t), seed=35))
    return mix(bell, wash)


def boom():
    """An 808-style long, deep kick."""
    return osc(lambda t: 42 + 90 * math.exp(-22 * t), 1.0, "sine", lambda t: math.exp(-2.6 * t))


def conga():
    return osc(lambda t: 220 + 120 * math.exp(-40 * t), 0.35, "sine", lambda t: math.exp(-10 * t))


def chord(*freqs):
    """A short synth stab: the notes together, plucked."""
    return lambda: mix(*(lowpass(osc(lambda t, f=f: f, 0.9, "saw", lambda t: 0.5 * math.exp(-3.5 * t)), 0.18) for f in freqs))


def pew():
    return osc(lambda t: 300 + 1500 * math.exp(-14 * t), 0.22, "square", lambda t: 0.8 * math.exp(-9 * t))


def blip():
    return osc(lambda t: 1046.5, 0.07, "square", lambda t: 0.7 * math.exp(-25 * t))


def one_up():
    out = []
    for f in (659.3, 784.0, 1318.5, 1046.5, 1174.7, 1568.0):
        out += osc(lambda t, f=f: f, 0.08, "square", lambda t: 0.7)
    return out


def game_over():
    out = []
    for f, length in ((392.0, 0.18), (349.2, 0.18), (329.6, 0.18), (261.6, 0.6)):
        out += lowpass(osc(lambda t, f=f: f, length, "square", adsr(0.005, 0.05, length)), 0.4)
    return out


def teleport():
    sweep = osc(lambda t: 300 * 2 ** (t * 6), 0.7, "sine", lambda t: math.sin(math.pi * t / 0.7))
    shimmer = osc(lambda t: 2000 + 800 * math.sin(2 * math.pi * 30 * t), 0.7, "triangle", lambda t: 0.25 * math.sin(math.pi * t / 0.7))
    return mix(sweep, shimmer)


def raspberry():
    """A lip-trill: a low buzzy tone wobbling fast."""
    buzz = osc(lambda t: 110 + 25 * math.sin(2 * math.pi * 31 * t), 0.9, "saw", adsr(0.03, 0.15, 0.9))
    return lowpass([b * (0.6 + 0.4 * math.sin(2 * math.pi * 31 * i / RATE)) for i, b in enumerate(buzz)], 0.25)


def honk():
    """A clown horn: two squeezes."""
    squeeze = lambda: lowpass(mix(osc(lambda t: 330, 0.22, "saw", adsr(0.01, 0.05, 0.22)),
                                  osc(lambda t: 440, 0.22, "saw", adsr(0.01, 0.05, 0.22))), 0.3)
    return squeeze() + silence(0.06) + squeeze()


# ── Presets added 2026-10-11: 808s, the rest of the scale, animals, sci-fi
# and more silly sounds. Every one is generated here; nothing is recorded.

def wobble(samples, rate, depth):
    """Amplitude wobble: each sample times a sine at `rate` Hz."""
    return [s * (1 - depth + depth * math.sin(2 * math.pi * rate * i / RATE)) for i, s in enumerate(samples)]


def sweep_lowpass(samples, a_at):
    """A lowpass whose brightness `a_at(t)` (0..1) moves over time: a mouth opening."""
    y, out = 0.0, []
    for i, x in enumerate(samples):
        y += min(1.0, max(0.005, a_at(i / RATE))) * (x - y)
        out.append(y)
    return out


def snare_808():
    """An 808-style snare: two tuned sines and a short bright hiss."""
    body = mix(osc(lambda t: 180, 0.25, "sine", lambda t: 0.7 * math.exp(-28 * t)),
               osc(lambda t: 330, 0.25, "sine", lambda t: 0.5 * math.exp(-34 * t)))
    return mix(body, bright(noise(0.25, lambda t: math.exp(-16 * t), seed=40)))


def clave():
    """An 808-style clave: one bright wooden tick."""
    return osc(lambda t: 2500, 0.1, "sine", lambda t: math.exp(-55 * t))


def tom_fill():
    """Four toms, high to low, in quick time."""
    hit = lambda f0, f1, length: osc(lambda t: f1 + (f0 - f1) * math.exp(-12 * t), length, "sine", lambda t: math.exp(-9 * t))
    return mix(hit(300, 220, 0.3), at(0.12, hit(240, 170, 0.3)), at(0.24, hit(180, 125, 0.35)), at(0.36, hit(140, 95, 0.5)))


def moo():
    """A cow: a low buzzy tone that opens up and sags."""
    tone = osc(lambda t: 150 - 30 * t + 3 * math.sin(2 * math.pi * 5 * t), 1.1, "saw", adsr(0.15, 0.35, 1.1))
    return sweep_lowpass(tone, lambda t: 0.03 + 0.09 * math.sin(math.pi * min(t / 0.9, 1)))


def quack():
    """A duck: two short nasal quacks."""
    one = lambda: sweep_lowpass(wobble(osc(lambda t: 620 - 400 * t, 0.16, "saw", adsr(0.01, 0.06, 0.16)), 45, 0.5),
                                lambda t: 0.5 - 1.5 * t)
    return one() + silence(0.08) + one()


def tweet():
    """A bird: three quick rising chirps."""
    chirp = lambda: osc(lambda t: 2600 + 18000 * t, 0.07, "sine", lambda t: math.sin(math.pi * t / 0.07))
    return chirp() + silence(0.05) + chirp() + silence(0.05) + chirp()


def roar():
    """A lion, cartoon-sized: a growl that swells and fades."""
    growl = wobble(osc(lambda t: 95 + 25 * math.sin(math.pi * t / 1.2), 1.2, "saw", adsr(0.25, 0.4, 1.2)), 23, 0.6)
    rasp = lowpass(noise(1.2, adsr(0.25, 0.4, 1.2), seed=41, highpass=False), 0.15)
    return lowpass(mix(growl, rasp), 0.2)


def meow():
    """A cat: "mee-ow", the pitch up then down while the mouth opens."""
    tone = osc(lambda t: 520 + 260 * math.sin(math.pi * min(t / 0.55, 1)) - 120 * max(0, t - 0.55), 0.75, "saw", adsr(0.04, 0.2, 0.75))
    return sweep_lowpass(tone, lambda t: 0.06 + 0.3 * math.sin(math.pi * min(t / 0.75, 1)))


def woof():
    """A dog: two barks, each a falling growl with a puff of breath."""
    bark = lambda: lowpass(mix(osc(lambda t: 300 - 350 * t, 0.17, "saw", lambda t: math.exp(-12 * t)),
                               noise(0.17, lambda t: 0.5 * math.exp(-25 * t), seed=42)), 0.25)
    return bark() + silence(0.12) + bark()


def ribbit():
    """A frog: "rib-bit", two croaks made of fast clicks."""
    croak = lambda length: lowpass(wobble(osc(lambda t: 190, length, "square", adsr(0.01, 0.03, length)), 28, 1.0), 0.3)
    return croak(0.14) + silence(0.06) + croak(0.1)


def buzz():
    """A bee flying past: a buzzy tone that bends as it goes by."""
    return lowpass(wobble(osc(lambda t: 230 + 25 * math.sin(2 * math.pi * 6 * t) - 30 * t, 1.2, "saw",
                              lambda t: math.sin(math.pi * t / 1.2)), 3, 0.3), 0.3)


def warp():
    """Warp speed: a hum that climbs faster and faster."""
    return osc(lambda t: 80 * 2 ** (t * 5), 1.1, "triangle",
               lambda t: min(t / 0.1, 1) * (0.6 + 0.4 * math.sin(2 * math.pi * (4 + 20 * t) * t)) * max(0.0, 1 - max(0, t - 0.95) / 0.15))


def phaser():
    """A phaser beam: a pulsing whine that holds, then cuts out."""
    return wobble(osc(lambda t: 1400 + 80 * math.sin(2 * math.pi * 55 * t), 0.6, "saw", adsr(0.01, 0.06, 0.6)), 30, 0.6)


def robot():
    """A robot talking: six beeps at made-up pitches."""
    rng = random.Random(43)
    out = []
    for _ in range(6):
        f = rng.choice((440, 523, 587, 659, 784, 880, 988))
        out += osc(lambda t, f=f: f, 0.09, "square", adsr(0.005, 0.02, 0.09)) + silence(0.02)
    return lowpass(out, 0.5)


def ufo():
    """A flying saucer: a slow wobbling whistle drifting up."""
    return osc(lambda t: 700 + 140 * t + 220 * math.sin(2 * math.pi * 6 * t), 1.4, "triangle", adsr(0.1, 0.3, 1.4))


def beam():
    """Beam me up: a low hum under a rising sparkle of notes."""
    hum = osc(lambda t: 110, 1.3, "sine", adsr(0.1, 0.3, 1.3))
    sparkle = []
    for i, f in enumerate((880, 1109, 1319, 1760, 2217, 2637, 3520, 4435)):
        sparkle.append(at(i * 0.11, osc(lambda t, f=f: f, 0.4, "sine", lambda t: 0.35 * math.exp(-8 * t))))
    return mix(hum, *sparkle)


def red_alert():
    """A starship klaxon: two whoops."""
    whoop = lambda: lowpass(osc(lambda t: 350 + 1100 * t, 0.45, "saw", adsr(0.02, 0.05, 0.45)), 0.3)
    return whoop() + silence(0.1) + whoop()


def computer():
    """A computer thinking: a run of tiny bleeps."""
    rng = random.Random(44)
    out = []
    for _ in range(16):
        f = rng.choice((1800, 2200, 2600, 3000, 3400))
        out += osc(lambda t, f=f: f, 0.04, "sine", lambda t: 0.8) + silence(0.015)
    return out


def burp():
    """A burp: a low rumbly tone with a wobbly throat."""
    rng = random.Random(45)
    jitter = [rng.uniform(-1, 1) for _ in range(64)]
    tone = osc(lambda t: 85 - 20 * t + 12 * jitter[int(t * 100) % 64], 0.6, "saw", adsr(0.03, 0.15, 0.6))
    return lowpass(wobble(tone, 18, 0.5), 0.1)


def toot():
    """A cartoon toot: a fluttering low tone that slides up at the end."""
    tone = osc(lambda t: 105 + 60 * max(0, t - 0.45) / 0.2, 0.65, "saw", adsr(0.02, 0.1, 0.65))
    return lowpass(mix(wobble(tone, 26, 0.8), noise(0.65, lambda t: 0.15, seed=46, highpass=False)), 0.12)


def splat():
    """A splat: a wet thump and a spray, then two drips."""
    thump = osc(lambda t: 90 + 200 * math.exp(-30 * t), 0.25, "sine", lambda t: math.exp(-14 * t))
    spray = lowpass(noise(0.3, lambda t: math.exp(-12 * t), seed=47, highpass=False), 0.2)
    drip = lambda: osc(lambda t: 900 + 1500 * t / 0.06, 0.06, "sine", lambda t: 0.3 * math.exp(-40 * t))
    return mix(thump, spray, at(0.35, drip()), at(0.55, drip()))


def zip_away():
    """Running off, cartoon-style: a quick wiggly whistle up."""
    return osc(lambda t: 400 * 2 ** (t * 10) + 60 * math.sin(2 * math.pi * 40 * t), 0.3, "sine",
               lambda t: min(t / 0.02, 1) * (1 - t / 0.3))


def kazoo():
    """A kazoo: "doo-doo-doooo", a buzzy hum."""
    out = []
    for f, length in ((392.0, 0.18), (392.0, 0.18), (523.3, 0.55)):
        tone = osc(lambda t, f=f: f + 4 * math.sin(2 * math.pi * 6 * t), length, "saw", adsr(0.02, 0.05, length))
        out += [s * (0.7 + 0.3 * math.tanh(3 * s)) for s in tone] + silence(0.03)
    return lowpass(out, 0.35)


def bonk():
    """A bonk on the head: a hollow knock."""
    return mix(osc(lambda t: 520 - 150 * t, 0.3, "sine", lambda t: math.exp(-18 * t)),
               osc(lambda t: 1300, 0.3, "triangle", lambda t: 0.3 * math.exp(-30 * t)))


def squeak():
    """A squeaky toy: squeezed twice."""
    one = lambda: osc(lambda t: 1700 + 900 * math.sin(math.pi * t / 0.18) + 80 * math.sin(2 * math.pi * 35 * t), 0.18, "triangle",
                      adsr(0.01, 0.04, 0.18))
    return one() + silence(0.1) + one()

KIT = {
    "kick": kick, "snare": snare, "hihat": hihat, "open-hat": open_hat, "clap": clap,
    "tom-high": tom(270, 190), "tom-low": tom(150, 100), "crash": crash, "cowbell": cowbell, "shaker": shaker,
    "note-c": pluck(261.6), "note-d": pluck(293.7), "note-e": pluck(329.6), "note-g": pluck(392.0),
    "note-a": pluck(440.0), "note-c-high": pluck(523.3), "bass-c": bass(65.4), "bass-g": bass(98.0),
    "coin": coin, "power-up": power_up, "jump": jump, "explosion": explosion, "siren": siren,
    "whoosh": whoosh, "pop": pop, "zap": zap, "alarm": alarm, "ding": ding, "buzzer": buzzer,
    "heartbeat": heartbeat, "countdown": countdown, "scratch": scratch,
    "rim": rim, "snap": snap, "tambourine": tambourine, "ride": ride, "boom": boom, "conga": conga,
    "chord-c": chord(261.6, 329.6, 392.0), "chord-am": chord(220.0, 261.6, 329.6),
    "chord-f": chord(174.6, 220.0, 261.6), "chord-g": chord(196.0, 246.9, 293.7),
    "bass-f": bass(87.3), "bass-a": bass(110.0),
    "pew": pew, "blip": blip, "one-up": one_up, "game-over": game_over, "teleport": teleport,
    "raspberry": raspberry, "honk": honk,
    "snare-808": snare_808, "clave": clave, "tom-fill": tom_fill,
    "note-f": pluck(349.2), "note-b": pluck(493.9),
    "chord-dm": chord(293.7, 349.2, 440.0), "chord-em": chord(329.6, 392.0, 493.9),
    "chord-g7": chord(196.0, 246.9, 293.7, 349.2), "bass-d": bass(73.4), "bass-e": bass(82.4),
    "moo": moo, "quack": quack, "tweet": tweet, "roar": roar, "meow": meow, "woof": woof,
    "ribbit": ribbit, "buzz": buzz,
    "warp": warp, "phaser": phaser, "robot": robot, "ufo": ufo, "beam": beam, "red-alert": red_alert,
    "computer": computer,
    "burp": burp, "toot": toot, "splat": splat, "zip": zip_away, "kazoo": kazoo, "bonk": bonk,
    "squeak": squeak,
}

# The sharps and flats (Advanced-only presets, Ben 2026-10-11): the same
# pluck, chord and bass recipes as the naturals above, at equal-tempered
# pitches (A4 = 440 Hz), to 0.1 Hz like those. tools/test_make_placeholders.py
# checks every pitch against its note name.
SHARPS_AND_FLATS = {
    "note-cs": (pluck, [277.2]), "note-ds": (pluck, [311.1]), "note-fs": (pluck, [370.0]),
    "note-gs": (pluck, [415.3]), "note-as": (pluck, [466.2]),
    "chord-d": (chord, [293.7, 370.0, 440.0]), "chord-a": (chord, [220.0, 277.2, 329.6]),
    "chord-e": (chord, [329.6, 415.3, 493.9]), "chord-bm": (chord, [246.9, 293.7, 370.0]),
    "chord-gm": (chord, [196.0, 233.1, 293.7]), "chord-cm": (chord, [261.6, 311.1, 392.0]),
    "chord-bb": (chord, [233.1, 293.7, 349.2]), "chord-eb": (chord, [311.1, 392.0, 466.2]),
    "chord-fsm": (chord, [185.0, 220.0, 277.2]), "chord-csm": (chord, [277.2, 329.6, 415.3]),
    "bass-cs": (bass, [69.3]), "bass-ds": (bass, [77.8]), "bass-fs": (bass, [92.5]),
    "bass-gs": (bass, [103.8]), "bass-as": (bass, [116.5]),
}
KIT.update({name: make(*hz) for name, (make, hz) in SHARPS_AND_FLATS.items()})

# Spoken callouts in the kit: (file name, words, macOS voice).
KIT_CALLOUTS = [
    ("lets-go", "Let's go!", "Fred"), ("oh-yeah", "Oh yeah!", "Ralph"), ("bruh", "Bruh.", "Albert"),
    ("no-way", "No way!", "Samantha"), ("nice", "Nice!", "Daniel"), ("gg", "G G!", "Zarvox"),
    ("level-up", "Level up!", "Trinoids"), ("drop-the-beat", "Drop the beat!", "Junior"),
    ("oof", "Oof!", "Ralph"), ("wow", "Wow!", "Samantha"), ("ready", "Ready?", "Daniel"),
    ("go", "Go!", "Fred"), ("boom-word", "Boom!", "Albert"), ("yes", "Yes!", "Junior"),
    ("evil-laugh", "Mwa ha ha ha ha!", "Bad News"),
]


def write_wav(path, samples):
    peak = max(abs(s) for s in samples) or 1.0
    pcm = array("h", (int(max(-1.0, min(1.0, s * 0.85 / peak)) * 32767) for s in fade(samples)))
    if sys.byteorder == "big":
        pcm.byteswap()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


def say(path, words, voice=None, rate=None):
    cmd = ["say", "-o", str(path), "--file-format=WAVE", "--data-format=LEI16@22050"]
    if voice:
        cmd += ["-v", voice]
    if rate:
        cmd += ["-r", str(rate)]
    subprocess.run(cmd + [words], check=True)
    print("🗣️  " + path.name)


def pitch_up(path, factor):
    """Plays a WAV back `factor` times faster (higher and shorter, like a
    sped-up tape), by linear interpolation. Stdlib only."""
    with wave.open(str(path), "rb") as w:
        rate = w.getframerate()
        pcm = array("h", w.readframes(w.getnframes()))
    if sys.byteorder == "big":
        pcm.byteswap()
    src = [s / 32768 for s in pcm]
    out = []
    pos = 0.0
    while pos < len(src) - 1:
        i = int(pos)
        frac = pos - i
        out.append(src[i] * (1 - frac) + src[i + 1] * frac)
        pos += factor
    write_wav(path, out)


def cackle(path):
    """An original goblin cackle (not a recording of anything): a fast run of
    laughs from a macOS voice, pitched up."""
    # [[slnc N]] is a pause of N ms in macOS speech: it keeps each laugh short
    # and separate, which is what makes it a cackle rather than a chuckle.
    gap = " [[slnc 45]] "
    laughs = gap.join(["heh"] * 6) + " [[slnc 120]] " + gap.join(["hah"] * 3) + " [[slnc 90]] " + gap.join(["hee"] * 4) + " [[slnc 60]] HAH!"
    say(path, laughs, "Junior", 280)
    pitch_up(path, 1.4)


def main(names):
    """Makes every clip, or only the ones named (file names without .wav):
    `make_placeholders.py moo quack` leaves every other file as it is."""
    known = set(KIT) | {n for n, _, _ in KIT_CALLOUTS} | {"cackle"}
    unknown = [n for n in names if n not in known]
    if unknown:
        sys.exit("unknown clip: " + ", ".join(unknown))
    wanted = lambda name: not names or name in names
    KIT_OUT.mkdir(parents=True, exist_ok=True)
    for name, make in KIT.items():
        if wanted(name):
            write_wav(KIT_OUT / (name + ".wav"), make())
            print("🥁 kit/" + name + ".wav")
    spoken = [c for c in KIT_CALLOUTS if wanted(c[0])]
    if not spoken and not wanted("cackle"):
        return
    if not shutil.which("say"):
        print("⚠️  macOS `say` not found; skipped the spoken callouts", file=sys.stderr)
        return
    for name, words, voice in spoken:
        say(KIT_OUT / (name + ".wav"), words, voice)
    if wanted("cackle"):
        cackle(KIT_OUT / "cackle.wav")


if __name__ == "__main__":
    main(sys.argv[1:])
