"""just land (tools/land.sh) in a throwaway repo: a commit that touches a file
this checkout holds uncommitted edits in is refused at once, or with --wait
landed once those edits are gone, never before (2026-10-16: a hand-written
wait loop landed early when zsh passed its file list as one word)."""

import os
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

LAND = Path(__file__).resolve().parent / 'land.sh'


def git(cwd, *args):
    return subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


@unittest.skipUnless(shutil.which('just') and shutil.which('bash'), 'just and bash are needed')
class Land(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        origin, repo = self.tmp / 'origin.git', self.tmp / 'repo'
        subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', str(origin)], check=True)
        subprocess.run(['git', 'init', '-q', '-b', 'main', str(repo)], check=True)
        for k, v in (('user.name', 'Test'), ('user.email', 'test'), ('commit.gpgsign', 'false')):
            git(repo, 'config', k, v)
        (repo / 'tools').mkdir()
        shutil.copy(LAND, repo / 'tools' / 'land.sh')
        (repo / 'justfile').write_text('test:\n    true\n')   # finish runs `just test`
        (repo / '.gitignore').write_text('.worktrees/\n')
        (repo / 'a.txt').write_text('one\n')
        (repo / 'b.txt').write_text('one\n')
        git(repo, 'add', '-A')
        git(repo, 'commit', '-q', '-m', 'start')
        git(repo, 'remote', 'add', 'origin', str(origin))
        git(repo, 'push', '-q', 'origin', 'main')
        # An agent's commit on a branch of its own, touching a.txt.
        git(repo, 'switch', '-q', '-c', 'agent')
        (repo / 'a.txt').write_text('one\nagent\n')
        git(repo, 'commit', '-q', '-am', 'agent change')
        self.sha = git(repo, 'rev-parse', 'HEAD')
        git(repo, 'switch', '-q', 'main')
        self.repo = repo
        self.start = git(repo, 'rev-parse', 'main')

    def land(self, *args, **env):
        return subprocess.run(['bash', 'tools/land.sh', 'start', *args, self.sha], cwd=self.repo,
                              capture_output=True, text=True, env={**os.environ, **env}, timeout=60)

    def test_an_edit_here_stops_it_and_names_wait(self):
        (self.repo / 'a.txt').write_text('one\nanother session\n')
        out = self.land()
        self.assertEqual(out.returncode, 1)
        self.assertIn('a.txt', out.stderr)
        self.assertIn('--wait', out.stderr)
        self.assertEqual(git(self.repo, 'rev-parse', 'main'), self.start, 'nothing landed')

    def test_an_edit_to_another_file_does_not_hold_it(self):
        (self.repo / 'b.txt').write_text('one\nanother session\n')
        out = self.land()
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn('agent', (self.repo / 'a.txt').read_text())
        self.assertIn('another session', (self.repo / 'b.txt').read_text(), 'their edit stays')

    def test_wait_gives_up_after_its_limit(self):
        (self.repo / 'a.txt').write_text('one\nanother session\n')
        out = self.land('--wait', LAND_WAIT_SECONDS='2', LAND_WAIT_POLL='1')
        self.assertEqual(out.returncode, 1)
        self.assertIn('⏳ waiting for uncommitted edits here: a.txt', out.stdout)
        self.assertIn('still uncommitted', out.stderr)
        self.assertEqual(git(self.repo, 'rev-parse', 'main'), self.start)
        self.assertIn('another session', (self.repo / 'a.txt').read_text(), 'their edit is untouched')

    def test_wait_lands_once_the_edit_is_committed_on_top_of_it(self):
        (self.repo / 'b.txt').write_text('one\nanother session\n')
        (self.repo / 'a.txt').write_text('another session\none\n')   # an edit that merges with the agent's

        def commit_later():
            time.sleep(2)
            git(self.repo, 'commit', '-q', '-am', 'another session')
        t = threading.Thread(target=commit_later)
        t.start()
        out = self.land('--wait', LAND_WAIT_POLL='1')
        t.join()
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn('⏳', out.stdout)
        self.assertIn('✅ committed', out.stdout)
        log = git(self.repo, 'log', '--format=%s', 'main')
        self.assertEqual(log.splitlines()[:2], ['agent change', 'another session'], 'landed on top of what it waited for')
        self.assertEqual((self.repo / 'a.txt').read_text(), 'another session\none\nagent\n')
        self.assertEqual(git(self.repo, 'rev-parse', 'origin/main'), git(self.repo, 'rev-parse', 'main'), 'pushed')


if __name__ == '__main__':
    unittest.main()
