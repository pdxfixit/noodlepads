"""tools/cloud_config.py: the state folder's one-time move and the Keychain's
older item name. Scratch folders and a fake Keychain only."""

import io
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
