// The keys' pure rules (docs/design/dj-mode.md): which sound sits on which
// key, and how a kid's imprecise hits become pills without ever judging them.
// No DOM, no audio, no storage, so every rule is unit-tested.

import { cleanTouch } from './touch.js';
import { cutName, nameLength, MAX_NAME } from './names.js';

// The number row and the three letter rows of a keyboard, by physical
// position (KeyboardEvent.code), so a key stays put whatever the layout.
// Ben, 2026-10-12: "the keyboard layout should have the number row as well".
export const KEY_ROWS = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];
export const KEY_CODES = KEY_ROWS.flat();

// 🔔 Let it ring (Ben, 2026-10-12): a sound that rings over itself keeps its
// earlier hits sounding when it is hit again, up to MAX_RINGING at once;
// one that doesn't is cut off (with a short fade) by its next hit. Beats
// sets it per row (`ring`), 🎤 Live for every key, for the visit.
export const MAX_RINGING = 8;
// For a new hit at `time` of a sound whose earlier hits are `earlier` (each
// with its `end`, in the order they started): which of them stop at `time`
// (`cut`) and which go on sounding (`keep`). Hits already over are in neither.
export function ringOver(earlier, time, ring, max = MAX_RINGING) {
  const still = earlier.filter((v) => v.end > time);
  const cut = ring ? still.slice(0, Math.max(0, still.length + 1 - max)) : still;
  return { keep: still.filter((v) => !cut.includes(v)), cut };
}

// What a US keyboard prints on each key: the label until the browser says
// better (navigator.keyboard.getLayoutMap) or the key is pressed once.
const PUNCTUATION = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/' };
export function fallbackLabel(code) {
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return PUNCTUATION[code] ?? (/^Key[A-Z]$/.test(code) ? code.slice(3) : '');
}

// The two keyboards a kid can pick (the Q / D keycaps in ✏️ Layout, dj.js):
// what each of the 40 keys prints, row by row, in KEY_ROWS order (the digits
// are the same on both). Only QWERTY and Dvorak (Ben, 2026-10-11: AZERTY and
// Colemak dropped; 2026-10-16: Auto dropped too; a stored one of those reads
// as not picked, and the browser's own layout decides, settings.js).
export const LAYOUTS = {
  qwerty: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL;', 'ZXCVBNM,./'],
  dvorak: ['1234567890', "',.PYFGCRL", 'AOEUIDHTNS', ';QJKXBMWVZ'],
};
export const LAYOUT_NAMES = { qwerty: 'QWERTY', dvorak: 'Dvorak' };
// The keyboard the browser says this is, from its layout map (Chrome, Edge:
// navigator.keyboard.getLayoutMap): Dvorak when the top-left letter key
// prints an apostrophe, else QWERTY. Null when there is no map to ask.
export function detectLayout(map) {
  if (!map || typeof map.get !== 'function') return null;
  return map.get('KeyQ') === "'" ? 'dvorak' : 'qwerty';
}
// Which key a keypress is: by the character typed, found in the layout's
// picture, so it is right whether the computer or the keyboard itself does
// the layout (a Kinesis or other keyboard that remaps in its own firmware
// sends the letter's code, not the key's place). A character not on the
// picture (Shift+1 types "!", a Cyrillic or Greek layout, a dead key) is
// its key by place (KeyboardEvent.code): Shift+key is "a pill earlier"
// while recording, and a keyboard of other letters still plays. With no
// layout, by place. Null when it is none of the 40.
export function keyFor(e, layout) {
  if (LAYOUTS[layout]) {
    const ch = typeof e.key === 'string' && e.key.length === 1 ? e.key.toUpperCase() : null;
    const found = ch && KEY_CODES.find((code) => layoutLabel(code, layout) === ch);
    if (found) return found;
  }
  return KEY_CODES.includes(e.code) ? e.code : null;
}

export function layoutLabel(code, layout) {
  const rows = LAYOUTS[layout];
  if (!rows) return null;
  for (let r = 0; r < KEY_ROWS.length; r++) {
    const i = KEY_ROWS[r].indexOf(code);
    if (i >= 0) return [...rows[r]][i];
  }
  return null;
}

// The kit sounds on the number, middle and bottom rows by default, left to
// right. The top letter row is the person's own sounds, then voices. The
// number row is a scale to play tunes on, C to high C, then two effects.
const NUMBER_ROW = ['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high', 'ding', 'tada'];
const HOME_ROW = ['kick', 'snare', 'hihat', 'clap', 'open-hat', 'tom-low', 'tom-high', 'crash', 'rim', 'shaker'];
const BOTTOM_ROW = ['bass-c', 'bass-f', 'bass-g', 'bass-a', 'chord-c', 'chord-am', 'chord-f', 'chord-g', 'scratch', 'explosion'];
const VOICE_FILL = ['lets-go', 'oh-yeah', 'drop-the-beat', 'nice', 'wow', 'yes', 'go', 'ready', 'level-up', 'boom-word'];

