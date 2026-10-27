// 🧸 Kids (ADR 0019): the pure parts, kept apart from the page so tests can
// run them in Node. The grown-up sum, how the picture pads fill a page and
// change size with a pinch, which page a swipe lands on, the kid's one beat
// (four drums, eight squares) and its three tempos, and the three voices.
// kids.js draws all of it.

import { cleanRow, cleanPattern, STEPS, multiplyRows } from './sequencer.js';
import { addNote } from './notes.js';
import { chainFields, voiceStep } from './voices.js';
import { SCRATCH_NAME } from './scratch.js';
import { versionFor } from './instruments.js';

// ── The grown-up sum ──

// A number from 12 to 39 and one from 6 to 9: a sum a grown-up does at a
// glance (27 + 8), and every answer has two digits, from 18 to 48, so a
// five-year-old cannot guess it by tapping one key, and its first digit
// (1 to 4) gives nothing away.
export function makeSum(random = Math.random) {
  const a = 12 + Math.floor(random() * 28);
  const b = 6 + Math.floor(random() * 4);
  return { a, b, answer: a + b };
}

// After SUM_WAIT.after wrong answers in a row, each next try waits
// SUM_WAIT.ms first, until a right answer: tapping at random takes a long
// time. Tests shorten it.
export const SUM_WAIT = { after: 3, ms: 30000 };
export const sumWait = (wrongs) => (wrongs >= SUM_WAIT.after ? SUM_WAIT.ms : 0);

// One digit tapped. `done` once as many digits as the answer has are in;
// `right` only if they are the answer.
export function typeDigit(typed, digit, answer) {
  const want = String(answer);
  const next = `${typed}${digit}`.slice(0, want.length);
  const done = next.length >= want.length;
  return { typed: next, done, right: done && next === want };
}

// ── Picture pads ──

// Pad size: the person's own `padSize` (settings.js), the same one Pads'
// slider keeps (Ben, 2026-10-16): 'auto', or 0 to 1 between this screen's
// smallest and biggest pads. Kids has its own ends: the smallest is four
// across a phone (four per 560 px on a wider screen), the biggest one pad
// filling the line (or the box's height, whichever is less). Between them
// every step changes the size, on a ratio scale as on Pads (pad-size.js).
// Pads are square, at an exact px size; as many as fit go on a line.
export const KIDS_GAP = 12;
const per560 = (n, width) => n * Math.max(1, Math.round((width || 0) / 560));
const across = (n, width, gap) => (width - gap * (n + 1)) / n;

export function kidsRange(width, height, gap = KIDS_GAP) {
  const min = Math.max(40, across(per560(4, width), width, gap));
  const max = Math.max(min, Math.min(width - 2 * gap, height - 2 * gap));
  return { min, max };
}

// 'auto': three across a phone, three per 560 px wider (the size Kids opened at before).
export function kidsAutoPx(width, height, gap = KIDS_GAP) {
  const { min, max } = kidsRange(width, height, gap);
  return Math.min(max, Math.max(min, across(per560(3, width), width, gap)));
}

// The pad's px size for a kept size on a box `width` × `height`.
export function kidsPadPx(width, height, size, gap = KIDS_GAP) {
  if (size === 'auto' || typeof size !== 'number' || !(size >= 0 && size <= 1)) return Math.floor(kidsAutoPx(width, height, gap));
  const { min, max } = kidsRange(width, height, gap);
  const lo = min + gap;
  const hi = max + gap;
  return Math.floor(lo * (hi / lo) ** size - gap);
}

// Where a pad `px` wide sits between the ends, 0 to 1.
export function kidsShare(width, height, px, gap = KIDS_GAP) {
  const { min, max } = kidsRange(width, height, gap);
  const lo = min + gap;
  const hi = max + gap;
  if (hi <= lo) return 0;
  return Math.min(1, Math.max(0, Math.log((px + gap) / lo) / Math.log(hi / lo)));
}

// The kept size as a share, 0 to 1 ('auto' is where the screen's own size sits).
export const shareOf = (width, height, size, gap = KIDS_GAP) => (typeof size === 'number' && size >= 0 && size <= 1 ? size : kidsShare(width, height, kidsAutoPx(width, height, gap), gap));

// The slider's position, 0 to 100.
export const kidsSliderAt = (width, height, size, gap = KIDS_GAP) => Math.round(100 * shareOf(width, height, size, gap));

