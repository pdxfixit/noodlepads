"""The daily live check's rules, with a fake network, git and clock (tools/live_check.py)."""
import unittest

import live_check as lc

GOOD = {"/": (200, "<!doctype html>"), "/version.json": (200, '{"version":"abc1234"}'),
        "/api/cloud": (200, '{"ok":true,"v":1}')}


class Decide(unittest.TestCase):
    def test_live_serves_main(self):
        ok, lines, notice = lc.decide(GOOD, "abc1234", True, True, 10 * 86400)
        self.assertTrue(ok)
        self.assertIsNone(notice)

    def test_behind_by_ten_minutes_passes_with_a_notice(self):
        ok, _, notice = lc.decide(GOOD, "abc1234", True, False, 10 * 60)
        self.assertTrue(ok)
        self.assertIn("deploy in flight", notice)
        self.assertIn("10 min", notice)

    def test_behind_by_two_hours_fails_naming_the_version_and_age(self):
        ok, lines, _ = lc.decide(GOOD, "abc1234", True, False, 2 * 3600)
        self.assertFalse(ok)
        bad = [l for l in lines if l.startswith("❌")][0]
        self.assertIn("abc1234", bad)
        self.assertIn("120 min", bad)

    def test_an_unknown_commit_fails_after_the_grace(self):
        ok, lines, _ = lc.decide(GOOD, "fff0000", False, False, 2 * 3600)
        self.assertFalse(ok)
        self.assertIn("not a commit in this repo", "\n".join(lines))

    def test_dirty_always_fails(self):
        ok, lines, _ = lc.decide(GOOD, "abc1234-dirty", True, True, 10 * 86400)
        self.assertFalse(ok)
        self.assertIn("uncommitted edits", "\n".join(lines))

    def test_cloud_down_fails_even_when_versions_match(self):
        ok, lines, _ = lc.decide({**GOOD, "/api/cloud": (503, "")}, "abc1234", True, True, 0)
        self.assertFalse(ok)
        self.assertIn("/api/cloud answered 503", "\n".join(lines))

    def test_cloud_200_but_not_ok_fails(self):
        ok, lines, _ = lc.decide({**GOOD, "/api/cloud": (200, '{"ok":false}')}, "abc1234", True, True, 0)
        self.assertFalse(ok)
        self.assertIn("/api/cloud not ok", "\n".join(lines))

    def test_no_version_fails(self):
        ok, _, _ = lc.decide(GOOD, None, False, False, 0)
        self.assertFalse(ok)


class Parts(unittest.TestCase):
    def test_commit_of_a_describe_version(self):
        self.assertEqual(lc.commit_of("abc1234"), "abc1234")
        self.assertEqual(lc.commit_of("abc1234-dirty"), "abc1234")
        self.assertEqual(lc.commit_of("v1.0-3-gabc1234"), "abc1234")
        self.assertEqual(lc.commit_of("v1.0-3-gabc1234-dirty"), "abc1234")

    def test_retries_only_the_misses(self):
        answers = {"/": [(200, "x")], "/version.json": [(200, "{}")], "/api/cloud": [(503, ""), (200, '{"ok":true}')]}
        calls, sleeps = [], []

        def fetch(p):
            calls.append(p)
            return answers[p].pop(0)
        out = lc.check_pages(fetch, sleeps.append)
        self.assertEqual(out["/api/cloud"], (200, '{"ok":true}'))
        self.assertEqual(calls, ["/", "/version.json", "/api/cloud", "/api/cloud"])
        self.assertEqual(len(sleeps), 1)


if __name__ == "__main__":
    unittest.main()
