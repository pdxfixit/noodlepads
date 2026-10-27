// 🎚️ Mixer for the open beat (Ben, 2026-10-12, after a music studio's mixer):
// one column per row, with its fader (the row's loudness, ADR 0015), Mute,
// Solo and one effect, then a Master column with the whole beat's loudness
// and one effect. On a phone the columns scroll sideways inside the mixer
// (Ben: "let's try scrolling first, see if it's terrible").
//
// What a beat stores (ADR 0018), all additive and left out at normal, so a
// beat nobody mixed is stored exactly as before and an older copy of the app
// plays everything:
// - a row: `muted` (already stored), `solo: true`, `fx: '<effect id>'`;
// - the beat: `volume` (the master, 0 to 1, left out at full), `fx`.
// When any row is soloed, only soloed rows play. A muted row never plays.
//
// The effects are the sound sheet's own (steps.js), the ones that run live:
// Room and Hall (its Echo knob), Echo on the beat, Muffled and Bright, Crunch,
// Warble, Robot and Louder. Every beat plays through a small graph of them,
// live, in Save as a sound, in songs and in share previews (buildMix).

import { cleanStep, kindById, buildLive, tailOf } from './steps.js';
import { cleanVolume, rowLevel, percent } from './row-volume.js';

// Each effect: its id (what is stored), emoji, name, and its steps at a tempo.
export const MIX_FX = [
  { id: 'room', emoji: '🏛️', name: 'Room', steps: () => [{ type: 'room', size: 0.25 }] },
  { id: 'hall', emoji: '⛪', name: 'Hall', steps: () => [{ type: 'room', size: 0.6 }] },
  // Three echoes an eighth note apart, at the beat's own tempo.
  { id: 'echo', emoji: '🔁', name: 'Echo', steps: (bpm) => [{ type: 'echo', repeats: 3, beat: true, note: 1, bpm }] },
  { id: 'muffled', emoji: '🧣', name: 'Muffled', steps: () => [{ type: 'tone', tone: -0.6 }] },
  { id: 'bright', emoji: '✨', name: 'Bright', steps: () => [{ type: 'tone', tone: 0.5 }] },
  { id: 'crunch', emoji: '🔥', name: 'Crunch', steps: () => [{ type: 'crunch', amount: 0.35 }] },
  { id: 'warble', emoji: '〰️', name: 'Warble', steps: () => [{ type: 'wobble', speed: 5.5, depth: 0.5 }] },
  { id: 'robot', emoji: '🤖', name: 'Robot', steps: () => [{ type: 'ring', metal: 60 }] },
  { id: 'louder', emoji: '📢', name: 'Louder', steps: () => [{ type: 'squash', amount: 0.5 }] },
];
export const fxById = (id) => MIX_FX.find((f) => f.id === id);
// A stored effect, made safe: a known id, else none.
export const cleanFx = (v) => (typeof v === 'string' && fxById(v) ? v : null);
// An effect's steps, cleaned as the sound sheet cleans them.
export const fxSteps = (id, bpm = 100) => (fxById(id)?.steps(bpm) ?? []).map((s) => cleanStep(kindById(s.type), s));

// The master's loudness: 0 to 1, full when not stored.
export const masterLevel = (p) => cleanVolume(p?.volume);
// Some row is soloed: then only soloed rows play.
export const anySolo = (p) => !!p?.rows?.some((r) => r.solo);
// Silent because another row is soloed and this one is not.
export const silencedBySolo = (p, row) => anySolo(p) && !row.solo;

// The mix's shape: when it changes, the graph is built again.
export const mixKey = (p) => [p.fx ?? '', p.bpm, ...p.rows.map((r) => r.fx ?? '')].join('|');

