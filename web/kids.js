// 🧸 Kids (ADR 0019): the screens a person on the Kids level sees, for a
// five-year-old. Pictures, not words: four big tabs at the bottom (🔊 Pads,
// 🎙️ Record, 🥁 Beats, 🎹 Keys) and a big ⏹️, over the same sounds and beats
// as the regular app. The Keys screen's ● records a tune into the kid's
// beat, for a grown-up to keep (kids-logic.js, "● Record"). Nothing here deletes, edits, shares or opens Settings;
// the ⚙️ gear in its usual corner asks a grown-up sum first (the Settings
// gate, settings-ui.js). The Pads screen's round button at the top left
// moves to the next pad skin (skins.js), the person's own `padSkin`, as
// ⚙️ Settings → 🎨 Look would (Ben, 2026-10-16). The pure parts are in
// kids-logic.js.
//
// A new kid's first steps have no words (ADR 0028, tips.js kidsHint): a 👆
// hand pulses over the first pad until a pad is tapped, and the mic wiggles
// until the first recording; both stay still when the device asks for less
// motion, and each shows once per person.
//
// Remembered on the device: the tab (`kids-tab`). The pad size is the
// person's own `padSize`, shared with Pads (Ben, 2026-10-16): the slider in
// the top bar and a pinch both move it, smoothly. An older copy kept a
// device size in localStorage `kids-size`; it is ignored.

import { audio, makeVoice, fadeStop, trimBounds } from './audio.js';
import { levelOf } from './meter.js';
import { logEvent } from './log.js';
import { countPlay } from './play-count.js';
import { fingerTaps, isFinger } from './finger.js';
import { remember, recall, newId } from './util.js';
import { soundName, beatName } from './names.js';
import { askSum, closeSum } from './grown-up.js';
import { scratchOf, scratchId } from './scratch.js';
import { getSetting, setSetting, onSetting } from './settings.js';
import { SKINS, nextSkin } from './skins.js';
import { kidsHint, markSeen } from './tips.js';
import {
  kidsPadPx, kidsSliderAt, shareOf, pageShape, pagesOf, pageAt, pinchShare, kidsPadOrder,
  KIDS_DRUMS, KIDS_SQUARES, newKidsBeat, squaresOf, withSquare, tempoAfter, tempoName,
  kidsVoiceFields, voiceAfter, MAX_RECORD_SECONDS, MIN_RECORD_SECONDS, pressKind, KIDS_COUNT, pictureFor, KIDS_KEYS, keyRate, keyPlayId, keyPitch, isHighKey, beatLayout, cleanTab,
  nextKidsInstrument, keyKitId,
  TUNE_BARS, TUNE_COUNT, pillSeconds, tuneRowOf, withBars, pillAt, withTuneNote, keptTune,
} from './kids-logic.js';
import { STEPS, noteRate } from './sequencer.js';
import { startsIn } from './notes.js';
import { instrumentById, PLAYED } from './instruments.js';

const el = {};
let deps = null;
let showing = false;
let tab = cleanTab(recall('kids-tab'));
let live = null;   // the size under a finger (the slider moving, a pinch) before it is kept

const make = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

// A happy bounce on whatever was tapped (a quick glow when motion is off).
function boing(node) {
  node.classList.remove('boing');
  void node.offsetWidth;   // restart the animation on a quick second tap
  node.classList.add('boing');
  setTimeout(() => node.classList.remove('boing'), 320);
}
// A little head shake: that did nothing (a recording too short).
function wiggle(node) {
  node.classList.add('wiggle');
  setTimeout(() => node.classList.remove('wiggle'), 420);
}

// ── Tabs ──

