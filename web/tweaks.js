// Knobs: the one list of simple changes on the sound sheet, under the
// voices (docs/design/unified-sound-shaping.md, Design 1, Ben 2026-10-11).
// Deeper or higher, slower or faster, echo, louder or softer and warble are
// the five main knobs; ⏪ Backwards, Muffled ↔ Bright, Robot, Crunch and
// Stutter sit under "More knobs". A voice is a set of knob positions
// (voice-knobs.js), so tapping Chipmunk moves Deeper ↔ higher and Slower ↔
// faster where a kid can see them. Each knob is one fixed slot, so two things
// can never double up: one pitch, one echo, one backwards.
//
// Stored on a sound as `tweaks` (ADR 0012), only what moved from normal. The
// name stays from when they were called Tweaks: sounds saved since then keep
// their record. Beside the knobs it may hold `special` (a ✦ voice's extra
// layer that no knob makes: Clones, the walkie-talkie's static and beep,
// Monster's boom) and `first` (the knobs play before the sound's Shape it
// steps instead of after them; see knobSteps' callers in voices.js).
//
// Each knob is played by the building blocks in steps.js (no new sound
// engine): tweakSteps() turns them into steps. Softer is the one thing a step
// can't do, because every step is levelled to the same peak, so it is a gain
// on the finished sound (tweakGain). Pure: no Web Audio, no DOM.

import { cleanStep, kindById } from './steps.js';
import { rateOf } from './instruments.js';

const notes = (n) => `${Math.abs(n)} note${Math.abs(n) === 1 ? '' : 's'}`;
const times = (v) => `${+v.toFixed(2)}×`;

// Each knob: its range, normal value and how it reads. `keys` names each stop
// for a knob with a few of them, shown as a row of keys (five or fewer: Ben's
// rule, lines.js keysForSlider); the others are sliders. `main` knobs show in
// simple mode; the rest are under More knobs. `short` is its letter in the
// render cache key (tweaksKey): the first five keep the letters they had.
// `say` is how the knob reads in the line under the voices ("higher +9").
// Backwards is a switch, not a number: it is listed in its slot, with `flag`.
export const TWEAKS = [
  {
    // Notes up or down, the length kept: the same voice, deeper.
    key: 'pitch', name: 'Deeper ↔ higher', emoji: '🎚️', min: -24, max: 24, step: 1, default: 0, main: true, short: 'p',
    text: (n) => (n === 0 ? 'normal' : `${notes(n)} ${n < 0 ? 'deeper' : 'higher'}`),
    say: (n) => `${n < 0 ? 'deeper' : 'higher'} ${n < 0 ? '−' : '+'}${Math.abs(n)}`,
  },
  {
    // Doublings of speed, the pitch kept: -1 is half as fast, 1 twice as fast.
    // ¹⁄₂₀× (Slow's slowest) to 8× (Fast's fastest): an even slider in ratio.
    key: 'speed', name: 'Slower ↔ faster', emoji: '⏩', min: -4.3, max: 3, step: 0.1, default: 0, main: true, short: 's',
    text: (v) => (v === 0 ? 'normal' : v > 0 ? `${times(2 ** v)} faster` : `${times(2 ** -v)} slower`),
    say: (v) => (v > 0 ? `faster ${times(2 ** v)}` : `slower ${times(2 ** -v)}`),
  },
  {
    key: 'echo', name: 'Echo', emoji: '🏛️', min: 0, max: 3, step: 1, default: 0, main: true, short: 'e',
    keys: ['Off', 'Room', 'Hall', 'Echo'],
    say: (v) => ['', 'a room', 'a hall', 'echoes'][v],
  },
  {
    key: 'volume', name: 'Softer ↔ louder', emoji: '🔊', min: -2, max: 2, step: 1, default: 0, main: true, short: 'v',
    keys: ['Quietest', 'Quiet', 'Normal', 'Loud', 'Loudest'],
    say: (v) => ['quietest', 'quiet', '', 'loud', 'loudest'][v + 2],
  },
  {
    key: 'warble', name: 'Warble', emoji: '〰️', min: 0, max: 2, step: 1, default: 0, main: true, short: 'w',
    keys: ['Off', 'A little', 'Lots'],
    say: (v) => ['', 'a little warble', 'lots of warble'][v],
  },
  { key: 'backwards', name: 'Backwards', emoji: '⏪', flag: true, default: false, say: () => 'backwards' },
  {
    // A filter: the top taken off (muffled) or the bottom (bright, tinny).
    key: 'tone', name: 'Muffled ↔ Bright', emoji: '🧣', min: -2, max: 2, step: 1, default: 0, short: 't',
    keys: ['Muffled', 'Dull', 'Normal', 'Clear', 'Bright'],
    say: (v) => ['muffled', 'dull', '', 'clear', 'bright'][v + 2],
  },
  {
    key: 'robot', name: 'Robot', emoji: '🤖', min: 0, max: 2, step: 1, default: 0, short: 'r',
    keys: ['Off', 'Robot', 'Metal'],
    say: (v) => ['', 'robot', 'metal'][v],
  },
  {
    key: 'crunch', name: 'Crunch', emoji: '🔥', min: 0, max: 2, step: 1, default: 0, short: 'c',
    keys: ['Off', 'A little', 'Lots'],
    say: (v) => ['', 'a little crunch', 'lots of crunch'][v],
  },
  {
    // How many times the start repeats before the whole sound: Off, 2, 3 or 4.
    key: 'stutter', name: 'Stutter', emoji: '🔂', min: 0, max: 3, step: 1, default: 0, short: 'u',
    keys: ['Off', '2', '3', '4'],
    say: (v) => `stutter ×${v + 1}`,
  },
];

