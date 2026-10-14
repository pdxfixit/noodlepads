// 🎹 The piano roll's notes (ADR 0023): a tune row holds notes, each a pitch,
// a start and a length, the last two in pills. Pure: lists in, lists out.
// The sequencer stores and plays them (sequencer.js) and roll.js draws the
// roll; this file decides what a tap, a drag or a stored list means.
//
// A note is {p, s, l}:
// - p: the pitch, in semitones above the row's sound's C: 0 plays the sound
//   as itself (moved to its nearest C when 🎵 Find its note knows its note,
//   pitch.js rootShift), 7 a G above it, -12 a C below. LOW to HIGH.
// - s: the pill it starts on, from 0; a half pill (0.5) only at Advanced.
// - l: how many pills it lasts: a whole number, or halves at Advanced.
// Two notes of one pitch never overlap; notes of different pitches may (a chord).
//
// Tune rows used to be melody rows: one note per pill from a five-note scale
// (`notes`, one per pill). They are read as notes one pill long
// (fromLegacy), and every tune row still writes that list beside its notes
// (legacy), so an older copy of the app plays the tune roughly.

import { NOTE_NAMES } from './pitch.js';

export const LOW = -24;            // two octaves below the sound's C
export const HIGH = 36;            // three above it
export const VIEW = 24;            // a view shows two octaves (Ben: "two octaves show on a phone")
export const SCALE = [0, 2, 4, 5, 7, 9, 11];   // C major: the white keys, shown with the scale lock on
export const MAX_NOTES = 256;      // per row
export const MAX_NOTE_PILLS = 64;  // the longest note: four bars of 4/4
// The old melody rows' notes, low lane first: C D E G A, then high C D E.
export const MELODY_NOTES = [0, 2, 4, 7, 9, 12, 14, 16];

const wrap12 = (p) => ((p % 12) + 12) % 12;
export const inScale = (p) => SCALE.includes(wrap12(p));
export const isC = (p) => wrap12(p) === 0;
// A row's note name: C, C♯, D … (pitch.js names them), with no octave number:
// the octave depends on the sound, which a kid's own recording doesn't say.
export const noteLabel = (p) => NOTE_NAMES[wrap12(p)];
// Half pills: what a start or a length may be.
const halves = (x) => Math.round(x * 2) / 2;
export const snapTo = (x, grid) => Math.round(x / grid) * grid;
const byTime = (a, b) => a.s - b.s || a.p - b.p;
export const covers = (n, x) => x >= n.s && x < n.s + n.l;

// A stored list of notes, made safe: whole pitches in range, starts and
// lengths in half pills, starts before `pills`, no two notes of one pitch
// overlapping (the earlier one is cut short), in time order, at most MAX_NOTES.
export function cleanNotes(list, pills = MAX_NOTE_PILLS * 2) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const n of list) {
    const p = Number(n?.p), s = halves(Number(n?.s)), l = halves(Number(n?.l));
    if (!Number.isInteger(p) || p < LOW || p > HIGH) continue;
    if (!Number.isFinite(s) || s < 0 || s >= pills) continue;
    if (!Number.isFinite(l) || l < 0.5) continue;
    out.push({ p, s, l: Math.min(l, MAX_NOTE_PILLS) });
  }
  out.sort(byTime);
  const kept = [];
  for (const n of out) {
    const before = kept.findLast((k) => k.p === n.p);
    if (before && before.s === n.s) continue;                       // the same note twice
    if (before && before.s + before.l > n.s) before.l = n.s - before.s;   // runs into this one
    kept.push(n);
  }
  return kept.slice(0, MAX_NOTES);
}

// An old melody row as notes: each pill on is a note one pill long, at the
// note it had, or the sound's own when it had none (or one off the old
// scale, which played that way too).
export function fromLegacy(steps, notes) {
  const out = [];
  (Array.isArray(steps) ? steps : []).forEach((on, s) => {
    if (on) out.push({ p: MELODY_NOTES.includes(notes?.[s]) ? notes[s] : 0, s, l: 1 });
  });
  return cleanNotes(out);
}

// What a tune row also stores for older copies of the app, `length` pills
// long: a pill on where a note starts, and that pill's note as the nearest
// of the old five-note scale (the highest note when several start there).
export function legacy(tune, length) {
  const steps = Array.from({ length }, () => false);
  const notes = Array.from({ length }, () => null);
  for (const n of tune) {
    const s = Math.floor(n.s);
    if (s >= length) continue;
    steps[s] = true;
    const near = MELODY_NOTES.reduce((a, b) => (Math.abs(b - n.p) < Math.abs(a - n.p) ? b : a));
    if (notes[s] === null || near > notes[s]) notes[s] = near;
  }
  return { steps, notes };
}

