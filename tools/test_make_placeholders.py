#!/usr/bin/env python3
"""Tests for tools/make_placeholders.py: it knows every preset in
web/boards.json, and making some clips by name leaves the rest alone.

  python3 -m unittest discover -s tools -p 'test_*.py'
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_placeholders as mp  # noqa: E402
import make_samples  # noqa: E402

WEB = Path(__file__).resolve().parent.parent / "web"
# The old app's starter sounds: presets since 2026-10-11, kept as the old
# clips (byte for byte), so the generator does not make them.
OLD_STARTERS = {"airhorn", "laser", "boing", "rimshot", "drumroll", "tada", "slide-whistle", "sad-trombone"}


class Presets(unittest.TestCase):
    def test_every_preset_is_made_here_or_is_an_old_starter(self):
        kit = json.loads((WEB / "boards.json").read_text())["kit"]
        made = set(mp.KIT) | {n for n, _, _ in mp.KIT_CALLOUTS}
        recorded = {s[0] for s in make_samples.SAMPLES} | {h[0] for h in make_samples.HITS}
        for k in kit:
            self.assertTrue((WEB / k["file"]).exists(), k["file"])
            stem = Path(k["file"]).stem
            if "inst" in k:
                # An instrument's preset plays one of its recordings (ADR 0030).
                self.assertTrue(stem.startswith(k["inst"] + "-"), k["id"])
                self.assertTrue(stem in made or stem in recorded, k["file"])
            else:
                self.assertEqual(k["file"], "clips/kit/%s.wav" % k["id"])
                self.assertTrue(k["id"] in made or k["id"] in recorded or k["id"] in OLD_STARTERS, k["id"])
        self.assertFalse(made & OLD_STARTERS, "an old starter's clip is never regenerated")
        self.assertFalse(made & recorded, "a recording is never made here")

    def test_the_low_sounds_carry_on_a_phone(self):
        """A phone plays almost nothing under 180 Hz (Ben, 2026-10-17: the 808s
        were nearly silent on his phone): every bass, kick and boom keeps
        about a fifth of its energy above that, like the real upright bass."""
        import array, wave
        low = ["kick", "kick-dusty", "boom", "glide", "808-40", "taiko", "dhol", "log-drum", "cajon", "heartbeat",
               "explosion", "tom-low", "bass-c", "bass-d", "bass-e", "bass-f", "bass-g", "bass-a",
               "bass-cs", "bass-ds", "bass-fs", "bass-gs", "bass-as"]
        for name in low:
            with wave.open(str(WEB / "clips/kit" / (name + ".wav"))) as w:
                self.assertEqual(w.getframerate(), mp.RATE, name)
                samples = [v / 32768 for v in array.array("h", w.readframes(w.getnframes()))]
            self.assertGreaterEqual(mp.share_above(samples), 0.17, name)

    def test_naming_clips_makes_only_those(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_out = mp.KIT_OUT
            mp.KIT_OUT = Path(tmp)
            try:
                mp.main(["pop", "roar"])
            finally:
                mp.KIT_OUT = old_out
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), ["pop.wav", "roar.wav"])
            self.assertEqual((Path(tmp) / "pop.wav").read_bytes(), (WEB / "clips/kit/pop.wav").read_bytes(),
                             "the same recipe makes the same bytes")

    def test_sharps_and_flats_are_equal_tempered(self):
        """Each pitch is within 0.05 Hz of equal temperament (A4 = 440 Hz)."""
        semitone = {"C": 0, "C#": 1, "Eb": 3, "D": 2, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "Bb": 10, "B": 11}
        def hz(name):
            note, octave = name[:-1], int(name[-1])
            return 440 * 2 ** ((semitone[note] + 12 * (octave + 1) - 69) / 12)
        expected = {
            "note-cs": ["C#4"], "note-ds": ["Eb4"], "note-fs": ["F#4"], "note-gs": ["G#4"], "note-as": ["Bb4"],
            "chord-d": ["D4", "F#4", "A4"], "chord-a": ["A3", "C#4", "E4"], "chord-e": ["E4", "G#4", "B4"],
            "chord-bm": ["B3", "D4", "F#4"], "chord-gm": ["G3", "Bb3", "D4"], "chord-cm": ["C4", "Eb4", "G4"],
            "chord-bb": ["Bb3", "D4", "F4"], "chord-eb": ["Eb4", "G4", "Bb4"], "chord-fsm": ["F#3", "A3", "C#4"],
            "chord-csm": ["C#4", "E4", "G#4"],
            "bass-cs": ["C#2"], "bass-ds": ["Eb2"], "bass-fs": ["F#2"], "bass-gs": ["G#2"], "bass-as": ["Bb2"],
        }
        self.assertEqual(set(mp.SHARPS_AND_FLATS), set(expected))
        for name, (_, freqs) in mp.SHARPS_AND_FLATS.items():
            self.assertEqual(len(freqs), len(expected[name]), name)
            for got, note in zip(freqs, expected[name]):
                self.assertAlmostEqual(got, hz(note), delta=0.05, msg="%s %s" % (name, note))
        kit = {k["id"]: k for k in json.loads((WEB / "boards.json").read_text())["kit"]}
        for name in expected:
            self.assertTrue(kit[name].get("advanced"), name + " is Advanced only")

    def test_an_unknown_name_is_refused(self):
        with self.assertRaises(SystemExit):
            mp.main(["no-such-sound"])


if __name__ == "__main__":
    unittest.main()
