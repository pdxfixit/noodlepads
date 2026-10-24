"""tools/make_samples.py's lift: a recorded hit comes up under the same peak
(Ben, 2026-10-24: real recordings for the faked sounds; a real snare is one
sharp spike and plays about 8 dB under a made one at the same peak).

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
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


if __name__ == "__main__":
    unittest.main()
