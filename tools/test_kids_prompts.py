"""tools/kids_prompts.py: the check for 🧸 Kids' spoken prompt recordings
(Ben, 2026-10-28: build the prompts now, a family member records them later).
Whoever drops files into web/clips/kids-prompts/ gets a clear pass or fail,
and --fix wires the good ones in.

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import contextlib
import io
import math
import shutil
import sys
import tempfile
import unittest
import wave
from array import array
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kids_prompts as kp  # noqa: E402
import preset_loudness as pl  # noqa: E402


def speech(seconds=1.0, lead=0.05, amp=0.5, rate=kp.RATE):
    """A tone that starts `lead` s in: stands in for a spoken prompt."""
    n = int(seconds * rate)
    return [0.0] * int(lead * rate) + [amp * math.sin(2 * math.pi * 300 * i / rate) for i in range(n - int(lead * rate))]


def write(path, samples, rate=kp.RATE, channels=1):
    pcm = array("h", [int(max(-1, min(1, v)) * 32767) for v in samples])
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


class Judge(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def problems(self, samples, **kw):
        path = self.dir / "pads.wav"
        write(path, samples, **kw)
        return kp.judge(path, "pads")[0]

    def test_a_short_clear_mono_recording_passes(self):
        self.assertEqual(self.problems(speech()), [])

    def test_too_long_is_refused_with_what_to_do(self):
        out = self.problems(speech(3.0))
        self.assertEqual(len(out), 1)
        self.assertIn("over 2.5 s", out[0])

    def test_too_short_silent_and_slow_to_start_are_refused(self):
        self.assertIn("under 0.3 s", self.problems(speech(0.1))[0])
        self.assertIn("silent", self.problems([0.0] * kp.RATE)[0])
        self.assertIn("before the first word", self.problems(speech(1.5, lead=0.6))[0])

    def test_a_wrong_format_names_the_ffmpeg_fix(self):
        out = self.problems(speech(rate=44100), rate=44100)
        self.assertIn("22050", out[0])
        self.assertIn("ffmpeg", out[0])
        stereo = self.dir / "pads.wav"
        write(stereo, speech() * 2, channels=2)
        self.assertIn("2 channel", kp.judge(stereo, "pads")[0][0])

    def test_a_file_that_is_not_a_wav_is_refused(self):
        bad = self.dir / "pads.wav"
        bad.write_bytes(b"ID3 not a wave")
        self.assertIn("not a PCM WAV", kp.judge(bad, "pads")[0][0])


class Listed(unittest.TestCase):
    def test_the_prompts_are_read_from_the_web_file(self):
        found = kp.prompts()
        self.assertEqual([p["id"] for p in found], ["pads", "record", "beats", "keys"])
        self.assertEqual(found[0]["words"], "Tap a picture!")
        self.assertTrue(all(len(p["words"]) < 40 for p in found), "short, kid words")


class Wiring(unittest.TestCase):
    """main() against a scratch copy of the three places it reads and writes."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        (self.dir / "clips").mkdir()
        self.folder = self.dir / "clips" / "kids-prompts"
        self.js = self.dir / "kids-prompts.js"
        self.sw = self.dir / "sw.js"
        shutil.copy(kp.PROMPTS_JS, self.js)
        shutil.copy(kp.SW_JS, self.sw)
        for name, value in (("FOLDER", self.folder), ("PROMPTS_JS", self.js), ("SW_JS", self.sw)):
            p = mock.patch.object(kp, name, value)
            p.start()
            self.addCleanup(p.stop)
        # The middle of the presets takes seconds to work out; a fixed one is enough here.
        p = mock.patch.object(pl, "raw_and_middle", return_value=({}, -30.0))
        p.start()
        self.addCleanup(p.stop)

    def run_main(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = kp.main(list(args))
        return code, out.getvalue()

    def test_no_recordings_is_a_pass_that_changes_nothing(self):
        before = (self.js.read_text(), self.sw.read_text())
        code, out = self.run_main()
        self.assertEqual(code, 0)
        self.assertEqual(out.count("⏳"), 4)
        code, _ = self.run_main("--fix")
        self.assertEqual(code, 0)
        self.assertEqual((self.js.read_text(), self.sw.read_text()), before)

    def test_a_good_file_fails_until_fixed_then_is_wired_in_both_places(self):
        self.folder.mkdir()
        write(self.folder / "pads.wav", speech())
        code, out = self.run_main()
        self.assertEqual(code, 1, "the check fails while RECORDED is stale")
        self.assertIn("✅ pads.wav", out)
        self.assertIn("--fix", out)
        code, _ = self.run_main("--fix")
        self.assertEqual(code, 0)
        self.assertIn("export const RECORDED = ['pads'];", self.js.read_text())
        self.assertIn("const KIDS_PROMPTS = ['pads'];", self.sw.read_text())
        code, _ = self.run_main()
        self.assertEqual(code, 0, "after --fix the check passes")

    def test_a_loud_recording_gets_a_level_that_brings_it_to_the_middle(self):
        self.folder.mkdir()
        write(self.folder / "pads.wav", speech(amp=0.9))
        self.run_main("--fix")
        level = next(p["level"] for p in kp.prompts(self.js.read_text()) if p["id"] == "pads")
        self.assertLessEqual(level, 0)
        over = pl.heard(speech(amp=0.9), kp.RATE) - (-30.0)
        self.assertEqual(level, pl.level_for(over))
        self.assertLess(level, 0, "this tone is far over a middle of -30 dB")

    def test_a_bad_file_or_a_stray_one_fails_and_blocks_fix(self):
        self.folder.mkdir()
        write(self.folder / "pads.wav", speech())
        write(self.folder / "keys.wav", speech(4.0))
        (self.folder / "hello.wav").write_bytes(b"")
        before = (self.js.read_text(), self.sw.read_text())
        code, out = self.run_main("--fix")
        self.assertEqual(code, 1)
        self.assertIn("❌ keys.wav", out)
        self.assertIn("❌ hello.wav", out)
        self.assertEqual((self.js.read_text(), self.sw.read_text()), before, "nothing is wired while a file fails")


if __name__ == "__main__":
    unittest.main()
