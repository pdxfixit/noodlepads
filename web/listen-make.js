// 🎧 From a song's results (docs/design/beat-from-a-song.md, "The
// screens"): the pure part between the listener (listen.js) and its screens
// (listen-ui.js). What the live screen shows of a snapshot (its rolling
// bars, the parts so far, the tempo line), which of the app's sounds plays
// each row, the beats and the 🎼 Song made from finish()'s result, and the
// words of "What I heard". No DOM, no Web Audio, no storage, so node --test
// runs it.

import { SIGNATURES, barSteps, cleanPattern } from './beat.js';
import { closestSound } from './listen-dsp.js';
import { cleanTempos, cleanLanes, newLanes, legacySlots, blockBars, MAX_SONG_BARS, MAX_BLOCKS, MAX_TIMES, BAR_STEPS } from './playlist.js';
import { partNames, cutName, MAX_LABEL } from './names.js';

export const ROWS = ['kick', 'snare', 'hat'];

// Each row's name and picture on the screens.
export const ROW_LOOK = {
  kick: { emoji: '🦶', name: 'Kick' },
  snare: { emoji: '🥁', name: 'Snare' },
  hat: { emoji: '🎩', name: 'Hi-hat' },
};

// The app's sounds each row may get (kit ids), from every group with
// drum-like sounds: Drums, Hip hop, Hand drums and Effects. The first is the
// plain one, used when a print is missing (no hits heard, or a clip that
// would not load).
export const ROW_SOUNDS = {
  kick: ['kick', 'kick-dusty', 'boom', 'tom-low', 'taiko', 'log-drum', 'dhol', 'djembe', 'cajon', 'heartbeat'],
  snare: ['snare', 'snare-dusty', 'snare-808', 'clap', 'rim', 'snap', 'djembe-slap', 'woodblock', 'pop'],
  hat: ['hihat', 'open-hat', 'shaker', 'tambourine', 'ride', 'dhol-high', 'clave'],
};
export const ALL_ROW_SOUNDS = [...new Set(Object.values(ROW_SOUNDS).flat())];

// The app's names for a part's swing (Advanced's three keys).
export const SWING_NAMES = { 0: 'Straight', 33: 'Swing', 50: 'Shuffle' };
export const swingName = (swing) => SWING_NAMES[swing] ?? 'Straight';

// "1:52": minutes and seconds.
export function clock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── The live screen ──

// The rolling bars to show for a snapshot: { bar, partId, step, signature,
// lines: [{ bar, cells: { kick, snare, hat } }] } (oldest first), or null
// while there is nothing to show yet. `held` is what was shown last. The
// listener's bar count can step back by one at a tempo change, and while it
// finds the new tempo it has no bars: what was shown stays (held) until the
// new part's bars come.
export function rollView(held, snap) {
  const recent = snap?.current?.recent;
  const n = recent?.kick?.length ?? 0;
  if (snap?.status !== 'listening' || !n) return held ?? null;
  const { bar, partId, step } = snap.current;
  if (held && bar < held.bar && (partId === held.partId || partId === null)) return held;
  return {
    bar, partId, step, signature: snap.signature,
    lines: Array.from({ length: n }, (_, i) => ({
      bar: bar - (n - 1 - i),
      cells: Object.fromEntries(ROWS.map((r) => [r, recent[r][i] ?? []])),
    })),
  };
}

// A bar's cells grouped by beat, as the beat maker groups pills: the
// signature's groups when they add up to the bar, else fours.
export function beatGroups(signature, count) {
  const groups = SIGNATURES[signature];
  if (groups && groups.reduce((a, b) => a + b, 0) === count) return groups;
  const out = [];
  for (let left = count; left > 0; left -= 4) out.push(Math.min(4, left));
  return out;
}

// A line's label: "C · bar 22", or "bar 22" before the first part is known.
export const lineLabel = (partId, bar) => (partId ? `${partId} · bar ${bar}` : `bar ${bar}`);

// The parts heard so far, in the order they came, as the chips show them:
// `heard` is the list kept between snapshots ([{ id, bar }]), and grows when
// the playing part changes. → the new list.
export function heardParts(heard, snap) {
  const id = snap?.current?.partId ?? null;
  if (!id || heard.at(-1)?.id === id) return heard;
  return [...heard, { id, bar: snap.current.bar }];
}

// The chips: "A · 92 BPM", "B · 92 BPM", "A again", the playing one last
// with "· listening…". → [{ label, now }]
export function partChips(heard, snap) {
  const bpmOf = new Map((snap?.parts ?? []).map((p) => [p.id, p.bpm]));
  const seen = new Set();
  const chips = heard.map(({ id }) => {
    const again = seen.has(id);
    seen.add(id);
    const bpm = bpmOf.get(id);
    return { id, label: again ? `${id} again` : bpm ? `${id} · ${bpm} BPM` : id, now: false };
  });
  if (chips.length && snap?.status === 'listening' && snap.current?.partId === chips.at(-1).id) {
    chips.at(-1).now = true;
    chips.at(-1).label += ' · listening…';
  }
  return chips;
}

