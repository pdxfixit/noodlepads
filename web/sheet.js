// The sound sheet: make a new sound (record or choose a file), or edit one
// (name, picture, color, voices, hide or delete). Voices play as soon as they
// are picked, rendered from the sound's original, which is never changed.
// A voice is a knob setting (voice-knobs.js): tapping one moves the knobs
// (tweaks.js) to where it puts them, and a second voice adds its knobs on
// top. A sound saved with an old voice keeps its chain ("Chipmunk, then
// Stadium") and plays as it did; ⤢ Turn into knobs changes it. With
// Layers (shape.js draws them) show the knobs as rows in the order they
// play, each with its control, 🔈 mute and (for the ones that can go) ✕; with
// Advanced on, the kid's own steps are rows too, to add, drag, open and
// tune, and a slider on a live step changes the sound while it loops.

import { state, persist, setOverride, deleteUserClip, saveMyVoice, deleteMyVoice } from './state.js';
import { audio, trimBounds, keptAudio, levelsOf, levelVerdict, TOO_LOUD, padTo } from './audio.js';
import { meter, drawGrille, levelOf } from './meter.js';
import { currentPerson, clipsFor, colorName, nextClipColor } from './board.js';
import { overrideFor, withHidden } from './model.js';
import { applyChain, livePlan, voiceById, amountFor, amountText, chainOf, chainFields, recipeKey, surpriseShape, openVoice, stepLook, MAX_CHAIN } from './voices.js';
import { buildLive, tailOf, newStep, isLive, cleanStep, kindById } from './steps.js';
import { renderLayers, renderLayerPalette, fromSlider, numsOf, sliderText } from './shape.js';
import { getSetting, setSetting, onSetting } from './settings.js';
import { padFor, renderPads } from './pads.js';
import { openDialog, setupDialog } from './dialogs.js';
import { extensionFor, slug, newId } from './util.js';
import { soundName, synthName, mixName, funName } from './names.js';
import { MIX, cleanMix, mixSounds } from './mix.js';
import { showNotice } from './ui.js';
import { track } from './telemetry.js';
import { STARTERS, TONES, LIMITS, RATE, renderSynth, cleanSynth, surpriseSynth } from './synth.js';
import { encodeWav } from './sequencer.js';
import { findNote, noteName } from './pitch.js';
import { cutKey, cleanEdits, cleanFade } from './cuts.js';
import { createWave } from './wave.js';
import { createCut } from './chop.js';
import { fitLine, keysForSlider, showingKeys, KEYED_STEPS } from './lines.js';
import { NO_TWEAKS, MORE_KNOBS, cleanTweaks, fullTweaks, tweakText, tweakByKey, allNormal, knobMoved, layerRows, addableKnobs, ADDED_AT } from './tweaks.js';
import { PRESETS, presetById, stackAll, matches, voiceLine, presetText, chainToKnobs, hasClassicVoice, surpriseVoices, cleanMyVoice, myVoicesFor, MY_VOICE_CHIPS } from './voice-knobs.js';
import { emojiMore, withCurrent } from './emoji-more.js';

let emojiAll = null;   // the "…" full list under the Picture choices (emoji-more.js)
export const EMOJI = ['📣', '🎺', '🥁', '🎸', '💥', '🚀', '⚡', '🔔', '🎉', '👋', '😂', '😱',
  '🤖', '👻', '🦖', '🐶', '🐱', '🐸', '🐔', '🦆', '🐮', '🍕', '💨', '💩'];
const MAX_RECORD_SECONDS = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// A chosen file can be small and still decode to a lot of audio (a long, low
// bitrate recording), and every voice renders from the decoded copy.
const MAX_CLIP_SECONDS = 120;
// Record counts 3, 2, 1 before it listens, so the start of a word isn't
// lost to the tap. Tests shorten the beat.
export const COUNT_IN = { from: 3, ms: 700 };
const LOUD_SHOW_MS = 600;   // how long the grille stays red after the sound hit the top

const el = {};
let wave;  // the sound's wave (wave.js), made in initSheet
let cut;   // trim and chop (chop.js), made in initSheet

const sheet = {
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
const live = { on: false, split: null, nodes: null, starting: null };

// The one Advanced switch (Settings, and at the bottom of Layers) shows the kid's own steps.
const advanced = () => getSetting('advancedBeats') === true;

const recording = {
  stream: null,
  recorder: null,
  chunks: [],
  source: null,
  analyser: null,
  timer: 0,
  raf: 0,
  started: 0,
  discard: false,
  counting: 0,          // the count-in timer while it says 3, 2, 1; 0 once it listens
  loudUntil: 0,         // the grille is red until then: the sound hit the top
  scratch: new Float32Array(512),
};

export const isSheetOpen = () => el.sheet.open;
export const isRecording = () => !!recording.recorder;

// The link of the chain being edited.
const link = () => sheet.chain[sheet.link];

function canRecord() {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && 'MediaRecorder' in window;
}

function sheetError(text) {
  el.sheetError.textContent = text || '';
  el.sheetError.hidden = !text;
}

function setStatus(text) {
  el.recStatus.textContent = text;
}

// The short list, the picture in use if it came from "…", then "…".
function renderEmojiGrid() {
  el.emojiGrid.replaceChildren(...withCurrent(EMOJI, sheet.emoji).map((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.dataset.emoji = e;
    b.setAttribute('aria-pressed', String(e === sheet.emoji));
    return b;
  }), emojiAll.button);
}

function renderPickers() {
  renderVoiceChips();
  renderEmojiGrid();
  emojiAll.reset();
  el.swatches.replaceChildren(...Object.entries(state.manifest.palette).map(([name, hex]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.color = name;
    b.style.setProperty('--c', hex);
    b.setAttribute('aria-label', name[0].toUpperCase() + name.slice(1));
    b.setAttribute('aria-pressed', String(name === sheet.color));
    return b;
  }));
}

// Voices can be tried once there is audio: after recording/choosing a file
// for a new sound, or straight away when editing one.
function setVoicesReady(ready) {
  sheet.ready = ready;
  el.sheetPlay.disabled = !ready;
  el.amount.disabled = !ready;
  amountKeys?.();
  el.voiceHint.hidden = ready;
  renderVoices();
  cut.ready();
}

// Simple or Advanced: Advanced shows the kid's own steps as layers (and the
// old voices as steps), Find its note and Mix, and on a wide screen the sheet
// widens to put Layers in a column of its own.
function renderMode() {
  const adv = advanced();
  el.sheet.classList.toggle('wide', adv);
  el.layerExtra.hidden = !adv;
  el.shapeSurprise.hidden = !adv;
  el.sheetAdvanced.checked = adv;
  // Its box is marked .on: Firefox before 121 has no :has(input:checked).
  el.sheetAdvanced.closest('label').classList.toggle('on', adv);
}

// ── Voices as knob settings (voice-knobs.js) ──────────────────────────
// The chips: every voice but Normal, emoji only (the name is its label and
// its title), then the person's three latest own voices, ⭐ My voices ▾ for
// all of them, and 🎲. A chip is lit while the knobs are where its voice put
// them; moving a knob by hand makes them the kid's own.

const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

// The person's own voices, cleaned, most recently used first.
const myVoices = () => myVoicesFor(state.myVoices, currentPerson().id).map(cleanMyVoice).filter(Boolean);

// A voice as the sheet stacks it: a built-in one, or one of the person's own.
function voiceFor(b) {
  if (b.dataset.preset) return presetById(b.dataset.preset);
  const mine = myVoices().find((v) => v.id === b.dataset.my);
  return mine ? { id: `my:${mine.id}`, name: mine.name, emoji: mine.emoji, knobs: mine.knobs } : null;
}

function voiceChip(look, data) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'voice-chip';
  Object.assign(b.dataset, data);
  const e = document.createElement('span');
  e.className = 'voice-emoji';
  e.setAttribute('aria-hidden', 'true');
  e.textContent = look.emoji;
  b.append(e);
  return b;
}

function renderVoiceChips() {
  const mine = myVoices();
  const chips = PRESETS.map((p) => {
    const b = voiceChip(p, { preset: p.id });
    b.setAttribute('aria-label', p.special ? `${p.name} (special)` : p.name);
    b.title = p.special ? `${p.name} ✦ special` : p.name;
    if (p.special) {
      const s = document.createElement('span');
      s.className = 'voice-special';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = '✦';
      b.append(s);
    }
    return b;
  });
  for (const v of mine.slice(0, MY_VOICE_CHIPS)) {
    const b = voiceChip({ emoji: v.emoji || '⭐' }, { my: v.id });
    b.classList.add('my-voice');
    if (v.name) {
      const n = document.createElement('span');
      n.className = 'voice-name';
      n.textContent = v.name;
      b.append(n);
    }
    b.setAttribute('aria-label', v.name || v.emoji);
    b.title = v.name || v.emoji;
    chips.push(b);
  }
  if (mine.length) {
    const list = voiceChip({ emoji: '⭐' }, { myOpen: '1' });
    list.classList.add('my-voices-open');
    const words = document.createElement('span');
    words.className = 'voice-name';
    words.textContent = 'My voices ▾';
    list.append(words);
    list.setAttribute('aria-label', 'My voices');
    list.setAttribute('aria-expanded', String(!el.myList.hidden));
    list.setAttribute('aria-controls', 'my-voice-list');
    chips.push(list);
  } else el.myList.hidden = true;
  const surprise = voiceChip({ emoji: '🎲' }, { surprise: '1' });
  surprise.setAttribute('aria-label', 'Surprise me');
  surprise.title = 'Surprise me';
  chips.push(surprise);
  el.voices.replaceChildren(...chips);
  renderMyList(mine);
}

// ⭐ My voices ▾: every one of the person's own voices, to use, rename or delete.
function renderMyList(mine = myVoices()) {
  el.myList.replaceChildren(...mine.map((v) => {
    const li = document.createElement('li');
    li.className = 'chain-item my-voice-item';
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'chain-link';
    use.dataset.my = v.id;
    use.textContent = [v.emoji, v.name].filter(Boolean).join(' ');
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'chain-remove';
    rename.dataset.rename = v.id;
    rename.setAttribute('aria-label', `Rename ${v.name || v.emoji}`);
    rename.textContent = '✏️';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'chain-remove my-voice-delete';
    del.dataset.deleteVoice = v.id;
    del.setAttribute('aria-label', `Delete ${v.name || v.emoji}`);
    del.textContent = '🗑️';
    li.append(use, rename, del);
    return li;
  }));
}

// Everything the voice part shows, after the knobs, the lit voices or the chain changed.
function renderVoices() {
  const ids = new Set(sheet.lit.map((p) => p.id));
  for (const b of el.voices.children) {
    b.disabled = !sheet.ready;
    const v = b.dataset.preset ? b.dataset.preset : b.dataset.my ? `my:${b.dataset.my}` : null;
    if (v) b.setAttribute('aria-pressed', String(ids.has(v)));
    if (b.dataset.myOpen) b.setAttribute('aria-expanded', String(!el.myList.hidden));
  }
  for (const b of el.myList.querySelectorAll('button')) b.disabled = !sheet.ready && !b.dataset.rename && !b.dataset.deleteVoice;
  el.voiceLine.textContent = sheet.ready ? voiceLine(sheet.lit, sheet.tweaks) : '';
  el.keepBtn.disabled = !sheet.ready || allNormal(sheet.tweaks);
  el.normalBtn.disabled = !sheet.ready || (allNormal(sheet.tweaks) && plainChain());
  el.plainBtn.disabled = el.normalBtn.disabled;   // with no voice on, plain sounds the same
  renderTweaks();
  renderChain();
}

