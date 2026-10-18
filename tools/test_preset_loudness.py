"""tools/preset_loudness.py: no shown preset blasts on a phone (Ben,
2026-10-17: fix the few that were clearly off; Countdown, Power-up, 1-up,
Alarm, Computer, Slide whistle and Robot were 10 to 13 dB over the middle).

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import preset_loudness as pl  # noqa: E402


class Loudness(unittest.TestCase):
    def test_no_preset_blasts_on_a_phone(self):
        loud = [(d, i) for d, i, _ in pl.table() if d > 9.5]
        self.assertEqual(loud, [], "a preset this far over the middle needs a boards.json level")

    def test_a_level_turns_a_sound_down_by_that_many_db(self):
        samples = [0.5 * ((i % 40) / 20 - 1) for i in range(22050)]   # a buzzy saw
        self.assertAlmostEqual(pl.heard(samples, 22050) - pl.heard(samples, 22050, -6), 6, places=3)


if __name__ == "__main__":
    unittest.main()
