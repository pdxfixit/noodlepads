// Beat maker: a step sequencer. Each row plays one sound from any board; its
// 16 pills are one bar of 4/4, each pill a quarter of a beat (a sixteenth
// note). Each person has one open beat (ADR 0017), shown on Beats with or
// without ⌨️ Keys: a beat in the person's library, or their scratch beat
// (ADR 0020, scratch.js) when nothing else is open.
//
// With advanced beats on (Settings), each row can run at ½×, 1× or 2× the
// beat's tempo, so every row keeps its own clock.
//
// Timing uses the Web Audio clock, not timers: a 25 ms tick schedules every
// hit due in the next 100 ms at its exact time (the usual lookahead pattern),
// so a busy page can delay the tick without making the beat drag.
//
// When a row's sound is still playing at its next hit, it is cut off with a
// short fade (a hard cut clicks), unless the row's 🔔 Overlap is on (`ring`,
// at every level), which lets hits overlap, up to MAX_RINGING at once.

import { openDialog, setupDialog } from './dialogs.js';
import { newId, recall, remember } from './util.js';
import { makeVoice, fadeStop } from './audio.js';
import { getSetting, onSetting } from './settings.js';
import { logEvent } from './log.js';
import { showBanner } from './ui.js';
import { countPlay } from './play-count.js';
import { soundKind } from './log-clean.js';
import { rootShift } from './pitch.js';
import { downloadBlob } from './download.js';
import { GROOVES, GROOVE_GROUPS } from './grooves.js';
import { FAMILIES, instrumentById, instrumentsFor, presetInstrument, PLAYED, versionFor, ownIdOf } from './instruments.js';
import { isScratch, isHiddenBeat, scratchOf, scratchId, scratchLabel, grooveOf, hasHits, SCRATCH_NAME } from './scratch.js';
import { cleanVolume, rowLevel, setRowLevel, drawSpeaker, speakerControls, percent } from './row-volume.js';
import { rowParts, rowSpeaker, rowEmoji, twinRows } from './beat-row.js';
import { moreMenu, fitMore } from './overflow.js';
import { MAX_RINGING, ringOver } from './rhythm.js';
import { cleanFx, masterLevel, silencedBySolo, mixKey, buildMix, createMixer } from './mixer.js';
import { MELODY_NOTES, cleanNotes, fromLegacy, legacy, startsIn, addNote, lineOf, sameNotes, multiplyNotes } from './notes.js';
import { createRoll } from './roll.js';
import { hasPicker, pickerButton, pickerList, pickInstrument } from './inst-picker.js';

export const STEPS = 16;         // a bar of 4/4, the simple beat maker
export const MAX_STEPS = 20;     // the longest bar (5/4)
export const BAR_CHOICES = [1, 2, 4];                   // how many bars a beat can be
export const MAX_PILLS = MAX_STEPS * Math.max(...BAR_CHOICES);  // the most pills a row can hold

// Time signatures, one per beat (pattern.signature; chosen with Advanced on):
// the bar's pills, grouped by the beat. A pill is always a sixteenth and BPM
// always counts quarter notes, so 6/8 is two groups of three eighths.
export const SIGNATURES = {
  '4/4': [4, 4, 4, 4],
  '3/4': [4, 4, 4],
  '5/4': [4, 4, 4, 4, 4],
  '6/8': [6, 6],
  '7/8': [4, 4, 6],
};
export const barSteps = (signature) => (SIGNATURES[signature] || SIGNATURES['4/4']).reduce((a, b) => a + b, 0);
const STEPS_PER_BEAT = 4;
const MAX_ROWS = 16;   // Ben, 2026-10-11: room to grow; the keys view also reuses an empty row when full
const DEFAULT_BPM = 100;
const MIN_BPM = 60;
const MAX_BPM = 180;
// Tempos most music uses. On the tempo slider each takes TEMPO_PULL times the
// travel of the tempos between, so a slide lands on them, yet every tempo in
// between can still be reached (or typed).
export const COMMON_BPMS = [60, 70, 80, 90, 100, 110, 120, 128, 130, 140, 150, 160, 170, 180];
const TEMPO_PULL = 16;
// Swing (advanced): every second pill (the off-beat sixteenths) plays late by
// swing/100 of a pill. 0 is straight; MAX_SWING is a heavy shuffle.
export const MAX_SWING = 50;
export const BEAT_ID = /^beat-[a-z0-9-]{1,48}$/;
export const swingDelay = (step, dt, swing) => (step % 2 === 1 ? (swing / 100) * dt : 0);
const TICK_MS = 25;
const LOOKAHEAD = 0.1;
export const ROW_RATES = [1, 2, 0.5];   // a row's speeds (its keys in the sound picker: ½× 1× 2×)
// Tune rows (🎹 the piano roll, ADR 0023): the row's sound plays notes of
// any pitch and length (notes.js). They were melody rows, one note per pill
// from MELODY_NOTES, which older copies of the app still read.
export { MELODY_NOTES };
export const noteRate = (semitones) => 2 ** ((semitones || 0) / 12);
export const ACCENT_GAIN = 1.5;        // a loud hit: about 3.5 dB up (the limiter keeps a pile-up from clipping)
// How loud one of a row's hits plays: a loud hit's lift times the row's
// loudness (its speaker, row-volume.js). Live play, Save as a sound, songs
// and share previews all sound hits at this gain.
export const hitGain = (row, loud) => (loud ? ACCENT_GAIN : 1) * rowLevel(row);
// Does a row play at all: not muted, not turned all the way down, and (in
// beat `p`) not silenced by another row's Solo (the 🎚️ Mixer, mixer.js).
export const audible = (row, p = null) => !row.muted && rowLevel(row) > 0 && !(p && silencedBySolo(p, row));
export { MAX_RINGING };                // overlapping hits one 🔔 Overlap row may have sounding (rhythm.js)
const ARM_MS = 3000;                   // how long a Clear? or Remove? waits for its second tap
const UNDO_MS = 8000;
// The line 🆕 New shows when it has emptied a scratch beat with rows.
const FRESH_TEXT = '🆕 Your scratch beat is blank now.';                  // how long a removed row can be brought back
export const MAX_CHIPS = 8;            // pattern chips under the beat bar: 8 spots
export const MAX_PINS = MAX_CHIPS;     // beats pinned with 📌 in 🗂️ My beats, each taking a spot

// Pattern chips (Ben, 2026-10-12): which beats get the 8 spots, in order.
// Pinned beats come first, in the order they were pinned (a beat record's
// `pinned` is when). The spots left go to the beats used most recently (the
// `saved` stamp: opened or changed), shown oldest made first, so tapping a
// chip never moves it: it is in the set already, and its place comes from
// when it was made. A beat new to the set pushes out the one used longest
// ago; the rest keep their order.
export const isPinned = (b) => Number.isFinite(b?.pinned) && b.pinned > 0;
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function chipBeats(beats, spots = MAX_CHIPS) {
  const pinned = beats.filter(isPinned).sort((a, b) => a.pinned - b.pinned || byId(a, b)).slice(0, spots);
  const recent = beats.filter((b) => !isPinned(b))
    .sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0) || byId(a, b))
    .slice(0, spots - pinned.length)
    .sort((a, b) => (a.created ?? 0) - (b.created ?? 0) || byId(a, b));
  return [...pinned, ...recent];
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// A row's own fields, made safe. Fields from older copies of the app (a pill
// count or BPM per row) are dropped.
function cleanPlainRow(r) {
  // 16 pills, or more when a longer bar or more bars used them: beats saved
  // before keep their exact shape.
  const steps = Array.from({ length: Math.min(MAX_PILLS, Math.max(STEPS, Array.isArray(r?.steps) ? r.steps.length : 0)) }, (_, i) => !!r?.steps?.[i]);
  return {
    clipId: typeof r?.clipId === 'string' ? r.clipId.slice(0, 64) : null,
    steps,
    // Loud hits: only a pill that is on can be loud. Beats from before have none.
    accents: steps.map((on, i) => on && r?.accents?.[i] === true),
    rate: ROW_RATES.includes(r?.rate) ? r.rate : 1,
    ring: r?.ring === true,
    muted: r?.muted === true,
    // The 🎚️ Mixer's Solo and effect, only when set (ADR 0018): an older app ignores them.
    ...(r?.solo === true ? { solo: true } : {}),
    ...(cleanFx(r?.fx) ? { fx: cleanFx(r.fx) } : {}),
    // Its loudness (0–1), only when below full: an older app plays it full.
    ...(cleanVolume(r?.volume) < 1 ? { volume: cleanVolume(r.volume) } : {}),
    collapsed: r?.collapsed === true,  // shown as one slim line; how it looks, not how it plays
    melody: r?.melody === true,
    // The old melody rows' note per pill (semitones, from MELODY_NOTES), or null.
    notes: steps.map((on, i) => (on && MELODY_NOTES.includes(r?.notes?.[i]) ? r.notes[i] : null)),
  };
}

// One row as stored, made safe to use (ADR 0023). A tune row (`melody`) keeps
// its notes in `tune`; one stored by an older copy has only a note per pill,
// read as notes a pill long. Its pills and per-pill notes are worked out
// from the notes: the pills light where notes start (the compact row's
// preview, chips and thumbnails), and an older copy plays them.
// The sound a new row starts on: the first one not used yet after the last
// row's, in the chooser's order (after an F chord, the next chord; Ben,
// 2026-10-16), going round at the end. With no rows, or the last row's
// sound not in `order`, the first unused one in `start`.
export function nextSound(order, rowIds, start = order) {
  const used = new Set(rowIds);
  const from = order.findIndex((c) => c.id === rowIds.at(-1));
  if (from >= 0) {
    for (let k = 1; k <= order.length; k++) {
      const c = order[(from + k) % order.length];
      if (!used.has(c.id)) return c;
    }
    return order[(from + 1) % order.length];
  }
  return start.find((c) => !used.has(c.id)) ?? start[0] ?? null;
}

export function cleanRow(r) {
  const row = cleanPlainRow(r);
  if (!row.melody) return row;
  const tune = Array.isArray(r?.tune) ? cleanNotes(r.tune, MAX_PILLS) : fromLegacy(r?.steps, r?.notes);
  const reach = tune.reduce((a, n) => Math.max(a, Math.floor(n.s) + 1), 0);
  const length = Math.min(MAX_PILLS, Math.max(row.steps.length, reach));
  const { steps, notes } = legacy(tune, length);
  return { ...row, steps, accents: steps.map(() => false), notes, tune };
}

// A saved beat as stored, made safe to use: a known tempo, rows of 16 steps.
export function cleanPattern(raw, personId) {
  const bpm = Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, Number(raw?.bpm) || DEFAULT_BPM)));
  const rows = (Array.isArray(raw?.rows) ? raw.rows : []).slice(0, MAX_ROWS).map(cleanRow);
  const name = typeof raw?.name === 'string' ? raw.name.slice(0, 24) : '';
  const bars = BAR_CHOICES.includes(raw?.bars) ? raw.bars : 1;
  const swing = clampInt(raw?.swing, 0, MAX_SWING, 0);
  const id = BEAT_ID.test(raw?.id) ? raw.id : undefined;   // the saved beat this is (open-document model)
  const out = id ? { id, personId, name, bpm, bars, swing, rows } : { personId, name, bpm, bars, swing, rows };
  // A beat from before signatures were per beat has none, and plays as the
  // old Settings choice did (see sigOf in createSequencer).
  if (Object.hasOwn(SIGNATURES, raw?.signature)) out.signature = raw.signature;
  // The 🎚️ Mixer's master: its loudness below full and its effect, only when set (ADR 0018).
  if (cleanVolume(raw?.volume) < 1) out.volume = cleanVolume(raw.volume);
  if (cleanFx(raw?.fx)) out.fx = cleanFx(raw.fx);
  return out;
}

// How long one of a row's steps lasts, in seconds: in 'speed' (advanced
// beats) a row runs at its own rate; in 'plain' every row is on the beat.
export function stepSeconds(pattern, row, mode) {
  const base = 60 / pattern.bpm / STEPS_PER_BEAT;
  return mode === 'speed' ? base / row.rate : base;
}

// What one pill of a row plays: [{at, loud, note, len}], `at` in pills
// after the pill's start (a half-pill note: 0.5) and `len` in pills (a
// tune row's note lasts its length; a plain hit rings as its sound does,
// len 0). A tune row plays the notes starting in that pill; a plain row its pill.
export function pillHits(row, step) {
  if (row.melody) return startsIn(row.tune ?? [], step).map((n) => ({ at: n.s - step, loud: false, note: n.p, len: n.l }));
  return row.steps[step] ? [{ at: 0, loud: !!row.accents?.[step], note: 0, len: 0 }] : [];
}

// Every hit in the first `seconds` of a beat: [{row, step, time, loud,
// note, len}] (len in seconds, 0 for a plain hit), in time order. Playback
// schedules the same hits live; Save as a sound renders these.
export function planHits(pattern, mode, seconds, bar = STEPS, swing = 0) {
  const hits = [];
  const total = bar * (pattern.bars || 1);
  pattern.rows.forEach((row, i) => {
    if (!audible(row, pattern)) return;
    const dt = stepSeconds(pattern, row, mode);
    const count = total;   // every row plays all its pills, every bar, then starts over
    for (let n = 0, t = 0; t < seconds - 1e-9; n++, t = n * dt) {
      const step = n % count;
      for (const h of pillHits(row, step)) {
        hits.push({ row: i, step, time: t + h.at * dt + (h.at ? 0 : swingDelay(step, dt, swing)), loud: h.loud, note: h.note, len: h.len * dt });
      }
    }
  });
  return hits.sort((a, b) => a.time - b.time || a.row - b.row);
}

// A groove's sample in the chooser (▶): one pass of it, cut at 4 s
// (provisional, questions.md Q54), so a slow 4-bar groove is a taste.
export const SAMPLE_SECONDS = 4;
export const sampleSeconds = (pass) => Math.min(pass, SAMPLE_SECONDS);

// Starter grooves (grooves.js): Beats and the keys share them.
export { GROOVES, GROOVE_GROUPS };

// A groove row's hits as pills, [on, loud] each. Spaces only split its bars.
const grooveHits = (hits) => [...hits.replace(/\s+/g, '')].map((c) => [c === 'x' || c === 'X', c === 'X']);
// A groove's shape: its time signature, the pills in one of its bars, and
// how many bars it is.
export function grooveShape(groove) {
  const signature = Object.hasOwn(SIGNATURES, groove.signature) ? groove.signature : '4/4';
  const bar = barSteps(signature);
  const pills = grooveHits(groove.rows[0]?.[1] ?? '').length;
  return { signature, bar, bars: Math.max(1, Math.round(pills / bar)) };
}

// "➕ Add to this beat": a groove's rows (from grooveBeat) laid over a beat's
// rows. A row with the same sound (not a melody row) gets the groove's pills
// too; a new sound gets a new row, up to MAX_ROWS. The groove's bars fill
// the beat's bars in turn, round again when the beat has more, and a shorter
// bar takes the start of the groove's. `shape` is the groove's (grooveShape).
// Nothing is turned off. Returns new rows, and how many hits were added.
export function mergeGroove(rows, grooveRows, bar, bars, shape = { bar: STEPS, bars: 1 }) {
  const out = rows.map((r) => structuredClone(r));
  let added = 0;
  for (const g of grooveRows) {
    let row = out.find((r) => r.clipId === g.clipId && !!r.melody === !!g.melody);
    if (!row) {
      if (out.length >= MAX_ROWS) continue;
      row = cleanRow({ clipId: g.clipId, steps: [], melody: !!g.melody, tune: [] });
      out.push(row);
    }
    if (g.melody) {
      // A tune (the groove's bass line): its notes join where the row has
      // no note starting on that pill.
      for (let b = 0; b < bars; b++) {
        const from = (b % shape.bars) * shape.bar;
        for (const n of g.tune) {
          const k = n.s - from;
          if (k < 0 || k >= Math.min(bar, shape.bar) || row.tune.some((o) => Math.floor(o.s) === Math.floor(b * bar + k))) continue;
          const made = addNote(row.tune, n.p, b * bar + k, n.l);
          if (made) { row.tune = made.tune; added++; }
        }
      }
      continue;
    }
    for (let b = 0; b < bars; b++) {
      const from = (b % shape.bars) * shape.bar;   // the groove's bar that fills this one
      for (let k = 0; k < Math.min(bar, shape.bar); k++) {
        const i = b * bar + k;
        if (!g.steps[from + k] || row.steps[i]) continue;
        row.steps[i] = true;
        added++;
      }
    }
  }
  return { rows: out.map(cleanRow), added };
}

// How a bar's beat groups go onto lines, so a bar that has to wrap wraps
// evenly and its groups line up one above the other, in every time
// signature: 4/4 as 4 or 2 + 2 (never 3 + 1), 5/4 as 5 or 3 + 2, 3/4 as 3 or
// 2 + 1, 6/8 as 2 or 1 + 1, 7/8 (4 4 6) as 3 or 2 + 1. `sizes` are the
// groups' pill counts. Returns the column widths in pills: each column is as
// wide as its widest group, so a 6-pill beat never squeezes into a 4-pill
// column. A pill needs about `pill` px, a group `pad` more, `gap` between.
export function balancedColumns(sizes, width, { pill = 30, pad = 10, gap = 10 } = {}) {
  const n = sizes.length;
  if (!n) return [];
  const columnsFor = (k) => Array.from({ length: k }, (_, c) => Math.max(...sizes.filter((_, i) => i % k === c)));
  for (let k = n; k > 1; k--) {
    const even = Math.ceil(n / Math.ceil(n / k));   // as many a line as an even split allows
    const cols = columnsFor(even);
    const need = cols.reduce((a, s) => a + s * pill + pad, 0) + (even - 1) * gap;
    if (!(width > 0) || need <= width) return cols;
  }
  return columnsFor(1);
}

// How many bars go side by side on one line: as many as fit with every bar
// on a single line of its own (1, 2 or 4, dividing the bars evenly), so a
// wide screen shows 2 or 4 bars across instead of stacking them (Ben,
// 2026-10-11). `sizes` are one bar's beat groups; `bars` how many bars show.
export function barsPerLine(sizes, bars, width, { pill = 30, pad = 10, gap = 10, barGap = 24 } = {}) {
  if (!(width > 0) || bars < 2 || !sizes.length) return 1;
  const one = sizes.reduce((a, s) => a + s * pill + pad, 0) + (sizes.length - 1) * gap;
  for (let k = bars; k > 1; k--) {
    if (bars % k) continue;
    if (k * one + (k - 1) * barGap <= width) return k;
  }
  return 1;
}

