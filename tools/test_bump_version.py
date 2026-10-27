"""The release rule in tools/bump_version.py (run by `just test`): PATCH is the
commit count, it only goes up, and a landing restamps it. The last class runs
the script on a throwaway repo, as `just version`, `--check` and `--restamp`."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bump_version as bv  # noqa: E402

SCRIPT = Path(__file__).resolve().parent / "bump_version.py"
BUMPED = Path(__file__).resolve().parent / "version_bumped.sh"


class Bumped(unittest.TestCase):
    def test_patch_is_the_next_commit_count(self):
        self.assertEqual(bv.bumped("1.0.7", "patch", 12), "1.0.13")

    def test_minor_and_major(self):
        self.assertEqual(bv.bumped("1.0.7", "minor", 12), "1.1.13")
        self.assertEqual(bv.bumped("1.4.7", "major", 12), "2.0.13")

    def test_the_old_two_part_release_starts_at_1_0(self):
        self.assertEqual(bv.bumped("1.0", "patch", 176), "1.0.177")

    def test_bumping_twice_before_committing_gives_the_same_release(self):
        self.assertEqual(bv.bumped(bv.bumped("1.0.3", "patch", 5), "patch", 5), "1.0.6")


class GoesDown(unittest.TestCase):
    def test_a_release_only_goes_up(self):
        # Isopix, 2026-10-16: a shallow cloud clone counted 2 commits and stamped 1.2.2 over 1.2.64.
        self.assertIn("below 1.2.64", bv.goes_down("1.2.64", "1.2.2"))
        self.assertIsNone(bv.goes_down("1.2.64", "1.2.66"))
        self.assertIsNone(bv.goes_down("1.2.66", "1.2.66"))
        self.assertIsNone(bv.goes_down("1.2.64", "1.3.2"))
        self.assertIsNone(bv.goes_down("1.0", "1.0.1"))


class Restamped(unittest.TestCase):
    def test_a_landing_on_a_newer_main_moves_patch_to_the_commit_count(self):
        self.assertEqual(bv.restamped("1.0.177", 180), "1.0.180")

    def test_a_release_already_right_is_left(self):
        self.assertIsNone(bv.restamped("1.0.180", 180))


class CheckProblem(unittest.TestCase):
    def test_patch_matches_its_commit(self):
        self.assertIsNone(bv.check_problem("1.0.177", 177))

    def test_a_commit_landed_since_just_version(self):
        self.assertIn("PATCH must be 178", bv.check_problem("1.0.177", 178))

    def test_not_semver(self):
        self.assertIn("PATCH must be 3", bv.check_problem("1.0", 3))


class StagedProblem(unittest.TestCase):
    def test_the_next_commit_number_passes(self):
        self.assertIsNone(bv.staged_problem("1.0.19", 18))

    def test_a_commit_landed_since_just_version(self):
        self.assertIn("PATCH must be 19", bv.staged_problem("1.0.18", 18))

    def test_a_merge_may_keep_a_parents_release(self):
        # Each parent's release already carries its own commit's number.
        self.assertIsNone(bv.staged_problem("1.0.22", 26, ("1.0.20", "1.0.22")))
        self.assertIn("PATCH must be 27", bv.staged_problem("1.0.23", 26, ("1.0.20", "1.0.22")))

    def test_not_semver(self):
        self.assertIn("PATCH must be 3", bv.staged_problem("1.0", 2))


class OnARepo(unittest.TestCase):
    """The script itself, on a throwaway repo with web/version.js and tools/."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "tools").mkdir()
        (self.root / "web").mkdir()
        (self.root / "tools" / "bump_version.py").write_bytes(SCRIPT.read_bytes())
        (self.root / "tools" / "version_bumped.sh").write_bytes(BUMPED.read_bytes())
        (self.root / "web" / "version.js").write_text("// the release\nexport const RELEASE = '1.0';\n")
        env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
               "GIT_COMMITTER_EMAIL": "t@t", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
        self.env = env
        self.git("init", "-q")
        self.commit("first")

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, env=self.env, capture_output=True, text=True, check=True).stdout

    def commit(self, msg):
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", msg)

    def run_it(self, *args):
        return subprocess.run([sys.executable, "tools/bump_version.py", *args], cwd=self.root, env=self.env,
                              capture_output=True, text=True)

    def release(self):
        return self.run_it("--show").stdout.strip()

    def test_version_then_commit_passes_check(self):
        self.assertEqual(self.run_it().returncode, 0)
        self.assertEqual(self.release(), "1.0.2", "one commit so far, so this is commit 2")
        self.commit("release")
        out = self.run_it("--check")
        self.assertEqual(out.returncode, 0, out.stderr)

    def test_check_fails_when_a_commit_landed_after_just_version(self):
        self.run_it()  # 1.0.2, for commit 2
        self.git("commit", "-q", "--allow-empty", "-m", "another agent's commit")  # commit 2
        self.commit("release")  # commit 3, still says 1.0.2
        out = self.run_it("--check")
        self.assertEqual(out.returncode, 1)
        self.assertIn("PATCH must be 3", out.stderr)

    def test_restamp_moves_patch_after_a_landing(self):
        (self.root / "web" / "version.js").write_text("export const RELEASE = '1.0.2';\n")
        self.git("commit", "-q", "--allow-empty", "-m", "main moved")
        self.commit("release picked onto a newer main")  # commit 3, says 2
        out = self.run_it("--restamp")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(self.release(), "1.0.3")

    def test_restamp_leaves_a_commit_that_does_not_set_the_release(self):
        self.git("commit", "-q", "--allow-empty", "-m", "docs only")
        self.run_it("--restamp")
        self.assertEqual(self.release(), "1.0")

    def bumped_sh(self):
        return subprocess.run(["bash", "tools/version_bumped.sh"], cwd=self.root, env=self.env, capture_output=True, text=True)

    def test_a_change_to_web_without_a_bump_is_refused(self):
        (self.root / "web" / "app.js").write_text("// changed\n")
        self.commit("change web/ alone")
        out = self.bumped_sh()
        self.assertEqual(out.returncode, 1)
        self.assertIn("web/app.js", out.stderr)

    def test_a_change_to_web_with_its_bump_passes(self):
        (self.root / "web" / "app.js").write_text("// changed\n")
        self.run_it()
        self.commit("change web/ and bump")
        (self.root / "README.md").write_text("docs\n")
        self.commit("a docs commit after it needs no bump")
        out = self.bumped_sh()
        self.assertEqual(out.returncode, 0, out.stderr)

    def test_staged_passes_for_the_number_this_commit_will_have(self):
        self.run_it()  # 1.0.2, for commit 2
        self.git("add", "web/version.js")
        out = self.run_it("--staged")
        self.assertEqual(out.returncode, 0, out.stderr)

    def test_staged_refuses_a_number_another_commit_took(self):
        self.run_it()  # 1.0.2, for commit 2
        self.git("commit", "-q", "--allow-empty", "-m", "main moved")  # commit 2 took it
        self.git("add", "web/version.js")
        out = self.run_it("--staged")
        self.assertEqual(out.returncode, 1)
        self.assertIn("PATCH must be 3", out.stderr)

    def test_staged_ignores_a_commit_without_the_release(self):
        (self.root / "README.md").write_text("docs\n")
        self.git("add", "README.md")
        self.assertEqual(self.run_it("--staged").returncode, 0)

    def test_staged_refuses_a_shallow_clone(self):
        for i in range(3):
            self.git("commit", "-q", "--allow-empty", "-m", f"c{i}")
        clone = Path(self.tmp.name) / "shallow-staged"
        subprocess.run(["git", "clone", "-q", "--depth", "1", f"file://{self.root}", str(clone)], env=self.env, check=True)
        (clone / "web" / "version.js").write_text("export const RELEASE = '1.0.2';\n")
        subprocess.run(["git", "add", "web/version.js"], cwd=clone, env=self.env, check=True)
        out = subprocess.run([sys.executable, "tools/bump_version.py", "--staged"], cwd=clone, env=self.env,
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 1)
        self.assertIn("shallow", out.stderr)

    def test_a_shallow_clone_is_refused(self):
        for i in range(3):
            self.git("commit", "-q", "--allow-empty", "-m", f"c{i}")
        clone = Path(self.tmp.name) / "shallow"
        subprocess.run(["git", "clone", "-q", "--depth", "1", f"file://{self.root}", str(clone)], env=self.env, check=True)
        out = subprocess.run([sys.executable, "tools/bump_version.py"], cwd=clone, env=self.env, capture_output=True, text=True)
        self.assertEqual(out.returncode, 1)
        self.assertIn("shallow", out.stderr)


