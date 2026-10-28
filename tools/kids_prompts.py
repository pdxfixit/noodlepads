#!/usr/bin/env python3
"""Checks the recordings of 🧸 Kids' spoken prompts, and wires in the ones that
pass (`just kids-prompts`, `just kids-prompts --fix`).

The prompts are listed in web/kids-prompts.js (id, screen, exact words). A
family member records each as web/clips/kids-prompts/<id>.wav; the app plays
a prompt only when its id is in RECORDED there. This tool:

  - lists each prompt as ✅ (a good file), ⏳ (no file yet) or ❌ (a file that
    fails, with the reason and the fix);
  - fails on a file with no prompt of that name, or one that is not a WAV;
  - with --fix, writes what the good files imply: RECORDED and each prompt's
    `level` in web/kids-prompts.js, and KIDS_PROMPTS in web/sw.js (so the
    files are kept for offline). Without --fix it fails when those are stale.

A good file is a 16-bit PCM mono 22050 Hz WAV (the kit's format), 0.3 to
2.5 s long, not silent, and speaking within 0.25 s of its start (the app
plays a prompt as recorded and does not trim it). Loudness is measured as
`just preset-loudness` does: a prompt over the middle of the presets gets a
`level` that brings it down to it; a quieter one stays as it is.

To make a WAV from a phone's recording (m4a, mp3, webm...):
  ffmpeg -i in.m4a -ac 1 -ar 22050 -sample_fmt s16 web/clips/kids-prompts/pads.wav

Stdlib only. `--list` prints the prompts as JSON.
"""
import array
import json
import re
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
FOLDER = WEB / "clips" / "kids-prompts"
PROMPTS_JS = WEB / "kids-prompts.js"
SW_JS = WEB / "sw.js"

RATE = 22050
MIN_SECONDS = 0.3
MAX_SECONDS = 2.5
MAX_LEAD = 0.25     # seconds of quiet before the first word
MIN_PEAK = 0.02     # under this a file is silent
START_AT = 0.05     # of the peak: where speech is taken to begin

LINE = re.compile(r"^  \{ id: '([a-z]+)', tab: '([a-z]+)', words: '([^']+)', level: (-?[0-9.]+) \},$", re.M)
RECORDED = re.compile(r"^export const RECORDED = \[(.*)\];", re.M)
SW_LIST = re.compile(r"^const KIDS_PROMPTS = \[(.*)\];", re.M)
CONVERT = "ffmpeg -i in.m4a -ac 1 -ar 22050 -sample_fmt s16 web/clips/kids-prompts/{id}.wav"


def prompts(text=None):
    """[{id, tab, words, level}] from web/kids-prompts.js."""
    text = text if text is not None else PROMPTS_JS.read_text(encoding="utf-8")
    return [{"id": i, "tab": t, "words": w, "level": float(lv) if "." in lv else int(lv)} for i, t, w, lv in LINE.findall(text)]


def judge(path, prompt_id):
    """(problems, samples, rate) for one file: problems is [] when it is good."""
    try:
        with wave.open(str(path)) as w:
            channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
            data = w.readframes(frames)
    except (wave.Error, EOFError) as err:
        return [f"is not a PCM WAV file ({err}); make one: {CONVERT.format(id=prompt_id)}"], [], 0
    if (channels, width, rate) != (1, 2, RATE):
        return [f"is {channels} channel(s), {8 * width}-bit, {rate} Hz; it must be mono, 16-bit, {RATE} Hz: {CONVERT.format(id=prompt_id)}"], [], rate
    pcm = array.array("h", data)
    if sys.byteorder == "big":
        pcm.byteswap()
    samples = [v / 32768 for v in pcm]
    seconds = len(samples) / rate
    problems = []
    if seconds < MIN_SECONDS:
        problems.append(f"is {seconds:.2f} s, under {MIN_SECONDS} s: record the whole prompt")
    if seconds > MAX_SECONDS:
        problems.append(f"is {seconds:.2f} s, over {MAX_SECONDS} s: say it quicker, or cut the quiet at the end")
    peak = max((abs(v) for v in samples), default=0.0)
    if peak < MIN_PEAK:
        problems.append("is silent: record it again, closer to the microphone")
    else:
        lead = next(i for i, v in enumerate(samples) if abs(v) >= START_AT * peak) / rate
        if lead > MAX_LEAD:
            problems.append(f"is quiet for {lead:.2f} s before the first word (over {MAX_LEAD} s): cut the start")
    return problems, samples, rate