// A voice chip tapped: its knobs go on top of the knobs (the last tap wins a
// knob both use), and it lights. Tapping a lit voice takes it off again: the
// knobs go back to what they were, with the other lit voices on top.
function tapVoice(voice) {
  const from = { ...sheet.tweaks };
  if (!sheet.lit.length) sheet.base = { ...sheet.tweaks };
  const on = sheet.lit.some((p) => p.id === voice.id);
  sheet.lit = on ? sheet.lit.filter((p) => p.id !== voice.id) : [...sheet.lit, voice];
  sheet.tweaks = stackAll(sheet.base, sheet.lit);
  // A voice whose knob a later one took is no longer what the knobs say.
  sheet.lit = sheet.lit.filter((p) => matches(sheet.tweaks, p.knobs));
  // A knob a voice moves plays: its mute comes off.
  for (const k of Object.keys(voice.knobs)) sheet.muted.delete(k);
  knobsChanged();
  moveKnobs(from, Object.keys(voice.knobs));
  previewVoice();
}

// On open: the voices (built-in, then the person's own) whose knobs are all
// where the sound's knobs are light up, and `base` is the knobs without them.
function litFromKnobs() {
  const mine = myVoices().map((v) => ({ id: `my:${v.id}`, name: v.name, emoji: v.emoji, knobs: v.knobs }));
  sheet.lit = [...PRESETS, ...mine].filter((p) => matches(sheet.tweaks, p.knobs));
  sheet.base = { ...sheet.tweaks };
  for (const p of sheet.lit) for (const k of Object.keys(p.knobs)) sheet.base[k] = NO_TWEAKS[k];
}

// The knobs moved (a voice, Normal, 🎲, Turn into knobs): ⭐ Save voice's
// form closes and ↩️ The old way is forgotten.
function knobsChanged() {
  sheet.undo = null;
  sheet.shown.clear();   // Layers show the knobs the voice set, not ones it left (Q42b)
  closeKeep();
  renderVoices();
}

// A knob moved by hand: the voices are no longer lit; the knobs are the kid's own.
function knobMovedByHand() {
  sheet.lit = [];
  sheet.undo = null;
  renderVoices();
}

// The knobs a voice moved slide from where they were (about 300 ms) and glow
// for a second, so a kid sees which knobs make the voice. Reduced motion:
// the glow only. The knobs already hold their new values; the slide is drawn
// from the next frame on.
function moveKnobs(from, keys) {
  const rows = keys.map((k) => knobRow(k)).filter(Boolean);
  for (const row of rows) {
    row.classList.remove('knob-glow');
    void row.offsetWidth;   // restart the glow
    row.classList.add('knob-glow');
    setTimeout(() => row.classList.remove('knob-glow'), 1200);
  }
  if (reducedMotion() || typeof requestAnimationFrame !== 'function') return;
  const sliders = keys.map((k) => ({ k, input: el.layerRows.querySelector(`input[data-layer-knob="${k}"]`) }))
    .filter(({ k, input }) => input && !input.parentElement.classList.contains('keyed') && from[k] !== sheet.tweaks[k]);
  if (!sliders.length) return;
  let start = null;
  const frame = (now) => {
    start ??= now;
    const t = Math.min(1, (now - start) / 300);
    const ease = 1 - (1 - t) ** 3;
    for (const { k, input } of sliders) {
      const v = from[k] + (sheet.tweaks[k] - from[k]) * ease;
      input.value = String(v);
      if (input.isConnected) input.parentElement.querySelector('output').textContent = tweakText(k, t < 1 ? Math.round(v / Number(input.step)) * Number(input.step) : sheet.tweaks[k]);
    }
    if (t < 1) requestAnimationFrame(frame);
    else renderTweaks();
  };
  requestAnimationFrame(frame);
}

const knobRow = (k) => el.layerRows.querySelector(`[data-layer="${k}"]`);

// ↩️ Reset voice: every knob back to the middle, no voices, nothing from the old way.
function backToNormal() {
  const from = { ...sheet.tweaks };
  const moved = Object.keys(sheet.tweaks).filter((k) => sheet.tweaks[k] !== NO_TWEAKS[k]);
  sheet.tweaks = { ...NO_TWEAKS };
  sheet.lit = [];
  sheet.chain = [editable({ voice: 'normal' })];
  sheet.link = 0;
  sheet.knobsFirst = true;
  sheet.muted.clear();
  knobsChanged();
  live.on = false;
  renderAmount();
  moveKnobs(from, moved);
  previewVoice();
}

// 🎲 Surprise me: one to three voices from different families, stacked on normal knobs.
function surpriseKnobs() {
  const from = { ...sheet.tweaks };
  sheet.base = { ...NO_TWEAKS };
  sheet.lit = surpriseVoices().map(presetById);
  sheet.tweaks = stackAll(sheet.base, sheet.lit);
  sheet.muted.clear();
  knobsChanged();
  moveKnobs(from, Object.keys(sheet.tweaks).filter((k) => sheet.tweaks[k] !== from[k]));
  previewVoice();
}

// ⤢ Turn into knobs: the old voices become knob positions (close, not the
// same: the kid's choice). ↩️ The old way puts them back until anything else changes.
function turnIntoKnobs() {
  const before = { chain: sheet.chain.map((s) => ({ ...s })), tweaks: { ...sheet.tweaks }, knobsFirst: sheet.knobsFirst };
  const from = { ...sheet.tweaks };
  const { knobs, rest } = chainToKnobs(sheet.chain, sheet.tweaks);
  sheet.tweaks = knobs;
  sheet.chain = rest.length ? rest.map(editable) : [editable({ voice: 'normal' })];
  sheet.link = sheet.chain.length - 1;
  sheet.knobsFirst = true;
  sheet.lit = [];
  knobsChanged();
  sheet.undo = before;
  renderChain();
  renderAmount();
  moveKnobs(from, Object.keys(knobs).filter((k) => knobs[k] !== from[k]));
  previewVoice();
}

function oldWayBack() {
  if (!sheet.undo) return;
  Object.assign(sheet, { chain: sheet.undo.chain, tweaks: sheet.undo.tweaks, knobsFirst: sheet.undo.knobsFirst, lit: [], undo: null });
  sheet.link = sheet.chain.length - 1;
  renderVoices();
  renderAmount();
  previewVoice();
}

// The knobs as they play: a muted one counts as normal (⭐ Save voice keeps what is heard).
const playingKnobs = () => fullTweaks(Object.fromEntries(Object.entries(sheet.tweaks).map(([k, v]) => [k, sheet.muted.has(k) ? NO_TWEAKS[k] : v])));

// ⭐ Save voice: a name (a fun one offered, never a person's) and a
// picture, then the knobs as they are now become the person's own voice.
const KEEP_EMOJI = ['⭐', '🎤', '🦄', '🐉', '👾', '🎃', '🧙', '🐙', '🌈', '🔥'];

function openKeep(edit = null) {
  sheet.keep = edit ? { id: edit.id } : {};
  sheet.keepEmoji = edit ? edit.emoji : '';
  el.keepTitle.textContent = edit ? 'New name' : 'Name it';
  el.keepName.value = edit ? edit.name : '';
  el.keepName.placeholder = funName(myVoices().map((v) => v.name));
  el.keepSaveLabel.textContent = edit ? 'Rename it' : 'Save it';
  renderKeepEmoji();
  el.keepForm.hidden = false;
  el.keepBtn.setAttribute('aria-expanded', 'true');
  el.keepName.focus({ preventScroll: true });
}

function closeKeep() {
  sheet.keep = null;
  el.keepForm.hidden = true;
  el.keepBtn.setAttribute('aria-expanded', 'false');
}

function renderKeepEmoji() {
  el.keepEmoji.replaceChildren(...withCurrent(KEEP_EMOJI, sheet.keepEmoji || KEEP_EMOJI[0]).map((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.keepEmoji = e;
    b.textContent = e;
    b.setAttribute('aria-pressed', String(e === sheet.keepEmoji));
    return b;
  }));
}

async function keepVoice() {
  if (!sheet.keep) return;
  const typed = el.keepName.value.trim();
  const editing = sheet.keep.id ? myVoices().find((v) => v.id === sheet.keep.id) : null;
  const now = Date.now();
  const record = cleanMyVoice(editing
    ? { ...editing, name: typed, emoji: sheet.keepEmoji, edited: now }
    : { id: newId('voice'), personId: currentPerson().id, name: typed || (sheet.keepEmoji ? '' : el.keepName.placeholder), emoji: sheet.keepEmoji, knobs: playingKnobs(), created: now, used: now });
  if (!record) { el.keepName.focus(); return; }   // a rename with no name and no picture
  await saveMyVoice(record);
  closeKeep();
  if (!editing) {
    // The knobs are that voice now: it lights.
    sheet.base = { ...NO_TWEAKS };
    sheet.lit = [{ id: `my:${record.id}`, name: record.name, emoji: record.emoji, knobs: record.knobs }];
  } else sheet.lit = sheet.lit.map((p) => (p.id === `my:${record.id}` ? { ...p, name: record.name, emoji: record.emoji } : p));
  renderVoiceChips();
  renderVoices();
}

// 🗑️ on one of the person's own voices: the first tap asks, the second deletes.
async function deleteVoice(b) {
  if (!b.classList.contains('armed')) {
    b.classList.add('armed');
    b.textContent = 'Delete?';
    return;
  }
  const id = b.dataset.deleteVoice;
  await deleteMyVoice(id);
  sheet.lit = sheet.lit.filter((p) => p.id !== `my:${id}`);
  if (sheet.keep?.id === id) closeKeep();
  renderVoiceChips();
  renderVoices();
}

// A person's own voice used: it moves to the front of their chips.
function usedMyVoice(id) {
  const v = myVoices().find((x) => x.id === id);
  if (v) saveMyVoice({ ...v, used: Date.now() });
}

