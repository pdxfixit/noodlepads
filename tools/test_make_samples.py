"""tools/make_samples.py's lift: a recorded hit comes up under the same peak
(Ben, 2026-10-24: real recordings for the faked sounds; a real snare is one
sharp spike and plays about 8 dB under a made one at the same peak).

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import math
import sys
import tempfile
import unittest
import wave
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_placeholders as mp  # noqa: E402
import make_samples as ms  # noqa: E402


def hit():
    """Silence, one full-scale spike, then a body that dies away at a third of it."""
    body = [0.3 * math.sin(2 * math.pi * 200 * i / ms.RATE) * math.exp(-i / (0.1 * ms.RATE)) for i in range(int(0.4 * ms.RATE))]
    return [0.0] * 200 + [1.0, -0.9] + body


def rms(x):
    return math.sqrt(sum(v * v for v in x) / len(x))


class Lift(unittest.TestCase):
    def test_the_peak_stays_and_the_body_comes_up(self):
        x = hit()
        y = ms.lift(x, 6)
        self.assertEqual(len(y), len(x))
        self.assertLessEqual(max(abs(v) for v in y), max(abs(v) for v in x) + 1e-9)
        later = slice(200 + int(0.05 * ms.RATE), None)   # 50 ms after the spike
        self.assertGreater(20 * math.log10(rms(y[later]) / rms(x[later])), 5.5)

    def test_no_lift_leaves_it_alone(self):
        x = hit()
        self.assertEqual(ms.lift(x, 0), x)

    def test_the_gain_never_steps(self):
        x = hit()
        y = ms.lift(x, 8)
        up = 10 ** (8 / 20)
        gain = [b / (a * up) for a, b in zip(x, y) if abs(a) > 0.01]
        self.assertLess(max(abs(g1 - g0) for g0, g1 in zip(gain, gain[1:])), 0.05)


class Credits(unittest.TestCase):
    """A recording is credited, and its preset is no longer synthesized."""

    def test_every_recording_is_credited_in_the_license_file(self):
        credits = (Path(ms.KIT_OUT) / "LICENSE-samples.txt").read_text()
        for name, library, rel, *_ in ms.HITS:
            self.assertIn(f"{name}.wav ", credits.replace("\t", " "), f"{name} is not credited in LICENSE-samples.txt")
            self.assertTrue((Path(ms.KIT_OUT) / f"{name}.wav").exists(), name)

    def test_a_recorded_preset_is_not_also_made(self):
        import make_placeholders as mp
        both = sorted({h[0] for h in ms.HITS} & set(mp.KIT))
        self.assertEqual(both, [], "make_placeholders.py would overwrite these recordings")


def pcm_of(path):
    with wave.open(str(path), "rb") as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, ms.RATE)
        return array("h", w.readframes(w.getnframes()))


class WriteWav(unittest.TestCase):
    """One writer for both tools: the placeholders fade their first and last
    5 ms, the recorded clips (cut with their own ends) do not. The recorded
    clips' bytes are pinned; the placeholders' fade is checked by its shape."""

    def test_the_recorded_clips_are_written_without_a_fade(self):
        x = [0.0, 0.5, -1.0, 0.25, 1.0, -0.5] * 40
        with tempfile.TemporaryDirectory() as d:
            ms.write_wav(Path(d) / "a.wav", list(x))
            got = pcm_of(Path(d) / "a.wav")
        want = array("h", (int(max(-1.0, min(1.0, v * 0.85 / 1.0)) * 32767) for v in x))
        self.assertEqual(got, want)

    def test_the_placeholders_fade_the_ends(self):
        x = [1.0] * 400
        with tempfile.TemporaryDirectory() as d:
            mp.write_wav(Path(d) / "a.wav", list(x))
            got = pcm_of(Path(d) / "a.wav")
        n = int(0.005 * mp.RATE)
        self.assertEqual(got[0], 0)
        self.assertEqual(got[-1], 0)
        self.assertLess(got[1], got[n])
        self.assertEqual(got[n], int(0.85 * 32767))
        self.assertEqual(got[len(x) // 2], int(0.85 * 32767), "the middle is untouched")


if __name__ == "__main__":
    unittest.main()