function setTab(name) {
  name = cleanTab(name);
  if (name !== tab) {
    stopTune();
    stopBeat();
    stopRecording();
    releaseKeys();
  }
  tab = name;
  remember('kids-tab', name);
  for (const v of el.views) v.hidden = v.dataset.kidsView !== name;
  for (const b of el.tabs) b.setAttribute('aria-pressed', String(b.dataset.kidsTab === name));
  if (showing) {
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

const boxSize = () => ({ width: el.pages.clientWidth || 375, height: el.pages.clientHeight || 520 });
const sizeNow = () => live ?? getSetting('padSize');
let drawn = null;   // {cols, rows, count} of the pages drawn: a size that keeps them only resizes the pads

// The pads at the person's size: square, exact px, as many as fit; the room
// left is shared evenly (styles.css .kids-page).
function renderPads() {
  const box = el.pages;
  const { width, height } = boxSize();
  const shape = pageShape(width, height, kidsPadPx(width, height, sizeNow()));
  if (live === null) el.sizeSlider.value = String(kidsSliderAt(width, height, sizeNow()));
  const clips = kidsPadOrder(deps.clips());
  drawn = { cols: shape.cols, rows: shape.rows, count: clips.length };
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
  // 👆 over the first pad, until the first tap (ADR 0028).
  if (kidsHint('pad')) {
    const hand = make('span', 'kids-hand', { textContent: '👆' });
    hand.setAttribute('aria-hidden', 'true');
    box.querySelector('.kids-pad')?.append(hand);
  }
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

// 🎨 The skin button shows the person's skin's picture; a tap moves to the
// next one, round to Tiles again after Googly eyes.
function showSkinButton() {
  const skin = SKINS.find((s) => s.id === getSetting('padSkin')) ?? SKINS[0];
  el.skin.textContent = skin.emoji;
  el.skin.dataset.skin = skin.id;
}

async function nextLook() {
  boing(el.skin);
  try {
    await setSetting('padSkin', nextSkin(getSetting('padSkin')));
  } catch (err) {
    console.error('Changing the look failed:', err);
  }
}

// A new size: only the pads' px size changes while as many fit as before,
// so a slider or pinch stays smooth; else the pages are drawn again.
function resize() {
  if (!showing || tab !== 'pads') return;
  const { width, height } = boxSize();
  const shape = pageShape(width, height, kidsPadPx(width, height, sizeNow()));
  if (drawn && shape.cols === drawn.cols && shape.rows === drawn.rows && deps.clips().length === drawn.count) el.pages.style.setProperty('--kids-pad', `${shape.size}px`);
  else renderPads();
}

// Keeps a size as the person's (Pads shows it too).
async function keepSize(share) {
  live = null;
  try {
    if (share !== getSetting('padSize')) await setSetting('padSize', share);
  } catch (err) {
    console.error('Saving the pad size failed:', err);
  }
  resize();
}

function wireSize() {
  const picked = () => Number(el.sizeSlider.value) / 100;
  el.sizeSlider.addEventListener('input', () => { live = picked(); resize(); });
  el.sizeSlider.addEventListener('change', () => keepSize(picked()));
  // Pads' slider, another device or a loaded backup changed it.
  onSetting('padSize', () => { if (live === null) { resize(); const { width, height } = boxSize(); el.sizeSlider.value = String(kidsSliderAt(width, height, sizeNow())); } });
}

function wirePads() {
  let pinch = null;   // two fingers down: {share, dist} when they landed
  const play = (pad) => {
    const clip = deps.clips().find((c) => c.id === pad.dataset.clip);
    if (!clip) return;
    audio.play(clip);   // from the start, every tap: no holding, no looping
    countPlay('kids');
    boing(pad);
    if (kidsHint('pad')) { markSeen('kids-pad'); el.pages.querySelector('.kids-hand')?.remove(); }
  };
  // A finger plays a pad when it lifts in place, so a page swipe or a pinch
  // that starts on a pad stays silent (finger.js). A mouse plays on press.
  const fingers = fingerTaps({ onTap: (pad) => { if (!pinch) play(pad); } });
  el.pages.addEventListener('pointerdown', (e) => {
    const pad = e.target.closest?.('.kids-pad');
    if (!pad || pinch) return;
    if (isFinger(e)) fingers.down(e, pad); else play(pad);
  });
  // Enter or Space on a focused pad, a switch or a screen reader's tap
  // arrive as a click with no pointer press before it (detail 0), as on
  // Pads: it plays. A pointer's own click (detail 1) already played above.
  el.pages.addEventListener('click', (e) => {
    const pad = e.target.closest?.('.kids-pad');
    if (pad && e.detail === 0) play(pad);
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
    if (e.touches?.length === 2) { const { width, height } = boxSize(); pinch = { share: shareOf(width, height, sizeNow()), dist: spread(e.touches) }; fingers.clear(); }
  }, { passive: true });
  el.pages.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches?.length !== 2) return;
    e.preventDefault();
    const { width, height } = boxSize();
    live = pinchShare(pinch.share, pinch.dist, spread(e.touches), width, height);
    el.sizeSlider.value = String(Math.round(live * 100));
    resize();
  }, { passive: false });
  // The pinch's size is kept when the fingers lift.
  const endPinch = (e) => {
    if (!pinch || (e.touches?.length ?? 0) >= 2) return;
    pinch = null;
    if (live !== null) keepSize(live);
  };
  el.pages.addEventListener('touchend', endPinch);
  el.pages.addEventListener('touchcancel', endPinch);
  // A trackpad's pinch arrives as a wheel with Ctrl held.
  el.pages.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const { width, height } = boxSize();
    const now = shareOf(width, height, sizeNow());
    keepSize(Math.round(Math.min(1, Math.max(0, now + (e.deltaY > 0 ? -0.05 : 0.05))) * 100) / 100);
  }, { passive: false });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (showing && tab === 'pads') renderPads(); }).observe(el.pages);
}