function wireVoices() {
  let pressTimer = 0;
  let peeked = null;   // the chip a long press named, whose click that follows is not a tap
  el.voices.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.surprise) { surpriseKnobs(); return; }
    if (b.dataset.myOpen) {
      el.myList.hidden = !el.myList.hidden;
      renderVoices();
      return;
    }
    if (peeked === b) { peeked = null; return; }   // a long press showed its name: not a tap
    const voice = voiceFor(b);
    if (!voice) return;
    if (e.shiftKey) { peekVoice(voice); return; }   // Shift does what a hold does
    tapVoice(voice);
    if (b.dataset.my) { usedMyVoice(b.dataset.my); renderVoiceChips(); renderVoices(); }
  });
  // A long press (or Shift-click) on a chip says its name and its knobs in
  // the line, without using it (a mouse has the title too).
  const peekVoice = (voice) => { el.voiceLine.textContent = `${voice.emoji} ${voice.name || ''}: ${presetText(voice.knobs)}`; };
  el.voices.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    clearTimeout(pressTimer);
    if (!b || b.disabled) return;
    const voice = voiceFor(b);
    if (!voice) return;
    pressTimer = setTimeout(() => {
      peeked = b;
      peekVoice(voice);
    }, 500);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) el.voices.addEventListener(type, () => clearTimeout(pressTimer));
  el.voices.addEventListener('contextmenu', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  el.myList.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.rename) openKeep(myVoices().find((v) => v.id === b.dataset.rename));
    else if (b.dataset.deleteVoice) deleteVoice(b);
    else if (b.dataset.my) {
      const voice = voiceFor(b);
      if (!voice) return;
      tapVoice(voice);
      usedMyVoice(b.dataset.my);
      renderVoiceChips();
      renderVoices();
    }
  });
  el.normalBtn.addEventListener('click', () => { if (!el.normalBtn.disabled) backToNormal(); });
  el.keepBtn.addEventListener('click', () => {
    if (el.keepBtn.disabled) return;
    if (sheet.keep) closeKeep(); else openKeep();
  });
  el.keepEmoji.addEventListener('click', (e) => {
    const b = e.target.closest('[data-keep-emoji]');
    if (!b) return;
    sheet.keepEmoji = sheet.keepEmoji === b.dataset.keepEmoji ? '' : b.dataset.keepEmoji;   // tap again: no picture
    renderKeepEmoji();
  });
  el.keepSave.addEventListener('click', keepVoice);
  el.keepCancel.addEventListener('click', closeKeep);
  // Enter in the name keeps it, and doesn't save the whole sound.
  el.keepName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); keepVoice(); } });
  el.chainKnobs.addEventListener('click', () => { if (!el.chainKnobs.disabled) turnIntoKnobs(); });
  el.chainUndo.addEventListener('click', oldWayBack);
}

// The sheet's folding sections (Ben, 2026-10-11: "same with tweaks in the
// sound editor"): Voice and Layers fold under headings like Settings'. Open to start; a fold is kept while the page is open (not
// remembered on the device: provisional, docs/questions.md). ⭐ Save voice
// and ↩️ Reset voice sit outside the folds, so they are always there.
const folds = { voice: true, layers: true };

function renderFolds() {
  for (const b of el.sheet.querySelectorAll('[data-fold]')) {
    const open = folds[b.dataset.fold] !== false;
    b.setAttribute('aria-expanded', String(open));
    b.querySelector('.set-head-caret').textContent = open ? '▾' : '▸';
    const body = el.sheet.querySelector(`#${b.dataset.fold}-body`);
    if (body) body.hidden = !open;
  }
}

function wireFolds() {
  el.sheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fold]');
    if (!b) return;
    folds[b.dataset.fold] = !(folds[b.dataset.fold] !== false);
    renderFolds();
  });
}

// The sticky row sits under the sheet's sticky heading, whose height changes
// with its title: measured when the sheet opens and when the window resizes.
function placeStickyRow() {
  const head = el.sheet.querySelector('.sheet-head');
  if (head?.offsetHeight) el.sheet.style.setProperty('--sheet-head-h', `${head.offsetHeight}px`);
}

// A chain step as the sheet edits it: a voice's amount null for a voice
// without one. Other steps (Shape it) are edited as they are stored.
const editable = (s) => (s.type && s.type !== 'voice' ? { ...s } : { type: 'voice', voice: s.voice, amount: amountFor(s.voice, s.amount) });

// The old way (simple mode): a sound saved with old voices, or with Shape
// it steps, shows them as chips in the order they play (tap one for its
// slider, ✕ to take it out), with ⤢ Turn into knobs for the voices. It plays
// exactly as it did until the kid changes it. A plain sound shows nothing here.
function renderChain() {
  const adv = advanced();
  el.chain.hidden = adv || (plainChain() && !sheet.undo);
  el.chainLinks.hidden = plainChain();
  el.chainHint.hidden = plainChain();
  el.chainKnobs.hidden = !hasClassicVoice(sheet.chain);
  el.chainKnobs.disabled = !sheet.ready;
  el.chainUndo.hidden = !sheet.undo;
  el.chainLinks.replaceChildren(...(plainChain() ? [] : sheet.chain).map((s, i) => {
    const v = stepLook(s);
    const li = document.createElement('li');
    li.className = 'chain-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chain-link';
    b.dataset.link = String(i);
    b.dataset.voice = s.voice ?? s.type;
    b.disabled = !sheet.ready;
    b.setAttribute('aria-pressed', String(i === sheet.link));
    const e = document.createElement('span');
    e.setAttribute('aria-hidden', 'true');
    e.textContent = v.emoji;
    if (i > 0) {   // reads as a sentence: Chipmunk, then Stadium
      const then = document.createElement('span');
      then.className = 'chain-then';
      then.textContent = 'then';
      b.append(then);
    }
    b.append(e, v.name);
    li.append(b);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chain-remove';
    x.dataset.remove = String(i);
    x.disabled = !sheet.ready;
    x.setAttribute('aria-label', `Take out ${v.name}`);
    x.textContent = '✕';
    li.append(x);
    return li;
  }));
  if (adv) {
    el.shapeSurprise.disabled = !sheet.ready;
    renderNote();
  }
}

// The steps Layers show as rows: the chain with Advanced on, unless it is
// only Normal (a plain sound).
const shownSteps = () => (advanced() && !plainChain() ? sheet.chain.length : 0);

// Layers: every row, top to bottom as they play (tweaks.js layerRows), then
// + Add a layer's palette. A sound saved with old voices and knobs plays its
// knobs after its steps (sheet.knobsFirst), so there they sit after them.
function renderLayerRows() {
  for (const k of MORE_KNOBS) if (sheet.tweaks[k] !== NO_TWEAKS[k]) sheet.shown.add(k);
  const rows = layerRows(sheet.tweaks, { shown: [...sheet.shown], steps: shownSteps(), knobsFirst: sheet.knobsFirst || plainChain() });
  // A ✕ waiting for its second tap whose row went away is forgotten.
  if (sheet.armed && !rows.includes(sheet.armed)) sheet.armed = null;
  const canOpen = (s) => { const steps = openVoice(s); return !!steps && sheet.chain.length - 1 + steps.length <= MAX_CHAIN; };
  renderLayers(el.layerRows, rows, { tweaks: sheet.tweaks, muted: sheet.muted, chain: sheet.chain, ready: sheet.ready, armed: sheet.armed, canOpen });
  const knobs = addableKnobs(sheet.tweaks, [...sheet.shown]);
  const stepsOn = advanced() && sheet.chain.length < MAX_CHAIN;
  renderLayerPalette(el.layerPalette, { knobs, steps: advanced(), stepsOn });
  el.layerAdd.disabled = !sheet.ready || (!knobs.length && !stepsOn);
  if (el.layerAdd.disabled) closePalette();
}

// ── 🎵 Find its note and Tune ─────────────────────────────────────────
// Tune is a Higher or lower (tape) at the end of the chain; the note is
// found for the chain before it, then moved by its notes.

function tuneOf(chain) {
  const last = chain.at(-1);
  return last?.type === 'pitch' && !last.keep ? { base: chain.slice(0, -1), notes: last.notes, has: true } : { base: chain, notes: 0, has: false };
}
// The trim and edits are part of it: a note found before the sound was trimmed may not hold after.
const baseKey = (chain) => recipeKey({ fx: tuneOf(chain).base }) + cutKey(sheet);

// The note as it plays now: the one found, moved by Tune; null when there
// is none, or the chain changed since it was found.
function rootNow() {
  if (!sheet.found || sheet.found.midi === null || sheet.found.key !== baseKey(sheet.chain)) return undefined;
  return Math.min(127, Math.max(0, sheet.found.midi + tuneOf(sheet.chain).notes + sheet.tweaks.pitch));
}

const notesText = (n) => `${Math.abs(n)} note${Math.abs(n) === 1 ? '' : 's'} ${n > 0 ? 'up' : 'down'}`;

function renderNote() {
  const fresh = sheet.found && sheet.found.key === baseKey(sheet.chain);
  const { notes } = tuneOf(sheet.chain);
  el.noteBtn.disabled = !sheet.ready;
  if (!fresh) {
    el.noteOut.textContent = '';
    el.tuneRow.hidden = true;
    return;
  }
  if (sheet.found.midi === null) {
    el.noteOut.textContent = 'No clear note: it is more of a noise. Drums don’t need one.';
    el.tuneRow.hidden = true;
    return;
  }
  el.noteOut.textContent = notes
    ? `Sounds like ${noteName(sheet.found.midi)}, tuned to ${noteName(sheet.found.midi + notes)}.`
    : `Sounds like ${noteName(sheet.found.midi)}.`;
  el.tuneRow.hidden = false;
  el.tune.disabled = !sheet.ready || (notes === 0 && sheet.chain.length >= MAX_CHAIN);
  el.tune.value = String(notes);
  el.tuneOut.textContent = notes ? `${notesText(notes)}: ${noteName(sheet.found.midi + notes)}` : noteName(sheet.found.midi);
}

async function findItsNote() {
  if (!sheet.original) return;
  const base = tuneOf(sheet.chain).base.map((s) => ({ ...s }));
  const key = recipeKey({ fx: base });   // the sheet's previews are all of this trim
  // The same render ▶︎ plays for that chain (the preset's level too), as it shares its key.
  const job = previewOf(key, () => sheet.original.then((b) => applyChain(b, base, null, sheet.clip?.level)));
  const expected = sheet.original;
  el.noteOut.textContent = 'Listening…';
  try {
    const rendered = await job;
    if (sheet.original !== expected || !el.sheet.open) return;
    const note = findNote(rendered.buffer);
    sheet.found = { midi: note ? note.midi : null, key: baseKey(sheet.chain) };
  } catch (err) {
    console.error('Find its note failed:', err);
    sheet.found = null;
  }
  renderNote();
}

// ── ➕ Mix with another sound ─────────────────────────────────────────

const mixPartner = () => clipsFor(currentPerson().id, { allPresets: true }).find((c) => c.id === sheet.mix.with);

function renderMix() {
  const other = mixPartner();
  el.mixOffset.value = String(sheet.mix.offset);
  el.mixOffsetOut.textContent = sheet.mix.offset ? `${sheet.mix.offset.toFixed(2)} s` : 'together';
  el.mixBalance.value = String(sheet.mix.balance);
  const b = sheet.mix.balance;
  el.mixBalanceOut.textContent = Math.abs(b - 0.5) < 0.03 ? 'half and half' : b < 0.5 ? 'more of this one' : `more ${other?.label ?? 'of the other'}`;
  for (const x of [el.mixPlay, el.mixMake]) x.disabled = !other || !sheet.ready;
}

