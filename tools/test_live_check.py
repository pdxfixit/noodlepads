"""The daily live check's rule, with a fake network and clock (tools/live_check.py)."""
import unittest

import live_check as lc

GOOD = {"/": (200, "<!doctype html>"), "/version.json": (200, '{"version":"abc1234"}'),
        "/api/cloud": (200, '{"ok":true,"v":1}'), "/api/profiles": (200, '{"profiles":[]}')}


class Decide(unittest.TestCase):
    def test_a_healthy_site_passes(self):
        ok, lines = lc.decide(GOOD)
        self.assertTrue(ok)
        self.assertEqual(lines, ["✅ / 200", "✅ /version.json 200", "✅ /api/cloud 200", "✅ /api/profiles 200"])

    def test_any_live_version_passes(self):
        for v in ("fff0000", "v1.0-3-gabc1234", "abc1234-dirty", "not-a-commit"):
            ok, _ = lc.decide({**GOOD, "/version.json": (200, f'{{"version":"{v}"}}')})
            self.assertTrue(ok, v)

    def test_cloud_down_fails(self):
        ok, lines = lc.decide({**GOOD, "/api/cloud": (503, "")})
        self.assertFalse(ok)
        self.assertIn("/api/cloud answered 503", "\n".join(lines))

    def test_cloud_200_but_not_ok_fails(self):
        ok, lines = lc.decide({**GOOD, "/api/cloud": (200, '{"ok":false}')})
        self.assertFalse(ok)
        self.assertIn("/api/cloud not ok", "\n".join(lines))

    def test_cloud_200_but_not_json_fails(self):
        ok, _ = lc.decide({**GOOD, "/api/cloud": (200, "<html>")})
        self.assertFalse(ok)

    def test_database_down_fails_though_the_worker_is_up(self):
        # /api/cloud never reads D1; the profile list does (a 503 "cloud" when D1 is down or over its limit).
        ok, lines = lc.decide({**GOOD, "/api/profiles": (503, '{"error":"cloud"}')})
        self.assertFalse(ok)
        self.assertIn("/api/profiles answered 503", "\n".join(lines))

    def test_profile_list_200_but_not_a_list_fails(self):
        for text in ('{"ok":true}', '{"profiles":"x"}', "<html>", "[]"):
            ok, _ = lc.decide({**GOOD, "/api/profiles": (200, text)})
            self.assertFalse(ok, text)

    def test_home_page_down_fails(self):
        ok, lines = lc.decide({**GOOD, "/": (404, "")})
        self.assertFalse(ok)
        self.assertIn("/ answered 404", "\n".join(lines))

    def test_unreachable_version_fails(self):
        ok, lines = lc.decide({**GOOD, "/version.json": (0, "")})
        self.assertFalse(ok)
        self.assertIn("/version.json answered nothing", "\n".join(lines))


class Retries(unittest.TestCase):
    def test_retries_only_the_misses(self):
        answers = {"/": [(200, "x")], "/version.json": [(200, "{}")], "/api/cloud": [(503, ""), (200, '{"ok":true}')],
                   "/api/profiles": [(200, '{"profiles":[]}')]}
        calls, sleeps = [], []

        def fetch(p):
            calls.append(p)
            return answers[p].pop(0)
        out = lc.check_pages(fetch, sleeps.append)
        self.assertEqual(out["/api/cloud"], (200, '{"ok":true}'))
        self.assertEqual(calls, ["/", "/version.json", "/api/cloud", "/api/profiles", "/api/cloud"])
        self.assertEqual(sleeps, [lc.WAIT_S])

    def test_a_page_still_down_is_tried_three_more_times(self):
        calls, sleeps = [], []

        def fetch(p):
            calls.append(p)
            return (503, "") if p == "/" else GOOD[p]
        out = lc.check_pages(fetch, sleeps.append)
        self.assertEqual(out["/"], (503, ""))
        self.assertEqual(calls.count("/"), 1 + lc.TRIES)
        self.assertEqual(sleeps, [lc.WAIT_S] * lc.TRIES)


if __name__ == "__main__":
    unittest.main()
