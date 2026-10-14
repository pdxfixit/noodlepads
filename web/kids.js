// 🧸 Kids (ADR 0019): the screens a person on the Kids level sees, for a
// five-year-old. Pictures, not words: four big tabs at the bottom (🔊 Pads,
// 🎙️ Record, 🥁 Beats, 🎹 Keys) and a big ⏹️, over the same sounds and beats
// as the regular app. Nothing here deletes, edits, shares or opens Settings;
// the ⚙️ gear in its usual corner asks a grown-up sum first (the Settings
// gate, settings-ui.js). The pure parts are in kids-logic.js.
//
// Remembered on the device: the tab (`kids-tab`) and the pad size a pinch
// chose (`kids-size`).

import { audio, makeVoice, fadeStop, trimBounds } from './audio.js';
import { logEvent } from './log.js';
import { countUse } from './uses.js';
import { fingerTaps, isFinger } from './finger.js';
import { remember, recall, newId } from './util.js';
import { soundName } from './names.js';
import { openDialog, setupDialog } from './dialogs.js';
import { scratchOf, scratchId } from './scratch.js';
import {
  makeSum, typeDigit, cleanSize, kidsColumns, pageShape, pagesOf, pageAt, pinchSize, kidsPadOrder,
  KIDS_DRUMS, KIDS_SQUARES, newKidsBeat, squaresOf, withSquare, tempoAfter, tempoName, squareSeconds,
  kidsVoiceFields, voiceAfter, MAX_RECORD_SECONDS, MIN_RECORD_SECONDS, pictureFor, KIDS_KEYS, beatLayout, cleanTab,
} from './kids-logic.js';

const el = {};
let deps = null;
let showing = false;
let tab = cleanTab(recall('kids-tab'));
let size = cleanSize(recall('kids-size'));

const make = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

// A happy bounce on whatever was tapped (a quick glow when motion is off).
function boing(node) {
  node.classList.remove('boing');
  void node.offsetWidth;   // restart the animation on a quick second tap
  node.classList.add('boing');
  setTimeout(() => node.classList.remove('boing'), 320);
}
// A little head shake: that did nothing (a recording too short, a wrong sum).
function wiggle(node) {
  node.classList.add('wiggle');
  setTimeout(() => node.classList.remove('wiggle'), 420);
}

// ── Tabs ──

function setTab(name) {
  name = cleanTab(name);
  if (name !== tab) {
    stopBeat();
    stopRecording();
    releaseKeys();
  }
  tab = name;
  remember('kids-tab', name);
  for (const v of el.views) v.hidden = v.dataset.kidsView !== name;
  for (const b of el.tabs) b.setAttribute('aria-pressed', String(b.dataset.kidsTab === name));
  if (showing) {
    countUse(`kids-${name}`, deps.personId());
    logEvent('kids', { tab: name });
    render();
  }
}

function render() {
  if (!showing) return;
  if (tab === 'pads') renderPads();
  if (tab === 'record') renderRecord();
  if (tab === 'beats') renderBeat();
  if (tab === 'keys') renderKeys();
}

// ── Pads: big picture pads, swiped between pages, pinched bigger or smaller ──

let page = 0;
let pageCount = 1;

function renderPads() {
  const box = el.pages;
  const width = box.clientWidth || 375;
  const height = box.clientHeight || 520;
  const shape = pageShape(width, height, kidsColumns(size, width));
  const clips = kidsPadOrder(deps.clips());
  const pages = pagesOf(clips, shape.cols * shape.rows);
  pageCount = pages.length;
  page = Math.min(page, pageCount - 1);
  box.style.setProperty('--kids-cols', String(shape.cols));
  box.style.setProperty('--kids-rows', String(shape.rows));
  box.style.setProperty('--kids-pad', `${shape.size}px`);
  box.replaceChildren(...pages.map((list, i) => {
    const p = make('div', 'kids-page');
    p.dataset.page = String(i);
    p.append(...list.map((clip) => {
      const pad = make('button', 'kids-pad', { type: 'button', textContent: clip.emoji || '🔊' });
      pad.dataset.clip = clip.id;
      pad.setAttribute('aria-label', clip.label || 'Sound');
      pad.style.setProperty('--pad', deps.colorOf(clip));
      return pad;
    }));
    return p;
  }));
  renderDots();
  box.scrollLeft = page * width;
}

