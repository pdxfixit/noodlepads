// 🎼 Song as a playlist (ADR 0024): the pure part. A song has a tempo of its
// own and up to 8 lanes; a lane holds blocks, each a saved beat placed at a
// bar and repeated a whole number of times. Lanes play together, every block
// at the song's tempo, which tempo marks may change from a bar on (ADR
// 0031). No DOM, no audio, no storage: song.js draws and plays what this
// works out.
//
// Time is counted in song bars: one bar of 4/4 (16 pills), each bar at the
// tempo playing there. A beat plays as it loops on Beats, pass after pass with no gap, so
// a 2-bar beat takes 2 song bars a pass and a 3/4 beat three quarters of one.
// A block covers the whole bars it reaches into. `stepsOf(beatId)` says how
// many pills one pass of a beat is (its bars × its bar's pills), or null when
// the beat is gone; a gone beat's block keeps one bar a pass and is skipped.
//
// Blocks on one lane never overlap when a kid places or stretches them. A
// beat made longer later, or two devices' edits merged, can still make one
// run into the next: the later block wins, and the earlier is cut where it
// starts.

import { cleanVolume } from './row-volume.js';
import { cutName, numbered } from './names.js';
import { barSteps } from './old-beats.js';
import { newId } from './util.js';

export const MAX_LANES = 8;
export const START_LANES = 4;            // a new song's lanes; ➕ Add a lane adds up to MAX_LANES
export const PHONE_LANES = 4;            // lanes in view at once on a phone; the rest scroll
export const MAX_BLOCKS = 64;            // per lane
export const MAX_TIMES = 64;             // a block's repeats
export const MAX_SONG_BARS = 128;        // the furthest a block may reach
export const MIN_VIEW_BARS = 16;         // bars drawn even for an empty song
export const SPARE_BARS = 8;             // empty bars drawn after the last block, to place more
export const BAR_STEPS = 16;             // pills in a song bar: one bar of 4/4
export const MIN_TEMPO = 60;
export const MAX_TEMPO = 180;
export const DEFAULT_TEMPO = 100;
export const MAX_TEMPO_MARKS = 32;       // tempo changes in one song
export const MAX_SONG_SECONDS = 180;     // the longest song that can be saved as a sound
export const SONG_ID = /^song-[a-z0-9-]{1,48}$/;
// Older copies read `slots` (ADR 0006, 0007): a song saves a list of its
// blocks in that shape too, at most this many, each played at most 4 times.
const LEGACY_SLOTS = 16;
const LEGACY_TIMES = 4;
// A saved beat's id, as sequencer.js BEAT_ID (tests/playlist.test.mjs checks they match).
export const BEAT_REF = /^beat-[a-z0-9-]{1,48}$/;

// Each lane's fun default name and picture, by its place.
export const LANE_DEFAULTS = [
  { emoji: '🥁', name: 'Drums' }, { emoji: '🎸', name: 'Bass' }, { emoji: '🎹', name: 'Keys' }, { emoji: '🎤', name: 'Voice' },
  { emoji: '✨', name: 'Sparkle' }, { emoji: '🔔', name: 'Bells' }, { emoji: '👏', name: 'Claps' }, { emoji: '🎺', name: 'Horns' },
];
// The short list in a lane's picture chooser ("…" opens every emoji).
export const LANE_EMOJI = ['🥁', '🎸', '🎹', '🎤', '✨', '🔔', '👏', '🎺', '🎻', '🎷', '🪘', '🪇', '🎧', '🐸', '🚀', '🌈', '👾', '🦄', '🔥', '⭐'];
export const MAX_LANE_NAME = 16;

const int = (v, min, max, fallback) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback);

export const cleanTempo = (v) => (Number.isFinite(v) ? Math.round(Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, v))) : DEFAULT_TEMPO);

