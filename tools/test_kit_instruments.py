#!/usr/bin/env python3
"""Tests for tools/kit_instruments.py: web/boards.json holds exactly the
instruments' presets it writes, and how it picks a recording for a note.

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit_instruments as ki  # noqa: E402


class Instruments(unittest.TestCase):
    def test_boards_json_matches_the_table(self):
        text = ki.BOARDS.read_text(encoding="utf-8")
        self.assertEqual(ki.rebuilt(text), text, "run python3 tools/kit_instruments.py")

    def test_a_note_plays_the_recording_that_moves_least(self):
        self.assertEqual(ki.nearest([61, 69], [64]), 61)
        self.assertEqual(ki.nearest([61, 69], [66]), 69)
        self.assertEqual(ki.nearest([61, 69], [65]), 69, "a tie moves down")
        self.assertEqual(ki.nearest([57, 66], [53, 57, 60]), 57, "a chord: the one whose farthest note is nearest")

    def test_ids_never_end_in_another_presets(self):
        self.assertEqual(ki.preset_id("piano", {"id": "chord-am", "group": "chords"}), "piano-am-chord")
        self.assertEqual(ki.preset_id("piano", {"id": "note-c-high", "group": "notes"}), "piano-c-high")
        self.assertEqual(ki.preset_id("808", {"id": "bass-cs", "group": "bass"}), "808-cs")


if __name__ == "__main__":
    unittest.main()
