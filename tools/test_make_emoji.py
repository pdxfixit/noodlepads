"""tools/make_emoji.py: the committed web/emoji-all.js and web/emoji-check.js
are what the tool makes, and the list holds only single emoji."""
import re
import sys
import unicodedata
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_emoji  # noqa: E402


class MakeEmojiTest(unittest.TestCase):
    def setUp(self):
        self.items = make_emoji.collect()

    def test_committed_files_match_the_tool(self):
        committed = (make_emoji.WEB / "emoji-all.js").read_text(encoding="utf-8")
        made_with = re.search(r"UNICODE = '([\d.]+)'", committed).group(1)
        if made_with != unicodedata.unidata_version:
            self.skipTest(f"this Python has Unicode {unicodedata.unidata_version}; the files were made with {made_with}")
        self.assertEqual(committed, make_emoji.render_all(self.items), "run `just emoji`")
        self.assertEqual((make_emoji.WEB / "emoji-check.js").read_text(encoding="utf-8"),
                         make_emoji.render_check(self.items), "run `just emoji`")

    def test_only_single_emoji_no_pieces(self):
        emoji = [e for e, _, _ in self.items]
        self.assertEqual(len(emoji), len(set(emoji)))
        for e in emoji:
            cps = [ord(c) for c in e]
            self.assertNotIn(0x200D, cps, e)
            self.assertFalse(any(0x1F3FB <= c <= 0x1F3FF or 0x1F1E6 <= c <= 0x1F1FF for c in cps), e)
            self.assertLessEqual(len(e), 3, e)

    def test_every_group_used_and_names_lowercase(self):
        groups = {g for _, _, g in self.items}
        self.assertEqual(groups, set(make_emoji.GROUPS))
        for _, name, _ in self.items:
            self.assertEqual(name, name.lower())

    def test_ranges_round_trip(self):
        self.assertEqual(make_emoji.ranges([1, 2, 3, 5, 7, 8]), "1-3,5,7-8")


if __name__ == "__main__":
    unittest.main()
