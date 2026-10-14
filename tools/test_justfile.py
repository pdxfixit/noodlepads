"""Every task Ben may run without an agent has a `just` recipe that says what
it does, and README.md "Running it yourself" names every recipe (decisions.md,
Hosting and data, 2026-10-13). A new recipe fails here until it is listed."""

import json
import re
import shutil
import subprocess
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