// ── Record: tap the mic for 3, 2, 1, then it listens; or hold it and let go ──

// The mic's state (Ben, 2026-10-22: a tap gives "a 321 countdown", a hold
// still works, and the pulse follows the voice): `mode` is null (nothing),
// 'hold' (a finger holds it: it listens as soon as the microphone answers,
// and the lift stops it), 'count' (a tap: 3, 2, 1 show on the mic, a beep
// each, and the next tap calls it off) or 'tap' (then it listens until the
// next tap, or the time runs out). A press shorter than TAP_MS is a tap
// (kids-logic.js pressKind), decided as the finger lifts, so the hold's
// first moments are thrown away and the count starts. The stream is kept
// from the press through the count, so the browser asks once.
const rec = { mode: null, downAt: 0, stream: null, recorder: null, chunks: [], started: 0, timer: 0, count: 0, raf: 0, source: null, analyser: null, scratch: new Float32Array(512), level: 0 };
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
  el.mic.classList.toggle('kids-nudge', kidsHint('mic'));   // wiggles until the first recording (ADR 0028)
}

const dropStream = (stream) => stream?.getTracks().forEach((t) => t.stop());

// A short beep for each number of a count, on the app's own output, now or
// at `at` on the audio clock.
function beep(at = null) {
  try {
    const ctx = audio.wake();
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + 0.13);
    return osc;
  } catch { return null; /* no sound: the numbers still show */ }
}

// The press: a hold starts at once; while 3, 2, 1 count a press calls it
// off; while a tapped recording listens a press stops it.
function micDown(e) {
  e.preventDefault?.();
  if (rec.mode === 'count') { stopRecording({ discard: true }); return; }
  if (rec.mode === 'tap') { stopRecording(); return; }
  if (rec.mode || !canRecord()) return;
  el.mic.setPointerCapture?.(e.pointerId);
  rec.mode = 'hold';
  rec.downAt = performance.now();
  askMicrophone();
}

// The lift ends a hold: a quick one was a tap, so the count starts instead.
function micUp() {
  if (rec.mode !== 'hold') return;
  if (pressKind(performance.now() - rec.downAt) === 'tap') startCount();
  else stopRecording();
}

async function askMicrophone() {
  audio.stopAll();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    rec.mode = null;
    wiggle(el.mic);
    return;
  }
  // Called off, or Kids left, while the browser asked: nothing to record.
  if (!rec.mode || !showing) { dropStream(stream); rec.mode = null; return; }
  rec.stream = stream;
  if (rec.mode === 'count') count();   // the finger lifted while the browser asked
  else listen();
}

// The tap's count: the microphone answered already (a hold's first moments
// are thrown away), or the count waits for it.
function startCount() {
  rec.mode = 'count';
  if (rec.recorder) endRecorder(true);
  if (rec.stream) count();
}

