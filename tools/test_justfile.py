"""Every task Ben may run without an agent has a `just` recipe that says what
it does, and README.md "Running it yourself" names every recipe (decisions.md,
Hosting and data, 2026-10-13). A new recipe fails here until it is listed."""

import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def recipes():
    out = subprocess.run(['just', '--justfile', str(ROOT / 'justfile'), '--dump', '--dump-format', 'json'],
                         capture_output=True, text=True, check=True).stdout
    return {name: r for name, r in json.loads(out)['recipes'].items() if not r.get('private')}


def section():
    text = (ROOT / 'README.md').read_text()
    m = re.search(r'^## Running it yourself\n(.*?)(?=^## )', text, re.S | re.M)
    return m.group(1) if m else ''


@unittest.skipUnless(shutil.which('just'), 'just is not installed')
class Justfile(unittest.TestCase):
    def test_every_recipe_says_what_it_does(self):
        bare = [name for name, r in recipes().items() if not (r.get('doc') or '').strip()]
        self.assertEqual(bare, [], 'give each a [doc("…")] or a comment line above it')

    def test_the_readme_names_every_recipe(self):
        named = set(re.findall(r'`just ([a-z][a-z0-9-]*)', section()))
        self.assertTrue(named, 'README.md has a "Running it yourself" section')
        self.assertEqual(sorted(set(recipes()) - named), [], 'add these to README.md "Running it yourself"')
        self.assertEqual(sorted(named - set(recipes())), [], 'the README names a recipe that is gone')

    def test_test_quiet_names_the_failing_tests_and_keeps_the_log(self):
        # The real justfile, with `test` replaced by one that fails the way node --test does.
        with tempfile.TemporaryDirectory() as tmp:
            text = (ROOT / 'justfile').read_text()
            failing = 'test:\n    @echo "✔ fine"\n    @echo "✖ the pad plays (1ms)"\n    @echo "✖ failing tests:"\n    @exit 1\n'
            Path(tmp, 'justfile').write_text('set allow-duplicate-recipes := true\n' + text + '\n' + failing)
            out = subprocess.run(['just', 'test-quiet'], cwd=tmp, capture_output=True, text=True)
            self.assertEqual(out.returncode, 1)
            self.assertIn('✖ the pad plays', out.stderr)
            self.assertNotIn('✔ fine', out.stderr, 'only the failures')
            self.assertNotIn('failing tests:', out.stderr)
            log = re.search(r'📄 full output: (\S+)', out.stderr)
            self.assertTrue(log and Path(log.group(1)).read_text().count('✔ fine') == 1, 'the whole output is kept')
            Path(log.group(1)).unlink()