// The note of pitch `p` sounding at pill `x` (a start or any part of it): its index, or -1.
export const noteAt = (tune, p, x) => tune.findIndex((n) => n.p === p && covers(n, x));

// A note added at pitch `p`, pill `s`, `l` pills long (the tap: one pill, or
// half a pill at Advanced). Where a note of that pitch already sounds there
// is no room: null. One starting later at that pitch cuts it short.
// Returns {tune, note} with the new list.
export function addNote(tune, p, s, l = 1) {
  if (!Number.isInteger(p) || p < LOW || p > HIGH || noteAt(tune, p, s) >= 0 || tune.length >= MAX_NOTES) return null;
  const next = tune.filter((n) => n.p === p && n.s > s).reduce((a, n) => Math.min(a, n.s), Infinity);
  const note = { p, s: halves(s), l: halves(Math.min(l, next - s, MAX_NOTE_PILLS)) };
  if (note.l < 0.5) return null;
  return { tune: [...tune, note].sort(byTime), note };
}

export const removeNote = (tune, i) => tune.filter((_, k) => k !== i);

// A note's end dragged to pill `end` (where the finger is, any fraction):
// its length snaps to `grid` (1, or 0.5 at Advanced), at least one grid
// step, and stops short of the next note of its pitch. Returns the new list.
export function resizeNote(tune, i, end, grid = 1) {
  const n = tune[i];
  if (!n) return tune;
  const next = tune.filter((o) => o.p === n.p && o.s > n.s).reduce((a, o) => Math.min(a, o.s), Infinity);
  const l = Math.min(Math.max(grid, snapTo(end - n.s, grid)), next - n.s, MAX_NOTE_PILLS);
  if (l === n.l) return tune;
  return tune.map((o, k) => (k === i ? { ...o, l: halves(l) } : o));
}

// The notes that start within pill `step` (at it, or half a pill after it).
export const startsIn = (tune, step) => tune.filter((n) => Math.floor(n.s) === step);

// The pitch rows a view shows, highest first: two octaves up from `lo`,
// only the scale's notes with the scale lock on, plus any row that has a
// note (so nothing a kid placed can hide).
export function viewRows(lo, { all = false, tune = [] } = {}) {
  const used = new Set(tune.map((n) => n.p));
  const rows = [];
  for (let p = lo + VIEW; p >= lo; p--) if (all || inScale(p) || used.has(p)) rows.push(p);
  return rows;
}

// The view a roll opens on: the C at or below its lowest note (or the
// sound's own C), as far as the range allows.
export function homeView(tune) {
  const low = tune.length ? Math.min(...tune.map((n) => n.p)) : 0;
  return clampView(Math.floor(low / 12) * 12);
}
export const clampView = (lo) => Math.min(HIGH - VIEW, Math.max(LOW, lo));
// An octave higher (+1) or lower (-1); the same view at the end of the range.
export const moveView = (lo, dir) => clampView(lo + 12 * Math.sign(dir));

// Rows of hits playing different notes of one sound, as one tune (💃 Grooves'
// bass rows, grooves.js): [{p, steps}] → notes, each lasting until the next
// note starts (as the old rows' sounds were cut off by their next hit), at
// most `most` pills, the last one up to the end of the beat.
export function lineOf(parts, total, most = 8) {
  const starts = [];
  for (const { p, steps } of parts) steps.forEach((on, s) => { if (on && s < total) starts.push({ p, s }); });
  starts.sort(byTime);
  const times = [...new Set(starts.map((n) => n.s))];
  return cleanNotes(starts.map(({ p, s }) => {
    const next = times.find((t) => t > s) ?? total;
    return { p, s, l: Math.max(1, Math.min(most, next - s)) };
  }), total);
}

// Do two lists hold the same notes?
export const sameNotes = (a = [], b = []) => a.length === b.length && a.every((n, i) => n.p === b[i].p && n.s === b[i].s && n.l === b[i].l);

// A beat that grows while the keys record (sequencer multiplyRows): the
// notes from pill `from` on are dropped, then pills `from` to `to` start as
// a copy of the notes so far.
export function multiplyNotes(tune, from, to) {
  const kept = tune.filter((n) => n.s < from);
  const out = [...kept];
  for (let at = from; at < to; at += from) for (const n of kept) if (n.s + at < to) out.push({ ...n, s: n.s + at });
  return cleanNotes(out, to);
}
