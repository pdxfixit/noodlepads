// 🎹 The piano roll (Ben, 2026-10-12; ADR 0023): a tune row's own screen,
// opened from the row (its emoji or any of its pills) on Beats, ⌨️ Keys off
// and on. ✅ Done goes back to the beat.
//
// Note names run up the side (the C rows brighter), the beat's pills run
// across. A tap on an empty square places a note one pill long; dragging a
// note sideways makes it longer or shorter; a tap on a note takes it out,
// and ↩️ Undo puts it back. The scale lock (on to begin with) shows only the
// white keys, C major; ♯ All notes shows all twelve. Two octaves show at a
// time: ⌃ ⌄, or a swipe up or down, move an octave. A thin strip on top
// shows where the beat's other rows hit, and ▶ Play plays the whole beat
// with a playhead here too. With Advanced, ½ Half pills makes the squares
// half a pill, for faster notes.
//
// The note logic is notes.js; the sequencer stores, plays and previews
// (deps). This file only draws and listens.

import { openDialog, setupDialog } from './dialogs.js';
import { viewRows, homeView, moveView, addNote, removeNote, resizeNote, noteAt, noteLabel, isC, inScale, VIEW } from './notes.js';
import { pickerButton, pickerList } from './inst-picker.js';

const SWIPE_PX = 40;     // a vertical swipe this long moves an octave
const DRAG_PX = 8;       // a note moved this far sideways is being stretched, not tapped
const UNDO_STEPS = 30;   // changes ↩️ Undo can take back, per visit

