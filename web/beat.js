// The beat maker's pure rules: a beat as stored and made safe (cleanPattern,
// cleanRow), its time signatures and bars, swing, the hits a beat plans
// (planHits), the starter grooves as beats, a beat file, tempo stops, and
// the little decisions the screen asks (which sound a new row takes, which
// pill an arrow key reaches, whether a beat is saved). No screen, DOM,
// storage or sound in it (outputDelay only reads the latency fields of an
// AudioContext it is handed), so the backup gate, 🧸 Kids' rules, the listener,
// 🎼 Song and the share preview load it without loading the beat maker
// (docs/design/simplify.md S5). sequencer.js is the screen on top of it.

import { instrumentsFor, instrumentById, presetInstrument, PLAYED, FAMILIES, rateOf } from './instruments.js';
import { cleanVolume, rowLevel } from './row-volume.js';
import { cleanFx, masterLevel, silencedBySolo } from './mixer.js';
import { MELODY_NOTES, cleanNotes, fromLegacy, legacy, startsIn, addNote, lineOf, sameNotes, multiplyNotes } from './notes.js';
import { cutName } from './names.js';
import { kitIdOf } from './model.js';
import { SIGNATURES, barSteps } from './old-beats.js';

export const STEPS = 16;         // a bar of 4/4, the simple beat maker
export const MAX_STEPS = 20;     // the longest bar (5/4)
export const BAR_CHOICES = [1, 2, 4];                   // how many bars a beat can be
export const MAX_PILLS = MAX_STEPS * Math.max(...BAR_CHOICES);  // the most pills a row can hold
// What the beat bar gives way to, in order (lines.js fitLine): its tools'
// own row above the title, then tighter words on that row, then each word
// under its emoji.
export const BEAT_BAR_STEPS = ['fit-split', 'fit-tight', 'fit-stack'];