function renderDots() {
  el.turn.hidden = pageCount < 2;
  el.dots.replaceChildren(...Array.from({ length: pageCount }, () => make('span', 'kids-dot')));
  showPage();
}

// The dot for the page showing lights; an arrow with no page that way dims.
function showPage() {
  [...el.dots.children].forEach((d, i) => d.classList.toggle('here', i === page));
  for (const a of el.arrows) a.disabled = Number(a.dataset.turn) < 0 ? page === 0 : page >= pageCount - 1;
}

function goPage(n) {
  page = Math.min(pageCount - 1, Math.max(0, n));
  const width = el.pages.clientWidth || 0;
  if (typeof el.pages.scrollTo === 'function') el.pages.scrollTo({ left: page * width, behavior: reduced() ? 'auto' : 'smooth' });
  else el.pages.scrollLeft = page * width;
  showPage();
}

function setSize(next) {
  next = cleanSize(next);
  if (next === size) return;
  size = next;
  remember('kids-size', String(size));
  renderPads();
}

function wirePads() {
  let pinch = null;   // two fingers down: {size, dist} when they landed
  const play = (pad) => {
    const clip = deps.clips().find((c) => c.id === pad.dataset.clip);
    if (!clip) return;
    audio.play(clip);   // from the start, every tap: no holding, no looping
    countUse('pad', deps.personId());
    boing(pad);
  };
  // A finger plays a pad when it lifts in place, so a page swipe or a pinch
  // that starts on a pad stays silent (finger.js). A mouse plays on press.
  const fingers = fingerTaps({ onTap: (pad) => { if (!pinch) play(pad); } });
  el.pages.addEventListener('pointerdown', (e) => {
    const pad = e.target.closest?.('.kids-pad');
    if (!pad || pinch) return;
    if (isFinger(e)) fingers.down(e, pad); else play(pad);
  });
  // On the window: a finger may lift off the pads.
  window.addEventListener('pointermove', (e) => fingers.move(e));
  window.addEventListener('pointerup', (e) => fingers.up(e));
  window.addEventListener('pointercancel', (e) => fingers.cancel(e));
  // A long press opens nothing.
  el.pages.addEventListener('contextmenu', (e) => e.preventDefault());
  el.pages.addEventListener('scroll', () => {
    const now = pageAt(el.pages.scrollLeft, el.pages.clientWidth, pageCount);
    if (now === page) return;
    page = now;
    showPage();
  }, { passive: true });
  for (const a of el.arrows) a.addEventListener('click', () => { boing(a); goPage(page + Number(a.dataset.turn)); });
  // Two fingers: a pinch. The pads change size as the fingers move.
  const spread = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.pages.addEventListener('touchstart', (e) => {
    if (e.touches?.length === 2) { pinch = { size, dist: spread(e.touches) }; fingers.clear(); }
  }, { passive: true });
  el.pages.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches?.length !== 2) return;
    e.preventDefault();
    setSize(pinchSize(pinch.size, pinch.dist, spread(e.touches)));
  }, { passive: false });
  const endPinch = (e) => { if ((e.touches?.length ?? 0) < 2) pinch = null; };
  el.pages.addEventListener('touchend', endPinch);
  el.pages.addEventListener('touchcancel', endPinch);
  // A trackpad's pinch arrives as a wheel with Ctrl held.
  el.pages.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setSize(size + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (showing && tab === 'pads') renderPads(); }).observe(el.pages);
}

// ── Record: hold the mic, let go to stop ──

const rec = { wanted: false, recorder: null, stream: null, chunks: [], started: 0, timer: 0, raf: 0 };
let voice = null;      // the lit voice button: 'robot', 'tiny', 'spooky' or null (Normal)
let lastId = null;     // the sound recorded last this visit; a voice tap changes it

const canRecord = () => globalThis.window?.isSecureContext && !!navigator.mediaDevices?.getUserMedia && 'MediaRecorder' in (globalThis.window ?? {});

function renderRecord() {
  for (const b of el.voices) b.setAttribute('aria-pressed', String(b.dataset.kidsVoice === voice));
  const last = lastId && deps.clips().find((c) => c.id === lastId);
  el.last.hidden = !last;
  if (last) {
    el.last.textContent = last.emoji;
    el.last.style.setProperty('--pad', deps.colorOf(last));
  }
  el.mic.disabled = !canRecord();
}