def level_of(samples, rate, middle):
    """The `level` (dB, 0 or below) that plays this prompt no louder than the
    middle of the presets."""
    import preset_loudness as pl
    return max(-24, pl.level_for(pl.heard(samples, rate) - middle))


def wired(text, ids, levels):
    """kids-prompts.js's text with RECORDED and every prompt's `level` set."""
    def level(m):
        return m.group(0).rsplit("level: ", 1)[0] + f"level: {levels.get(m.group(1), 0):g} }},"
    text = LINE.sub(level, text)
    return RECORDED.sub(lambda _: "export const RECORDED = [" + ", ".join(f"'{i}'" for i in ids) + "];", text, count=1)


def wired_sw(text, ids):
    return SW_LIST.sub(lambda _: "const KIDS_PROMPTS = [" + ", ".join(f"'{i}'" for i in ids) + "];", text, count=1)


def main(argv):
    if "--list" in argv:
        print(json.dumps(prompts()))
        return 0
    text = PROMPTS_JS.read_text(encoding="utf-8")
    listed = prompts(text)
    known = {p["id"] for p in listed}
    bad = False
    good, levels = [], {}
    stray = sorted(f.name for f in FOLDER.glob("*") if f.is_file() and not f.name.startswith(".") and not (f.suffix == ".wav" and f.stem in known)) if FOLDER.is_dir() else []
    for name in stray:
        print(f"❌ {name}: no prompt has this name; the files are {', '.join(p['id'] + '.wav' for p in listed)}")
        bad = True
    middle = None
    for p in listed:
        path = FOLDER / f"{p['id']}.wav"
        if not path.is_file():
            print(f"⏳ {p['id']}: no recording yet (\"{p['words']}\")")
            continue
        problems, samples, rate = judge(path, p["id"])
        if problems:
            bad = True
            for msg in problems:
                print(f"❌ {p['id']}.wav {msg}")
            continue
        if middle is None:
            import preset_loudness as pl
            middle = pl.raw_and_middle()[1]
        levels[p["id"]] = level_of(samples, rate, middle)
        good.append(p["id"])
        print(f"✅ {p['id']}.wav  {len(samples) / rate:.2f} s  level {levels[p['id']]:g} dB  (\"{p['words']}\")")
    ids = [p["id"] for p in listed if p["id"] in good]
    new_js = wired(text, ids, levels)
    sw = SW_JS.read_text(encoding="utf-8")
    new_sw = wired_sw(sw, ids)
    if "--fix" in argv:
        if bad:
            print("⚠️  fix the ❌ files first; the good ones are not wired in until none fails")
            return 1
        if new_js != text:
            PROMPTS_JS.write_text(new_js, encoding="utf-8")
        if new_sw != sw:
            SW_JS.write_text(new_sw, encoding="utf-8")
        print(f"🗣️  {len(ids)} of {len(listed)} prompts are wired in")
        return 0
    if new_js != text or new_sw != sw:
        print("⚠️  web/kids-prompts.js (RECORDED, level) or web/sw.js (KIDS_PROMPTS) is not what the files imply: run `just kids-prompts --fix`")
        return 1
    print(f"🗣️  {len(ids)} of {len(listed)} prompts recorded" + ("" if bad else ", all good"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