// Time signatures (old-beats.js), one per beat (pattern.signature).
export { SIGNATURES, barSteps };
export const STEPS_PER_BEAT = 4;
export const MAX_ROWS = 16;   // Ben, 2026-10-11: room to grow; the keys view also reuses an empty row when full
export const DEFAULT_BPM = 100;
export const MIN_BPM = 60;
export const MAX_BPM = 180;
// Tempos most music uses. On the tempo slider each takes TEMPO_PULL times the
// travel of the tempos between, so a slide lands on them, yet every tempo in
// between can still be reached (or typed).
export const COMMON_BPMS = [60, 70, 80, 90, 100, 110, 120, 128, 130, 140, 150, 160, 170, 180];
const TEMPO_PULL = 16;
// Swing: the off-beat eighth notes (the "and" of each beat) play late by
// swing/100 of an eighth, so 33 is the triplet feel and 50 the harder shuffle
// (Ben, 2026-10-26). A beat is 4 pills; the pill between (a sixteenth) moves
// with it, by half as much, so a hat on every pill bounces too and no two
// pills land together. 0 is straight; MAX_SWING is a heavy shuffle.
export const MAX_SWING = 50;
export const BEAT_ID = /^beat-[a-z0-9-]{1,48}$/;
// How late a pill sounds, in seconds: `dt` is the pill's length. `groups` is
// the time signature's (SIGNATURES): a 4-pill group is a beat, so its pill 2
// (the "and") moves two pills' worth and its pills 1 and 3 one. A 6-pill
// group (6/8, 7/8) is already a rolling feel: only its odd pills move, by one.
// No `groups` means beats of 4.
export function swingDelay(step, dt, swing, groups) {
  if (!swing) return 0;
  let at = step % STEPS_PER_BEAT;
  let size = STEPS_PER_BEAT;
  if (groups) {
    at = step % groups.reduce((a, b) => a + b, 0);
    for (const g of groups) {
      if (at < g) { size = g; break; }
      at -= g;
    }
  }
  const pills = at % 2 === 1 ? 1 : (size === STEPS_PER_BEAT && at === 2 ? 2 : 0);
  return (swing / 100) * pills * dt;
}
// The output's delay: how long after the audio clock's time a sound comes
// out of the speaker (outputLatency + baseLatency), at most `cap` seconds
// (0.2). The one place that sums them: Beats, Song, the keys' hits and the
// usage events (which take it uncapped, in ms) all call it.
export const outputDelay = (ctx, cap = 0.2) => Math.min(cap, Math.max(0, (ctx?.outputLatency || 0) + (ctx?.baseLatency || 0)));
// The playhead: takes every booked pill ({row, step, time}, `queue` sorted by
// time) heard by audio time `now` from the front of the queue, and puts its
// step in `shown` (per row). Sounds are booked ahead and heard `late` seconds
// after their time, so a pill lights as it is heard, never before. True when
// a row's step changed.
export function stepsHeard(queue, shown, now, late = 0) {
  let changed = false;
  while (queue.length && queue[0].time <= now - late) {
    const { row, step } = queue.shift();
    if (shown[row] !== step) { shown[row] = step; changed = true; }
  }
  return changed;
}
export const ROW_RATES = [1, 2, 0.5];   // a row's speeds (its keys in the sound picker: ½× 1× 2×)
// Tune rows (🎹 the piano roll, ADR 0023): the row's sound plays notes of
// any pitch and length (notes.js).
export const noteRate = rateOf;
export const ACCENT_GAIN = 1.5;        // a loud hit: about 3.5 dB up (the limiter keeps a pile-up from clipping)
// How loud one of a row's hits plays: a loud hit's lift times the row's
// loudness (its speaker, row-volume.js). Live play, Save as a sound, songs
// and share previews all sound hits at this gain.
export const hitGain = (row, loud) => (loud ? ACCENT_GAIN : 1) * rowLevel(row);
// Does a row play at all: not muted, not turned all the way down, and (in
// beat `p`) not silenced by another row's Solo (the 🎚️ Mixer, mixer.js).
export const audible = (row, p = null) => !row.muted && rowLevel(row) > 0 && !(p && silencedBySolo(p, row));
export const RING_MS = 6000;           // a mix graph let go (and a note preview) rings out this long before it is disposed
export const MAX_CHIPS = 8;            // pattern chips under the beat bar: 8 spots
export const MAX_PINS = MAX_CHIPS;     // beats pinned with 📌 in 🗂️ Beats, each taking a spot

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
// `unsigned` is the signature to write into a beat that has none (a beat from
// before each had its own, coming in: old-beats.js); without it such a beat
// stays unsigned and plays as 4/4, which is what a new beat is.
export function cleanPattern(raw, personId, unsigned) {
  const bpm = Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, Number(raw?.bpm) || DEFAULT_BPM)));
  const rows = (Array.isArray(raw?.rows) ? raw.rows : []).slice(0, MAX_ROWS).map(cleanRow);
  const name = typeof raw?.name === 'string' ? cutName(raw.name) : '';
  const bars = BAR_CHOICES.includes(raw?.bars) ? raw.bars : 1;
  const swing = clampInt(raw?.swing, 0, MAX_SWING, 0);
  const id = BEAT_ID.test(raw?.id) ? raw.id : undefined;   // the saved beat this is (open-document model)
  const out = id ? { id, personId, name, bpm, bars, swing, rows } : { personId, name, bpm, bars, swing, rows };
  if (Object.hasOwn(SIGNATURES, raw?.signature)) out.signature = raw.signature;
  else if (Object.hasOwn(SIGNATURES, unsigned)) out.signature = unsigned;
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

