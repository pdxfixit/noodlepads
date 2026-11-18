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


    def test_not_mine_neither_counts_nor_resets(self):
        # Ben, 2026-11-18: every seat sits on every change; ➖ is "nothing here for my lens".
        self.assertEqual(c.streaks(["docs ➖", "docs ✅", "docs ➖", "docs ✅", "docs ✏️"]), {"docs": 2})
        self.assertEqual(c.parse("android ➖"), [("android", "➖")])


class FullCouncil(unittest.TestCase):
    TABLE = "| A | `council-docs` | x | sonnet |\n| B | `council-android` | y | opus |\n"

    def test_roster_reads_the_table(self):
        self.assertEqual(c.roster(self.TABLE), ["docs", "android"])

    def test_missing_names_the_seats_left_out(self):
        self.assertEqual(c.missing("docs ✅, android ➖", ["docs", "android"]), [])
        self.assertEqual(c.missing("docs ✅", ["docs", "android"]), ["android"])
        self.assertEqual(c.missing("none (fix)", ["docs", "android"]), ["docs", "android"], "a none trailer leaves out every seat")

    def test_the_real_roster_has_every_seat(self):
        import pathlib
        md = (pathlib.Path(__file__).parent.parent / "docs" / "council.md").read_text(encoding="utf-8")
        self.assertEqual(len(c.roster(md)), 22)


if __name__ == "__main__":
    unittest.main()
