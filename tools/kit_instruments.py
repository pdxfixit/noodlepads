#!/usr/bin/env python3
"""Writes the instruments' presets into web/boards.json (ADR 0030).

`python3 tools/kit_instruments.py` rewrites every kit entry that has an
`inst`, from the table below, and leaves everything else in the file as it
is. Each instrument plays every preset of the groups it plays (web/
instruments.js INSTRUMENTS says which), as a preset of its own: `piano-e`
plays what `note-e` plays (`plays`), with the same label, picture and color,
from the nearest of the instrument's recordings, moved by `shift` semitones,
or for a chord, several notes of one recording at once (`chord`). The
entries go straight after their group's own presets, instrument by
instrument. Run it after adding an instrument or a preset to Notes, Chords
or Bass; tools/test_kit_instruments.py fails until boards.json matches.

Stdlib only.
"""
import json
import re
import sys
from pathlib import Path

BOARDS = Path(__file__).resolve().parent.parent / "web" / "boards.json"

# Each instrument's recordings, by MIDI note (`piano-61.wav` is C♯4), and the
# groups it plays. The files are made by make_placeholders.py (struck and
# plucked ones) and make_samples.py (recordings).
INSTRUMENTS = {
    "piano": ([61, 69], ["notes", "chords"]),
    "organ": ([63], ["notes", "chords"]),
    "chip": ([66], ["notes"]),
    "marimba": ([66], ["notes"]),
    "steel": ([66], ["notes"]),
    "kalimba": ([66], ["notes"]),
    "guitar": ([57, 66], ["notes", "chords"]),
    "strings": ([62, 69], ["notes", "chords"]),
    "brass": ([67], ["notes"]),
    "flute": ([64], ["notes"]),
    "upright": ([40], ["bass"]),
    "808": ([40], ["bass"]),
}

NOTE = {"c": 0, "cs": 1, "d": 2, "ds": 3, "e": 4, "f": 5, "fs": 6, "g": 7, "gs": 8, "a": 9, "as": 10, "b": 11}

# The notes each of the groups' own presets plays, as MIDI numbers, the same
# as make_placeholders.py's recipes: Notes C4 to C5, Bass C2 up, and the
# chords as voiced there.
CHORDS = {
    "chord-c": [60, 64, 67], "chord-am": [57, 60, 64], "chord-f": [53, 57, 60], "chord-g": [55, 59, 62],
    "chord-dm": [62, 65, 69], "chord-em": [64, 67, 71], "chord-g7": [55, 59, 62, 65],
    "chord-csm": [61, 64, 68], "chord-cm": [60, 63, 67], "chord-d": [62, 66, 69], "chord-eb": [63, 67, 70],
    "chord-e": [64, 68, 71], "chord-fsm": [54, 57, 61], "chord-gm": [55, 58, 62], "chord-a": [57, 61, 64],
    "chord-bb": [58, 62, 65], "chord-bm": [59, 62, 66],
}


def notes_of(preset):
    """The MIDI notes a group's own preset plays."""
    pid, group = preset["id"], preset["group"]
    if group == "chords":
        return CHORDS[pid]
    m = re.fullmatch(r"(note|bass)-([a-g]s?)(-high)?", pid)
    if not m:
        raise ValueError(f"don't know which note {pid} is")
    base = 60 if m.group(1) == "note" else 36
    return [base + NOTE[m.group(2)] + (12 if m.group(3) else 0)]


def nearest(zones, notes):
    """The recording that moves least to play all of `notes` (on a tie, the
    higher one: moving down sounds less like a chipmunk)."""
    return min(sorted(zones, reverse=True), key=lambda z: max(abs(n - z) for n in notes))


def preset_id(inst, preset):
    """`piano-e` for note-e, `piano-am-chord` for chord-am, `808-c` for
    bass-c. No id may end in another's: lookups match `-<kit id>` at the
    end of a person's copy (tests/model.test.mjs)."""
    pid = preset["id"]
    if preset["group"] == "chords":
        return f"{inst}-{pid[len('chord-'):]}-chord"
    return f"{inst}-{pid.split('-', 1)[1]}"


def entries_for(inst, own):
    zones, groups = INSTRUMENTS[inst]
    out = []
    for group in groups:
        for p in (k for k in own if k["group"] == group):
            notes = notes_of(p)
            zone = nearest(zones, notes)
            e = {"id": preset_id(inst, p), "label": p["label"], "emoji": p["emoji"], "color": p["color"],
                 "file": f"clips/kit/{inst}-{zone}.wav", "group": group, "inst": inst, "plays": p["id"]}
            moves = [n - zone for n in notes]
            if len(moves) > 1:
                e["chord"] = moves
            elif moves[0]:
                e["shift"] = moves[0]
            if p.get("advanced"):
                e["advanced"] = True
            out.append(e)
    return out


def rebuilt(text):
    """boards.json's text with the instruments' presets written afresh."""
    doc = json.loads(text)
    own = [k for k in doc["kit"] if "inst" not in k]
    kit = []
    for i, k in enumerate(own):
        kit.append(k)
        last_of_group = i + 1 == len(own) or own[i + 1]["group"] != k["group"]
        if last_of_group:
            for inst in INSTRUMENTS:
                kit.extend(e for e in entries_for(inst, own) if e["group"] == k["group"])
    doc["kit"] = kit
    lines = text.split("\n")
    start = next(i for i, line in enumerate(lines) if line.strip() == '"kit": [')
    end = next(i for i in range(start, len(lines)) if lines[i].strip() in ("],", "]"))
    body = ",\n".join("    " + json.dumps(k, ensure_ascii=False, separators=(", ", ": ")).replace("{", "{ ", 1)[:-1] + " }" for k in kit)
    return "\n".join(lines[:start + 1] + [body] + lines[end:])


def main():
    text = BOARDS.read_text(encoding="utf-8")
    new = rebuilt(text)
    if new != text:
        BOARDS.write_text(new, encoding="utf-8")
        print("🎹 web/boards.json: instruments rewritten")
    else:
        print("🎹 web/boards.json already matches")


if __name__ == "__main__":
    sys.exit(main())
