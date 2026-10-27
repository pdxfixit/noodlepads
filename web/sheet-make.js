// The sound sheet's ➕ Mix with another sound and ✨ Make one (synth.js): the
// two ways to a sound that is not a recording, drawn and wired here on the
// shared state in sheet-state.js. sheet.js opens the sheet and plays and saves
// it.

import { state, persist } from './state.js';
import { audio, keptAudio } from './audio.js';
import { currentPerson, clipsFor, nextClipColor } from './board.js';
import { renderPads } from './pads.js';
import { newId } from './util.js';
import { synthName, mixName } from './names.js';
import { mixSounds } from './mix.js';
import { showNotice } from './ui.js';
import { STARTERS, TONES, LIMITS, RATE, renderSynth, cleanSynth, surpriseSynth } from './synth.js';
import { encodeWav } from './wav.js';
import { fitLine, keysForSlider, KEYED_STEPS } from './lines.js';
import { el, sheet, live, parts, advanced, sheetError, setStatus, later } from './sheet-state.js';

const closeSheet = later('closeSheet');
const isRecording = later('isRecording');
const previewVoice = later('previewVoice');
const renderAmount = later('renderAmount');
const rendered = later('rendered');
const resetPreviews = later('resetPreviews');
const setVoicesReady = later('setVoicesReady');

const mixPartner = () => clipsFor(currentPerson().id, { allPresets: true }).find((c) => c.id === sheet.mix.with);

export function renderMix() {
  const other = mixPartner();
  el.mixOffset.value = String(sheet.mix.offset);
  el.mixOffsetOut.textContent = sheet.mix.offset ? `${sheet.mix.offset.toFixed(2)} s` : 'together';
  el.mixBalance.value = String(sheet.mix.balance);
  const b = sheet.mix.balance;
  el.mixBalanceOut.textContent = Math.abs(b - 0.5) < 0.03 ? 'half and half' : b < 0.5 ? 'more of this one' : `more ${other?.label ?? 'of the other'}`;
  for (const x of [el.mixPlay, el.mixMake]) x.disabled = !other || !sheet.ready;
}

export function openMix() {
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

export async function hearMix() {
  try {
    const made = await buildMix();
    if (!made || !el.sheet.open) return;
    live.on = false;
    parts.wave.show(made.buffer, made.buffer.duration);
    audio.start('preview', { buffer: made.buffer, duration: made.buffer.duration });
    parts.wave.follow('preview');
  } catch (err) {
    console.error('The mix did not render:', err);
    sheetError('That mix didn’t work. Pick another sound.');
  }
}

// The mix becomes a new sound on this board, named as a blend of the two.
export async function makeMix() {
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
export function renderMake() {
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
  parts.cut.recorded(buffer);
  sheet.original = Promise.resolve(original);
  resetPreviews();
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

export function renderStarters() {
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
export function wireMake() {
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
