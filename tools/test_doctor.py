"""tools/doctor.sh's last line: is main live? It reads the live version.json
(the deploy stamps it `{"version":"v<release>-<short sha>","commit":"<short sha>"}`)
and compares its commit with main. Run on a throwaway repo, with the live
address pointed at a local file (NOODLE_LIVE_VERSION_URL)."""
import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

DOCTOR = Path(__file__).resolve().parent / "doctor.sh"


class LiveAgainstMain(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "repo"
        (self.root / "tools").mkdir(parents=True)
        (self.root / "tools" / "doctor.sh").write_bytes(DOCTOR.read_bytes())
        self.live = Path(self.tmp.name) / "version.json"
        self.env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                    "GIT_COMMITTER_EMAIL": "t@t", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
                    "NOODLE_LIVE_VERSION_URL": self.live.as_uri()}
        self.git("init", "-q", "-b", "main")
        self.git("commit", "-q", "--allow-empty", "-m", "first")

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, env=self.env, capture_output=True, text=True,
                              check=True).stdout.strip()

    def serve(self, sha, dirty=False):
        label = f"v1.0.2-{sha}" + ("-dirty" if dirty else "")
        self.live.write_text(json.dumps({"version": label, "commit": sha, "date": "2026-10-26 10:00 UTC"},
                                        separators=(",", ":")))
        return label

    def live_line(self):
        out = subprocess.run(["sh", "tools/doctor.sh"], cwd=self.root, env=self.env, capture_output=True,
                             text=True).stdout
        lines = [line for line in out.splitlines() if re.match(r"^\S+ +live: ", line)]
        self.assertEqual(len(lines), 1, out)
        return lines[0]

    def test_main_deployed_is_ok(self):
        label = self.serve(self.git("rev-parse", "--short", "main"))
        line = self.live_line()
        self.assertTrue(line.startswith("✅"), line)
        self.assertIn(label, line)

    def test_a_commit_on_main_not_yet_deployed_warns(self):
        self.serve(self.git("rev-parse", "--short", "main"))
        self.git("commit", "-q", "--allow-empty", "-m", "second")
        line = self.live_line()
        self.assertTrue(line.startswith("⚠️"), line)
        self.assertIn("1 commit", line)

    def test_a_dirty_deploy_of_main_warns(self):
        self.serve(self.git("rev-parse", "--short", "main"), dirty=True)
        self.assertTrue(self.live_line().startswith("⚠️"))

    def test_a_commit_main_lacks_warns(self):
        self.serve("0123abc")
        line = self.live_line()
        self.assertTrue(line.startswith("⚠️"), line)

    def test_a_clone_with_only_origin_main_compares_with_that(self):
        # A cloud container's clone: a work branch, and main only as origin/main.
        self.git("update-ref", "refs/remotes/origin/main", "main")
        self.git("switch", "-q", "-c", "work")
        self.git("branch", "-q", "-D", "main")
        label = self.serve(self.git("rev-parse", "--short", "origin/main"))
        line = self.live_line()
        self.assertTrue(line.startswith("✅"), line)
        self.assertIn(f"{label}, which is origin/main", line)


if __name__ == "__main__":
    unittest.main()