// The graph for beat `p` on `ctx`, into `dest`: each row with an effect goes
// through it, every row then through the master's effect (if any) and its
// level. `input(i)` is where row i's hits go. `tail` is how many seconds the
// effects ring on after the last hit through it ends: the master's, plus the
// longest row's. `dispose()` stops what it started (Warble and Robot run
// oscillators) and is for after that: the caller waits out the last hit and
// the tail first (beat-engine.js).
export function buildMix(ctx, dest, p) {
  const oscillators = [];
  // The steps start oscillators of their own: kept, so dispose() can stop them.
  const tracked = new Proxy(ctx, {
    get(t, k) {
      if (k === 'createOscillator') return () => { const o = t.createOscillator(); oscillators.push(o); return o; };
      const v = Reflect.get(t, k);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  const master = ctx.createGain();
  master.gain.value = masterLevel(p);
  master.connect(dest);
  let head = master;
  if (p.fx) {
    head = ctx.createGain();
    buildLive(tracked, head, fxSteps(p.fx, p.bpm)).output.connect(master);
  }
  const inputs = p.rows.map((r) => {
    if (!r.fx) return head;
    const input = ctx.createGain();
    buildLive(tracked, input, fxSteps(r.fx, p.bpm)).output.connect(head);
    return input;
  });
  const tail = (p.fx ? tailOf(fxSteps(p.fx, p.bpm)) : 0)
    + Math.max(0, ...p.rows.map((r) => (r.fx ? tailOf(fxSteps(r.fx, p.bpm)) : 0)));
  return {
    key: mixKey(p),
    tail,
    master,
    input: (i) => inputs[i] ?? head,
    dispose() {
      for (const o of oscillators) { try { o.stop(); } catch { /* never started */ } }
      try { master.disconnect(); } catch { /* gone */ }
    },
  };
}

// ── The mixer sheet ──

function make(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function fxPicker(key, value, label) {
  const s = make('select', 'mix-fx');
  s.dataset.fx = key;
  s.setAttribute('aria-label', label);
  const none = make('option', '', 'None');
  none.value = '';
  s.append(none, ...MIX_FX.map((f) => {
    const o = make('option', '', `${f.emoji} ${f.name}`);
    o.value = f.id;
    return o;
  }));
  s.value = value ?? '';
  return s;
}

// A vertical fader: up is louder. Its number shows under it.
function fader(key, level, label) {
  const box = make('div', 'mix-fader-box');
  const f = make('input', 'mix-fader');
  f.type = 'range';
  f.min = '0';
  f.max = '100';
  f.step = '1';
  f.value = String(percent(level));
  f.dataset.fader = key;
  f.setAttribute('aria-label', label);
  f.setAttribute('aria-valuetext', `${percent(level)} %`);
  f.setAttribute('aria-orientation', 'vertical');
  box.append(f);
  return box;
}

// The mixer sheet in `dialog` (its column strip `strips`). `api` is the beat
// maker's: beat(), clipById(id), colorOf(clip), and the changes
// setLevel(i, v, done), toggleMute(i), toggleSolo(i), setFx(i, id),
// setMaster(v, done), setMasterFx(id), allOn().
export function createMixer({ dialog, strips }, api) {
  function strip(row, i, solo) {
    const clip = api.clipById(row.clipId);
    const name = clip?.label ?? 'No sound';
    const col = make('div', 'mix-strip');
    col.dataset.strip = String(i);
    if (clip) col.style.setProperty('--pill', api.colorOf(clip));
    col.classList.toggle('muted', !!row.muted);
    col.classList.toggle('silenced', silencedBySolo({ rows: solo }, row));
    const head = make('span', 'mix-emoji', clip?.emoji || '🔊');
    head.setAttribute('aria-hidden', 'true');
    const label = make('span', 'mix-name', name);
    const pct = make('span', 'mix-pct', `${percent(rowLevel(row))} %`);
    pct.dataset.pct = String(i);
    const mute = make('button', 'mix-mute', 'Mute');
    mute.type = 'button';
    mute.dataset.mute = String(i);
    mute.setAttribute('aria-pressed', String(!!row.muted));
    mute.setAttribute('aria-label', `Mute ${name}`);
    const so = make('button', 'mix-solo', 'Solo');
    so.type = 'button';
    so.dataset.solo = String(i);
    so.setAttribute('aria-pressed', String(!!row.solo));
    so.setAttribute('aria-label', `Solo ${name}: only solo rows play`);
    col.append(head, label, fader(String(i), rowLevel(row), `${name} loudness`), pct, mute, so, fxPicker(String(i), row.fx, `${name} effect`));
    return col;
  }
  function masterStrip(p) {
    const col = make('div', 'mix-strip master');
    col.dataset.strip = 'master';
    const head = make('span', 'mix-emoji', '🎚️');
    head.setAttribute('aria-hidden', 'true');
    const pct = make('span', 'mix-pct', `${percent(masterLevel(p))} %`);
    pct.dataset.pct = 'master';
    // Every row heard again: mutes and solos off (the levels stay).
    const all = make('button', 'mix-all', 'All on');
    all.type = 'button';
    all.dataset.allOn = '';
    all.disabled = !p.rows.some((r) => r.muted || r.solo);
    all.setAttribute('aria-label', 'All on: unmute every row and stop soloing');
    col.append(head, make('span', 'mix-name', 'Master'), fader('master', masterLevel(p), 'Master loudness: the whole beat'), pct, all,
      fxPicker('master', p.fx, 'Master effect: on the whole beat'));
    return col;
  }

  function render() {
    const p = api.beat();
    if (!p) { if (dialog.open) dialog.close(); return; }
    const left = strips.scrollLeft;
    strips.replaceChildren(...p.rows.map((r, i) => strip(r, i, p.rows)), masterStrip(p));
    if (!p.rows.length) strips.prepend(make('p', 'mix-none', 'No rows yet: add one, then mix it here.'));
    strips.scrollLeft = left;
  }
  // A fader moving: its number follows, and the beat hears it at once.
  function slide(f, done) {
    const key = f.dataset.fader;
    const v = Number(f.value) / 100;
    f.setAttribute('aria-valuetext', `${f.value} %`);
    const pct = strips.querySelector(`[data-pct="${key}"]`);
    if (pct) pct.textContent = `${f.value} %`;
    if (key === 'master') api.setMaster(v, done);
    else api.setLevel(Number(key), v, done);
    if (done) render();
  }
  strips.addEventListener('input', (e) => { if (e.target.dataset?.fader !== undefined) slide(e.target, false); });
  strips.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset?.fader !== undefined) { slide(t, true); return; }
    if (t.dataset?.fx !== undefined) {
      const id = cleanFx(t.value);
      if (t.dataset.fx === 'master') api.setMasterFx(id); else api.setFx(Number(t.dataset.fx), id);
      render();
      strips.querySelector(`[data-fx="${t.dataset.fx}"]`)?.focus();
    }
  });
  strips.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const focusAgain = (sel) => strips.querySelector(sel)?.focus();
    if (b.dataset.mute !== undefined) { api.toggleMute(Number(b.dataset.mute)); render(); focusAgain(`[data-mute="${b.dataset.mute}"]`); }
    else if (b.dataset.solo !== undefined) { api.toggleSolo(Number(b.dataset.solo)); render(); focusAgain(`[data-solo="${b.dataset.solo}"]`); }
    else if (b.dataset.allOn !== undefined) { api.allOn(); render(); focusAgain('[data-fader="master"]'); }
  });
  return { render, isOpen: () => !!dialog.open };
}
