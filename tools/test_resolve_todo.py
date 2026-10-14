"""Tests for resolve_todo.py: main's lines stay, the incoming commit's deletions and additions apply."""
import unittest
from resolve_todo import resolve

# The markers are built, not typed, so this file holds none at a line start
# (tests/conflict-markers.test.mjs fails on any tracked file that does).
OURS, BASE, THEIRS = "<" * 7, "|" * 7, ">" * 7
HUNK = f"""top
{OURS} HEAD
- new line from main
- agent A's line
{BASE} parent of abc (feat: A)
- agent A's line
=======
- agent A's follow-up
{THEIRS} abc (feat: A)
bottom
"""


class Resolve(unittest.TestCase):
    def test_keeps_main_drops_what_the_commit_deleted_adds_what_it_added(self):
        out, n = resolve(HUNK)
        self.assertEqual(n, 1)
        self.assertEqual(out, "top\n- new line from main\n- agent A's follow-up\nbottom\n")

    def test_repeated_lines_are_counted_not_dropped_everywhere(self):
        lt, gt, bar = "<" * 7, ">" * 7, "|" * 7
        css = (f"{lt} HEAD\n.a {{\n}}\n.b {{\n}}\n{bar} base\n=======\n.c {{\n}}\n{gt} x\n")
        out, _ = resolve(css)
        self.assertEqual(out.count("{"), out.count("}"))
        self.assertEqual(out, ".a {\n}\n.b {\n}\n.c {\n}\n")

    def test_no_conflict_is_left_alone(self):
        self.assertEqual(resolve("a\nb\n"), ("a\nb\n", 0))


if __name__ == "__main__":
    unittest.main()