// How a page of pads `size` px square fits a box: as many columns and rows
// as fit (at least one each), with `gap` around and between.
export function pageShape(width, height, size, gap = KIDS_GAP) {
  const cols = Math.max(1, Math.floor((width - gap) / (size + gap) + 1e-6));
  const rows = Math.max(1, Math.floor((height - gap) / (size + gap) + 1e-6));
  return { cols, rows, size };
}

// A list cut into pages of `per`; always at least one page.
export function pagesOf(list, per) {
  const n = Math.max(1, per);
  const pages = [];
  for (let i = 0; i < list.length; i += n) pages.push(list.slice(i, i + n));
  return pages.length ? pages : [[]];
}

// The page a sideways scroll rests on.
export const pageAt = (scrollLeft, width, pages) => (width > 0 ? Math.min(pages - 1, Math.max(0, Math.round(scrollLeft / width))) : 0);

// A pinch: fingers spread apart make the pads bigger, pinched together
// smaller, smoothly: the pads grow by as much as the fingers spread, as a
// share of the way between this box's ends, kept to 0.01 (the setting's steps).
export function pinchShare(start, startDist, dist, width, height, gap = KIDS_GAP) {
  const from = shareOf(width, height, start, gap);
  const keep = (v) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
  if (!(startDist > 0) || !(dist > 0)) return keep(from);
  const { min, max } = kidsRange(width, height, gap);
  const ratio = (max + gap) / (min + gap);
  if (!(ratio > 1)) return keep(from);
  return keep(from + Math.log(dist / startDist) / Math.log(ratio));
}

// The loud, sudden presets: they sit at the very end of Kids' Pads.
export const KIDS_STARTLES = ['explosion', 'siren', 'alarm', 'airhorn', 'evil-laugh', 'buzzer'];

// The presets on Kids' Pads, in this order: only sounds whose picture
// shows what they are, the funniest first (Ben, 2026-10-22: the pads "have
// to have matching sounds to the emoji pictures… engaging, interesting and
// funny"). A 🐶 woofs and a 🎈 pops; a 🍎 that plays a note, a 🌞 chord, a
// 🐘 bass note or a 🎩 hi-hat teaches a kid who can't read the wrong thing,
// so those stay in the regular app. A preset a grown-up hid stays hidden.
export const KIDS_PADS = [
  // Animals: each says what it is.
  'woof', 'meow', 'moo', 'quack', 'ribbit', 'roar', 'tweet', 'buzz',
  // Silly.
  'toot', 'burp', 'raspberry', 'boing', 'honk', 'kazoo', 'slide-whistle', 'splat', 'bonk', 'squeak', 'zip', 'sad-trombone',
  // Effects.
  'pop', 'whoosh', 'ding', 'tada', 'heartbeat', 'countdown',
  // Game and sci-fi.
  'coin', 'jump', 'zap', 'pew', 'power-up', 'teleport', 'game-over', 'robot', 'ufo', 'computer',
  // Spoken callouts whose face or sign says the word.
  'wow', 'no-way', 'oh-yeah', 'oof', 'nice', 'yes', 'go', 'ready', 'lets-go',
  // Drums and percussion that look like what they are.
  'snare', 'clap', 'kick', 'snap', 'shaker', 'tambourine', 'ride', 'crash', 'drumroll', 'rimshot', 'boom', 'clave', 'conga', 'djembe-slap', 'plink', 'bloop', 'horn-stab', 'rewind',
  // The startles, last (Ben, 2026-10-26: the child psychologist, a sudden
  // loud noise frightens some 3-year-olds), so a small kid swiping for fun
  // meets them only at the end.
  ...KIDS_STARTLES,
];

// The pads in Kids: the kid's own sounds first, newest first (a new
// recording is the first pad), then any other sound of the board's own, then
// the presets in KIDS_PADS order (a kit sound not in it never shows).
export function kidsPadOrder(clips) {
  const own = clips.filter((c) => c.source === 'user').sort((a, b) => (b.created || 0) - (a.created || 0));
  const board = clips.filter((c) => c.source !== 'user' && !c.kit);
  const kit = KIDS_PADS.map((id) => clips.find((c) => c.kit && c.kitId === id)).filter(Boolean);
  return [...own, ...board, ...kit];
}

// ── The kid's beat ──

