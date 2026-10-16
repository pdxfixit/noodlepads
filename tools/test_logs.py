"""Tests for tools/logs.py: reading problem reports from the telemetry runner's
mirror (noodlepads__reports), the digest and filing new problems in TODO.md.
A temp mirror only; no network.

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import contextlib
import datetime as dt
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import logs  # noqa: E402

def upload(device="K7Q4-M2XD", app="3e7f681 2026-10-11", entries=()):
    return {"format": 1, "app": app, "device": device, "env": {"browser": "Chrome", "os": "Android", "type": "tablet"},
            "entries": list(entries)}


def err(message, t=1):
    return {"t": t, "kind": "error", "data": {"message": message, "source": "audio.js", "line": 3}}


def notice(text, t=2):
    return {"t": t, "kind": "notice", "data": {"text": text}}


def mirror(path, values):
    """A telemetry runner's pulled store, as `telemetry.py pull` writes it: the
    harvest's `reports` table as noodlepads__reports, with the runner's _changed."""
    conn = sqlite3.connect(path)
    conn.execute('CREATE TABLE IF NOT EXISTS "noodlepads__reports" (key TEXT, device TEXT, app TEXT, errors INTEGER, '
                 'body TEXT, created INTEGER, expires INTEGER, _changed TEXT, PRIMARY KEY (key))')
    conn.execute('CREATE TABLE IF NOT EXISTS "_runs" (job TEXT, started TEXT, PRIMARY KEY (job, started))')
    for key, v in values.items():
        body = v.decode() if isinstance(v, bytes) else json.dumps(v)
        errors = sum(1 for e in (v.get("entries") or []) if e.get("kind") == "error") if isinstance(v, dict) else 0
        conn.execute('INSERT OR REPLACE INTO "noodlepads__reports" VALUES (?, ?, ?, ?, ?, 0, 0, ?)',
                     (key, key.split("_")[1], v.get("app", "x") if isinstance(v, dict) else "x", errors, body, "2026-10-16"))
    conn.commit()
    conn.close()


class Archive(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.db = self.dir / "telemetry" / "telemetry.sqlite3"
        self.db.parent.mkdir()
        mirror(self.db, {})
        self.conn = logs.connect(self.db)
        self.out = io.StringIO()

    def tearDown(self):
        self.conn.close()
        self._tmp.cleanup()

    def sync(self, values):
        """What a runner run and a pull bring in."""
        self.conn.close()
        mirror(self.db, values)
        self.conn = logs.connect(self.db)


VALUES = {
    "2026-10-10T08:00:00.000Z_AAAA-BBBB_01": upload(entries=[err("Failed to decode audio data"), notice("hi")]),
    "2026-10-11T09:00:00.000Z_CCCC-DDDD_02": upload(device="CCCC-DDDD", entries=[{"t": 5, "kind": "beat", "data": {"bpm": 120}}]),
    "2026-10-11T10:00:00.000Z_AAAA-BBBB_03": upload(entries=[]),
}


class Mirror(Archive):
    """Ben, 2026-10-16: "the telemetry tooling needs to take this over". Reports
    are read only from the runner's mirror; this tool copies nothing."""

    def test_the_mirror_is_the_runners_pulled_store_unless_told(self):
        old = os.environ.pop("TELEMETRY_DB", None)
        try:
            self.assertEqual(logs.mirror_path(self.dir), self.dir / ".local/state/telemetry/telemetry.sqlite3")
            os.environ["TELEMETRY_DB"] = str(self.db)
            self.assertEqual(logs.mirror_path(), self.db)
        finally:
            os.environ.pop("TELEMETRY_DB", None)
            if old is not None:
                os.environ["TELEMETRY_DB"] = old

    def test_a_missing_mirror_fails_and_is_never_created(self):
        missing = self.dir / "none" / "telemetry.sqlite3"
        with self.assertRaisesRegex(logs.Fail, "telemetry.py pull"):
            logs.connect(missing)
        self.assertFalse(missing.exists())

    def test_a_mirror_with_no_reports_yet_says_so_and_is_not_an_error(self):
        empty = self.dir / "empty.sqlite3"
        sqlite3.connect(empty).execute("CREATE TABLE _runs (job TEXT PRIMARY KEY)").connection.close()
        with self.assertRaises(logs.NoReports):
            logs.connect(empty)
        os.environ["TELEMETRY_DB"] = str(empty)
        try:
            with contextlib.redirect_stdout(io.StringIO()) as said:
                self.assertEqual(logs.main([]), 0)
        finally:
            del os.environ["TELEMETRY_DB"]
        self.assertIn("⏳", said.getvalue())
        self.assertIn("noodlepads__reports", said.getvalue())

    def test_the_mirror_is_read_only_and_nothing_copies_from_d1(self):
        with self.assertRaises(logs.Fail):
            logs.run_sql(self.conn, 'DELETE FROM "noodlepads__reports"', out=self.out)
        for gone in ("sync", "D1Reports", "insert_upload", "reports_from_config"):
            self.assertFalse(hasattr(logs, gone), gone)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            logs.main(["--sync"])

    def test_uploads_and_events_read_the_mirrored_reports(self):
        self.sync(VALUES)
        rows = self.conn.execute("SELECT key, received, device, errors FROM uploads ORDER BY key").fetchall()
        self.assertEqual(rows[0], ("2026-10-10T08:00:00.000Z_AAAA-BBBB_01", "2026-10-10T08:00:00.000Z", "AAAA-BBBB", 1))
        ev = self.conn.execute("SELECT seq, kind, json_extract(data, '$.message') FROM events "
                               "WHERE upload LIKE '%_01' ORDER BY seq").fetchall()
        self.assertEqual(ev, [(0, "error", "Failed to decode audio data"), (1, "notice", None)])

    def test_a_body_that_is_not_json_has_no_events(self):
        self.sync({"2026-10-10T00:00:00.000Z_AAAA-BBBB_09": b"garbage"})
        self.assertEqual(self.conn.execute("SELECT count(*) FROM events").fetchone()[0], 0)
        logs.show_json(self.conn, "2026-10-10T00:00:00.000Z_AAAA-BBBB_09", out=self.out)
        self.assertEqual(self.out.getvalue(), "garbage\n")