// Each key's sound for one person, before any key was changed:
// {code: clipId}. `own` is the person's own sounds (newest first), `kit`
// their kit copies as [{id, kitId, group, hidden}]. A missing or hidden kit
// sound is replaced by the next unused sound from its group. Never stored,
// so a new recording joins the top row by itself.
// Advanced-only presets (the sharps and flats) are never a default, so the
// keys stay the same whichever way ⚙️ Advanced is set.
export function defaultDeck(own, kit) {
  const visible = kit.filter((k) => !k.hidden && !k.advanced);
  const byKitId = new Map(visible.map((k) => [k.kitId, k]));
  const used = new Set();
  const take = (kitId) => {
    let k = byKitId.get(kitId);
    if (!k || used.has(k.id)) {
      const group = kit.find((x) => x.kitId === kitId)?.group;
      k = visible.find((x) => x.group === group && !used.has(x.id));
    }
    if (!k) return null;
    used.add(k.id);
    return k.id;
  };
  const deck = {};
  const top = [...own.map((c) => c.id)];
  for (const v of VOICE_FILL) if (top.length < 10) { const id = take(v); if (id) top.push(id); }
  const [numbers, letters, home, bottom] = KEY_ROWS;
  letters.forEach((code, i) => { deck[code] = top[i] ?? null; });
  home.forEach((code, i) => { deck[code] = take(HOME_ROW[i]); });
  bottom.forEach((code, i) => { deck[code] = take(BOTTOM_ROW[i]); });
  numbers.forEach((code, i) => { deck[code] = take(NUMBER_ROW[i]); });
  return deck;
}

// The forgiving snap. A hit {t, row} (audio-clock seconds) becomes a pill
// {row, step, n}, where step is the pill index in the beat and n counts
// pills since t0 (so n / total is the pass). Rules, in time order:
//  1. nearest pill; exactly half way goes to the earlier one;
//  2. a hit up to half a beat before recording began lands on its "1"
//     (earlier ones were count-in taps: played, not recorded);
//  3. a quick double tap (under min(90 ms, 0.6 of a pill)) counts once;
//  4. one hit per pill per pass;
//  5. a hit just before the loop starts over lands on the next pass's "1".
// The keys view snaps each tap once, as it arrives, with the beat's clock of
// that moment: `{t0, step, total, rates}`, step being seconds per pill at 1×
// and rates each row's speed (default 1). So a tempo change (which moves t0,
// sequencer.js retimeAt) or a beat that grows (a bigger total) never moves a
// hit already placed. `from` is when recording began. The snapper remembers
// rules 3 and 4 between taps; it returns null for a tap that adds nothing.
export function createSnapper(from) {
  const last = new Map();    // row -> time of its last counted hit
  const seen = new Set();    // `${row}:${n}` already counted
  return function snap({ t, row }, { t0, step, total, rates = [] }) {
    const start = from ?? t0;
    const dt = step / (rates[row] || 1);
    let n = Math.ceil((t - t0) / dt - 0.5);
    const nFrom = Math.round((start - t0) / dt);
    if (n < nFrom) {
      if (t < start - 2 * step) return null;   // a count-in tap
      n = nFrom;
    }
    if (last.has(row) && t - last.get(row) < Math.min(0.09, 0.6 * dt)) return null;
    const key = `${row}:${n}`;
    if (seen.has(key)) return null;
    seen.add(key);
    last.set(row, t);
    return { row, step: ((n % total) + total) % total, n };
  };
}

// The same snap for a whole list of hits on one clock, in time order.
export function snapHits({ hits, t0, step, total, from = t0, rates = [] }) {
  const snap = createSnapper(from);
  return [...hits].sort((a, b) => a.t - b.t).map((h) => snap(h, { t0, step, total, rates })).filter(Boolean);
}

// Tap tempo (⏲️ tapped in time): the tempo from tap times in seconds. Taps
// under 0.25 s after the last are a bounce and ignored; a gap over 1.5 s
// starts again. The median of the last (up to) 4 gaps is one click: a beat
// of `groupPills` sixteenths (4: a quarter note; 6/8's 6: a dotted quarter).
// Kept to 60–180 BPM, and pulled to a `common` tempo within 2 BPM, as the
// slider pulls (provisional, docs/questions.md). Null until there are two gaps.
export const TAP_GAP_MAX = 1.5;
export function tapTempo(times, groupPills = 4, { common = [], min = 60, max = 180 } = {}) {
  let kept = [];
  for (const t of times) {
    const prev = kept.at(-1);
    if (prev != null && t - prev > TAP_GAP_MAX) kept = [];
    else if (prev != null && t - prev < 0.25) continue;
    kept.push(t);
  }
  const gaps = kept.slice(-5).slice(1).map((t, i) => t - kept.slice(-5)[i]).sort((a, b) => a - b);
  if (gaps.length < 2) return null;
  const mid = gaps.length / 2;
  const gap = gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2;
  const bpm = Math.min(max, Math.max(min, Math.round((15 * groupPills) / gap)));
  const near = common.reduce((best, c) => (Math.abs(c - bpm) < Math.abs(best - bpm) ? c : best), Infinity);
  return Math.abs(near - bpm) <= 2 ? near : bpm;
}