// A short picture: one emoji (a few code points at most), else none.
const cleanEmoji = (v) => (typeof v === 'string' && v.trim() && [...v.trim()].length <= 8 && !/[<>&"'\s]/.test(v.trim()) ? v.trim() : null);

export const defaultLane = (i) => ({ ...LANE_DEFAULTS[i % LANE_DEFAULTS.length], muted: false, volume: 1, blocks: [] });
export const newLanes = (n = START_LANES) => Array.from({ length: n }, (_, i) => defaultLane(i));

// One block, safe: a beat id, a bar and its repeats. Null when unusable.
export function cleanBlock(raw) {
  if (!BEAT_REF.test(raw?.beatId)) return null;
  return { beatId: raw.beatId, bar: int(raw.bar, 0, MAX_SONG_BARS - 1, 0), times: int(raw.times, 1, MAX_TIMES, 1) };
}

// A lane as stored, made safe: a name and picture (its place's default when
// missing), mute, volume, and its blocks in bar order, one per bar.
export function cleanLane(raw, i = 0) {
  const d = LANE_DEFAULTS[i % LANE_DEFAULTS.length];
  const name = typeof raw?.name === 'string' && raw.name.trim() ? cutName(raw.name.trim(), MAX_LANE_NAME) : d.name;
  const seen = new Set();
  const blocks = (Array.isArray(raw?.blocks) ? raw.blocks : []).map(cleanBlock).filter(Boolean)
    .sort((a, b) => a.bar - b.bar)
    .filter((b) => (seen.has(b.bar) ? false : seen.add(b.bar)))
    .slice(0, MAX_BLOCKS);
  return { name, emoji: cleanEmoji(raw?.emoji) ?? d.emoji, muted: raw?.muted === true, volume: cleanVolume(raw?.volume), blocks };
}

// A song's lanes, made safe: 1 to 8 of them.
export function cleanLanes(raw) {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_LANES) : [];
  return list.length ? list.map((l, i) => cleanLane(l, i)) : newLanes();
}

// ── Tempo marks (ADR 0031) ──
//
// A song plays at its own `tempo` from bar 1. Marks change it from a bar on:
// `tempos: [{bar, bpm}]`, bars counted from 1 as the ruler shows them, so a
// mark's bar is 2 or later. Every lane plays at the tempo of the bar it is
// in, so bar lines stay lined up across lanes. Absent or empty: one tempo.

// A song's marks, made safe: each a whole bar from 2 to MAX_SONG_BARS and a
// whole BPM in the song tempo range; in bar order, one per bar (the first
// kept), at most MAX_TEMPO_MARKS. Anything else is dropped, never moved.
// `song` is the record they belong to: a song from before the playlist
// (slots, no lanes) has no bars, so it has no marks. Loading, merging and
// backups all clean marks with this.
export function cleanTempos(raw, song = null) {
  if (!Array.isArray(raw) || (song && !Array.isArray(song.lanes))) return [];
  const seen = new Set();
  const out = [];
  for (const m of raw) {
    const bar = m?.bar;
    const bpm = Number.isFinite(m?.bpm) ? Math.round(m.bpm) : NaN;
    if (!Number.isInteger(bar) || bar < 2 || bar > MAX_SONG_BARS || seen.has(bar)) continue;
    if (!(bpm >= MIN_TEMPO && bpm <= MAX_TEMPO)) continue;
    seen.add(bar);
    out.push({ bar, bpm });
  }
  return out.sort((a, b) => a.bar - b.bar).slice(0, MAX_TEMPO_MARKS);
}

// The tempo playing in `bar` (counted from 1) of `song`: its own tempo, or
// the last mark at or before that bar.
export function tempoAt(song, bar) {
  let bpm = cleanTempo(song?.tempo);
  for (const m of cleanTempos(song?.tempos)) {
    if (m.bar > bar) break;
    bpm = m.bpm;
  }
  return bpm;
}

// Marks with one put in: `mark` ({bar, bpm}) replaces any mark at its bar,
// and the mark at `fromBar` (the one being changed) goes. Made safe.
export function putTempo(tempos, mark, fromBar = null) {
  const rest = (Array.isArray(tempos) ? tempos : []).filter((m) => m?.bar !== mark?.bar && m?.bar !== fromBar);
  return cleanTempos([mark, ...rest]);
}
export const removeTempo = (tempos, bar) => cleanTempos((Array.isArray(tempos) ? tempos : []).filter((m) => m?.bar !== bar));

// The song's clock: where each bar starts, every bar at its own tempo.
// Positions are in pills from the song's start (16 a bar), so a 3/4 beat's
// pass that runs across a mark speeds up where the bar does.
//   steady         no marks: the arithmetic of one tempo
//   pill           seconds a pill lasts at bar 1's tempo (beats are planned at it)
//   barSeconds     how long bar 1 lasts
//   tempoOf(i)     the BPM of bar i (from 0)
//   barStart(i)    seconds to the start of bar i (from 0)
//   at(p)          seconds to pill position p (a fraction is fine)
//   barAt(t)       the bar position (from 0, a fraction) `t` seconds in
export function songClock(song) {
  const base = cleanTempo(song?.tempo);
  const marks = cleanTempos(song?.tempos);
  const pill = 60 / base / 4;
  const barSeconds = BAR_STEPS * pill;
  if (!marks.length) {
    return {
      steady: true, pill, barSeconds, tempoOf: () => base,
      barStart: (i) => i * barSeconds, at: (p) => p * pill, barAt: (t) => t / barSeconds,
    };
  }
  // Bar i's tempo, for every bar a block can reach and one past it.
  const tempos = [];
  let bpm = base;
  for (let i = 0, m = 0; i <= MAX_SONG_BARS; i++) {
    while (m < marks.length && marks[m].bar - 1 <= i) bpm = marks[m++].bpm;
    tempos.push(bpm);
  }
  const length = (i) => (BAR_STEPS * 15) / tempos[Math.min(MAX_SONG_BARS, i)];   // a bar's seconds
  const starts = [0];
  for (let i = 0; i < MAX_SONG_BARS; i++) starts.push(starts[i] + length(i));
  const tempoOf = (i) => tempos[Math.min(MAX_SONG_BARS, Math.max(0, Math.floor(i)))];
  const barStart = (i) => (i <= MAX_SONG_BARS ? starts[Math.max(0, i)] : starts[MAX_SONG_BARS] + (i - MAX_SONG_BARS) * length(MAX_SONG_BARS));
  const at = (p) => {
    if (p <= 0) return p * pill;
    const i = Math.min(MAX_SONG_BARS, Math.floor(p / BAR_STEPS));
    return barStart(i) + ((p - i * BAR_STEPS) * 15) / tempos[i];
  };
  const barAt = (t) => {
    if (t <= 0) return t / barSeconds;
    let lo = 0;
    let hi = MAX_SONG_BARS;
    while (lo < hi) {   // the last bar starting at or before t
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return lo + (t - starts[lo]) / length(lo);
  };
  return { steady: false, pill, barSeconds, tempoOf, barStart, at, barAt };
}

// What a mix needs to keep an Echo on the beat in time across the marks
// (mixer.js followChanges): `start`, the BPM at `from` seconds into the song;
// `marks`, each later mark as {time (seconds after `from`), bpm}; `origin`,
// where `from` sits on the audio clock (the player sets it; 0 offline). Null
// when the song has no marks, so a song with one tempo plays as it always did.
export function tempoFollow(song, from = 0, clock = songClock(song)) {
  const marks = cleanTempos(song?.tempos);
  if (!marks.length) return null;
  let start = cleanTempo(song?.tempo);
  const later = [];
  for (const m of marks) {
    const time = clock.barStart(m.bar - 1) - from;
    if (time > 1e-9) later.push({ time, bpm: m.bpm }); else start = m.bpm;
  }
  return { start, marks: later, origin: 0 };
}

// ── Time ──

const passSteps = (stepsOf, beatId) => {
  const s = stepsOf(beatId);
  return Number.isFinite(s) && s > 0 ? s : BAR_STEPS;
};
// How many bars `times` passes of a beat `steps` pills long cover.
export const blockBars = (steps, times) => Math.max(1, Math.ceil((steps * times) / BAR_STEPS - 1e-9));
// The bars a block covers: [start, end).
export function blockSpan(block, stepsOf) {
  return { start: block.bar, end: block.bar + blockBars(passSteps(stepsOf, block.beatId), block.times) };
}

// The block on `lane` covering `bar`, as its index, or -1.
export function blockAt(lane, bar, stepsOf) {
  return lane.blocks.findIndex((b) => { const s = blockSpan(b, stepsOf); return bar >= s.start && bar < s.end; });
}
// Where the next block after `bar` starts on `lane` (not counting block
// `skip`), or the end of the song's room.
function nextStart(lane, bar, skip = -1) {
  const after = lane.blocks.filter((b, i) => i !== skip && b.bar > bar).map((b) => b.bar);
  return Math.min(MAX_SONG_BARS, ...after);
}

// A beat dropped at `bar` on `lane`, played once: the new lane and the new
// block's index, or {why} when it can't go there: 'taken' (a block is
// there), 'room' (one pass would run into the next block or past the end)
// or 'full' (the lane has as many blocks as it may).
export function placeBlock(lane, bar, beatId, stepsOf) {
  if (!BEAT_REF.test(beatId) || !Number.isInteger(bar) || bar < 0 || bar >= MAX_SONG_BARS) return { why: 'room' };
  if (blockAt(lane, bar, stepsOf) >= 0) return { why: 'taken' };
  if (lane.blocks.length >= MAX_BLOCKS) return { why: 'full' };
  if (bar + blockBars(passSteps(stepsOf, beatId), 1) > nextStart(lane, bar)) return { why: 'room' };
  const blocks = [...lane.blocks, { beatId, bar, times: 1 }].sort((a, b) => a.bar - b.bar);
  return { lane: { ...lane, blocks }, index: blocks.findIndex((b) => b.bar === bar) };
}

// The most times block `i` may repeat before it would run into the next
// block on its lane (or past the end): at least 1.
export function maxTimes(lane, i, stepsOf) {
  const b = lane.blocks[i];
  const steps = passSteps(stepsOf, b.beatId);
  const room = nextStart(lane, b.bar, i) - b.bar;
  return Math.max(1, Math.min(MAX_TIMES, Math.floor((room * BAR_STEPS) / steps + 1e-9)));
}

// Block `i` set to repeat `times` (kept between 1 and what fits): the new lane.
export function setTimes(lane, i, times, stepsOf) {
  const b = lane.blocks[i];
  if (!b) return lane;
  const t = Math.min(maxTimes(lane, i, stepsOf), Math.max(1, Math.round(times) || 1));
  if (t === b.times) return lane;
  return { ...lane, blocks: lane.blocks.map((x, j) => (j === i ? { ...x, times: t } : x)) };
}

// Dragging a block's end: the repeats that bring its end nearest bar
// `endBar` (a fraction while the finger moves), at least one pass.
export function timesForEnd(block, endBar, stepsOf) {
  const steps = passSteps(stepsOf, block.beatId);
  return Math.max(1, Math.round(((endBar - block.bar) * BAR_STEPS) / steps));
}

export const removeBlock = (lane, i) => ({ ...lane, blocks: lane.blocks.filter((_, j) => j !== i) });

// Where the song ends, in bars (0 for an empty song).
export function songBars(lanes, stepsOf) {
  let end = 0;
  for (const lane of lanes) for (const b of lane.blocks) end = Math.max(end, blockSpan(b, stepsOf).end);
  return end;
}
// How many bars to draw: room after the last block to place more, in whole
// lines of four, never fewer than MIN_VIEW_BARS.
export function viewBars(lanes, stepsOf) {
  const want = Math.max(MIN_VIEW_BARS, songBars(lanes, stepsOf) + SPARE_BARS);
  return Math.min(MAX_SONG_BARS, Math.ceil(want / 4) * 4);
}

// The song in time: one part per pass of each block, every lane, in start
// order. A pass is cut where the next block on its lane starts. `clock` is
// songClock(song), or a plain tempo for one with no marks. Returns {parts:
// [{lane, block, beatId, pass, times, start, end, from, to}], seconds (the
// song's length, up to the next bar line), barSeconds, clock}: start and end in seconds, from and to in pills from
// the song's start. Blocks of a gone beat are left out.
export function playParts(lanes, stepsOf, clock) {
  const c = typeof clock?.at === 'function' ? clock : songClock({ tempo: clock });
  const parts = [];
  let seconds = 0;
  lanes.forEach((lane, li) => {
    lane.blocks.forEach((b, bi) => {
      const steps = stepsOf(b.beatId);
      if (!(steps > 0)) return;
      const next = lane.blocks.filter((x) => x.bar > b.bar).reduce((m, x) => Math.min(m, x.bar), Infinity);
      const stop = next === Infinity ? Infinity : next * BAR_STEPS;
      for (let pass = 0; pass < b.times; pass++) {
        const from = b.bar * BAR_STEPS + pass * steps;
        if (from >= stop - 1e-9) break;
        const to = Math.min(stop, from + steps);
        const part = { lane: li, block: bi, beatId: b.beatId, pass: pass + 1, times: b.times, start: c.at(from), end: c.at(to), from, to };
        parts.push(part);
        seconds = Math.max(seconds, part.end);
      }
    });
  });
  parts.sort((a, b) => a.start - b.start || a.lane - b.lane);
  // The song ends on a bar line (producer, council round 1, 2026-10-27): a
  // beat that is not a whole number of 4/4 bars (3/4, 6/8, 5/4, 7/8) rests
  // out the bar its last pass reaches into, so the playhead ends where its
  // block does and a saved song is whole bars, as a studio would loop it.
  // Nothing before the end moves: blocks already start on bar lines.
  if (parts.length) seconds = c.barStart(Math.ceil(c.barAt(seconds) - 1e-9));
  return { parts, seconds, barSeconds: c.barSeconds, clock: c };
}

// Every hit of the song, in time order: each part's beat's hits (planned at
// bar 1's tempo: `plans` maps a beat id to {hits: [{row, time, loud, note,
// len}]}), moved to where the part starts, and cut at its end. With tempo
// marks (`clock`, from playParts), a hit lands where its pill falls on the
// song's clock, and a held note stretches or shrinks with the bars it
// covers. `from` (in seconds) leaves out what comes before it and starts the
// clock there.
export function playEvents(parts, plans, { from = 0, skipLanes = new Set(), clock = null } = {}) {
  const marked = !!clock && !clock.steady;
  const events = [];
  for (const part of parts) {
    if (skipLanes.has(part.lane) || part.end <= from) continue;
    for (const h of plans.get(part.beatId)?.hits ?? []) {
      let time = part.start + h.time;
      let len = h.len;
      if (marked) {
        const at = part.from + h.time / clock.pill;
        time = clock.at(at);
        if (h.len) len = clock.at(at + h.len / clock.pill) - time;
      }
      if (time >= part.end - 1e-9 || time < from - 1e-9) continue;
      events.push({ time: time - from, lane: part.lane, beatId: part.beatId, row: h.row, loud: h.loud, note: h.note, len });
    }
  }
  return events.sort((a, b) => a.time - b.time || a.lane - b.lane || a.row - b.row);
}

// The blocks sounding `t` seconds into the song: a Set of "lane:block".
export function playingAt(parts, t) {
  return new Set(parts.filter((p) => t >= p.start && t < p.end).map((p) => `${p.lane}:${p.block}`));
}

// ── Old songs and older copies ──

// An old song's slots (one lane of beats in a row, ADR 0006/0007) as lanes:
// each slot becomes a block on lane 1, right after the one before.
export function slotsToLanes(slots, stepsOf) {
  const lanes = newLanes();
  let bar = 0;
  for (const s of Array.isArray(slots) ? slots : []) {
    if (!BEAT_REF.test(s?.beatId) || lanes[0].blocks.length >= MAX_BLOCKS) continue;
    const times = int(s.times, 1, MAX_TIMES, 1);
    const bars = blockBars(passSteps(stepsOf, s.beatId), times);
    if (bar + bars > MAX_SONG_BARS) break;
    lanes[0].blocks.push({ beatId: s.beatId, bar, times });
    bar += bars;
  }
  return lanes;
}

// The slots an older copy of the app reads: every block in time order (lane
// order within a bar), at most 16, each at most ×4. It plays them one after
// another, each at its beat's own tempo: not the song, but its beats.
export function legacySlots(lanes) {
  return lanes.flatMap((lane, li) => lane.blocks.map((b) => ({ ...b, li })))
    .sort((a, b) => a.bar - b.bar || a.li - b.li)
    .slice(0, LEGACY_SLOTS)
    .map((b) => ({ beatId: b.beatId, times: Math.min(LEGACY_TIMES, b.times) }));
}

// Every beat a stored song uses, new shape or old, once each, in order.
export function songBeatIds(song) {
  const ids = Array.isArray(song?.lanes)
    ? song.lanes.flatMap((l) => (Array.isArray(l?.blocks) ? l.blocks : []).map((b) => b?.beatId))
    : (Array.isArray(song?.slots) ? song.slots : []).map((s) => s?.beatId);
  return [...new Set(ids.filter((id) => typeof id === 'string'))];
}

// A stored song with its beats renamed by `fn(beatId)` (a new id, or null to
// drop that block or slot), in its lanes and its slots alike.
export function mapSongBeats(song, fn) {
  const out = { ...song };
  if (Array.isArray(song?.slots)) out.slots = song.slots.map((s) => ({ ...s, beatId: fn(s?.beatId) })).filter((s) => s.beatId);
  if (Array.isArray(song?.lanes)) {
    out.lanes = song.lanes.map((l) => ({ ...l, blocks: (Array.isArray(l?.blocks) ? l.blocks : []).map((b) => ({ ...b, beatId: fn(b?.beatId) })).filter((b) => b.beatId) }));
  }
  return out;
}

// Does a stored song have anything in it?
export const songHasBeats = (song) => songBeatIds(song).length > 0;

// ── A song as a record, and planned to play ──

// Pills in one pass of a saved beat: its bar (its own time signature, 4/4
// when it has none) times its bars, so a pass is as long as its plan (the beat
// maker's barOf). Null when the beat is gone. A beat saved before each had a
// signature was stamped with its old one as it was stored (old-beats.js).
export function beatSteps(beat) {
  if (!beat) return null;
  return barSteps(beat.signature) * ([1, 2, 4].includes(beat.bars) ? beat.bars : 1);
}

// A song as stored (or read from a backup), made safe to use: {id?,
// personId, name, tempo, tempos?, lanes, slots}. `tempos` (its tempo marks,
// ADR 0031) is left out when there are none, as a song from before them is.
// Null when it belongs to nobody. A song from before the playlist has only
// slots: they become blocks on lane 1, one after another, and the song's
// tempo is its first beat's.
// `beatOf(beatId)` finds a saved beat, for those lengths and that tempo.
// `slots` is written for older copies of the app (playlist.js legacySlots).
// A song from before the list (one per person) has no id; linkSong gives it one.
export function cleanSong(raw, nameFor = () => 'Song', beatOf = () => null) {
  if (typeof raw?.personId !== 'string' || !raw.personId) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? cutName(raw.name.trim()) : nameFor();
  let lanes;
  let tempo;
  if (Array.isArray(raw.lanes)) {
    lanes = cleanLanes(raw.lanes);
    tempo = cleanTempo(raw.tempo);
  } else {
    lanes = slotsToLanes(raw.slots, (id) => beatSteps(beatOf(id)));
    const first = lanes[0].blocks[0];
    tempo = cleanTempo(Number(beatOf(first?.beatId)?.bpm) || DEFAULT_TEMPO);
  }
  const tempos = cleanTempos(raw.tempos, raw);
  const song = { personId: raw.personId.slice(0, 64), name, tempo, ...(tempos.length ? { tempos } : {}), lanes, slots: legacySlots(lanes) };
  return SONG_ID.test(raw.id) ? { id: raw.id, ...song } : song;
}

// The open song with an id: its own, else the saved song of the same name
// (a song kept before songs were a list, already in the list), else a new id.
export function linkSong(song, list, makeId = () => newId('song')) {
  if (song.id) return song;
  const same = list.find((s) => s.name.toLowerCase() === song.name.toLowerCase());
  return { id: same?.id ?? makeId(), ...song };
}

// A name no other song in `list` has (except the song `exceptId`): "Ditty 2".
export function uniqueSongName(name, list, exceptId) {
  return numbered(name, list.filter((s) => s.id !== exceptId).map((s) => s.name));
}

// The song planned to play: each beat it uses planned once at the song's
// tempo (`seq.beatPlan`), its parts, and its hits from `from` seconds on,
// every bar at the tempo marked for it (`clock`, playlist.js songClock).
// `beatOf(beatId)` finds a saved beat. Used to play, to save as a sound,
// and for a share's preview (share-render.js).
export function planSong(song, beatOf, seq, { from = 0, skipMuted = false } = {}) {
  const plans = new Map();
  for (const lane of song.lanes) {
    for (const b of lane.blocks) {
      const beat = beatOf(b.beatId);
      if (beat && !plans.has(beat.id)) plans.set(beat.id, seq.beatPlan({ ...beat, bpm: song.tempo }));
    }
  }
  const clock = songClock(song);
  // Every beat's mix keeps its Echo on the beat in time with the marks. One
  // object, so the player can say where the song starts on the clock (`origin`).
  const follow = tempoFollow(song, from, clock);
  if (follow) for (const plan of plans.values()) plan.pattern.follow = follow;
  const { parts, seconds, barSeconds } = playParts(song.lanes, (id) => (plans.has(id) ? beatSteps(beatOf(id)) : null), clock);
  const skipLanes = new Set(skipMuted ? song.lanes.flatMap((l, i) => (l.muted || cleanVolume(l.volume) === 0 ? [i] : [])) : []);
  return { plans, parts, seconds, barSeconds, clock, follow, events: playEvents(parts, plans, { from, skipLanes, clock }) };
}

// Sounds every event of a planned song into `dest` from `t0`, each lane
// through `laneGains[lane]`. Returns how many hits sounded.
export function soundSong(ctx, laneGains, planned, seq, t0 = 0) {
  const lists = new Map();
  let hits = 0;
  for (const e of planned.events) {
    const key = `${e.lane}:${e.beatId}:${e.row}`;
    if (!lists.has(key)) lists.set(key, []);
    if (seq.soundHit(ctx, laneGains[e.lane], lists.get(key), planned.plans.get(e.beatId).pattern, e.row, t0 + e.time, e.loud, e.note, e.len)) hits++;
  }
  return hits;
}