// The number knobs (sliders and keys); Backwards is the one switch.
const NUMBERS = TWEAKS.filter((t) => !t.flag);

export const tweakByKey = (key) => TWEAKS.find((t) => t.key === key);
export const MAIN_KNOBS = TWEAKS.filter((t) => t.main).map((t) => t.key);
export const MORE_KNOBS = TWEAKS.filter((t) => !t.main).map((t) => t.key);

// The ✦ special layers: what a voice does that no knob can (Ben, Q5:
// "they stay as special voices"). One slot, like a knob. `at` is where it
// plays among the knobs: early (on the plain sound, after pitch) or late
// (after the tone and crunch, so the walkie's static stays clean).
export const SPECIALS = {
  clones: { name: 'clones', at: 'early' },
  boom: { name: 'boom', at: 'early' },
  walkie: { name: 'static and a beep', at: 'late' },
};

// What a knob at `v` reads as: its key's name, or its own words.
export function tweakText(key, v) {
  const t = tweakByKey(key);
  if (!t || t.flag) return '';
  return t.keys ? t.keys[Math.round(v - t.min)] ?? '' : t.text(v);
}

// What one knob at `v` adds to the line under the voices: "higher +9".
export function knobSay(key, v) {
  if (key === 'special') return `✦ ${SPECIALS[v]?.name ?? ''}`;
  return tweakByKey(key)?.say(v) ?? '';
}

// Every knob at normal, as the sheet edits them, and no special layer.
export const NO_TWEAKS = Object.freeze({ ...Object.fromEntries(TWEAKS.map((t) => [t.key, t.default])), special: null });

// The knobs to store: each number clamped to its range and rounded to its
// step, Backwards only when on, a special layer only when it is a known one,
// and only what differs from normal. `first` is kept with knobs or a special
// layer to say they play first. Null when nothing differs. Untrusted input is
// fine. An older copy of the app drops the keys it doesn't know and clamps
// the wider ranges to its own, so it plays new knob settings partly.
export function cleanTweaks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const t of NUMBERS) {
    const v = raw[t.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const n = +(Math.round(Math.min(t.max, Math.max(t.min, v)) / t.step) * t.step).toFixed(4);
    if (n !== t.default) out[t.key] = n;
  }
  if (raw.backwards === true) out.backwards = true;
  if (typeof raw.special === 'string' && Object.hasOwn(SPECIALS, raw.special)) out.special = raw.special;
  if (!Object.keys(out).length) return null;
  if (raw.first === true) out.first = true;
  // 🔇 on a layer: the knobs set but silenced, in play order. Kept only for
  // knobs that are set (a muted normal knob changes nothing). An older app
  // drops the list and plays them.
  if (Array.isArray(raw.muted)) {
    const muted = [...LAYER_ORDER, 'special'].filter((k) => raw.muted.includes(k) && k in out);
    if (muted.length) out.muted = muted;
  }
  return out;
}

