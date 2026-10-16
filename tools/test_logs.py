#!/usr/bin/env python3
"""Tests for tools/logs.py: the archive, the D1 sync, the digest and filing new
problems in TODO.md. A temp database and a fake D1 API only; no network, no Keychain.

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

URL = "https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db/query"


def upload(device="K7Q4-M2XD", app="3e7f681 2026-10-11", entries=()):
    return {"format": 1, "app": app, "device": device, "env": {"browser": "Chrome", "os": "Android", "type": "tablet"},
            "entries": list(entries)}


def err(message, t=1):
    return {"t": t, "kind": "error", "data": {"message": message, "source": "audio.js", "line": 3}}


def notice(text, t=2):
    return {"t": t, "kind": "notice", "data": {"text": text}}


class DeviceFamilies(unittest.TestCase):
    def test_only_the_families_are_kept_never_a_raw_user_agent(self):
        self.assertEqual(logs.device_families({"browser": "Safari", "os": "iOS", "type": "phone"}), "Safari · iOS · phone")
        self.assertIsNone(logs.device_families({"ua": "Mozilla/5.0 (Linux; Android 14; SM-X200)"}))
        self.assertIsNone(logs.device_families(None))


class FakeD1:
    """Answers logs.D1Reports' two queries from a dict of key -> value, in pages,
    in the shape of D1's query API."""

    def __init__(self, values, page=2, fail_on=None):
        self.values = dict(values)
        self.page = page
        self.fail_on = fail_on
        self.calls = []

    def __call__(self, url, headers, body):
        assert headers["Authorization"] == "Bearer tok"
        assert url == URL
        q = json.loads(body)
        self.calls.append(q)
        if self.fail_on and any(self.fail_on in str(x) for x in [q["sql"], *q["params"]]):
            return 500, b'{"success": false, "errors": [{"message": "boom"}]}'
        if q["sql"].startswith("SELECT key,"):
            after, _limit = q["params"]
            names = [n for n in sorted(self.values) if n > after][:self.page]
            rows = [{"key": n, "app": "x", "device": None, "errors": 0} for n in names]
        elif q["sql"].startswith("SELECT body"):
            name = q["params"][0]
            v = self.values.get(name)
            rows = [] if v is None else [{"body": v.decode() if isinstance(v, bytes) else json.dumps(v)}]
        else:
            return 400, b'{"success": false}'
        return 200, json.dumps({"success": True, "result": [{"results": rows, "success": True}]}).encode()


def kv(fake):
    reports = logs.D1Reports("acct", "db", "tok", fetch=fake)
    reports.PAGE = fake.page
    return reports


