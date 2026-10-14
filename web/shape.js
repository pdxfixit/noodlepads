// The sound sheet's Layers (Ben, 2026-10-11, Q42c: Knobs and Shape it
// "permanently merged… an interface similar to beats"): one row per layer,
// top to bottom in the order they play, styled like a Beats row. A row is
// its emoji tile, its name, its control inline (a slider, or keys for five
// stops or fewer: lines.js), then 🔈 mute and, where the layer can go, ✕
// (two taps). The five main knobs are always rows; other knobs, a ✦ special
// part and (Advanced) the kid's own steps are rows once added. Steps have a
// grip to drag them and ⤢ to open a voice into steps. + Add a layer opens a
// palette of what can be added. This module draws; sheet.js handles the
// taps, drags and sounds.

import { KINDS, kindById } from './steps.js';
import { voiceById, amountText, stepLook } from './voices.js';
import { fitLine, keysForSlider, KEYED_STEPS } from './lines.js';
import { tweakByKey, tweakText, knobSay } from './tweaks.js';

// What a slider shows for number spec `n` at value `v`, and back. Ratio
// sliders (`log`) move evenly in ratio, so ½× sits as far from 1× as 2×.
export const toSlider = (n, v) => (n.log ? Math.log2(v) : v);
export const fromSlider = (n, x) => (n.log ? 2 ** Number(x) : Number(x));
export function sliderRange(n) {
  return n.log
    ? { min: Math.log2(n.min), max: Math.log2(n.max), step: 0.01 }
    : { min: n.min, max: n.max, step: n.step };
}

// The numbers a step's row has sliders for: a kind's own, or a voice's amount.
export function numsOf(step) {
  if (step.type !== 'voice') { const kind = kindById(step.type); return kind?.numsFor?.(step) ?? kind?.nums ?? []; }
  const range = voiceById(step.voice).amount;
  return range ? [{ key: 'amount', label: range.label, min: range.min, max: range.max, step: range.step, default: range.default, text: (v) => amountText(step.voice, v) }] : [];
}

const make = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') e.setAttribute(k, v);
    else e[k] = v;
  }
  e.append(...kids);
  return e;
};

// A layer's emoji and name: a knob's, the ✦ special part's, or a step's.
export function layerLook(row, { tweaks, chain }) {
  if (row === 'special') return { emoji: '✦', name: `Special: ${knobSay('special', tweaks.special).replace(/^✦ /, '')}` };
  if (row.startsWith('step:')) return stepLook(chain[Number(row.slice(5))]);
  const k = tweakByKey(row);
  return { emoji: k.emoji, name: k.name };
}

// 🔈 and ✕ at a row's right. ✕ asks first: `armed` is the row waiting for its
// second tap, which shows "Remove?" in red.
function tools(row, look, { muted, mutes, removable, armed, ready, open }) {
  const box = make('div', { class: 'layer-tools' });
  if (open) box.append(make('button', { type: 'button', class: 'layer-tool', 'data-open': open, disabled: !ready, 'aria-label': `Open ${look.name} into its steps`, title: 'Open it into its steps', text: '⤢' }));
  if (mutes) box.append(make('button', {
    type: 'button', class: 'layer-tool', 'data-mute': row, disabled: !ready, 'aria-pressed': String(muted),
    'aria-label': `Mute ${look.name}`, title: muted ? 'Muted: tap to hear it again' : 'Mute: keep it, but don’t play it', text: muted ? '🔇' : '🔈',
  }));
  if (removable) {
    const asks = armed === row;
    const x = make('button', { type: 'button', class: 'layer-tool layer-remove', 'data-remove-layer': row, disabled: !ready, 'aria-label': asks ? `Tap again to remove ${look.name}` : `Remove ${look.name}`, text: asks ? '✕ Remove?' : '✕' });
    x.classList.toggle('armed', asks);
    box.append(x);
  }
  return box;
}

// A knob's control: its slider with the words, or its keys (lines.js).
// Backwards is a switch, drawn as two keys, Off and On.
function knobControl(key, tweaks, ready, look) {
  const knob = tweakByKey(key);
  const input = make('input', { type: 'range', 'data-layer-knob': key, disabled: !ready, 'aria-label': look.name });
  const flag = !!knob.flag;
  Object.assign(input, flag ? { min: 0, max: 1, step: 1 } : { min: knob.min, max: knob.max, step: knob.step });
  input.value = String(flag ? Number(!!tweaks[key]) : tweaks[key]);
  const say = flag ? (v) => (Number(v) ? 'On' : 'Off') : (v) => tweakText(key, Number(v));
  const ctl = make('div', { class: 'amount layer-amount' }, input, make('output', { text: say(input.value) }));
  return { ctl, input, say };
}