// Four drums from the kit, eight squares each. A square is an eighth note:
// square i is pill 2i of a 16-pill bar, so the beat is a normal beat. It is
// the person's scratch beat (ADR 0020, scratch.js), which the regular app
// opens whenever nothing else is open and plays the same.
// Kick 🦶, snare 🪘, shaker 🪇, clap 👏 (Ben, 2026-10-26): each picture shows
// its sound, and none is a tab's (🔊 🎙️ 🥁 🎹), where the snare's own 🥁 and
// the hi-hat's 🎩 pun were. The snare wears 🪘 in this grid only.
export const KIDS_DRUMS = ['kick', 'snare', 'shaker', 'clap'];
export const KIDS_DRUM_PICTURES = { snare: '🪘' };
export const drumPicture = (clip) => KIDS_DRUM_PICTURES[clip.kitId] ?? clip.emoji;
export const KIDS_SQUARES = 8;
const PER_SQUARE = STEPS / KIDS_SQUARES;

// 🐢 slow, the middle, 🏃 fast. Tapping a lit one goes back to the middle.
export const KIDS_TEMPOS = { slow: 80, mid: 110, fast: 140 };
export function tempoAfter(bpm, tapped) {
  const want = KIDS_TEMPOS[tapped];
  if (!want) return bpm;
  return bpm === want ? KIDS_TEMPOS.mid : want;
}
// Which tempo button is lit for a beat's tempo, if any.
export const tempoName = (bpm) => (bpm <= KIDS_TEMPOS.slow ? 'slow' : bpm >= KIDS_TEMPOS.fast ? 'fast' : 'mid');
// How long one square lasts, in seconds.
export const squareSeconds = (bpm) => 60 / bpm / 2;

// What a new Kids beat has lit (Ben, 2026-10-26: the first ▶️ played
// silence): kick 🦶 on the 1st and 3rd beat, snare 🪘 on the 2nd and 4th, as
// squares of the eight. Only Kids' own new beat has it; the regular app's
// scratch beat stays empty until someone makes hits.
export const KIDS_START = { 0: [0, 4], 1: [2, 6] };

// A new scratch beat for Kids: at the middle tempo, with a simple kick and
// snare lit, `id` the person's scratch id. `clipIds` are the four drums'
// sounds on this board (null when the board has none).
export function newKidsBeat(personId, clipIds, id, now = Date.now()) {
  const blank = {
    id, personId, name: SCRATCH_NAME, bpm: KIDS_TEMPOS.mid, bars: 1, swing: 0,
    rows: clipIds.filter(Boolean).map((clipId) => cleanRow({ clipId, steps: [] })),
    created: now, saved: now,
  };
  return Object.entries(KIDS_START).reduce((beat, [drum, squares]) => (
    squares.reduce((b, square) => withSquare(b, clipIds, Number(drum), square, true, now), beat)
  ), blank);
}

// The squares on screen: one line of eight per drum, read from the beat's row
// for that drum (the first one, if a grown-up made more).
export function squaresOf(beat, clipIds) {
  return clipIds.map((clipId) => {
    const row = clipId ? beat?.rows?.find((r) => r.clipId === clipId) : null;
    return Array.from({ length: KIDS_SQUARES }, (_, i) => !!row?.steps?.[i * PER_SQUARE]);
  });
}

// The beat with one square turned on or off. Its other rows and pills are
// left as they are; the drum gets a row if it had none. The square lands in
// every bar of the beat (a tune made it four bars, below), so the drums
// read as the one pattern the grid shows.
export function withSquare(beat, clipIds, drum, square, on, now = Date.now()) {
  const clipId = clipIds[drum];
  if (!clipId) return beat;
  const rows = beat.rows.map((r) => ({ ...r, steps: [...r.steps], accents: [...(r.accents ?? [])], notes: [...(r.notes ?? [])] }));
  let row = rows.find((r) => r.clipId === clipId);
  if (!row) { row = cleanRow({ clipId, steps: [] }); rows.push(row); }
  const first = square * PER_SQUARE;
  for (let pill = first; pill < Math.max(STEPS, row.steps.length); pill += STEPS) {
    row.steps[pill] = on;
    if (!on && row.accents) row.accents[pill] = false;
    if (!on && row.notes) row.notes[pill] = null;
  }
  // A tune row (🎹, ADR 0023) keeps its notes: a square is a note there.
  if (row.melody) {
    const tune = (row.tune ?? []).filter((n) => Math.floor(n.s) % STEPS !== first);
    if (on) for (let pill = first; pill < row.steps.length; pill += STEPS) tune.push({ p: 0, s: pill, l: 1 });
    Object.assign(row, cleanRow({ ...row, tune }));
  }
  return { ...beat, rows, saved: now };
}

// ── ● Record on the Keys screen: a tune into the kid's beat ──