// The yellow line after a tempo change: "Sped up at bar 22. 92 → 120 BPM,
// so part C started there." `heard` names the part that began there, once
// it is known. Null with no change.
export function tempoLine(snap, heard = []) {
  const c = snap?.tempoChange;
  if (!c) return null;
  const how = c.to > c.from ? 'Sped up' : 'Slowed down';
  const started = heard.find((h) => h.bar >= c.atBar);
  return { faster: c.to > c.from, lead: `${how} at bar ${c.atBar}.`, rest: ` ${c.from} → ${c.to} BPM${started ? `, so part ${started.id} started there` : ''}.` };
}

// The line under the chips: "120 BPM · 4/4 · Straight", or the tempo
// settling while it is found.
export function feelLine(snap) {
  if (snap?.status === 'listening' && snap.bpm) return `${snap.bpm} BPM · ${snap.signature ?? '4/4'} · ${swingName(snap.swing)}`;
  return snap?.bpm ? `About ${snap.bpm} BPM…` : 'Finding the tempo…';
}

// ── Sounds ──

// Which of the app's sounds plays each row of a part: the closest to the
// row's fingerprint among ROW_SOUNDS (`printOf(kitId)`, null when that
// sound has no print), else the row's plain sound. → { kick, snare, hat }.
export function pickSounds(part, printOf) {
  const out = {};
  for (const row of ROWS) {
    const print = part?.prints?.[row];
    const candidates = ROW_SOUNDS[row].map((id) => ({ id, print: printOf(id) })).filter((c) => c.print);
    out[row] = (print && closestSound(print, candidates)) || ROW_SOUNDS[row][0];
  }
  return out;
}

// ── What it made ──

const hits = (steps) => Array.isArray(steps) && steps.some(Boolean);
const partHasHits = (part) => ROWS.some((r) => hits(part?.steps?.[r]));
// Whether it heard a beat at all: any step on, in any part.
export const heardABeat = (result) => (result?.parts ?? []).some(partHasHits);

// The beats: one per part that has hits, named one fun name and the part's
// letter, with its tempo, time signature, swing, bars and a row for each
// instrument that hits (kick, snare, hat, with the sounds picked).
//   result     listener.finish()
//   sounds     { [partId]: { kick, snare, hat } } kit ids (pickSounds)
//   taken      this person's beat names
// → [{ partId, beat }], beat as 🗂️ Beats stores it.
export function makeBeats(result, { personId, sounds = {}, taken = [], newId, now = Date.now(), random = Math.random, hasClip = () => true }) {
  const parts = (result?.parts ?? []).filter(partHasHits);
  if (!parts.length) return { base: null, beats: [] };
  const { base, names } = partNames(parts.map((p) => p.id), taken, random);
  const beats = parts.map((part, i) => {
    const B = barSteps(part.signature);
    const length = B * part.bars;
    const rows = ROWS.filter((r) => hits(part.steps[r])).map((r) => {
      const kit = sounds[part.id]?.[r] ?? ROW_SOUNDS[r][0];
      const clipId = `${personId}-${hasClip(`${personId}-${kit}`) ? kit : ROW_SOUNDS[r][0]}`;
      return { clipId, steps: Array.from({ length }, (_, s) => !!part.steps[r][s]) };
    });
    const clean = cleanPattern({ name: names[i], bpm: part.bpm, bars: part.bars, signature: part.signature, swing: part.swing, rows }, personId);
    return { partId: part.id, beat: { ...clean, id: newId('beat'), name: names[i], created: now, saved: now } };
  });
  return { base, beats };
}