// The hits of beat `p` due before `until`, from where its clocks are: pure,
// so Node tests it and every player shares it (docs/design/one-beat-engine.md).
// `at` is {clocks, pass}: a clock per row ({next, step, dt}) and one on the
// beat's plain grid ({next, pill}) for the pills and passes. Returns the hits
// ({row, at, loud, note, len}, `len` in seconds), the pills of the plain grid
// ({pill, at}, swung as the pill's own hits are), the times a new pass starts, and the clocks moved on (new
// objects; `at` is left as it was). A row new since the last call joins a
// row at its speed, else the plain grid. The beat is its own bars: its
// signature's pills a bar, its bars, its swing (`swing`, 0-50). `rows`: the
// row indexes that play (null: all); `mixer` false plays a muted or
// turned-down row too. A row with no pills, or a tempo that gives no pill
// length, books nothing. Beats also asks for `steps` (true): every pill each
// row passes, {row, step, time}, `time` the swung moment it sounds, for the
// playhead; and `skip(row, next, dt)`, which says a pill was already played
// live (🎹 a key tapped into the recording), so its hits are not booked.
export function hitsDue(p, at, until, { mode = 'plain', swing = 0, rows = null, mixer = true, steps = false, skip = null } = {}) {
  const bars = Number.isInteger(p?.bars) && p.bars > 0 ? p.bars : 1;
  const groups = SIGNATURES[p?.signature] || SIGNATURES['4/4'];
  const total = barSteps(p?.signature) * bars;
  const base = 60 / p?.bpm / STEPS_PER_BEAT;
  const hits = [];
  const pills = [];
  const passes = [];
  const passed = [];
  const pass = { ...at.pass };
  const clocks = at.clocks.map((c) => (c ? { ...c } : c));
  if (!(base > 0 && Number.isFinite(base))) return { hits, pills, passes, clocks, pass, steps: passed };
  const solo = (p.rows ?? []).some((r) => r?.solo);   // as audible() reads it, safe for a missing row
  (p.rows ?? []).forEach((row, i) => {
    const dt = stepSeconds(p, row ?? {}, mode);
    if (!(dt > 0 && Number.isFinite(dt))) return;
    // Where it joins is read from the clocks as they came in, before this call moved any on.
    const clock = clocks[i] ??= { ...(at.clocks.find((c) => c && (c.dt ?? dt) === dt) ?? { next: at.pass.next, step: at.pass.pill }), dt };
    clock.dt = dt;
    const playable = row && (row.melody || Array.isArray(row.steps)) && (!rows || rows.has(i)) && (!mixer || (!row.muted && rowLevel(row) > 0 && !(solo && !row.solo)));
    while (clock.next < until) {
      if (clock.step >= total) clock.step = 0;   // the beat got shorter while playing
      const heard = clock.next + swingDelay(clock.step, dt, swing, groups);
      const played = skip?.(i, clock.next, dt);   // asked of every pill, so a skip is used up where it fell
      // A tune row's notes start on the pill or half a pill after it (notes.js); swing moves only the pill.
      if (playable && !played) {
        for (const h of pillHits(row, clock.step)) {
          hits.push({ row: i, at: h.at ? clock.next + h.at * dt : heard, loud: h.loud, note: h.note, len: h.len * dt });
        }
      }
      if (steps) passed.push({ row: i, step: clock.step, time: heard });
      clock.next += dt;
      clock.step = (clock.step + 1) % total;
    }
  });
  while (pass.next < until) {
    pills.push({ pill: pass.pill, at: pass.next + swingDelay(pass.pill, base, swing, groups) });   // swung as its hits are: it lights as it sounds
    pass.next += base;
    pass.pill = (pass.pill + 1) % total;
    if (pass.pill === 0) passes.push(pass.next);
  }
  return { hits, pills, passes, clocks, pass, steps: passed };
}