// Ben, 2026-10-22: "there should be a record button… compose a little tune
// in here in this mode and be able to save it and use it again in the grown
// up mode". The kid's tune is one tune row (🎹, ADR 0023) of their one
// beat: its sound the C of the instrument playing (keyKitId), each key a
// note above it (keyPitch). The beat grows to TUNE_BARS bars for it, the
// drums' one bar repeated, so a tune has room; a square tapped on Beats
// lands in every bar (withSquare), so the grid still shows the one pattern.
// ● counts 3, 2, 1 at the beat's tempo, then the beat goes round once
// through its bars while the keys land on the nearest pill; it stops by
// itself as the beat comes round, or at the next tap, and the beat plays on
// with the tune. The first note of a new recording starts the tune again
// (an empty take changes nothing); the beat with the tune it replaces is
// kept first in 🗂️ My beats (keptTune). A grown-up sees the tune row on
// 🥁 Beats, in 🎹 the piano roll, and keeps the beat with 💾 Keep.
export const TUNE_BARS = 4;
export const TUNE_COUNT = 3;   // beats of 3, 2, 1 before the beat starts
export const pillSeconds = (bpm) => 60 / bpm / (STEPS / 4);
export const tuneRowOf = (beat) => beat?.rows?.find((r) => r.melody) ?? null;

// The beat with at least `bars` bars: each row's pills so far repeated to
// fill them (sequencer multiplyRows). A beat with as many, or more, is left.
export function withBars(beat, bars, now = Date.now()) {
  const had = beat.bars || 1;
  if (had >= bars) return beat;
  return { ...beat, bars, rows: multiplyRows(beat.rows, STEPS * had, STEPS * bars), saved: now };
}

// The pill a key lands on: `t` seconds after the beat started round (less
// than 0: before it, in the count), a pill every `pill` seconds, `total`
// pills round. The nearest pill, so a hit a touch early still lands where
// it was meant; one before the first pill is the first pill (an eager tap
// in the count); one past the last comes round.
export function pillAt(t, pill, total) {
  const n = Math.round(t / pill);
  if (n < 0) return 0;
  return n % total;
}

// A note the kid played, `pitch` semitones above the C, landing on pill `s`
// of the tune row, `l` pills long (notes.js addNote: a note already there
// at that pitch keeps its place). `fresh`: a new recording's first note
// starts the row again, on `clipId` (the instrument playing now); the row
// is made when the beat has none. Returns the beat, saved.
export function withTuneNote(beat, { clipId, pitch, s, l = 1, fresh = false }, now = Date.now()) {
  const total = STEPS * (beat.bars || 1);
  const rows = beat.rows.map((r) => ({ ...r }));
  let row = rows.find((r) => r.melody);
  if (!row) { row = cleanRow({ clipId, melody: true, steps: Array(total).fill(false), tune: [] }); rows.push(row); }
  const tune = fresh ? [] : (row.tune ?? []);
  const made = addNote(tune, pitch, s, l);
  if (!made && !fresh) return beat;
  rows[rows.indexOf(row)] = cleanRow({ ...row, clipId: fresh ? clipId : row.clipId, steps: Array(total).fill(false), tune: made?.tune ?? tune });
  return { ...beat, rows, saved: now };
}

// A tune about to be replaced by a new ● recording is kept first, the way
// 🆕 New keeps a scratch with hits: the whole beat, its drums and that tune,
// a beat of its own in 🗂️ My beats under `name` (a fun name), so a grown-up
// can find the earlier one. Kids has no Undo and a kid can't read a "Kept
// as …" line, so nothing shows; the kid just plays again. Null when the beat
// has no tune to lose.
export function keptTune(beat, { id, name }, now = Date.now()) {
  if (!tuneRowOf(beat)?.tune?.length) return null;
  return { ...cleanPattern(beat, beat.personId), id, name, created: now, saved: now };
}

// ── Voices ──

// The three big voice buttons, and what each puts on a sound: 🤖 Robot,
// 🐭 Tiny (Chipmunk) and 👻 Spooky (Monster, then Stadium's echo).
export const KIDS_VOICES = {
  robot: [voiceStep('robot')],
  tiny: [voiceStep('chipmunk')],
  spooky: [voiceStep('monster'), voiceStep('stadium')],
};
// The fields a sound stores for a kids voice (null: Normal).
export function kidsVoiceFields(id) {
  const fields = chainFields(KIDS_VOICES[id] ?? [voiceStep('normal')]);
  if (!fields.fx) delete fields.fx;
  if (fields.amount === undefined) delete fields.amount;
  return fields;
}
// Tapping a voice button: it lights (and the others go out), or goes out if
// it was lit.
export const voiceAfter = (now, tapped) => (now === tapped ? null : tapped);