// The 🎼 Song, with two or more parts: the parts' beats in song order on
// the first lane, each at its bar and repeated over its stretch (never into
// the next one), at the first part's tempo with a mark where the tempo
// changed. Null with fewer than two beats. The listener counts bars in each
// part's own time signature, and 🎼 Song counts bars of 16 pills, so the
// blocks and marks go where their bars fall in pills (songBar): a 3/4 part
// leaves no silence before the next one.
//   name   the beats' fun name; songs' names, to stay unique
export function makeSong(result, beats, { personId, name, songNames = [], newId, now = Date.now() }) {
  if (beats.length < 2) return null;
  const beatOf = new Map(beats.map((b) => [b.partId, b.beat]));
  const at = (bar) => songBar(result, bar);
  const stretches = (result.order ?? []).filter((s) => beatOf.has(s.partId) && at(s.startBar) < MAX_SONG_BARS);
  const blocks = [];
  stretches.forEach((s, i) => {
    const beat = beatOf.get(s.partId);
    const bar = at(s.startBar);
    const next = Math.min(MAX_SONG_BARS, stretches[i + 1] ? at(stretches[i + 1].startBar) : MAX_SONG_BARS);
    const steps = barSteps(beat.signature) * beat.bars;
    let times = Math.min(MAX_TIMES, Math.max(1, Math.ceil(s.bars / beat.bars)));
    while (times > 1 && bar + blockBars(steps, times) > next) times--;
    if (blocks.at(-1)?.end > bar) return;   // the stretch before already covers it
    blocks.push({ beatId: beat.id, bar, times, end: bar + blockBars(steps, times) });
  });
  const lanes = cleanLanes(newLanes());
  lanes[0].blocks = blocks.slice(0, MAX_BLOCKS).map(({ beatId, bar, times }) => ({ beatId, bar, times }));
  const first = beatOf.get(stretches[0]?.partId) ?? beats[0].beat;
  const tempos = cleanTempos((result.tempos ?? []).map((m) => ({ bar: at(m?.bar) + 1, bpm: m?.bpm })));
  return {
    id: newId('song'), personId, name: uniqueName(name, songNames), tempo: first.bpm,
    ...(tempos.length ? { tempos } : {}), lanes, slots: legacySlots(lanes), created: now, saved: now,
  };
}

function uniqueName(name, list) {
  const taken = new Set(list.map((n) => String(n).toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${cutName(name, MAX_LABEL - String(n).length - 1)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// ── "What I heard" ──

// The part playing in the listener's bar k (counted from 1): its
// stretch's; a bar between stretches (a tempo change, dropped) the stretch
// before's. Undefined with no stretches.
function partAt(result) {
  const partOf = new Map((result?.parts ?? []).map((p) => [p.id, p]));
  const order = result?.order ?? [];
  return (k) => {
    let s = order[0];
    for (const x of order) if (x.startBar <= k) s = x;
    return partOf.get(s?.partId);
  };
}

// Seconds into the song where `bar` (counted from 1) starts: each bar at
// its stretch's tempo and signature; bars between stretches (a tempo
// change, dropped) at the tempo of the stretch before.
export function barTime(result, bar) {
  const part = partAt(result);
  let t = 0;
  for (let k = 1; k < bar; k++) {
    const p = part(k);
    t += p ? (barSteps(p.signature) * 15) / p.bpm : 2;
  }
  return t;
}

// The 🎼 Song bar (counted from 0, 16 pills each) where the listener's bar
// `bar` (counted from 1, in its part's signature) starts: the pills of every
// bar before it, rounded up to a whole song bar. The same bar in 4/4.
export function songBar(result, bar) {
  const part = partAt(result);
  let pills = 0;
  for (let k = 1; k < bar; k++) pills += barSteps(part(k)?.signature ?? '4/4');
  return Math.max(0, Math.ceil(pills / BAR_STEPS - 1e-9));
}

const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const barsWord = (n) => (n === 1 ? '1 bar' : `${n} bars`);

// "1:52 of music, in 3 parts. 4/4 at 92 BPM, then 120 from 1:12. The hats
// swing a little (Swing)."
export function heardSentence(result) {
  const parts = (result?.parts ?? []).filter(partHasHits);
  const lead = `${clock(result?.seconds)} of music, in ${parts.length === 1 ? '1 part' : `${parts.length} parts`}.`;
  if (!parts.length) return lead;
  const first = parts.find((p) => p.id === result.order?.[0]?.partId) ?? parts[0];
  let feel = ` ${first.signature} at ${first.bpm} BPM`;
  const marks = result.tempos ?? [];
  for (const m of marks.slice(0, 2)) feel += `, then ${m.bpm} from ${clock(barTime(result, m.bar))}`;
  if (marks.length > 2) feel += `, and ${marks.length - 2} more tempo ${marks.length - 2 === 1 ? 'change' : 'changes'}`;
  const swing = Math.max(...parts.map((p) => p.swing || 0));
  const swung = swing >= 50 ? ' The hats swing a lot (Shuffle).' : swing > 0 ? ' The hats swing a little (Swing).' : '';
  return `${lead}${feel}.${swung}`;
}

// A part's card under its name: "92 BPM · 1 bar · heard 3 times".
export function partDetail(result, part) {
  const heard = (result?.order ?? []).filter((s) => s.partId === part.id).length;
  return [`${part.bpm} BPM`, barsWord(part.bars), part.signature !== '4/4' ? part.signature : '', heard ? `heard ${times(heard)}` : '']
    .filter(Boolean).join(' · ');
}

// What listen_end says of a result: its seconds, parts and tempo changes.
export function resultCounts(result) {
  return { seconds: Math.round(result?.seconds ?? 0), parts: (result?.parts ?? []).filter(partHasHits).length, tempo_changes: (result?.tempos ?? []).length };
}

