"""tools/policy.sh (`just policy`): copies docs/privacy-policy.md into the privacy repo through its `just take`,
in a throwaway worktree, then `just land` there; a dry run (--no-land) only shows what would land.

The privacy repo here is a stand-in: a justfile whose `take` copies the file and commits it (the real
take.sh is tested in pdxfixit/privacy) and whose `land` leaves a marker."""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GIT = ['git', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid']
POLICY = '---\nname: Demo\nblurb: A demo\nupdated: 1 January 2026\n---\n# Demo privacy policy\n'
TAKE = '''#!/usr/bin/env bash
set -eu
app=$1; file=$2
mkdir -p "src/$app"
cp "$file" "src/$app/policy.md"
git add "src/$app/policy.md"
git diff --cached --quiet && { echo "take: nothing changed"; exit 0; }
git -c user.name=t -c user.email=t@example.invalid commit -q -m "docs: policy from $app@${TAKE_SHA:0:7}"
'''
JUSTFILE = 'take app file:\n    bash tools/take.sh {{app}} {{file}}\n\nland:\n    echo landed > "$LANDED"\n'


def git(cwd, *args):
    return subprocess.run([*GIT, *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


@unittest.skipUnless(shutil.which('just'), 'just is not installed')
class Policy(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        # The privacy repo: an origin, and a checkout of it on main beside the app.
        seed = self.tmp / 'seed'
        seed.mkdir()
        (seed / 'tools').mkdir()
        (seed / 'tools' / 'take.sh').write_text(TAKE)
        (seed / 'justfile').write_text(JUSTFILE)
        (seed / 'src' / 'demo').mkdir(parents=True)
        (seed / 'src' / 'demo' / 'policy.md').write_text(POLICY)
        git(seed, 'init', '-q', '-b', 'main')
        git(seed, 'add', '-A')
        git(seed, 'commit', '-q', '-m', 'start')
        self.priv_origin = self.tmp / 'privacy.git'
        git(self.tmp, 'clone', '-q', '--bare', str(seed), str(self.priv_origin))
        self.privacy = self.tmp / 'work' / 'privacy'
        git(self.tmp, 'clone', '-q', str(self.priv_origin), str(self.privacy))
        # The app, with its own origin so HEAD can be on origin/main.
        self.app = self.tmp / 'work' / 'app'
        (self.app / 'docs').mkdir(parents=True)
        (self.app / 'tools').mkdir()
        shutil.copy(ROOT / 'tools' / 'policy.sh', self.app / 'tools' / 'policy.sh')
        (self.app / 'docs' / 'privacy-policy.md').write_text(POLICY.replace('1 January', '2 January'))
        git(self.app, 'init', '-q', '-b', 'main')
        git(self.app, 'add', '-A')
        git(self.app, 'commit', '-q', '-m', 'app')
        self.app_origin = self.tmp / 'app.git'
        git(self.tmp, 'clone', '-q', '--bare', str(self.app), str(self.app_origin))
        git(self.app, 'remote', 'add', 'origin', str(self.app_origin))
        git(self.app, 'fetch', '-q', 'origin')
        self.landed = self.tmp / 'landed'

    def run_policy(self, *args, cwd=None, **env):
        e = {k: v for k, v in os.environ.items() if k not in ('PRIVACY', 'POLICY_NO_LAND')}
        e.update(HOME=str(self.tmp / 'home'), XDG_CACHE_HOME=str(self.tmp / 'cache'), LANDED=str(self.landed))
        e.update({k: str(v) for k, v in env.items()})
        return subprocess.run(['bash', str(self.app / 'tools' / 'policy.sh'), *args], cwd=cwd or self.app, env=e, capture_output=True, text=True)

    def worktrees(self):
        return [l for l in git(self.privacy, 'worktree', 'list', '--porcelain').splitlines() if l.startswith('worktree ')]

    def test_a_dry_run_shows_the_commit_and_leaves_the_privacy_checkout_alone(self):
        before = git(self.privacy, 'rev-parse', 'HEAD')
        r = self.run_policy('--no-land', PRIVACY=self.privacy)
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        sha = git(self.app, 'rev-parse', 'HEAD')[:7]
        self.assertIn(f'docs: policy from noodlepads@{sha}', r.stdout)
        self.assertIn('nothing landed', r.stdout)
        self.assertFalse(self.landed.exists())
        self.assertEqual(git(self.privacy, 'rev-parse', 'HEAD'), before)
        self.assertEqual(git(self.privacy, 'status', '--porcelain'), '')
        self.assertEqual(len(self.worktrees()), 1, 'the scratch worktree is gone')
        self.assertEqual(git(self.privacy, 'branch', '--list', 'policy-*'), '', 'and its branch')

    def test_the_environment_switch_is_a_dry_run_too(self):
        r = self.run_policy(PRIVACY=self.privacy, POLICY_NO_LAND='1')
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertFalse(self.landed.exists())

    def test_it_lands_from_a_worktree_when_head_is_on_origin_main(self):
        r = self.run_policy(PRIVACY=self.privacy)
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertEqual(self.landed.read_text().strip(), 'landed')
        self.assertEqual(len(self.worktrees()), 1)

    def test_it_will_not_land_a_head_that_is_not_on_origin_main(self):
        (self.app / 'docs' / 'x.md').write_text('x')
        git(self.app, 'add', '-A')
        git(self.app, 'commit', '-q', '-m', 'local only')
        r = self.run_policy(PRIVACY=self.privacy)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('not on origin/main', r.stderr)
        self.assertFalse(self.landed.exists())
        self.assertEqual(self.run_policy('--no-land', PRIVACY=self.privacy).returncode, 0, 'a dry run does not mind')

    def test_it_refuses_an_uncommitted_policy(self):
        policy = self.app / 'docs' / 'privacy-policy.md'
        policy.write_text(policy.read_text() + 'more\n')
        r = self.run_policy('--no-land', PRIVACY=self.privacy)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('uncommitted', r.stderr)

    def test_it_finds_privacy_beside_the_repo_and_pulls_its_main(self):
        # A newer commit on GitHub's main: the checkout beside the app is fast-forwarded to it first.
        other = self.tmp / 'other'
        git(self.tmp, 'clone', '-q', str(self.priv_origin), str(other))
        (other / 'NEWS').write_text('n')
        git(other, 'add', '-A')
        git(other, 'commit', '-q', '-m', 'newer')
        git(other, 'push', '-q', 'origin', 'main')
        r = self.run_policy('--no-land')
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertEqual(git(self.privacy, 'log', '-1', '--format=%s'), 'newer')

    def test_it_clones_a_cache_copy_when_there_is_none_beside_the_repo(self):
        shutil.rmtree(self.privacy)
        # The clone URL is fixed in the script; point it at the local origin through git's own rewrite.
        cfg = self.tmp / 'gitconfig'
        cfg.write_text(f'[url "{self.priv_origin}"]\n\tinsteadOf = https://github.com/pdxfixit/privacy\n')
        r = self.run_policy('--no-land', GIT_CONFIG_GLOBAL=cfg)
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertTrue((self.tmp / 'cache' / 'privacy' / '.git').exists())

    def test_nothing_changed_lands_nothing(self):
        git(self.privacy, 'worktree', 'prune')
        (self.privacy / 'src' / 'noodlepads').mkdir(parents=True)
        (self.privacy / 'src' / 'noodlepads' / 'policy.md').write_text((self.app / 'docs' / 'privacy-policy.md').read_text())
        git(self.privacy, 'add', '-A')
        git(self.privacy, 'commit', '-q', '-m', 'already there')
        git(self.privacy, 'push', '-q', 'origin', 'main')
        r = self.run_policy(PRIVACY=self.privacy)
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        self.assertIn('nothing to land', r.stdout)
        self.assertFalse(self.landed.exists())

    def test_a_privacy_repo_without_take_says_its_change_must_land_first(self):
        git(self.privacy, 'rm', '-q', 'tools/take.sh')
        git(self.privacy, 'commit', '-q', '-m', 'no take')
        git(self.privacy, 'push', '-q', 'origin', 'main')
        r = self.run_policy('--no-land', PRIVACY=self.privacy)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('no tools/take.sh', r.stderr)
        self.assertEqual(len(self.worktrees()), 1)

    def test_a_take_that_stops_commits_and_lands_nothing(self):
        (self.privacy / 'tools' / 'take.sh').write_text('#!/usr/bin/env bash\necho "take: bump updated:" >&2\nexit 1\n')
        git(self.privacy, 'commit', '-q', '-am', 'strict take')
        git(self.privacy, 'push', '-q', 'origin', 'main')
        r = self.run_policy(PRIVACY=self.privacy)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('bump updated:', r.stderr)
        self.assertFalse(self.landed.exists())
        self.assertEqual(len(self.worktrees()), 1)


if __name__ == '__main__':
    unittest.main()
