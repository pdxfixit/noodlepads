// Voices as knob settings (docs/design/unified-sound-shaping.md, Design 1,
// Ben 2026-10-11): a voice is the knobs (tweaks.js) set a certain way, only
// the knobs it cares about. Tapping 🐿️ Chipmunk moves Deeper ↔ higher and
// Slower ↔ faster; tapping 🏟️ Stadium after it adds its echo on top; a knob
// both use takes the last tap's position. A kid's own voices (⭐ Keep as
// mine) are the same: a name and/or emoji, and knob positions.
//
// "Preset" is the code word; kids see "Voice". Built-in voices made from
// knobs sound close to the old recipes, not the same (Ben, Q2: "close is
// fine"). Sounds saved with an old voice keep it (voices.js RECIPES) until a
// kid taps ⤢ Turn into knobs (chainToKnobs). Pure: no Web Audio, no DOM.

import { TWEAKS, NO_TWEAKS, cleanTweaks, fullTweaks, knobSay } from './tweaks.js';
import { VOICES, amountFor } from './voices.js';
import { cutName, MAX_NAME } from './names.js';

const log2 = (x) => Math.log2(x);
const tenth = (v) => Math.round(v * 10) / 10;

// Each built-in voice's knobs, made from its amount (Chipmunk 1.7× is about
// 9 notes up and 1.7× as fast). Clones, Walkie-talkie and Monster also carry
// a ✦ special layer for what no knob does (Ben, Q5).
const MADE = {
  loud: () => ({ volume: 2, crunch: 1 }),
  chipmunk: (a) => ({ pitch: Math.round(12 * log2(a)), speed: tenth(log2(a)) }),
  fast: (a) => ({ speed: tenth(log2(a)) }),
  slow: (a) => ({ speed: tenth(-log2(a)) }),
  monster: (a) => ({ pitch: -Math.round(12 * log2(a)), speed: tenth(-log2(a)), special: 'boom' }),
  robot: () => ({ robot: 1 }),
  stadium: () => ({ echo: 3 }),
  walkie: () => ({ tone: 2, crunch: 2, special: 'walkie' }),
  underwater: () => ({ tone: -2, warble: 2 }),
  alien: () => ({ pitch: 3, speed: 0.3, warble: 2, robot: 2 }),
  clones: () => ({ special: 'clones' }),
  stutter: () => ({ stutter: 2 }),
  backwards: () => ({ backwards: true }),
};

// The voice chips, in the order they show: every voice but Normal (↩️ Reset voice
// is the one way back). `special` marks the ✦ ones.
export const PRESETS = VOICES.filter((v) => MADE[v.id]).map((v) => {
  const knobs = presetOf(v.id);
  return { id: v.id, name: v.name, emoji: v.emoji, knobs, special: !!knobs.special };
});

// The knobs voice `id` sets at `amount` (its default when unset): only the
// ones it uses, cleaned. {} for Normal or an unknown id.
export function presetOf(id, amount) {
  const made = MADE[id];
  if (!made) return {};
  const { first, ...knobs } = cleanTweaks(made(amountFor(id, amount))) ?? {};
  return knobs;
}

export const presetById = (id) => PRESETS.find((p) => p.id === id) ?? null;

// The knobs after tapping a voice whose knobs are `preset`: its knobs on top
// of `knobs`; the last tap wins a knob both use. A full set of knobs.
export function stackKnobs(knobs, preset) {
  return { ...fullTweaks(knobs), ...preset };
}

// Whether `knobs` has every knob of `preset` where `preset` puts it.
export function matches(knobs, preset) {
  const full = fullTweaks(knobs);
  const keys = Object.keys(preset);
  return keys.length > 0 && keys.every((k) => full[k] === preset[k]);
}

// What the lit voices (a list of {knobs}, in tap order) and `base` (the knobs
// before the first of them was tapped) make together: base, then each voice on
// top in turn.
export function stackAll(base, presets) {
  return presets.reduce((k, p) => stackKnobs(k, p.knobs), fullTweaks(base));
}

// "higher +9, faster 1.74×": what a voice's knobs are, in its knobs' order.
export function presetText(preset) {
  const order = [...TWEAKS.map((t) => t.key), 'special'];
  return order.filter((k) => k in preset).map((k) => knobSay(k, preset[k])).filter(Boolean).join(', ');
}

