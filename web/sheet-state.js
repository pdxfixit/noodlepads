// The sound sheet's shared state: the elements, the sheet's own record, the
// live preview, and the two parts made in initSheet (the wave and the trim
// editor). sheet.js owns the sheet (open, play, save, close) and fills `hooks`
// with the few things the other parts call back into it for; sheet-voices.js
// and sheet-make.js import this and never sheet.js, so the three files have no
// cycle.

import { getSetting } from './settings.js';
import { MIX } from './mix.js';
import { NO_TWEAKS } from './tweaks.js';

// Things sheet.js owns that the other parts call: previewVoice, renderAmount,
// renderNote, rendered, resetPreviews, setVoicesReady, closeSheet, isRecording.
// A part asks for one with later('name') and calls the result like the function.
export const hooks = {};
export const later = (name) => (...args) => hooks[name](...args);

// The wave (wave.js) and the trim editor (chop.js), made in initSheet.
export const parts = { wave: null, cut: null };

export const el = {};

export const sheet = {
  mode: 'new',          // 'new' | 'edit'
  clip: null,           // the clip being edited
  pending: null,        // new audio: {blob, mime, original, synth?}
  made: null,           // ✨ Make one: {kind, recipe} of the sound being made, or null
  found: null,          // 🎵 Find its note: {midi (null: no clear note), key: the chain it was found for}
  mix: { with: null, offset: MIX.offset.default, balance: MIX.balance.default },   // ➕ Mix with another sound
  original: null,       // Promise<AudioBuffer> the voice previews render from
  previews: new Map(),  // recipeKey -> Promise<{buffer, duration}> for this sheet
  chain: [],            // old voices and Shape it steps, in order: [{type: 'voice', voice, amount}, …]; amount null for a voice without one
  link: 0,              // which of them the amount slider (simple) or Shape it (Advanced) edits
  tweaks: { ...NO_TWEAKS },   // the knobs (tweaks.js): deeper, faster, echo…, and a ✦ special layer
  lit: [],              // the voices tapped since the knobs last moved by hand, in tap order: [{id, name, emoji, knobs}]
  base: { ...NO_TWEAKS },     // the knobs before the first of them was tapped
  knobsFirst: true,     // the knobs play before the chain (new sounds) or after it (sounds saved with old voices and tweaks)
  undo: null,           // ⤢ Turn into knobs, for ↩️ The old way: {chain, tweaks, knobsFirst} before it
  keep: null,           // ⭐ Save voice's form: {id} renames that voice; {} keeps a new one; null closed
  keepEmoji: '',        // the picture picked in that form
  shown: new Set(),     // knobs that are rows though at normal: added, or moved by hand since the knobs last jumped (Q42b)
  muted: new Set(),     // knob layers muted (🔈): keys, and 'special'; a step's mute is its own `off`
  armed: null,          // the layer whose ✕ asks "Remove?", waiting for its second tap
  ready: false,         // there is a sound to try voices on
  emoji: '📣',
  color: 'yellow',
  voiced: 0,            // seconds of the voiced sound last drawn, so the plain one is drawn to the same scale
  plain: false,         // 👂 Plain: false, 'waiting' for the recording, or 'playing' it
  trim: null,           // {start, end} seconds into the stored audio (chop.js), or null for the automatic trim
  edits: null,          // the wave editor's changes to parts of the stored audio (cuts.js), or null
  fade: null,           // the wave editor's fades, {in, out} seconds, or null
  downloadUrl: null,
  opened: '',           // sheetSignature() as the sheet opened: unlike it now, closing would lose work
};

// The live preview (Advanced): while a live step's slider is held, the sound
// loops through real nodes that the slider moves. `split` is the chain it was
// built for; `nodes` move its live steps.
export const live = { on: false, split: null, nodes: null, starting: null };

// The one Advanced switch (Settings, and at the bottom of Layers) shows the kid's own steps.
export const advanced = () => getSetting('advancedBeats') === true;

export function sheetError(text) {
  el.sheetError.textContent = text || '';
  el.sheetError.hidden = !text;
}

export function setStatus(text) {
  el.recStatus.textContent = text;
}

export const plainChain = () => sheet.chain.length === 1 && sheet.chain[0].type === 'voice' && sheet.chain[0].voice === 'normal';
