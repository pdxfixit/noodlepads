"""tools/preset_loudness.py: every preset plays as loud as the middle on a
phone (Ben, 2026-10-23: "make sure that the sound level is the same";
Computer, Alarm and the game sounds were 6 to 13 dB over it). A new or
changed sound fails here until `just preset-loudness --fix` gives it its
boards.json `level`.

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import preset_loudness as pl  # noqa: E402


class Loudness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = pl.measure()   # every preset, about 9 s

    def test_no_preset_plays_louder_than_the_middle(self):
        loud = sorted((round(d, 1), k["id"]) for d, _, k in self.rows if d > pl.EVEN + pl.STEP / 2)
        self.assertEqual(loud, [], "run `just preset-loudness --fix`: these play louder than the other presets")

    def test_boards_json_has_the_levels_the_tool_works_out(self):
        text = pl.BOARDS.read_text(encoding="utf-8")
        self.assertTrue(pl.fixed(text, self.rows) == text, "run `just preset-loudness --fix`: a preset's `level` is missing or stale")

    def test_every_preset_is_measured_at_the_note_it_plays(self):
        self.assertEqual(len(self.rows), len(pl.kit()))
        by_id = {k["id"]: raw for _, raw, k in self.rows}
        # One recording two semitones apart (piano-61.wav moved down 1 and up 1) measures differently.
        self.assertNotEqual(round(by_id["piano-c"], 2), round(by_id["piano-d"], 2))

    def test_a_level_turns_a_sound_down_by_that_many_db(self):
        samples = [0.5 * ((i % 40) / 20 - 1) for i in range(22050)]   # a buzzy saw
        self.assertAlmostEqual(pl.heard(samples, 22050) - pl.heard(samples, 22050, -6), 6, places=3)

    def test_an_octave_up_is_half_as_long_and_a_chord_sums_its_notes(self):
        samples = [((i % 50) / 25 - 1) for i in range(1000)]
        self.assertEqual(len(pl.voiced(samples, (12,))), 499)
        one, two = pl.voiced(samples, (0,)), pl.voiced(samples, (0, 0))
        self.assertAlmostEqual(two[100], 2 * one[100])

    def test_a_level_is_only_given_to_a_preset_over_the_middle(self):
        k = lambda i: {"id": i}  # noqa: E731
        got = pl.levels([(0, 0.9, k("even")), (0, 3.2, k("loud")), (0, 5.0, k("louder")), (0, -6, k("kick"))])
        self.assertEqual(got, {"loud": -3, "louder": -5})


if __name__ == "__main__":
    unittest.main()