// A beat file (🗂️ My beats → ⬇️ / 📥): one beat as JSON, to move it to another
// copy of the app without a whole backup. Only the shared kit travels: a row
// is saved by its kit sound's id ("kick"), which any copy has; a row of a
// recorded sound can't come along, so it is left out (and counted).
export const BEAT_FILE = 'noodlepads-beat';
// Beat files saved before the 1.0 rename say 'noodle-pads-beat'; they open the same.
const BEAT_FILES = new Set([BEAT_FILE, 'noodle-pads-beat']);
export const MAX_BEAT_FILE_BYTES = 64 * 1024;
export function beatToFile(pattern, kitIds) {
  const kitOf = (clipId) => (typeof clipId === 'string' ? kitIds.find((k) => clipId.endsWith(`-${k}`)) : undefined);
  let dropped = 0;
  const rows = [];
  for (const r of pattern.rows) {
    const sound = r.clipId === null ? null : kitOf(r.clipId);
    if (sound === undefined) { dropped++; continue; }
    const { clipId, ...rest } = r;
    rows.push({ sound, ...rest });
  }
  const file = { format: BEAT_FILE, version: 1, name: pattern.name, bpm: pattern.bpm, bars: pattern.bars, swing: pattern.swing || 0, rows };
  if (pattern.signature) file.signature = pattern.signature;
  if (masterLevel(pattern) < 1) file.volume = masterLevel(pattern);
  if (pattern.fx) file.fx = pattern.fx;
  return { file, dropped };
}
// A beat file's text as a beat for `personId` (no id yet: the caller gives
// one), or an Error saying, for a kid, what is wrong with the file.
export function beatFromFile(text, personId, kitIds) {
  if (typeof text !== 'string' || text.length > MAX_BEAT_FILE_BYTES) throw new Error('That file is too big to be a beat.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('That isn’t a beat file.'); }
  if (!BEAT_FILES.has(raw?.format) || raw.version !== 1 || !Array.isArray(raw.rows)) throw new Error('That isn’t a beat file.');
  const rows = raw.rows
    .filter((r) => r?.sound === null || kitIds.includes(r?.sound))
    .map((r) => ({ ...r, clipId: r.sound === null ? null : `${personId}-${r.sound}` }));
  return cleanPattern({ ...raw, rows }, personId);
}

// A pill's two gestures (Ben, 2026-10-11): a tap switches it on or off, in
// one tap; holding it (HOLD_MS) makes it a loud hit, or a loud one normal.
export const HOLD_MS = 450;
export function tapPill(row, s) {
  row.accents ??= [];
  row.steps[s] = !row.steps[s];
  row.accents[s] = false;
}
export function holdPill(row, s) {
  row.accents ??= [];
  if (!row.steps[s]) { row.steps[s] = true; row.accents[s] = true; } else row.accents[s] = !row.accents[s];
}

// Holding a pill: calls `onHold(pill)` after HOLD_MS unless the finger lifts
// or moves first. `match` finds the pill under an event. Returns
// afterHold(), which the click handler asks first: true once for the click
// that ends a hold, so that click isn't also a tap. Used by the Beats rows
// and the keys' grid.
export function pillHolds(root, match, onHold) {
  let timer = 0, start = null, held = false;
  const cancel = () => { clearTimeout(timer); timer = 0; start = null; };
  root.addEventListener('pointerdown', (e) => {
    const pill = match(e.target);
    if (!pill || e.button !== 0) return;
    held = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { timer = 0; held = true; onHold(pill); }, HOLD_MS);
  });
  root.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(type, cancel);
  // A phone's long-press menu would cover the grid.
  root.addEventListener('contextmenu', (e) => { if (match(e.target)) e.preventDefault(); });
  return () => { const was = held; held = false; return was; };
}

// Where a new sound goes in a beat's rows: a new row at the end while there
// is room (`max`), else the first row with no hits that isn't in `avoid`,
// reused in place so no row moves. -1 when every row has hits.
export function rowSlot(rows, max, avoid = new Set()) {
  if (rows.length < max) return rows.length;
  return rows.findIndex((r, k) => !avoid.has(k) && !r.steps.some(Boolean));
}

// A groove as a beat for one person: each row plays that person's copy of the
// kit sound (`<person>-<kit id>`), in the groove's time signature and bars.
// Rows whose sound the board doesn't have are left out.
// A groove's bass rows (one row per note: "bass-a", "bass-f") become one
// tune row of the kit's Bass C, played at each note (ADR 0023), where the
// first bass row was. An instrument's bass ("upright-a", ADR 0030) becomes
// a tune row of that instrument's C. Chord rows stay rows of pills: a chord
// moved to another note would change from minor to major.
export const BASS_NOTES = { 'bass-c': 0, 'bass-cs': 1, 'bass-d': 2, 'bass-ds': 3, 'bass-e': 4, 'bass-f': 5, 'bass-fs': 6, 'bass-g': 7, 'bass-gs': 8, 'bass-a': 9, 'bass-as': 10 };
// A bass preset's kit id as {base, p}: the C its tune row plays and the
// note above it. Null for any other sound.
export function bassNote(kit) {
  const m = /^(.+)-(c|cs|d|ds|e|f|fs|g|gs|a|as)$/.exec(kit ?? '');
  if (!m || !(m[1] === 'bass' || instrumentsFor('bass').some((i) => i.id === m[1]))) return null;
  return { base: `${m[1]}-c`, p: BASS_NOTES[`bass-${m[2]}`] };
}
export function grooveBeat(groove, personId, hasClip = () => true) {
  const { signature, bars, bar } = grooveShape(groove);
  const rows = [];
  const bass = [];
  let base = 'bass-c';
  for (const [kit, hits] of groove.rows) {
    const pills = grooveHits(hits);
    const note = bassNote(kit);
    if (note) {
      if (!bass.length) { rows.push('bass'); base = note.base; }
      bass.push({ p: note.p, steps: pills.map(([on]) => on) });
      continue;
    }
    rows.push({ clipId: `${personId}-${kit}`, steps: pills.map(([on]) => on), accents: pills.map(([, loud]) => loud) });
  }
  const line = { clipId: `${personId}-${base}`, melody: true, steps: Array(bar * bars).fill(false), tune: lineOf(bass, bar * bars) };
  const out = rows.map((r) => (r === 'bass' ? line : r)).filter((r) => hasClip(r.clipId));
  return cleanPattern({ name: '', bpm: groove.bpm, bars, signature, rows: out }, personId);
}

// Who plays a groove beyond its drums (ADR 0030), for its card's chips: each
// instrument once, in the order its rows come, with its family. `kitOf`
// finds a kit preset by its kit id (null when the board lacks it); rows of
// sounds no instrument plays (drums, game sounds) are left out, and so are
// the default sounds (💧 Pluck, ⚡ Synth): on nearly every card, a chip of
// them hid the grooves that have a real instrument.
const DEFAULT_PLAYERS = new Set(Object.values(PLAYED).map((p) => p.default));
export function groovePlayers(groove, kitOf) {
  const seen = new Map();
  for (const [kit] of groove.rows) {
    const inst = instrumentById(presetInstrument(kitOf(kit)));
    if (inst && !DEFAULT_PLAYERS.has(inst.id) && !seen.has(inst.id)) seen.set(inst.id, { ...inst, family: FAMILIES.find((f) => f.id === inst.family) });
  }
  return [...seen.values()];
}

// The tempo at each slider position, from MIN_BPM to MAX_BPM: a common tempo
// fills TEMPO_PULL positions, every other tempo one.
export function tempoStops(min = MIN_BPM, max = MAX_BPM, common = COMMON_BPMS, pull = TEMPO_PULL) {
  const stops = [];
  for (let bpm = min; bpm <= max; bpm++) for (let k = common.includes(bpm) ? pull : 1; k > 0; k--) stops.push(bpm);
  return stops;
}
// The slider position for a tempo: the middle of its stretch.
export function stopFor(bpm, stops) {
  const first = stops.indexOf(bpm);
  if (first < 0) return bpm < stops[0] ? 0 : stops.length - 1;
  return first + Math.floor((stops.lastIndexOf(bpm) - first) / 2);
}
// A typed tempo, made safe: a whole number within range, or null to ignore it.
export function typedBpm(text) {
  const n = Math.round(Number(String(text).trim()));
  return String(text).trim() !== '' && Number.isFinite(n) ? Math.min(MAX_BPM, Math.max(MIN_BPM, n)) : null;
}

// A tempo change while the beat plays: every time still to come moves so
// that pills after `anchor` (the first moment not yet booked) are spaced at
// the new tempo, and pills before it stay where they were heard. Applied to
// t0 too, so `t0 + n × pill` is pill n's time again: taps snap right, and
// the hits already placed stay on their pills. Returns the mapping t → t'.
export const retimeAt = (anchor, oldBpm, newBpm) => (t) => anchor + (t - anchor) * (oldBpm / newBpm);

// A beat that grows while the keys view records (a looper's "multiply"): every
// pill from `from` on is cleared (old hits hidden beyond the bars must not
// come back), then pills `from` to `to` start as a copy of the beat so far,
// loud hits and notes too. New rows; the old ones stay as they were (Undo).
export function multiplyRows(rows, from, to) {
  return rows.map((r) => {
    const len = Math.min(MAX_PILLS, Math.max(r.steps.length, to));
    const pick = (list, i, off) => (i < from ? list?.[i] ?? off : i < to ? list?.[i % from] ?? off : off);
    const steps = Array.from({ length: len }, (_, i) => !!pick(r.steps, i, false));
    const out = {
      ...r,
      steps,
      accents: steps.map((on, i) => on && pick(r.accents, i, false) === true),
      notes: steps.map((on, i) => (on ? pick(r.notes, i, null) ?? null : null)),
    };
    return r.melody ? cleanRow({ ...out, tune: multiplyNotes(r.tune ?? [], from, to) }) : out;
  });
}

// Do two beats sound the same: same tempo, same sounds, same pills on, same
// row settings?
export function samePattern(a, b) {
  if (a.bpm !== b.bpm || (a.bars || 1) !== (b.bars || 1) || (a.swing || 0) !== (b.swing || 0) || a.rows.length !== b.rows.length) return false;
  if (masterLevel(a) !== masterLevel(b) || (a.fx ?? null) !== (b.fx ?? null)) return false;
  return a.rows.every((row, i) => {
    const o = b.rows[i];
    return row.clipId === o.clipId && row.rate === o.rate && row.ring === o.ring && row.muted === o.muted && rowLevel(row) === rowLevel(o)
      && !!row.solo === !!o.solo && (row.fx ?? null) === (o.fx ?? null)
      && row.steps.length === o.steps.length && row.steps.every((on, s) => on === o.steps[s])
      && row.steps.every((_, s) => !!row.accents?.[s] === !!o.accents?.[s])
      && !!row.melody === !!o.melody && row.steps.every((_, s) => (row.notes?.[s] ?? null) === (o.notes?.[s] ?? null))
      && sameNotes(row.tune, o.tune);
  });
}

// Would replacing the beat on screen lose work? Only if it has pills on and
// is not already in the library under its name (as saved, unchanged).
export function isUnsaved(pattern, library) {
  if (!pattern.rows.some((r) => r.steps.some(Boolean))) return false;
  const saved = pattern.name ? library.find((b) => b.name === pattern.name) : null;
  return !saved || !samePattern(pattern, cleanPattern(saved, pattern.personId));
}

// Which pill an arrow key moves to from (row, step), in a grid of `rows` rows.
// `count(row)` is how many pills a row shows.
// Null for any other key. Stops at the edges.
export function pillTarget(key, row, step, rows, count = () => STEPS) {
  const clamp = (v, max) => Math.max(0, Math.min(max, v));
  const inRow = (r, s) => [r, clamp(s, count(r) - 1)];
  switch (key) {
    case 'ArrowRight': return inRow(row, step + 1);
    case 'ArrowLeft': return inRow(row, step - 1);
    case 'ArrowDown': return inRow(clamp(row + 1, rows - 1), step);
    case 'ArrowUp': return inRow(clamp(row - 1, rows - 1), step);
    case 'Home': return [row, 0];
    case 'End': return inRow(row, MAX_PILLS - 1);
    default: return null;
  }
}

// 16-bit PCM WAV, which every browser can decode, so a rendered beat can be
// stored and played like any recording.
// Moves item `from` to index `to`, in place; returns the new index of every
// old index (so per-row playback state can follow its row).
export function moveItem(list, from, to) {
  const order = list.map((_, i) => i);
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return order;
  list.splice(to, 0, ...list.splice(from, 1));
  order.splice(to, 0, ...order.splice(from, 1));
  const where = [];
  order.forEach((old, now) => { where[old] = now; });
  return where;
}

