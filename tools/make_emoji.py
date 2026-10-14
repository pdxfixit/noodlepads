#!/usr/bin/env python3
"""Make the full emoji list behind every picture chooser's "…" button.

`python3 tools/make_emoji.py` (or `just emoji`) writes two files:

  web/emoji-all.js    every emoji with its English name, in groups, for the
                      chooser's full list and its search. The app loads it
                      only when "…" is tapped.
  web/emoji-check.js  isListedEmoji(s): is `s` one of those emoji? Small, so
                      backups and the Worker can check an avatar without the
                      names.

Stdlib only, offline. The names come from Python's own `unicodedata`, so
the output follows the Unicode version of the Python that runs it (16.0 on
Ben's Mac, 2026-10). Rerunning it with the same Python changes nothing.

What is in the list:
  - single characters that show as emoji on their own (Emoji_Presentation);
  - the older characters that need U+FE0F to show as emoji (❤️ ☀️ ✈️), from
    TEXT_STYLE below, each with its U+FE0F;
  - the twelve keycaps (#️⃣ 0️⃣ … 9️⃣ *️⃣).
Left out: skin-tone and hair pieces, lone regional-indicator letters, and
every sequence joined with U+200D (families, 🏳️‍🌈) or made of two letters
(country flags). `unicodedata` has no list of those or names for them, and
guessing would put boxes in the chooser.

`unicodedata` has no Emoji_Presentation property either. East_Asian_Width
"W" on a symbol stands in for it: Unicode gives every emoji-presentation
character that width. A few wide symbols are not emoji (trigrams, squared
CJK); EXCLUDE drops them. Checked against Perl's \\p{Emoji_Presentation}
(Unicode 13) on 2026-10-11: the same set, plus only real emoji added since.
"""
import gzip
import sys
import unicodedata
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"

# Emoji that need U+FE0F to show as emoji (Emoji=Yes, Emoji_Presentation=No,
# not a component), from Perl's Unicode tables (13.0) on 2026-10-11. Unicode
# has added none of these since 2020.
TEXT_STYLE = """
A9 AE 203C 2049 2122 2139 2194-2199 21A9 21AA 2328 23CF 23ED-23EF 23F1 23F2
23F8-23FA 24C2 25AA 25AB 25B6 25C0 25FB 25FC 2600-2604 260E 2611 2618 261D
2620 2622 2623 2626 262A 262E 262F 2638-263A 2640 2642 265F 2660 2663 2665
2666 2668 267B 267E 2692 2694-2697 2699 269B 269C 26A0 26A7 26B0 26B1 26C8
26CF 26D1 26D3 26E9 26F0 26F1 26F4 26F7-26F9 2702 2708 2709 270C 270D 270F
2712 2714 2716 271D 2721 2733 2734 2744 2747 2763 2764 27A1 2934 2935
2B05-2B07 3030 303D 3297 3299 1F170 1F171 1F17E 1F17F 1F202 1F237 1F321
1F324-1F32C 1F336 1F37D 1F396 1F397 1F399-1F39B 1F39E 1F39F 1F3CB-1F3CE
1F3D4-1F3DF 1F3F3 1F3F5 1F3F7 1F43F 1F441 1F4FD 1F549 1F54A 1F56F 1F570
1F573-1F579 1F587 1F58A-1F58D 1F590 1F5A5 1F5A8 1F5B1 1F5B2 1F5BC
1F5C2-1F5C4 1F5D1-1F5D3 1F5DC-1F5DE 1F5E1 1F5E3 1F5E8 1F5EF 1F5F3 1F5FA
1F6CB 1F6CD-1F6CF 1F6E0-1F6E5 1F6E9 1F6F0 1F6F3
"""

# Wide symbols that are not emoji, and pieces that only join others.
EXCLUDE = """
2630-2637 268A-268F 1F1E6-1F1FF 1F3FB-1F3FF 1F9B0-1F9B3
1F200 1F202-1F219 1F21B-1F22E 1F230 1F231 1F237 1F23B-1F24F 1F252-1F2FF
"""
# Emoji-presentation characters that are not "So": two squares that are "Sm".
EXTRA = "25FD 25FE"


def parse(spec):
    out = set()
    for part in spec.split():
        a, _, b = part.partition("-")
        out.update(range(int(a, 16), int(b or a, 16) + 1))
    return out


TEXT = parse(TEXT_STYLE)
SKIP = parse(EXCLUDE)


def emoji_presentation(cp):
    if cp in SKIP:
        return False
    if cp in parse(EXTRA):
        return True
    if not (0x2190 <= cp <= 0x2BFF or 0x1F000 <= cp <= 0x1FAFF):
        return False
    ch = chr(cp)
    return unicodedata.east_asian_width(ch) == "W" and unicodedata.category(ch) in ("So", "Sk")


# Groups, in the order the chooser shows them.
GROUPS = ["Smileys & people", "Animals & nature", "Food & drink", "Activities",
          "Travel & places", "Objects", "Symbols", "Flags"]