function openMix() {
  const here = sheet.clip?.id;
  const options = clipsFor(currentPerson().id).filter((c) => c.id !== here);
  el.mixWith.replaceChildren(...options.map((c) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.emoji || '🔊'} ${c.label}`;
    return o;
  }));
  sheet.mix.with = options.some((c) => c.id === sheet.mix.with) ? sheet.mix.with : options[0]?.id ?? null;
  el.mixWith.value = sheet.mix.with ?? '';
  renderMix();
}

// This sound as it plays now, the other as it plays on its pad, mixed.
async function buildMix() {
  const other = mixPartner();
  if (!other || !sheet.original) return null;
  const [mine, theirs] = await Promise.all([rendered(), audio.load(other)]);
  // Each sound as long as it plays (a beat made a sound keeps its silent tail).
  const side = ({ buffer, duration }) => ({
    channels: Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).subarray(0, Math.round(duration * buffer.sampleRate))),
    rate: buffer.sampleRate,
  });
  const chans = mixSounds(side(mine), side(theirs), sheet.mix);
  const out = new AudioBuffer({ length: chans[0].length, numberOfChannels: chans.length, sampleRate: mine.buffer.sampleRate });
  chans.forEach((d, c) => out.copyToChannel(d, c));
  return { buffer: out, other };
}

async function hearMix() {
  try {
    const made = await buildMix();
    if (!made || !el.sheet.open) return;
    live.on = false;
    wave.show(made.buffer, made.buffer.duration);
    audio.start('preview', { buffer: made.buffer, duration: made.buffer.duration });
    wave.follow('preview');
  } catch (err) {
    console.error('The mix did not render:', err);
    sheetError('That mix didn’t work. Pick another sound.');
  }
}

// The mix becomes a new sound on this board, named as a blend of the two.
async function makeMix() {
  let made;
  try { made = await buildMix(); } catch (err) { console.error('The mix did not render:', err); }
  if (!made) { sheetError('That mix didn’t work. Pick another sound.'); return; }
  const p = currentPerson();
  const here = sheet.clip;
  const clip = {
    id: newId('user'),
    personId: p.id,
    label: mixName(here.label, made.other.label, clipsFor(p.id, { includeHidden: true }).map((c) => c.label)),
    emoji: here.emoji || made.other.emoji || '🎛️',
    color: nextClipColor(p.id),
    voice: 'normal',
    blob: encodeWav(made.buffer),
    mime: 'audio/wav',
    from: { id: here.id, how: 'mix' },
    // Two beats made into sounds: the mix keeps their length too, to loop in time.
    ...(here.exact && made.other.exact ? { exact: true } : {}),
    created: Date.now(),
  };
  state.userClips.push(clip);
  if (!(await persist('clips', clip))) {
    state.userClips = state.userClips.filter((c) => c !== clip);
    sheetError('That mix didn’t save. Tap Make it a new sound to try again.');
    return;
  }
  // What it plays now is what it plays after a reload: its quiet ends off
  // (keptAudio), or all of it when it is exact.
  audio.keepOriginal(clip, Promise.resolve(keptAudio(made.buffer, clip)));
  closeSheet();
  renderPads();
  showNotice(`Made “${clip.label}” from ${here.label} and ${made.other.label}. It’s on your board.`);
}

// Tune: sets (or adds, or removes at 0) the Higher or lower at the end.
function setTune(n) {
  if (tuneOf(sheet.chain).has) {
    if (n !== 0) sheet.chain.at(-1).notes = n;
    else {
      sheet.chain.pop();
      if (!sheet.chain.length) sheet.chain.push(editable({ voice: 'normal' }));
    }
  } else if (n !== 0 && sheet.chain.length < MAX_CHAIN) {
    if (plainChain()) sheet.chain = [];   // a plain sound: the tune is all there is
    sheet.chain.push({ type: 'pitch', notes: n, keep: false });
  }
  sheet.link = Math.min(sheet.link, sheet.chain.length - 1);
}

const plainChain = () => sheet.chain.length === 1 && sheet.chain[0].type === 'voice' && sheet.chain[0].voice === 'normal';

// After the chain or the chosen link changed: the slider, the old-way chips
// and Shape it follow (and ↩️ Reset voice, which also clears the chain).
function showLink() {
  renderAmount();
  renderVoices();
}

// mode 'new', or 'edit' with the clip. `returnToPad` is the pad that gets
// focus back when the sheet closes if the pad it came from was redrawn.
export function openSheet(mode, clip = null, { returnToPad = null } = {}) {
  audio.stopAll();
  const p = currentPerson();
  sheet.mode = mode;
  sheet.clip = clip;
  sheet.pending = null;
  sheet.original = mode === 'edit' ? audio.original(clip) : null;
  sheet.previews = new Map();
  sheet.chain = chainOf(clip).map(editable);
  sheet.tweaks = fullTweaks(clip?.tweaks);
  litFromKnobs();
  sheet.undo = null;
  sheet.shown = new Set();
  sheet.muted = new Set(cleanTweaks(clip?.tweaks)?.muted ?? []);
  sheet.armed = null;
  // Knobs saved with `first` play first; a sound with old voices plays its
  // knobs (once Tweaks) after them, as it did; anything else gets knobs first.
  const stored = cleanTweaks(clip?.tweaks);
  sheet.knobsFirst = stored ? stored.first === true : !hasClassicVoice(sheet.chain);
  sheet.trim = clip?.trim ?? null;
  sheet.edits = cleanEdits(clip?.edits);
  sheet.fade = cleanFade(clip?.fade);
  sheet.link = sheet.chain.length - 1;
  // ➕ Mix with: only for a saved sound (the mix names where it came from).
  el.mix.hidden = true;
  el.mixBtn.hidden = mode !== 'edit';
  el.mixBtn.setAttribute('aria-expanded', 'false');
  sheet.mix = { with: null, offset: MIX.offset.default, balance: MIX.balance.default };
  // A saved note stands for the chain it was saved with, before its Tune.
  sheet.found = Number.isInteger(clip?.root) ? { midi: clip.root - tuneOf(sheet.chain).notes - sheet.tweaks.pitch, key: baseKey(sheet.chain) } : null;
  sheet.emoji = clip?.emoji || EMOJI[Math.floor(Math.random() * EMOJI.length)];
  sheet.color = clip?.color ? colorName(clip.color) : nextClipColor(p.id);

  el.sheetTitle.textContent = mode === 'new' ? `New sound for ${p.name}` : 'Edit sound';
  el.label.value = clip?.label || '';
  // A new sound is offered a made-up name up front; typing replaces it.
  el.label.placeholder = mode === 'new' ? soundName(clipsFor(p.id, { includeHidden: true }).map((c) => c.label)) : '';
  sheetError('');

  // Audio capture only when making a new sound; editing keeps the audio.
  el.capture.hidden = mode !== 'new';
  el.sheetPlay.disabled = mode !== 'edit';
  el.fileInput.value = '';
  el.recBtn.disabled = !canRecord();
  setStatus(canRecord()
    ? 'Tap Record, say something, then tap Stop.'
    : 'Recording works when the app is opened from localhost or https. You can still choose a sound file.');
  drawGrille(el.recGrille, 0);

  el.removeBtn.classList.remove('armed');
  el.removeBtn.hidden = mode !== 'edit';
  if (mode === 'edit') {
    el.removeBtn.textContent = clip.source === 'user' ? 'Delete sound' : clip.hidden ? 'Show sound' : 'Hide sound';
    el.removeBtn.classList.toggle('danger', clip.source === 'user');
  }

  el.download.hidden = true;
  if (mode === 'edit' && clip.source === 'user') {
    sheet.downloadUrl = URL.createObjectURL(clip.blob);
    el.download.href = sheet.downloadUrl;
    el.download.download = `${p.id}-${slug(clip.label)}.${extensionFor(clip.mime)}`;
    el.download.hidden = false;
  }

  closeKeep();
  el.myList.hidden = true;
  renderFolds();
  closePalette();
  renderPickers();
  cut.open();
  renderMode();
  // ✨ Make one: closed for a new sound; open on a made sound being edited.
  sheet.made = clip?.synth ? { kind: 'other', recipe: cleanSynth(clip.synth) } : null;
  el.make.hidden = !sheet.made;
  el.makeBtn.setAttribute('aria-expanded', 'false');
  renderMake();
  setVoicesReady(mode === 'edit');
  renderAmount();
  // The wave shows once there is a sound: straight away for an edit.
  el.waveBox.hidden = true;
  wave.clear();
  // A new sound starts with Record (or Choose a file, where recording isn't
  // possible); an edit starts in the name.
  const first = mode === 'edit' ? el.label : el.recBtn.disabled ? el.fileInput : el.recBtn;
  openDialog(el.sheet, {
    focus: first,
    returnTo: () => (returnToPad ? padFor(returnToPad) : document.querySelector('#pads .pad-add')),
  });
  placeStickyRow();
  sheet.opened = sheetSignature();
  clearInterval(playWatch);
  playWatch = setInterval(syncPlay, 150);
  syncPlay();
  if (mode === 'edit') { previewVoice({ play: false }); primeLive(); }
}

// ── ▶︎/■ at the top ───────────────────────────────────────────────────
// Plays the sound as it sounds now (every layer, unsaved changes too: the
// same render the sheet's preview plays), or stops it. It shows ■ while
// anything of the sheet's plays, and goes back to ▶︎ when the sound ends: a
// light watch reads the player while the sheet is open.
const sheetPlaying = () => audio.playing.has('preview') || audio.playing.has('preview-original');
let playWatch = 0;

function syncPlay() {
  if (sheet.plain === 'playing' && !audio.playing.has('preview-original')) endPlain({ redraw: true });
  el.plainBtn.setAttribute('aria-pressed', String(!!sheet.plain));
  const on = sheetPlaying();
  el.sheetPlay.textContent = on ? '■' : '▶︎';
  el.sheetPlay.setAttribute('aria-pressed', String(on));
  el.sheetPlay.setAttribute('aria-label', on ? 'Stop the sound' : 'Play the sound');
  el.sheetPlay.title = on ? 'Stop (Space)' : 'Play (Space)';
}

function togglePlay() {
  if (el.sheetPlay.disabled) return;
  if (sheetPlaying()) {
    live.on = false;
    audio.stop('preview');
    endPlain({ redraw: true });
  } else previewVoice();
  syncPlay();
}

function closeSheet() {
  if (el.sheet.open) el.sheet.close();
}

// ── Closing with unsaved work (Ben, 2026-10-16) ───────────────────────────
// What Save would store, plus a recording or file not yet saved and a voice
// name being typed, as one string. The sheet's as-opened copy against now says
// whether the ✕, the backdrop or Esc would lose something.
function sheetSignature() {
  const fields = chainFields(sheet.chain);
  const sound = sheet.pending ? [sheet.pending.blob?.size ?? 1, sheet.pending.synth ?? null] : null;
  return JSON.stringify([el.label.value.trim(), sheet.emoji, sheet.color, fields, storedTweaks() ?? null,
    sheet.trim, sheet.edits, sheet.fade, sound, sheet.keep ? el.keepName.value.trim() : '']);
}

// A recording in progress, or anything changed since the sheet opened.
const sheetHasWork = () => el.sheet.open && (isRecording() || sheetSignature() !== sheet.opened);

// ✕, a tap on the backdrop and Esc come here (dialogs.js): false keeps the
// sheet open and asks in a modal over it, Keep editing focused so a stray
// Enter keeps the work. Esc or a tap outside that modal is Keep editing too.
function askBeforeClosing() {
  if (!sheetHasWork()) return true;
  const recording = isRecording();
  const sound = sheet.pending && sheet.mode === 'new';
  el.warnText.textContent = recording ? 'Throw away this recording?' : sound ? 'Throw away this sound?' : 'Throw away your changes?';
  el.warnSub.textContent = recording ? 'It is still recording.' : sound ? 'It is not saved yet.' : 'They are not saved yet.';
  openDialog(el.warn, { focus: el.warnKeep });
  return false;
}

function cleanupSheet() {
  if (el.warn.open) el.warn.close();
  clearInterval(playWatch);
  stopRecording({ discard: true });
  cut.close();
  sheet.plain = false;
  live.on = false;
  audio.stop('preview');
  audio.stop('preview-original');
  wave.clear();
  if (sheet.downloadUrl) URL.revokeObjectURL(sheet.downloadUrl);
  sheet.downloadUrl = null;
  sheet.pending = null;
  sheet.made = null;
  sheet.original = null;
  sheet.previews = new Map();
}

// ── ✨ Make one ───────────────────────────────────────────────────────

const HZ = { min: Math.log2(LIMITS.from.min), max: Math.log2(LIMITS.from.max) };
// Tone's three choices, as its keys show them.
const TONE_NAMES = { smooth: 'Smooth', buzzy: 'Buzzy', hiss: 'Hiss' };
let toneKeys = null;   // copies the Tone slider onto its keys (lines.js)
const knobText = {
  tone: (r) => r.tone,
  from: (r) => `${r.from} Hz`,
  to: (r) => `${r.to} Hz`,
  length: (r) => `${r.length.toFixed(2)} s`,
};

// The starters (which one is lit) and, with Advanced on, its settings: Tone's keys and three sliders.
function renderMake() {
  const kind = sheet.made?.kind;
  for (const b of el.makeStarters.children) b.setAttribute('aria-pressed', String(b.dataset.make === kind));
  const r = sheet.made?.recipe;
  el.makeKnobs.hidden = !advanced() || !r;
  if (!r) return;
  el.makeHint.textContent = advanced() ? 'Change it: tap how it sounds, slide where its pitch starts and ends and how long it lasts.' : 'No microphone needed: pick one.';
  for (const input of el.makeKnobs.querySelectorAll('input')) {
    const k = input.dataset.knob;
    if (k === 'from' || k === 'to') Object.assign(input, { min: HZ.min, max: HZ.max, step: 0.01 });
    input.value = String(k === 'tone' ? TONES.indexOf(r.tone) : k === 'length' ? r.length : Math.log2(r[k]));
    input.closest('.amount').querySelector('output').textContent = knobText[k](r);
  }
  toneKeys?.();
}

// Makes the sound from the recipe, as a recording would be: the sound to
// try voices on, saved as a WAV with its recipe.
function makeSound() {
  const recipe = cleanSynth(sheet.made.recipe);
  sheet.made.recipe = recipe;
  const samples = renderSynth(recipe, RATE);
  const buffer = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: RATE });
  buffer.copyToChannel(samples, 0);
  // Voices start from it as from a recording: its quiet ends off (keptAudio),
  // as the saved sound is after a reload.
  const original = keptAudio(buffer, null);
  sheet.pending = { blob: encodeWav(buffer), mime: 'audio/wav', original, synth: recipe };
  // New audio: an old trim no longer fits it, and trim and chop work on all of it.
  sheet.trim = sheet.edits = sheet.fade = null;
  cut.recorded(buffer);
  sheet.original = Promise.resolve(original);
  sheet.previews = new Map();
  live.on = false;
  el.sheetPlay.disabled = false;
  sheetError('');
  setVoicesReady(true);
  renderAmount();
  renderMake();
  const starter = STARTERS.find((x) => x.id === sheet.made.kind);
  setStatus(`Made ${starter ? `a ${starter.name}` : 'a new sound'}: ${recipe.length.toFixed(1)} seconds. Now try a voice!`);
  // A new sound is offered a name for what was made, unless one was typed.
  if (sheet.mode === 'new') el.label.placeholder = synthName(sheet.made.kind, clipsFor(currentPerson().id, { includeHidden: true }).map((c) => c.label));
  previewVoice();
}

// The amount slider shows only for a voice that has a amount setting (in
// simple mode: Shape it has the sliders in its cards). A setting with a few
// stops (Loud's 1–10) shows them as keys while they fit.
let amountKeys = null;
let fitAmount = null;
function renderAmount() {
  const { voice, amount } = link();
  const range = voiceById(voice).amount;
  el.amountRow.hidden = !range || advanced();
  if (!range) return;
  el.amountName.textContent = range.label;
  Object.assign(el.amount, { min: range.min, max: range.max, step: range.step });
  el.amount.value = amount;
  el.amount.disabled = el.voices.firstElementChild?.disabled ?? false;
  el.amountOut.textContent = amountText(voice, amount);
  amountKeys = keysForSlider(el.amount);
  fitAmount?.();
}

// Renders the sound through its chain of voices, draws its wave, and plays
// it (unless `play` is false: an edit opening just shows the wave).
async function previewVoice({ play = true } = {}) {
  if (!sheet.original) return;
  cut.leave();   // a voice tapped while trimming or chopping: back to the voiced wave
  if (play) {
    live.on = false;   // a new render replaces the live loop
    endPlain();        // and the plain sound
  }
  const name = stepLook(link()).name;
  const job = rendered();   // as it is now; picking another voice changes sheet.chain
  const expected = sheet.original;
  try {
    const rendered = await job;
    const original = await expected;
    if (sheet.original !== expected || !el.sheet.open) return;  // sheet moved on
    if (job !== nowRendered()) return;   // changed again since (a slow voice tapped off): the newer render plays
    if (sheet.plain) return;  // 👂 Plain was tapped since: the wave shows the plain sound
    el.waveBox.hidden = false;
    sheet.voiced = rendered.buffer.duration;
    wave.show(rendered.buffer, original.duration);
    if (!play) return;
    audio.start('preview', rendered);
    wave.follow('preview');
  } catch (err) {
    console.error(`${name} did not render:`, err);
    if (play && sheet.original === expected) sheetError(`${name} didn't work on this sound. Pick something else.`);
  }
}