class Reading(Archive):
    def setUp(self):
        super().setUp()
        self.sync(VALUES)

    def test_default_list_is_newest_first_and_errors_filters(self):
        logs.list_uploads(self.conn, out=self.out)
        lines = self.out.getvalue().strip().splitlines()
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[0].startswith("2026-10-11T10:00"))
        out = io.StringIO()
        self.assertEqual(logs.list_uploads(self.conn, "WHERE errors > 0", out=out), 1)

    def test_one_device_reads_like_the_diagnostics_event_log(self):
        logs.show_device(self.conn, "CCCC-DDDD", out=self.out)
        self.assertIn("Event log (1 entry, newest last):", self.out.getvalue())
        self.assertIn('  +0.0s beat {"bpm": 120}', self.out.getvalue())

    def test_json_prints_one_upload_and_refuses_an_unknown_key(self):
        logs.show_json(self.conn, "2026-10-11T09:00:00.000Z_CCCC-DDDD_02", out=self.out)
        self.assertEqual(json.loads(self.out.getvalue())["device"], "CCCC-DDDD")
        with self.assertRaises(logs.Fail):
            logs.show_json(self.conn, "nope", out=self.out)

    def test_sql_and_grep(self):
        logs.run_sql(self.conn, "SELECT count(*) AS n FROM events", out=self.out)
        self.assertEqual(self.out.getvalue(), "n\n3\n")
        out = io.StringIO()
        self.assertEqual(logs.grep(self.conn, "DECODE", out=out), 1)