S, A, F, ACT, T, O, SY, FL = GROUPS

# Where each code point goes: the first range that holds it wins, so single
# code points come before the ranges around them. Unicode's blocks mix
# things, so this follows what each run of characters is. Anything not
# listed is a Symbol.
PLACES = [
    # One-offs among the older symbols.
    ("231A 231B 2328 23F0-23F3 260E 2692-2697 2699 26B0 26B1 26CF 26D1 26D3 2702 2709 270F 2712", O),
    ("2600-2604 2614 2618 26A1 26C4 26C5 26C8 2744 2B50", A),
    ("2615", F),
    ("261D 26F9 270A-270D", S),
    ("2620 2639 263A 2763 2764", S),
    ("265F 2660-2667 26BD 26BE 26F3 26F7 26F8", ACT),
    ("2668 26E9 26EA 26F0-26F5 26FA 26FD 2708", T),
    ("1F004 1F0CF", ACT),
    # Sky, plants, food.
    ("1F30D-1F310 1F301 1F303-1F307 1F309", T),
    ("1F300-1F320 1F321-1F32C 1F330-1F335 1F337-1F344", A),
    ("1F32D-1F32F 1F336 1F345-1F37F", F),
    # Celebrations, games, sport, music, buildings.
    ("1F38C 1F3C1 1F3F3 1F3F4", FL),
    ("1F3A0-1F3A2 1F3CD 1F3CE 1F3D4-1F3F0", T),
    ("1F3B5-1F3BC", O),
    ("1F3F5", A),
    ("1F3F7 1F3FA", O),
    ("1F380-1F3FF", ACT),
    # Animals, then people and the things they wear.
    ("1F400-1F43F", A),
    ("1F451-1F462 1F484-1F48E 1F4A1 1F4B0-1F4FF", O),
    ("1F479-1F480 1F48B 1F493-1F49F 1F4A2-1F4AD", S),
    ("1F490", A),
    ("1F492", T),
    ("1F440-1F4AF", S),
    # Signs and arrows, clocks, more objects.
    ("1F54A", A),
    ("1F500-1F54F", SY),
    ("1F550-1F567", O),
    ("1F574 1F575 1F57A 1F590 1F595 1F596 1F5E3", S),
    ("1F5E8 1F5EF", S),
    ("1F577 1F578", A),
    ("1F5FA-1F5FF", T),
    ("1F56F-1F5F9", O),
    # Faces and gestures.
    ("1F600-1F64F", S),
    # Transport and signs.
    ("1F6A9", FL),
    ("1F6AA-1F6AD 1F6BD-1F6C0 1F6CB-1F6D2 1F6DC 1F6E0-1F6E2", O),
    ("1F6B4-1F6B6", S),
    ("1F6AE-1F6C5", SY),
    ("1F680-1F6FF", T),
    ("1F7E0-1F7FF", SY),
    # The newer blocks: faces, hands, sport, food, animals, things.
    ("1F90D 1F90E 1F9E1 1F9CC", S),
    ("1F90C-1F939 1F9B4-1F9BB 1F9BE 1F9BF 1F9CD-1F9E0", S),
    ("1F940", A),
    ("1F941", O),
    ("1F942-1F944 1F950-1F96F 1F9C0-1F9CB", F),
    ("1F93A-1F94F 1F9E9", ACT),
    ("1F970-1F97A", S),
    ("1F980-1F9AE", A),
    ("1F9BC 1F9BD", T),
    ("1F97B-1F97F 1F9AF 1F9E2-1F9FF", O),
    ("1FA75-1FA77", S),
    ("1FA80-1FA86", ACT),
    ("1FA90", A),
    ("1FA70-1FAAF", O),
    ("1FAB0-1FABF 1FACE 1FACF", A),
    ("1FAC0-1FAC6 1FAE0-1FAFF", S),
    ("1FAD0-1FADC", F),
]
PLACES = [(parse(spec), group) for spec, group in PLACES]


# Faces, in the order they lead the Smileys group.
FACES = [parse(spec) for spec in ("1F600-1F637 1F641-1F644", "1F910-1F917 1F920-1F92F 1F970-1F97A 1FAE0-1FAE9",
                                  "263A 2639", "1F638-1F640", "1F479-1F480 1F4A9 1F916")]


def face_rank(cp):
    return next((i for i, cps in enumerate(FACES) if cp in cps), len(FACES))


def group_of(cp):
    for cps, group in PLACES:
        if cp in cps:
            return group
    return SY


