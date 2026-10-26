"""The council's tripwire rule (tools/council.py)."""
import unittest

import council as c


class Tripwire(unittest.TestCase):
    def test_parse_reads_each_seat_and_skips_none(self):
        self.assertEqual(c.parse("privacy-safety ✅, kids-ux ✏️, audio-engineer ⛔→✅"),
                         [("privacy-safety", "✅"), ("kids-ux", "✏️"), ("audio-engineer", "⛔→✅")])
        self.assertEqual(c.parse("none (fix)"), [])

    def test_only_plain_passes_from_the_newest_count(self):
        newest_first = ["docs ✅", "docs ✅, architect ✏️", "docs ✏️, architect ✅", "docs ✅"]
        self.assertEqual(c.streaks(newest_first), {"docs": 2, "architect": 0})

    def test_a_lifted_block_is_a_finding(self):
        self.assertEqual(c.streaks(["security ⛔→✅", "security ✅"]), {"security": 0})

    def test_a_seat_trips_at_n(self):
        trailers = ["parent ✅, producer ✅"] * 9 + ["parent ✅, producer ✏️", "parent ✅"]
        self.assertEqual(c.tripped(trailers, 10), [("parent", 11)])
        self.assertEqual(c.tripped(trailers, 12), [])


if __name__ == "__main__":
    unittest.main()