async function startRecording() {
  if (rec.wanted || !canRecord()) return;
  rec.wanted = true;
  audio.stopAll();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    rec.wanted = false;
    wiggle(el.mic);
    return;
  }
  // Let go while the browser asked for the microphone: nothing to record.
  if (!rec.wanted || !showing) { stream.getTracks().forEach((t) => t.stop()); rec.wanted = false; return; }
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    rec.wanted = false;
    wiggle(el.mic);
    return;
  }
  Object.assign(rec, { recorder, stream, chunks: [], started: performance.now() });
  recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
  recorder.onstop = () => keep(new Blob(rec.chunks, { type: recorder.mimeType || mime || 'audio/webm' }), (performance.now() - rec.started) / 1000);
  recorder.start();
  el.mic.classList.add('recording');
  el.mic.setAttribute('aria-pressed', 'true');
  rec.timer = setTimeout(stopRecording, MAX_RECORD_SECONDS * 1000);
  // The ring around the mic fills as the time runs out.
  const step = () => {
    const done = Math.min(1, (performance.now() - rec.started) / (MAX_RECORD_SECONDS * 1000));
    el.mic.style.setProperty('--kids-rec', String(done));
    rec.raf = requestAnimationFrame(step);
  };
  rec.raf = requestAnimationFrame(step);
}

function stopRecording() {
  rec.wanted = false;
  if (!rec.recorder) return;
  clearTimeout(rec.timer);
  cancelAnimationFrame(rec.raf);
  if (rec.recorder.state !== 'inactive') rec.recorder.stop();
  rec.stream.getTracks().forEach((t) => t.stop());
  rec.recorder = null;
  rec.stream = null;
  el.mic.classList.remove('recording');
  el.mic.setAttribute('aria-pressed', 'false');
  el.mic.style.setProperty('--kids-rec', '0');
}

// A recording made into a pad of the kid's own, as the sound sheet saves one,
// in the lit voice; then it plays.
async function keep(blob, seconds) {
  if (seconds < MIN_RECORD_SECONDS) { wiggle(el.mic); return; }
  try {
    const buffer = await audio.decode(await blob.arrayBuffer());
    if (trimBounds(buffer).silent) { wiggle(el.mic); return; }
  } catch {
    wiggle(el.mic);
    return;
  }
  const pid = deps.personId();
  const mine = deps.clips({ includeHidden: true });
  const clip = {
    id: newId('user'),
    personId: pid,
    label: soundName(mine.map((c) => c.label)),
    emoji: pictureFor(new Set(mine.map((c) => c.emoji))),
    color: deps.nextColor(),
    ...kidsVoiceFields(voice),
    blob,
    mime: blob.type,
    created: Date.now(),
  };
  await deps.saveClip(clip);
  lastId = clip.id;
  countUse('record', pid);
  logEvent('kids', { recorded: Math.round(seconds * 10) / 10, voice: voice ?? 'normal' });
  page = 0;   // the new pad is the first one on Pads
  renderRecord();
  playLast();
}

function playLast() {
  const last = lastId && deps.clips().find((c) => c.id === lastId);
  if (!last) return;
  audio.play(last);
  boing(el.last);
}

// A voice button: lights for the next recordings, and changes the last one
// at once, so the kid hears it straight away.
async function tapVoice(id) {
  voice = voiceAfter(voice, id);
  logEvent('kids', { voice: voice ?? 'normal' });
  const last = lastId && deps.ownClip(lastId);
  if (last) {
    delete last.fx;
    delete last.amount;
    Object.assign(last, kidsVoiceFields(voice));
    await deps.saveClip(last, { changed: true });
    audio.dropRendered(last.id);
    playLast();
  }
  renderRecord();
}

function wireRecord() {
  const down = (e) => { e.preventDefault?.(); el.mic.setPointerCapture?.(e.pointerId); startRecording(); };
  el.mic.addEventListener('pointerdown', down);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.mic.addEventListener(type, () => stopRecording());
  el.mic.addEventListener('contextmenu', (e) => e.preventDefault());
  el.last.addEventListener('click', playLast);
  for (const b of el.voices) b.addEventListener('click', () => { boing(b); tapVoice(b.dataset.kidsVoice); });
}

// ── Beats: four drums, eight squares, always saved ──