# Unicode's names are old and formal ("pile of poo", "heavy black heart").
# The words a kid would type for the most-used ones go after the name, so
# search finds them too.
ALIASES = {
    0x1F4A9: "poop", 0x2764: "red heart, love", 0x1F602: "laughing, lol", 0x1F923: "laughing, lol",
    0x1F600: "smile, happy", 0x1F603: "smile, happy", 0x1F604: "smile, happy", 0x263A: "smile, happy",
    0x1F642: "smile", 0x1F60A: "smile, blush", 0x1F60D: "heart eyes, love", 0x1F618: "kiss",
    0x1F622: "sad, cry", 0x1F62D: "sad, cry", 0x2639: "sad", 0x1F641: "sad", 0x1F620: "angry, mad",
    0x1F621: "angry, mad", 0x1F44D: "like, yes, ok", 0x1F44E: "dislike, no", 0x1F44B: "hi, hello, bye",
    0x1F44F: "clap", 0x1F64F: "please, thank you", 0x1F4AF: "100, hundred", 0x1F525: "lit, hot",
    0x1F389: "party", 0x1F973: "party", 0x1F60E: "cool", 0x1F914: "hmm", 0x1F92A: "silly, crazy",
    0x1F92E: "sick, puke", 0x1F480: "dead", 0x1F47D: "ufo", 0x1F916: "robot", 0x1F4A8: "fart, wind",
    0x26BD: "football", 0x1F3C8: "football", 0x1F697: "car", 0x1F3B5: "music", 0x1F3B6: "music",
}


def name_of(cp):
    name = unicodedata.name(chr(cp)).lower()
    return f"{name}, {ALIASES[cp]}" if cp in ALIASES else name


def collect():
    """[(emoji, name, group)] in code point order, keycaps last."""
    out = []
    for cp in range(0x80, 0x20000):
        if not unicodedata.name(chr(cp), ""):
            continue
        if cp in TEXT and cp not in SKIP:
            out.append((chr(cp) + "\ufe0f", name_of(cp), group_of(cp)))
        elif emoji_presentation(cp):
            out.append((chr(cp), name_of(cp), group_of(cp)))
    # Faces lead their group (😀 before ☝️), as on a phone's keyboard; the
    # rest stay in code point order.
    out.sort(key=lambda it: face_rank(ord(it[0][0])))
    for key, word in [*((str(n), str(n)) for n in range(10)), ("#", "number sign"), ("*", "asterisk")]:
        out.append((key + "\ufe0f\u20e3", f"keycap {word}", SY))
    return out


def ranges(cps):
    """'1F600-1F64F,1F680,…' for sorted code points."""
    cps = sorted(cps)
    out, start = [], None
    for i, cp in enumerate(cps):
        if start is None:
            start = cp
        if i + 1 == len(cps) or cps[i + 1] != cp + 1:
            out.append(f"{start:X}" if start == cp else f"{start:X}-{cp:X}")
            start = None
    return ",".join(out)


def js_string(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def render_all(items):
    version = unicodedata.unidata_version
    lines = [
        f"// Generated by tools/make_emoji.py (`just emoji`) from Unicode {version}. Do not edit.",
        "// Every emoji the picture choosers' … can show: each group is a name and",
        "// one string of 'emoji name' lines. Loaded only when … is tapped.",
        f"export const UNICODE = '{version}';",
        "export const GROUPS = [",
    ]
    for group in GROUPS:
        body = "\n".join(f"{e} {n}" for e, n, g in items if g == group)
        if body:
            lines.append(f"  [{js_string(group)}, {js_string(body)}],")
    lines.append("];")
    return "\n".join(lines) + "\n"


def render_check(items):
    version = unicodedata.unidata_version
    wide = [ord(e) for e, _, _ in items if len(e) == 1]
    text = [ord(e[0]) for e, _, _ in items if len(e) == 2]
    return f"""// Generated by tools/make_emoji.py (`just emoji`) from Unicode {version}. Do not edit.
// Is a string one of the emoji in web/emoji-all.js? The same list as code
// point ranges, small enough for backups and the Worker to check an avatar
// without loading every name.

const parse = (s) => s.split(',').map((r) => r.split('-').map((h) => parseInt(h, 16)));
// Emoji that are emoji on their own, and ones written with U+FE0F after them.
const WIDE = parse('{ranges(wide)}');
const TEXT = parse('{ranges(text)}');
const within = (list, cp) => list.some(([a, b = a]) => cp >= a && cp <= b);

export function isListedEmoji(s) {{
  if (typeof s !== 'string' || s.length > 4) return false;
  if (/^[0-9#*]\\uFE0F\\u20E3$/.test(s)) return true;
  const cps = [...s].map((c) => c.codePointAt(0));
  if (cps.length === 1) return within(WIDE, cps[0]);
  return cps.length === 2 && cps[1] === 0xFE0F && within(TEXT, cps[0]);
}}
"""


def main(argv):
    items = collect()
    outputs = {WEB / "emoji-all.js": render_all(items), WEB / "emoji-check.js": render_check(items)}
    for path, text in outputs.items():
        path.write_text(text, encoding="utf-8")
        raw = text.encode("utf-8")
        print(f"{path.name}: {len(raw):,} bytes, {len(gzip.compress(raw, 9)):,} gzipped")
    counts = {g: sum(1 for _, _, x in items if x == g) for g in GROUPS}
    print(f"{len(items)} emoji (Unicode {unicodedata.unidata_version}): "
          + ", ".join(f"{g} {n}" for g, n in counts.items() if n))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