// ── Recording ──

export const MAX_RECORD_SECONDS = 10;   // as the sound sheet's Record
export const MIN_RECORD_SECONDS = 0.3;  // a recording shorter than this is nothing
// A press on the mic shorter than this is a tap: 3, 2, 1 count, then it
// listens until the next tap. A longer press is a hold: it listens at once
// and the lift stops it (Ben, 2026-10-22: "both should be capable").
export const TAP_MS = 350;
export const pressKind = (ms) => (ms < TAP_MS ? 'tap' : 'hold');
// The count before a tapped recording listens: 3, 2, 1, a number each
// `ms`, as the sound sheet's Record counts. Tests shorten it.
export const KIDS_COUNT = { from: 3, ms: 700 };

// A new sound's picture: the first of these not on the board yet.
export const KIDS_EMOJI = ['🦄', '🐸', '🐙', '🦖', '🐶', '🐱', '🐵', '🐷', '🐰', '🦁', '🐯', '🐨', '🐼', '🐔', '🐧', '🐢'];
export const pictureFor = (used) => KIDS_EMOJI.find((e) => !used.has(e)) ?? KIDS_EMOJI[used.size % KIDS_EMOJI.length];

// ── Live keys ──

// Eight keys, pentatonic, always (Ben, 2026-10-17: no wrong notes for a
// small kid): C D E G A, then high C, high D, high E; bright colors, left to
// right. A key plays one of the kit's notes `up` semitones higher: a high key
// plays its low note's sound an octave up (twice as fast, as a tune row's
// note does), so it wears the same fruit, smaller, with ✦.
export const KIDS_KEYS = [
  { note: 'note-c', up: 0, color: '#E5383B', key: 'a' },
  { note: 'note-d', up: 0, color: '#F77F00', key: 's' },
  { note: 'note-e', up: 0, color: '#FCBF49', key: 'd' },
  { note: 'note-g', up: 0, color: '#2BB24C', key: 'f' },
  { note: 'note-a', up: 0, color: '#1FC7B0', key: 'g' },
  { note: 'note-c', up: 12, color: '#3A86FF', key: 'h' },
  { note: 'note-d', up: 12, color: '#8338EC', key: 'j' },
  { note: 'note-e', up: 12, color: '#FF4FA3', key: 'k' },
];
// Each kit note's pitch above its C, in semitones.
const NOTE_PITCH = { 'note-c': 0, 'note-d': 2, 'note-e': 4, 'note-f': 5, 'note-g': 7, 'note-a': 9, 'note-b': 11 };
// The pitch a key plays, in semitones above the low C.
export const keyPitch = (k) => NOTE_PITCH[k.note] + (k.up || 0);
// How fast its sound plays: 2 for an octave up.
export const keyRate = (k) => 2 ** ((k.up || 0) / 12);
// A high key plays under a name of its own, so it and its low key can sound at once.
export const keyPlayId = (k, clipId) => (k.up ? `${clipId}+${k.up}` : clipId);
export const isHighKey = (k) => (k.up || 0) >= 12;

// Who plays the toy keys (ADR 0030): the round button at the top left moves
// along this kid-sized list of the Notes instruments, round to Pluck again.
// The pick is the person's own `instNotes`, the same one 🎹 Who plays on
// Notes keeps, so an instrument picked elsewhere plays here too; a tap from
// one not in this list starts it again at Pluck.
export const KIDS_INSTRUMENTS = ['pluck', 'piano', 'marimba', 'steel', 'kalimba'];
export const nextKidsInstrument = (now) => KIDS_INSTRUMENTS[(KIDS_INSTRUMENTS.indexOf(now) + 1) % KIDS_INSTRUMENTS.length];
// The kit id a key plays on instrument `inst`: its note on that instrument
// (`piano-e` for note-e), or the note itself on Pluck or one that plays no Notes.
export const keyKitId = (k, inst) => versionFor(k.note, 'notes', inst) ?? k.note;

// The kid's beat squares on a phone: eight across leaves squares narrower
// than a finger, so they turn and run down the screen instead.
export const beatLayout = (width) => ((width - 80) / KIDS_SQUARES >= 48 ? 'across' : 'down');

// The tabs at the bottom of Kids, in order.
export const KIDS_TABS = ['pads', 'record', 'beats', 'keys'];
export const cleanTab = (t) => (KIDS_TABS.includes(t) ? t : 'pads');
