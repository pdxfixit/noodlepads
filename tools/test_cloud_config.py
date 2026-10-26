"""tools/cloud_config.py: the state folder's one-time move, the Keychain's
older item name, the ids' exports and the deploy checks' key. Scratch folders
and a fake Keychain only."""

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cloud_config as cc


class StateDir(unittest.TestCase):
    def test_the_older_folder_moves_once_with_what_it_holds(self):
        with tempfile.TemporaryDirectory() as home:
            old = Path(home, ".local/state/noodle-pads")
            old.mkdir(parents=True)
            (old / "logs.sqlite3").write_text("kept")
            new = cc.state_dir(home)
            self.assertEqual(new.name, "noodlepads")
            self.assertEqual((new / "logs.sqlite3").read_text(), "kept")
            self.assertFalse(old.exists())

    def test_both_there_leaves_both_alone(self):
        with tempfile.TemporaryDirectory() as home:
            for name in ("noodle-pads", "noodlepads"):
                Path(home, ".local/state", name).mkdir(parents=True)
            cc.state_dir(home)
            self.assertTrue(Path(home, ".local/state/noodle-pads").exists())


class Keychain(unittest.TestCase):
    def test_the_new_name_is_read_first(self):
        self.assertEqual(cc.keychain_token(find={"noodlepads-logs": "new", "noodle-pads-logs": "old"}.get), "new")

    def test_only_the_old_name_works_and_says_how_to_rename(self):
        err = io.StringIO()
        self.assertEqual(cc.keychain_token(find={"noodle-pads-logs": "old"}.get, err=err), "old")
        self.assertIn("security add-generic-password -s noodlepads-logs", err.getvalue())

    def test_neither_is_an_error_never_an_empty_token(self):
        with self.assertRaises(cc.ConfigError):
            cc.keychain_token(find={}.get)


class Exports(unittest.TestCase):
    """site/wrangler.toml holds ${D1_DATABASE_ID}; on the Mac the ids come from
    cloud.json, on GitHub from secrets, which must not be overwritten."""
    cfg = {"account_id": "acct1", "database_id": "db-1"}

    def test_both_ids_from_the_config(self):
        self.assertEqual(cc.exports(self.cfg, {}),
                         "export D1_DATABASE_ID=db-1\nexport CLOUDFLARE_ACCOUNT_ID=acct1")

    def test_a_value_already_set_wins(self):
        self.assertEqual(cc.exports(self.cfg, {"D1_DATABASE_ID": "from-secret"}),
                         "export CLOUDFLARE_ACCOUNT_ID=acct1")


class ChecksKey(unittest.TestCase):
    """Ben's `just deploy` on the Mac: the live checks after the upload need
    CHECKS_KEY, read from cloud.json's checksKey; with none, it refuses before
    the upload and says how to add it."""
    cfg = {"account_id": "acct1", "database_id": "db-1"}

    def test_the_key_from_the_config_trimmed_and_quoted(self):
        self.assertEqual(cc.checks_export({**self.cfg, "checksKey": " k1'x \n"}, {}), "export CHECKS_KEY='k1'\"'\"'x'")

    def test_a_value_already_set_wins_trimmed(self):
        self.assertEqual(cc.checks_export({**self.cfg, "checksKey": "mac"}, {"CHECKS_KEY": " from-secret\n"}), "export CHECKS_KEY=from-secret")

    def test_none_or_the_template_says_how_to_add_it(self):
        for cfg in (self.cfg, {**self.cfg, "checksKey": "<the GitHub secret CHECKS_KEY's value>"}, {**self.cfg, "checksKey": "  "}):
            with self.assertRaises(cc.ConfigError) as e:
                cc.checks_export(cfg, {"CHECKS_KEY": " "})
            self.assertIn('"checksKey"', str(e.exception))
            self.assertIn("openssl rand -hex 24", str(e.exception))

    def run_cli(self, cfg, env_key=None):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d, "cloud.json")
            path.write_text(json.dumps(cfg))
            env = {k: v for k, v in os.environ.items() if k != "CHECKS_KEY"}
            env["NOODLEPADS_CONFIG"] = str(path)
            if env_key is not None:
                env["CHECKS_KEY"] = env_key
            script = Path(cc.__file__)
            return subprocess.run([sys.executable, str(script), "--checks-key"], capture_output=True, text=True, env=env)

    def test_the_command_line_exports_it_or_fails(self):
        ok = self.run_cli({**self.cfg, "checksKey": "abc123"})
        self.assertEqual((ok.returncode, ok.stdout.strip()), (0, "export CHECKS_KEY=abc123"))
        missing = self.run_cli(self.cfg)
        self.assertEqual(missing.returncode, 1)
        self.assertEqual(missing.stdout, "")
        self.assertIn("no checksKey", missing.stderr)
        set_already = self.run_cli(self.cfg, env_key="from-env ")
        self.assertEqual((set_already.returncode, set_already.stdout.strip()), (0, "export CHECKS_KEY=from-env"))