// Every hit in the first `seconds` of a beat: [{row, step, time, loud,
// note, len}] (len in seconds, 0 for a plain hit), in time order. Playback
// schedules the same hits live; Save as a sound renders these.
export function planHits(pattern, mode, seconds, bar = STEPS, swing = 0, groups) {
  const hits = [];
  const total = bar * (pattern.bars || 1);
  pattern.rows.forEach((row, i) => {
    if (!audible(row, pattern)) return;
    const dt = stepSeconds(pattern, row, mode);
    const count = total;   // every row plays all its pills, every bar, then starts over
    for (let n = 0, t = 0; t < seconds - 1e-9; n++, t = n * dt) {
      const step = n % count;
      for (const h of pillHits(row, step)) {
        hits.push({ row: i, step, time: t + h.at * dt + (h.at ? 0 : swingDelay(step, dt, swing, groups)), loud: h.loud, note: h.note, len: h.len * dt });
      }
    }
  });
  return hits.sort((a, b) => a.time - b.time || a.row - b.row);
}

// A groove's sample in the chooser (▶): one pass of it, cut at 4 s
// (provisional, questions.md Q54), so a slow 4-bar groove is a taste.
export const SAMPLE_SECONDS = 4;
export const sampleSeconds = (pass) => Math.min(pass, SAMPLE_SECONDS);

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

// A beat file (🗂️ Beats → ⬇️ / 📥): one beat as JSON, to move it to another
// copy of the app without a whole backup. Only the shared kit travels: a row
// is saved by its kit sound's id ("kick"), which any copy has; a row of a
// recorded sound can't come along, so it is left out (and counted).
export const BEAT_FILE = 'noodlepads-beat';
// Beat files saved before the 1.0 rename say 'noodle-pads-beat'; they open the same.
const BEAT_FILES = new Set([BEAT_FILE, 'noodle-pads-beat']);
export const MAX_BEAT_FILE_BYTES = 64 * 1024;
export function beatToFile(pattern, kitIds) {
  // Whose kit sound a row plays (model.js kitIdOf): `<person>-lets-go` is "lets-go", not "go".
  const kitOf = (clipId) => kitIdOf(clipId, kitIds, new Set([pattern.personId])) ?? undefined;
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
export function beatFromFile(text, personId, kitIds, unsigned) {
  if (typeof text !== 'string' || text.length > MAX_BEAT_FILE_BYTES) throw new Error('That file is too big to be a beat.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('That isn’t a beat file.'); }
  if (!BEAT_FILES.has(raw?.format) || raw.version !== 1 || !Array.isArray(raw.rows)) throw new Error('That isn’t a beat file.');
  const rows = raw.rows
    .filter((r) => r?.sound === null || kitIds.includes(r?.sound))
    .map((r) => ({ ...r, clipId: r.sound === null ? null : `${personId}-${r.sound}` }));
  return cleanPattern({ ...raw, rows }, personId, unsigned);
}

// A pill's two gestures (Ben, 2026-10-11): a tap switches it on or off, in
// one tap; holding it (HOLD_MS) makes it a loud hit, or a loud one normal.
export function tapPill(row, s) {
  row.accents ??= [];
  row.steps[s] = !row.steps[s];
  row.accents[s] = false;
}
export function holdPill(row, s) {
  row.accents ??= [];
  if (!row.steps[s]) { row.steps[s] = true; row.accents[s] = true; } else row.accents[s] = !row.accents[s];
}

// Where a new sound goes in a beat's rows: a new row at the end while there
// is room (`max`), else the first row with no hits that isn't in `avoid`,
// reused in place so no row moves. While ● Record runs (`emptyFirst`), that
// empty row comes before a new one (Ben, 2026-10-18); outside it, a kid may
// be setting up empty rows on purpose. -1 when no row can take it.
export function rowSlot(rows, max, avoid = new Set(), emptyFirst = false) {
  const empty = rows.findIndex((r, k) => !avoid.has(k) && !r.steps.some(Boolean));
  if (emptyFirst && empty >= 0) return empty;
  return rows.length < max ? rows.length : empty;
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
  return cleanPattern({ name: '', bpm: groove.bpm, bars, signature, swing: groove.swing, rows: out }, personId);
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