// The line under the voices (Ben's mockup): what the lit voices are, else
// a word for a kid's own knob settings, else a tip. Never "every knob in the
// middle".
export function voiceLine(lit, knobs) {
  if (lit.length) return lit.map((p) => `${p.name || p.emoji} is: ${presetText(p.knobs)}`).join(' · ');
  if (cleanTweaks(knobs)) return '✏️ Your own voice. ⭐ Save voice saves it.';
  return 'Tap a voice to see which knobs make it.';
}

// The knobs an older sound's voices make (⤢ Turn into knobs): each voice in
// the chain as its knobs, in order, then the sound's own knobs on top. Pitch
// and speed add up (Chipmunk then 3 notes deeper is 6 notes up); any other
// knob its own setting wins. Returns {knobs, rest}: `rest` is the chain's
// steps that are not voices (Shape it's), which stay as they are.
export function chainToKnobs(chain, tweaks) {
  let knobs = { ...NO_TWEAKS };
  const rest = [];
  for (const s of chain ?? []) {
    if (s?.type !== 'voice') { rest.push(s); continue; }
    if (s.voice === 'normal') continue;
    knobs = stackKnobs(knobs, presetOf(s.voice, s.amount));
  }
  const own = cleanTweaks(tweaks) ?? {};
  const out = { ...knobs };
  for (const [k, v] of Object.entries(own)) {
    if (k === 'first') continue;
    out[k] = k === 'pitch' || k === 'speed' ? (knobs[k] ?? 0) + v : v;
  }
  return { knobs: fullTweaks(out), rest };
}

// Whether a chain holds a voice that ⤢ Turn into knobs can change.
export const hasClassicVoice = (chain) => (chain ?? []).some((s) => s?.type === 'voice' && s.voice !== 'normal');

// What 🎲 Surprise me picks from: one to three voices from different families,
// so two never cancel out (Chipmunk then Monster) or pile up into mush.
const FAMILIES = [['chipmunk', 'monster', 'alien'], ['fast', 'slow'], ['robot', 'walkie', 'underwater'],
  ['clones', 'stutter', 'backwards'], ['loud'], ['stadium']];

// A random stack of voices: their ids, in tap order. `random` is Math.random,
// or a stand-in for tests.
export function surpriseVoices(random = Math.random, max = 3) {
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const count = 1 + Math.min(max - 1, Math.floor(random() * max));
  const left = [...FAMILIES];
  const out = [];
  while (out.length < count && left.length) {
    const f = pick(left);
    left.splice(left.indexOf(f), 1);
    out.push(pick(f));
  }
  return out;
}

// ── A kid's own voices (⭐ Save voice) ──
// Stored in IndexedDB "voices" (store.js): {id, personId, name, emoji, knobs,
// created, used, edited}. Name and emoji are free text, like a sound's name; either
// may be empty, not both. `knobs` is what a sound would store as `tweaks`
// (cleaned, never `first`). Kept per person with a random id, so the cloud
// and backups can carry them as they are later (docs/state.md).

const MY_VOICE_EMOJI = 16;         // an emoji can be several code units

// A stored voice cleaned, or null when it can't be used. Untrusted input is fine.
export function cleanMyVoice(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.personId !== 'string' || !raw.personId) return null;
  const name = typeof raw.name === 'string' ? cutName(raw.name.trim(), MAX_NAME) : '';
  const emoji = typeof raw.emoji === 'string' ? cutName(raw.emoji.trim(), MY_VOICE_EMOJI) : '';
  const { first, muted, ...knobs } = cleanTweaks(raw.knobs) ?? {};
  if ((!name && !emoji) || !Object.keys(knobs).length) return null;
  const time = (t) => (Number.isFinite(t) && t > 0 ? t : 0);
  const out = { id: raw.id, personId: raw.personId, name, emoji, knobs, created: time(raw.created), used: time(raw.used) };
  // `edited`: when it was named or renamed. Two devices that changed the same
  // voice keep the newer change (merge.js).
  if (time(raw.edited)) out.edited = time(raw.edited);
  return out;
}

// How many of a person's own voices show as chips; the rest are in the list.
export const MY_VOICE_CHIPS = 3;

// A person's own voices, most recently used (or made) first: the first
// MY_VOICE_CHIPS are chips, the rest go in ⭐ Voices ▾.
export function myVoicesFor(all, personId) {
  return (all ?? []).filter((v) => v?.personId === personId)
    .sort((a, b) => (b.used || b.created) - (a.used || a.created) || String(a.id).localeCompare(String(b.id)));
}
