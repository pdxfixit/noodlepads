#!/usr/bin/env python3
"""Tests for gate.py: when sync and digest are due, what attention says, and
that `done` is the only writer. Scratch state and a scratch repo only.

  python3 test_gate.py
"""
import contextlib
import datetime as dt
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gate  # noqa: E402

T = dt.datetime(2026, 10, 11, 12, 0, tzinfo=dt.timezone.utc)
REAL = {"account_id": "acct", "database_id": "db", "keychain_service": "noodlepads-logs"}


class Scratch(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.state = self.dir / "state" / "noodlepads-logs.state.json"
        self.repo = self.dir / "repo"
        self.cloud = self.dir / "config" / "cloud.json"
        (self.repo / "tools").mkdir(parents=True)
        self.config(REAL)
        self._env = {k: os.environ.get(k) for k in ("NOODLE_LOGS_STATE", "NOODLE_LOGS_REPO", "NOODLEPADS_CONFIG")}
        os.environ["NOODLE_LOGS_STATE"] = str(self.state)
        os.environ["NOODLE_LOGS_REPO"] = str(self.repo)
        os.environ["NOODLEPADS_CONFIG"] = str(self.cloud)

    def tearDown(self):
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        self._tmp.cleanup()

    def config(self, cfg):
        self.cloud.parent.mkdir(parents=True, exist_ok=True)
        self.cloud.write_text(json.dumps(cfg))

    def write_state(self, sync_ago=None, digest_ago=None, **extra):
        jobs = {}
        for job, ago in (("sync", sync_ago), ("digest", digest_ago)):
            if ago is not None:
                jobs[job] = {"last_success": (T - ago).isoformat(timespec="seconds"), "status": "ok",
                             **extra.get(job, {})}
        self.state.parent.mkdir(parents=True, exist_ok=True)
        self.state.write_text(json.dumps({"version": 1, "jobs": jobs}))

    def gate(self, *args, t=T):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            if args and args[0] == "attention":
                code = gate.cmd_attention(t)
            elif args:
                code = gate.main(list(args))
            else:
                code = gate.cmd_gate(t)
        return code, out.getvalue().strip()


class Due(Scratch):
    def test_first_run_is_due_for_both(self):
        code, line = self.gate()
        self.assertEqual(code, 10)
        self.assertEqual(line, "DUE sync (never succeeded), digest (never succeeded)")

    def test_sync_is_due_after_20_hours_not_before(self):
        self.write_state(sync_ago=dt.timedelta(hours=19, minutes=59), digest_ago=dt.timedelta(days=1))
        self.assertEqual(self.gate()[0], 0)
        self.write_state(sync_ago=dt.timedelta(hours=20), digest_ago=dt.timedelta(days=1))
        code, line = self.gate()
        self.assertEqual(code, 10)
        self.assertEqual(line, "DUE sync (last good sync 20h ago)")

    def test_digest_is_due_after_7_days(self):
        self.write_state(sync_ago=dt.timedelta(hours=1), digest_ago=dt.timedelta(days=7))
        code, line = self.gate()
        self.assertEqual((code, line), (10, "DUE digest (last good digest 7d ago)"))

    def test_quiet_says_how_long_ago(self):
        self.write_state(sync_ago=dt.timedelta(hours=3), digest_ago=dt.timedelta(days=2))
        self.assertEqual(self.gate(), (0, "NOTHING-DUE (last sync 3h ago, last digest 2d ago)"))

    def test_a_failed_sync_stays_due(self):
        self.write_state(sync_ago=dt.timedelta(hours=30), digest_ago=dt.timedelta(days=1))
        state = json.loads(self.state.read_text())
        state["jobs"]["sync"]["status"] = "error"
        self.state.write_text(json.dumps(state))
        self.assertEqual(self.gate()[0], 10)

    def test_not_set_up_is_nothing_due(self):
        self.config({**REAL, "database_id": "<id printed by wrangler>"})
        code, line = self.gate()
        self.assertEqual(code, 0)
        self.assertIn("not set up: database_id", line)

    def test_no_config_file_yet_is_not_set_up(self):
        self.cloud.unlink()
        self.assertEqual(self.gate(), (0, f"NOTHING-DUE (not set up: no {self.cloud} (just doctor says how to make it))"))

    def test_a_missing_repo_or_bad_state_is_a_gate_error_not_nothing_due(self):
        os.environ["NOODLE_LOGS_REPO"] = str(self.dir / "nope")
        with contextlib.redirect_stdout(io.StringIO()) as out:
            code = gate.main([])
        self.assertEqual(code, 2)
        self.assertIn("gate error", out.getvalue())
        os.environ["NOODLE_LOGS_REPO"] = str(self.repo)
        self.state.parent.mkdir(parents=True, exist_ok=True)
        self.state.write_text("{not json")
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(gate.main([]), 2)


class Attention(Scratch):
    def test_lists_each_jobs_items_and_a_stale_sync(self):
        self.write_state(sync_ago=dt.timedelta(days=4), digest_ago=dt.timedelta(days=1),
                         sync={"attention": ["D1 query: HTTP 403"]}, digest={"attention": ["TODO.md busy"]})
        code, text = self.gate("attention")
        self.assertEqual(code, 0)
        self.assertEqual(text.splitlines(), [
            "sync: D1 query: HTTP 403", "digest: TODO.md busy",
            "sync: last good sync 4d ago; D1 deletes uploads after 30 days"])

    def test_quiet_when_all_is_well_or_not_set_up(self):
        self.write_state(sync_ago=dt.timedelta(hours=1), digest_ago=dt.timedelta(days=1))
        self.assertEqual(self.gate("attention"), (0, ""))
        self.config({**REAL, "account_id": "<fill>"})
        self.write_state(sync_ago=dt.timedelta(days=9), digest_ago=dt.timedelta(days=1))
        self.assertEqual(self.gate("attention"), (0, ""))


class Done(Scratch):
    def test_done_records_success_newest_key_and_replaces_attention(self):
        notes = self.dir / "att.txt"
        notes.write_text("one\n\n two \n")
        self.assertEqual(self.gate("done", "sync", "--status", "error", "--attention", str(notes))[0], 0)
        s = json.loads(self.state.read_text())["jobs"]["sync"]
        self.assertEqual((s["status"], s["attention"], s.get("last_success")), ("error", ["one", "two"], None))
        self.gate("done", "sync", "--status", "ok", "--newest", "2026-10-11T00:00:00.000Z_AAAA-BBBB_01")
        s = json.loads(self.state.read_text())["jobs"]["sync"]
        self.assertEqual(s["attention"], [])
        self.assertEqual(s["newest"], "2026-10-11T00:00:00.000Z_AAAA-BBBB_01")
        self.assertTrue(s["last_success"])

    def test_done_then_gate_is_quiet(self):
        self.gate("done", "sync", "--status", "ok")
        self.gate("done", "digest", "--status", "ok")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(gate.cmd_gate(), 0)

    def test_the_gate_and_attention_never_write(self):
        self.write_state(sync_ago=dt.timedelta(days=4), digest_ago=dt.timedelta(days=9))
        before = (self.state.read_bytes(), self.state.stat().st_mtime_ns)
        self.gate()
        self.gate("attention")
        self.assertEqual((self.state.read_bytes(), self.state.stat().st_mtime_ns), before)
        self.assertEqual(sorted(p.name for p in self.state.parent.iterdir()), [self.state.name])

    def test_runs_as_a_script_in_about_a_second(self):
        env = dict(os.environ)
        start = time.monotonic()
        p = subprocess.run([sys.executable, str(HERE / "gate.py")], capture_output=True, text=True, env=env)
        self.assertLess(time.monotonic() - start, 1.5)
        self.assertEqual(p.returncode, 10)
        p = subprocess.run([sys.executable, str(HERE / "gate.py"), "attention"], capture_output=True, text=True, env=env)
        self.assertEqual(p.returncode, 0)


class Skill(unittest.TestCase):
    """The parts of recurrent's leg contract that leg.py check reads statically."""

    def test_skill_md_honors_the_leg_contract(self):
        text = (HERE / "SKILL.md").read_text()
        front = text.split("\n---", 1)[0]
        self.assertTrue(text.startswith("---"))
        self.assertIn("\nname: noodlepads-logs\n", front + "\n")
        self.assertIn("leg of the recurrent routine", " ".join(front.split()))
        self.assertIn("leg.py finish noodlepads-logs", text)
        self.assertIn("~/.local/state/skills/noodlepads-logs.state.json", text)


if __name__ == "__main__":
    unittest.main()