function count() {
  let n = KIDS_COUNT.from;
  const tick = () => {
    if (rec.mode !== 'count') return;
    if (n === 0) { showCount(''); rec.mode = 'tap'; listen(); return; }
    showCount(String(n));
    beep();
    boing(el.micFace);
    n -= 1;
    rec.count = setTimeout(tick, KIDS_COUNT.ms);
  };
  tick();
}

function showCount(text) {
  el.mic.classList.toggle('counting', !!text);
  el.micFace.textContent = text || '🎙️';
}

// Listens: the recorder runs on the stream, the ring fills as the time runs
// out, and the mic swells with how loud the voice is (meter.js levelOf on
// an analyser fed by the microphone; --kids-level drives styles.css).
function listen() {
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  let recorder;
  try {
    recorder = new MediaRecorder(rec.stream, mime ? { mimeType: mime } : undefined);
  } catch {
    stopRecording({ discard: true });
    wiggle(el.mic);
    return;
  }
  Object.assign(rec, { recorder, chunks: [], started: performance.now(), level: 0 });
  const how = rec.mode === 'tap' ? 'tap' : 'hold';
  const started = rec.started;
  recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
  // `discard` is set on the recorder itself as it is stopped, so a late
  // onstop of a thrown-away hold can never keep anything.
  recorder.onstop = () => { if (!recorder.discard) keep(new Blob(rec.chunks, { type: recorder.mimeType || mime || 'audio/webm' }), (performance.now() - started) / 1000, how); };
  recorder.start();
  try {
    const ctx = audio.wake();
    rec.source = ctx.createMediaStreamSource(rec.stream);
    rec.analyser = ctx.createAnalyser();
    rec.analyser.fftSize = 512;
    rec.source.connect(rec.analyser);
  } catch {
    rec.analyser = null;   // no meter: the ring still fills
  }
  el.mic.classList.add('recording');
  el.mic.setAttribute('aria-pressed', 'true');
  rec.timer = setTimeout(() => stopRecording(), MAX_RECORD_SECONDS * 1000);
  const step = () => {
    const done = Math.min(1, (performance.now() - rec.started) / (MAX_RECORD_SECONDS * 1000));
    el.mic.style.setProperty('--kids-rec', String(done));
    if (rec.analyser) {
      rec.level = Math.max(levelOf(rec.analyser, rec.scratch), rec.level * 0.8);
      el.mic.style.setProperty('--kids-level', rec.level.toFixed(2));
    }
    rec.raf = requestAnimationFrame(step);
  };
  rec.raf = requestAnimationFrame(step);
}

// The recorder stops (its onstop keeps the sound, unless `discard`), the
// meter goes, and the mic sits still again; the stream stays.
function endRecorder(discard = false) {
  clearTimeout(rec.timer);
  cancelAnimationFrame(rec.raf);
  const { recorder } = rec;
  rec.recorder = null;
  if (recorder) {
    recorder.discard = discard;
    if (recorder.state !== 'inactive') recorder.stop();
  }
  rec.source?.disconnect();
  rec.source = null;
  rec.analyser = null;
  el.mic.classList.remove('recording');
  el.mic.setAttribute('aria-pressed', 'false');
  el.mic.style.setProperty('--kids-rec', '0');
  el.mic.style.setProperty('--kids-level', '0');
}

// Everything off, in any state: a hold's or a tap's recording is kept (or
// thrown away with `discard`), a count is called off, the microphone is let go.
function stopRecording({ discard = false } = {}) {
  if (!rec.mode) return;
  rec.mode = null;
  clearTimeout(rec.count);
  showCount('');
  endRecorder(discard);
  dropStream(rec.stream);
  rec.stream = null;
}