// The knobs that play: cleaned, with the muted ones (and `muted`) taken out.
export function playingTweaks(raw) {
  const t = cleanTweaks(raw);
  if (!t?.muted) return t;
  const { muted, ...rest } = t;
  for (const k of muted) delete rest[k];
  const { first, ...left } = rest;
  return Object.keys(left).length ? rest : null;
}

// Every knob, normal where unset: what the sheet's controls show. `first` is
// the sheet's to decide, so it is left out.
export function fullTweaks(raw) {
  const { first, muted, ...t } = cleanTweaks(raw) ?? {};
  return { ...NO_TWEAKS, ...t };
}

// Whether knob `key` (or the ✦ special layer) is off normal in `raw`: its
// Layers row is drawn as changed.
export const knobMoved = (key, raw) => fullTweaks(raw)[key] !== NO_TWEAKS[key];

// Whether every knob is at normal and there is no special layer.
export const allNormal = (raw) => cleanTweaks({ ...raw, first: false }) === null;

// Echo's stops as steps: a small room, a hall, then echoes in a small room.
const ECHO = [
  [],
  [{ type: 'room', size: 0.2 }],
  [{ type: 'room', size: 0.55 }],
  [{ type: 'echo', repeats: 3, gap: 0.25 }, { type: 'room', size: 0.25 }],
];
const WARBLE = [null, 0.25, 0.6];     // Wobble's depth: a gentle vibrato, then a wobbly one
const LOUDER = [null, 0.35, 0.75];    // Louder everywhere's amount, for Loud and Loudest
const SOFTER = [1, 0.5, 0.25];        // the finished sound's level, for Normal, Quiet and Quietest
const TONE = [-0.75, -0.4, 0, 0.4, 0.7];   // Muffled ↔ Bright's setting, Muffled to Bright
const RING = [null, 48, 190];         // Robot's ring: a robot (Robot's 48), then a metal one (Alien's 190)
const CRUNCH = [null, 0.25, 0.5];     // Crunch's amount: a little, then a walkie-talkie's worth

// The knobs as steps (steps.js), in the order they play: pitch and speed in
// one stretch, then Stutter, Backwards, an early special layer, the tone,
// Robot, Crunch, a late special layer, warble, louder, and the echo last so
// it rings out after everything else, the right way round. A special layer is
// a step of its own type, `special`, that voices.js renders. The knobs saved
// before More knobs existed play exactly the steps they played then: the new
// ones add steps only when they are set.
export function tweakSteps(raw) {
  const t = playingTweaks(raw);
  if (!t) return [];
  const steps = [];
  const rate = rateOf(t.pitch);
  // Higher or lower keeping its length is a stretch then a tape speed: the
  // stretch also takes the speed knob, so the sound is stretched only once.
  const stretch = cleanStep(kindById('stretch'), { speed: 2 ** (t.speed ?? 0) / rate });
  if (stretch.speed !== 1) steps.push(stretch);
  if (t.pitch) steps.push(cleanStep(kindById('pitch'), { notes: t.pitch, keep: false }));
  if (t.stutter) steps.push(cleanStep(kindById('repeat'), { times: t.stutter + 1 }));
  if (t.backwards) steps.push(cleanStep(kindById('reverse'), {}));
  const special = t.special ? { type: 'special', special: t.special } : null;
  if (special && SPECIALS[t.special].at === 'early') steps.push(special);
  if (t.tone) steps.push(cleanStep(kindById('tone'), { tone: TONE[t.tone + 2] }));
  if (t.robot) steps.push(cleanStep(kindById('ring'), { metal: RING[t.robot] }));
  if (t.crunch) steps.push(cleanStep(kindById('crunch'), { amount: CRUNCH[t.crunch] }));
  if (special && SPECIALS[t.special].at === 'late') steps.push(special);
  if (t.warble) steps.push(cleanStep(kindById('wobble'), { speed: 5.5, depth: WARBLE[t.warble] }));
  if (t.volume > 0) steps.push(cleanStep(kindById('squash'), { amount: LOUDER[t.volume] }));
  for (const s of ECHO[t.echo ?? 0]) steps.push(cleanStep(kindById(s.type), s));
  return steps;
}

