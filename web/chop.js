// Trim, edit and chop in the sound sheet (Advanced): tools that work on the
// wave. ✂️ Trim and edit shows the whole stored recording, with three views
// of the same wave and handles:
//   ✂️ Ends         a handle at each end; drag them in and the cut-off ends turn grey.
//   📐 Fades        a handle inside each end: the sound fades in up to the
//                   first and fades out from the second.
//   👆 Select part  two handles around a part, then change just that part:
//                   Backwards, Silence it, Louder, Quieter, Keep only this.
//                   Beside them, on a kid's own sound, 🔊 Even it out turns
//                   the whole sound up or down until it seems as loud as the
//                   presets (loudness.js).
// The sound keeps the same pad and the recording is never changed: the trim,
// the edits and the fade are settings (cuts.js) applied every time the sound
// renders, before its voices. Undo steps back through all of them.
// 🧩 Chop finds where each sound in it starts and puts a mark there; drag,
// add or remove marks, then each piece becomes a new pad with a family name
// ("Baby Burp"). The pure parts are in cuts.js; sheet.js calls in here.

import { state, persist } from './state.js';
import { audio, slice, trimBounds } from './audio.js';
import { currentPerson, clipsFor, nextClipColor } from './board.js';
import { renderPads } from './pads.js';
import { encodeWav } from './sequencer.js';
import { getSetting, onSetting } from './settings.js';
import { showNotice, showBanner } from './ui.js';
import { newId } from './util.js';
import { chopName } from './names.js';
import {
  cleanTrim, onsets, cleanMarks, pieces, newMark, MIN_PIECE,
  cleanEdits, cleanFade, addEdit, applyEdits, applyFade, GAIN_STEP, hasGain, levelForGain, editsKey,
} from './cuts.js';
import { loudness, peakOf, evenGain, PRESET_LOUDNESS, EVEN_ENOUGH } from './loudness.js';
import { logEvent } from './log.js';
import { WAVE_PAD } from './wave.js';

const NUDGE = 0.01;   // seconds an arrow key moves a handle; Shift moves ten times as far
const AROUND = 0.5;   // seconds heard either side of a part just changed, so it is heard in place
const ms = (s) => Math.round(s * 1000) / 1000;

// What each view's two handles are called (for screen readers).
const HANDLES = { ends: ['Start', 'End'], fades: ['Fade in until', 'Fade out from'], part: ['Part starts', 'Part ends'] };

