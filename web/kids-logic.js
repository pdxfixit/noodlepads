// 🧸 Kids (ADR 0019): the pure parts, kept apart from the page so tests can
// run them in Node. The grown-up sum, how the picture pads fill a page and
// change size with a pinch, which page a swipe lands on, the kid's one beat
// (four drums, eight squares) and its three tempos, and the three voices.
// kids.js draws all of it.

import { cleanRow, STEPS } from './sequencer.js';
import { chainFields, voiceStep } from './voices.js';
import { SCRATCH_NAME } from './scratch.js';

// ── The grown-up sum ──

// Two numbers from 6 to 9: every answer has two digits (12 to 18), which a
// five-year-old cannot guess by tapping one key.
export function makeSum(random = Math.random) {
  const pick = () => 6 + Math.floor(random() * 4);
  const a = pick();
  const b = pick();
  return { a, b, answer: a + b };
}

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

// The pads in Kids: the kid's own sounds first, newest first (a new
// recording is the first pad), then the kit and the rest in board order.
export function kidsPadOrder(clips) {
  const own = clips.filter((c) => c.source === 'user').sort((a, b) => (b.created || 0) - (a.created || 0));
  return [...own, ...clips.filter((c) => c.source !== 'user')];
}

// ── The kid's beat ──

// Four drums from the kit, eight squares each. A square is an eighth note:
// square i is pill 2i of a 16-pill bar, so the beat is a normal beat. It is
// the person's scratch beat (ADR 0020, scratch.js), which the regular app
// opens whenever nothing else is open and plays the same.
export const KIDS_DRUMS = ['kick', 'snare', 'hihat', 'clap'];
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

// A new scratch beat for Kids: empty, at the middle tempo, `id` the
// person's scratch id. `clipIds` are the four drums' sounds on this board
// (null when the board has none).
export function newKidsBeat(personId, clipIds, id, now = Date.now()) {
  return {
    id, personId, name: SCRATCH_NAME, bpm: KIDS_TEMPOS.mid, bars: 1, swing: 0,
    rows: clipIds.filter(Boolean).map((clipId) => cleanRow({ clipId, steps: [] })),
    created: now, saved: now,
  };
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
// left as they are; the drum gets a row if it had none.
export function withSquare(beat, clipIds, drum, square, on, now = Date.now()) {
  const clipId = clipIds[drum];
  if (!clipId) return beat;
  const rows = beat.rows.map((r) => ({ ...r, steps: [...r.steps], accents: [...(r.accents ?? [])], notes: [...(r.notes ?? [])] }));
  let row = rows.find((r) => r.clipId === clipId);
  if (!row) { row = cleanRow({ clipId, steps: [] }); rows.push(row); }
  const pill = square * PER_SQUARE;
  row.steps[pill] = on;
  if (!on && row.accents) row.accents[pill] = false;
  if (!on && row.notes) row.notes[pill] = null;
  // A tune row (🎹, ADR 0023) keeps its notes: a square is a note there.
  if (row.melody) {
    const tune = (row.tune ?? []).filter((n) => Math.floor(n.s) !== pill);
    if (on) tune.push({ p: 0, s: pill, l: 1 });
    Object.assign(row, cleanRow({ ...row, tune }));
  }
  return { ...beat, rows, saved: now };
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
export const MIN_RECORD_SECONDS = 0.3;  // a quick tap records nothing

// A new sound's picture: the first of these not on the board yet.
export const KIDS_EMOJI = ['🦄', '🐸', '🐙', '🦖', '🐶', '🐱', '🐵', '🐷', '🐰', '🦁', '🐯', '🐨', '🐼', '🐔', '🐧', '🐢'];
export const pictureFor = (used) => KIDS_EMOJI.find((e) => !used.has(e)) ?? KIDS_EMOJI[used.size % KIDS_EMOJI.length];

// ── Live keys ──

// Eight keys, C to high C, from the kit's notes; bright colors, left to right.
export const KIDS_KEYS = [
  { note: 'note-c', color: '#E5383B', key: 'a' },
  { note: 'note-d', color: '#F77F00', key: 's' },
  { note: 'note-e', color: '#FCBF49', key: 'd' },
  { note: 'note-f', color: '#2BB24C', key: 'f' },
  { note: 'note-g', color: '#1FC7B0', key: 'g' },
  { note: 'note-a', color: '#3A86FF', key: 'h' },
  { note: 'note-b', color: '#8338EC', key: 'j' },
  { note: 'note-c-high', color: '#FF4FA3', key: 'k' },
];

// The kid's beat squares on a phone: eight across leaves squares narrower
// than a finger, so they turn and run down the screen instead.
export const beatLayout = (width) => ((width - 80) / KIDS_SQUARES >= 48 ? 'across' : 'down');

// The tabs at the bottom of Kids, in order.
export const KIDS_TABS = ['pads', 'record', 'beats', 'keys'];
export const cleanTab = (t) => (KIDS_TABS.includes(t) ? t : 'pads');