// The knobs as they are stored: with `first` when they play before a chain,
// and `muted` for the knob layers muted.
const storedTweaks = () => cleanTweaks({ ...sheet.tweaks, muted: [...sheet.muted], first: sheet.knobsFirst && !plainChain() });

// A render of this sheet's sound, kept by `key` (made by `make` the first
// time). Only the last KEEP_PREVIEWS used are kept, so trying setting after
// setting on a long recording does not fill a phone's memory; the one asked
// for now is always kept.
const KEEP_PREVIEWS = 6;
function previewOf(key, make) {
  const job = sheet.previews.get(key) ?? make();
  sheet.previews.delete(key);
  sheet.previews.set(key, job);   // the newest last
  for (const old of sheet.previews.keys()) {
    if (sheet.previews.size <= KEEP_PREVIEWS) break;
    sheet.previews.delete(old);
  }
  return job;
}

// The render of the sound as it is now, if one was started.
const nowRendered = () => sheet.previews.get(recipeKey({ fx: sheet.chain, tweaks: storedTweaks() }));

// The sound through its chain and its knobs as they are now, cached for this sheet.
function rendered() {
  const chain = sheet.chain.map((s) => ({ ...s }));
  const tweaks = storedTweaks();
  const key = recipeKey({ fx: chain, tweaks });
  return previewOf(key, () => sheet.original.then((buffer) => applyChain(buffer, chain, tweaks, sheet.clip?.level)));
}

// ── Layers ────────────────────────────────────────────────────────────
// The knobs (tweaks.js) and, with Advanced, the kid's own steps, as rows
// (shape.js). A change plays the sound with it.

const SPEED_PULL = 0.15;   // Slower ↔ faster snaps to normal this close to it (doublings)
const ARM_MS = 4000;       // how long a ✕ waits for its second tap
let armTimer = 0;

// The rows follow the knobs, the mutes and the chain.
const renderTweaks = () => renderLayerRows();

// A knob moved by hand to `value`: the voices go dark, the words follow.
// Its row stays, even back at normal, until the knobs jump (Q42b).
function setKnob(key, value) {
  sheet.tweaks = fullTweaks({ ...sheet.tweaks, [key]: value });
  if (key !== 'special') sheet.shown.add(key);
  knobMovedByHand();
}

// A knob layer's slider or keys: Backwards is a switch, drawn as Off · On.
const knobValue = (key, input) => (tweakByKey(key)?.flag ? Number(input.value) === 1 : Number(input.value));

// ✕ on a layer: the first tap asks ("Remove?"), the second takes it out. A
// knob goes back to normal and its row goes; the ✦ special part goes; a step
// leaves the chain.
function removeLayer(row) {
  clearTimeout(armTimer);
  if (sheet.armed !== row) {
    sheet.armed = row;
    armTimer = setTimeout(() => { sheet.armed = null; if (el.sheet.open) renderLayerRows(); }, ARM_MS);
    renderLayerRows();
    return;
  }
  sheet.armed = null;
  if (row.startsWith('step:')) { removeStep(Number(row.slice(5))); return; }
  sheet.muted.delete(row);
  sheet.shown.delete(row);
  sheet.tweaks = fullTweaks({ ...sheet.tweaks, [row]: NO_TWEAKS[row] });
  knobMovedByHand();
  previewVoice();
}

// 🔈 on a layer: muted, it stays with its setting but doesn't play.
function muteLayer(row) {
  if (row.startsWith('step:')) {
    const step = sheet.chain[Number(row.slice(5))];
    if (!step) return;
    if (step.off) delete step.off; else step.off = true;
    chainChanged();
    return;
  }
  if (sheet.muted.has(row)) sheet.muted.delete(row); else sheet.muted.add(row);
  renderLayerRows();
  previewVoice();
}

// A knob from + Add a layer: its row, at a setting that changes the sound.
function addKnob(key) {
  closePalette();
  sheet.muted.delete(key);
  setKnob(key, ADDED_AT[key]);
  moveKnobs({ ...sheet.tweaks, [key]: NO_TWEAKS[key] }, [key]);
  previewVoice();
}

function closePalette() {
  el.layerPalette.hidden = true;
  el.layerAdd.setAttribute('aria-expanded', 'false');
}

// The live loop's head for the chain and knobs as they are now (voices.js
// livePlan): the steps before the live ones, rendered once and kept in
// sheet.previews. With nothing before the live steps it is the sound in
// Normal: evened out and turned down by a preset's level, as the saved
// render is. Null when nothing would play live. Started when the sheet opens
// and when the chain changes, so a first drag waits for nothing.
function liveHead() {
  const split = livePlan(sheet.chain.map((s) => ({ ...s })), storedTweaks());
  if (!sheet.original || !split?.tail.length) return null;
  const { head: steps, headTweaks: knobs } = split;
  const key = `head:${recipeKey({ fx: steps, tweaks: knobs })}`;
  return { split, head: previewOf(key, () => sheet.original.then((b) => applyChain(b, steps, knobs, sheet.clip?.level))) };
}
const primeLive = () => liveHead()?.head.catch(() => {});