// A recording made into a pad of the kid's own, as the sound sheet saves one,
// in the lit voice; then it plays.
async function keep(blob, seconds, how) {
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
  if (kidsHint('mic')) markSeen('kids-mic');
  logEvent('kids', { recorded: Math.round(seconds * 10) / 10, voice: voice ?? 'normal', how });
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

// Enter or Space on the mic, a switch or a screen reader (a click with no
// pointer press, detail 0): the tap's way, 3, 2, 1 and then it listens; the
// same again during the count calls it off, and while it listens stops it.
function micKey(e) {
  if (e.detail !== 0) return;   // a pointer's click: micDown and micUp had it
  if (rec.mode === 'count') { stopRecording({ discard: true }); return; }
  if (rec.mode === 'tap') { stopRecording(); return; }
  if (rec.mode || !canRecord()) return;
  rec.mode = 'count';
  askMicrophone();
}

function wireRecord() {
  el.mic.addEventListener('pointerdown', micDown);
  el.mic.addEventListener('click', micKey);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.mic.addEventListener(type, micUp);
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

// The sound of a clip for the player, loaded once per run; null until it is.
function soundFor(run, clipId) {
  if (!clipId) return null;
  if (!run.sounds.has(clipId)) {
    run.sounds.set(clipId, null);
    const clip = deps.clips({ includeHidden: true, allPresets: true }).find((c) => c.id === clipId);
    if (clip) audio.load(clip).then((got) => { if (playing === run) run.sounds.set(clipId, got); }).catch(() => {});
  }
  return run.sounds.get(clipId);
}

// Plays the beat in a loop, scheduled a little ahead on the audio clock:
// every pill of every bar, the drums' squares and the tune row's notes
// (the tune a ● recording made, played as the regular app plays it: the
// sound faster for a higher note, for as long as the note lasts). `from`:
// the audio-clock time the first pill sounds (after a count); `onPass(at)`
// is told as each time round is booked, with when it ends.
async function playBeat({ from = null, onPass = null } = {}) {
  if (playing) return;
  const ctx = audio.wake();
  const run = { t0: 0, next: 0, pill: 0, voices: new Set(), timer: 0, shows: [], sounds: new Map(), onPass };
  const first = kidsBeat();
  await Promise.all([...drumClips().map((c) => c?.id), tuneRowOf(first)?.clipId].filter(Boolean).map((id) => {
    const clip = deps.clips({ includeHidden: true, allPresets: true }).find((c) => c.id === id);
    return clip ? audio.load(clip).then((got) => run.sounds.set(id, got)).catch(() => {}) : null;
  }));
  if (playing || !showing) return;
  playing = run;
  run.t0 = from ?? ctx.currentTime + 0.06;
  run.next = run.t0;
  const hit = (got, at, rate, len) => {
    const v = makeVoice(ctx, got.buffer, audio.master);
    if (rate !== 1) v.src.playbackRate.value = rate;
    v.src.start(at);
    const end = at + got.duration / rate;
    if (len > 0 && at + len < end) fadeStop(v, at + len); else v.src.stop(end);
    run.voices.add(v);
    v.src.onended = () => run.voices.delete(v);
  };
  const tick = () => {
    if (playing !== run) return;
    const beat = kidsBeat();   // read each time: a square tapped, or a note landed, while it plays
    const ids = drumClips().map((c) => c?.id ?? null);
    const total = STEPS * (beat.bars || 1);
    const dt = pillSeconds(beat.bpm);
    const tune = tuneRowOf(beat);
    while (run.next < ctx.currentTime + 0.12) {
      const p = run.pill;
      for (const id of ids) {
        const row = id && beat.rows.find((r) => r.clipId === id);
        const got = row?.steps?.[p] ? soundFor(run, id) : null;
        if (got) hit(got, run.next, 1, 0);
      }
      if (tune?.tune?.length) {
        const got = soundFor(run, tune.clipId);
        if (got) for (const n of startsIn(tune.tune, p)) hit(got, run.next + (n.s - p) * dt, noteRate(n.p), n.l * dt);
      }
      if (p % 2 === 0) run.shows.push(setTimeout(() => showSquare((p % STEPS) / 2), Math.max(0, (run.next - ctx.currentTime) * 1000)));
      if (run.shows.length > 64) run.shows.splice(0, 32);
      run.next += dt;
      run.pill = (p + 1) % total;
      if (run.pill === 0) run.onPass?.(run.next);
    }
  };
  run.timer = setInterval(tick, 25);
  tick();
  audio.on.started();
  logEvent('kids', { play: true, bpm: first.bpm });
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

// A key's sound: its note on the instrument the round button shows, else
// the kit's own note (a board without that instrument's notes).
function keyClip(i) {
  const all = deps.clips({ includeHidden: true, allPresets: true });
  const k = KIDS_KEYS[i];
  const want = keyKitId(k, getSetting('instNotes'));
  return all.find((c) => c.kitId === want) ?? all.find((c) => c.kitId === k.note) ?? null;
}

// 🎹 The instrument button shows who plays the keys, by its picture; a tap
// moves to the next one (kids-logic.js KIDS_INSTRUMENTS), kept as the
// person's `instNotes`, and plays a C on it, so the change is heard. Every
// key wears the same picture small at its end, so the whole screen says who
// plays (Ben, 2026-10-22: the toggle "should be far more indicative of
// whatever the mode currently playing is"). No words: the instrument's name
// is only for a screen reader.
const keysInstrument = () => instrumentById(getSetting('instNotes')) ?? instrumentById(PLAYED.notes.default);
function showInstButton() {
  const inst = keysInstrument();
  el.inst.textContent = inst.emoji;
  el.inst.dataset.inst = inst.id;
  el.inst.setAttribute('aria-label', `Next instrument (now ${inst.name})`);
}

async function nextInstrument() {
  boing(el.inst);
  releaseKeys();
  try {
    await setSetting('instNotes', nextKidsInstrument(getSetting('instNotes')));
  } catch (err) {
    console.error('Changing the instrument failed:', err);
    return;
  }
  const c = keyClip(0);
  if (c && showing) audio.play(c);   // hear who plays now
}

// A high key wears its low note's fruit a size smaller, with a small ✦:
// the same note, higher. Each key carries the instrument's picture too.
function renderKeys() {
  const inst = keysInstrument();
  el.keys.replaceChildren(...KIDS_KEYS.map((k, i) => {
    const clip = keyClip(i);
    const high = isHighKey(k);
    const b = make('button', high ? 'kids-key high' : 'kids-key', { type: 'button' });
    const who = make('span', 'kids-key-inst', { textContent: inst.emoji });
    who.setAttribute('aria-hidden', 'true');
    const face = make('span', 'kids-key-face', { textContent: clip?.emoji ?? '🎵' });
    if (high) face.append(make('span', 'kids-key-star', { textContent: '✦' }));
    b.append(who, face);
    b.dataset.key = String(i);
    const label = clip?.label ?? 'Note';
    b.setAttribute('aria-label', `${high ? `High ${label}` : label} on ${inst.name}`);
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
  if (clip) audio.play(clip, { rate: keyRate(KIDS_KEYS[i]), id: keyPlayId(KIDS_KEYS[i], clip.id) });
  el.keys.querySelector(`[data-key="${i}"]`)?.classList.add('down');
  if (tuneRec) tuneRec.held.set(id, { at: audio.context().currentTime, pitch: keyPitch(KIDS_KEYS[i]) });
}

function lift(id) {
  if (!held.has(id)) return;
  const i = held.get(id);
  held.delete(id);
  landNote(id);
  if ([...held.values()].includes(i)) return;   // another finger still holds it
  const clip = keyClip(i);
  if (clip) audio.stop(keyPlayId(KIDS_KEYS[i], clip.id));
  el.keys.querySelector(`[data-key="${i}"]`)?.classList.remove('down');
}

// ── ● Record: a tune into the kid's beat (kids-logic.js, "● Record") ──

// What records: {mode: 'count' | 'on', t0, clipId, fresh, held, timers, raf, notes}, or null.
let tuneRec = null;

function showRec() {
  const on = !!tuneRec;
  el.rec.classList.toggle('counting', tuneRec?.mode === 'count');
  el.rec.classList.toggle('recording', tuneRec?.mode === 'on');
  el.rec.setAttribute('aria-pressed', String(on));
  if (!on) { el.recFace.textContent = '●'; el.rec.style.setProperty('--kids-rec', '0'); }
}

// A tap on ●: 3, 2, 1 at the beat's tempo (a beep each, on the audio
// clock), then the beat starts round from its first pill and the keys land.
// A tap during the count calls it off; one while it records stops it.
async function startTune() {
  if (tuneRec) { stopTune(); return; }
  const ctx = audio.wake();
  stopBeat();
  const c = keyClip(0);
  if (!c) return;
  const beat = withBars(kidsBeat(), TUNE_BARS);
  if (beat !== kidsBeat()) deps.saveBeat(beat);
  tuneRec = { mode: 'count', t0: 0, clipId: c.id, fresh: true, held: new Map(), timers: [], beeps: [], raf: 0, notes: 0 };
  const run = tuneRec;
  audio.load(c).catch(() => {});
  const step = 60 / beat.bpm;
  run.t0 = ctx.currentTime + TUNE_COUNT * step;
  for (let n = TUNE_COUNT; n >= 1; n--) {
    const at = run.t0 - n * step;
    const b = beep(at);
    if (b) run.beeps.push(b);
    run.timers.push(setTimeout(() => { if (tuneRec === run) { el.recFace.textContent = String(n); boing(el.recFace); } }, Math.max(0, (at - ctx.currentTime) * 1000)));
  }
  showRec();
  run.timers.push(setTimeout(async () => {
    if (tuneRec !== run) return;
    await playBeat({ from: run.t0, onPass: (at) => { if (tuneRec === run) run.timers.push(setTimeout(stopTune, Math.max(0, (at - ctx.currentTime) * 1000))); } });
    if (tuneRec !== run) return;
    if (!playing) { stopTune(); return; }   // the sounds failed to load: nothing to play along to
    run.mode = 'on';
    el.recFace.textContent = '●';
    showRec();
    logEvent('kids', { rec: 'start', bpm: beat.bpm });
    // The ring round ● fills as the beat goes round once.
    const total = STEPS * (beat.bars || 1) * pillSeconds(beat.bpm);
    const ring = () => {
      if (tuneRec !== run) return;
      el.rec.style.setProperty('--kids-rec', String(Math.min(1, (ctx.currentTime - run.t0) / total)));
      run.raf = requestAnimationFrame(ring);
    };
    run.raf = requestAnimationFrame(ring);
  }, Math.max(0, (run.t0 - ctx.currentTime) * 1000)));
}

// A key let go of while recording lands as a note where it was pressed,
// as long as it was held (a pill at least).
function landNote(id) {
  const got = tuneRec?.held.get(id);
  if (!got) return;
  tuneRec.held.delete(id);
  const beat = kidsBeat();
  const dt = pillSeconds(beat.bpm);
  const total = STEPS * (beat.bars || 1);
  if (got.at < tuneRec.t0 - 2 * dt) return;   // long before the beat started: not meant for it
  const s = pillAt(got.at - tuneRec.t0, dt, total);
  const l = Math.min(STEPS, Math.max(1, Math.round((audio.context().currentTime - got.at) / dt)));
  if (tuneRec.fresh) keepOldTune(beat);
  deps.saveBeat(withTuneNote(beat, { clipId: tuneRec.clipId, pitch: got.pitch, s, l, fresh: tuneRec.fresh }));
  tuneRec.fresh = false;
  tuneRec.notes += 1;
}

// A new recording's first note starts the tune again: the beat with the
// tune it replaces goes into 🗂️ My beats first, under a fun name, as 🆕 New
// keeps a beat (kids-logic.js keptTune), so a kid's earlier tune is never lost.
function keepOldTune(beat) {
  const kept = keptTune(beat, { id: newId('beat'), name: beatName(deps.beats(deps.personId()).map((b) => b.name)) });
  if (kept) deps.saveBeat(kept);
}

// Done: as the beat comes round, at the next tap, with ⏹️, or on leaving.
// Keys still held land; the beat plays on with the tune (⏹️ stops it).
function stopTune() {
  const run = tuneRec;
  if (!run) return;
  for (const id of [...run.held.keys()]) landNote(id);
  run.timers.forEach(clearTimeout);
  for (const b of run.beeps) { try { b.stop(); } catch { /* sounded already */ } }   // a count called off goes quiet
  cancelAnimationFrame(run.raf);
  tuneRec = null;
  if (run.mode === 'on') logEvent('kids', { rec: 'stop', tune: run.notes });
  showRec();
}

function releaseKeys() {
  clearTimeout(tapTimer);
  for (const id of [...held.keys()]) lift(id);
}

// A key played without a pointer (Enter or Space on it, a switch, a screen
// reader): a short press, as a quick tap of a finger, so it sounds and, while
// ● records, lands as a note.
const KEY_TAP_MS = 250;
let tapTimer = 0;
function tapKey(i) {
  clearTimeout(tapTimer);
  lift('kb-tap');
  press('kb-tap', i);
  tapTimer = setTimeout(() => lift('kb-tap'), KEY_TAP_MS);
}

function wireRec() {
  el.rec.addEventListener('click', () => { boing(el.rec); startTune(); });
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
  // A click with no pointer press before it (detail 0): Enter or Space on a
  // focused key, a switch or a screen reader. A pointer's click is ignored:
  // its press and lift played it.
  el.keys.addEventListener('click', (e) => {
    const key = e.target.closest?.('.kids-key');
    if (key && e.detail === 0) tapKey(Number(key.dataset.key));
  });
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
  stopTune();
  stopBeat();
  releaseKeys();
  audio.stopAll();
  boing(el.stop);
}

// The ⚙️ gear while Kids shows: a sum for a grown-up (grown-up.js). Right
// opens Settings and the regular app for this visit; wrong goes back to the
// kid's screens.
export function askGrownUp() {
  stopRecording();
  askSum({
    owner: 'kids',
    right: () => { logEvent('kids', { sum: 'right' }); deps.grownUp(); },
    wrong: () => logEvent('kids', { sum: 'wrong' }),
  });
}

// ── Showing and hiding ──

export function showKids(on) {
  const was = showing;
  showing = on;
  el.root.hidden = !on;
  if (!on) {
    stopTune();
    stopBeat();
    stopRecording();
    releaseKeys();
    closeSum('kids');
    return;
  }
  if (!was) { lastId = null; page = 0; }
  setTab(tab);
}

// Draws the current tab again: the person changed, or their sounds did.
export function refreshKids() {
  if (!showing) return;
  stopTune();
  stopBeat();
  render();
}

export const kidsShowing = () => showing;
export const kidsBusy = () => !!playing || !!rec.mode || !!tuneRec;

export function initKids(d) {
  deps = d;
  const q = (s) => document.querySelector(s);
  Object.assign(el, {
    root: q('#kids'),
    views: document.querySelectorAll('[data-kids-view]'),
    tabs: document.querySelectorAll('[data-kids-tab]'),
    stop: q('#kids-stop'),
    skin: q('#kids-skin'), sizeSlider: q('#kids-size-slider'),
    pages: q('#kids-pages'), turn: q('#kids-turn'), dots: q('#kids-dots'), arrows: document.querySelectorAll('[data-turn]'),
    mic: q('#kids-mic'), micFace: q('#kids-mic-face'), last: q('#kids-last'), voices: document.querySelectorAll('[data-kids-voice]'),
    beat: q('#kids-beat'), play: q('#kids-play'), slow: q('#kids-slow'), fast: q('#kids-fast'),
    keys: q('#kids-keys'), inst: q('#kids-inst'), rec: q('#kids-rec'), recFace: q('#kids-rec-face'),
  });
  for (const b of el.tabs) b.addEventListener('click', () => { boing(b); setTab(b.dataset.kidsTab); });
  el.stop.addEventListener('click', stopAll);
  el.skin.addEventListener('click', nextLook);
  showSkinButton();
  onSetting('padSkin', showSkinButton);
  el.inst.addEventListener('click', nextInstrument);
  showInstButton();
  // A new instrument: the button shows it, and the keys play it (each key
  // the same note, so its fruit stays).
  onSetting('instNotes', () => { showInstButton(); if (showing && tab === 'keys') renderKeys(); });
  wirePads();
  wireSize();
  wireRecord();
  wireBeat();
  wireKeys();
  wireRec();
}