// sheet: what the sound sheet lends this module.
//   wave            the sheet's wave (wave.js)
//   now()           {mode, clip, trim, edits, fade, name, emoji, ready}: the sheet as it is
//   setCut({trim, edits, fade}, buffer)  they changed: `buffer` is the sound the voices start from now
//   voiced()        Promise<{buffer, duration}>: the sound through its voices now
//   showVoiced(play)  put the voiced wave back, and play it if `play`
export function createCut(sheet) {
  const $ = (sel) => document.querySelector(sel);
  const el = {
    box: $('#cut'), start: $('#cut-start'), trimBtn: $('#trim-btn'), chopBtn: $('#chop-btn'),
    panel: $('#cut-panel'), hint: $('#cut-hint'), add: $('#cut-add'), remove: $('#cut-remove'),
    undo: $('#cut-undo'), all: $('#cut-all'), nofade: $('#cut-nofade'), done: $('#cut-done'), make: $('#cut-make'),
    views: $('#cut-views'), edits: $('#cut-edits'), even: $('#cut-even'),
    marks: $('#wave-marks'), from: $('#cut-from'), canvas: $('#wave'),
  };
  const cut = {
    mode: null,      // null | 'trim' | 'chop'
    view: 'ends',    // trim: 'ends' | 'fades' | 'part', what the handles move
    full: null,      // trim: the whole stored recording (AudioBuffer)
    shown: null,     // trim: `full` with the edits and fade, as the wave draws it
    recorded: null,  // a new sound's whole recording, before any trim
    range: null,     // trim: {start, end} seconds into `full`, what the trim keeps
    edits: null,     // trim: the changes to parts of it (cuts.js), or null
    fade: null,      // trim: {in, out} seconds, or null
    sel: null,       // trim: {start, end} seconds, the part Select part changes
    undo: [],        // trim: {trim, edits, fade} to step back to, since the sheet opened
    exact: false,    // trim: the sound is a beat made into a sound, kept whole when untrimmed
    source: null,    // chop: the voiced sound being cut (AudioBuffer)
    marks: [],       // chop: cut points, seconds into `source`
    picked: -1,      // chop: the mark ✕ removes
    drag: null,      // {index, pointerId} while a handle is held
    moving: false,   // trim: a handle moved since it was picked up
  };

  const shown = () => getSetting('advancedBeats') === true;
  const length = () => (cut.mode === 'trim' ? cut.full.duration : cut.source.duration);
  const sameRange = (a, b) => a.start === b.start && a.end === b.end;
  // A kid's own sound: a new one, or a saved one of theirs. Presets don't get 🔊 Even it out.
  const own = () => {
    const { mode, clip } = sheet.now();
    return mode === 'new' || clip?.source === 'user';
  };

  function render() {
    const { ready } = sheet.now();
    el.box.hidden = !ready;   // 👂 Plain (sheet.js) shares the row for everyone
    el.trimBtn.hidden = el.chopBtn.hidden = !shown();
    el.trimBtn.disabled = el.chopBtn.disabled = !ready;
    el.start.hidden = !!cut.mode;
    el.panel.hidden = !cut.mode;
    el.panel.dataset.mode = cut.mode || '';
    el.panel.dataset.view = cut.mode === 'trim' ? cut.view : '';
    el.marks.hidden = !cut.mode;
    const trim = cut.mode === 'trim';
    el.views.hidden = !trim;
    for (const b of el.views.children) b.setAttribute('aria-pressed', String(b.dataset.view === cut.view));
    el.edits.hidden = !trim || cut.view !== 'part';
    // 🔊 Even it out sits with 👂 Plain, for everyone, on a kid's own sound
    // (Ben, 2026-10-18: a sound sheet button, not inside the Advanced editor).
    el.even.hidden = !own();
    el.even.disabled = !ready;
    el.undo.hidden = !trim;
    el.all.hidden = !trim || cut.view === 'fades';
    el.nofade.hidden = !trim || cut.view !== 'fades';
    el.done.textContent = trim ? '✓ Done' : 'Back';
    el.add.hidden = el.remove.hidden = el.make.hidden = trim;
    if (trim) {
      el.undo.disabled = !cut.undo.length;
      const { start, end } = cut.range;
      if (cut.view === 'ends') {
        el.all.textContent = 'All of it';
        el.all.disabled = start === 0 && end === cut.full.duration;
        el.hint.textContent = `Drag the ends in. Grey is cut off. Keeping ${(end - start).toFixed(1)} of ${cut.full.duration.toFixed(1)} seconds.`;
      } else if (cut.view === 'fades') {
        el.nofade.disabled = !cut.fade;
        el.hint.textContent = cut.fade
          ? `Fades in over ${cut.fade.in.toFixed(2)} seconds and out over ${cut.fade.out.toFixed(2)}.`
          : 'Drag a handle in from an end: the sound fades in or out there.';
      } else {
        el.all.textContent = 'Select all';
        el.all.disabled = sameRange(cut.sel, cut.range);
        for (const b of el.edits.children) b.disabled = b.dataset.edit === 'keep' && sameRange(cut.sel, cut.range);
        el.hint.textContent = `Drag the handles around a part (${(cut.sel.end - cut.sel.start).toFixed(1)} seconds), then change just that part.`;
      }
    } else if (cut.mode === 'chop') {
      const n = cut.marks.length + 1;
      el.add.disabled = newMark(cut.marks, cut.source.duration) === null;
      el.remove.disabled = cut.picked < 0;
      el.make.disabled = n < 2;
      el.make.textContent = n < 2 ? '🧩 Make pads' : `🧩 Make ${n} pads`;
      el.hint.textContent = n < 2
        ? 'No gaps found. Tap ＋ Mark to cut it by hand.'
        : 'Each mark starts a new pad. Drag a mark, or tap the wave to hear a piece.';
    }
    renderHandles();
  }

  // Where the handles are, in seconds: the view's two for a trim, one per mark for a chop.
  function handleTimes() {
    if (cut.mode === 'chop') return cut.marks;
    if (cut.view === 'fades') return fadeAt();
    if (cut.view === 'part') return [cut.sel.start, cut.sel.end];
    return [cut.range.start, cut.range.end];
  }

  // The two fade handles: as far in from each end as that end fades.
  function fadeAt() {
    const { start, end } = cut.range;
    const len = end - start;
    return [ms(start + Math.min(cut.fade?.in ?? 0, len)), ms(end - Math.min(cut.fade?.out ?? 0, len))];
  }

  // The handles over the wave. They are kept and updated while their number
  // stays the same, so a handle being dragged (or moved by keys) keeps the
  // pointer and the focus.
  function renderHandles() {
    if (!cut.mode) { el.marks.replaceChildren(); return; }
    const at = handleTimes();
    const max = length();
    if (el.marks.children.length > at.length) el.marks.replaceChildren(...[...el.marks.children].slice(0, at.length));
    while (el.marks.children.length < at.length) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wave-handle';
      b.setAttribute('role', 'slider');
      b.setAttribute('aria-valuemin', '0');
      el.marks.append(b);
    }
    at.forEach((t, i) => {
      const b = el.marks.children[i];
      b.dataset.index = String(i);
      b.dataset.kind = cut.mode === 'trim' ? cut.view : 'mark';
      b.setAttribute('aria-label', cut.mode === 'trim' ? HANDLES[cut.view][i] : `Cut ${i + 1}`);
      b.setAttribute('aria-valuemax', String(max));
      b.setAttribute('aria-valuenow', String(t));
      b.setAttribute('aria-valuetext', `${t.toFixed(2)} seconds`);
      if (cut.mode === 'chop') b.setAttribute('aria-pressed', String(i === cut.picked));
      else b.removeAttribute('aria-pressed');
      // Placed as a share of the wave's width, so it stays put when the width changes.
      b.style.setProperty('--f', String(t / max));
    });
  }

  function shade() {
    const trim = cut.mode === 'trim';
    sheet.wave.pick(trim && cut.view === 'part' ? cut.sel : null);
    sheet.wave.shade(trim ? cut.range : null);
  }

  // Plays `from`..`to` seconds of what the wave shows, the line sweeping over it.
  function playPart(buffer, from, to) {
    const part = slice(buffer, from, to - from);
    audio.start('preview', { buffer: part, duration: part.duration });
    sheet.wave.follow('preview', from / buffer.duration, to / buffer.duration);
  }

  // ── Trim, fades and edits ──

  // The stored recording and the sheet's trim, edits and fade, as the trim
  // editor works on them; false if the recording would not open.
  async function loadTrim() {
    const { mode, clip, trim, edits, fade } = sheet.now();
    let full;
    try {
      full = mode === 'edit' ? await audio.decoded(clip) : cut.recorded;
    } catch (err) {
      console.error('Trim could not open the recording:', err);
      return false;
    }
    if (!full || !sheet.now().ready) return false;
    Object.assign(cut, { full, exact: !!clip?.exact, edits: cleanEdits(edits, full.duration), fade: cleanFade(fade) });
    cut.range = rangeOf(trim);
    fitSel();
    return true;
  }

  async function startTrim() {
    if (!(await loadTrim())) return;
    audio.stop('preview');
    cut.mode = 'trim';
    rebuild();
    render();
    el.done.focus({ preventScroll: true });
  }

  // What a trim keeps of the recording. No trim means the automatic one:
  // the quiet ends off (or all of it, for a beat made into a sound). The
  // quiet is found on the recording as stored, as audio.js does.
  function rangeOf(trim) {
    const full = cut.full;
    const auto = trimBounds(full);
    return cleanTrim(trim, full.duration)
      ?? (cut.exact ? null : cleanTrim({ start: auto.start, end: auto.start + auto.duration }, full.duration))
      ?? { start: 0, end: full.duration };
  }

  // The part Select part changes, kept inside what the trim keeps: the
  // middle third of it, until one is picked.
  function fitSel() {
    const { start, end } = cut.range;
    const s = cut.sel;
    if (s && s.start >= start && s.end <= end && s.end - s.start >= MIN_PIECE) return;
    const third = (end - start) / 3;
    cut.sel = third < MIN_PIECE ? { start, end } : { start: ms(start + third), end: ms(end - third) };
  }

  // The recording with the edits and fade as they are now: `kept` is what
  // the voices start from (exactly as audio.js keptAudio makes it), and the
  // wave draws all of it, the fade included.
  function rebuild() {
    const { start, end } = cut.range;
    const edited = applyEdits(slice(cut.full, 0, cut.full.duration), cut.edits);
    let kept = applyFade(slice(edited, start, end - start), cut.fade);
    if (hasGain(cut.edits)) kept = levelForGain(kept, slice(cut.full, start, end - start));
    cut.shown = applyFade(edited, cut.fade, start, end);
    sheet.wave.show(cut.shown);
    shade();
    return kept;
  }

  // The trim, edits and fade as the sheet has them now.
  const saved = () => {
    const { trim, edits, fade } = sheet.now();
    return { trim, edits, fade };
  };

  // New settings ({trim, edits, fade}; a null trim is the automatic one):
  // keep them, and hear what is kept, or (`around`) the part just changed.
  // Undo steps back through every change since the sheet opened.
  function applyCut(next, { remember = true, around = false } = {}) {
    if (remember) cut.undo.push(saved());
    const d = cut.full.duration;
    const clean = { trim: cleanTrim(next.trim, d), edits: cleanEdits(next.edits, d), fade: cleanFade(next.fade) };
    cut.range = rangeOf(clean.trim);
    cut.edits = clean.edits;
    cut.fade = clean.fade;
    fitSel();
    sheet.setCut(clean, rebuild());
    render();
    if (around) playPart(cut.shown, Math.max(cut.range.start, cut.sel.start - AROUND), Math.min(cut.range.end, cut.sel.end + AROUND));
    else playPart(cut.shown, cut.range.start, cut.range.end);
  }

  // Select part's buttons: change just the part picked.
  function editPart(kind) {
    const now = saved();
    const { start, end } = cut.sel;
    if (kind === 'keep') {
      cut.view = 'ends';
      applyCut({ ...now, trim: { start, end } });
      return;
    }
    const edit = kind === 'louder' ? { kind: 'gain', amount: GAIN_STEP }
      : kind === 'quieter' ? { kind: 'gain', amount: 1 / GAIN_STEP }
        : { kind };
    const edits = addEdit(now.edits, { ...edit, start, end });
    if (edits === undefined) {
      el.hint.textContent = 'That is as many changes as one sound holds. Undo one first.';
      return;
    }
    applyCut({ ...now, edits }, { around: true });
  }

  // 🔊 Even it out: one gain edit over the whole recording that makes the
  // sound, as the voices start from it, seem as loud as the presets. The
  // gain edit keeps the sound's own level (levelForGain) with its peaks
  // held under full scale (softLimit), so a quiet recording with one loud
  // clap comes up and the clap is squashed instead of clipping. Already
  // within about 1 dB, it says so and adds nothing. It sits on the sheet,
  // outside the trim editor, so the banner's ↩️ Undo takes it back.
  async function evenOut() {
    if (!cut.mode && !(await loadTrim())) return;
    const now = saved();
    const d = cut.full.duration;
    const { start, end } = cut.range;
    const kept = applyFade(slice(applyEdits(slice(cut.full, 0, d), cut.edits), start, end - start), cut.fade);
    const peak = peakOf(kept);
    if (!peak) { showNotice('🔊 There is no sound here to even out.'); return; }
    // How loud it seems now: scaled to its own peak, or (with Louder or
    // Quieter in it) to the recording's, under the soft ceiling.
    const gained = hasGain(cut.edits);
    const plain = gained ? 0 : loudness(kept, { scale: 0.9 / peak });
    const base = levelForGain(kept, slice(cut.full, start, end - start));
    const heard = gained ? loudness(base, { limit: true }) : plain;
    const already = () => showNotice('🔊 It is already even: as loud as the ready-made sounds.');
    if (Math.abs(heard - PRESET_LOUDNESS) < EVEN_ENOUGH) { already(); return; }
    const edits = addEdit(now.edits, { kind: 'gain', start: 0, end: d, amount: evenGain(base) });
    if (edits === undefined) {
      el.hint.textContent = 'That is as many changes as one sound holds. Undo one first.';
      return;
    }
    if (editsKey(edits) === editsKey(now.edits)) { already(); return; }
    if (cut.mode === 'trim') { applyCut({ ...now, edits }); return; }
    setQuietly({ ...now, edits });
    playPart(cut.shown, cut.range.start, cut.range.end);
    showBanner('🔊 Evened out: as loud as the ready-made sounds.', { action: { label: '↩️ Undo', fn: () => setQuietly(now) }, ms: EVEN_UNDO_MS });
  }
  const EVEN_UNDO_MS = 8000;
  // New settings kept with the trim editor shut (🔊 Even it out on the sheet).
  function setQuietly(next) {
    const d = cut.full.duration;
    const clean = { trim: cleanTrim(next.trim, d), edits: cleanEdits(next.edits, d), fade: cleanFade(next.fade) };
    cut.range = rangeOf(clean.trim);
    cut.edits = clean.edits;
    cut.fade = clean.fade;
    fitSel();
    sheet.setCut(clean, rebuild());
  }

  function setView(view) {
    if (!HANDLES[view] || cut.mode !== 'trim') return;
    cut.view = view;
    fitSel();
    shade();
    render();
  }

  // ── Chop ──

  async function startChop() {
    let voiced;
    try { voiced = await sheet.voiced(); } catch (err) { console.error('Chop could not render the sound:', err); return; }
    if (!sheet.now().ready) return;
    audio.stop('preview');
    const source = slice(voiced.buffer, 0, Math.min(voiced.duration, voiced.buffer.duration));
    Object.assign(cut, { mode: 'chop', source, marks: cleanMarks(onsets(source), source.duration), picked: -1 });
    sheet.wave.show(source);
    shade();
    render();
    logEvent('chop', { found: cut.marks.length, seconds: Number(source.duration.toFixed(2)) });
    el.make.focus({ preventScroll: true });
  }

  async function makePads() {
    const now = sheet.now();
    const parts = pieces(cut.marks, cut.source.duration);
    if (parts.length < 2) return;
    const p = currentPerson();
    const taken = clipsFor(p.id, { includeHidden: true }).map((c) => c.label);
    const made = [];
    for (const { start, end } of parts) {
      const label = chopName(now.name, taken);
      taken.push(label);
      const blob = encodeWav(slice(cut.source, start, end - start));
      const clip = {
        id: newId('user'),
        personId: p.id,
        label,
        emoji: now.emoji,
        color: nextClipColor(p.id),
        voice: 'normal',
        blob,
        mime: blob.type,
        created: Date.now() + made.length,   // keeps the pieces in order on the board
      };
      // A saved sound is remembered as where the piece came from.
      if (now.mode === 'edit') clip.from = { id: now.clip.id, how: 'chop' };
      state.userClips.push(clip);
      await persist('clips', clip);
      made.push(label);
    }
    logEvent('chop', { made: made.length });
    leave();
    sheet.showVoiced(false);
    renderPads();
    // Said in the sheet, which covers the board, and on the board for after.
    const said = `🧩 ${made.length} new pads from “${now.name}”: ${made.join(', ')}.`;
    showNotice(said);
    el.from.textContent = said;
    el.from.hidden = false;
  }

  // ── Handles: drag, keys, and taps on the wave ──

  // Where handle `i` may go: inside the sound, and MIN_PIECE clear of its
  // neighbors. Fade handles may meet, and may sit on the ends (no fade).
  function limits(i) {
    if (cut.mode === 'trim') {
      const { start, end } = cut.range;
      if (cut.view === 'fades') {
        const [a, b] = fadeAt();
        return i === 0 ? [start, Math.max(start, b)] : [Math.min(end, a), end];
      }
      if (cut.view === 'part') return i === 0 ? [start, cut.sel.end - MIN_PIECE] : [cut.sel.start + MIN_PIECE, end];
      return i === 0 ? [0, end - MIN_PIECE] : [start + MIN_PIECE, cut.full.duration];
    }
    const lo = i > 0 ? cut.marks[i - 1] : 0;
    const hi = i < cut.marks.length - 1 ? cut.marks[i + 1] : cut.source.duration;
    return [lo + MIN_PIECE, hi - MIN_PIECE];
  }

  function moveHandle(i, t) {
    const [lo, hi] = limits(i);
    const v = ms(Math.min(hi, Math.max(lo, t)));
    if (cut.mode === 'trim') {
      cut.moving = true;
      const { start, end } = cut.range;
      if (cut.view === 'fades') {
        const [a, b] = fadeAt();
        cut.fade = cleanFade({ in: (i === 0 ? v : a) - start, out: end - (i === 1 ? v : b) });
        rebuild();   // the wave shows the fade while it is dragged
      } else if (cut.view === 'part') {
        cut.sel = i === 0 ? { start: v, end: cut.sel.end } : { start: cut.sel.start, end: v };
        shade();
      } else {
        cut.range = i === 0 ? { start: v, end } : { start, end: v };
        shade();
      }
    } else {
      cut.marks[i] = v;
      cut.picked = i;
    }
    render();
  }

  // A handle let go: a trim or fade is kept (and can be undone), a picked
  // part plays, a chop mark plays its piece.
  function letGo(i) {
    if (cut.mode === 'trim') {
      if (!cut.moving) return;
      cut.moving = false;
      if (cut.view === 'part') playPart(cut.shown, cut.sel.start, cut.sel.end);
      else applyCut({ ...saved(), ...(cut.view === 'fades' ? { fade: cut.fade } : { trim: cut.range }) });
    } else if (cut.mode === 'chop') {
      const part = pieces(cut.marks, cut.source.duration)[i + 1];
      if (part) playPart(cut.source, part.start, part.end);
    }
  }

  // The time under a finger: the inverse of where renderHandles puts a handle.
  const timeAt = (clientX) => {
    const r = el.canvas.getBoundingClientRect();
    const f = (clientX - r.left - WAVE_PAD) / Math.max(1, r.width - 2 * WAVE_PAD);
    return Math.min(1, Math.max(0, f)) * length();
  };

  el.marks.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !cut.mode) return;
    const h = e.target.closest('.wave-handle');
    if (h) {
      e.preventDefault();
      try { h.setPointerCapture?.(e.pointerId); } catch { /* a pointer already gone */ }
      cut.drag = { index: Number(h.dataset.index), pointerId: e.pointerId };
      if (cut.mode === 'chop') { cut.picked = cut.drag.index; render(); }
      return;
    }
    // A tap on the wave plays the piece under it (chop), the part picked, or what is kept.
    const t = timeAt(e.clientX);
    if (cut.mode === 'trim') {
      const { start, end } = cut.view === 'part' ? cut.sel : cut.range;
      playPart(cut.shown, start, end);
    } else {
      const part = pieces(cut.marks, cut.source.duration).find((x) => t >= x.start && t <= x.end);
      if (part) playPart(cut.source, part.start, part.end);
    }
  });
  el.marks.addEventListener('pointermove', (e) => {
    if (!cut.drag || e.pointerId !== cut.drag.pointerId) return;
    moveHandle(cut.drag.index, timeAt(e.clientX));
    el.marks.querySelector(`[data-index="${cut.drag.index}"]`)?.focus?.({ preventScroll: true });
  });
  for (const type of ['pointerup', 'pointercancel']) {
    el.marks.addEventListener(type, (e) => {
      if (!cut.drag || e.pointerId !== cut.drag.pointerId) return;
      const { index } = cut.drag;
      cut.drag = null;
      letGo(index);
    });
  }
  el.marks.addEventListener('keydown', (e) => {
    const h = e.target.closest('.wave-handle');
    if (!h) return;
    const i = Number(h.dataset.index);
    const step = (e.shiftKey ? 10 : 1) * NUDGE;
    const at = handleTimes()[i];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') moveHandle(i, at - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') moveHandle(i, at + step);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && cut.mode === 'chop') { removeMark(i); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    el.marks.querySelector(`[data-index="${i}"]`)?.focus?.({ preventScroll: true });
  });
  el.marks.addEventListener('keyup', (e) => {
    const h = e.target.closest('.wave-handle');
    if (h && /^Arrow/.test(e.key)) letGo(Number(h.dataset.index));
  });
  el.marks.addEventListener('click', (e) => {
    // Enter or Space on a mark picks it, for ✕ Mark.
    const h = e.target.closest('.wave-handle');
    if (h && cut.mode === 'chop' && e.detail === 0) { cut.picked = Number(h.dataset.index); render(); }
  });

  function removeMark(i) {
    if (i < 0 || i >= cut.marks.length) return;
    cut.marks.splice(i, 1);
    cut.picked = -1;
    render();
  }

  // ── Buttons ──

  el.box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b === el.trimBtn) startTrim();
    else if (b === el.chopBtn) startChop();
    else if (b.dataset.view) setView(b.dataset.view);
    else if (b === el.even) evenOut();
    else if (b.dataset.edit) editPart(b.dataset.edit);
    else if (b === el.undo && cut.undo.length) applyCut(cut.undo.pop(), { remember: false });
    else if (b === el.all && cut.view === 'part') {
      cut.sel = { ...cut.range };
      shade();
      render();
      playPart(cut.shown, cut.sel.start, cut.sel.end);
    } else if (b === el.all) applyCut({ ...saved(), trim: { start: 0, end: cut.full.duration } });
    else if (b === el.nofade) applyCut({ ...saved(), fade: null });
    else if (b === el.done) { const trimmed = cut.mode === 'trim'; leave(); sheet.showVoiced(trimmed); }
    else if (b === el.add) {
      const t = newMark(cut.marks, cut.source.duration);
      if (t === null) return;
      cut.marks = cleanMarks([...cut.marks, t], cut.source.duration);
      cut.picked = cut.marks.indexOf(t);
      render();
      el.marks.querySelector(`[data-index="${cut.picked}"]`)?.focus?.({ preventScroll: true });
    } else if (b === el.remove) removeMark(cut.picked);
    else if (b === el.make) makePads();
  });
  onSetting('advancedBeats', () => {
    if (!shown() && cut.mode) leave();
    render();
  });

  // Leaves trim or chop; the wave is the sheet's again. A trim, edit or fade stays.
  function leave() {
    if (!cut.mode) return;
    cut.mode = null;
    cut.full = null;
    cut.shown = null;
    cut.source = null;
    cut.drag = null;
    cut.moving = false;
    sheet.wave.pick(null);
    sheet.wave.shade(null);
    render();
  }

  // A new sheet or a new sound: back to the ends, nothing picked, nothing to undo.
  function reset() {
    leave();
    cut.undo = [];
    cut.view = 'ends';
    cut.sel = null;
  }

  return {
    // The sheet opened (or its sound changed): back to the two buttons.
    open() {
      reset();
      cut.recorded = null;
      const { clip } = sheet.now();
      const from = clip?.from?.how === 'chop'
        ? clipsFor(currentPerson().id, { includeHidden: true, allPresets: true }).find((c) => c.id === clip.from.id)
        : null;
      el.from.hidden = !from;
      el.from.textContent = from ? `🧩 Chopped from “${from.label}”` : '';
      render();
    },
    // A new sound was recorded or chosen: `buffer` is all of it, untrimmed.
    recorded(buffer) {
      reset();
      cut.recorded = buffer;
      render();
    },
    ready: render,
    busy: () => !!cut.mode,
    leave,
    close() {
      leave();
      cut.recorded = null;
    },
  };
}