// One step's controls: a labelled slider per number (keys for a few stops),
// then its switches.
function stepControls(step, i, ready, look) {
  const parts = [];
  for (const n of numsOf(step)) {
    const input = make('input', { type: 'range', 'data-i': String(i), 'data-key': n.key, disabled: !ready, 'aria-label': `${look.name}: ${n.label}` });
    Object.assign(input, sliderRange(n));
    input.value = String(toSlider(n, step[n.key]));
    parts.push({ row: make('div', { class: 'amount shape-amount' }, make('span', { text: n.label }), input, make('output', { text: n.text(step[n.key]) })), input, n });
  }
  const flags = (kindById(step.type)?.flags ?? []).map((f) => make('button', { type: 'button', class: 'shape-flag', 'data-i': String(i), 'data-flag': f.key, disabled: !ready, 'aria-pressed': String(!!step[f.key]), text: f.label }));
  return { parts, flags };
}

// Draws the rows (tweaks.js layerRows) into `list`. `ctx`: {tweaks (every
// knob, as the sheet edits them), muted (a Set of knob keys and 'special'),
// chain, ready, armed, canOpen(step), mutes: false for no 🔈 (🪄 Voice for
// many sounds, where a mute has nothing to keep)}.
// A key or button that had focus has it again after the redraw, so the
// keyboard keeps its place.
export function renderLayers(list, rows, ctx) {
  const active = globalThis.document?.activeElement;
  const had = active && list.contains(active) ? {
    layer: active.closest?.('[data-layer]')?.dataset.layer, stop: active.dataset?.stop, tool: active.dataset?.mute ? 'mute' : active.dataset?.removeLayer ? 'remove' : null,
  } : null;
  const { tweaks, muted, chain, ready, armed, canOpen, mutes = true } = ctx;
  const stepCount = rows.filter((r) => r.startsWith('step:')).length;
  list.replaceChildren(...rows.map((row) => {
    const look = layerLook(row, ctx);
    const step = row.startsWith('step:') ? Number(row.slice(5)) : null;
    const isMuted = step !== null ? !!chain[step].off : muted.has(row);
    const li = make('li', { class: 'layer-row', 'data-layer': row });
    li.classList.toggle('muted', isMuted);
    if (step !== null) {
      li.classList.add('layer-step');
      li.dataset.step = String(step);
      li.append(make('button', { type: 'button', class: 'layer-grip', 'data-grip': String(step), disabled: !ready || stepCount < 2, 'aria-label': `Move ${look.name}: drag, or use the arrow keys` }));
    } else if (tweakByKey(row)?.main) li.classList.add('layer-main');
    li.append(make('span', { class: 'layer-tile', 'aria-hidden': 'true', text: look.emoji }), make('span', { class: 'layer-name', text: look.name }));
    const removable = row === 'special' || step !== null || !tweakByKey(row)?.main;
    li.append(tools(row, look, { muted: isMuted, mutes, removable, armed, ready, open: step !== null && canOpen?.(chain[step]) ? String(step) : null }));
    if (step !== null) {
      const { parts, flags } = stepControls(chain[step], step, ready, look);
      const ctl = make('div', { class: 'layer-ctl' }, ...parts.map((p) => p.row));
      if (flags.length) ctl.append(make('div', { class: 'layer-flags' }, ...flags));
      if (parts.length || flags.length) li.append(ctl);
      // A few stops (Echoes 1–8, a note length): keys, with the slider as fallback.
      for (const p of parts) if (!p.n.log) keysForSlider(p.input, p.n.keyText ?? String);
    } else if (row !== 'special') {
      const { ctl, input, say } = knobControl(row, tweaks, ready, look);
      li.append(make('div', { class: 'layer-ctl' }, ctl));
      keysForSlider(input, say);
    }
    return li;
  }));
  for (const row of list.querySelectorAll('.keyed')) fitLine(row, KEYED_STEPS);
  if (!had?.layer) return;
  const card = list.querySelector(`[data-layer="${had.layer}"]`);
  const again = had.stop !== undefined ? card?.querySelector(`[data-stop="${had.stop}"]`)
    : had.tool === 'mute' ? card?.querySelector('[data-mute]')
      : had.tool === 'remove' ? card?.querySelector('[data-remove-layer]') : card?.querySelector('button, input');
  again?.focus?.({ preventScroll: true });
}

// The palette + Add a layer opens: the knobs that aren't rows yet, then
// (Advanced) every kind of step.
export function renderLayerPalette(node, { knobs, steps, stepsOn }) {
  const b = (data, emoji, name, disabled = false) => make('button', { type: 'button', ...data, disabled }, make('span', { class: 'voice-emoji', 'aria-hidden': 'true', text: emoji }), name);
  const parts = [];
  if (knobs.length) {
    parts.push(make('p', { class: 'shape-label', text: 'Knobs' }),
      make('div', { class: 'voices layer-choices' }, ...knobs.map((k) => { const t = tweakByKey(k); return b({ 'data-add-knob': k }, t.emoji, t.name); })));
  }
  if (steps) {
    parts.push(make('p', { class: 'shape-label', text: 'Steps' }),
      make('div', { class: 'voices layer-choices' }, ...KINDS.map((k) => b({ 'data-add': k.id }, k.emoji, k.name, !stepsOn))));
  }
  node.replaceChildren(...parts);
}

// After a slider moved: its output's words, without redrawing the row.
export function sliderText(step, key) {
  const n = numsOf(step).find((x) => x.key === key);
  return n ? n.text(step[key]) : '';
}
