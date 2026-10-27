"""tools/syntax_check.sh: modules, Python tools, shell tools and hooks are all parsed.
Run on a throwaway tree, since the script checks the tree around itself."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "syntax_check.sh"


class SyntaxCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "tools").mkdir()
        shutil.copy(SCRIPT, self.root / "tools" / "syntax_check.sh")
        self.put("web/app.js", "export const a = 1;\n")
        self.put("tools/ok.py", "x = 1\n")
        self.put("tools/ok.sh", "echo hi\n")
        self.put(".githooks/pre-commit", "#!/bin/sh\ntrue\n")

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def run_it(self):
        return subprocess.run(["sh", "tools/syntax_check.sh"], cwd=self.root, capture_output=True, text=True)

    def test_a_clean_tree_passes_and_leaves_no_bytecode(self):
        out = self.run_it()
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(list(self.root.rglob("__pycache__")), [])

    def test_a_broken_module_fails(self):
        self.put("web/app.js", "const = ;\n")
        self.assertNotEqual(self.run_it().returncode, 0)

    def test_a_broken_python_tool_fails(self):
        self.put("tools/bad.py", "def (:\n")
        out = self.run_it()
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("bad.py", out.stderr)

    def test_a_broken_shell_tool_fails(self):
        self.put("tools/bad.sh", "if true; then\n")
        self.assertNotEqual(self.run_it().returncode, 0)

    def test_a_broken_hook_fails(self):
        self.put(".githooks/pre-push", "if true; then\n")
        self.assertNotEqual(self.run_it().returncode, 0)


if __name__ == "__main__":
    unittest.main()