// Starts the live loop for the chain as it is now, with its knobs (the knob
// layers, voices.js livePlan): the steps before the live ones rendered once,
// then the live ones as nodes, repeating with room for their echoes to ring.
// Resolves true once it plays.
function startLive() {
  if (live.on) return Promise.resolve(true);
  if (live.starting) return live.starting;
  endPlain();
  live.starting = (async () => {
    const plan = liveHead();
    if (!plan) return false;
    const { split } = plan;
    const expected = sheet.original;
    const head = await plan.head;
    if (sheet.original !== expected || !el.sheet.open || sheet.plain) return false;
    const loop = padTo(head.buffer, head.duration + Math.min(6, tailOf(split.tail)), head.duration);
    audio.start('preview', { buffer: loop, duration: loop.duration }, {
      loop: true,
      via: (ctx, src) => {
        live.nodes = buildLive(ctx, src, split.tail);
        if (split.gain === 1) return live.nodes.output;
        // Quiet and Quietest, on knobs that play after the steps.
        const quiet = ctx.createGain();
        quiet.gain.value = split.gain;
        live.nodes.output.connect(quiet);
        return quiet;
      },
    });
    wave.follow('preview');
    Object.assign(live, { on: true, split });
    return true;
  })().finally(() => { live.starting = null; });
  return live.starting;
}

// A slider on step i moved: a live step in the loop changes at once.
function moveLive(i) {
  if (!live.on || !live.split || i < live.split.tailIndex) return;
  live.nodes?.set(i - live.split.tailIndex, sheet.chain[i]);
}

// Let go of a live slider: the loop finishes its pass, and the wave catches up.
function endLive() {
  if (!live.on) return;
  live.on = false;
  audio.unloop('preview');
  previewVoice({ play: false });
}

// Is step i played live by the loop that would start now?
const liveAt = (i) => {
  const plan = livePlan(sheet.chain, storedTweaks());
  return !!plan && isLive(sheet.chain[i]) && i >= plan.tailIndex;
};

// Shape it changed the chain's order or members: the cards redraw and the
// whole sound plays again.
// The tempo of the beat open on Beats, for Echo's 🥁 On the beat (app.js
// sets it once the beat maker exists); undefined when no beat is open.
let beatTempo = () => undefined;
export function setBeatTempo(fn) { beatTempo = fn; }

function chainChanged() {
  live.on = false;
  showLink();
  previewVoice();
  primeLive();
}

// Adds a step at the end of the kid's own steps (it plays last of them;
// drag it to move it).
function addStep(id) {
  if (sheet.chain.length >= MAX_CHAIN || !kindById(id)) return;
  // A plain sound is a chain of one Normal: the first step takes its place.
  if (plainChain()) sheet.chain = [];
  sheet.chain.push(newStep(id));
  sheet.link = sheet.chain.length - 1;
  closePalette();
  chainChanged();
}

// Takes step `i` out of the chain, and the rest plays.
function removeStep(i) {
  sheet.chain.splice(i, 1);
  if (!sheet.chain.length) sheet.chain.push(editable({ voice: 'normal' }));   // never empty: plain is a chain of one
  if (i < sheet.link || sheet.link >= sheet.chain.length) sheet.link = Math.max(0, sheet.link - 1);
  sheet.undo = null;
  chainChanged();
}

// Moves step `from` to `to` (a step row's grip): the selection goes with it.
function moveStep(from, to) {
  if (to < 0 || to >= sheet.chain.length || from === to) return;
  const picked = sheet.chain[sheet.link];
  sheet.chain.splice(to, 0, ...sheet.chain.splice(from, 1));
  sheet.link = sheet.chain.indexOf(picked);
  chainChanged();
  el.layerRows.querySelector(`[data-grip="${to}"]`)?.focus();
}

// 👂 Plain. A tap plays the sound with no voice, and the wave shows it; ▶︎
// then plays the voice. Hearing the two one after the other is how a change
// is judged. A second tap, ▶︎ or any change stops it.
async function playPlain() {
  if (!sheet.original || el.plainBtn.disabled) return;
  if (sheet.plain) { endPlain({ redraw: true }); syncPlay(); return; }
  cut.leave();
  live.on = false;
  audio.stop('preview');
  sheet.plain = 'waiting';
  syncPlay();
  const expected = sheet.original;
  let original;
  try { original = (await plainSound()).buffer; } catch { sheet.plain = false; syncPlay(); return; }
  if (sheet.plain !== 'waiting' || sheet.original !== expected || !el.sheet.open) return;
  wave.show(original, Math.max(sheet.voiced, original.duration));
  audio.start('preview-original', { buffer: original, duration: original.duration });
  wave.follow('preview-original');
  sheet.plain = 'playing';
}

// The sound with no voice, as loud as its pad plays it: levelled to peak 0.9
// and turned down by a preset's level (applyChain in Normal), so 👂 Plain
// against ▶︎ compares the voice, not the volume. Its trim, edits and fade stay.
function plainSound() {
  return previewOf('plain', () => sheet.original.then((b) => applyChain(b, [], null, sheet.clip?.level)));
}

// Stops the plain sound. `redraw` puts the voiced wave back, without playing it.
function endPlain({ redraw = false } = {}) {
  if (!sheet.plain) return;
  sheet.plain = false;
  audio.stop('preview-original');
  if (redraw) previewVoice({ play: false });
}

async function startRecording() {
  sheetError('');
  audio.stop('preview');
  endPlain();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    sheetError(err.name === 'NotAllowedError'
      ? 'The microphone is blocked. Allow it in this site’s browser settings, then tap Record again.'
      : `The microphone didn't start (${err.name}). Check that one is connected, then tap Record again.`);
    return;
  }
  if (!el.sheet.open) {  // closed while the permission prompt was up
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg']
    .find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    sheetError(`This browser can't record audio (${err.name}). Choose a sound file instead.`);
    return;
  }
  recording.stream = stream;
  recording.recorder = recorder;
  recording.chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) recording.chunks.push(e.data); };
  recorder.onstop = () => {
    if (recording.discard) return;
    const type = recorder.mimeType || mime || 'audio/webm';
    acceptAudio(new Blob(recording.chunks, { type }), 'recording');
    track('content.finish', { kind: 'sound-record' });
  };
  recording.discard = false;
  el.recBtn.setAttribute('aria-pressed', 'true');
  el.sheetPlay.disabled = true;
  el.fileChip.hidden = true;
  setVoicesReady(false);

  // 3, 2, 1 on the button, then it listens. Tapping it again calls it off.
  let n = COUNT_IN.from;
  const tick = () => {
    if (recording.recorder !== recorder) return;
    if (n === 0) { recording.counting = 0; listen(recorder); return; }
    el.recLabel.textContent = String(n);
    setStatus(`Get ready… ${n}`);
    n -= 1;
    recording.counting = setTimeout(tick, COUNT_IN.ms);
  };
  tick();
}

// The count-in is over: record, and draw the grille from the microphone.
function listen(recorder) {
  recorder.start();
  const ctx = audio.wake();
  recording.source = ctx.createMediaStreamSource(recording.stream);
  recording.analyser = ctx.createAnalyser();
  recording.analyser.fftSize = 512;
  recording.source.connect(recording.analyser);
  recording.started = performance.now();
  recording.loudUntil = 0;
  recording.timer = setTimeout(() => stopRecording(), MAX_RECORD_SECONDS * 1000);
  el.recLabel.textContent = 'Stop';

  let level = 0;
  const step = () => {
    level = Math.max(levelOf(recording.analyser, recording.scratch), level * 0.85);
    // levelOf left this frame's samples in scratch: did any hit the top?
    let peak = 0;
    for (const v of recording.scratch) peak = Math.max(peak, Math.abs(v));
    const now = performance.now();
    if (peak >= TOO_LOUD) recording.loudUntil = now + LOUD_SHOW_MS;
    const loud = now < recording.loudUntil;
    el.recGrille.classList.toggle('too-loud', loud);
    drawGrille(el.recGrille, level);
    const secs = (now - recording.started) / 1000;
    setStatus(loud ? 'Too loud! Move back a little.' : `Recording… ${secs.toFixed(1)} s of ${MAX_RECORD_SECONDS}`);
    recording.raf = requestAnimationFrame(step);
  };
  recording.raf = requestAnimationFrame(step);
}

function stopRecording({ discard = false } = {}) {
  const r = recording;
  if (!r.recorder) return;
  // Stopped during the count-in: nothing was recorded, so nothing is kept.
  const counting = !!r.counting;
  r.discard = discard || counting;
  clearTimeout(r.counting);
  r.counting = 0;
  clearTimeout(r.timer);
  cancelAnimationFrame(r.raf);
  if (r.recorder.state !== 'inactive') r.recorder.stop();
  r.stream.getTracks().forEach((t) => t.stop());
  r.source?.disconnect();
  r.recorder = null;
  r.stream = null;
  el.recBtn.setAttribute('aria-pressed', 'false');
  el.recLabel.textContent = 'Record';
  el.fileChip.hidden = false;
  el.recGrille.classList.remove('too-loud');
  drawGrille(el.recGrille, 0);
  if (counting && !discard) {
    setStatus('Tap Record, say something, then tap Stop.');
    setVoicesReady(!!sheet.pending);
    el.sheetPlay.disabled = !sheet.pending;
  } else if (!discard) setStatus('Saving the recording…');
}

async function acceptAudio(blob, origin) {
  try {
    const buffer = await audio.decode(await blob.arrayBuffer());
    if (buffer.duration > MAX_CLIP_SECONDS) {
      setStatus('Nothing to play yet.');
      sheetError(`That sound is ${Math.round(buffer.duration)} seconds long. Choose one under ${MAX_CLIP_SECONDS} seconds.`);
      return;
    }
    const bounds = trimBounds(buffer);
    if (bounds.silent) {
      setStatus('Nothing to play yet.');
      sheetError(origin === 'file'
        ? 'That file is silent. Choose a different one.'
        : 'That recording is silent. Check the microphone, then tap Record again.');
      return;
    }
    const original = keptAudio(buffer, null);   // as audio.js keeps it, so a reload plays the same
    sheet.pending = { blob, mime: blob.type, original };
    sheet.trim = sheet.edits = sheet.fade = null;
    cut.recorded(buffer);
    sheet.made = null;
    renderMake();
    sheet.original = Promise.resolve(original);
    sheet.previews = new Map();
    el.sheetPlay.disabled = false;
    setVoicesReady(true);
    renderAmount();
    sheetError('');
    // A tip on how the microphone heard it, for recordings only.
    const { peak, rms } = levelsOf(buffer);
    const verdict = origin === 'recording' ? levelVerdict(peak, rms) : 'ok';
    setStatus(verdict === 'quiet'
      ? `Got it: ${bounds.duration.toFixed(1)} seconds, but very quiet. Move closer next time.`
      : verdict === 'loud'
        ? `Got it: ${bounds.duration.toFixed(1)} seconds, but so loud it crackled. Move back next time.`
        : `Got it: ${bounds.duration.toFixed(1)} seconds. Now try a voice!`);
    previewVoice();
    if (!el.label.value) el.label.focus({ preventScroll: true });
  } catch (err) {
    console.error('Audio did not decode:', err);
    setStatus('Nothing to play yet.');
    sheetError(origin === 'file'
      ? "This browser can't play that file. Choose an MP3, M4A or WAV."
      : "That recording didn't save. Tap Record to try again.");
  }
}