// ── Stored records, cleaned (the app's own and anything from a backup) ──

export const TAKE_ID = /^take-[a-z0-9-]{1,48}$/;
export const TAKE_KINDS = ['hit', 'loop', 'stop', 'beat'];
export const MAX_TAKE_SECONDS = 180;
export const MAX_TAKE_EVENTS = 10000;
// An id: as it is, or refused (null). Never cut or mended into another one.
const shortText = (v, max) => (typeof v === 'string' && nameLength(v) <= max && cutName(v, max) === v ? v : null);

// A deck: only the 40 key codes, each a sound id or null (No sound). The
// number row (Digit1…Digit0) came 2026-10-12: an older copy drops those keys
// (ADR 0014), and a deck from before them just has none, so they play their
// defaults.
export function cleanDeck(d) {
  if (!shortText(d?.personId, 64) || !d.keys || typeof d.keys !== 'object') return null;
  const codes = (from) => {
    const keys = {};
    for (const code of KEY_CODES) {
      if (!Object.hasOwn(from, code)) continue;
      const v = from[code];
      if (v === null) keys[code] = null;
      else if (shortText(v, 64)) keys[code] = v;   // a sound id as it is, or left out: never cut into another
    }
    return keys;
  };
  const out = { personId: d.personId, keys: codes(d.keys) };
  // `beatId`: DJ's Beat Builder's own open beat in older copies (ADR 0008), a saved beat's id. Nothing reads it since ADR 0017 (one open beat); it is kept so older copies' decks and backups load as they were.
  if (/^beat-[a-z0-9-]{1,48}$/.test(d.beatId)) out.beatId = d.beatId;
  // `mine`: ⭐ Keys, the kid's own keyboard kept when a layout replaced it (ADR 0014), all 40 keys (an older one's number row as No sound).
  if (d.mine && typeof d.mine === 'object' && !Array.isArray(d.mine)) out.mine = { ...Object.fromEntries(KEY_CODES.map((c) => [c, null])), ...codes(d.mine) };
  // `touch`: the 👆 touch layout, bands of sounds (ADR 0029); `touchMine`: ⭐ Layout, the hand-made one kept when a saved one replaced it.
  for (const k of ['touch', 'touchMine']) { const t = cleanTouch(d[k]); if (t) out[k] = t; }
  return out;
}

// A take: a safe id, a name, a length, and its events in time order.
// `name` falls back to `fallbackName()` when missing.
export function cleanTake(t, fallbackName = () => 'Take') {
  if (!TAKE_ID.test(t?.id) || !shortText(t.personId, 64)) return null;
  const events = (Array.isArray(t.events) ? t.events : []).slice(0, MAX_TAKE_EVENTS)
    .map((e) => ({ t: Number(e?.t), clipId: shortText(e?.clipId, 64), kind: e?.kind, ring: e?.ring === true && e?.kind === 'hit' }))
    .filter((e) => Number.isFinite(e.t) && e.t >= 0 && e.t <= MAX_TAKE_SECONDS && e.clipId && TAKE_KINDS.includes(e.kind))
    .map(({ ring, ...e }) => ({ ...e, t: Math.round(e.t * 1000) / 1000, ...(ring ? { ring } : {}) }))
    .sort((a, b) => a.t - b.t);
  const duration = Number(t.duration);
  const name = typeof t.name === 'string' ? cutName(t.name, MAX_NAME).trim() : null;
  return {
    id: t.id,
    personId: t.personId,
    name: name || fallbackName(),
    created: Number.isFinite(Number(t.created)) ? Number(t.created) : Date.now(),
    duration: Number.isFinite(duration) ? Math.min(MAX_TAKE_SECONDS, Math.max(0, duration)) : 0,
    events,
  };
}

// ── Live takes ──