// deps: beat() (the open beat), row(i), total() (its pills), groups() (a
// bar's beat groups), advanced(), commit(i, tune) (stores a tune row's notes,
// saves and redraws the rows behind), preview(i, p, pills) (hears a note
// while the beat is stopped), playing(), togglePlay(), openSound(i, returnTo)
// (the row's sound chooser), clipById(id), colorOf(clip), placed() (a note
// was placed: counted, play-count.js), instrument(i) (who plays the row:
// {group: {id, name}, inst}, or null for a sound no instrument plays) and
// swapInstrument(i, inst) (the same notes on another instrument, ADR 0030).
export function createRoll(dialog, deps) {
  const q = (name) => dialog.querySelector(`[data-roll="${name}"]`);
  const el = {
    title: q('title'), play: q('play'), sound: q('sound'), up: q('up'), down: q('down'), scale: q('scale'),
    half: q('half'), undo: q('undo'), status: q('status'), scroll: q('scroll'), grid: q('grid'), done: q('done'),
    inst: q('inst'), insts: q('insts'),
  };
  let instOpen = false;    // 🎹 the row's instrument list is open
  let at = -1;             // the row being edited
  let lo = 0;              // the lowest pitch in view
  let all = false;         // the scale lock off: all twelve notes
  let half = false;        // ½ Half pills (Advanced)
  let history = [];        // the tunes before each change, for ↩️ Undo
  let cursor = { p: 0, s: 0 };   // the square in the Tab order; arrow keys move it
  let playhead = null;

  const row = () => deps.row(at);
  const unit = () => (half && deps.advanced() ? 0.5 : 1);
  const isOpen = () => !!dialog.open;

  function open(i, { step = 0, returnTo } = {}) {
    const r = deps.row(i);
    if (!r?.melody) return;
    at = i;
    history = [];
    instOpen = false;
    lo = homeView(r.tune);
    // Opened from a pill: the cursor starts there, on the lowest note's row.
    cursor = { p: r.tune.find((n) => Math.floor(n.s) === step)?.p ?? lo, s: step };
    say('');
    render();
    openDialog(dialog, { focus: el.grid.querySelector('.note-cell.cursor') ?? el.done, returnTo });
  }

  function close() { if (isOpen()) dialog.close(); }

  // The row went (removed, another beat opened, its tune turned off): the roll closes.
  function refresh() {
    if (!isOpen()) return;
    if (!row()?.melody) { close(); return; }
    render();
  }

  function say(text) { el.status.textContent = text; }

  // ── Drawing ──

  function render() {
    const r = row();
    if (!r) return;
    const clip = deps.clipById(r.clipId);
    el.title.textContent = `🎹 ${clip?.emoji ?? '🔊'} ${clip?.label ?? 'Tune'}`;
    el.sound.textContent = `${clip?.emoji ?? '🔊'} Sound`;
    el.sound.setAttribute('aria-label', `Change the sound: ${clip?.label ?? 'none'}`);
    el.scale.setAttribute('aria-pressed', String(all));
    el.scale.setAttribute('aria-label', all ? 'All twelve notes show. Tap for only the white keys (C major)' : 'Only the white keys show (C major). Tap for all twelve notes');
    el.half.hidden = !deps.advanced();
    el.half.setAttribute('aria-pressed', String(unit() === 0.5));
    el.undo.disabled = !history.length;
    showPlay();
    showInstrument();
    drawGrid(r, clip);
  }

  // 🎹 Who plays the tune, on the top line beside 🔊 Sound, for a row on a
  // Notes, Chords or Bass preset: a tap opens the instruments under the
  // line; a pick plays every note of the tune on that one instead.
  function showInstrument() {
    if (!el.inst || !el.insts) return;
    const who = deps.instrument?.(at) ?? null;
    if (!who) instOpen = false;
    el.inst.hidden = !who;
    el.insts.hidden = !instOpen;
    if (!who) { el.inst.replaceChildren(); el.insts.replaceChildren(); return; }
    el.inst.replaceChildren(pickerButton(who.group, instOpen, {
      where: 'roll', inst: who.inst, title: 'Who plays this tune: pick an instrument, and every note stays',
    }));
    el.insts.replaceChildren(...(instOpen ? [pickerList(who.group, { where: 'roll', now: who.inst.id, label: 'Who plays this tune' })] : []));
  }

  function showPlay() {
    const on = deps.playing();
    el.play.textContent = on ? '■ Stop' : '▶ Play';
    el.play.setAttribute('aria-pressed', String(on));
  }

  // One CSS grid: the note names in the first column, then two columns a
  // pill (so a half-pill note lines up); the strip of other rows' hits on
  // the first line, then a line a note, highest on top.
  function drawGrid(r, clip) {
    const total = deps.total();
    const u = unit();
    const rows = viewRows(lo, { all, tune: r.tune });
    const grid = el.grid;
    grid.style.setProperty('--pills', String(total));
    grid.style.setProperty('--lines', String(rows.length));
    grid.classList.toggle('half', u === 0.5);
    grid.style.gridTemplateColumns = `var(--name-w) repeat(${total * 2}, minmax(var(--half-min), 1fr))`;
    grid.style.gridTemplateRows = `18px repeat(${rows.length}, var(--row-h))`;
    if (clip) grid.style.setProperty('--note', deps.colorOf(clip));
    const groups = deps.groups();
    const bar = groups.reduce((a, b) => a + b, 0);
    const beatStarts = new Set(groups.map((_, g) => groups.slice(0, g).reduce((a, b) => a + b, 0)));
    const cols = (s, l) => `${2 + s * 2} / span ${Math.max(1, l * 2)}`;
    const parts = [];

    // The strip: where the beat's other rows hit, a dot a pill, brighter for more.
    const corner = document.createElement('span');
    corner.className = 'roll-name roll-corner';
    corner.textContent = '🥁';
    corner.setAttribute('aria-hidden', 'true');
    parts.push(corner);
    const beat = deps.beat();
    for (let s = 0; s < total; s++) {
      const hits = beat.rows.filter((o, k) => k !== at && !o.muted && o.steps[s]);
      const dot = document.createElement('span');
      dot.className = 'roll-hit';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.gridRow = '1';
      dot.style.gridColumn = cols(s, 1);
      if (hits.length) {
        dot.classList.add('on');
        dot.style.setProperty('--n', String(Math.min(4, hits.length)));
        const first = deps.clipById(hits[0].clipId);
        if (first) dot.style.setProperty('--c', deps.colorOf(first));
      }
      parts.push(dot);
    }

    // Keep the cursor on a row and square that show.
    if (!rows.includes(cursor.p)) cursor.p = rows.reduce((a, p) => (Math.abs(p - cursor.p) < Math.abs(a - cursor.p) ? p : a), rows[0]);
    cursor.s = Math.min(total - u, Math.floor(cursor.s / u) * u);

    rows.forEach((p, line) => {
      const gridRow = String(line + 2);
      const name = document.createElement('span');
      name.className = `roll-name${isC(p) ? ' c' : ''}${inScale(p) ? '' : ' black'}`;
      name.textContent = noteLabel(p);
      name.style.gridRow = gridRow;
      name.setAttribute('aria-hidden', 'true');
      parts.push(name);
      for (let s = 0; s < total; s += u) {
        const c = document.createElement('button');
        c.type = 'button';
        const inBar = s % bar;
        c.className = `note-cell${inBar === 0 ? ' bar-start' : beatStarts.has(inBar) ? ' beat-start' : ''}${isC(p) ? ' c' : ''}${inScale(p) ? '' : ' black'}`;
        c.dataset.p = p;
        c.dataset.s = s;
        c.style.gridRow = gridRow;
        c.style.gridColumn = cols(s, u);
        const here = p === cursor.p && s === cursor.s;
        c.tabIndex = here ? 0 : -1;
        if (here) c.classList.add('cursor');
        c.setAttribute('aria-label', `${noteLabel(p)}, ${where(s, bar, groups)}: add a note`);
        parts.push(c);
      }
    });

    // The notes, over their squares. A note above or below the view is
    // counted on ⌃ or ⌄ instead.
    let above = 0, below = 0;
    r.tune.forEach((n, i) => {
      if (n.p > lo + VIEW) { above++; return; }
      if (n.p < lo) { below++; return; }
      const line = rows.indexOf(n.p);
      if (line < 0 || n.s >= total) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'roll-note';
      b.dataset.i = i;
      b.style.gridRow = String(line + 2);
      b.style.gridColumn = cols(n.s, Math.min(n.l, total - n.s));
      const end = document.createElement('span');
      end.className = 'roll-end';
      end.setAttribute('aria-hidden', 'true');
      b.append(end);
      const long = n.l === 1 ? '1 pill' : `${n.l} pills`;
      b.setAttribute('aria-label', `${noteLabel(n.p)}, ${where(n.s, bar, groups)}, ${long} long. Tap to take it out; Shift and the arrow keys make it longer or shorter`);
      parts.push(b);
    });
    el.up.textContent = above ? `⌃ ${above}` : '⌃';
    el.down.textContent = below ? `⌄ ${below}` : '⌄';
    el.up.setAttribute('aria-label', `Higher notes${above ? ` (${above} up there)` : ''}`);
    el.down.setAttribute('aria-label', `Lower notes${below ? ` (${below} down there)` : ''}`);
    el.up.disabled = moveView(lo, 1) === lo;
    el.down.disabled = moveView(lo, -1) === lo;

    playhead = document.createElement('div');
    playhead.className = 'roll-playhead';
    playhead.setAttribute('aria-hidden', 'true');
    playhead.hidden = true;
    parts.push(playhead);
    grid.replaceChildren(...parts);
  }

  // Where a square is, for a screen reader: "bar 2, beat 3" (and "and a half").
  function where(s, bar, groups) {
    const b = Math.floor(s / bar);
    let inBar = s - b * bar;
    let beatNo = 0;
    while (beatNo < groups.length - 1 && inBar >= groups[beatNo]) { inBar -= groups[beatNo]; beatNo++; }
    const part = Math.floor(inBar) + 1;
    return `${deps.total() > bar ? `bar ${b + 1}, ` : ''}beat ${beatNo + 1}, part ${part}${s % 1 ? ' and a half' : ''}`;
  }

  // The playhead: on the tune row's pill while the beat plays.
  function step(shown) {
    if (!isOpen() || !playhead) return;
    const s = shown?.[at] ?? -1;
    playhead.hidden = s < 0;
    if (s >= 0) playhead.style.gridColumn = `${2 + s * 2} / span 2`;
  }

  // ── Changing the notes ──

  function change(tune, text) {
    history = [...history, row().tune].slice(-UNDO_STEPS);
    deps.commit(at, tune);
    say(text);
    render();
  }

  function add(p, s) {
    const made = addNote(row().tune, p, s, unit());
    if (!made) return;
    change(made.tune, '');
    deps.placed?.();
    if (!deps.playing()) deps.preview(at, p, made.note.l);
    cursor = { p, s };
    el.grid.querySelector(`.roll-note[data-i="${row().tune.findIndex((n) => n.p === p && n.s === made.note.s)}"]`)?.focus();
  }

  function remove(i) {
    const n = row().tune[i];
    if (!n) return;
    cursor = { p: n.p, s: Math.floor(n.s / unit()) * unit() };
    change(removeNote(row().tune, i), `Took out ${noteLabel(n.p)}. ↩️ Undo puts it back.`);
    focusCursor();
  }

  function resize(i, end, { done = true } = {}) {
    const tune = resizeNote(row().tune, i, end, unit());
    if (tune === row().tune) return;
    if (done) change(tune, '');
    else { deps.commit(at, tune, { quiet: true }); render(); }
  }

  function undo() {
    if (!history.length) return;
    const before = history.at(-1);
    history = history.slice(0, -1);
    deps.commit(at, before);
    say('');
    render();
    el.undo.focus();
  }

  function focusCursor() {
    el.grid.querySelector('.note-cell.cursor')?.focus();
  }

  function shift(dir) {
    const next = moveView(lo, dir);
    if (next === lo) return;
    lo = next;
    cursor.p += 12 * Math.sign(dir);
    render();
  }

  // ── Taps, drags and swipes ──

  // A press on the grid: on a note, a sideways drag stretches it (its end
  // follows the finger); anywhere, an up or down swipe moves an octave. The
  // click that ends either is not a tap.
  let press = null;   // {x, y, i, l0, pill, moved, swiped}
  let swallow = false;
  function pillWidth() {
    const box = el.grid.getBoundingClientRect();
    const name = el.grid.querySelector('.roll-name')?.getBoundingClientRect();
    return box.width && name ? (box.width - name.width) / deps.total() : 0;
  }
  el.grid.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const note = e.target.closest('.roll-note');
    const n = note ? row()?.tune[Number(note.dataset.i)] : null;
    press = { x: e.clientX, y: e.clientY, i: n ? Number(note.dataset.i) : -1, l0: n?.l ?? 0, s0: n?.s ?? 0, pill: pillWidth(), moved: false, swiped: false };
    swallow = false;
    if (n) note.setPointerCapture?.(e.pointerId);
  });
  el.grid.addEventListener('pointermove', (e) => {
    if (!press) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.moved && !press.swiped && Math.abs(dy) > SWIPE_PX && Math.abs(dy) > 1.5 * Math.abs(dx)) {
      // The view follows the finger: a swipe up shows the lower notes, as a page scrolls.
      press.swiped = true;
      shift(dy < 0 ? -1 : 1);
      return;
    }
    if (press.i >= 0 && !press.swiped && press.pill > 0 && (press.moved || Math.abs(dx) > DRAG_PX)) {
      press.moved = true;
      resize(press.i, press.s0 + press.l0 + dx / press.pill, { done: false });
    }
  });
  function lift() {
    if (!press) return;
    if (press.moved) {
      // One Undo step for the whole stretch: what it was when the finger went down.
      const now = row()?.tune;
      if (now) {
        const before = now.map((n, k) => (k === press.i ? { ...n, l: press.l0 } : n));
        history = [...history, before].slice(-UNDO_STEPS);
        deps.commit(at, now);
        render();
      }
    }
    swallow = press.moved || press.swiped;
    press = null;
  }
  el.grid.addEventListener('pointerup', lift);
  el.grid.addEventListener('pointercancel', lift);
  // A phone's long-press menu would cover the roll.
  el.grid.addEventListener('contextmenu', (e) => e.preventDefault());

  el.grid.addEventListener('click', (e) => {
    if (swallow) { swallow = false; return; }
    const note = e.target.closest('.roll-note');
    if (note) { remove(Number(note.dataset.i)); return; }
    const c = e.target.closest('.note-cell');
    if (!c) return;
    const p = Number(c.dataset.p), s = Number(c.dataset.s);
    const there = noteAt(row().tune, p, s);
    if (there >= 0) remove(there); else add(p, s);
  });

  // Keys: arrows move between squares (one Tab stop for the grid); on a
  // note, Shift + → or ← makes it longer or shorter, Delete takes it out.
  el.grid.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const note = e.target.closest('.roll-note');
    if (note) {
      const i = Number(note.dataset.i);
      const n = row().tune[i];
      if (!n) return;
      if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        resize(i, n.s + n.l + (e.key === 'ArrowRight' ? unit() : -unit()));
        const again = row().tune.findIndex((o) => o.p === n.p && o.s === n.s);
        el.grid.querySelector(`.roll-note[data-i="${again}"]`)?.focus();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(i); return; }
    }
    const c = e.target.closest('.note-cell') ?? (note ? el.grid.querySelector('.note-cell.cursor') : null);
    const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[e.key];
    if (!c || !move || e.shiftKey) return;
    e.preventDefault();
    const rows = viewRows(lo, { all, tune: row().tune });
    const line = rows.indexOf(Number(c.dataset.p)) - move[0];
    if (line < 0 || line >= rows.length) { shift(move[0]); focusCursor(); return; }
    const s = Number(c.dataset.s) + move[1] * unit();
    if (s < 0 || s >= deps.total()) return;
    cursor = { p: rows[line], s };
    for (const x of el.grid.querySelectorAll('.note-cell.cursor')) { x.tabIndex = -1; x.classList.remove('cursor'); }
    const next = el.grid.querySelector(`.note-cell[data-p="${rows[line]}"][data-s="${s}"]`);
    if (next) { next.tabIndex = 0; next.classList.add('cursor'); next.focus(); }
  });

  el.up.addEventListener('click', () => shift(1));
  el.down.addEventListener('click', () => shift(-1));
  el.scale.addEventListener('click', () => { all = !all; render(); });
  el.half.addEventListener('click', () => { half = !half; render(); });
  el.undo.addEventListener('click', undo);
  el.play.addEventListener('click', () => { deps.togglePlay(); showPlay(); });
  el.sound.addEventListener('click', () => deps.openSound(at, () => el.sound));
  el.inst?.addEventListener('click', (e) => {
    if (!e.target.closest('[data-inst-pick]')) return;
    instOpen = !instOpen;
    showInstrument();
    el.inst.querySelector('[data-inst-pick]')?.focus();
  });
  el.insts?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-inst]');
    if (!b) return;
    instOpen = false;
    deps.swapInstrument?.(at, b.dataset.inst);
    render();
    const now = deps.instrument?.(at)?.inst;
    if (now) say(`${now.emoji} ${now.name} plays the tune now, every note where it was.`);
    el.inst.querySelector('[data-inst-pick]')?.focus();
  });
  // Esc in the open list closes it, not the roll.
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !instOpen || !e.target.closest?.('.inst-list, [data-inst-pick]')) return;
    e.preventDefault();
    e.stopPropagation();
    instOpen = false;
    showInstrument();
    el.inst.querySelector('[data-inst-pick]')?.focus();
  });
  el.done.addEventListener('click', close);
  setupDialog(dialog);

  return { open, close, refresh, step, showPlay, isOpen, row: () => (isOpen() ? at : -1) };
}