let playing = null;   // {timer, next, square, voices}
const drumClips = () => {
  const all = deps.clips({ includeHidden: true, allPresets: true });
  return KIDS_DRUMS.map((d) => all.find((c) => c.kitId === d) ?? null);
};

// The kid's beat: their scratch beat (ADR 0020), as stored, or a new empty
// one with the four drums, saved once a square is tapped.
function kidsBeat() {
  const pid = deps.personId();
  const found = scratchOf(deps.beats(pid), pid);
  if (found) return found;
  return newKidsBeat(pid, drumClips().map((c) => c?.id ?? null), scratchId(pid));
}

function renderBeat() {
  const beat = kidsBeat();
  const drums = drumClips();
  const ids = drums.map((c) => c?.id ?? null);
  const squares = squaresOf(beat, ids);
  const layout = beatLayout(el.beat.clientWidth || 375);
  el.beat.dataset.layout = layout;
  const at = (row, col) => (layout === 'across' ? `grid-row: ${row}; grid-column: ${col}` : `grid-row: ${col}; grid-column: ${row}`);
  const cells = [];
  drums.forEach((clip, r) => {
    if (!clip) return;
    const head = make('button', 'kids-drum', { type: 'button', textContent: clip.emoji });
    head.dataset.drum = String(r);
    head.setAttribute('aria-label', clip.label);
    head.style.cssText = at(r + 1, 1);
    head.style.setProperty('--pad', deps.colorOf(clip));
    cells.push(head);
    for (let s = 0; s < KIDS_SQUARES; s++) {
      const sq = make('button', 'kids-square', { type: 'button' });
      sq.dataset.drum = String(r);
      sq.dataset.square = String(s);
      sq.setAttribute('aria-label', `${clip.label} ${s + 1}`);
      sq.setAttribute('aria-pressed', String(squares[r][s]));
      sq.style.cssText = at(r + 1, s + 2);
      sq.style.setProperty('--pad', deps.colorOf(clip));
      if (s % 2 === 0) sq.classList.add('on-beat');
      cells.push(sq);
    }
  });
  el.beat.replaceChildren(...cells);
  el.slow.setAttribute('aria-pressed', String(tempoName(beat.bpm) === 'slow'));
  el.fast.setAttribute('aria-pressed', String(tempoName(beat.bpm) === 'fast'));
  showPlay();
  for (const c of drums) if (c) audio.load(c).catch(() => {});
}

function showPlay() {
  el.play.textContent = playing ? '⏹️' : '▶️';
  el.play.setAttribute('aria-label', playing ? 'Stop' : 'Play');
  el.play.setAttribute('aria-pressed', String(!!playing));
}

function tapSquare(sq) {
  const r = Number(sq.dataset.drum);
  const s = Number(sq.dataset.square);
  const on = sq.getAttribute('aria-pressed') !== 'true';
  const ids = drumClips().map((c) => c?.id ?? null);
  deps.saveBeat(withSquare(kidsBeat(), ids, r, s, on));
  sq.setAttribute('aria-pressed', String(on));
  boing(sq);
  // Turning one on plays its drum, so the kid hears what it adds.
  if (on && !playing) { const clip = drumClips()[r]; if (clip) audio.play(clip); }
}

function setTempo(which) {
  const beat = kidsBeat();
  deps.saveBeat({ ...beat, bpm: tempoAfter(beat.bpm, which), saved: Date.now() });
  renderBeat();
}

// Plays the squares in a loop, scheduled a little ahead on the audio clock.
async function playBeat() {
  if (playing) return;
  const ctx = audio.wake();
  const loaded = await Promise.all(drumClips().map((c) => (c ? audio.load(c).catch(() => null) : null)));
  if (playing || !showing) return;
  playing = { next: ctx.currentTime + 0.06, square: 0, voices: new Set(), timer: 0, shows: [] };
  const run = playing;
  const tick = () => {
    if (playing !== run) return;
    const beat = kidsBeat();
    const squares = squaresOf(beat, drumClips().map((c) => c?.id ?? null));
    while (run.next < ctx.currentTime + 0.12) {
      const s = run.square;
      squares.forEach((line, r) => {
        const got = loaded[r];
        if (!line[s] || !got) return;
        const v = makeVoice(ctx, got.buffer, audio.master);
        v.src.start(run.next);
        v.src.stop(run.next + got.duration);
        run.voices.add(v);
        v.src.onended = () => run.voices.delete(v);
      });
      run.shows.push(setTimeout(() => showSquare(s), Math.max(0, (run.next - ctx.currentTime) * 1000)));
      if (run.shows.length > 32) run.shows.splice(0, 16);
      run.next += squareSeconds(beat.bpm);
      run.square = (s + 1) % KIDS_SQUARES;
    }
  };
  run.timer = setInterval(tick, 25);
  tick();
  audio.on.started();
  countUse('beat-play', deps.personId());
  logEvent('kids', { play: true, bpm: kidsBeat().bpm });
  showPlay();
}