// A take from what was recorded: events [{at, clipId, kind, ring?}] on the audio
// clock, and when Stop was pressed. The take starts at its first hit (so it
// has no silence in front), and lasts until Stop, or a little past the last
// event when Stop came late. Times become seconds from the start, to 1 ms.
// Null when nothing was played.
export function takeFrom(events, stopAt, { tail = 0.5 } = {}) {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const firstHit = sorted.find((e) => e.kind !== 'beat');
  if (!firstHit) return null;
  const start = firstHit.at;
  const kept = sorted.filter((e) => e.at >= start - 1e-6 && e.at - start <= MAX_TAKE_SECONDS).slice(0, MAX_TAKE_EVENTS);
  const lastAt = kept.at(-1).at - start;
  const duration = Math.min(MAX_TAKE_SECONDS, Math.max(0, Math.min(stopAt - start, lastAt + tail * 4), lastAt + tail));
  return {
    duration: Math.round(duration * 1000) / 1000,
    // `ring`: a hit played with 🔔 Let it ring on, so it rang over the sound's
    // earlier hits instead of cutting them off (only stored when true).
    events: kept.map((e) => ({ t: Math.round((e.at - start) * 1000) / 1000, clipId: e.clipId, kind: e.kind, ...(e.ring && e.kind === 'hit' ? { ring: true } : {}) })),
  };
}

// "0:14", "1:05": a take's length for people.
export const clockText = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

// A take as single plays, for rendering it into a sound: every hit and beat
// plays once; a loop plays over and over (every `lengths.get(clipId)`
// seconds) until its stop or the end of the take. Sounds with no known
// length are left out. Returns [{clipId, at, end?}] in time order.
// As heard: a hit cuts off the same sound's earlier hits still sounding
// (`end`, where it stops early), unless it rang over them (`ring`, 🔔 Let it ring,
// up to MAX_RINGING at once). Loops and a beat's own hits are never cut.
export function planTake(take, lengths) {
  const plays = [];
  const sounding = new Map();   // clipId -> its hits' plays, with their natural `end`
  const loops = new Map();   // clipId -> start of the loop running now
  const endLoop = (clipId, until) => {
    const from = loops.get(clipId);
    const len = lengths.get(clipId);
    loops.delete(clipId);
    if (from == null || !(len > 0)) return;
    for (let at = from; at < until - 1e-6; at += len) plays.push({ clipId, at: Math.round(at * 1000) / 1000 });
  };
  for (const e of take.events) {
    if (!lengths.has(e.clipId)) continue;
    if (e.kind === 'loop') { endLoop(e.clipId, e.t); loops.set(e.clipId, e.t); }
    else if (e.kind === 'stop') endLoop(e.clipId, e.t);
    else if (e.kind === 'hit') {
      const earlier = sounding.get(e.clipId) ?? [];
      const { keep, cut } = ringOver(earlier.map((p) => ({ p, end: p.end ?? p.at + lengths.get(e.clipId) })), e.t, e.ring === true);
      for (const { p } of cut) p.end = e.t;
      const play = { clipId: e.clipId, at: e.t };
      sounding.set(e.clipId, [...keep.map((v) => v.p), play]);
      plays.push(play);
    } else plays.push({ clipId: e.clipId, at: e.t });
  }
  for (const clipId of [...loops.keys()]) endLoop(clipId, take.duration);
  return plays.sort((a, b) => a.at - b.at);
}

// Where the count-in is at `now`: which beat of it (1-based) is sounding, out
// of how many, or 'go' for the moment the beat starts (`from`), else null.
// The count-in is one bar of the time signature's beat `groups`, each beat
// `group size × step` seconds long, ending at `from`. Before the start is
// known (`from` not finite) it reads as beat 1.
export function countAt(now, from, groups, step, goFor = 0.6) {
  if (!Number.isFinite(from)) return { n: 1, of: groups.length };
  const bar = groups.reduce((a, g) => a + g, 0) * step;
  let t = from - bar;
  if (now < t) return { n: 1, of: groups.length };
  for (let i = 0; i < groups.length; i++) {
    t += groups[i] * step;
    if (now < t) return { n: i + 1, of: groups.length };
  }
  return now < from + goFor ? 'go' : null;
}

// The keys view shows its rows in keyboard order (Ben, 2026-10-12: "rows should
// always be ordered similar to how they appear in the key layout"): the
// indexes into `rows`, by where each row's sound first sits in KEY_CODES (the
// number row left to right, then each letter row); sounds on no key go last, in their
// stored order. `keys`: {code: clipId}. Only the display order: the stored
// beat (what 🥁 Beats shows and drags) keeps its own.
export function keyboardOrder(rows, keys) {
  const at = new Map();
  KEY_CODES.forEach((code, k) => { const id = keys?.[code]; if (id && !at.has(id)) at.set(id, k); });
  const place = (i) => at.get(rows[i]?.clipId) ?? Infinity;
  return rows.map((_, i) => i).sort((a, b) => (place(a) === place(b) ? a - b : place(a) - place(b)));
}