// Save and ➕ Make it a new sound, one at a time: a second tap while the
// first is still being written makes nothing twice.
let saving = false;
const oneSave = (fn) => async () => {
  if (saving) return;
  saving = true;
  try { await fn(); } finally { saving = false; }
};

async function saveSheet() {
  const p = currentPerson();
  const label = el.label.value.trim();
  let saved;  // the clip as it plays now, to warm and to prune the voice cache
  // One voice is stored as `voice` and `amount`; a chain adds `fx`.
  const fields = chainFields(sheet.chain);
  if (!fields.fx) delete fields.fx;
  if (fields.amount === undefined) delete fields.amount;
  const tweaks = storedTweaks();
  if (tweaks) fields.tweaks = tweaks;
  if (sheet.trim) fields.trim = sheet.trim;
  if (sheet.edits) fields.edits = sheet.edits;
  if (sheet.fade) fields.fade = sheet.fade;
  const root = rootNow();   // the note, if it was found for this chain
  if (root !== undefined) fields.root = root;

  if (sheet.mode === 'new') {
    if (!sheet.pending) {
      sheetError('Record a sound, choose a file, or make one first.');
      return;
    }
    const clip = {
      id: newId('user'),
      personId: p.id,
      label: label || el.label.placeholder || soundName(clipsFor(p.id, { includeHidden: true }).map((c) => c.label)),
      emoji: sheet.emoji,
      color: sheet.color,
      ...fields,
      blob: sheet.pending.blob,
      mime: sheet.pending.mime,
      ...(sheet.pending.synth ? { synth: sheet.pending.synth } : {}),
      created: Date.now(),
    };
    state.userClips.push(clip);
    if (!(await persist('clips', clip))) { state.userClips = state.userClips.filter((c) => c !== clip); return keptOpen(); }
    saved = { ...clip, source: 'user' };
  } else if (sheet.clip.source === 'user') {
    const clip = state.userClips.find((c) => c.id === sheet.clip.id);
    const was = { ...clip };
    delete clip.fx;
    delete clip.tweaks;
    delete clip.trim;
    delete clip.edits;
    delete clip.fade;
    delete clip.root;
    Object.assign(clip, { label: label || clip.label, emoji: sheet.emoji, color: sheet.color, amount: undefined, ...fields });
    // A made sound whose sliders moved: its new audio and recipe replace the
    // old (keepOriginal, below, keeps the sheet's audio of it).
    if (sheet.pending?.synth) {
      Object.assign(clip, { blob: sheet.pending.blob, mime: sheet.pending.mime, synth: sheet.pending.synth });
      audio.forget(clip.id);
    }
    if (!(await persist('clips', clip))) {
      for (const k of Object.keys(clip)) delete clip[k];
      Object.assign(clip, was);
      if (sheet.pending?.synth) audio.forget(clip.id);   // the old audio plays again
      return keptOpen();
    }
    saved = { ...clip, source: 'user' };
  } else {
    const base = currentPerson().clips.find((c) => c.id === sheet.clip.id);
    const was = state.overrides.get(base.id);
    if (!(await setOverride(overrideFor(base, was, { label, emoji: sheet.emoji, color: sheet.color, ...fields }, state.manifest.palette)))) {
      if (was) state.overrides.set(base.id, was); else state.overrides.delete(base.id);
      return keptOpen();
    }
    saved = { ...base, ...state.overrides.get(base.id), personId: p.id, source: 'bundled' };
  }
  // The sheet already has the sound as trimmed; voices tried before are no
  // longer wanted in memory; warm the one now chosen.
  audio.keepOriginal(saved, sheet.original);
  audio.dropRendered(saved.id, audio.key(saved));
  audio.load(saved).catch(() => {});
  closeSheet();
  renderPads();
}

// Storage refused the save (a full disk): nothing changed in memory either,
// and the sheet stays open with the work in it, to save again.
function keptOpen() {
  sheetError('That didn’t save. Your changes are still here: tap Save to try again.');
}

async function removeFromSheet() {
  const clip = sheet.clip;
  if (clip.source === 'user') {
    if (!el.removeBtn.classList.contains('armed')) {
      el.removeBtn.classList.add('armed');
      el.removeBtn.textContent = 'Tap again to delete';
      return;
    }
    audio.forget(clip.id);
    await deleteUserClip(clip);
  } else {
    await setOverride(withHidden(state.overrides.get(clip.id), clip.id, !clip.hidden));
  }
  closeSheet();
  renderPads();
}

export function initSheet() {
  const $ = (sel) => document.querySelector(sel);
  Object.assign(el, {
    sheet: $('#sheet'),
    form: $('#sheet-form'),
    sheetTitle: $('#sheet-title'),
    capture: $('#capture'),
    recBtn: $('#rec-btn'),
    recLabel: $('#rec-label'),
    recGrille: $('#rec-grille'),
    recStatus: $('#rec-status'),
    sheetPlay: $('#sheet-play'),
    fileChip: $('#file-chip'),
    fileInput: $('#file-input'),
    voiceHint: $('#voice-hint'),
    voices: $('#voices'),
    amountRow: $('#amount-row'),
    amountName: $('#amount-name'),
    amount: $('#amount'),
    amountOut: $('#amount-out'),
    label: $('#clip-label'),
    emojiGrid: $('#emoji-grid'),
    swatches: $('#swatches'),
    sheetError: $('#sheet-error'),
    removeBtn: $('#remove-btn'),
    download: $('#download-link'),
    waveBox: $('#wave-box'),
    plainBtn: $('#plain-btn'),
    chain: $('#chain'),
    chainLinks: $('#chain-links'),
    chainKnobs: $('#chain-knobs'),
    chainUndo: $('#chain-undo'),
    chainHint: $('#chain-hint'),
    myList: $('#my-voice-list'),
    voiceLine: $('#voice-line'),
    keepBtn: $('#keep-btn'),
    normalBtn: $('#normal-btn'),
    keepForm: $('#keep-form'),
    keepTitle: $('#keep-title'),
    keepName: $('#keep-name'),
    warn: $('#sheet-warn'),
    warnText: $('#sheet-warn-text'),
    warnSub: $('#sheet-warn-sub'),
    warnKeep: $('#sheet-warn-keep'),
    warnDrop: $('#sheet-warn-drop'),
    keepEmoji: $('#keep-emoji'),
    keepSave: $('#keep-save'),
    keepSaveLabel: $('#keep-save-label'),
    keepCancel: $('#keep-cancel'),
    layerRows: $('#layer-rows'),
    layerAdd: $('#layer-add'),
    layerPalette: $('#layer-palette'),
    layerExtra: $('#layer-extra'),
    shapeSurprise: $('#shape-surprise'),
    sheetAdvanced: $('#sheet-advanced'),
    makeBtn: $('#make-btn'),
    make: $('#make'),
    makeHint: $('#make-hint'),
    makeStarters: $('#make-starters'),
    makeKnobs: $('#make-knobs'),
    noteBtn: $('#note-btn'),
    noteOut: $('#note-out'),
    tuneRow: $('#tune-row'),
    tune: $('#tune'),
    tuneOut: $('#tune-out'),
    mixBtn: $('#mix-btn'),
    mix: $('#mix'),
    mixWith: $('#mix-with'),
    mixOffset: $('#mix-offset'),
    mixOffsetOut: $('#mix-offset-out'),
    mixBalance: $('#mix-balance'),
    mixBalanceOut: $('#mix-balance-out'),
    mixPlay: $('#mix-play'),
    mixMake: $('#mix-make'),
  });
  renderStarters();
  // The switch can change while the sheet is open (Settings is behind it, but a backup can load).
  onSetting('advancedBeats', () => { if (el.sheet.open) { renderMode(); showLink(); renderMake(); } });
  wave = createWave($('#wave'));
  cut = createCut({
    wave,
    now: () => ({
      mode: sheet.mode, clip: sheet.clip, ready: sheet.ready, emoji: sheet.emoji,
      trim: sheet.trim, edits: sheet.edits, fade: sheet.fade,
      name: el.label.value.trim() || el.label.placeholder || sheet.clip?.label || '',
    }),
    setCut({ trim, edits, fade }, buffer) {
      Object.assign(sheet, { trim, edits, fade });
      sheet.original = Promise.resolve(buffer);
      sheet.previews = new Map();
      live.on = false;
      if (advanced()) renderNote();   // a note found before the trim is now stale
    },
    voiced: rendered,
    showVoiced: (play) => previewVoice({ play }),
  });
  window.addEventListener('resize', () => { if (el.sheet.open) { wave.redraw(); placeStickyRow(); } });
  meter.sheetGrille = el.recGrille;
  meter.sheetOpen = isSheetOpen;
  meter.recording = isRecording;

  setupDialog(el.sheet, { beforeClose: askBeforeClosing });
  el.sheet.addEventListener('close', cleanupSheet);
  setupDialog(el.warn);
  el.warnDrop.addEventListener('click', () => { el.warn.close(); closeSheet(); });
  // Closing or reloading the tab with the sheet holding work asks the browser's own question.
  window.addEventListener('beforeunload', (e) => { if (sheetHasWork()) { e.preventDefault(); e.returnValue = ''; } });
  el.recBtn.addEventListener('click', () => {
    if (recording.recorder) stopRecording();
    else startRecording();
  });
  el.sheetPlay.addEventListener('click', togglePlay);
  // Space plays or stops the sound, unless it is typing, or pressing a
  // button or switch that Space already presses.
  el.sheet.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || e.repeat || e.defaultPrevented) return;
    const t = e.target;
    const tag = String(t.tagName ?? '').toUpperCase();
    if (['TEXTAREA', 'SELECT', 'BUTTON'].includes(tag) || t.isContentEditable || (tag === 'INPUT' && t.type !== 'range') || t.closest?.('button')) return;
    e.preventDefault();
    togglePlay();
  });
  el.plainBtn.addEventListener('click', playPlain);
  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      sheetError(`That file is ${(file.size / 1048576).toFixed(1)} MB. Choose one under ${MAX_FILE_BYTES / 1048576} MB.`);
      return;
    }
    setStatus(`Opening ${file.name}…`);
    if (!el.label.value) el.label.value = file.name.replace(/\.[^.]+$/, '').slice(0, 24);
    acceptAudio(file, 'file');
  });
  // Picking a voice moves the knobs and plays the sound in it right away.
  wireVoices();
  wireFolds();
  fitAmount = fitLine(el.amountRow, KEYED_STEPS);
  // The label follows the slider; the sound plays once it is let go.
  el.amount.addEventListener('input', () => {
    const now = link();
    now.amount = amountFor(now.voice, el.amount.value);
    el.amountOut.textContent = amountText(now.voice, now.amount);
  });
  el.amount.addEventListener('change', () => previewVoice());
  el.chain.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.link) {                     // edit that voice
      sheet.link = Number(b.dataset.link);
      showLink();
    } else if (b.dataset.remove) {            // take it out, and hear the rest
      const i = Number(b.dataset.remove);
      sheet.chain.splice(i, 1);
      if (!sheet.chain.length) sheet.chain.push(editable({ voice: 'normal' }));   // never empty: plain is a chain of one
      if (i < sheet.link || sheet.link >= sheet.chain.length) sheet.link = Math.max(0, sheet.link - 1);
      sheet.undo = null;
      showLink();
      previewVoice();
    }
  });
  wireLayers();
  wireMake();
  el.noteBtn.addEventListener('click', findItsNote);
  el.mixBtn.addEventListener('click', () => {
    const open = el.mix.hidden;
    el.mix.hidden = !open;
    el.mixBtn.setAttribute('aria-expanded', String(open));
    if (open) openMix();
  });
  el.mixWith.addEventListener('change', () => { sheet.mix.with = el.mixWith.value; renderMix(); hearMix(); });
  for (const [input, key] of [[el.mixOffset, 'offset'], [el.mixBalance, 'balance']]) {
    input.addEventListener('input', () => { sheet.mix = { ...sheet.mix, ...cleanMix({ ...sheet.mix, [key]: Number(input.value) }) }; renderMix(); });
    input.addEventListener('change', hearMix);
  }
  el.mixPlay.addEventListener('click', hearMix);
  el.mixMake.addEventListener('click', oneSave(makeMix));
  el.tune.addEventListener('input', () => { setTune(Math.round(Number(el.tune.value))); showLink(); });
  el.tune.addEventListener('change', () => previewVoice());
  el.emojiGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]');
    if (!b) return;
    sheet.emoji = b.dataset.emoji;
    for (const x of el.emojiGrid.querySelectorAll('[data-emoji]')) x.setAttribute('aria-pressed', String(x === b));
  });
  // "…": every emoji. A pick from it is the sound's picture, and shows
  // pressed at the end of the short list once the full list closes.
  emojiAll = emojiMore({
    grid: el.emojiGrid,
    stateOf: (e) => ({ pressed: e === sheet.emoji }),
    onPick: (e) => { sheet.emoji = e; renderEmojiGrid(); emojiAll.refresh(); },
  });
  el.swatches.addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    sheet.color = b.dataset.color;
    for (const x of el.swatches.children) x.setAttribute('aria-pressed', String(x === b));
  });
  el.removeBtn.addEventListener('click', removeFromSheet);
  const save = oneSave(saveSheet);
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
}