function showSquare(s) {
  for (const sq of el.beat.querySelectorAll('.kids-square')) sq.classList.toggle('now', Number(sq.dataset.square) === s);
}

function stopBeat() {
  const run = playing;
  if (!run) return;
  playing = null;
  clearInterval(run.timer);
  run.shows.forEach(clearTimeout);
  const at = audio.ctx?.currentTime ?? 0;
  for (const v of run.voices) fadeStop(v, at);
  showSquare(-1);
  if (el.play) showPlay();
}

function wireBeat() {
  el.beat.addEventListener('click', (e) => {
    const sq = e.target.closest?.('.kids-square');
    if (sq) { tapSquare(sq); return; }
    const head = e.target.closest?.('.kids-drum');
    if (head) { const clip = drumClips()[Number(head.dataset.drum)]; if (clip) audio.play(clip); boing(head); }
  });
  el.play.addEventListener('click', () => { boing(el.play); if (playing) stopBeat(); else playBeat(); });
  el.slow.addEventListener('click', () => { boing(el.slow); setTempo('slow'); });
  el.fast.addEventListener('click', () => { boing(el.fast); setTempo('fast'); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (showing && tab === 'beats' && el.beat.dataset.layout !== beatLayout(el.beat.clientWidth || 375)) renderBeat();
  }).observe(el.beat);
}

// ── Keys: eight big keys that play while held ──

const held = new Map();   // pointer id (or 'kb-<letter>') -> key index

function keyClip(i) {
  const all = deps.clips({ includeHidden: true, allPresets: true });
  return all.find((c) => c.kitId === KIDS_KEYS[i].note) ?? null;
}

function renderKeys() {
  el.keys.replaceChildren(...KIDS_KEYS.map((k, i) => {
    const clip = keyClip(i);
    const b = make('button', 'kids-key', { type: 'button', textContent: clip?.emoji ?? '🎵' });
    b.dataset.key = String(i);
    b.setAttribute('aria-label', clip?.label ?? 'Note');
    b.style.setProperty('--key', k.color);
    b.style.setProperty('--n', String(i));
    return b;
  }));
  for (let i = 0; i < KIDS_KEYS.length; i++) { const c = keyClip(i); if (c) audio.load(c).catch(() => {}); }
}

function press(id, i) {
  if (held.get(id) === i) return;
  if (held.has(id)) lift(id);
  held.set(id, i);
  const clip = keyClip(i);
  if (clip) audio.play(clip);
  el.keys.querySelector(`[data-key="${i}"]`)?.classList.add('down');
}

function lift(id) {
  if (!held.has(id)) return;
  const i = held.get(id);
  held.delete(id);
  if ([...held.values()].includes(i)) return;   // another finger still holds it
  const clip = keyClip(i);
  if (clip) audio.stop(clip.id);
  el.keys.querySelector(`[data-key="${i}"]`)?.classList.remove('down');
}

function releaseKeys() {
  for (const id of [...held.keys()]) lift(id);
}

function wireKeys() {
  // Each finger plays its own key; sliding along the keys plays each one it
  // reaches, like running a finger along a toy keyboard.
  el.keys.addEventListener('pointerdown', (e) => {
    const key = e.target.closest?.('.kids-key');
    if (!key) return;
    e.preventDefault?.();
    key.releasePointerCapture?.(e.pointerId);
    press(e.pointerId, Number(key.dataset.key));
  });
  el.keys.addEventListener('pointerover', (e) => {
    if (!held.has(e.pointerId)) return;
    const key = e.target.closest?.('.kids-key');
    if (key) press(e.pointerId, Number(key.dataset.key));
  });
  for (const type of ['pointerup', 'pointercancel']) el.keys.addEventListener(type, (e) => lift(e.pointerId));
  el.keys.addEventListener('pointerleave', (e) => lift(e.pointerId));
  el.keys.addEventListener('contextmenu', (e) => e.preventDefault());
}