class Hooks(unittest.TestCase):
    """The git hooks (`just setup`), run by git itself on a throwaway repo."""

    HERE = Path(__file__).resolve().parent

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for src, dst in ((self.HERE / "bump_version.py", "tools/bump_version.py"),
                         (self.HERE / "syntax_check.sh", "tools/syntax_check.sh"),
                         (self.HERE.parent / ".githooks" / "pre-commit", ".githooks/pre-commit"),
                         (self.HERE.parent / ".githooks" / "pre-push", ".githooks/pre-push"),
                         (self.HERE.parent / "package.json", "package.json")):
            (self.root / dst).parent.mkdir(parents=True, exist_ok=True)
            (self.root / dst).write_bytes(src.read_bytes())
            (self.root / dst).chmod(0o755)
        (self.root / "web").mkdir()
        (self.root / "web" / "version.js").write_text("export const RELEASE = '1.0';\n")
        self.env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                    "GIT_COMMITTER_EMAIL": "t@t", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
        self.git("init", "-q")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "first")  # no hooks yet
        self.git("config", "core.hooksPath", ".githooks")

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args, check=True):
        return subprocess.run(["git", *args], cwd=self.root, env=self.env, capture_output=True, text=True, check=check)

    def test_a_syntax_error_refuses_the_commit(self):
        (self.root / "web" / "app.js").write_text("const = ;\n")
        self.git("add", "web/app.js")
        out = self.git("commit", "-q", "-m", "broken", check=False)
        self.assertEqual(out.returncode, 1)
        self.assertIn("syntax error", out.stderr)
        self.assertEqual(self.git("rev-list", "--count", "HEAD").stdout.strip(), "1")

    def test_a_stale_release_refuses_the_commit_and_the_right_one_passes(self):
        (self.root / "web" / "app.js").write_text("export const a = 1;\n")
        (self.root / "web" / "version.js").write_text("export const RELEASE = '1.0.7';\n")
        self.git("add", "-A")
        out = self.git("commit", "-q", "-m", "stale", check=False)
        self.assertEqual(out.returncode, 1)
        self.assertIn("PATCH must be 2", out.stderr)
        (self.root / "web" / "version.js").write_text("export const RELEASE = '1.0.2';\n")
        self.git("add", "-A")
        self.assertEqual(self.git("commit", "-q", "-m", "right", check=False).returncode, 0)

    def test_pre_push_refuses_a_release_that_is_not_its_commits_number(self):
        (self.root / "web" / "version.js").write_text("export const RELEASE = '1.0.9';\n")
        self.git("commit", "-q", "-a", "-m", "wrong", "--no-verify")
        out = subprocess.run([".githooks/pre-push"], cwd=self.root, env=self.env, capture_output=True, text=True)
        self.assertEqual(out.returncode, 1)
        self.assertIn("PATCH must be 2", out.stderr)
        self.assertIn("not --amend", out.stderr)

    def test_pre_push_passes_a_release_that_is_right(self):
        (self.root / "web" / "version.js").write_text("export const RELEASE = '1.0.2';\n")
        self.git("commit", "-q", "-a", "-m", "right")
        out = subprocess.run([".githooks/pre-push"], cwd=self.root, env=self.env, capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)


if __name__ == "__main__":
    unittest.main()
