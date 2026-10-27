// The sound sheet's voices (voice-knobs.js): the voice chips and ⭐ My voices,
// tapping one to move the knobs (tweaks.js), ⤢ Turn into knobs and ↩️ The old
// way, ⭐ Save voice, the folds, and the chain and its Layers rows (shape.js
// draws them). sheet.js opens the sheet and plays and saves it; this part keeps
// the voice side, on the shared state in sheet-state.js.

import { state, saveMyVoice, deleteMyVoice } from './state.js';
import { currentPerson } from './board.js';
import { amountFor, openVoice, stepLook, MAX_CHAIN } from './voices.js';
import { renderLayers, renderLayerPalette } from './shape.js';
import { newId } from './util.js';
import { funName } from './names.js';
import { NO_TWEAKS, MORE_KNOBS, fullTweaks, tweakText, allNormal, layerRows, addableKnobs } from './tweaks.js';
import { PRESETS, presetById, stackAll, matches, voiceLine, presetText, chainToKnobs, hasClassicVoice, surpriseVoices, cleanMyVoice, myVoicesFor, MY_VOICE_CHIPS } from './voice-knobs.js';
import { withCurrent } from './emoji-more.js';
import { el, sheet, live, advanced, plainChain, later } from './sheet-state.js';

const previewVoice = later('previewVoice');
const renderAmount = later('renderAmount');
const renderNote = later('renderNote');

// The chips: every voice but Normal, emoji only (the name is its label and
// its title), then the person's three latest own voices, ⭐ Voices ▾ for
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

export function renderVoiceChips() {
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
    words.textContent = 'Voices ▾';
    list.append(words);
    list.setAttribute('aria-label', 'Voices');
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

// ⭐ Voices ▾: every one of the person's own voices, to use, rename or delete.
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
export function renderVoices() {
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
  renderLayerRows();
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
export function litFromKnobs() {
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
export function knobMovedByHand() {
  sheet.lit = [];
  sheet.undo = null;
  renderVoices();
}

// The knobs a voice moved slide from where they were (about 300 ms) and glow
// for a second, so a kid sees which knobs make the voice. Reduced motion:
// the glow only. The knobs already hold their new values; the slide is drawn
// from the next frame on.
export function moveKnobs(from, keys) {
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
    else renderLayerRows();
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

export function closeKeep() {
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

export function wireVoices() {
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

export function renderFolds() {
  for (const b of el.sheet.querySelectorAll('[data-fold]')) {
    const open = folds[b.dataset.fold] !== false;
    b.setAttribute('aria-expanded', String(open));
    b.querySelector('.set-head-caret').textContent = open ? '▾' : '▸';
    const body = el.sheet.querySelector(`#${b.dataset.fold}-body`);
    if (body) body.hidden = !open;
  }
}

export function wireFolds() {
  el.sheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fold]');
    if (!b) return;
    folds[b.dataset.fold] = !(folds[b.dataset.fold] !== false);
    renderFolds();
  });
}

// The sticky row sits under the sheet's sticky heading, whose height changes
// with its title: measured when the sheet opens and when the window resizes.
export function placeStickyRow() {
  const head = el.sheet.querySelector('.sheet-head');
  if (head?.offsetHeight) el.sheet.style.setProperty('--sheet-head-h', `${head.offsetHeight}px`);
}

// A chain step as the sheet edits it: a voice's amount null for a voice
// without one. Other steps (Shape it) are edited as they are stored.
export const editable = (s) => (s.type && s.type !== 'voice' ? { ...s } : { type: 'voice', voice: s.voice, amount: amountFor(s.voice, s.amount) });

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
export function renderLayerRows() {
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

export function closePalette() {
  el.layerPalette.hidden = true;
  el.layerAdd.setAttribute('aria-expanded', 'false');
}