// The level the finished sound plays at: below 1 for Quiet and Quietest.
export function tweakGain(raw) {
  const v = playingTweaks(raw)?.volume ?? 0;
  return v < 0 ? SOFTER[-v] : 1;
}

// A short key for the render cache, '' for no knobs: "~p-5,s0.3,b". The
// knobs saved before More knobs key exactly as they did.
export function tweaksKey(raw) {
  const t = cleanTweaks(raw);
  if (!t) return '';
  const parts = NUMBERS.filter((x) => x.key in t).map((x) => `${x.short}${t[x.key]}`);
  if (t.backwards) parts.push('b');
  if (t.special) parts.push(`x${t.special}`);
  if (t.first) parts.push('f');
  if (t.muted) parts.push(`m${t.muted.join('+')}`);
  return `~${parts.join(',')}`;
}

// ── Layers: the knobs and the kid's own steps as one list ──
// The sound sheet's Layers section (Ben, 2026-10-11, Q42c: "permanently
// merged… an interface similar to beats") is one row per layer, top to
// bottom in the order they play (Q42a). The five main knobs are always rows;
// another knob is a row once it is set, once it was added (+ Add a layer) or
// moved by hand while the sheet is open (`shown`: a knob moved back to normal
// keeps its row until a voice, 🎲 or ↩️ Reset voice moves the knobs, Q42b). A ✦
// special part is a row where it plays. Returns knob keys, with 'special'.
export const LAYER_ORDER = ['pitch', 'speed', 'stutter', 'backwards', 'tone', 'robot', 'crunch', 'warble', 'volume', 'echo'];

export function knobLayers(raw, { all = false, shown = [], main = false } = {}) {
  const t = fullTweaks(raw);
  const keep = new Set(shown);
  const keys = LAYER_ORDER.filter((k) => all || keep.has(k) || (main && MAIN_KNOBS.includes(k)) || t[k] !== NO_TWEAKS[k]);
  if (!t.special) return keys;
  // An early special plays after Backwards, a late one after Crunch.
  const after = LAYER_ORDER.indexOf(SPECIALS[t.special].at === 'early' ? 'backwards' : 'crunch');
  const at = keys.findIndex((k) => LAYER_ORDER.indexOf(k) > after);
  keys.splice(at === -1 ? keys.length : at, 0, 'special');
  return keys;
}

// Every row of the Layers section, top to bottom as they play: knob keys
// (knobLayers with the main five), then `step:<i>` for each of the chain's
// `steps` (Advanced shows them; simple mode passes 0). The steps come first
// when the knobs play after them (`knobsFirst` false: a sound saved with old
// voices and knobs, which keeps sounding as it did).
export function layerRows(raw, { shown = [], steps = 0, knobsFirst = true } = {}) {
  const knobs = knobLayers(raw, { shown, main: true });
  const own = Array.from({ length: steps }, (_, i) => `step:${i}`);
  return knobsFirst ? [...knobs, ...own] : [...own, ...knobs];
}

// The knobs + Add a layer offers: the ones that aren't rows yet.
export function addableKnobs(raw, shown = []) {
  const rows = new Set(knobLayers(raw, { shown, main: true }));
  return MORE_KNOBS.filter((k) => !rows.has(k));
}

// Where a knob added from + Add a layer starts: its first setting that
// changes the sound, so the kid hears what it does.
export const ADDED_AT = { backwards: true, tone: -2, robot: 1, crunch: 1, stutter: 1 };