class Digest(Archive):
    T0 = dt.datetime(2026, 10, 11, 12, tzinfo=dt.timezone.utc)

    def test_groups_by_message_and_app_with_counts_and_devices(self):
        self.sync({
            "2026-10-10T08:00:00.000Z_AAAA-BBBB_01": upload(entries=[err("Bad line 12"), err("Bad line 99")]),
            "2026-10-10T09:00:00.000Z_CCCC-DDDD_02": upload(device="CCCC-DDDD", entries=[err("Bad line 7")]),
            "2026-10-10T10:00:00.000Z_CCCC-DDDD_03": upload(device="CCCC-DDDD", app="newer", entries=[err("Bad line 1"), notice("Slow")]),
        })
        md, new = logs.digest(self.conn, logs.EPOCH, self.T0)
        self.assertIn("3 upload(s) from 2 device(s). 4 error(s), 1 notice(s).", md)
        self.assertIn("| 🆕 | error | Bad line 7 | 3e7f681 2026-10-11 | 3 | 2 |", md)
        self.assertIn("| 🆕 | error | Bad line 1 | newer | 1 | 1 |", md)
        self.assertEqual([(n["kind"], n["message"], n["count"], n["devices"]) for n in new],
                         [("error", "Bad line N", 4, 2), ("notice", "Slow", 1, 1)])

    def test_only_problems_never_seen_before_the_last_digest_are_new(self):
        self.sync({"2026-10-01T00:00:00.000Z_AAAA-BBBB_01": upload(entries=[err("Old problem")])})
        since = "2026-10-05T00:00:00.000Z"
        self.sync({"2026-10-10T00:00:00.000Z_AAAA-BBBB_02": upload(entries=[err("Old problem"), err("Fresh problem")])})
        md, new = logs.digest(self.conn, since, self.T0)
        self.assertEqual([n["message"] for n in new], ["Fresh problem"])
        self.assertIn("|  | error | Old problem |", md)
        self.assertIn("1 upload(s) from 1 device(s).", md)

    def test_a_quiet_week_says_so(self):
        md, new = logs.digest(self.conn, logs.EPOCH, self.T0)
        self.assertIn("No errors or notices.", md)
        self.assertEqual(new, [])

    def test_mark_records_the_digest_so_the_next_one_starts_there(self):
        self.sync({"2026-10-10T00:00:00.000Z_AAAA-BBBB_01": upload(entries=[err("X")])})
        before = self.db.read_bytes()
        state = self.dir / "state" / "logs-digest.json"
        os.environ.update(TELEMETRY_DB=str(self.db), NOODLE_LOGS_DIGEST=str(state))
        try:
            with contextlib.redirect_stdout(io.StringIO()) as first:
                self.assertEqual(logs.main(["--digest", "--mark"]), 0)
            with contextlib.redirect_stdout(io.StringIO()) as second:
                logs.main(["--digest"])
        finally:
            del os.environ["TELEMETRY_DB"], os.environ["NOODLE_LOGS_DIGEST"]
        self.assertIn("| 🆕 | error | X |", first.getvalue())
        self.assertIn("No errors or notices.", second.getvalue())
        self.assertRegex(json.loads(state.read_text())["last_digest"], r"^\d{4}-\d\d-\d\dT.*Z$")
        self.assertEqual(self.db.read_bytes(), before, "the mirror is never written")


class FileNew(Archive):
    TODO = """# to do

## Ben does

- [ ] a thing

## Agents do

Approved work.

Other work:


### Offered, not approved

- [ ] maybe
"""

    def test_new_problems_land_in_agents_do_once(self):
        todo = self.dir / "TODO.md"
        todo.write_text(self.TODO)
        new = [{"kind": "error", "message": "Can't N", "sample": "Can't 3", "count": 2, "devices": 1, "apps": ["abc"]}]
        self.assertEqual(logs.file_new(todo, new, out=self.out), 1)
        text = todo.read_text()
        agents, offered = text.split("### Offered, not approved")
        self.assertIn("- [ ] Problem report: error “Can't 3” (2×, 1 device(s), app abc). "
                      "`just logs --grep 'Can'\"'\"'t 3'`", agents)
        self.assertNotIn("Problem report", offered)
        self.assertEqual(logs.file_new(todo, new, out=self.out), 0)
        self.assertEqual(todo.read_text(), text)

    def test_notices_stay_in_the_digest(self):
        todo = self.dir / "TODO.md"
        todo.write_text(self.TODO)
        new = [{"kind": "notice", "message": "Slow", "sample": "Slow", "count": 1, "devices": 1, "apps": ["abc"]}]
        self.assertEqual(logs.file_new(todo, new, out=self.out), 0)
        self.assertEqual(todo.read_text(), self.TODO)

    def test_file_new_goes_with_digest(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            logs.main(["--file-new", "TODO.md"])


class Times(unittest.TestCase):
    def test_times_sort_with_the_workers_keys(self):
        t = dt.datetime(2026, 10, 11, 19, 42, 8, 5000, tzinfo=dt.timezone.utc)
        self.assertEqual(logs.iso(t), "2026-10-11T19:42:08.005Z")


if __name__ == "__main__":
    unittest.main()
