#!/usr/bin/env python3
"""Tests for tools/runner_export.py: the old Mac archives, moved into the
telemetry runner in the harvest's own shape, with no raw User-Agent, no place
finer than the country and no names. Temp files only.

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runner_export as rx  # noqa: E402

UA = "Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/141.0 Safari/537.36"

# The old logs.sqlite3, as tools/logs.py --sync made it.
OLD_LOGS = """
CREATE TABLE uploads (key TEXT PRIMARY KEY, received TEXT NOT NULL, device TEXT, app TEXT, ua TEXT,
  errors INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE events (upload TEXT NOT NULL, seq INTEGER NOT NULL, t TEXT, kind TEXT NOT NULL, data TEXT,
  PRIMARY KEY (upload, seq));
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
"""

# The old metrics.sqlite3, as flarepress's harvest filled it before 2026-10-16:
# places finer than the country, and each player's name and avatar.
OLD_METRICS = """
CREATE TABLE activity (id INTEGER, at INTEGER, profile_id TEXT, device TEXT, kind TEXT, city TEXT, region TEXT,
  country TEXT, network TEXT, asn INTEGER, ip_hash TEXT, PRIMARY KEY (id));
CREATE TABLE players (id TEXT, name TEXT, avatar TEXT, created INTEGER, PRIMARY KEY (id));
CREATE TABLE uses (profile_id TEXT, feature TEXT, day TEXT, n INTEGER, PRIMARY KEY (profile_id, feature, day));
CREATE TABLE cf_http_daily (day TEXT PRIMARY KEY, requests INTEGER);
CREATE TABLE harvest_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE scratch (x INTEGER PRIMARY KEY);
"""


class Temp(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def db(self, name, script, rows=()):
        path = self.dir / name
        conn = sqlite3.connect(path)
        conn.executescript(script)
        for sql, args in rows:
            conn.execute(sql, args)
        conn.commit()
        conn.close()
        return path

    def run_main(self, *argv):
        with redirect_stdout(io.StringIO()) as out:
            code = rx.main(list(argv))
        return code, out.getvalue()


class Shape(unittest.TestCase):
    def test_the_shape_is_what_site_harvest_conf_makes_of_worker_schema(self):
        want = rx.shape()
        self.assertEqual([c for c, _ in want["players"][0]], ["id", "created"], "no name or avatar leaves D1")
        self.assertEqual([c for c, _ in want["activity"][0]], ["id", "at", "profile_id", "device", "kind", "country"])
        self.assertEqual(want["activity"][1], ["id"])
        self.assertEqual(want["uses"][1], ["profile_id", "feature", "day"])
        self.assertEqual([c for c, _ in want["reports"][0]], ["key", "device", "app", "errors", "body", "created", "expires"])
        self.assertEqual(want["reports"][1], ["key"])

    def test_reports_wait_for_their_harvest_line(self):
        # docs/state.md: the line goes in 14 days after reports stopped carrying the User-Agent.
        self.assertNotIn("table=reports", rx.HARVEST.read_text())
        self.assertNotIn("reports", rx.shape(extra=()))


class Reports(Temp):
    def old(self):
        payload = {"format": 1, "device": "K7Q4-M2XD", "app": "abc", "env": {"ua": UA, "screen": [800, 1280]},
                   "entries": [{"t": 1, "kind": "error", "data": {"message": "x"}}]}
        return self.db("logs.sqlite3", OLD_LOGS, [
            ("INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, ?)",
             ("2026-10-11T19:42:08.123Z_K7Q4-M2XD_ab", "2026-10-11T19:42:08.123Z", "K7Q4-M2XD", "abc", UA, 1, json.dumps(payload))),
            ("INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, ?)",
             ("2026-10-12T00:00:00.000Z_AAAA-BBBB_cd", "2026-10-12T00:00:00.000Z", "AAAA-BBBB", "abc", None, 0, "garbage")),
        ])

    def test_the_export_is_the_harvests_reports_with_no_user_agent(self):
        out = self.dir / "reports-for-runner.sqlite3"
        code, said = self.run_main("reports", str(self.old()), str(out))
        self.assertEqual(code, 0, said)
        self.assertIn("✅ reports: 1 written, 1 skipped", said)
        self.assertIn("is in the harvest's shape: reports 1", said)
        self.assertNotIn(b"Mozilla", out.read_bytes())
        self.assertNotIn(b"SM-X200", out.read_bytes())
        conn = sqlite3.connect(out)
        key, device, app, errors, body, created, expires = conn.execute("SELECT * FROM reports").fetchone()
        self.assertEqual((key, device, app, errors), ("2026-10-11T19:42:08.123Z_K7Q4-M2XD_ab", "K7Q4-M2XD", "abc", 1))
        self.assertEqual(json.loads(body)["env"], {"screen": [800, 1280]})
        self.assertEqual(json.loads(body)["entries"][0]["data"], {"message": "x"})
        self.assertEqual(created, int(datetime(2026, 10, 11, 19, 42, 8, 123000, tzinfo=timezone.utc).timestamp() * 1000))
        self.assertEqual(expires - created, 14 * 86400000)
        self.assertEqual(rx.problems(out), [])

    def test_an_existing_file_is_never_overwritten_and_the_old_one_never_written(self):
        old = self.old()
        before = old.read_bytes()
        out = self.dir / "there.sqlite3"
        out.write_bytes(b"keep")
        code, _ = self.run_main("reports", str(old), str(out))
        self.assertEqual(code, 1)
        self.assertEqual(out.read_bytes(), b"keep")
        self.assertEqual(old.read_bytes(), before)

    def test_the_old_archive_itself_is_not_in_the_harvests_shape(self):
        code, said = self.run_main("check", str(self.old()))
        self.assertEqual(code, 1)
        self.assertIn("❌ uploads: not a table the harvest writes", said)


class Metrics(Temp):
    def old(self):
        return self.db("metrics.sqlite3", OLD_METRICS, [
            ("INSERT INTO activity VALUES (1, 5, 'p-a', 'h', 'pull', 'Portland', 'Oregon', 'US', 'Comcast', 7922, NULL)", ()),
            ("INSERT INTO players VALUES ('p-a', 'Sir Squid', '🐙', 3)", ()),
            ("INSERT INTO uses VALUES ('p-a', 'pad', '2026-10-11', 4)", ()),
            ("INSERT INTO cf_http_daily VALUES ('2026-10-11', 10)", ()),
            ("INSERT INTO harvest_meta VALUES ('last_run', 'x')", ()),
        ])

    def test_the_old_archive_does_not_match_and_says_why(self):
        code, said = self.run_main("check", str(self.old()))
        self.assertEqual(code, 1)
        self.assertIn("activity: columns", said)
        self.assertIn("(extra: city, region, network, asn, ip_hash)", said)
        self.assertIn("players: columns ['id', 'name', 'avatar', 'created']", said)
        self.assertIn("scratch: not a table the harvest writes", said)

    def test_the_export_keeps_the_country_drops_names_and_matches(self):
        out = self.dir / "metrics-for-runner.sqlite3"
        code, said = self.run_main("metrics", str(self.old()), str(out))
        self.assertEqual(code, 0, said)
        self.assertIn("✅ activity: 1 rows (left out: city, region, network, asn, ip_hash)", said)
        self.assertIn("✅ players: 1 rows (left out: name, avatar)", said)
        self.assertIn("⏭️  not the harvest's: scratch", said)
        data = out.read_bytes()
        for gone in (b"Portland", b"Oregon", b"Comcast", b"Sir Squid"):
            self.assertNotIn(gone, data)
        conn = sqlite3.connect(out)
        self.assertEqual(conn.execute("SELECT * FROM activity").fetchall(), [(1, 5, "p-a", "h", "pull", "US")])
        self.assertEqual(conn.execute("SELECT * FROM players").fetchall(), [("p-a", 3)])
        self.assertEqual(conn.execute("SELECT * FROM cf_http_daily").fetchall(), [("2026-10-11", 10)])
        self.assertEqual(rx.problems(out), [])
        self.assertIn("activity 1", said)


if __name__ == "__main__":
    unittest.main()