// Layers' taps, sliders and drags: knob rows move the knobs (the voices go
// dark); step rows move their step, live where it can play live; 🔈, ✕, ⤢,
// a step's switches and its grip; + Add a layer; the Advanced switch.
function wireLayers() {
  const rows = el.layerRows;
  rows.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    // Any other tap puts a waiting "Remove?" back.
    if (sheet.armed && b.dataset.removeLayer !== sheet.armed) { sheet.armed = null; clearTimeout(armTimer); renderLayerRows(); }
    if (b.dataset.mute) muteLayer(b.dataset.mute);
    else if (b.dataset.removeLayer) removeLayer(b.dataset.removeLayer);
    else if (b.dataset.open) {             // ⤢: the voice becomes its steps
      const i = Number(b.dataset.open);
      const steps = openVoice(sheet.chain[i]);
      if (!steps) return;
      sheet.chain.splice(i, 1, ...steps);
      sheet.link = i;
      chainChanged();
    } else if (b.dataset.flag) {
      const i = Number(b.dataset.i);
      const step = sheet.chain[i];
      step[b.dataset.flag] = !step[b.dataset.flag];
      // 🥁 On the beat takes the open beat's tempo (or keeps the one it had).
      if (b.dataset.flag === 'beat' && step.beat) step.bpm = beatTempo() ?? step.bpm;
      Object.assign(step, cleanStep(kindById(step.type), step));
      chainChanged();
    }
  });
  // A step's slider: its words follow it; a live step changes the loop as it
  // moves, and anything else renders when it is let go.
  const sliderStep = (input) => {
    const i = Number(input.dataset.i);
    const step = sheet.chain[i];
    const n = numsOf(step).find((x) => x.key === input.dataset.key);
    return { i, step, n };
  };
  rows.addEventListener('pointerdown', (e) => {
    const input = e.target.closest('input[data-key]');
    if (input && !input.disabled && liveAt(Number(input.dataset.i))) startLive();
  });
  rows.addEventListener('input', (e) => {
    const knob = e.target.closest('input[data-layer-knob]');
    if (knob) {
      const k = knob.dataset.layerKnob;
      let v = knobValue(k, knob);
      if (k === 'speed' && Math.abs(v) < SPEED_PULL) { v = 0; knob.value = '0'; }
      sheet.tweaks = fullTweaks({ ...sheet.tweaks, [k]: v });
      if (!tweakByKey(k).flag) knob.parentElement.querySelector('output').textContent = tweakText(k, sheet.tweaks[k]);
      knob.closest('.layer-row')?.classList.toggle('changed', knobMoved(k, sheet.tweaks));
      return;
    }
    const input = e.target.closest('input[data-key]');
    if (!input) return;
    const { i, step, n } = sliderStep(input);
    if (!n) return;
    const value = fromSlider(n, input.value);
    const clean = step.type === 'voice' ? { ...step, amount: amountFor(step.voice, value) } : cleanStep(kindById(step.type), { ...step, [n.key]: value });
    Object.assign(step, clean);
    const out = input.closest('.amount')?.querySelector('output');
    if (out) out.textContent = sliderText(step, n.key);
    // A key is a tap, not a drag: the change that follows it renders the sound.
    if (showingKeys(input.closest('.amount'))) return;
    if (liveAt(i)) { if (live.on) moveLive(i); else startLive().then((ok) => ok && moveLive(i)); }
  });
  rows.addEventListener('change', (e) => {
    const knob = e.target.closest('input[data-layer-knob]');
    if (knob) {
      setKnob(knob.dataset.layerKnob, sheet.tweaks[knob.dataset.layerKnob]);
      previewVoice();
      return;
    }
    const input = e.target.closest('input[data-key]');
    if (!input) return;
    const i = Number(input.dataset.i);
    if (live.on && liveAt(i)) endLive();
    else previewVoice();
  });
  // A step's grip: arrow keys move it up or down; dragging moves it to where
  // it is dropped, among the steps (the knobs keep their places).
  rows.addEventListener('keydown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const i = Number(grip.dataset.grip);
    moveStep(i, i + (e.key === 'ArrowUp' ? -1 : 1));
  });
  const stepRows = () => [...rows.children].filter((c) => c.classList.contains('layer-step'));
  let drag = null;
  rows.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || grip.disabled || e.button !== 0) return;
    e.preventDefault();
    try { grip.setPointerCapture?.(e.pointerId); } catch { /* gone */ }
    drag = { from: Number(grip.dataset.grip), card: grip.closest('.layer-row') };
    drag.card.classList.add('dragging');
  });
  rows.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const cards = stepRows();
    const to = cards.findIndex((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    drag.to = to < 0 ? cards.length - 1 : to > drag.from ? to - 1 : to;
    for (const c of cards) c.classList.toggle('drop-here', cards.indexOf(c) === drag.to && drag.to !== drag.from);
  });
  const drop = () => {
    if (!drag) return;
    const { from, to } = drag;
    for (const c of rows.children) c.classList.remove('dragging', 'drop-here');
    drag = null;
    if (to !== undefined) moveStep(from, to);
  };
  rows.addEventListener('pointerup', drop);
  rows.addEventListener('pointercancel', () => { drag && (drag.to = undefined); drop(); });

  el.layerAdd.addEventListener('click', () => {
    if (el.layerAdd.disabled) return;
    const open = el.layerPalette.hidden;
    el.layerPalette.hidden = !open;
    el.layerAdd.setAttribute('aria-expanded', String(open));
    if (open) el.layerPalette.querySelector('button:not(:disabled)')?.focus();
  });
  el.layerPalette.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.addKnob) addKnob(b.dataset.addKnob);
    else if (b.dataset.add) addStep(b.dataset.add);
  });
  el.shapeSurprise.addEventListener('click', () => {
    if (el.shapeSurprise.disabled) return;
    sheet.chain = surpriseShape().map(editable);
    sheet.link = sheet.chain.length - 1;
    chainChanged();
  });
  // ⚙️ Advanced at the bottom of Layers: the same per-person setting as in Settings.
  el.sheetAdvanced.addEventListener('change', () => { setSetting('advancedBeats', el.sheetAdvanced.checked); });
}

function renderStarters() {
  const b = (id, emoji, name) => {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chip make-starter';
    x.dataset.make = id;
    x.setAttribute('aria-pressed', 'false');
    const e = document.createElement('span');
    e.setAttribute('aria-hidden', 'true');
    e.textContent = emoji;
    x.append(e, name);
    return x;
  };
  el.makeStarters.replaceChildren(...STARTERS.map((st) => b(st.id, st.emoji, st.name)), b('surprise', '🎲', 'Surprise'));
}

// ✨ Make one: the button opens the starters; a starter makes its sound; the
// sliders (Advanced) remake it when let go.
function wireMake() {
  const tone = el.makeKnobs.querySelector('[data-knob="tone"]');
  toneKeys = keysForSlider(tone, (i) => TONE_NAMES[TONES[i]] ?? TONES[i]);
  fitLine(tone.parentElement, KEYED_STEPS);
  el.makeBtn.addEventListener('click', () => {
    const open = el.make.hidden;
    el.make.hidden = !open;
    el.makeBtn.setAttribute('aria-expanded', String(open));
    if (open) el.makeStarters.firstElementChild?.focus();
  });
  el.makeStarters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-make]');
    if (!b || isRecording()) return;
    const starter = STARTERS.find((x) => x.id === b.dataset.make);
    sheet.made = starter ? { kind: starter.id, recipe: { ...starter.recipe } } : { kind: 'surprise', recipe: surpriseSynth() };
    makeSound();
  });
  el.makeKnobs.addEventListener('input', (e) => {
    const input = e.target.closest('[data-knob]');
    if (!input || !sheet.made) return;
    const k = input.dataset.knob;
    const r = sheet.made.recipe;
    r[k] = k === 'tone' ? TONES[Number(input.value)] : k === 'length' ? Number(input.value) : Math.round(2 ** Number(input.value));
    input.closest('.amount').querySelector('output').textContent = knobText[k](cleanSynth(r));
  });
  el.makeKnobs.addEventListener('change', (e) => {
    if (e.target.closest('[data-knob]') && sheet.made) makeSound();
  });
}
