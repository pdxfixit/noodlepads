// 🎼 Song as a playlist (ADR 0024): the pure part. A song has a tempo of its
// own and up to 8 lanes; a lane holds blocks, each a saved beat placed at a
// bar and repeated a whole number of times. Lanes play together, every block
// at the song's tempo. No DOM, no audio, no storage: song.js draws and plays
// what this works out.
//
// Time is counted in song bars: one bar of 4/4 at the song's tempo (16
// pills). A beat plays as it loops on Beats, pass after pass with no gap, so
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
  const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, MAX_LANE_NAME) : d.name;
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

// The song in time at `tempo`: one part per pass of each block, every lane,
// in start order. A pass is cut where the next block on its lane starts.
// Returns {parts: [{lane, block, beatId, pass, times, start, end}], seconds,
// barSeconds}; times in seconds. Blocks of a gone beat are left out.
export function playParts(lanes, stepsOf, tempo) {
  const step = 60 / cleanTempo(tempo) / 4;
  const barSeconds = BAR_STEPS * step;
  const parts = [];
  let seconds = 0;
  lanes.forEach((lane, li) => {
    lane.blocks.forEach((b, bi) => {
      const steps = stepsOf(b.beatId);
      if (!(steps > 0)) return;
      const next = lane.blocks.filter((x) => x.bar > b.bar).reduce((m, x) => Math.min(m, x.bar), Infinity);
      const stop = next === Infinity ? Infinity : next * barSeconds;
      for (let pass = 0; pass < b.times; pass++) {
        const start = b.bar * barSeconds + pass * steps * step;
        if (start >= stop - 1e-9) break;
        const end = Math.min(stop, start + steps * step);
        parts.push({ lane: li, block: bi, beatId: b.beatId, pass: pass + 1, times: b.times, start, end });
        seconds = Math.max(seconds, end);
      }
    });
  });
  parts.sort((a, b) => a.start - b.start || a.lane - b.lane);
  return { parts, seconds, barSeconds };
}

// Every hit of the song, in time order: each part's beat's hits (planned at
// the song tempo: `plans` maps a beat id to {hits: [{row, time, loud, note,
// len}]}), moved to where the part starts, and cut at its end. `from` (in
// seconds) leaves out what comes before it and starts the clock there.
export function playEvents(parts, plans, { from = 0, skipLanes = new Set() } = {}) {
  const events = [];
  for (const part of parts) {
    if (skipLanes.has(part.lane) || part.end <= from) continue;
    for (const h of plans.get(part.beatId)?.hits ?? []) {
      const time = part.start + h.time;
      if (time >= part.end - 1e-9 || time < from - 1e-9) continue;
      events.push({ time: time - from, lane: part.lane, beatId: part.beatId, row: h.row, loud: h.loud, note: h.note, len: h.len });
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
