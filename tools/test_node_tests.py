"""`just test` fails when --test-force-exit cut a test's report and that file
fails alone (tools/node_tests.sh). Until 2026-10-26 a cut run printed ⚠️ and
still exited 0, and the deploy trusts that exit code. Here a stand-in `node`
plays the full run and the reruns; one test runs the real node on two tiny
files."""

import os
import shutil
import stat
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The full run prints $FULL_OUT, writes $CUT (one file a line) where the second
# reporter writes, and exits $FULL_RC. A run of one file logs it in calls.txt,
# prints ✖ and exits 1 when that file is in $FAILS_ALONE.
FAKE_NODE = textwrap.dedent('''\
    #!/usr/bin/env python3
    import os, sys
    args = sys.argv[1:]
    files = [a for a in args if a.endswith('.test.mjs')]
    here = os.path.dirname(os.path.abspath(__file__))
    if files:
        with open(os.path.join(here, 'calls.txt'), 'a') as f: f.write(files[0] + '\\n')
        if os.path.basename(files[0]) in os.environ.get('FAILS_ALONE', '').split():
            print('✖ the pad plays (3ms)'); sys.exit(1)
        print('✔ the pad plays (3ms)'); sys.exit(0)
    dests = [a.split('=', 1)[1] for a in args if a.startswith('--test-reporter-destination=')]
    with open(dests[1], 'w') as f: f.write(os.environ.get('CUT', ''))
    print(os.environ.get('FULL_OUT', '✔ fine (1ms)'))
    sys.exit(int(os.environ.get('FULL_RC', '0')))
''')


class NodeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / 'tools').mkdir()
        (self.tmp / 'tests').mkdir()
        shutil.copy(ROOT / 'tools/node_tests.sh', self.tmp / 'tools')
        self.bin = self.tmp / 'bin'
        self.bin.mkdir()
        node = self.bin / 'node'
        node.write_text(FAKE_NODE)
        node.chmod(node.stat().st_mode | stat.S_IEXEC)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_tests(self, **env):
        cut = ''.join(f'{self.tmp}/tests/{name}\n' for name in env.pop('cut', []))
        full = dict(os.environ, PATH=f'{self.bin}{os.pathsep}{os.environ["PATH"]}', CUT=cut, **env)
        out = subprocess.run(['sh', 'tools/node_tests.sh'], cwd=self.tmp, env=full, capture_output=True, text=True)
        calls = self.bin / 'calls.txt'
        alone = [Path(line).name for line in calls.read_text().split()] if calls.exists() else []
        return out.returncode, out.stdout + out.stderr, alone

    def test_a_cut_file_that_fails_alone_fails_the_run(self):
        rc, out, alone = self.run_tests(cut=['a.test.mjs', 'b.test.mjs'], FULL_OUT='▶ records\n✔ plays (1ms)',
                                        FAILS_ALONE='b.test.mjs')
        self.assertEqual(rc, 1)
        self.assertEqual(alone, ['a.test.mjs', 'b.test.mjs'], 'each cut file runs alone, in order')
        self.assertIn('⚠️ started, but its end was never reported', out)
        self.assertIn('▶ records', out)
        self.assertIn('↻ tests/a.test.mjs, run alone, passes', out)
        self.assertIn('✖ the pad plays', out, 'the failing run is shown')
        self.assertIn('✖ tests/b.test.mjs fails when run alone', out)

    def test_a_cut_file_that_passes_alone_passes(self):
        rc, out, alone = self.run_tests(cut=['a.test.mjs'], FULL_OUT='▶ records')
        self.assertEqual(rc, 0, out)
        self.assertEqual(alone, ['a.test.mjs'])
        self.assertIn('⚠️', out)

    def test_a_full_run_reruns_nothing(self):
        rc, out, alone = self.run_tests(FAILS_ALONE='a.test.mjs')
        self.assertEqual((rc, alone), (0, []))
        self.assertNotIn('⚠️', out)

    def test_a_failing_run_fails_even_when_the_cut_file_passes_alone(self):
        rc, _, alone = self.run_tests(cut=['a.test.mjs'], FULL_RC='1', FULL_OUT='▶ records\n✖ stops (1ms)')
        self.assertEqual((rc, alone), (1, ['a.test.mjs']))

    def test_a_cut_with_no_file_named_fails(self):
        rc, out, alone = self.run_tests(FULL_OUT='▶ records')
        self.assertEqual((rc, alone), (1, []))
        self.assertIn('no file was named', out)


@unittest.skipUnless(shutil.which('node'), 'node is not installed')
class RealNode(unittest.TestCase):
    def test_the_real_runner_takes_both_reporters(self):
        with tempfile.TemporaryDirectory() as tmp:
            for d in ('tools', 'tests'):
                Path(tmp, d).mkdir()
            shutil.copy(ROOT / 'tools/node_tests.sh', Path(tmp, 'tools'))
            shutil.copy(ROOT / 'tests/unended-reporter.mjs', Path(tmp, 'tests'))
            Path(tmp, 'tests/a.test.mjs').write_text("import { test } from 'node:test';\ntest('plays', () => {});\n")
            run = lambda: subprocess.run(['sh', 'tools/node_tests.sh'], cwd=tmp, capture_output=True, text=True)
            out = run()
            self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
            self.assertIn('✔ plays', out.stdout)
            self.assertNotIn('⚠️', out.stdout)
            Path(tmp, 'tests/b.test.mjs').write_text("import { test } from 'node:test';\ntest('stops', () => { throw new Error('no'); });\n")
            self.assertEqual(run().returncode, 1)


if __name__ == '__main__':
    unittest.main()