// Scales a rendered buffer so its loudest moment is just under full scale
// (rows add up, so a render can clip). In place; returns the buffer.
export function normalize(out) {
  let peak = 0;
  for (let c = 0; c < out.numberOfChannels; c++) for (const v of out.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let k = 0; k < d.length; k++) d[k] *= 0.9 / peak;
  }
  return out;
}

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const text = (at, str) => { for (let i = 0; i < str.length; i++) view.setUint8(at + i, str.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, bytes - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// deps: el (the sequencer's elements), audio and meter (from app.js),
// clips() (the current board's playable clips), groups() (every person's
// clips, [{id, name, color, clips}], current board first), clipById(id) (any
// board), colorOf(clip),
// makePad(clip) (a pad as on the board), makeAddPad(text) (the dashed empty slot),
// beatName(taken) (a fun name for a new saved beat, optional),
// keptName(groove, taken) (a kept groove's name, "Sleepy Squid (Ska version)"),
// opened(personId) -> the person's stored open beat ({id} at least) or
// undefined; setOpen(personId, pattern | null) stores it (null: the scratch),
// library: {list(personId), put(beat), remove(id)} for every saved beat,
// the scratch included (scratch.js tells them apart),
// addClip({label, blob}) to add a rendered beat to the board as a sound.
export function createSequencer(deps) {
  const { el, audio, meter } = deps;
  el.playhead = document.createElement('div');
  el.playhead.className = 'seq-playhead';
  el.playhead.setAttribute('aria-hidden', 'true');
  window.addEventListener('resize', () => drawPlayhead());
  let pattern = null;
  let advanced = getSetting('advancedBeats');
  // The old Settings choice: only for beats saved before each beat had its own.
  let oldSignature = getSetting('timeSignature');
  let timer = 0;
  let raf = 0;
  let t0 = 0;            // when the beat started, on the audio clock
  let clocks = [];       // per row: {next, step}, the row's next step and when it plays
  let queue = [];        // scheduled {row, step, time}, for moving the playhead
  let shown = [];        // per row: the step its playhead is on, or -1
  let voices = [];       // per row: its sounding voices ({src, gain, end})
  let ringing = [];      // a beat's voices after a chip switched away from it, still ringing out
  let stats = null;      // this play's numbers, logged when it stops
  const ready = new Map();   // clip id -> {buffer, duration}, for scheduling without awaiting
  const pills = [];          // pills[row][step]
  const cell = { row: 0, step: 0 };  // the one pill in the Tab order; arrow keys move it
  let speakers = null;       // the rows' speakers and their loudness popover (set once the rows listen)
  let rowMenus = null;       // the header lines' ⋯ menus (overflow.js), and
  let rowRoom = null;        // what decides they show: a line short of room
  let mixer = null;          // the 🎚️ Mixer sheet (mixer.js), set once the rows listen

  const playing = () => timer !== 0;
  const baseStep = () => 60 / shape().bpm / STEPS_PER_BEAT;
  // With advanced beats off the beat maker is the simple one: 4/4, every row
  // on the beat, whatever the rows have stored for later. 🔔 Overlap plays at
  // every level (Ben, 2026-10-12).
  const playMode = () => (advanced ? 'speed' : 'plain');
  // A beat plays in its own signature in either mode; only choosing one needs Advanced.
  const sigOf = () => (pattern ? pattern.signature || (advanced ? oldSignature : '4/4') : '4/4');
  const groups = () => SIGNATURES[sigOf()] || SIGNATURES['4/4'];
  const bar = () => groups().reduce((a, b) => a + b, 0);
  const rings = (row) => row.ring;
  const total = () => bar() * shape().bars;   // the whole beat, every bar
  const countOf = () => total();   // every row has the whole beat's pills
  const swingNow = () => (advanced && pattern ? pattern.swing || 0 : 0);  // simple mode always plays straight
  const STOPS = tempoStops();
  // Puts the slider and the number in step with the tempo (the open beat's, or the loose one).
  function showTempo({ slider = true } = {}) {
    if (slider) el.bpm.value = stopFor(shape().bpm, STOPS);
    el.bpm.setAttribute('aria-valuetext', `${shape().bpm} BPM`);
    el.bpmOut.textContent = `${shape().bpm} BPM`;
    el.bpmOut.setAttribute('aria-label', `Tempo ${shape().bpm} BPM. Tap to type a tempo.`);
  }
  function setTempo(bpm) {
    const was = shape().bpm;
    shape().bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    retime(was);
    showTempo();
    save();
    deps.onTempo?.();
  }

  // A tempo change while the beat plays (retimeAt): from the first moment
  // not yet booked, every row, the click and t0 move to the new tempo, so
  // they stay together and taps keep snapping to the right pill.
  function retime(oldBpm) {
    const bpm = shape().bpm;
    if (!playing() || !(oldBpm > 0) || oldBpm === bpm) return;
    const anchor = Math.min(clickNext, ...clocks.filter(Boolean).map((c) => c.next));
    const move = retimeAt(anchor, oldBpm, bpm);
    t0 = move(t0);
    clickNext = move(clickNext);
    for (const c of clocks) if (c) c.next = move(c.next);
    for (const k of skips) if (k.at >= anchor) k.at = move(k.at);
    if (queued) queued.at = move(queued.at);   // still the next bar line, at the new tempo
  }

  // Where the beat is, for pads that loop in time: the audio-clock time of the
  // next bar's "1" (at least a moment away) and the length of a beat. Counted
  // from a row on the plain clock, so tempo changes made while playing are
  // included; null when the beat is stopped.
  function grid() {
    if (!playing()) return null;
    const now = audio.context().currentTime + 0.02;
    const base = baseStep();
    const barLen = bar();
    const i = pattern.rows.findIndex((r) => stepSeconds(pattern, r, playMode()) === base);
    const clock = clocks[i];
    let next;
    if (clock) {
      next = clock.next + ((barLen - (clock.step % barLen)) % barLen) * base;
    } else {
      next = t0 + Math.ceil(Math.max(0, now - t0) / (barLen * base)) * barLen * base;
    }
    while (next < now) next += barLen * base;
    return { next, beat: base * STEPS_PER_BEAT };
  }

  // A backup or older sounds being loaded changes settings before the people are
  // in place (`deps.ready`): the beat is drawn again once they are.
  const drawable = () => personId && deps.ready?.() !== false;
  onSetting('advancedBeats', (value) => { advanced = value; if (drawable()) render(); });
  onSetting('timeSignature', (value) => { oldSignature = value; if (drawable()) render(); });

  function prepare(clip) {
    if (!clip) return Promise.resolve();
    return audio.load(clip).then((loaded) => { ready.set(clip.id, loaded); }, () => {});
  }

  // One open beat per person (ADR 0017, replacing ADR 0008's one per
  // screen for beats). `slot` is the view showing it: 'beats' (Beats),
  // 'dj' (Beats with ⌨️ Keys on: a groove opens stopped) or 'live' (🎤
  // Live, which has no open beat: its ⏲️ follows the loose tempo). `doc`
  // is the open beat as last read: {pattern, seen}, `seen` its library
  // record, read again when a view shows. With nothing else open the
  // person's scratch beat is (ADR 0020): it saves itself like any beat but
  // is never listed, and 💾 Keep makes it a beat of its own. A named beat
  // open is in IndexedDB `patterns`; the scratch open is no record there.
  let personId = null;
  let slot = 'beats';
  let doc = null;
  const LOOSE = { bpm: DEFAULT_BPM, bars: 1 };     // the click track's tempo while nothing is open (not saved)
  const shape = () => pattern ?? LOOSE;     // what the click and the clock follow

  // The same person again (a cloud sync or a loaded backup redraws whoever
  // is showing): a beat playing carries on, and the keys view's recording
  // into it with it, and the open beats are read again when it stops. A
  // sync used to stop the beat mid-recording (Ben, 2026-10-12).
  let readAgain = false;
  // A groove just loaded into the scratch (pickGroove, below), until the
  // beat changes: {groove, replaced, before, scratchBefore}, or null. The
  // keys view shows a line for it with ↩️ My beat (undoLoad).
  let loaded = null;
  // A name typed into the scratch's title (Ben, 2026-10-16): the scratch
  // keeps itself under it, at once if it has rows, else the moment it gets
  // one (save). Another beat, person or 🆕 New forgets it.
  let wantedName = null;
  function setPerson(id) {
    if (id === personId && playing()) { readAgain = true; return; }
    readAgain = false;
    stop();
    personId = id;
    loaded = null;
    wantedName = null;
    doc = fromStore();
    if (doc.link) { pattern = doc.pattern; save(); }
    pattern = slot === 'live' ? null : doc.pattern;
    render();
  }

  // Every beat of the person's, the scratch too; `library()` is the ones
  // listed in 🗂️ My beats and the chips.
  const allBeats = () => deps.library.list(personId);
  const library = () => allBeats().filter((b) => !isHiddenBeat(b));
  const freshName = () => (deps.beatName ? deps.beatName(library().map((b) => b.name)) : `Beat ${library().length + 1}`);
  // The scratch as stored, or null before its first change.
  const scratchSaved = () => scratchOf(allBeats(), personId);
  // The scratch to open: as stored, or empty (not saved until it changes).
  function scratchPattern() {
    const saved = scratchSaved();
    if (saved) return { ...cleanPattern(saved, personId), id: saved.id, name: saved.name || SCRATCH_NAME };
    return { ...cleanPattern({ rows: [] }, personId), id: scratchId(personId), signature: '4/4', name: SCRATCH_NAME };
  }
  const scratchDoc = () => ({ pattern: scratchPattern(), seen: scratchSaved() });
  const onScratch = () => !!pattern && isScratch(pattern);
  // What the title shows: the name, or the scratch's label (or the name typed for it).
  const titleOf = () => (onScratch() ? wantedName ?? scratchLabel(pattern) : pattern.name);

  // The stored open beat: the library's copy of the beat it names, or the
  // scratch. Beats stored the whole beat before ADR 0008: one with notes
  // that is not in the library joins it (`link`); an empty one that never
  // joined was made by the app, not the kid, so the scratch opens.
  function fromStore() {
    const stored = deps.opened(personId);
    if (!stored) return scratchDoc();
    const saved = stored.id && library().find((b) => b.id === stored.id);
    if (saved) return { pattern: cleanPattern(saved, personId), seen: saved };
    if (isHiddenBeat(stored) || !Array.isArray(stored.rows) || !stored.rows.some((r) => Array.isArray(r?.steps) && r.steps.some(Boolean))) {
      deps.setOpen(personId, null);
      return scratchDoc();
    }
    const p = cleanPattern(stored, personId);
    if (!p.id) {
      const same = p.name && library().find((b) => b.name === p.name);
      p.id = same?.id ?? newId('beat');
    }
    p.name ||= freshName();
    return { pattern: p, seen: null, link: true };
  }

  // Shows the open beat in a view ('beats', 'dj' or 'live'), read again
  // from the library if it changed there (a sync, a backup, a share's
  // remix, 🧸 Kids' squares in the scratch) or went (deleted: then the
  // scratch opens). Live has none.
  function show(which) {
    if (which !== slot) { stop(); offerUndo(null); speakers?.close(); rowMenus?.close(); slot = which; }
    if (doc && isScratch(doc.pattern)) {
      if (scratchSaved() !== doc.seen) { doc = scratchDoc(); loaded = null; }
    } else if (doc) {
      const saved = library().find((b) => b.id === doc.pattern.id);
      if (!saved) { doc = scratchDoc(); deps.setOpen(personId, null); }
      else if (saved !== doc.seen) doc = { pattern: cleanPattern(saved, personId), seen: saved };
    }
    pattern = slot === 'live' ? null : doc?.pattern ?? null;
    render();
  }

  // 🆕 New (Ben, 2026-10-12: "an entirely blank beat screen"): the beat
  // stops and the scratch opens, blank: no rows, the tempo and bars a new
  // beat has. Nothing joins 🗂️ My beats; only 💾 Keep adds one. A named beat
  // open stays there as it is (it saved itself). A scratch with rows that
  // it empties is said in a line with Undo, as a groove replacing it is:
  // Undo brings it back, and the beat open before. With ⌨️ Keys on the line
  // is the keys' own (deps.offerKeysUndo).
  function newScratch() {
    stop();   // first: a recording ending saves its hits into the beat it was in
    const old = scratchSaved();
    const was = { before: pattern ? structuredClone(pattern) : null, scratchBefore: old ? structuredClone(old) : null, fresh: true };
    offerUndo(null);
    if (old) deps.library.remove(old.id);
    openBeat(null, { resume: false });
    const cleared = (old?.rows ?? []).length > 0;
    logEvent('beat', { action: 'new', replaced: cleared });
    if (!cleared) deps.announce?.('A blank scratch beat.');
    else if (slot === 'dj') deps.offerKeysUndo?.(FRESH_TEXT, () => undoLoad(was));
    else offerUndo({ ...was, pattern });
  }

  // Saves the open beat into the library and keeps it as the open one (the
  // scratch is open when `patterns` has no record). Any change ends a
  // groove's "just loaded" line: the kid has started on it.
  function save() {
    if (!pattern) return;
    loaded = null;
    const before = allBeats().find((b) => b.id === pattern.id);
    const record = { ...structuredClone(pattern), created: before?.created ?? Date.now(), saved: Date.now() };
    if (isPinned(before)) record.pinned = before.pinned;   // a 📌 stays as the beat changes
    deps.library.put(record);
    doc = { pattern, seen: record };
    deps.setOpen(personId, isScratch(pattern) ? null : pattern);
    // A named scratch keeps itself once it has a row: after the change that
    // gave it one has finished drawing.
    if (wantedName && isScratch(pattern) && pattern.rows.length) queueMicrotask(() => { if (wantedName) keep(); });
  }

  // 💾 Keep (ADR 0020): the scratch becomes a beat of its own in 🗂️ My beats,
  // which is the open beat now, and the scratch starts empty again. It takes
  // a name typed into its title; else one from a groove is named after it
  // ("Sleepy Squid (Ska version)", names.js keptName), and a plain one gets
  // a fun name. A beat playing carries on.
  function keep() {
    if (!onScratch() || !pattern.rows.length || chipsLocked) return;
    const taken = library().map((b) => b.name);
    const groove = grooveOf(pattern);
    const name = wantedName ? uniqueName(wantedName, null)
      : groove && deps.keptName ? deps.keptName(groove.name, taken) : freshName();
    wantedName = null;
    const old = scratchSaved();
    offerUndo(null);
    pattern = { ...pattern, id: newId('beat'), name };
    save();
    if (old) deps.library.remove(old.id);
    logEvent('beat', { action: 'keep', groove: !!groove });
    render();
    deps.onBeatChange?.();
    deps.announce?.(`Kept as “${name}” in 🗂️ My beats. Your scratch beat is empty again.`);
  }

  // ── The beat bar (Beats and DJ): the open beat's name, 🆕 New, 🗂️ My beats ──
  // The scratch shows "Scratch beat" (or "Ska (scratch)"), in italics: not
  // kept yet. 💾 Keep stands where ✏️ is and names it as it keeps it; a
  // name typed into the title keeps it under that name (nameScratch).
  function showBeatBars() {
    const scratch = onScratch();
    for (const bar of el.beatBars ?? []) {
      const name = bar.querySelector('[data-beat-name]');
      name.hidden = !pattern;
      name.classList.toggle('scratch', scratch);
      name.setAttribute('aria-label', scratch ? 'Scratch beat, not kept yet: type a name to keep it in 🗂️ My beats' : 'Beat name (tap to rename)');
      bar.querySelector('[data-beat-rename]').hidden = !pattern || scratch;
      const keepButton = bar.querySelector('[data-beat-keep]');
      if (keepButton) {
        keepButton.hidden = !scratch;
        keepButton.disabled = !pattern?.rows.length || chipsLocked;
      }
      if (pattern && document.activeElement !== name) name.value = titleOf();
    }
    showChips();
  }

  // ── Pattern chips (Ben, 2026-10-12, after a music studio's pattern picker) ──
  // Under the beat bar, ⌨️ Keys off and on: 8 numbered spots, pinned beats
  // first, then the most recently used, in one order that a tap never
  // changes (chipBeats). The open one is pressed. A tap opens that beat (ADR
  // 0017). While the beat plays, the switch waits for the next bar line
  // (`queued`), so the music never stops; the chip says it is waiting.
  let queued = null;        // {id, at}: the beat opening at the next bar line, while playing
  let chipsLocked = false;  // The keys view recording: the chips wait
  function showChips() {
    const beats = personId ? chipBeats(library()) : [];
    // Only the open beat to show: nothing to switch to.
    const none = !beats.length || (beats.length === 1 && beats[0].id === pattern?.id);
    for (const line of el.chipLines ?? []) {
      line.hidden = none;
      line.replaceChildren(...(none ? [] : beats.map((b, n) => chipFor(b, n + 1))));
    }
  }
  // A chip: its spot's number (studios number their patterns), a 📌 when
  // pinned, and the beat's name.
  function chipFor(beat, n) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'beat-chip';
    chip.dataset.chip = beat.id;
    const open = beat.id === pattern?.id;
    const next = beat.id === queued?.id;
    const name = beat.name || 'Beat';
    chip.setAttribute('aria-pressed', String(open));
    chip.classList.toggle('queued', next);
    chip.disabled = chipsLocked;
    // Its first sound's color, as a stripe: beats tell apart at a glance.
    const clip = deps.clipById(beat.rows?.[0]?.clipId);
    if (clip) chip.style.setProperty('--chip', deps.colorOf(clip));
    const num = document.createElement('span');
    num.className = 'chip-num';
    num.setAttribute('aria-hidden', 'true');
    num.textContent = String(n);
    const text = document.createElement('span');
    text.className = 'chip-name';
    text.textContent = next ? `⏳ ${name}` : name;
    chip.append(num);
    if (isPinned(beat)) {
      const mark = document.createElement('span');
      mark.className = 'chip-pin';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '📌';
      chip.append(mark);
    }
    chip.append(text);
    chip.classList.toggle('pinned', isPinned(beat));
    chip.title = name;
    const pin = isPinned(beat) ? ', pinned' : '';
    chip.setAttribute('aria-label', `${n}: ${open ? `${name}, open now` : next ? `${name}: starts at the next bar` : `Open ${name}`}${pin}`);
    return chip;
  }
  // A chip tapped: that beat opens, at once when stopped, at the next bar
  // line while playing. The open beat's chip takes back a waiting switch.
  function pickChip(id) {
    if (chipsLocked) return;
    if (id === pattern?.id) { if (queued) { queued = null; showChips(); } return; }
    const saved = library().find((b) => b.id === id);
    if (!saved) return;
    if (!playing()) { openBeat(cleanPattern(saved, personId)); return; }
    queued = { id, at: nextBarLine() };
    for (const r of saved.rows ?? []) prepare(deps.clipById(r.clipId));   // ready by the bar line
    showChips();
    deps.announce?.(`“${saved.name}” starts at the next bar.`);
  }
  // The next bar line far enough ahead that nothing after it is booked yet.
  function nextBarLine() {
    const now = audio.context().currentTime;
    const barLen = bar() * baseStep();
    let at = grid()?.next ?? now;
    while (at < now + LOOKAHEAD + 0.01) at += barLen;
    return at;
  }
  // The bar line has come: the chosen beat takes over from its first pill,
  // on the same clock, so it carries on without a gap. What the old beat
  // still rings out goes on ringing (■ Stop fades it too).
  function switchNow() {
    const { id, at } = queued;
    queued = null;
    const saved = library().find((b) => b.id === id);
    if (!saved) { showChips(); return; }
    const now = audio.context().currentTime;
    const after = Math.round((at - t0) / (bar() * baseStep()));   // bars the old beat played
    ringing = [...ringing, ...voices.flat()].filter((v) => !(v.end <= now));
    pattern = cleanPattern(saved, personId);
    save();
    t0 = at;
    clocks = pattern.rows.map(() => ({ next: at, step: 0 }));
    voices = pattern.rows.map(() => []);
    shown = pattern.rows.map(() => -1);
    queue = [];
    clickNext = at;
    clickBeat = 0;
    logEvent('beat', { action: 'switch', bpm: pattern.bpm, bars: pattern.bars, after });
    render();
    deps.onBeatChange?.();
    deps.onTempo?.();
  }
  // The keys view locks the chips while it records into the beat.
  function lockChips(on) {
    if (chipsLocked === !!on) return;
    chipsLocked = !!on;
    if (on) queued = null;
    showBeatBars();   // 💾 Keep waits too
    if (!on && wantedName) queueMicrotask(keep);   // so does a named scratch
  }
  for (const line of el.chipLines ?? []) {
    line.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (chip) pickChip(chip.dataset.chip);
    });
  }
  // Switches this screen to another beat (opened, new, or a groove), or to
  // the scratch (null: as it is stored), carrying on playing if it was, and
  // tells the keys. `resume`: carry on playing if something was (🗂️ My beats,
  // Undo); 🆕 New stops playback instead (Ben, 2026-10-11).
  function openBeat(next, { resume = true } = {}) {
    const was = playing();
    queued = null;
    stop();
    loaded = null;
    wantedName = null;
    if (next && !isScratch(next)) { pattern = next; save(); }
    else { doc = scratchDoc(); pattern = doc.pattern; deps.setOpen(personId, null); }
    render();
    deps.onBeatChange?.();
    if (resume && was) play();
  }
  // A beat deleted in 🗂️ My beats closes if it was the open one: the scratch opens.
  function closeEverywhere(id) {
    if (doc?.pattern.id === id || pattern?.id === id) openBeat(null);
  }
  // A name no other beat of this person's has.
  function uniqueName(name, exceptId) {
    const taken = new Set(library().filter((b) => b.id !== exceptId).map((b) => b.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const tail = ` ${n}`;
      const candidate = name.slice(0, 24 - tail.length) + tail;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }
  // A name typed into the scratch's title: kept under it now if it has
  // rows; an empty scratch holds the name until its first row (save).
  function nameScratch(wanted) {
    if (wanted === titleOf()) return;
    wantedName = wanted;
    if (pattern.rows.length) keep();
    else deps.announce?.(`Named “${wanted}”. It goes in 🗂️ My beats when you add a sound.`);
  }
  for (const bar of el.beatBars ?? []) {
    const name = bar.querySelector('[data-beat-name]');
    name.addEventListener('change', () => {
      const wanted = name.value.trim().slice(0, 24);
      if (wanted && pattern && onScratch()) nameScratch(wanted);
      else if (wanted && pattern) { pattern.name = uniqueName(wanted, pattern.id); save(); }
      if (pattern) name.value = titleOf();   // still focused while it changes
      showBeatBars();
      deps.onBeatChange?.();
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    // "Scratch beat" is all chosen, so typing replaces it.
    name.addEventListener('focus', () => { if (onScratch() && !wantedName) name.select?.(); });
    bar.querySelector('[data-beat-rename]').addEventListener('click', () => { name.focus(); name.select?.(); });
    bar.querySelector('[data-beat-new]').addEventListener('click', newScratch);
    bar.querySelector('[data-beat-open]').addEventListener('click', () => openLibrary(bar.querySelector('[data-beat-open]')));
    bar.querySelector('[data-beat-keep]')?.addEventListener('click', () => keep());
  }

  // ── Playback ──

  // `countIn`: one bar of clicks first, so the beat (and a DJ recording)
  // starts on the next "1".
  async function play({ countIn = false } = {}) {
    if (playing() || !pattern) return;
    deps.onPlay?.();   // a song playing stops: one thing plays at a time
    const ctx = audio.wake();
    ready.clear();  // a sound's voice may have changed since the last play
    const asked = pattern;
    await Promise.all(pattern.rows.map((r) => prepare(deps.clipById(r.clipId))));
    if (playing() || pattern !== asked) return;   // stopped, or another beat opened, while its sounds loaded
    queue = [];
    t0 = ctx.currentTime + 0.05;
    if (countIn) {
      let at = t0;
      groups().forEach((size, b) => { blip(at, b === 0); at += size * baseStep(); });
      t0 = at;
    }
    clickNext = t0;
    clickBeat = 0;
    clickOn = clickOverride ?? clickWanted;
    clocks = pattern.rows.map(() => ({ next: t0, step: 0 }));
    voices = pattern.rows.map(() => []);
    shown = pattern.rows.map(() => -1);
    stats = { started: performance.now(), hits: 0, cuts: 0, maxRinging: 0, limiterDb: 0 };
    logEvent('beat', { action: 'play', bpm: pattern.bpm, bars: pattern.bars, advanced, mode: playMode(), signature: sigOf(), rows: pattern.rows.map(rowSummary) });
    timer = setInterval(schedule, TICK_MS);
    deps.onTempo?.();  // before the first schedule, so pads already looping join on the first "1"
    schedule();
    raf = requestAnimationFrame(follow);
    showPlayKeys(true);
  }
  // ▶ Play on Beats and in the keys view (el.djPlay): ■ Stop while playing.
  function showPlayKeys(on) {
    for (const b of [el.play, el.djPlay]) {
      if (!b) continue;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '■ Stop' : '▶ Play';
    }
    roll?.showPlay();
  }

  // A groove loaded with ⌨️ Keys on stays in the scratch when it stops.
  function stop() {
    growHook = null;
    // A chip waiting for the bar line is taken back: a tap on it now opens it at once.
    if (queued) { queued = null; showChips(); }
    if (!playing()) return;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    timer = 0;
    raf = 0;
    skips = [];
    const now = audio.context().currentTime;
    for (const list of voices) for (const v of list) fadeStop(v, now);
    for (const v of ringing) fadeStop(v, now);
    voices = [];
    ringing = [];
    queue = [];
    shown = shown.map(() => -1);
    showSteps();
    if (stats) {
      logEvent('beat', { action: 'stop', seconds: Math.round((performance.now() - stats.started) / 100) / 10,
        hits: stats.hits, cuts: stats.cuts, maxRinging: stats.maxRinging, limiterDb: Math.round(stats.limiterDb * 10) / 10 });
      stats = null;
    }
    showPlayKeys(false);
    if (readAgain) setPerson(personId);
    deps.onStop?.();   // The keys view's recording ends with the beat, whatever stopped it
  }

  // A row added while playing joins on the beat's grid: at the next step of
  // the beat, on the step it would be at had it been there from the start.
  // It takes the place of a row already playing at its speed, so it lines up
  // whatever happened since the start: counting from t0 at today's tempo put
  // a row joining after a tempo change on the wrong pill (Ben, 2026-10-11:
  // two rows out of sync). Only with no such row does it count from t0.
  function joinClock(i) {
    const mine = stepSeconds(pattern, pattern.rows[i], playMode());
    const j = clocks.findIndex((c, k) => c && k !== i && pattern.rows[k] && stepSeconds(pattern, pattern.rows[k], playMode()) === mine);
    if (j >= 0) return { next: clocks[j].next, step: clocks[j].step % countOf(i) };
    const base = baseStep();
    const k = Math.max(0, Math.ceil((audio.context().currentTime - t0) / base));
    return { next: t0 + k * base, step: k % countOf(i) };
  }

  // ── The click: a short blip on every beat, higher on the "1". Never
  // recorded, never rendered. On while the keys records into the beat. ──
  let clickOn = false;
  let clickNext = 0;
  let clickBeat = 0;
  function blip(at, one) {
    const ctx = audio.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = one ? 1500 : 1000;
    gain.gain.setValueAtTime(0.25, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(at);
    osc.stop(at + 0.04);
  }
  // Pills a live DJ hit already played, so the beat must not play them again.
  let skips = [];   // [{row, at}]

  // The click follows the beat's groups (4/4: four beats; 6/8: two).
  function scheduleClicks(on, until = audio.context().currentTime + LOOKAHEAD) {
    const ctx = audio.context();
    // Fallen behind (the beat stopped, or the tab slept): start again now
    // rather than play every missed tick at once.
    // While the beat plays, the ticks it missed are skipped along its grid
    // instead, so the click (and the keys view's growing, which counts on it)
    // stays on the beat after a stall.
    if (playing()) {
      while (clickNext < ctx.currentTime - 0.05) { clickNext += groups()[clickBeat % groups().length] * baseStep(); clickBeat++; }
    } else if (clickNext < ctx.currentTime - 0.05) { clickNext = ctx.currentTime + 0.05; clickBeat = 0; }
    // Off, it still keeps its place on the beat, so turning it on lands on time.
    while (clickNext < until) {
      const g = groups();
      const b = clickBeat % g.length;
      // The last beat of the whole beat is being booked: the keys view may
      // grow it now, a beat before the rows' wrap is booked (setGrow).
      // (Counted in pills from t0, which a tempo change keeps right.)
      if (growHook && playing() && Math.round((clickNext - t0) / baseStep()) % total() === total() - g.at(-1) && growHook()) grow();
      if (on) blip(clickNext, b === 0);
      clickNext += g[b] * baseStep();
      clickBeat++;
    }
  }
  // The click on its own, with the beat stopped (the keys' Live): the
  // open beat's tempo and time signature. While the beat plays, its own
  // schedule ticks instead.
  let aloneTimer = 0;
  // Growing while recording (the keys view): `growHook()` is asked once per
  // pass, as the last beat starts; true doubles the bars (1 → 2 → 4), the
  // new bars a copy of the beat so far (multiplyRows). The rows' clocks
  // read the bars every pill, so the playhead carries on into the new bars.
  let growHook = null;
  const setGrow = (fn) => { growHook = typeof fn === 'function' ? fn : null; };
  function grow() {
    const bars = (pattern?.bars || 1) * 2;
    if (!pattern || !BAR_CHOICES.includes(bars)) return;
    const from = total();
    pattern.rows = multiplyRows(pattern.rows, from, from * 2);
    pattern.bars = bars;
    save();
    render();
  }
  // Where the click's next tick goes, with the beat stopped (DJ's tap tempo:
  // one beat after the last tap). While the beat plays it keeps the beat's place.
  function clickAt(at) {
    if (playing() || !Number.isFinite(at)) return;
    clickNext = at;
  }
  function metronome(on) {
    clearInterval(aloneTimer);
    aloneTimer = 0;
    if (!on) return;
    aloneTimer = setInterval(() => { if (!playing()) scheduleClicks(true); }, TICK_MS);
  }

  function schedule() {
    const ctx = audio.context();
    // A beat picked on a chip opens at the next bar line (switchNow): nothing
    // of this beat is booked from there on. A millisecond short of it, so a
    // clock that summed to just under the line books no extra pill.
    const until = queued ? Math.min(ctx.currentTime + LOOKAHEAD, queued.at - 0.001) : ctx.currentTime + LOOKAHEAD;
    scheduleClicks(clickOn, until);
    if (skips.length) skips = skips.filter((k) => k.at > ctx.currentTime - 1);   // a skip whose moment passed
    pattern.rows.forEach((row, i) => {
      const clock = clocks[i] ??= joinClock(i);
      voices[i] ??= [];
      while (clock.next < until) {
        if (clock.step >= countOf(i)) clock.step = 0;  // the row got shorter while playing
        // Swing moves when a pill sounds (and lights), never the clock itself.
        const at = clock.next + swingDelay(clock.step, stepSeconds(pattern, row, playMode()), swingNow());
        const dt = stepSeconds(pattern, row, playMode());
        const skip = skips.findIndex((k) => k.row === i && Math.abs(k.at - clock.next) < dt / 2);
        if (skip >= 0) skips.splice(skip, 1);
        else if (audible(row, pattern)) {
          // A tune row's notes start on the pill or half a pill after it (notes.js).
          for (const h of pillHits(row, clock.step)) hit(i, h.at ? clock.next + h.at * dt : at, h.loud, h.note, h.len * dt);
        }
        queue.push({ row: i, step: clock.step, time: at });
        clock.next += stepSeconds(pattern, row, playMode());  // read every step, so a tempo change lands right away
        clock.step = (clock.step + 1) % countOf(i);
      }
    });
    queue.sort((a, b) => a.time - b.time);
    meter.run();  // the speaker grille follows the beat
    if (queued && ctx.currentTime + LOOKAHEAD >= queued.at) { switchNow(); schedule(); }
  }

  // Plays row i's sound at `time` into `dest`. Its earlier hits still sounding
  // fade out at `time`, unless the row rings, when they overlap (up to
  // MAX_RINGING, oldest faded first). Returns how many it cut off.
  // A tune row's note (ADR 0023) plays the sound faster or slower, as a
  // sampler does, so higher notes are also shorter; a sound whose note was
  // found (🎵 Find its note, its `root`) is moved so its C plays a C. The
  // note lasts `len` seconds, then fades out (a sound shorter than that
  // ends sooner). A tune row's notes overlap, so it can play chords.
  function sound(ctx, dest, list, row, loaded, time, loud = false, note = 0, len = 0) {
    const voice = makeVoice(ctx, loaded.buffer, dest);
    voice.lift = loud ? ACCENT_GAIN : 1;   // kept, so a level change can reach a hit still ringing
    voice.level = hitGain(row, loud);
    voice.gain.gain.value = voice.level;
    const rate = noteRate(note + (row.melody ? rootShift(deps.clipById(row.clipId)?.root) : 0));
    if (rate !== 1) voice.src.playbackRate.value = rate;
    voice.src.start(time, 0, loaded.duration);
    voice.end = time + loaded.duration / rate;
    if (len > 0 && time + len < voice.end) {
      fadeStop(voice, time + len);
      voice.end = time + len;
    }
    const { keep, cut } = ringOver(list, time, rings(row) || row.melody);
    for (const v of cut) fadeStop(v, time);
    list.splice(0, list.length, ...keep, voice);
    return cut.length;
  }

  // ── The mix (mixer.js): each beat plays through its rows' effects and the
  // master's, one graph per beat and destination, built again when its
  // effects change. The master's level is set on every use, so a fader moved
  // while playing is heard at once. A graph put aside rings out first.
  const buses = new WeakMap();   // dest -> WeakMap(beat -> graph)
  function busFor(ctx, dest, p) {
    let made = buses.get(dest);
    if (!made) buses.set(dest, (made = new WeakMap()));
    let bus = made.get(p);
    if (!bus || bus.key !== mixKey(p)) {
      const old = bus;
      try { bus = buildMix(ctx, dest, p); } catch { bus = { key: mixKey(p), master: null, input: () => dest, dispose() {} }; }
      made.set(p, bus);
      if (old && ctx === audio.context()) setTimeout(() => old.dispose(), 6000);
    }
    const gain = bus.master?.gain;
    if (gain) {
      if (ctx === audio.context() && gain.setTargetAtTime) gain.setTargetAtTime(masterLevel(p), ctx.currentTime, 0.02);
      else gain.value = masterLevel(p);
    }
    return bus;
  }

  function hit(i, time, loud, note = 0, len = 0) {
    const row = pattern.rows[i];
    const loaded = ready.get(row.clipId);
    if (!loaded) return;
    const cuts = sound(audio.context(), busFor(audio.context(), audio.master, pattern).input(i), voices[i], row, loaded, time, loud, note, len);
    deps.onHit?.(row.clipId, (time - audio.context().currentTime) * 1000);
    stats.hits++;
    stats.cuts += cuts;
    stats.maxRinging = Math.max(stats.maxRinging, voices[i].length);
  }

  function follow() {
    const now = audio.context().currentTime;
    let changed = false;
    while (queue.length && queue[0].time <= now) {
      const { row, step } = queue.shift();
      if (shown[row] !== step) { shown[row] = step; changed = true; }
    }
    if (changed) { showSteps(); deps.onSteps?.(shown); }
    // How hard the limiter is holding the output down (dB, negative): the
    // event log keeps the worst, a sign that sounds stacked up.
    if (stats && audio.limiter) stats.limiterDb = Math.min(stats.limiterDb, audio.limiter.reduction || 0);
    raf = requestAnimationFrame(follow);
  }

  function showSteps() {
    pills.forEach((row, i) => {
      for (const p of row) p.classList.toggle('now', Number(p.dataset.step) === shown[i]);
    });
    drawPlayhead();
    roll?.step(shown);
  }

  // The playhead: a bar down through every row at the step being played.
  // When the rows are in step and each fits on one line, it is one bar from
  // the first row to the last. When rows run at different tempos, or a phone
  // wraps each row onto two lines of 8, it is a short bar on each row's
  // playing pill instead.
  function drawPlayhead() {
    // Collapsed rows have no pills on screen, so the bar skips them.
    const current = pills.map((row, i) => (shown[i] >= 0 && row.length ? row[shown[i]] : null)).filter(Boolean);
    if (!current.length) { el.playhead.replaceChildren(); return; }
    const box = el.rows.getBoundingClientRect();
    const rects = current.map((p) => p.getBoundingClientRect());
    const first = pills.find((row) => row.length).filter((p) => !p.hidden);
    const wrapped = first[0].getBoundingClientRect().top !== first[first.length - 1].getBoundingClientRect().top;
    const centre = (r) => r.left + r.width / 2;
    const aligned = rects.every((r) => Math.abs(centre(r) - centre(rects[0])) < 1);
    const spans = wrapped || !aligned
      ? rects.map((r) => [centre(r), r.top - 6, r.bottom + 6])
      : [[centre(rects[0]), rects[0].top - 6, rects[rects.length - 1].bottom + 6]];
    el.playhead.replaceChildren(...spans.map(([x, top, bottom]) => {
      const bar = document.createElement('div');
      bar.className = 'seq-bar';
      bar.style.left = `${x - box.left}px`;
      bar.style.top = `${top - box.top}px`;
      bar.style.height = `${bottom - top}px`;
      return bar;
    }));
  }

  // A row in one line, for the event log.
  function rowSummary(row) {
    const clip = deps.clipById(row.clipId);
    // The label stays in this device's log; a problem report sends only `kind` (log-clean.js).
    return { sound: clip?.label ?? null, kind: soundKind(clip), voice: clip?.voice ?? null, pills: row.steps.filter(Boolean).length,
      rate: row.rate, ring: row.ring, muted: row.muted, volume: rowLevel(row) };
  }

  // ── Rendering ──

  // Each bar's beat groups on even lines, matched up one above the other
  // (see balancedColumns). Again whenever the rows change width. The pills
  // have the row's whole width under its header line.
  function layoutMeasures() {
    for (const steps of el.rows.querySelectorAll('.seq-steps')) {
      const width = steps.clientWidth;
      if (!width) continue;
      const measures = [...steps.querySelectorAll('.seq-measure')].filter((m) => !m.hidden);
      const sizesOf = (m) => [...m.children].filter((g) => !g.hidden).map((g) => Number(g.style.getPropertyValue('--size')) || 4);
      const across = measures.length ? barsPerLine(sizesOf(measures[0]), measures.length, width) : 1;
      steps.style.gridTemplateColumns = across > 1 ? `repeat(${across}, minmax(0, 1fr))` : '';
      steps.classList.toggle('bars-across', across > 1);
      const each = across > 1 ? (width - (across - 1) * 24) / across : width;
      for (const measure of measures) {
        measure.style.gridTemplateColumns = balancedColumns(sizesOf(measure), each).map((s) => `minmax(0, ${s}fr)`).join(' ');
      }
    }
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => layoutMeasures()).observe(el.rows);

  function render() {
    el.bpm.min = 0;
    el.bpm.max = STOPS.length - 1;
    showBeatBars();
    showClick();
    // No person yet, or 🎤 Live: no beat, so the deck and rows go. (Beats
    // always has one: the scratch when nothing else is open, ADR 0020.)
    for (const node of [el.top, el.controls, el.rows]) if (node) node.hidden = !pattern;
    if (!pattern) {
      pills.length = 0;
      el.rows.replaceChildren(el.playhead);
      roll?.close();
      el.add.hidden = true;
      if (el.addTune) el.addTune.hidden = true;
      el.empty.hidden = true;
      el.noRows.hidden = true;
      if (undo && undo.pattern !== pattern) offerUndo(null);
      return;
    }
    showTempo();
    showSwing();
    for (const b of el.bars.querySelectorAll('[data-bars]')) b.setAttribute('aria-pressed', String(Number(b.dataset.bars) === pattern.bars));
    for (const b of el.sigs.querySelectorAll('[data-sig]')) b.setAttribute('aria-pressed', String(b.dataset.sig === sigOf()));
    el.shape.hidden = !advanced;   // time signature and swing: Advanced
    deps.onShape?.();
    // Rows can use any person's sounds, so the beat maker only needs one
    // sound somewhere, not on this board.
    const clips = deps.groups().flatMap((g) => g.clips);
    cell.row = Math.min(cell.row, Math.max(0, pattern.rows.length - 1));
    // The one pill in the Tab order must be on an open row.
    if (pattern.rows[cell.row]?.collapsed) {
      const open = pattern.rows.findIndex((r) => !r.collapsed);
      if (open >= 0) cell.row = open;
    }
    pills.length = 0;
    twins = twinRows(pattern.rows.map((r) => deps.clipById(r.clipId)?.emoji || '🔊'));
    el.rows.replaceChildren(el.playhead, ...pattern.rows.map((row, i) => renderRow(row, i, clips)));
    el.add.hidden = pattern.rows.length >= MAX_ROWS;
    el.add.disabled = clips.length === 0;
    if (el.addTune) { el.addTune.hidden = el.add.hidden; el.addTune.disabled = el.add.disabled; }
    el.empty.hidden = clips.length > 0;
    el.noRows.hidden = clips.length === 0 || pattern.rows.length > 0;
    if (undo && undo.pattern !== pattern) offerUndo(null);
    layoutMeasures();
    drawPlayhead();
    speakers?.refresh();   // an open loudness popover follows its row, or closes with it
    rowRoom?.refit();      // a header line short of room shows ⋯ for 🔔 🧹 ✕
    rowMenus?.refresh();   // and an open ⋯ menu shows its row as it is now
    if (mixer?.isOpen()) mixer.render();   // another beat, or a row gone: the open mixer follows
    roll?.refresh();       // and 🎹 the roll, or it closes when its row is gone
  }

  // A pill's look and its spoken state: off, on, or on and loud.
  function showPill(p, row, s) {
    const loud = !!(row.steps[s] && row.accents?.[s]);
    p.setAttribute('aria-pressed', String(!!row.steps[s]));
    p.classList.toggle('loud', loud);
    p.setAttribute('aria-label', p.getAttribute('aria-label').replace(/, loud$/, '') + (loud ? ', loud' : ''));
  }

  let twins = new Set();   // rows whose emoji another row shows too: a letter tells them apart
  function renderRow(row, i, clips) {
    const clip = deps.clipById(row.clipId);
    if (row.collapsed) { pills[i] = []; return renderSlimRow(row, i, clip); }
    const wrap = document.createElement('div');
    wrap.className = 'seq-row';
    wrap.dataset.row = i;
    if (clip) wrap.style.setProperty('--pill', deps.colorOf(clip));

    // The emoji and 🔊 · 🧹 · ✕ on the header line, the pills under it
    // (beat-row.js draws the emoji and tools); the emoji opens the sound
    // chooser. The muted look and faint pills follow the speaker.
    const { pick, tools } = rowTools(row, i, clip);
    wrap.classList.toggle('muted', row.muted);
    showMix(wrap, row);
    wrap.style.setProperty('--vol', String(rowLevel(row)));   // a quieter row's pills draw fainter

    const count = countOf(i);
    // A tune row (ADR 0023): its pills are a preview of its notes, lit where
    // a note starts and half lit while one lasts; a tap opens 🎹 the roll.
    const tune = row.melody;
    const held = tune ? heldPills(row) : null;
    wrap.classList.toggle('tune', tune);
    const steps = document.createElement('div');
    steps.className = tune ? 'seq-steps seq-tune' : 'seq-steps';
    const rowPills = [];
    // One block per bar, stacked; in each, one group of pills per beat of the
    // time signature. A group's width follows its pill count, and groups wrap
    // onto more lines when narrow.
    let s0 = 0;
    for (let m = 0; m < pattern.bars; m++) {
    const measure = document.createElement('div');
    measure.className = 'seq-measure';
    measure.hidden = s0 >= count;
    if (pattern.bars > 1) measure.setAttribute('aria-label', `Bar ${m + 1}`);
    groups().forEach((size, b) => {
      const beat = document.createElement('div');
      beat.className = 'seq-beat';
      beat.style.setProperty('--size', size);
      for (let k = 0; k < size; k++) {
        const s = s0 + k;
        const p = document.createElement('button');
        p.type = 'button';
        // The first pill of each beat is a shade brighter, and the first of
        // each bar (the "1") brighter still, so the grid shows its own count.
        p.className = k > 0 ? 'pill' : b > 0 ? 'pill beat-start' : 'pill one';
        p.dataset.step = s;
        p.setAttribute('aria-label', `Row ${i + 1}, ${clip ? clip.label : 'no sound'}: ${pattern.bars > 1 ? `bar ${m + 1}, ` : ''}beat ${b + 1}, part ${k + 1}${tune ? '. A tune: tap to open 🎹 the piano roll' : ''}`);
        p.tabIndex = i === cell.row && s === cell.step ? 0 : -1;
        showPill(p, row, s);
        if (held?.has(s)) p.classList.add('held');
        p.hidden = s >= count;
        if (s === shown[i]) p.classList.add('now');
        beat.append(p);
        rowPills.push(p);
      }
      beat.hidden = s0 >= count;
      measure.append(beat);
      s0 += size;
    });
    steps.append(measure);
    }
    pills[i] = rowPills;
    // A header line, like a list item: ⠿ ▾ emoji and the sound's name at the
    // left, 🔊 · 🧹 · ✕ at the right; the pills use the whole width below it.
    // Every row shows its name, a long one cut short with …, so rows match
    // (Ben, 2026-10-12). The name is the emoji's too: a tap on it does the same.
    const name = document.createElement('span');
    name.className = 'seq-name';
    name.textContent = clip ? clip.label : 'No sound';
    name.setAttribute('aria-hidden', 'true');   // the emoji's label says it
    name.addEventListener('click', () => pick.click());
    wrap.append(header(row, i, [pick, name], tools), steps);
    return wrap;
  }

  // The pills a tune row's notes go on sounding through (not their first).
  function heldPills(row) {
    const out = new Set();
    for (const n of row.tune ?? []) for (let s = Math.floor(n.s) + 1; s < n.s + n.l; s++) out.add(s);
    return out;
  }

  // A row's header line (Ben, 2026-10-12: one line, like a list item): the
  // grip that drags it (once there is somewhere to move), then the button
  // that folds or opens it, then `middle` (the emoji, or a collapsed row's
  // slim name), and the row's 🔊 · 🧹 · ✕ at the right.
  function header(row, i, middle, tools) {
    const head = document.createElement('div');
    head.className = 'seq-head';
    const fold = document.createElement('button');
    fold.type = 'button';
    fold.className = 'seq-fold';
    fold.dataset.fold = i;
    fold.textContent = row.collapsed ? '▸' : '▾';
    fold.setAttribute('aria-expanded', String(!row.collapsed));
    fold.setAttribute('aria-label', `${row.collapsed ? 'Open' : 'Collapse'} row ${i + 1}`);
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'seq-grip';
    grip.dataset.grip = i;
    grip.hidden = pattern.rows.length < 2;
    grip.setAttribute('aria-label', `Move row ${i + 1}: drag it, or use the up and down arrow keys`);
    head.append(grip, fold, ...[middle].flat(), tools);
    return head;
  }

  // A collapsed row: just its header line, with one slim button for the
  // sound's emoji and name in the emoji's place. Tapping the name opens the
  // row again; its speaker shows when it is muted or turned down.
  function renderSlimRow(row, i, clip) {
    const wrap = document.createElement('div');
    wrap.className = 'seq-row collapsed';
    wrap.dataset.row = i;
    wrap.classList.toggle('muted', row.muted);
    showMix(wrap, row);
    if (clip) wrap.style.setProperty('--pill', deps.colorOf(clip));
    const slim = document.createElement('button');
    slim.type = 'button';
    slim.className = 'seq-slim';
    slim.dataset.fold = i;
    slim.textContent = `${clip?.emoji || '🔊'} ${clip ? clip.label : 'No sound'}`;
    slim.setAttribute('aria-label', `Row ${i + 1}: ${clip ? clip.label : 'no sound'}${row.muted ? ', muted' : rowLevel(row) < 1 ? `, loudness ${percent(rowLevel(row))} %` : ''}. Collapsed; tap to open.`);
    wrap.append(header(row, i, slim, rowTools(row, i, clip).tools));
    return wrap;
  }

  // A row's emoji and its 🔔 · 🔊 · 🧹 · ✕, shared with the keys view (beat-row.js). ✕ and 🧹
  // take two taps: the first asks, in red, and the question goes away after a
  // few seconds or any other tap. ✕ has Undo. 🔔 turns the row's Overlap on
  // or off at once. The emoji opens the sound chooser (with advanced beats
  // on, speed is there too); a tune row's opens 🎹 the roll, and wears a small 🎹.
  function rowTools(row, i, clip) {
    const name = clip ? clip.label : 'no sound';
    const twin = twins.has(i);
    const parts = rowParts({
      asked: asking?.row === i ? asking.kind : null,
      ring: ringTool(row, i, name),
      speaker: rowSpeaker(i, levelState(i)),
      canClear: row.steps.some(Boolean),
      emoji: clip ? rowEmoji(clip.emoji || '🔊', twin, [...clip.label][0]?.toUpperCase()) : '➕',
      title: clip ? clip.label : 'Pick a sound',
      data: { remove: { remove: i }, clear: { clear: i }, pick: { pick: i } },
      // Where the header line runs out of room, 🔔 🧹 ✕ move into ⋯ (Ben, 2026-10-12).
      more: { key: i, label: `More for row ${i + 1}: ${row.melody ? '' : 'Overlap, '}Clear, Remove` },
      labels: {
        remove: `Remove row ${i + 1}`, removeAsk: `Tap again to remove row ${i + 1}`,
        clear: row.melody ? `Clear row ${i + 1}: take out all its notes` : `Clear row ${i + 1}: turn off all its pills`, clearAsk: `Tap again to clear row ${i + 1}`,
        pick: row.melody ? `Row ${i + 1}: a tune on ${name}. Tap to open 🎹 the piano roll.` : `Row ${i + 1}: ${name}. Tap to change its sound.`,
      },
    });
    parts.pick.classList.toggle('tune', !!row.melody);
    return parts;
  }

  // A row's 🔔 Overlap for beat-row.js, here and in the keys view. A tune
  // row's notes always overlap (chords), so it has none.
  function ringTool(row, i, name) {
    if (row.melody) return null;
    return { on: row.ring, data: { ring: i },
      label: `Overlap for row ${i + 1}, ${name}: ${row.ring ? 'on, its hits ring over each other' : 'off, each hit cuts off the last'}. Tap to turn it ${row.ring ? 'off' : 'on'}.` };
  }
  // Turns row i's 🔔 Overlap on or off: saved with the beat, heard from its next hit.
  function toggleRing(i) {
    const row = pattern?.rows[i];
    if (!row || row.melody) return;
    row.ring = !row.ring;
    save();
    render();
    deps.announce?.(`Overlap ${row.ring ? 'on' : 'off'} for row ${i + 1}.`);
  }

  // The Clear or Remove waiting for its second tap: {row, kind}, or null.
  let asking = null;
  let askTimer = 0;
  function arm(next) {
    clearTimeout(askTimer);
    asking = next;
    if (next) askTimer = setTimeout(() => { asking = null; render(); }, ARM_MS);
  }

  // ── Chooser: the row's dialog. Tapping a sound plays it and marks it;
  // "Use" sets the row. With advanced beats on, also the row's speed (its
  // 🔔 Overlap is on the row's header line). ──

  // What the chooser is choosing for: a beat row ({row: i, title}), or new
  // rows ({adding: true, title}).
  let target = null;
  let choosing = -1;   // the row, when the target is a row
  let picked = null;   // the sound marked in it, not used until "Use"
  let ticks = [];      // new rows: the sounds ticked, in the order tapped
  let opened = new Map();  // group id -> open, set in this dialog (it wins over the shared state)
  let instOpen = null;     // the group whose instrument list is open (one at a time), or null

  function openFor(next, current, returnTo) {
    target = next;
    choosing = next.row ?? -1;
    picked = current ?? null;
    ticks = next.adding && current ? [current] : [];
    // The group holding the current sound starts open, but can still be closed.
    const home = deps.groups().find((g) => g.collapsible && g.clips.some((c) => c.id === picked));
    opened = new Map(home ? [[home.groupId, true]] : []);
    instOpen = null;
    renderChooser();
    openDialog(el.chooser, {
      focus: el.chooserGrid.querySelector('[aria-pressed="true"]') || el.chooserGrid.querySelector('[data-choose], [data-toggle-group]'),
      returnTo,
    });
  }
  function openChooser(i) {
    openFor({ row: i, title: `Row ${i + 1}` }, pattern.rows[i]?.clipId, () => el.rows.querySelector(`[data-pick="${i}"]`) || el.add);
  }

  // The chooser's sections: the kit's groups (each opens and closes, like on
  // the pads screen; the one holding the row's sound starts open),
  // then every person's own sounds, each under their name in their color.
  const isOpen = (id) => (opened.has(id) ? opened.get(id) : Boolean(deps.isGroupOpen?.(id)));

  function renderChooser() {
    el.chooserTitle.textContent = target?.title ?? 'Pick a sound';
    el.chooserGrid.replaceChildren(...deps.groups().map((g) => {
      const section = document.createElement('section');
      section.className = 'chooser-group';
      section.style.setProperty('--c', g.color);
      const open = !g.collapsible || isOpen(g.groupId);
      let heading;
      let list = null;
      if (g.collapsible) {
        heading = document.createElement('button');
        heading.type = 'button';
        heading.className = 'chooser-toggle';
        heading.dataset.toggleGroup = g.groupId;
        heading.setAttribute('aria-expanded', String(open));
        heading.textContent = `${open ? '▾' : '▸'} ${g.name} (${g.clips.length})`;
        // Notes, Chords and Bass: who plays them beside the name, as on
        // 🔊 Pads (inst-picker.js, ADR 0030), its list under it while open.
        if (hasPicker(g.groupId)) {
          const kit = { id: g.groupId, name: g.plain ?? g.name };
          const line = document.createElement('div');
          line.className = 'chooser-inst-row';
          line.append(heading, pickerButton(kit, instOpen === g.groupId, { where: 'chooser' }));
          heading = line;
          if (instOpen === g.groupId) list = pickerList(kit, { where: 'chooser' });
        }
      } else {
        heading = document.createElement('h3');
        heading.textContent = g.name;
      }
      const grid = document.createElement('div');
      grid.className = 'chooser-grid';
      grid.append(...g.clips.map((c) => {
        const b = deps.makePad(c);
        b.classList.add('pad-mini');
        b.dataset.choose = c.id;
        showTick(b);
        return b;
      }));
      grid.hidden = !open;
      section.append(...[heading, list, grid].filter(Boolean));
      return section;
    }));
    renderChooserTools();
  }

  // The bottom bar: the Use button names the marked sound; the row buttons
  // show the row as it is now.
  function renderChooserTools() {
    if (target?.adding) {
      const n = ticks.length;
      el.chooserOk.textContent = n ? `Add ${n} row${n === 1 ? '' : 's'}` : 'Tick a sound';
      el.chooserOk.disabled = !n;
      el.chooserTitle.textContent = n && n >= room() ? 'New rows · beat full' : 'New rows';
      el.chooserTools.hidden = true;
      return;
    }
    const clip = deps.clipById(picked);
    el.chooserOk.textContent = clip ? `Use ${clip.label}` : 'Pick a sound';
    el.chooserOk.disabled = !clip;
    const row = pattern?.rows[choosing];
    // 🎹 Tune for everyone; speed with Advanced.
    el.chooserTools.hidden = !row;
    const rates = el.chooserRate.closest('.chooser-rate');
    if (rates) rates.hidden = !advanced;
    if (!row) return;
    showTuneKey(row);
    for (const b of el.chooserRate.querySelectorAll('[data-rate]')) b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === row.rate));
  }

  // A sound in the chooser shows whether it is marked; for new rows, ticked,
  // with its place in the order tapped (the rows go in that order).
  function showTick(b) {
    const id = b.dataset.choose;
    const at = target?.adding ? ticks.indexOf(id) : -1;
    b.setAttribute('aria-pressed', String(target?.adding ? at >= 0 : id === picked));
    if (at >= 0) b.dataset.tick = String(at + 1);
    else delete b.dataset.tick;
  }
  const room = () => MAX_ROWS - (pattern?.rows.length ?? MAX_ROWS);

  // Marks a sound and plays it, so it can be heard before it is used. For new
  // rows a tap ticks it (and plays it), or unticks it; a full beat ticks no more.
  function mark(clipId) {
    let hear = true;
    if (target?.adding) {
      const at = ticks.indexOf(clipId);
      if (at >= 0) { ticks.splice(at, 1); hear = false; }
      else if (ticks.length < room()) ticks.push(clipId);
    } else picked = clipId;
    for (const b of el.chooserGrid.querySelectorAll('[data-choose]')) showTick(b);
    const clip = deps.clipById(clipId);
    if (clip && hear) audio.play(clip);
    renderChooserTools();
  }

  // The new rows' Add: a row for each ticked sound, in the order tapped.
  function addTicked() {
    const clips = ticks.map((id) => deps.clipById(id)).filter(Boolean).slice(0, room());
    for (const clip of clips) {
      pattern.rows.push(cleanRow({ clipId: clip.id }));
      if (playing()) prepare(clip);
    }
    el.chooser.close();
    if (!clips.length) return;
    save();
    render();
  }

  // `then`: what happens once the chooser has closed (🎹 Tune opens the roll).
  function useMarked({ then, changed = false } = {}) {
    const clip = deps.clipById(picked);
    const row = pattern?.rows[choosing];
    if (!row) return;
    if (clip && row.clipId !== picked) {
      row.clipId = picked;
      if (playing()) prepare(clip);
      changed = true;
    }
    if (changed) save();
    el.chooser.close();
    render();
    then?.();
  }

  // A row setting changed from the dialog: save, redraw the rows behind it.
  function rowChanged() {
    save();
    render();
    renderChooserTools();
  }

  // Moves a row; while playing, its clock, voices and playhead go with it.
  function moveRow(from, to) {
    const where = moveItem(pattern.rows, from, to);
    if (playing()) {
      for (const list of [voices, clocks, shown]) moveItem(list, from, to);
      queue = queue.map((q) => ({ ...q, row: where[q.row] }));
    }
    cell.row = where[cell.row] ?? 0;
    save();
    render();
  }

  // Dragging a row by its grip: the row follows the finger, and the others
  // make room as it passes their middle. The order is saved on release.
  const rowDrag = { row: null, pointerId: null, grabY: 0 };
  const rowEls = () => [...el.rows.children].filter((c) => c.classList.contains('seq-row'));

  function rowDragDown(e) {
    const grip = e.target.closest('[data-grip]');
    if (!grip || e.button !== 0 || rowDrag.row) return;
    e.preventDefault();
    const row = grip.closest('.seq-row');
    Object.assign(rowDrag, { row, pointerId: e.pointerId, grabY: e.clientY - row.getBoundingClientRect().top });
    grip.setPointerCapture?.(e.pointerId);
    row.classList.add('dragging');
  }

  function rowDragMove(e) {
    const row = rowDrag.row;
    if (!row || e.pointerId !== rowDrag.pointerId) return;
    // Its place is after every other row whose middle is above the finger,
    // which also works past the first or last row.
    const others = rowEls().filter((r) => r !== row);
    const place = others.filter((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < e.clientY; }).length;
    if (rowEls().indexOf(row) !== place) {
      if (place === 0) others[0].insertAdjacentElement('beforebegin', row);
      else others[place - 1].insertAdjacentElement('afterend', row);
    }
    row.style.translate = '';
    row.style.translate = `0 ${e.clientY - rowDrag.grabY - row.getBoundingClientRect().top}px`;
  }

  function rowDragUp(e) {
    const row = rowDrag.row;
    if (!row || e.pointerId !== rowDrag.pointerId) return;
    rowDrag.row = null;
    row.classList.remove('dragging');
    row.style.translate = '';
    const from = Number(row.dataset.row);
    const to = rowEls().indexOf(row);
    if (from !== to) moveRow(from, to);
    else render();
    el.rows.querySelector(`[data-grip="${to}"]`)?.focus();
  }

  // Switches every pill of row i off, with no Undo bar of its own (the keys
  // offers its own Undo), as Beats' Clear does.
  function clearRow(i) {
    const row = pattern?.rows[i];
    if (!row) return;
    wipeRow(row);
    save();
    render();
  }
  // Every pill of a row off; a tune row's notes go too.
  function wipeRow(row) {
    row.steps = row.steps.map(() => false);
    row.accents = row.steps.map(() => false);
    if (row.melody) { row.tune = []; row.notes = row.steps.map(() => null); }
  }
  // Takes row i out with no Undo bar of its own (the keys offers its own Undo).
  function dropRow(i) {
    if (!pattern?.rows[i]) return;
    removeRow(i);
    offerUndo(null);
  }
  function removeRow(i) {
    if (playing()) {
      for (const v of voices[i] || []) fadeStop(v, audio.context().currentTime);
      voices.splice(i, 1);
      clocks.splice(i, 1);
      shown.splice(i, 1);
      queue = queue.filter((q) => q.row !== i).map((q) => (q.row > i ? { ...q, row: q.row - 1 } : q));
    }
    const [row] = pattern.rows.splice(i, 1);
    offerUndo({ row, at: i, pattern });
    save();
    render();
  }

  // The last removed row, which Undo puts back where it was, for a few
  // seconds. Loading another beat or person forgets it.
  // It shows in the banner over the top of the screen (ui.js showBanner),
  // which forgets it when it goes.
  let undo = null;
  let undoBanner = null;
  function offerUndo(next) {
    undo = next;
    if (!next) { undoBanner?.close(); undoBanner = null; return; }
    const clip = next.row && deps.clipById(next.row.clipId);
    const text = next.level ? `${levelState(next.level.at).name} loudness ${percent(rowLevel(pattern.rows[next.level.at]))} %.`
      : next.fresh ? FRESH_TEXT
      : 'before' in next && next.added !== undefined ? `Added ${next.added} ${next.added === 1 ? 'hit' : 'hits'} from “${next.groove}”.`
      : 'before' in next && next.replaced ? `“${next.groove}” replaced your scratch beat.`
      : 'before' in next ? `Loaded “${next.groove}” into your scratch beat.`
      : `Removed row ${next.at + 1}${clip ? ` (${clip.label})` : ''}.`;
    undoBanner = showBanner(text, {
      action: { label: '↩️ Undo', fn: undoRemove },
      ms: UNDO_MS,
      // Focus on a vanishing Undo would be lost; it goes to Add a row.
      focusBack: () => el.add,
      onClose: () => { if (undo === next) { undo = null; undoBanner = null; } },
    });
  }

  function undoRemove() {
    if (undo?.level && undo.pattern === pattern) {
      const { at, before } = undo.level;
      offerUndo(null);
      putLevel(at, before);
      el.rows.querySelector(`[data-speaker="${at}"]`)?.focus();
      return;
    }
    if (undo && 'scratchBefore' in undo && undo.pattern === pattern) {
      const was = undo;
      offerUndo(null);
      undoLoad(was);
      return;
    }
    if (undo && 'before' in undo && undo.pattern === pattern) {
      openBeat(undo.before);
      offerUndo(null);
      return;
    }
    if (!undo || undo.pattern !== pattern || !pattern || pattern.rows.length >= MAX_ROWS) { offerUndo(null); return; }
    const { row, at } = undo;
    const i = Math.min(at, pattern.rows.length);
    pattern.rows.splice(i, 0, row);
    if (playing()) {
      // It rejoins in time, like a row added while playing.
      voices.splice(i, 0, []);
      clocks.splice(i, 0, undefined);
      shown.splice(i, 0, -1);
      queue = queue.map((q) => (q.row >= i ? { ...q, row: q.row + 1 } : q));
      prepare(deps.clipById(row.clipId));
    }
    offerUndo(null);
    save();
    render();
    el.rows.querySelector(`[data-speaker="${i}"]`)?.focus();
  }

  // ── A row's loudness: its speaker (row-volume.js) ──

  // What a row's speaker shows: its level, mute, and its sound's name.
  function levelState(i) {
    const row = pattern?.rows[i];
    if (!row) return null;
    return { level: rowLevel(row), muted: row.muted, solo: !!row.solo, silenced: silencedBySolo(pattern, row), name: deps.clipById(row.clipId)?.label ?? `Row ${Number(i) + 1}` };
  }
  // A row's mixer state in the compact rows: dimmed when another row's Solo
  // silences it, a lit ring on its emoji when soloed (the 🎚️ Mixer).
  function showMix(wrap, row) {
    wrap.classList.toggle('silenced', silencedBySolo(pattern, row));
    wrap.classList.toggle('solo', !!row.solo);
  }
  const levelOf = (i) => (pattern?.rows[i] ? { volume: rowLevel(pattern.rows[i]), muted: pattern.rows[i].muted } : null);
  // A level change reaches the hits still ringing too, not only the next ones.
  function applyLevel(i) {
    const row = pattern?.rows[i];
    if (!row || !playing()) return;
    const now = audio.context().currentTime;
    if (!audible(row, pattern)) { for (const v of voices[i] || []) fadeStop(v, now); return; }
    for (const v of voices[i] || []) {
      if (v.end <= now) continue;
      v.level = (v.lift ?? 1) * rowLevel(row);
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(v.level, now + 0.03);
      } catch { /* already stopped */ }
    }
  }
  // Redraws one row's speaker and pills' faintness in place, so a
  // drag never rebuilds the rows under the finger.
  function showLevel(i) {
    const s = levelState(i);
    const wrap = el.rows.querySelector(`.seq-row[data-row="${i}"]`);
    if (!s || !wrap) return;
    wrap.classList.toggle('muted', s.muted);
    showMix(wrap, pattern.rows[i]);
    wrap.style.setProperty('--vol', String(s.level));
    const b = wrap.querySelector('[data-speaker]');
    if (b) drawSpeaker(b, s);
  }
  // Puts a row's level and mute back (Undo, or the keys' Undo).
  function putLevel(i, { volume, muted }) {
    const row = pattern?.rows[i];
    if (!row) return;
    setRowLevel(row, volume);
    row.muted = !!muted;
    applyLevel(i);
    save();
    render();
  }
  // Tap on a speaker: mute or unmute; the level stays.
  function toggleMute(i) {
    const row = pattern?.rows[i];
    if (!row) return;
    row.muted = !row.muted;
    applyLevel(i);   // muted: what the row is playing now goes quiet too
    save();
    showLevel(i);
  }
  // A new level for row i. While a drag or slide goes on (`done` false) it
  // plays at once and draws in place; at its end it saves and offers Undo,
  // one step for the whole gesture (and for a run of changes to one row).
  // Turning a muted row's level unmutes it: the kid wants to hear it.
  let levelBefore = null;   // {at, before}: the row's level when this gesture started
  function setLevel(i, level, done = true, { offer = true } = {}) {
    const row = pattern?.rows[i];
    if (!row) return;
    if (levelBefore?.at !== i || levelBefore.pattern !== pattern) levelBefore = { at: i, pattern, before: levelOf(i) };
    setRowLevel(row, level);
    row.muted = false;
    applyLevel(i);
    showLevel(i);
    if (!done) return;
    const { before } = levelBefore;
    levelBefore = null;
    save();
    if (!offer) return;
    // A run of changes to one row is one Undo: it goes back to before the first.
    const kept = undo?.level && undo.pattern === pattern && undo.level.at === i ? undo.level.before : before;
    offerUndo({ level: { at: i, before: kept }, pattern });
  }
  // ── 🎚️ Mixer (mixer.js): per row a fader, Mute, Solo and an effect, and
  // the master. Each change is heard at once, saves, and redraws the rows
  // behind the sheet (the keys view's through onBeatChange). ──
  function mixChanged() {
    save();
    render();
    deps.onBeatChange?.();
  }
  const applyAll = () => pattern?.rows.forEach((_, j) => applyLevel(j));
  function toggleSolo(i) {
    const row = pattern?.rows[i];
    if (!row) return;
    if (row.solo) delete row.solo; else row.solo = true;
    applyAll();   // the rows it silences go quiet now, not at their next hit
    mixChanged();
  }
  function setRowFx(i, id) {
    const row = pattern?.rows[i];
    if (!row) return;
    if (cleanFx(id)) row.fx = cleanFx(id); else delete row.fx;
    mixChanged();
  }
  // The master's level: heard at once while sliding, saved at the end.
  function setMaster(v, done = true) {
    if (!pattern) return;
    if (cleanVolume(v) < 1) pattern.volume = cleanVolume(v); else delete pattern.volume;
    if (playing()) busFor(audio.context(), audio.master, pattern);
    if (done) save();
  }
  function setMasterFx(id) {
    if (!pattern) return;
    if (cleanFx(id)) pattern.fx = cleanFx(id); else delete pattern.fx;
    mixChanged();
  }
  // All on: every row heard again, mutes and solos off; the levels stay.
  function allOn() {
    if (!pattern) return;
    for (const row of pattern.rows) { row.muted = false; delete row.solo; }
    applyAll();
    mixChanged();
  }
  if (el.mixer) {
    mixer = createMixer({ dialog: el.mixer, strips: el.mixerStrips }, {
      beat: () => pattern, clipById: deps.clipById, colorOf: deps.colorOf,
      setLevel: (i, v, done) => { setLevel(i, v, done, { offer: false }); if (done) deps.onBeatChange?.(); },
      toggleMute: (i) => { toggleMute(i); render(); deps.onBeatChange?.(); },
      toggleSolo, setFx: setRowFx, setMaster, setMasterFx, allOn,
    });
    setupDialog(el.mixer);
  }
  // ── 🎹 The piano roll (roll.js, ADR 0023): a tune row's own screen ──
  let roll = null;
  // A note heard as it is placed, while the beat is stopped: the row's
  // sound at that pitch, for that long, through the row's mix.
  const previews = [];
  async function previewNote(i, p, l) {
    const row = pattern?.rows[i];
    const clip = deps.clipById(row?.clipId);
    if (!row || !clip || playing()) return;
    await prepare(clip);
    const loaded = ready.get(clip.id);
    if (!loaded || playing()) return;
    const ctx = audio.wake();
    sound(ctx, busFor(ctx, audio.master, pattern).input(i), previews, row, loaded, ctx.currentTime + 0.01, false, p, l * baseStep());
  }
  if (el.roll) {
    roll = createRoll(el.roll, {
      beat: () => pattern, row: (i) => pattern?.rows[i], total: () => total(), groups: () => groups(), advanced: () => advanced,
      commit: (i, tune) => {
        const row = pattern?.rows[i];
        if (!row) return;
        pattern.rows[i] = cleanRow({ ...row, tune });
        save();
        render();
        deps.onBeatChange?.();
      },
      preview: previewNote, playing,
      // The keys view's ▶ Play also runs its click track (dj.js), so it is pressed for it.
      togglePlay: () => (slot === 'dj' && el.djPlay ? el.djPlay : el.play).click(),
      openSound: (i, returnTo) => openFor({ row: i, title: `Row ${i + 1}` }, pattern.rows[i]?.clipId, returnTo),
      clipById: deps.clipById, colorOf: deps.colorOf,
      placed: () => countPlay('notes'),
      instrument: rowInstrument, swapInstrument,
    });
  }
  // Who plays a tune row (ADR 0030): {group: {id, name}, inst}, for a row
  // on one of Notes', Chords' or Bass' presets; null for any other sound.
  function rowInstrument(i) {
    const clip = deps.clipById(pattern?.rows[i]?.clipId);
    const inst = clip?.kit ? instrumentById(presetInstrument(clip)) : null;
    if (!inst) return null;
    const name = deps.groups().find((g) => g.groupId === clip.group)?.plain ?? clip.group;
    return { group: { id: clip.group, name }, inst };
  }
  // The roll's 🎹 swaps the row to another instrument's copy of the same
  // note (or chord), so every note of the tune sounds where it was. It is
  // the person's pick too, as every picker is.
  function swapInstrument(i, inst) {
    const row = pattern?.rows[i];
    const clip = deps.clipById(row?.clipId);
    if (!row || !clip?.kit) return;
    const kitId = versionFor(ownIdOf(clip), clip.group, inst);
    const next = kitId ? deps.clipById(`${clip.personId}-${kitId}`) : null;
    if (next && next.id !== row.clipId) {
      pattern.rows[i] = cleanRow({ ...row, clipId: next.id });
      if (playing()) prepare(next);
      save();
      render();
      deps.onBeatChange?.();
    }
    pickInstrument(clip.group, inst).catch((err) => console.error('Keeping the instrument failed:', err));
  }
  function openRoll(i, step = 0) {
    if (!roll || !pattern?.rows[i]?.melody) return;
    const returnTo = () => el.rows.querySelector(`.seq-row[data-row="${i}"] [data-pick]`) ?? el.add;
    roll.open(i, { step, returnTo });
  }
  // 🎹 Add a tune asks "Who plays it?" (ADR 0030): the Notes instruments by
  // family, the person's pick ticked. A tap makes a tune row of that
  // instrument's C (the first sound there is, if the board has none), keeps
  // it as the person's pick, and the roll opens on it.
  let tuneWho = null;   // the instrument tapped, until the dialog has closed
  function addTune(inst) {
    if (!pattern || pattern.rows.length >= MAX_ROWS) return;
    const clips = [...deps.clips(), ...deps.groups().flatMap((g) => g.clips)];
    const kitId = (inst && versionFor('note-c', 'notes', inst)) || 'note-c';
    const next = deps.clipById(`${personId}-${kitId}`) || clips.find((c) => c.id === `${personId}-note-c`) || clips[0];
    if (!next) return;
    pattern.rows.push(cleanRow({ clipId: next.id, melody: true, tune: [] }));
    if (playing()) prepare(next);
    save();
    render();
    deps.onBeatChange?.();
    openRoll(pattern.rows.length - 1);
    if (inst) pickInstrument('notes', inst).catch((err) => console.error('Keeping the instrument failed:', err));
  }
  el.addTune?.addEventListener('click', () => {
    if (!pattern || pattern.rows.length >= MAX_ROWS) return;
    if (!el.tuneWho) { addTune(null); return; }
    const notes = deps.groups().find((g) => g.groupId === 'notes');
    el.tuneWhoList.replaceChildren(pickerList({ id: 'notes', name: notes?.plain ?? 'Notes' }, { where: 'tune', label: 'Who plays it?' }));
    tuneWho = null;
    openDialog(el.tuneWho, { focus: el.tuneWhoList.querySelector('[aria-pressed="true"]'), returnTo: () => el.addTune });
  });
  if (el.tuneWho) {
    setupDialog(el.tuneWho);
    el.tuneWho.addEventListener('click', (e) => {
      const b = e.target.closest('[data-inst]');
      if (!b) return;
      tuneWho = b.dataset.inst;
      el.tuneWho.close();
    });
    // After the dialog has handed focus back, so the roll keeps its own.
    el.tuneWho.addEventListener('close', () => {
      const inst = tuneWho;
      tuneWho = null;
      if (inst) addTune(inst);
    });
  }

  // 🎚️ on the control bar, Beats and the keys view alike.
  function openMixer(from) {
    if (!pattern || !mixer) return;
    mixer.render();
    openDialog(el.mixer, { focus: el.mixerStrips.querySelector('[data-fader]'), returnTo: () => from });
  }
  for (const b of el.mixerButtons ?? []) b.addEventListener('click', () => openMixer(b));

  // ⋯ on a header line short of room (under about 360 px): 🔔 🧹 ✕ move into its
  // menu and stay 44 px; the speaker stays on the line (decisions.md, Screens).
  rowMenus = moreMenu(el.rows);
  rowRoom = fitMore(el.rows, '.seq-head');
  speakers = speakerControls(el.rows, {
    state: (key) => levelState(Number(key)),
    toggle: (key) => toggleMute(Number(key)),
    change: (key, level, done) => setLevel(Number(key), level, done),
  });

  // ── Events ──

  el.play.addEventListener('click', () => (playing() ? stop() : play()));
  // The keys view's ▶ Play is wired in dj.js (its click track and recording).

  // The tempo slider moves through STOPS (weighted toward common tempos).
  el.bpm.addEventListener('input', () => {
    const was = pattern.bpm;
    pattern.bpm = STOPS[Number(el.bpm.value)] ?? pattern.bpm;
    retime(was);
    showTempo({ slider: false });
  });
  el.bpm.addEventListener('change', () => { save(); deps.onTempo?.(); });
  // Swing (advanced): how late the off-beat pills play.
  // Swing (Advanced): three keys beside the time signature. Beats saved with
  // another amount keep it, and the nearest key shows lit.
  const SWING_KEYS = [0, 33, 50];
  function showSwing() {
    const v = pattern.swing || 0;
    const near = SWING_KEYS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    for (const b of el.swing.querySelectorAll('[data-swing]')) b.setAttribute('aria-pressed', String(Number(b.dataset.swing) === near));
  }
  el.swing.addEventListener('click', (e) => {
    const b = e.target.closest('[data-swing]');
    if (!b || !pattern) return;
    pattern.swing = Math.min(MAX_SWING, Number(b.dataset.swing));
    showSwing();
    save();
  });
  // Keys move one tempo at a time (ten with Page Up and Down), not one stop.
  el.bpm.addEventListener('keydown', (e) => {
    const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
    const to = e.key === 'Home' ? MIN_BPM : e.key === 'End' ? MAX_BPM : by ? pattern.bpm + by : null;
    if (to == null) return;
    e.preventDefault();
    setTempo(to);
  });
  // The chevrons (a phone's short line): to the next common tempo up or down.
  el.bpm.closest('.tempo-box')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tempo-step]');
    if (!b) return;
    e.preventDefault();   // inside the label: no click passed on to the slider
    const next = Number(b.dataset.tempoStep) > 0 ? COMMON_BPMS.find((t) => t > pattern.bpm) : COMMON_BPMS.findLast((t) => t < pattern.bpm);
    if (next) setTempo(next);
  });
  // Tapping the number swaps it for a field to type a tempo into.
  el.bpmOut.addEventListener('click', () => {
    el.bpmType.value = pattern.bpm;
    el.bpmOut.hidden = true;
    el.bpmType.hidden = false;
    el.bpmType.focus();
    el.bpmType.select?.();
  });
  let typing = false;  // so Enter and the blur that follows it count once
  const endTyping = (keep) => {
    if (el.bpmType.hidden) return;
    const bpm = keep ? typedBpm(el.bpmType.value) : null;
    el.bpmType.hidden = true;
    el.bpmOut.hidden = false;
    if (bpm != null) setTempo(bpm);
    if (typing) el.bpmOut.focus();
    typing = false;
  };
  el.bpmType.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      typing = true;
      endTyping(e.key === 'Enter');
    }
  });
  el.bpmType.addEventListener('blur', () => endTyping(true));


  // + Add a row opens the chooser for new rows (Ben, 2026-10-16: adding eight
  // chords one at a time meant closing Drums eight times). The sound after
  // the last row's comes ticked, its group open, so one tap on Add still adds
  // the next one.
  el.add.addEventListener('click', () => {
    if (!pattern || pattern.rows.length >= MAX_ROWS) return;
    const order = deps.groups().flatMap((g) => g.clips);
    const next = nextSound(order, pattern.rows.map((r) => r.clipId), [...deps.clips(), ...order]);
    openFor({ adding: true, title: 'New rows' }, next?.id, () => el.add);
  });

  let afterHold = () => false;   // set below, once the hold listener is on
  el.rows.addEventListener('click', (e) => {
    const rowEl = e.target.closest('.seq-row');
    if (!rowEl) return;
    const i = Number(rowEl.dataset.row);
    const row = pattern.rows[i];
    // A tune row's emoji opens 🎹 the roll (its sound changes from there).
    if (e.target.closest('[data-pick]')) { if (row?.melody) openRoll(i); else openChooser(i); return; }
    if (e.target.closest('[data-ring]')) {
      if (asking) arm(null);
      toggleRing(i);
      el.rows.querySelector(`[data-ring="${i}"]`)?.focus();
      return;
    }
    if (e.target.closest('[data-fold]')) {
      row.collapsed = !row.collapsed;
      save();
      render();
      el.rows.querySelector(`[data-fold="${i}"]`)?.focus();  // the fold button comes first
      return;
    }
    const ask = e.target.closest('[data-clear]') || e.target.closest('[data-remove]');
    const kind = ask && (ask.dataset.clear != null ? 'clear' : 'remove');
    if (ask) {
      if (asking?.row !== i || asking.kind !== kind) {
        arm({ row: i, kind });
        render();
        el.rows.querySelector(`[data-${kind}="${i}"]`)?.focus();
        return;
      }
      arm(null);
      if (kind === 'clear') {
        wipeRow(row);
        save();
        render();
        el.rows.querySelector(`[data-speaker="${i}"]`)?.focus();
      } else {
        removeRow(i);
        undoBanner?.focus();
      }
      return;
    }
    // Any other tap takes back a waiting Clear? or Remove?
    if (asking) { arm(null); render(); }
    if (e.target.closest('[data-speaker]')) return;   // the speaker's own controls (speakerControls)
    const pill = e.target.closest('.pill');
    if (!pill || afterHold()) return;
    const s = Number(pill.dataset.step);
    if (row.melody) { openRoll(i, s); return; }
    // A tap switches it on or off; Shift (Shift+Space, Shift+click) or a hold makes it loud.
    if (e.shiftKey) holdPill(row, s); else tapPill(row, s);
    showPill(pill, row, s);
    const clear = rowEl.querySelector('[data-clear]');
    if (clear) clear.disabled = !row.steps.some(Boolean);
    // Silent on purpose: a pill only sounds when the beat is playing.
    save();
  });

  // Holding a pill makes it a loud hit (or a loud one normal).
  afterHold = pillHolds(el.rows, (t) => t.closest?.('.pill'), (pill) => {
    const rowEl = pill.closest('.seq-row');
    const row = pattern?.rows[Number(rowEl?.dataset.row)];
    if (!row) return;
    const s = Number(pill.dataset.step);
    if (row.melody) { openRoll(Number(rowEl.dataset.row), s); return; }
    holdPill(row, s);
    showPill(pill, row, s);
    const clear = rowEl.querySelector('[data-clear]');
    if (clear) clear.disabled = !row.steps.some(Boolean);
    save();
  });
  el.rows.addEventListener('pointerdown', rowDragDown);
  // Moving the row in the page drops pointer capture, so the drag listens on
  // the window: a release above or below the rows still ends it.
  window.addEventListener('pointermove', rowDragMove);
  window.addEventListener('pointerup', rowDragUp);
  window.addEventListener('pointercancel', rowDragUp);
  // On a grip, up and down move the row itself.
  el.rows.addEventListener('keydown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const from = Number(grip.dataset.grip);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= pattern.rows.length) return;
    moveRow(from, to);
    el.rows.querySelector(`[data-grip="${to}"]`)?.focus();
  });

  // Arrow keys move between pills (they are one Tab stop, not 128).
  el.rows.addEventListener('keydown', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill || e.altKey || e.ctrlKey || e.metaKey) return;
    const row = Number(pill.closest('.seq-row').dataset.row);
    let to = pillTarget(e.key, row, Number(pill.dataset.step), pattern.rows.length, countOf);
    if (!to) return;
    e.preventDefault();
    // Up and down step over collapsed rows; with none open that way, stay put.
    while (to && pattern.rows[to[0]]?.collapsed) {
      const further = pillTarget(e.key, to[0], to[1], pattern.rows.length, countOf);
      to = further[0] === to[0] ? null : further;
    }
    if (!to) return;
    pills[row][Number(pill.dataset.step)].tabIndex = -1;
    [cell.row, cell.step] = to;
    const next = pills[to[0]][to[1]];
    next.tabIndex = 0;
    next.focus();
  });
  // A click or touch also makes that pill the one in the Tab order.
  el.rows.addEventListener('focusin', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill || !pills[cell.row]) return;
    pills[cell.row][cell.step].tabIndex = -1;
    cell.row = Number(pill.closest('.seq-row').dataset.row);
    cell.step = Number(pill.dataset.step);
    pill.tabIndex = 0;
  });

  el.chooser.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-group]');
    if (toggle) {
      const id = toggle.dataset.toggleGroup;
      const open = !isOpen(id);
      opened.set(id, open);
      if (Boolean(deps.isGroupOpen?.(id)) !== open) deps.toggleGroup?.(id);  // the pads screen follows
      renderChooser();
      el.chooserGrid.querySelector(`[data-toggle-group="${CSS.escape(toggle.dataset.toggleGroup)}"]`)?.focus();
      return;
    }
    // Who plays Notes, Chords or Bass: the button opens or closes its list;
    // a tap on an instrument picks it (the person's, as on 🔊 Pads), closes
    // the list and opens the group on that instrument's sounds.
    const who = e.target.closest('[data-inst-pick]');
    if (who) {
      instOpen = instOpen === who.dataset.instPick ? null : who.dataset.instPick;
      renderChooser();
      el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(who.dataset.instPick)}"]`)?.focus();
      return;
    }
    const inst = e.target.closest('[data-inst]');
    if (inst) { chooseInstrument(inst.dataset.instGroup, inst.dataset.inst); return; }
    const pick = e.target.closest('[data-choose]');
    if (pick) mark(pick.dataset.choose);
  });
  async function chooseInstrument(group, inst) {
    instOpen = null;
    opened.set(group, true);
    if (!deps.isGroupOpen?.(group)) deps.toggleGroup?.(group);   // the pads screen follows, as a header tap does
    await pickInstrument(group, inst);
    if (!el.chooser.open) return;
    renderChooser();
    el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(group)}"]`)?.focus();
  }
  // Esc in an open instrument list closes the list, not the chooser.
  el.chooser.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !instOpen || !e.target.closest?.('.inst-list, [data-inst-pick]')) return;
    e.preventDefault();
    e.stopPropagation();
    const group = instOpen;
    instOpen = null;
    renderChooser();
    el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(group)}"]`)?.focus();
  });
  el.chooserOk.addEventListener('click', () => (target?.adding ? addTicked() : useMarked()));
  // 🎹 Tune: the row plays notes from 🎹 the piano roll (ADR 0023). On, its
  // pills become notes a pill long, at the sound's own note, and the roll
  // opens (after Use, if a sound is marked). Off, its notes become pills
  // where they start: one with another pitch or length asks first, since
  // those are lost ("Off?" in red, then a second tap).
  let tuneAsked = false;
  function showTuneKey(row) {
    const b = el.chooserMelody;
    if (!b) return;
    b.setAttribute('aria-pressed', String(!!row.melody));
    b.classList.toggle('armed', tuneAsked);
    b.textContent = tuneAsked ? '🎹 Off? Notes lose their pitch' : '🎹 Tune';
    b.setAttribute('aria-label', tuneAsked ? 'Tap again to turn the tune off: its notes become plain pills' : '🎹 Tune: the row plays notes you place in the piano roll');
  }
  el.chooserMelody?.addEventListener('click', () => {
    const i = choosing;
    const row = pattern?.rows[i];
    if (!row) return;
    if (!row.melody) {
      pattern.rows[i] = cleanRow({ ...row, melody: true, tune: undefined });
      tuneAsked = false;
      useMarked({ then: () => openRoll(i), changed: true });
      return;
    }
    const plain = (row.tune ?? []).every((n) => n.p === 0 && n.l === 1 && Number.isInteger(n.s));
    if (!plain && !tuneAsked) { tuneAsked = true; showTuneKey(row); return; }
    tuneAsked = false;
    const { tune: _notes, ...rest } = row;
    pattern.rows[i] = cleanRow({ ...rest, melody: false, notes: [] });
    rowChanged();
  });
  el.chooser.addEventListener('close', () => { tuneAsked = false; });
  el.chooserRate.addEventListener('click', (e) => {
    const row = pattern?.rows[choosing];
    const rate = Number(e.target.closest('[data-rate]')?.dataset.rate);
    if (!row || !ROW_RATES.includes(rate) || rate === row.rate) return;
    row.rate = rate;
    rowChanged();
  });

  // ── Starter grooves ──

  // The dialog lists the grooves by style (GROOVE_GROUPS), each group a
  // heading that opens and shuts like the groups in the emoji list. The
  // groups open now are remembered until the page reloads; at first they
  // are all shut, a short menu of styles.
  const grooveFolds = new Set();
  const hasClip = (id) => !!deps.clipById(id);
  // What a groove's card says under its name: its drums, then "bass" and
  // "chords" if it has them, its length if over a bar, its time signature
  // if not 4/4, and its tempo.
  function grooveInfo(g, beat) {
    const groups = beat.rows.map((r) => deps.clipById(r.clipId)?.group);
    const drums = beat.rows.filter((_, i) => !['bass', 'chords'].includes(groups[i])).map((r) => deps.clipById(r.clipId)?.label).filter(Boolean);
    const parts = [drums.join(', ')];
    if (groups.includes('bass')) parts.push('bass');
    if (groups.includes('chords')) parts.push('chords');
    const { signature, bars } = grooveShape(g);
    return [parts.filter(Boolean).join(' + '), bars > 1 ? `${bars} bars` : '', signature === '4/4' ? '' : signature, `${g.bpm} BPM`]
      .filter(Boolean).join(' · ');
  }
  function grooveCard(g) {
    const beat = grooveBeat(g, personId, hasClip);
    const li = document.createElement('li');
    li.className = 'groove-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lib-beat groove';
    b.dataset.groove = g.id;
    const text = document.createElement('span');
    text.className = 'lib-text';
    const name = document.createElement('span');
    name.className = 'lib-name';
    name.textContent = `${g.emoji} ${g.name}`;
    // Under the name, where it comes from and what to listen for; the
    // sounds, bars and tempo only with Advanced (Ben, 2026-10-17).
    const about = document.createElement('span');
    about.className = 'lib-info groove-about';
    about.textContent = g.about;
    text.append(name, about);
    // Who plays it, beyond the drums: a chip per instrument in its family's
    // color, as in the picker (ADR 0030).
    const players = groovePlayers(g, (kit) => deps.clipById(`${personId}-${kit}`) ?? null);
    if (players.length) {
      const who = document.createElement('span');
      who.className = 'groove-who';
      for (const i of players) {
        const chip = document.createElement('span');
        chip.className = 'groove-player';
        chip.dataset.inst = i.id;
        chip.dataset.family = i.family.id;
        chip.style.setProperty('--fam', i.family.color);
        chip.textContent = `${i.emoji} ${i.name}`;
        who.append(chip);
      }
      text.append(who);
    }
    if (advanced) {
      const info = document.createElement('span');
      info.className = 'lib-info groove-parts';
      info.textContent = grooveInfo(g, beat);
      text.append(info);
    }
    b.append(thumbnail(beat), text);
    // ▶ beside the card plays a short sample without opening it (Ben, 2026-10-12).
    const hear = document.createElement('button');
    hear.type = 'button';
    hear.className = 'chip-dark groove-hear';
    hear.dataset.hear = g.id;
    showHearKey(hear);
    li.append(b, hear);
    return li;
  }
  // ── A groove's sample in the chooser: one pass, at most SAMPLE_SECONDS ──
  // Played as Song mode plays a beat (beatPlan, soundHit), so there is no
  // second player. One thing plays at a time: the beat stops (a groove tried
  // in the keys view stays on screen) and a song stops. ■, another ▶, picking
  // a groove or closing the dialog ends it.
  let sample = null;   // {id, voices: Map(row → list), timer}
  function showHearKey(b) {
    const g = GROOVES.find((x) => x.id === b.dataset.hear);
    const on = sample?.id === b.dataset.hear;
    b.textContent = on ? '■' : '▶';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? `Stop the ${g?.name ?? ''} sample` : `Hear a bit of ${g?.name ?? 'this groove'}`);
  }
  const showHearKeys = () => { for (const b of el.grooveList.querySelectorAll('[data-hear]')) showHearKey(b); };
  function stopSample() {
    if (!sample) return;
    clearTimeout(sample.timer);
    const now = audio.context().currentTime;
    for (const list of sample.voices.values()) for (const v of list) fadeStop(v, now);
    sample = null;
    showHearKeys();
  }
  async function playSample(g) {
    const again = sample?.id === g.id;
    stopSample();
    if (again) return;   // ■: the same ▶ again stops it
    if (playing()) stop({ keepTrial: true });
    deps.onPlay?.();     // a song playing stops
    const mine = { id: g.id, voices: new Map(), timer: 0 };
    sample = mine;
    showHearKeys();
    const plan = beatPlan(grooveBeat(g, personId, hasClip));
    await prepareBeats([plan.pattern]);
    if (sample !== mine) return;   // stopped while its sounds loaded
    const ctx = audio.wake();
    const t0 = ctx.currentTime + 0.05;
    const seconds = sampleSeconds(plan.seconds);
    for (const h of plan.hits) {
      if (h.time >= seconds) continue;
      if (!mine.voices.has(h.row)) mine.voices.set(h.row, []);
      soundHit(ctx, audio.master, mine.voices.get(h.row), plan.pattern, h.row, t0 + h.time, h.loud, h.note, h.len);
    }
    logEvent('beat', { action: 'sample', bpm: plan.pattern.bpm, bars: plan.pattern.bars, seconds: Math.round(seconds * 10) / 10 });
    mine.timer = setTimeout(() => { if (sample === mine) stopSample(); }, (seconds + 0.4) * 1000);
  }
  function showFold(sec, open) {
    sec.head.setAttribute('aria-expanded', String(open));
    sec.head.querySelector('.emoji-all-caret').textContent = open ? '▾' : '▸';
    sec.box.classList.toggle('open', open);
    sec.list.hidden = !open;
  }
  function renderGrooves() {
    el.grooveList.replaceChildren(...GROOVE_GROUPS.map((group) => {
      const grooves = GROOVES.filter((g) => g.group === group.id);
      const box = document.createElement('section');
      box.className = 'emoji-all-sec groove-sec';
      const h = document.createElement('h3');
      h.className = 'emoji-all-h';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'emoji-all-group';
      head.dataset.grooveGroup = group.id;
      const list = document.createElement('ul');
      list.className = 'lib-list';
      list.id = `groove-group-${group.id}`;
      head.setAttribute('aria-controls', list.id);
      const caret = document.createElement('span');
      caret.className = 'emoji-all-caret';
      caret.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'emoji-all-name';
      label.textContent = `${group.emoji} ${group.name}`;
      const count = document.createElement('span');
      count.className = 'emoji-all-count';
      count.textContent = String(grooves.length);
      count.setAttribute('aria-label', `${grooves.length} grooves`);
      head.append(caret, label, count);
      h.append(head);
      list.append(...grooves.map(grooveCard));
      box.append(h, list);
      showFold({ box, head, list }, grooveFolds.has(group.id));
      return box;
    }));
  }
  // `from`: the button that opened it, which gets the focus back.
  function openGrooves(from) {
    el.grooveNote.textContent = '';
    showGrooveHow();
    renderGrooves();
    openDialog(el.grooves, from ? { returnTo: () => from } : undefined);
  }

  // A groove loads into the scratch (ADR 0020), so nothing in 🗂️ My beats is
  // copied or overwritten, and the scratch opens; or, with ➕, its hits join
  // the open beat. Undo puts back the beat that was open and the scratch as
  // it was.
  let grooveAdds = false;   // the dialog's choice: into the scratch (off) or add to this one
  // In the keys a groove always loads into the scratch.
  const adding = () => grooveAdds && !!pattern && slot !== 'dj';
  function showGrooveHow() {
    // In the keys a groove plays behind you: there is nothing to choose.
    el.grooveHow.hidden = slot === 'dj';
    for (const b of el.grooveHow.querySelectorAll('[data-how]')) {
      b.setAttribute('aria-pressed', String((b.dataset.how === 'add') === adding()));
      if (b.dataset.how === 'add') b.disabled = !pattern;
    }
    const kept = onScratch() ? '' : ' Yours stays in 🗂️ My beats.';
    el.grooveHint.textContent = slot === 'dj'
      ? `Tap one to load it into your scratch beat and play along: ▶ Play plays it behind you, ● Record adds your hits, and 💾 Keep saves it.${kept}`
      : adding()
      ? 'Adds the groove’s hits to the beat on screen. Nothing is turned off, and Undo takes them back out.'
      : `Loads the groove into your scratch beat to play with. 💾 Keep saves it in 🗂️ My beats.${kept}`;
  }
  el.grooveHow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-how]');
    if (!b) return;
    grooveAdds = b.dataset.how === 'add';
    showGrooveHow();
  });
  function pickGroove(button) {
    const g = GROOVES.find((x) => x.id === button.dataset.groove);
    if (!g) return;
    if (adding()) {
      const before = snapshot();
      const { rows, added } = mergeGroove(pattern.rows, grooveBeat(g, personId, hasClip).rows, bar(), pattern.bars, grooveShape(g));
      el.grooves.close();
      pattern.rows = rows;
      save();
      render();
      deps.onBeatChange?.();
      offerUndo({ before, pattern, groove: g.name, added });
      undoBanner?.focus();
      return;
    }
    el.grooves.close();
    loadGroove(g);
    if (slot !== 'dj') undoBanner?.focus();
  }

  // The groove into the scratch, which opens. With ⌨️ Keys on it opens
  // stopped ("opening a groove in the beat builder should open stopped"),
  // and ▶ Play plays it behind the keys; on Beats a beat playing carries on.
  // A scratch with hits is replaced, so the line says so, with Undo (Keys
  // off) or ↩️ My beat (Keys on).
  function loadGroove(g) {
    const old = scratchSaved();
    const was = {
      before: structuredClone(pattern),
      scratchBefore: old ? structuredClone(old) : null,
      groove: g.name,
      replaced: hasHits(old),
    };
    const resume = slot !== 'dj' && playing();
    queued = null;
    stop();
    pattern = { ...grooveBeat(g, personId, hasClip), id: old?.id ?? scratchId(personId), name: g.name };
    save();
    loaded = was;
    render();
    deps.onBeatChange?.();
    if (resume) play();
    logEvent('beat', { action: 'groove', replaced: was.replaced });
    if (slot !== 'dj') offerUndo({ ...was, pattern });
  }
  // Undo of a groove loaded: the scratch as it was, and the beat that was
  // open before (the scratch, or a beat in 🗂️ My beats).
  function undoLoad(was) {
    loaded = null;
    if (was.scratchBefore) deps.library.put(was.scratchBefore);
    else if (scratchSaved()) deps.library.remove(scratchSaved().id);
    const back = was.before && !isScratch(was.before) && library().find((b) => b.id === was.before.id);
    openBeat(back ? cleanPattern(back, personId) : null, { resume: slot !== 'dj' });
  }

  el.grooveList.addEventListener('click', (e) => {
    const head = e.target.closest('[data-groove-group]');
    if (head) {
      const id = head.dataset.grooveGroup;
      const open = !grooveFolds.has(id);
      if (open) grooveFolds.add(id); else grooveFolds.delete(id);
      showFold({ box: head.closest('section'), head, list: el.grooveList.querySelector(`#groove-group-${id}`) }, open);
      return;
    }
    const hear = e.target.closest('[data-hear]');
    if (hear) { const g = GROOVES.find((x) => x.id === hear.dataset.hear); if (g) playSample(g); return; }
    const b = e.target.closest('[data-groove]');
    if (b) { stopSample(); pickGroove(b); }
  });

  // ── The keys: a groove just loaded (Ben, 2026-10-12; ADR 0020) ──
  // The keys view shows a line while the scratch holds a groove just loaded
  // and nothing has changed it yet: `trying()`. ↩️ My beat there is the
  // groove's Undo (putTrialAway). Recording onto it or changing it ends the
  // line; the groove stays in the scratch.
  const trying = () => (loaded && onScratch() ? { groove: loaded.groove, replaced: loaded.replaced } : null);
  function putTrialAway() {
    if (!loaded) return;
    stop();
    undoLoad(loaded);
  }
  // 💃 Grooves sits in the beat bar on both screens (Ben, 2026-10-12).
  for (const bar of el.beatBars ?? []) {
    const b = bar.querySelector('[data-beat-grooves]');
    b?.addEventListener('click', () => openGrooves(b));
  }
  // ── 🗂️ My beats: every saved beat, to open, 📌 pin, duplicate or delete ──

  let deleteAsked = null;
  function openLibrary(from) {
    el.libNote.textContent = '';
    deleteAsked = null;
    renderLibrary();
    openDialog(el.library, { returnTo: () => from });
  }

  function renderLibrary() {
    const beats = library();
    el.libSound.disabled = !pattern;   // 🔊 makes the open beat a sound: with none open, nothing to make
    el.libEmpty.hidden = beats.length > 0;
    el.libList.replaceChildren(...beats.map((beat) => {
      const item = document.createElement('li');
      item.className = 'lib-beat';
      item.dataset.id = beat.id;
      const open = beat.id === pattern?.id;
      item.classList.toggle('current', open);

      // The whole card opens it.
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'lib-open';
      openBtn.dataset.load = beat.id;
      const name = document.createElement('span');
      name.className = 'lib-name';
      name.textContent = beat.name;
      const info = document.createElement('span');
      info.className = 'lib-info';
      const bars = beat.bars || 1;
      info.textContent = open ? 'Open now' : `${beat.rows.length} ${beat.rows.length === 1 ? 'sound' : 'sounds'} · ${beat.bpm} BPM${bars > 1 ? ` · ${bars} bars` : ''}`;
      const text = document.createElement('span');
      text.className = 'lib-text';
      text.append(name, info);
      openBtn.append(thumbnail(beat), text);
      openBtn.setAttribute('aria-label', open ? `${beat.name}, open now` : `Open ${beat.name}`);

      // 📌 pins the beat to the pattern chips (up to MAX_PINS), and unpins it.
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'chip-dark lib-pin';
      pin.dataset.pin = beat.id;
      pin.textContent = '📌';
      pin.setAttribute('aria-pressed', String(isPinned(beat)));
      pin.setAttribute('aria-label', isPinned(beat) ? `Unpin ${beat.name} from the chips` : `Pin ${beat.name} to the chips`);
      const dup = document.createElement('button');
      dup.type = 'button';
      dup.className = 'chip-dark';
      dup.dataset.dup = beat.id;
      dup.textContent = '⧉';
      dup.setAttribute('aria-label', `Duplicate ${beat.name}`);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chip-dark';
      del.dataset.delete = beat.id;
      const asking = deleteAsked === beat.id;
      del.textContent = asking ? 'Delete?' : '🗑️';
      del.classList.toggle('armed', asking);
      del.setAttribute('aria-label', asking ? `Tap again to delete ${beat.name}` : `Delete ${beat.name}`);
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'chip-dark';
      save.dataset.export = beat.id;
      save.textContent = '⬇️';
      save.setAttribute('aria-label', `Save ${beat.name} as a beat file`);

      item.append(openBtn, pin, dup, save, del);
      return item;
    }));
  }

  // A beat's rows as lines of 16 dots in each sound's color, so a saved beat
  // can be recognised at a glance.
  function thumbnail(beat) {
    const t = document.createElement('div');
    t.className = 'lib-thumb';
    t.setAttribute('aria-hidden', 'true');
    for (const row of beat.rows.slice(0, 4)) {
      const line = document.createElement('div');
      const clip = deps.clipById(row.clipId);
      if (clip) line.style.setProperty('--pill', deps.colorOf(clip));
      line.style.setProperty('--vol', String(row.muted ? 0 : rowLevel(row)));   // a quieter row draws fainter
      for (const on of row.steps.slice(0, 16)) {
        const dot = document.createElement('span');
        if (on) dot.className = 'on';
        line.append(dot);
      }
      t.append(line);
    }
    return t;
  }

  el.library.addEventListener('click', (e) => {
    const load = e.target.closest('[data-load]');
    if (load) {
      const beat = library().find((b) => b.id === load.dataset.load);
      if (beat && beat.id !== pattern?.id) openBeat(cleanPattern(beat, personId));
      el.library.close();
      return;
    }
    const exp = e.target.closest('[data-export]');
    if (exp) {
      const beat = library().find((b) => b.id === exp.dataset.export);
      if (!beat) return;
      const { file, dropped } = beatToFile(cleanPattern(beat, beat.personId), deps.kitIds());
      const safe = (beat.name || 'beat').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'beat';
      downloadBlob(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }), `${safe}.beat.json`);
      el.libNote.textContent = dropped
        ? `Saved “${beat.name}” as a file. ${dropped} recorded ${dropped === 1 ? 'sound stays' : 'sounds stay'} behind: only presets go in a beat file.`
        : `Saved “${beat.name}” as a file.`;
      return;
    }
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      togglePin(pin.dataset.pin);
      return;
    }
    const dup = e.target.closest('[data-dup]');
    if (dup) {
      const beat = library().find((b) => b.id === dup.dataset.dup);
      if (!beat) return;
      const copy = { ...structuredClone(beat), id: newId('beat'), name: uniqueName(beat.name), created: Date.now(), saved: Date.now() };
      delete copy.pinned;   // a copy is a new beat: not pinned
      deps.library.put(copy);
      el.libNote.textContent = `Made a copy: “${copy.name}”.`;
      renderLibrary();
      return;
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      // Tap once to ask, again to delete, as with deleting a sound.
      if (deleteAsked !== del.dataset.delete) { deleteAsked = del.dataset.delete; renderLibrary(); return; }
      deleteAsked = null;
      const beat = library().find((b) => b.id === del.dataset.delete);
      deps.library.remove(del.dataset.delete);
      el.libNote.textContent = beat ? `Deleted “${beat.name}”.` : '';
      // Deleting the open beat opens the scratch.
      if (beat) closeEverywhere(beat.id);
      renderLibrary();
      (el.libList.querySelector('[data-load]') || el.libSound).focus();
    }
  });

  // 📌 in 🗂️ My beats: pins a beat to the chips' first spots, in the order pinned,
  // or unpins it. Pinning is not using it: its `saved` stamp stays. With
  // MAX_PINS pinned, another waits until one is unpinned.
  function togglePin(id) {
    const beat = library().find((b) => b.id === id);
    if (!beat) return;
    const record = structuredClone(beat);
    if (isPinned(beat)) {
      delete record.pinned;
      el.libNote.textContent = `Unpinned “${beat.name}”.`;
    } else if (library().filter(isPinned).length >= MAX_PINS) {
      el.libNote.textContent = `${MAX_PINS} beats are pinned already: unpin one first.`;
      return;
    } else {
      record.pinned = Date.now();
      el.libNote.textContent = `Pinned “${beat.name}” to the chips.`;
    }
    deps.library.put(record);
    renderLibrary();
    showChips();
    el.libList.querySelector(`[data-pin="${CSS.escape(id)}"]`)?.focus();
  }

  // 📥 Load a beat file: it joins the list under a name no other beat has,
  // and opens on this screen.
  el.libFile?.addEventListener('change', async () => {
    const f = el.libFile.files?.[0];
    el.libFile.value = '';
    if (!f) return;
    try {
      if (f.size > MAX_BEAT_FILE_BYTES) throw new Error('That file is too big to be a beat.');
      const beat = beatFromFile(await f.text(), personId, deps.kitIds());
      const now = Date.now();
      Object.assign(beat, { id: newId('beat'), name: uniqueName(beat.name || freshName()), created: now, saved: now });
      openBeat(beat);
      el.library.close();
      deps.announce?.(`Loaded “${beat.name}”.`);
    } catch (err) {
      el.libNote.textContent = err.message;
    }
  });

  // ── Save as a sound: render the beat to audio and add it as a pad ──

  // Plays the pattern into an OfflineAudioContext exactly as play() would:
  // the same hits (planHits), each row's tempo, fades and Overlap, once
  // through the whole beat, every bar.
  async function bounce() {
    await Promise.all(pattern.rows.map((r) => prepare(deps.clipById(r.clipId))));
    const rate = audio.context().sampleRate;
    const seconds = total() * baseStep();
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    const lists = pattern.rows.map(() => []);
    let hits = 0;
    for (const { row: i, time, loud, note, len } of planHits(pattern, playMode(), seconds, bar(), swingNow())) {
      const loaded = ready.get(pattern.rows[i].clipId);
      if (!loaded) continue;
      sound(ctx, busFor(ctx, ctx.destination, pattern).input(i), lists[i], pattern.rows[i], loaded, time, loud, note, len);
      hits++;
    }
    if (!hits) return null;
    return normalize(await ctx.startRendering());
  }

  async function saveAsSound() {
    if (!pattern) return;
    const beat = ((onScratch() ? grooveOf(pattern)?.name : pattern.name) || freshName()).slice(0, 24);
    // The new pad is a remix of the beat: "Wobbly Thunder (🌀 Wonky Remix)".
    const name = deps.remixName ? deps.remixName(beat) : beat;
    el.libSound.disabled = true;
    el.libNote.textContent = 'Making the sound…';
    try {
      const buffer = await bounce();
      if (!buffer) { el.libNote.textContent = 'Turn on some pills first, then save it as a sound.'; return; }
      await deps.addClip({ label: name, blob: encodeWav(buffer) });
      el.libNote.textContent = `Added “${name}” to the pads (${pattern.bars} ${pattern.bars === 1 ? 'bar' : 'bars'}, ${buffer.duration.toFixed(1)} s).`;
    } catch (err) {
      console.error('Making a sound from the beat failed:', err);
      el.libNote.textContent = `That didn't work (${err.message || err.name}). Try again.`;
    } finally {
      el.libSound.disabled = false;
    }
  }

  el.libSound.addEventListener('click', saveAsSound);

  // Bars: how long the whole beat is before it starts over. Rows keep pills
  // they had in bars that are no longer shown, so going back loses nothing.
  function setBars(bars) {
    if (!pattern || !BAR_CHOICES.includes(bars)) return;
    pattern.bars = bars;
    save();
    render();
  }
  el.bars.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bars]');
    if (!b) return;
    setBars(Number(b.dataset.bars));
    el.bars.querySelector(`[data-bars="${pattern.bars}"]`)?.focus();
  });
  // The time signature is the beat's own. Pills keep their places, so a
  // beat changed to 3/4 and back to 4/4 is as it was.
  function setSignature(sig) {
    if (!pattern || !Object.hasOwn(SIGNATURES, sig)) return;
    pattern.signature = sig;
    save();
    render();
  }
  el.sigs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sig]');
    if (!b) return;
    setSignature(b.dataset.sig);
    el.sigs.querySelector(`[data-sig="${CSS.escape(pattern.signature)}"]`)?.focus();
  });

  setupDialog(el.chooser);
  setupDialog(el.library);
  setupDialog(el.grooves);
  el.grooves.addEventListener('close', stopSample);

  // ── Recording into the beat, for the keys ──

  // Where the beat is, for snapping hits: pill 0's time, a pill's length,
  // the pills in the whole beat, and each row's speed.
  function beatClock() {
    return { t0, step: baseStep(), total: total(), rates: (pattern?.rows ?? []).map((r) => (playMode() === 'speed' ? r.rate : 1)) };
  }
  // The row for a sound: its first unmuted row, else a muted one (unmuted:
  // the kid is playing it), else a new row. -1 when the beat is full.
  // When the beat is full, a row with no hits makes way for the new sound
  // (Ben, 2026-10-11), unless it is in `avoid` (rows hit in this recording
  // that haven't landed yet). It is reused in place, so no row moves.
  function rowFor(clipId, avoid = new Set()) {
    let i = pattern.rows.findIndex((r) => r.clipId === clipId && !r.muted);
    if (i < 0) {
      i = pattern.rows.findIndex((r) => r.clipId === clipId);
      if (i >= 0) pattern.rows[i].muted = false;
    }
    if (i < 0) {
      i = rowSlot(pattern.rows, MAX_ROWS, avoid);
      if (i < 0) return -1;
      pattern.rows[i] = cleanRow({ clipId, steps: [] });
      if (playing()) prepare(deps.clipById(clipId));
    }
    return i;
  }
  // The keys view: the row for this sound, made now (empty) if it has none, and
  // saved (Ben, 2026-10-12: pressing an instrument makes its row appear). A
  // full beat reuses an empty row not in `avoid`; -1 when there is none.
  function addRowFor(clipId, avoid = new Set()) {
    if (!pattern) return -1;
    let i = pattern.rows.findIndex((r) => r.clipId === clipId);
    if (i >= 0) return i;
    i = rowSlot(pattern.rows, MAX_ROWS, avoid);
    if (i < 0) return -1;
    pattern.rows[i] = cleanRow({ clipId, steps: [] });
    if (playing()) prepare(deps.clipById(clipId));
    save();
    render();
    return i;
  }
  // Turns snapped pills on (never off), saves, redraws. A pill still to come
  // in this pass was just heard live, so the beat skips it once.
  function addSnaps(snaps, { skipAfter = Infinity } = {}) {
    let lit = 0;   // pills that were off: what the kid added
    for (const { row, step, n } of snaps) {
      const r = pattern.rows[row];
      if (!r) continue;
      if (!r.steps[step]) lit++;
      r.steps[step] = true;
      // Into a tune row, a key plays its sound's own note: a note a pill long.
      if (r.melody && !r.tune.some((o) => Math.floor(o.s) === step)) pattern.rows[row] = cleanRow({ ...r, tune: addNote(r.tune, 0, step, 1)?.tune ?? r.tune });
      const at = t0 + n * stepSeconds(pattern, r, playMode());
      if (playing() && at > skipAfter) skips.push({ row, at });
    }
    save();
    render();
    return lit;
  }
  const snapshot = () => structuredClone(pattern);
  function restore(copy) {
    const was = playing();
    stop();
    pattern = cleanPattern(copy, copy.personId);
    save();
    render();
    if (was) play();
  }
  // The click: the Beats screen's ⏲️ keeps it on while the beat plays. While
  // The keys records, its own ⏲️ Click track alone decides (setClick(on));
  // setClick(null) hands it back. Nothing turns it on by itself (Ben,
  // 2026-10-11: it played with the toggle off).
  let clickWanted = recall('beat-click') === '1';
  let clickOverride = null;
  const setClick = (on) => { clickOverride = on; clickOn = on ?? clickWanted; };
  function showClick() {
    if (!el.click) return;
    el.click.setAttribute('aria-pressed', String(clickWanted));
  }
  el.click?.addEventListener('click', () => {
    clickWanted = !clickWanted;
    remember('beat-click', clickWanted ? '1' : '');
    if (clickOverride === null) clickOn = clickWanted;
    showClick();
  });
  // A pill tapped (or held, `loud`) elsewhere: the keys' grid.
  // A tune row's pill opens 🎹 the roll instead.
  function cyclePill(r, s, loud = false) {
    const row = pattern?.rows[r];
    if (!row) return;
    if (row.melody) { openRoll(r, s); return; }
    if (loud) holdPill(row, s); else tapPill(row, s);
    save();
    render();
  }
  const beat = () => pattern;

  // ── For Song mode: any saved beat, planned and sounded as play() would ──

  // Pills in one bar of a saved beat: its own time signature, as sigOf()
  // reads the open beat's.
  const barOf = (raw) => barSteps(Object.hasOwn(SIGNATURES, raw?.signature) ? raw.signature : (advanced ? oldSignature : '4/4'));
  // A saved beat once through: its length in seconds (its own tempo, bars and
  // bar length) and every hit in it, as bounce() renders them.
  function beatPlan(raw) {
    const p = cleanPattern(raw, raw.personId);
    const steps = barOf(raw);
    const seconds = steps * p.bars * (60 / p.bpm / STEPS_PER_BEAT);
    const hits = planHits(p, playMode(), seconds, steps, advanced ? p.swing || 0 : 0);
    return { pattern: p, seconds, hits };
  }
  // Loads every sound the beats use (fresh: a voice may have changed).
  function prepareBeats(patterns) {
    ready.clear();
    return Promise.all(patterns.flatMap((p) => p.rows.map((r) => prepare(deps.clipById(r.clipId)))));
  }
  // Sounds row i of beat `p` at `time` into `dest`, cutting off or
  // overlapping the row's earlier hits in `list`. False if its sound is gone.
  function soundHit(ctx, dest, list, p, i, time, loud, note, len = 0) {
    const loaded = ready.get(p.rows[i]?.clipId);
    if (!loaded) return false;
    sound(ctx, busFor(ctx, dest, p).input(i), list, p.rows[i], loaded, time, loud, note, len);
    return true;
  }

  return { setPerson, show, tempo: () => shape().bpm, render, play, stop, playing, grid, beatClock, rowFor, addRowFor, addSnaps, snapshot, restore, setClick, beat,
    cyclePill, clearRow, dropRow, toggleRing, ringTool, openLibrary, metronome, clickAt, setGrow, setTempo, setBars, setSignature, signature: () => sigOf(), advanced: () => advanced,
    beatPlan, prepareBeats, soundHit, thumbnail, levelOf, setLevel, putLevel, toggleMute, levelState,
    trying, putTrialAway, keep, onScratch, sampling: () => sample?.id ?? null,
    lockChips, queuedBeat: () => (queued ? { ...queued } : null), openMixer, toggleSolo, setFx: setRowFx, setMaster, setMasterFx,
    openRoll, rollRow: () => roll?.row() ?? -1 };
}