// The letters A S D F G H J K play the keys on a keyboard.
export function kidsKeydown(e) {
  if (!showing) return false;
  if (e.key === 'Escape' || (e.key === ' ' && !e.repeat && !e.target?.closest?.('button'))) { e.preventDefault?.(); stopAll(); return true; }   // Space stops, as everywhere
  if (tab === 'pads' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { goPage(page + (e.key === 'ArrowRight' ? 1 : -1)); return true; }
  if (tab !== 'keys' || e.repeat) return true;
  const i = KIDS_KEYS.findIndex((k) => k.key === e.key?.toLowerCase());
  if (i >= 0) press(`kb-${e.key.toLowerCase()}`, i);
  return true;
}
export function kidsKeyup(e) {
  if (!showing) return;
  lift(`kb-${e.key?.toLowerCase()}`);
}

// ── ⏹️ and the grown-up sum ──

function stopAll() {
  stopBeat();
  releaseKeys();
  audio.stopAll();
  boing(el.stop);
}

let sum = null;
let typed = '';

// The ⚙️ gear while Kids shows: a sum for a grown-up. Right opens Settings
// and the regular app for this visit; wrong goes back to the kid's screens.
export function askGrownUp() {
  stopRecording();
  sum = makeSum();
  typed = '';
  el.sumA.textContent = String(sum.a);
  el.sumB.textContent = String(sum.b);
  el.sumTyped.textContent = '?';
  openDialog(el.sum);
}

function tapDigit(d) {
  const next = typeDigit(typed, d, sum.answer);
  typed = next.typed;
  el.sumTyped.textContent = typed;
  if (!next.done) return;
  logEvent('kids', { sum: next.right ? 'right' : 'wrong' });
  if (next.right) {
    el.sum.close();
    countUse('kids-unlock', deps.personId());
    deps.grownUp();
  } else {
    wiggle(el.sumBox);
    setTimeout(() => el.sum.close(), 400);
  }
}

// ── Showing and hiding ──

export function showKids(on) {
  const was = showing;
  showing = on;
  el.root.hidden = !on;
  if (!on) {
    stopBeat();
    stopRecording();
    releaseKeys();
    if (el.sum.open) el.sum.close();
    return;
  }
  if (!was) { lastId = null; page = 0; }
  setTab(tab);
}

// Draws the current tab again: the person changed, or their sounds did.
export function refreshKids() {
  if (!showing) return;
  stopBeat();
  render();
}

export const kidsShowing = () => showing;
export const kidsBusy = () => !!playing || !!rec.recorder;

export function initKids(d) {
  deps = d;
  const q = (s) => document.querySelector(s);
  Object.assign(el, {
    root: q('#kids'),
    views: document.querySelectorAll('[data-kids-view]'),
    tabs: document.querySelectorAll('[data-kids-tab]'),
    stop: q('#kids-stop'),
    pages: q('#kids-pages'), turn: q('#kids-turn'), dots: q('#kids-dots'), arrows: document.querySelectorAll('[data-turn]'),
    mic: q('#kids-mic'), last: q('#kids-last'), voices: document.querySelectorAll('[data-kids-voice]'),
    beat: q('#kids-beat'), play: q('#kids-play'), slow: q('#kids-slow'), fast: q('#kids-fast'),
    keys: q('#kids-keys'),
    sum: q('#kids-sum'), sumBox: q('#kids-sum-box'), sumA: q('#kids-sum-a'), sumB: q('#kids-sum-b'), sumTyped: q('#kids-sum-typed'), sumKeys: q('#kids-sum-keys'),
  });
  for (const b of el.tabs) b.addEventListener('click', () => { boing(b); setTab(b.dataset.kidsTab); });
  el.stop.addEventListener('click', stopAll);
  wirePads();
  wireRecord();
  wireBeat();
  wireKeys();
  setupDialog(el.sum);
  el.sumKeys.addEventListener('click', (e) => {
    const k = e.target.closest?.('[data-digit]');
    if (k) tapDigit(k.dataset.digit);
  });
}
