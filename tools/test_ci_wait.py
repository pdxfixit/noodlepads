"""tools/ci_wait.sh: how it reports the runs of a commit, with a stand-in `gh`.
Run in a throwaway clone, so its `git fetch origin main` needs no network."""
import os
import re
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "ci_wait.sh"


class CiWait(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp = Path(self.tmp.name)
        self.env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                    "GIT_COMMITTER_EMAIL": "t@t", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
        origin = tmp / "origin"
        subprocess.run(["git", "init", "-q", "-b", "main", str(origin)], env=self.env, check=True)
        subprocess.run(["git", "-C", str(origin), "commit", "-q", "--allow-empty", "-m", "first"], env=self.env, check=True)
        self.clone = tmp / "clone"
        subprocess.run(["git", "clone", "-q", str(origin), str(self.clone)], env=self.env, check=True)
        self.bin = tmp / "bin"
        self.bin.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def fake_gh(self, runs):
        """A gh whose `run list` prints these (workflow, status, conclusion, id) rows, as `-q` would."""
        rows = "".join(f"{w}\\t{s}\\t{c}\\t{i}\\n" for w, s, c, i in runs)
        gh = self.bin / "gh"
        gh.write_text(f"#!/bin/sh\nprintf '{rows}'\n")
        gh.chmod(gh.stat().st_mode | stat.S_IXUSR)

    def run_it(self, *args):
        env = {**self.env, "PATH": f"{self.bin}:{os.environ['PATH']}"}
        return subprocess.run(["bash", str(SCRIPT), *args], cwd=self.clone, env=env, capture_output=True, text=True, timeout=60)

    def test_green_runs_exit_0(self):
        self.fake_gh([("test", "completed", "success", 1), ("deploy", "completed", "success", 2)])
        out = self.run_it()
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("✅ test", out.stdout)
        self.assertIn("✅ deploy", out.stdout)

    def test_a_failed_deploy_names_the_run_and_exits_1(self):
        self.fake_gh([("test", "completed", "success", 1), ("deploy", "completed", "failure", 2)])
        out = self.run_it()
        self.assertEqual(out.returncode, 1)
        self.assertIn("❌ deploy: failure (gh run view 2 --log-failed)", out.stdout)

    def test_a_short_sha_is_resolved_in_full(self):
        self.fake_gh([("test", "completed", "success", 1)])
        short = subprocess.run(["git", "rev-parse", "--short", "origin/main"], cwd=self.clone, capture_output=True,
                               text=True).stdout.strip()
        out = self.run_it(short)
        self.assertEqual(out.returncode, 0, out.stderr)

    def test_an_unknown_commit_and_an_unknown_flag_exit_2(self):
        self.fake_gh([])
        self.assertEqual(self.run_it("deadbeef").returncode, 2)
        self.assertEqual(self.run_it("--nope").returncode, 2)

    def test_the_default_wait_outlasts_the_deploy_job(self):
        script = SCRIPT.read_text()
        wait = int(re.search(r"timeout=(\d+)", script).group(1))
        deploy = int(re.search(r"timeout-minutes: (\d+)", (HERE.parent / ".github/workflows/deploy.yml").read_text()).group(1))
        self.assertGreater(wait, deploy)


if __name__ == "__main__":
    unittest.main()