class Archive(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.db = self.dir / "state" / "logs.sqlite3"
        self.conn = logs.connect(self.db)
        self.out = io.StringIO()

    def tearDown(self):
        self.conn.close()
        self._tmp.cleanup()

    def sync(self, values, **kw):
        return logs.sync(self.conn, kv(FakeD1(values, **kw)), out=io.StringIO())


class Schema(Archive):
    def test_first_run_creates_the_archive_and_its_folder(self):
        tables = {r[0] for r in self.conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertTrue({"uploads", "events", "meta"} <= tables)
        self.assertTrue(self.db.exists())
        logs.connect(self.db).close()  # a second open keeps what is there

    def test_db_path_honors_the_override(self):
        old = os.environ.get("NOODLE_LOGS_DB")
        os.environ["NOODLE_LOGS_DB"] = str(self.dir / "x.sqlite3")
        try:
            self.assertEqual(logs.db_path(), self.dir / "x.sqlite3")
        finally:
            if old is None:
                del os.environ["NOODLE_LOGS_DB"]
            else:
                os.environ["NOODLE_LOGS_DB"] = old

    def test_readonly_open_refuses_a_missing_archive_and_any_write(self):
        with self.assertRaises(logs.Fail):
            logs.connect(self.dir / "missing.sqlite3", readonly=True)
        ro = logs.connect(self.db, readonly=True)
        with self.assertRaises(logs.Fail):
            logs.run_sql(ro, "DELETE FROM uploads", out=self.out)


class Sync(Archive):
    VALUES = {
        "2026-10-10T08:00:00.000Z_AAAA-BBBB_01": upload(entries=[err("Failed to decode audio data"), notice("hi")]),
        "2026-10-11T09:00:00.000Z_CCCC-DDDD_02": upload(device="CCCC-DDDD", entries=[{"t": 5, "kind": "beat", "data": {"bpm": 120}}]),
        "2026-10-11T10:00:00.000Z_AAAA-BBBB_03": upload(entries=[]),
    }

    def test_copies_every_upload_across_pages_with_its_events(self):
        stats = self.sync(self.VALUES)
        self.assertEqual((stats["listed"], stats["new"]), (3, 3))
        self.assertEqual(stats["newest"], "2026-10-11T10:00:00.000Z_AAAA-BBBB_03")
        rows = self.conn.execute("SELECT key, received, device, app, ua, errors FROM uploads ORDER BY key").fetchall()
        self.assertEqual(rows[0], ("2026-10-10T08:00:00.000Z_AAAA-BBBB_01", "2026-10-10T08:00:00.000Z",
                                   "K7Q4-M2XD", "3e7f681 2026-10-11", "Chrome · Android · tablet", 1))
        ev = self.conn.execute("SELECT seq, kind, json_extract(data, '$.message') FROM events "
                               "WHERE upload LIKE '%_01' ORDER BY seq").fetchall()
        self.assertEqual(ev, [(0, "error", "Failed to decode audio data"), (1, "notice", None)])

    def test_a_rerun_skips_keys_already_there_and_fetches_only_new_values(self):
        self.sync(self.VALUES)
        more = dict(self.VALUES, **{"2026-10-12T00:00:00.000Z_AAAA-BBBB_04": upload()})
        fake = FakeD1(more)
        stats = logs.sync(self.conn, kv(fake), out=self.out)
        self.assertEqual(stats["new"], 1)
        self.assertEqual([q["params"] for q in fake.calls if q["sql"].startswith("SELECT body")],
                         [["2026-10-12T00:00:00.000Z_AAAA-BBBB_04"]])
        self.assertEqual(self.conn.execute("SELECT count(*) FROM uploads").fetchone()[0], 4)

    def test_a_failure_part_way_leaves_the_archive_as_it_was(self):
        with self.assertRaises(logs.Fail):
            self.sync(self.VALUES, fail_on="_03")
        self.assertEqual(self.conn.execute("SELECT count(*) FROM uploads").fetchone()[0], 0)
        self.assertIsNone(logs.get_meta(self.conn, "last_sync"))

    def test_a_failed_listing_is_an_error_never_an_empty_inbox(self):
        with self.assertRaises(logs.Fail):
            self.sync(self.VALUES, fail_on="SELECT key")

    def test_a_key_that_expired_since_the_listing_is_counted_not_fatal(self):
        class Expiring(FakeD1):
            def __call__(self, url, headers, body):
                q = json.loads(body)
                if q["sql"].startswith("SELECT body") and q["params"][0].endswith("_02"):
                    return 200, b'{"success": true, "result": [{"results": []}]}'
                return super().__call__(url, headers, body)
        stats = logs.sync(self.conn, kv(Expiring(self.VALUES)), out=self.out)
        self.assertEqual((stats["new"], stats["gone"]), (2, 1))

    def test_a_value_that_is_not_json_is_kept_as_text(self):
        stats = self.sync({"2026-10-10T00:00:00.000Z_AAAA-BBBB_09": b"garbage"})
        self.assertEqual(stats["bad"], 1)
        self.assertEqual(self.conn.execute("SELECT payload FROM uploads").fetchone()[0], "garbage")


class Reading(Archive):
    def setUp(self):
        super().setUp()
        self.sync(Sync.VALUES)

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
        db = str(self.db)
        self.sync({"2026-10-10T00:00:00.000Z_AAAA-BBBB_01": upload(entries=[err("X")])})
        os.environ["NOODLE_LOGS_DB"] = db
        try:
            with contextlib.redirect_stdout(io.StringIO()) as first:
                self.assertEqual(logs.main(["--digest", "--mark"]), 0)
            with contextlib.redirect_stdout(io.StringIO()) as second:
                logs.main(["--digest"])
        finally:
            del os.environ["NOODLE_LOGS_DB"]
        self.assertIn("| 🆕 | error | X |", first.getvalue())
        self.assertIn("No errors or notices.", second.getvalue())


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


class Config(unittest.TestCase):
    def test_placeholders_are_refused_with_where_to_look(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "c.json"
            p.write_text(json.dumps({"account_id": "<fill>", "database_id": "n", "keychain_service": "s"}))
            with self.assertRaises(logs.Fail) as e:
                logs.load_config(p)
            self.assertIn("account_id", str(e.exception))

    def test_the_ids_live_outside_the_repo(self):
        self.assertFalse((logs.HERE / "logs.config.json").exists(), "the ids moved to ~/.config/noodlepads")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "cloud.json"
            p.write_text(json.dumps({"account_id": "a", "database_id": "b"}))
            os.environ["NOODLEPADS_CONFIG"] = str(p)
            try:
                self.assertEqual(logs.load_config()["keychain_service"], "noodlepads-logs")
            finally:
                del os.environ["NOODLEPADS_CONFIG"]
            with self.assertRaises(logs.Fail) as e:
                logs.load_config(Path(d) / "missing.json")
            self.assertIn("cloud.example.json", str(e.exception), "says how to make it")

    def test_keys_parse_into_time_and_device(self):
        self.assertEqual(logs.parse_key("2026-10-11T19:42:08.123Z_K7Q4-M2XD_0a1b2c3d"),
                         ("2026-10-11T19:42:08.123Z", "K7Q4-M2XD"))

    def test_times_sort_with_the_workers_keys(self):
        t = dt.datetime(2026, 10, 11, 19, 42, 8, 5000, tzinfo=dt.timezone.utc)
        self.assertEqual(logs.iso(t), "2026-10-11T19:42:08.005Z")


if __name__ == "__main__":
    unittest.main()
